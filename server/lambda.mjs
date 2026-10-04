import http from 'node:http';
import { isIP } from 'node:net';
import { createServer } from './index.mjs';

const HOP_HEADERS = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'content-length']);
const INPUT_HEADERS = new Set(['content-type', 'origin', 'sec-fetch-site']);
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;

function safeHeaders(headers = {}, allowed) {
  const normalized = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  const excluded = new Set([...HOP_HEADERS, ...String(normalized.connection || '').toLowerCase().split(',').map((value) => value.trim())]);
  return Object.fromEntries(Object.entries(normalized).filter(([key, value]) => !excluded.has(key) && (!allowed || allowed.has(key)) && typeof value === 'string' && !/[\r\n]/.test(value)));
}

function errorResponse(statusCode, message) {
  return { statusCode, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }, isBase64Encoded: false, body: JSON.stringify({ error: message }) };
}

// API Gateway v2 events reuse the same validated gateway as local development.
// Only an internal loopback listener is created; API Gateway is the public edge.
export function createLambdaHandler(options = {}) {
  const publicOrigin = options.publicOrigin ?? process.env.PUBLIC_ORIGIN;
  if (!publicOrigin) throw new Error('PUBLIC_ORIGIN is required for the hosted Lambda gateway.');
  const server = createServer({ ...options, publicOrigin, localOrigin: '', requestTimeoutMs: Math.min(options.requestTimeoutMs ?? 25000, 25000) });
  let listening;
  async function address() {
    if (!listening) listening = new Promise((resolve, reject) => {
      const failed = (error) => { listening = null; reject(error); };
      server.once('error', failed);
      server.listen(0, '127.0.0.1', () => {
        server.off('error', failed); server.unref();
        resolve(server.address());
      });
    });
    return listening;
  }

  const invoke = async (event, context = {}) => {
    context.callbackWaitsForEmptyEventLoop = false;
    if (event?.version !== '2.0' || typeof event.rawPath !== 'string' || typeof event.requestContext?.http?.method !== 'string') return errorResponse(400, 'An API Gateway HTTP API v2 request is required.');
    let pathname;
    try { pathname = new URL(event.rawPath, 'http://127.0.0.1').pathname; }
    catch { return errorResponse(400, 'Invalid API path.'); }
    if (!event.rawPath.startsWith('/api/') || !pathname.startsWith('/api/') || event.rawPath.includes('\\') || event.rawPath.includes('?') || event.rawPath.includes('#')) return errorResponse(404, 'Unknown API endpoint.');
    const method = event.requestContext.http.method.toUpperCase();
    if (!['GET', 'HEAD', 'POST', 'OPTIONS'].includes(method)) return errorResponse(405, 'Method not allowed.');
    if (event.body != null && typeof event.body !== 'string') return errorResponse(400, 'Invalid request body.');
    if ((event.body?.length ?? 0) > 1400000) return errorResponse(413, 'Request is too large.');
    if (event.isBase64Encoded && event.body && !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(event.body)) return errorResponse(400, 'Invalid request body encoding.');
    const payload = Buffer.from(event.body || '', event.isBase64Encoded ? 'base64' : 'utf8');
    if (payload.length > 970000) return errorResponse(413, 'Request is too large.');
    const headers = safeHeaders(event.headers, INPUT_HEADERS);
    // sourceIp is supplied by API Gateway, never trust caller-supplied XFF.
    const sourceIp = event.requestContext.http.sourceIp;
    if (!isIP(sourceIp || '')) return errorResponse(400, 'Invalid request context.');
    headers['x-forwarded-for'] = sourceIp;
    headers['content-length'] = String(payload.length);
    const remaining = typeof context.getRemainingTimeInMillis === 'function' ? context.getRemainingTimeInMillis() : 30000;
    const budget = Math.max(1, Math.min(27000, remaining - 1000));
    try {
      const { port } = await address();
      return await new Promise((resolve, reject) => {
        let size = 0; const chunks = []; let timedOut = false;
        const request = http.request({ hostname: '127.0.0.1', port, path: pathname, method, headers, agent: false }, (response) => {
          response.on('data', (chunk) => {
            size += chunk.length;
            if (size > MAX_RESPONSE_BYTES) request.destroy(new Error('Response exceeds the gateway limit.'));
            else chunks.push(chunk);
          });
          response.once('error', reject);
          response.once('end', () => {
            const buffer = Buffer.concat(chunks);
            const outgoing = safeHeaders(response.headers);
            const binary = !(outgoing['content-type'] || '').match(/^(?:text\/|application\/(?:json|[a-z0-9.+-]*\+json))/i);
            resolve({ statusCode: response.statusCode, headers: outgoing, isBase64Encoded: binary, body: buffer.toString(binary ? 'base64' : 'utf8') });
          });
        });
        const timer = setTimeout(() => { timedOut = true; request.destroy(); }, budget);
        request.once('error', (error) => timedOut ? resolve(errorResponse(504, 'Request timed out. Please try again.')) : reject(error));
        request.once('close', () => clearTimeout(timer));
        request.end(payload);
      });
    } catch { return errorResponse(502, 'The API could not complete this request. Please try again.'); }
  };
  invoke.close = () => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
  return invoke;
}

let warmHandler;
export async function handler(event, context) {
  warmHandler ??= createLambdaHandler();
  return warmHandler(event, context);
}
