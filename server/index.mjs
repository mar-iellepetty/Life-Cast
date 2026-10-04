import http from "node:http";
import { isIP } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stat, realpath } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { chat, extractHousehold, extractEvents, explainAssessment, explainDiff, bedrockConfigured, REGION, MODEL_ID } from "./bedrock.mjs";
import { synthesize, synthesizeWithVisemes, POLLY_VOICE } from "./voice.mjs";
import { analyzeEvent, analyzeHealth, analyzeLocation } from "./insights.mjs";
import { CALCXML_MODE, calculateWithCalcXml } from "./calcxml.mjs";
import { synthesizeSpeech, transcribeWav, localVoiceStatus } from "./local-voice.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon", ".glb": "model/gltf-binary", ".woff": "font/woff", ".woff2": "font/woff2", ".mp4": "video/mp4", ".mp3": "audio/mpeg", ".wav": "audio/wav" };
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
MIME[".txt"] = "text/plain; charset=utf-8";
const CONTENT_SECURITY_POLICY = "default-src 'self'; script-src 'self'; connect-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; media-src 'self' blob:; worker-src 'self' blob:; frame-ancestors 'none'; frame-src 'none'; base-uri 'self'; object-src 'none'; form-action 'self'";
const contentType = (req) => (req.headers["content-type"] || "").split(";", 1)[0].trim().toLowerCase();

function send(res, status, body) {
  if (res.destroyed || res.writableEnded) return;
  const data = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(data), "Cache-Control": "no-store" });
  res.end(data);
}
function abortable(action, signal) {
  if (!signal) return Promise.resolve().then(action);
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const aborted = () => reject(signal.reason);
    signal.addEventListener("abort", aborted, { once: true });
    Promise.resolve().then(action).then(resolve, reject).finally(() => signal.removeEventListener("abort", aborted));
  });
}
async function bytes(req, limit, signal, timeout = 10000) {
  if (Number(req.headers["content-length"]) > limit) throw new HttpError(413, "Request is too large.");
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    let length = 0; const parts = [];
    const cleanup = () => {
      clearTimeout(timer); req.off("data", data); req.off("end", end); req.off("error", error); req.off("aborted", disconnected);
      signal?.removeEventListener("abort", aborted);
    };
    const error = (err) => { cleanup(); req.pause(); reject(err); };
    const disconnected = () => error(new HttpError(400, "Request was interrupted."));
    const aborted = () => error(signal.reason);
    const data = (chunk) => { length += chunk.length; if (length > limit) error(new HttpError(413, "Request is too large.")); else parts.push(chunk); };
    const end = () => { cleanup(); resolve(Buffer.concat(parts)); };
    const timer = setTimeout(() => error(new HttpError(408, "Request body timed out.")), timeout);
    timer.unref?.();
    req.on("data", data); req.once("end", end); req.once("error", error); req.once("aborted", disconnected);
    signal?.addEventListener("abort", aborted, { once: true });
  });
}
async function body(req, signal, timeout) {
  if (contentType(req) !== "application/json") throw new HttpError(415, "Send application/json.");
  let data;
  try { data = JSON.parse((await bytes(req, 96000, signal, timeout)).toString("utf8")); } catch (error) { if (error instanceof HttpError) throw error; signal?.throwIfAborted(); throw new HttpError(400, "Invalid JSON request."); }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new HttpError(400, "Send a JSON object.");
  return data;
}
function text(value, name = "text", max = 6000, optional = false) {
  if (optional && (value === undefined || value === null || value === "")) return "";
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new HttpError(400, `${name} must contain 1 to ${max.toLocaleString("en-US")} characters.`);
  return value.trim();
}
function history(value = []) {
  if (!Array.isArray(value) || value.length > 48) throw new HttpError(400, "History must contain at most 48 messages.");
  return value.map((m) => {
    if (!m || !["user", "assistant"].includes(m.role)) throw new HttpError(400, "Only user and assistant history roles are allowed.");
    return { role: m.role, text: text(m.text, "Message", 6000) };
  });
}
function profile(value) {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)) throw new HttpError(400, "Profile must be a household object.");
  if (value.children && (!Array.isArray(value.children) || value.children.length > 20)) throw new HttpError(400, "The household can contain at most 20 dependents.");
  const checks = [value.person?.age, value.person?.income, value.spouse?.income, value.debts?.mortgage, value.debts?.other, value.resources?.savings, value.resources?.existingCoverage, ...(value.children || []).map((c) => c?.age)];
  if (checks.some((v) => v != null && (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1e10))) throw new HttpError(400, "Household amounts and ages must be finite non-negative numbers.");
  return value;
}
function amount(value, name, min = 0, max = 1e10, optional = true) {
  if (optional && (value === undefined || value === null)) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new HttpError(400, `${name} must be a number from ${min} to ${max}.`);
  return value;
}
function validateEventInsight(data) {
  return { text: text(data.text, "Event", 300), age: amount(data.age, "Event age", 0, 100, false), currentAge: amount(data.currentAge, "Current age", 18, 100, false),
    location: text(data.location, "Location", 120, true), annualIncome: amount(data.annualIncome, "Income"), mortgage: amount(data.mortgage, "Mortgage"),
    savings: amount(data.savings, "Savings"), children: amount(data.children, "Children", 0, 20), needAtAge: amount(data.needAtAge, "Need") };
}
function validateHealthInsight(data) {
  const m = data.metrics;
  if (!m || typeof m !== "object" || Array.isArray(m)) throw new HttpError(400, "Provide a health metrics summary.");
  const metrics = { days: amount(m.days, "Days", 1, 3650, false), avgDailySteps: amount(m.avgDailySteps, "Steps", 0, 100000), restingHeartRate: amount(m.restingHeartRate, "Resting heart rate", 20, 250),
    sleepHours: amount(m.sleepHours, "Sleep", 0, 24), exerciseMinutes: amount(m.exerciseMinutes, "Exercise", 0, 1440), bmi: amount(m.bmi, "BMI", 8, 100) };
  if (Object.entries(metrics).every(([k, v]) => k === "days" || v === undefined)) throw new HttpError(400, "The health summary contains no metrics.");
  return metrics;
}
function validateLocationInsight(data) {
  const lat = amount(data.lat, "Latitude", -90, 90); const lon = amount(data.lon, "Longitude", -180, 180);
  if (lat !== undefined && lon !== undefined) return { lat, lon };
  return { query: text(data.query, "Location", 120) };
}
function validateCalculation(data) {
  const household = profile(data.household ?? data);
  for (const name of ["spouseAge", "spouseRetAge", "desiredIncome", "term", "beforeTaxReturn", "inflation", "funeral", "finalExpenses", "otherDebts", "collegeNeeds"]) {
    if (data[name] != null && (typeof data[name] !== "number" || !Number.isFinite(data[name]) || data[name] < 0 || data[name] > 1e10)) throw new HttpError(400, `Invalid calculator option: ${name}.`);
  }
  return { ...data, household };
}
async function localJson(fetchImpl, origin, route, options, timeout = 35000, signal) {
  let response;
  try { response = await fetchImpl(`${origin}${route}`, { ...options, redirect: "error", signal: AbortSignal.any([AbortSignal.timeout(timeout), ...(signal ? [signal] : [])]) }); }
  catch { signal?.throwIfAborted(); throw new HttpError(503, "Local voice service is unavailable. Start Lincoln's local voice service, or type your question."); }
  if (!response.ok) {
    if (response.status === 422) throw new HttpError(422, "No clear speech was recognized. Please try again.");
    if (response.status === 400) throw new HttpError(400, "Use a short mono PCM16 WAV recording at 16,000 Hz.");
    throw new HttpError(503, "The local voice service could not complete this request.");
  }
  return response.json();
}

export function createServer(options = {}) {
  const configuredOrigin = options.publicOrigin ?? process.env.PUBLIC_ORIGIN ?? "";
  let publicOrigin;
  if (configuredOrigin) {
    try {
      publicOrigin = new URL(configuredOrigin);
      if (publicOrigin.protocol !== "https:" || publicOrigin.username || publicOrigin.password || publicOrigin.pathname !== "/" || publicOrigin.search || publicOrigin.hash) throw new Error();
    } catch { throw new Error("PUBLIC_ORIGIN must be one HTTPS origin without credentials, path, query, or fragment."); }
  }
  // These per-instance limits bound public demo usage. They are not user
  // authentication or a distributed account-wide spending limit.
  const rateWindow = options.rateLimit?.windowMs ?? 60000;
  const perClientLimit = options.rateLimit?.perClient ?? 24;
  const globalLimit = options.rateLimit?.global ?? 120;
  const clientRates = new Map();
  let globalRate = { count: 0, expires: 0 };
  function rateLimit(req, res, pathname) {
    if (!publicOrigin || pathname === "/api/status") return;
    const now = Date.now();
    if (now >= globalRate.expires) { globalRate = { count: 0, expires: now + rateWindow }; clientRates.clear(); }
    // Managed proxies append their client address. Never use forwarded headers
    // for authorization; the global bound still applies if a header is spoofed.
    const forwarded = String(req.headers["x-forwarded-for"] || "").split(",").at(-1).trim();
    const client = isIP(forwarded) ? forwarded : req.socket.remoteAddress;
    const count = clientRates.get(client) ?? 0;
    if (globalRate.count >= globalLimit || count >= perClientLimit || (!clientRates.has(client) && clientRates.size >= 1024)) {
      res.setHeader("Retry-After", String(Math.max(1, Math.ceil((globalRate.expires - now) / 1000))));
      throw new HttpError(429, "The public demo request limit was reached. Please wait a minute and try again.");
    }
    globalRate.count++; clientRates.set(client, count + 1);
  }
  const services = { chat, extractHousehold, extractEvents, explainAssessment, explainDiff, bedrockConfigured, analyzeEvent, analyzeHealth, analyzeLocation, calculateWithCalcXml, synthesize, synthesizeWithVisemes, synthesizeSpeech, transcribeWav, localVoiceStatus, ...options.services };
  const fetchImpl = options.fetch || fetch;
  const localOrigin = options.localOrigin ?? process.env.LINCOLN_LOCAL_ORIGIN ?? "";
  if (localOrigin) {
    const url = new URL(localOrigin);
    if (url.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(url.hostname) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("LINCOLN_LOCAL_ORIGIN must be a loopback HTTP origin.");
  }
  async function local(route, request = {}, timeout = 35000, signal) {
    signal?.throwIfAborted();
    if (publicOrigin) {
      if (route === "/api/status") return { speech: false, transcriptionReady: false };
      throw new HttpError(503, "Local speech is unavailable on the hosted app. The written conversation still works.");
    }
    if (localOrigin) return localJson(fetchImpl, localOrigin.replace(/\/$/, ""), route, request, timeout, signal);
    try {
      if (route === "/api/status") return services.localVoiceStatus();
      if (route === "/api/speech") return await services.synthesizeSpeech(JSON.parse(request.body).text, undefined, { signal });
      if (route === "/api/transcribe") return await services.transcribeWav(request.body, undefined, { signal });
    } catch (error) {
      signal?.throwIfAborted();
      if (error.status === 422) throw new HttpError(422, "No clear speech was recognized. Please try again.");
      if (error.status === 400) throw new HttpError(400, "Use 0.15 to 30 seconds of mono PCM16 WAV at 16,000 Hz.");
      if (error.status === 504) throw new HttpError(504, "Local speech processing timed out. Please try a shorter recording.");
      throw new HttpError(503, "Local speech is unavailable. The written conversation still works.");
    }
  }
  const dist = options.dist || path.resolve(HERE, "..", "dist");
  const verification = { bedrock: { state: "unverified", checkedAt: null }, polly: { state: "unverified", checkedAt: null }, calculator: { state: "unverified", checkedAt: null } };
  let credentials = { checkedAt: 0, configured: false }; let active = 0; let statusProbe; let localStatus = {};
  async function observed(name, action, signal) {
    try { const result = await abortable(action, signal); verification[name] = { state: "ready", checkedAt: new Date().toISOString() }; return result; }
    catch (error) { verification[name] = { state: "unavailable", checkedAt: new Date().toISOString() }; throw error; }
  }
  async function status() {
    if (Date.now() - credentials.checkedAt > 15000) {
      if (!statusProbe) statusProbe = (async () => {
        const probeSignal = AbortSignal.timeout(2000);
        const [configured, voice] = await Promise.all([
          abortable(() => services.bedrockConfigured(), probeSignal).catch(() => false),
          abortable(() => local("/api/status", {}, 1200, probeSignal), probeSignal).catch(() => ({})),
        ]);
        credentials = { configured: Boolean(configured), checkedAt: Date.now() };
        localStatus = voice;
      })().finally(() => { statusProbe = null; });
      await statusProbe;
    }
    return { provider: "bedrock", model: MODEL_ID, region: REGION, voice: POLLY_VOICE, bedrockConfigured: credentials.configured, localReady: Boolean(localStatus.speech), transcriptionReady: Boolean(localStatus.transcriptionReady), speech: credentials.configured || Boolean(localStatus.speech), realtime: false,
      calculator: { provider: "calcxml-ins01", credentialMode: CALCXML_MODE, ...verification.calculator },
      services: { bedrock: { configured: credentials.configured, model: MODEL_ID, ...verification.bedrock }, polly: { configured: credentials.configured, voice: POLLY_VOICE, ...verification.polly }, localSpeech: { ready: Boolean(localStatus.speech), voice: localStatus.voice || null }, transcription: { ready: Boolean(localStatus.transcriptionReady), provider: "local-whisper" } } };
  }
  async function staticFile(req, res, pathname) {
    let decoded;
    try { decoded = decodeURIComponent(pathname); } catch { throw new HttpError(400, "Invalid URL."); }
    if (decoded.includes("\\") || decoded.includes("\0") || decoded.split("/").some((p) => p.startsWith("."))) throw new HttpError(404, "Not found.");
    let file = path.resolve(dist, `.${decoded}`);
    if (!file.startsWith(path.resolve(dist) + path.sep) && file !== path.resolve(dist)) throw new HttpError(404, "Not found.");
    let info = await stat(file).catch(() => null);
    if (!info?.isFile()) {
      if (path.extname(decoded)) throw new HttpError(404, "Not found.");
      file = path.join(dist, "index.html"); info = await stat(file).catch(() => null);
    }
    const type = MIME[path.extname(file).toLowerCase()];
    if (!info?.isFile() || !type) throw new HttpError(404, "Not found. Start the development site on port 5175 or build it first.");
    const [root, resolved] = await Promise.all([realpath(dist), realpath(file)]);
    const relative = path.relative(root, resolved);
    if (relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) throw new HttpError(404, "Not found.");
    res.writeHead(200, { "Content-Type": type, "Content-Length": info.size, "Cache-Control": path.extname(file) === ".html" ? "no-cache" : "public, max-age=3600" });
    if (req.method === "HEAD") return res.end();
    const stream = createReadStream(resolved);
    const close = () => stream.destroy();
    res.once("close", close);
    stream.once("error", () => res.destroy());
    stream.once("close", () => res.off("close", close));
    stream.pipe(res);
  }
  const server = http.createServer({ headersTimeout: 10000, requestTimeout: 15000, connectionsCheckingInterval: 1000 }, async (req, res) => {
    let counted = false; let timer;
    const controller = new AbortController(); const { signal } = controller;
    const disconnected = () => { if (!res.writableFinished) controller.abort(new HttpError(499, "Request was interrupted.")); };
    res.once("close", disconnected); req.once("aborted", disconnected);
    try {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Referrer-Policy", "no-referrer");
      res.setHeader("X-Frame-Options", "DENY");
      res.setHeader("Content-Security-Policy", CONTENT_SECURITY_POLICY);
      if (publicOrigin) res.setHeader("Strict-Transport-Security", "max-age=31536000");
      const port = req.socket.localPort;
      const hosts = new Set([`localhost:${port}`, `127.0.0.1:${port}`, ...(publicOrigin ? [publicOrigin.host] : [])]);
      if (!hosts.has(req.headers.host)) throw new HttpError(403, "This host is not allowed.");
      const origins = publicOrigin ? new Set([publicOrigin.origin]) : new Set(["http://localhost:5175", "http://127.0.0.1:5175", `http://localhost:${port}`, `http://127.0.0.1:${port}`]);
      if (req.headers.origin && !origins.has(req.headers.origin)) throw new HttpError(403, "This origin is not allowed.");
      if (req.headers["sec-fetch-site"] === "cross-site") throw new HttpError(403, "Cross-site requests are not allowed.");
      if (publicOrigin && req.method === "POST" && req.headers.origin !== publicOrigin.origin) throw new HttpError(403, "A same-origin request is required.");
      if (req.headers.origin) { res.setHeader("Access-Control-Allow-Origin", req.headers.origin); res.setHeader("Vary", "Origin"); }
      if (req.method === "OPTIONS") { res.writeHead(204, { "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" }); return res.end(); }
      const pathname = new URL(req.url, `http://${req.headers.host}`).pathname;
      if (pathname.startsWith("/api/")) rateLimit(req, res, pathname);
      if (pathname.startsWith("/api/") && active >= 6) throw new HttpError(429, "The guide is busy. Please try again shortly.");
      if (pathname.startsWith("/api/")) {
        active++; counted = true;
        timer = setTimeout(() => controller.abort(new HttpError(504, "Request timed out. Please try again.")), options.requestTimeoutMs ?? 75000);
        timer.unref?.();
      }
      const observe = (name, action) => observed(name, action, signal);
      if (req.method === "GET" && pathname === "/api/status") return send(res, 200, await abortable(status, signal));
      if (req.method === "GET" && pathname === "/api/health") {
        await observe("calculator", () => services.calculateWithCalcXml({ household: { person: { age: 35, income: 1 }, spouse: null, children: [], debts: { mortgage: 0, other: 0 }, resources: { savings: 0, existingCoverage: 0 } } }, { signal }));
        const current = await status();
        return send(res, 200, { ...current, ok: true, provider: "amazon-bedrock", calculator: { ...current.calculator, reachable: true } });
      }
      if (req.method === "POST" && pathname === "/api/avatar/transcribe") {
        if (publicOrigin) throw new HttpError(503, "Speech input is available in the local app. Type your question on the hosted app.");
        if (contentType(req) !== "audio/wav") throw new HttpError(415, "Send audio/wav.");
        const audio = await bytes(req, 970000, signal, options.bodyTimeoutMs);
        if (audio.length < 44 || audio.toString("ascii", 0, 4) !== "RIFF" || audio.toString("ascii", 8, 12) !== "WAVE") throw new HttpError(400, "Send a valid WAV recording.");
        const result = await abortable(() => local("/api/transcribe", { method: "POST", headers: { "Content-Type": "audio/wav" }, body: audio }, 35000, signal), signal);
        return send(res, 200, { text: text(result.text, "Transcript", 6000) });
      }
      if (req.method === "POST" && pathname.startsWith("/api/")) {
        const data = await body(req, signal, options.bodyTimeoutMs);
        if (pathname === "/api/calculate") return send(res, 200, await observe("calculator", () => services.calculateWithCalcXml(validateCalculation(data), { signal })));
        if (pathname === "/api/chat" || pathname === "/api/guide") {
          if (data.provider && data.provider !== "bedrock") throw new HttpError(400, "This guide is connected to Amazon Bedrock. The local language model is not used.");
          const messages = history(data.history);
          if (pathname === "/api/guide") { const question = text(data.question, "Question"); if (messages.at(-1)?.role !== "user" || messages.at(-1).text !== question) messages.push({ role: "user", text: question }); }
          if (data.assessment != null && (typeof data.assessment !== "object" || Array.isArray(data.assessment))) throw new HttpError(400, "Assessment must contain the calculator's structured result.");
          const calculatorInput = data.calculatorOptions ?? data.calculatorInput;
          const calculatorOptions = calculatorInput ? validateCalculation(calculatorInput) : {};
          const result = await observe("bedrock", () => services.chat(messages, profile(data.profile), text(data.context, "Context", 20000, true), { assessment: data.assessment, calculatorOptions, signal }));
          const events = pathname === "/api/guide" && data.extractEvents === true ? await observe("bedrock", () => services.extractEvents(data.question, { signal })) : [];
          return send(res, 200, pathname === "/api/chat" ? result : { ...result, answer: result.reply, events, provider: "bedrock" });
        }
        if (pathname === "/api/insights/event") return send(res, 200, await observe("bedrock", () => services.analyzeEvent(validateEventInsight(data), { signal })));
        if (pathname === "/api/insights/health") return send(res, 200, await observe("bedrock", () => services.analyzeHealth(validateHealthInsight(data), { signal })));
        if (pathname === "/api/insights/location") return send(res, 200, await observe("bedrock", () => services.analyzeLocation(validateLocationInsight(data), { signal, fetch: fetchImpl })));
        if (pathname === "/api/intake") return send(res, 200, { household: await observe("bedrock", () => services.extractHousehold(text(data.text), { signal })) });
        if (pathname === "/api/events") return send(res, 200, { events: await observe("bedrock", () => services.extractEvents(text(data.text), { signal })) });
        if (pathname === "/api/explain") {
          if (data.kind === "diff" ? !data.diff : !data.assessment) throw new HttpError(400, "Provide the calculator assessment or difference to explain.");
          const result = await observe("bedrock", () => data.kind === "diff" ? services.explainDiff(data.diff, { signal }) : services.explainAssessment(data.assessment, { signal }));
          return send(res, 200, { text: result });
        }
        if (pathname === "/api/speak") {
          const audio = await observe("polly", () => services.synthesize(text(data.text, "Speech", 2800), { signal }));
          res.writeHead(200, { "Content-Type": "audio/mpeg", "Content-Length": audio.length, "Cache-Control": "no-store" }); return res.end(audio);
        }
        if (pathname === "/api/avatar/speech") {
          const utterance = text(data.text, "Speech", 2800);
          try { return send(res, 200, await observe("polly", () => services.synthesizeWithVisemes(utterance, { signal }))); }
          catch {
            signal.throwIfAborted();
            const localResult = await abortable(() => local("/api/speech", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: utterance }) }, 65000, signal), signal);
            if (typeof localResult.audioBase64 !== "string" || !Array.isArray(localResult.visemes)) throw new HttpError(503, "Speech is unavailable. The written answer is still available.");
            return send(res, 200, { ...localResult, provider: "local-sapi", visemeSystem: "sapi", fallback: true, fallbackReason: "Amazon Polly is unavailable; using local Windows speech." });
          }
        }
      }
      if (pathname.startsWith("/api/")) throw new HttpError(404, "Unknown API endpoint.");
      if (["GET", "HEAD"].includes(req.method)) return await staticFile(req, res, pathname);
      throw new HttpError(405, "Method not allowed.");
    } catch (error) {
      if (res.destroyed) return;
      if (res.headersSent) return res.destroy();
      if (!req.complete) res.setHeader("Connection", "close");
      // Provider diagnostics can contain secrets or prompts; return safe errors.
      const message = error instanceof HttpError ? error.message : "A required service could not complete the request. Check AWS access and the calculator connection, then try again.";
      return send(res, error instanceof HttpError ? error.status : 502, { error: message });
    } finally {
      clearTimeout(timer); res.off("close", disconnected); req.off("aborted", disconnected);
      if (counted) active--;
    }
  });
  server.maxConnections = 64;
  server.maxRequestsPerSocket = 100;
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 8790);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("PORT must be between 1024 and 65535.");
  const server = createServer();
  server.listen(port, "127.0.0.1", () => console.log(`LifeCast Bedrock gateway: http://127.0.0.1:${port}\nModel: ${MODEL_ID}; region: ${REGION}; voice: ${POLLY_VOICE}`));
}
