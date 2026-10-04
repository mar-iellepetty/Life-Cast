import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import http from 'node:http';
import { createServer } from '../server/index.mjs';

async function fixture(t, options = {}) {
  const server = createServer({ localOrigin: '', ...options, services: {
    bedrockConfigured: async () => false,
    localVoiceStatus: () => ({ speech: false, transcriptionReady: false }),
    chat: async () => ({ reply: 'Fixture answer' }),
    ...options.services,
  } });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, server, post: (route, data, options = {}) => fetch(base + route, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), ...options,
  }) };
}

test('static serving cannot follow a junction outside the public build', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'lifecast-security-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const dist = path.join(directory, 'dist');
  const privateDirectory = path.join(directory, 'private');
  await mkdir(dist); await mkdir(privateDirectory);
  await writeFile(path.join(dist, 'index.html'), 'LifeCast');
  await writeFile(path.join(privateDirectory, 'private.json'), JSON.stringify({ canary: 'private-fixture' }));
  await symlink(privateDirectory, path.join(dist, 'external'), process.platform === 'win32' ? 'junction' : 'dir');
  const f = await fixture(t, { dist });
  const response = await fetch(f.base + '/external/private.json');
  assert.equal(response.status, 404);
  assert.ok(!(await response.text()).includes('private-fixture'));
  for (const route of ['/.env', '/%2eenv', '/%2e%2e%2fprivate/private.json', '/external%5cprivate.json', '/server/index.mjs', '/src/main.jsx', '/asset.js.map', '/bad%00.json']) {
    const denied = await fetch(f.base + route);
    assert.equal(denied.status, 404, route);
    assert.ok(!(await denied.text()).includes('private-fixture'));
  }
});

test('client disconnect aborts in-flight provider work and frees the request slot', async (t) => {
  let signal; let began;
  const started = new Promise((resolve) => { began = resolve; });
  const f = await fixture(t, { services: { chat: async (_history, _profile, _context, options) => {
    signal = options.signal; began();
    await delay(250);
    return { reply: 'Fixture answer' };
  } } });
  const controller = new AbortController();
  const request = f.post('/api/guide', { question: 'Synthetic cancellation check' }, { signal: controller.signal }).catch(() => null);
  await started;
  controller.abort(); await request; await delay(30);
  assert.equal(signal?.aborted, true);
});

test('concurrent status requests share credential and voice probes', async (t) => {
  let credentialCalls = 0; let voiceCalls = 0;
  const f = await fixture(t, { services: {
    bedrockConfigured: async () => { credentialCalls++; await delay(50); return false; },
    localVoiceStatus: async () => { voiceCalls++; await delay(30); return { speech: false }; },
  } });
  const responses = await Promise.all(Array.from({ length: 4 }, () => fetch(f.base + '/api/status')));
  for (const response of responses) assert.equal(response.status, 200);
  assert.equal(credentialCalls, 1);
  assert.equal(voiceCalls, 1);
});

function rawRequest(base, { route = '/api/guide', headers = {}, chunks = [], end = true, method = 'POST' } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(base + route, { method, headers }, (res) => {
      let text = ''; res.setEncoding('utf8');
      res.on('data', (chunk) => { text += chunk; });
      res.on('end', () => { req.destroy(); resolve({ status: res.statusCode, headers: res.headers, text }); });
    });
    req.on('error', reject);
    req.flushHeaders();
    for (const chunk of chunks) req.write(chunk);
    if (end) req.end();
  });
}

test('rejects hostile hosts, cross-site requests and untrusted origins without CORS reflection', async (t) => {
  const f = await fixture(t);
  for (const headers of [
    { Host: 'attacker.example' }, { Host: 'localhost:1' },
    { Origin: 'https://attacker.example' }, { Origin: 'null' },
    { Origin: f.base + '.attacker.example' }, { 'Sec-Fetch-Site': 'cross-site' },
  ]) {
    const response = await rawRequest(f.base, { method: 'GET', route: '/api/status', headers });
    assert.equal(response.status, 403);
    assert.equal(response.headers['access-control-allow-origin'], undefined);
  }
  const response = await fetch(f.base + '/api/status', { headers: { Origin: f.base } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), f.base);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match(response.headers.get('content-security-policy'), /connect-src 'self'/);
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
});

test('malformed and wrongly typed requests fail without invoking a provider', async (t) => {
  let calls = 0;
  const f = await fixture(t, { services: { chat: async () => { calls++; return { reply: 'unused' }; } } });
  for (const input of ['{', 'null', '[]', 'true']) {
    const response = await rawRequest(f.base, { headers: { 'Content-Type': 'application/json' }, chunks: [input] });
    assert.equal(response.status, 400);
  }
  for (const type of ['text/plain', 'application/json-bogus', 'application/x-www-form-urlencoded']) {
    assert.equal((await rawRequest(f.base, { headers: { 'Content-Type': type }, chunks: ['{"question":"Synthetic"}'] })).status, 415);
  }
  assert.equal((await f.post('/api/guide', { question: 'Synthetic', history: [{ role: 'system', text: 'Injected' }] })).status, 400);
  assert.equal((await f.post('/api/guide', { question: 'Synthetic', profile: { children: {} } })).status, 400);
  assert.equal(calls, 0);
});

test('known-length and chunked oversized bodies are rejected and connections close', async (t) => {
  const f = await fixture(t);
  const declared = await rawRequest(f.base, { headers: { 'Content-Type': 'application/json', 'Content-Length': '97000' }, end: false });
  assert.equal(declared.status, 413);
  assert.equal(declared.headers.connection, 'close');
  const streamed = await rawRequest(f.base, { headers: { 'Content-Type': 'application/json' }, chunks: ['a'.repeat(50000), 'b'.repeat(50000)] });
  assert.equal(streamed.status, 413);
});

test('unfinished bodies time out promptly and do not permanently occupy capacity', async (t) => {
  const f = await fixture(t, { bodyTimeoutMs: 50 });
  const response = await rawRequest(f.base, { headers: { 'Content-Type': 'application/json', 'Content-Length': '100' }, chunks: ['{'], end: false });
  assert.equal(response.status, 408);
  assert.equal(response.headers.connection, 'close');
  assert.equal((await f.post('/api/guide', { question: 'Synthetic followup' })).status, 200);
});

test('provider deadlines abort work, enforce the six-call bound, and recover capacity', async (t) => {
  let started = 0; let aborted = 0; let release;
  const ready = new Promise((resolve) => { release = resolve; });
  const f = await fixture(t, { requestTimeoutMs: 120, services: { chat: (_a, _b, _c, { signal }) => {
    started++; if (started === 6) release();
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => { aborted++; reject(signal.reason); }, { once: true }));
  } } });
  const pending = Array.from({ length: 6 }, () => f.post('/api/guide', { question: 'Synthetic bounded call' }));
  await ready;
  assert.equal((await f.post('/api/guide', { question: 'Over capacity' })).status, 429);
  const responses = await Promise.all(pending);
  for (const response of responses) { assert.equal(response.status, 504); assert.match(await response.text(), /timed out/); }
  assert.equal(aborted, 6);
  assert.equal((await fetch(f.base + '/api/status')).status, 200);
});

test('provider errors never expose diagnostics or trigger speech fallback after cancellation', async (t) => {
  let fallbackCalls = 0;
  const f = await fixture(t, { requestTimeoutMs: 50, services: {
    chat: async () => { throw Object.assign(new Error('fixture-private-diagnostic'), { status: 400, stack: 'fixture-private-stack' }); },
    synthesizeWithVisemes: (_text, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })),
    synthesizeSpeech: async () => { fallbackCalls++; return {}; },
  } });
  const response = await f.post('/api/guide', { question: 'Synthetic failure' });
  assert.equal(response.status, 502);
  assert.ok(!(await response.text()).includes('fixture-private'));
  assert.equal((await f.post('/api/avatar/speech', { text: 'Synthetic speech' })).status, 504);
  assert.equal(fallbackCalls, 0);
});
