import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { createLambdaHandler } from '../server/lambda.mjs';

const origin = 'https://main.fixture.amplifyapp.com';
function event(overrides = {}) {
  return {
    version: '2.0', rawPath: '/api/guide', rawQueryString: '',
    headers: { origin, 'content-type': 'application/json', host: 'gateway.execute-api.us-east-2.amazonaws.com' },
    requestContext: { http: { method: 'POST', sourceIp: '192.0.2.1' } },
    body: JSON.stringify({ question: 'Synthetic question' }), isBase64Encoded: false,
    ...overrides,
  };
}
function fixture(t, options = {}) {
  const invoke = createLambdaHandler({ publicOrigin: origin, ...options, services: {
    bedrockConfigured: async () => true,
    chat: async () => ({ reply: 'Synthetic answer' }),
    ...options.services,
  } });
  t.after(() => invoke.close());
  return invoke;
}

test('Lambda adapter requires hosted configuration and safely handles v2 events on a reused gateway', async (t) => {
  assert.throws(() => createLambdaHandler({ publicOrigin: '' }), /PUBLIC_ORIGIN is required/);
  let credentialCalls = 0;
  const invoke = fixture(t, { services: { bedrockConfigured: async () => { credentialCalls++; return true; } } });
  const context = { callbackWaitsForEmptyEventLoop: true, getRemainingTimeInMillis: () => 30000 };
  const first = await invoke(event(), context);
  assert.equal(first.statusCode, 200); assert.equal(JSON.parse(first.body).answer, 'Synthetic answer');
  assert.equal(first.isBase64Encoded, false); assert.equal(context.callbackWaitsForEmptyEventLoop, false);
  assert.equal(first.headers['cache-control'], 'no-store');
  assert.match(first.headers['content-security-policy'], /connect-src 'self'/);
  const statusEvent = event({ rawPath: '/api/status', body: undefined, requestContext: { http: { method: 'GET', sourceIp: '192.0.2.1' } } });
  assert.equal((await invoke(statusEvent)).statusCode, 200);
  assert.equal((await invoke(statusEvent)).statusCode, 200);
  assert.equal(credentialCalls, 1);
});

test('Lambda adapter never serves static, traversal, absolute, or malformed event paths', async (t) => {
  const invoke = fixture(t);
  for (const rawPath of ['/', '/.env', '/server/index.mjs', '/api/../.env', 'http://attacker.example/api/guide', '//attacker.example/api/guide', '/api\\guide', '/api/guide?x=1', '/api/guide#part']) {
    assert.equal((await invoke(event({ rawPath }))).statusCode, 404, rawPath);
  }
  assert.equal((await invoke({ version: '1.0' })).statusCode, 400);
  assert.equal((await invoke(event({ requestContext: { http: { method: 'DELETE', sourceIp: '192.0.2.1' } } }))).statusCode, 405);
  assert.equal((await invoke(event({ requestContext: { http: { method: 'POST', sourceIp: 'spoofed' } } }))).statusCode, 400);
});

test('Lambda adapter preserves the real Origin gate and strips caller hop-by-hop framing headers', async (t) => {
  const invoke = fixture(t);
  const valid = event();
  const good = await invoke(event({ headers: { ...valid.headers, 'content-length': '999999', 'transfer-encoding': 'chunked', connection: 'keep-alive, x-private', 'x-private': 'fixture-secret', authorization: 'fixture-secret' } }));
  assert.equal(good.statusCode, 200);
  assert.equal(good.headers.connection, undefined); assert.equal(good.headers['content-length'], undefined);
  assert.ok(!JSON.stringify(good).includes('fixture-secret'));
  assert.equal((await invoke(event({ headers: { ...valid.headers, origin: 'https://attacker.example' } }))).statusCode, 403);
  assert.equal((await invoke(event({ headers: { 'content-type': 'application/json' } }))).statusCode, 403);
  assert.equal((await invoke(event({ headers: { ...valid.headers, 'sec-fetch-site': 'cross-site' } }))).statusCode, 403);
});

test('API Gateway sourceIp controls the client rate bucket, never a supplied X-Forwarded-For', async (t) => {
  const invoke = fixture(t, { rateLimit: { perClient: 2, global: 10 } });
  const base = event();
  for (const ip of ['203.0.113.1', '203.0.113.2']) assert.equal((await invoke(event({ headers: { ...base.headers, 'x-forwarded-for': ip } }))).statusCode, 200);
  assert.equal((await invoke(event({ headers: { ...base.headers, 'x-forwarded-for': '203.0.113.3' } }))).statusCode, 429);
  assert.equal((await invoke(event({ requestContext: { http: { method: 'POST', sourceIp: '192.0.2.2' } } }))).statusCode, 200);
});

test('Lambda adapter accepts encoded JSON and returns binary audio as API Gateway base64', async (t) => {
  const audio = Buffer.from([0, 1, 127, 255]);
  const invoke = fixture(t, { services: { synthesize: async () => audio } });
  const normal = event();
  assert.equal((await invoke(event({ body: Buffer.from(normal.body).toString('base64'), isBase64Encoded: true }))).statusCode, 200);
  const speech = await invoke(event({ rawPath: '/api/speak', body: JSON.stringify({ text: 'Synthetic speech' }) }));
  assert.equal(speech.statusCode, 200); assert.equal(speech.isBase64Encoded, true);
  assert.equal(speech.headers['content-type'], 'audio/mpeg');
  assert.deepEqual(Buffer.from(speech.body, 'base64'), audio);
});

test('Lambda adapter rejects oversized or malformed bodies before invoking providers', async (t) => {
  let calls = 0;
  const invoke = fixture(t, { services: { chat: async () => { calls++; return {}; } } });
  assert.equal((await invoke(event({ body: 'a'.repeat(1400001) }))).statusCode, 413);
  assert.equal((await invoke(event({ body: { question: 'Invalid' } }))).statusCode, 400);
  assert.equal((await invoke(event({ body: 'not-base64!', isBase64Encoded: true }))).statusCode, 400);
  assert.equal((await invoke(event({ body: 'a'.repeat(97000) }))).statusCode, 413);
  assert.equal((await invoke(event({ body: '{' }))).statusCode, 400);
  assert.equal(calls, 0);
});

test('Lambda gateway deadline aborts providers before the HTTP API integration limit', async (t) => {
  let signal;
  const invoke = fixture(t, { requestTimeoutMs: 30, services: { chat: (_a, _b, _c, options) => {
    signal = options.signal;
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  } } });
  const response = await invoke(event());
  assert.equal(response.statusCode, 504); assert.equal(signal.aborted, true);
});

test('Lambda remaining runtime cancels internal requests and returns a safe timeout', async (t) => {
  let signal;
  const invoke = fixture(t, { services: { chat: (_a, _b, _c, options) => {
    signal = options.signal;
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  } } });
  const response = await invoke(event(), { getRemainingTimeInMillis: () => 1050 });
  assert.equal(response.statusCode, 504);
  await delay(15);
  assert.equal(signal.aborted, true);
});
