import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import { createServer } from '../server/index.mjs';

const origin = 'https://main.fixture.amplifyapp.com';
async function fixture(t, options = {}) {
  const server = createServer({ publicOrigin: origin, ...options, services: {
    bedrockConfigured: async () => true,
    localVoiceStatus: () => ({ speech: true, transcriptionReady: true }),
    chat: async () => ({ reply: 'Synthetic answer' }),
    ...options.services,
  } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (route = '/api/guide', { method = 'POST', headers = {}, body = { question: 'Synthetic' } } = {}) => new Promise((resolve, reject) => {
    const req = http.request(base + route, { method, headers: { Host: new URL(origin).host, Origin: origin, 'Content-Type': 'application/json', ...headers } }, (res) => {
      let text = ''; res.setEncoding('utf8'); res.on('data', (chunk) => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(text) }));
    });
    req.on('error', reject); req.end(method === 'POST' ? JSON.stringify(body) : undefined);
  });
  return { base, request };
}

test('hosted mode requires a single explicit HTTPS origin and preserves local default isolation', async (t) => {
  for (const publicOrigin of ['http://example.com', 'https://user:password@example.com', 'https://example.com/path', 'https://example.com/?token=x', 'https://example.com/#part', 'bad origin']) {
    assert.throws(() => createServer({ publicOrigin }), /PUBLIC_ORIGIN/);
  }
  const f = await fixture(t, { publicOrigin: '' });
  assert.equal((await f.request()).status, 403);
  assert.equal((await fetch(f.base + '/api/status')).status, 200);
});

test('hosted requests accept only their configured origin and reject forwarded-host spoofing', async (t) => {
  const f = await fixture(t);
  const response = await f.request();
  assert.equal(response.status, 200); assert.equal(response.body.answer, 'Synthetic answer');
  assert.equal(response.headers['access-control-allow-origin'], origin);
  assert.equal(response.headers['strict-transport-security'], 'max-age=31536000');
  for (const headers of [
    { Origin: 'https://attacker.example' }, { Origin: 'null' }, { Origin: '' },
    { Origin: 'http://localhost:5175' }, { 'Sec-Fetch-Site': 'cross-site' },
    { Host: 'attacker.example', 'X-Forwarded-Host': new URL(origin).host },
    { Host: 'other.amplifyapp.com' },
  ]) assert.equal((await f.request('/api/guide', { headers })).status, 403);
  assert.equal((await fetch(f.base + '/api/guide', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"question":"Synthetic"}' })).status, 403);
});

test('hosted mode disables local speech input, local probing and Windows fallback', async (t) => {
  let localCalls = 0;
  const f = await fixture(t, { services: {
    localVoiceStatus: () => { localCalls++; return { speech: true, transcriptionReady: true }; },
    synthesizeWithVisemes: async () => { throw new Error('Fixture Polly unavailable'); },
    synthesizeSpeech: async () => { localCalls++; return {}; },
    transcribeWav: async () => { localCalls++; return {}; },
  } });
  const status = await f.request('/api/status', { method: 'GET' });
  assert.equal(status.body.localReady, false); assert.equal(status.body.transcriptionReady, false);
  assert.equal((await f.request('/api/avatar/transcribe')).status, 503);
  assert.equal((await f.request('/api/avatar/speech', { body: { text: 'Synthetic' } })).status, 503);
  assert.equal(localCalls, 0);
});

test('hosted rate limits bound individual clients and total usage even with spoofed addresses', async (t) => {
  let calls = 0; let clock = Date.now();
  t.mock.method(Date, 'now', () => clock);
  const f = await fixture(t, { rateLimit: { windowMs: 60000, perClient: 2, global: 3 }, services: { chat: async () => { calls++; return { reply: 'Synthetic' }; } } });
  const headers = { 'X-Forwarded-For': '192.0.2.1' };
  assert.equal((await f.request('/api/guide', { headers })).status, 200);
  assert.equal((await f.request('/api/guide', { headers })).status, 200);
  const limited = await f.request('/api/guide', { headers });
  assert.equal(limited.status, 429); assert.equal(limited.headers['retry-after'], '60');
  assert.equal((await f.request('/api/guide', { headers: { 'X-Forwarded-For': '192.0.2.2' } })).status, 200);
  assert.equal((await f.request('/api/guide', { headers: { 'X-Forwarded-For': '192.0.2.3' } })).status, 429);
  assert.equal(calls, 3);
  assert.equal((await f.request('/api/status', { method: 'GET' })).status, 200);
  clock += 60001;
  assert.equal((await f.request('/api/guide', { headers })).status, 200);
});
