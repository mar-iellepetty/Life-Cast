import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { chat, extractHousehold, extractEvents, explainAssessment, explainDiff, bedrockConfigured, REGION, MODEL_ID } from "./bedrock.mjs";
import { synthesize, synthesizeWithVisemes, POLLY_VOICE } from "./voice.mjs";
import { CALCXML_MODE, calculateWithCalcXml } from "./calcxml.mjs";
import { synthesizeSpeech, transcribeWav, localVoiceStatus } from "./local-voice.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon", ".glb": "model/gltf-binary", ".woff": "font/woff", ".woff2": "font/woff2", ".mp4": "video/mp4", ".mp3": "audio/mpeg", ".wav": "audio/wav" };
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }

function send(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(data), "Cache-Control": "no-store" });
  res.end(data);
}
async function bytes(req, limit) {
  if (Number(req.headers["content-length"]) > limit) throw new HttpError(413, "Request is too large.");
  let length = 0; const parts = [];
  for await (const chunk of req) { length += chunk.length; if (length > limit) throw new HttpError(413, "Request is too large."); parts.push(chunk); }
  return Buffer.concat(parts);
}
async function body(req) {
  if (!(req.headers["content-type"] || "").toLowerCase().startsWith("application/json")) throw new HttpError(415, "Send application/json.");
  let data;
  try { data = JSON.parse((await bytes(req, 96000)).toString("utf8")); } catch (error) { if (error instanceof HttpError) throw error; throw new HttpError(400, "Invalid JSON request."); }
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
function validateCalculation(data) {
  const household = profile(data.household ?? data);
  for (const name of ["spouseAge", "spouseRetAge", "desiredIncome", "term", "beforeTaxReturn", "inflation", "funeral", "finalExpenses", "otherDebts", "collegeNeeds"]) {
    if (data[name] != null && (typeof data[name] !== "number" || !Number.isFinite(data[name]) || data[name] < 0 || data[name] > 1e10)) throw new HttpError(400, `Invalid calculator option: ${name}.`);
  }
  return { ...data, household };
}
async function localJson(fetchImpl, origin, route, options, timeout = 35000) {
  let response;
  try { response = await fetchImpl(`${origin}${route}`, { ...options, signal: AbortSignal.timeout(timeout) }); }
  catch { throw new HttpError(503, "Local voice service is unavailable. Start Lincoln's local voice service, or type your question."); }
  if (!response.ok) {
    if (response.status === 422) throw new HttpError(422, "No clear speech was recognized. Please try again.");
    if (response.status === 400) throw new HttpError(400, "Use a short mono PCM16 WAV recording at 16,000 Hz.");
    throw new HttpError(503, "The local voice service could not complete this request.");
  }
  return response.json();
}

export function createServer(options = {}) {
  const services = { chat, extractHousehold, extractEvents, explainAssessment, explainDiff, bedrockConfigured, calculateWithCalcXml, synthesize, synthesizeWithVisemes, synthesizeSpeech, transcribeWav, localVoiceStatus, ...options.services };
  const fetchImpl = options.fetch || fetch;
  const localOrigin = options.localOrigin ?? process.env.LINCOLN_LOCAL_ORIGIN ?? "";
  if (localOrigin) {
    const url = new URL(localOrigin);
    if (url.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(url.hostname) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("LINCOLN_LOCAL_ORIGIN must be a loopback HTTP origin.");
  }
  async function local(route, request = {}, timeout = 35000) {
    if (localOrigin) return localJson(fetchImpl, localOrigin.replace(/\/$/, ""), route, request, timeout);
    try {
      if (route === "/api/status") return services.localVoiceStatus();
      if (route === "/api/speech") return await services.synthesizeSpeech(JSON.parse(request.body).text);
      if (route === "/api/transcribe") return await services.transcribeWav(request.body);
    } catch (error) {
      if (error.status === 422) throw new HttpError(422, "No clear speech was recognized. Please try again.");
      if (error.status === 400) throw new HttpError(400, "Use 0.15 to 30 seconds of mono PCM16 WAV at 16,000 Hz.");
      if (error.status === 504) throw new HttpError(504, "Local speech processing timed out. Please try a shorter recording.");
      throw new HttpError(503, "Local speech is unavailable. The written conversation still works.");
    }
  }
  const dist = options.dist || path.resolve(HERE, "..", "dist");
  const verification = { bedrock: { state: "unverified", checkedAt: null }, polly: { state: "unverified", checkedAt: null }, calculator: { state: "unverified", checkedAt: null } };
  let credentials = { checkedAt: 0, configured: false }; let active = 0;
  async function observed(name, action) {
    try { const result = await action(); verification[name] = { state: "ready", checkedAt: new Date().toISOString() }; return result; }
    catch (error) { verification[name] = { state: "unavailable", checkedAt: new Date().toISOString() }; throw error; }
  }
  async function status() {
    if (Date.now() - credentials.checkedAt > 15000) {
      const configured = await Promise.race([services.bedrockConfigured(), new Promise((resolve) => { const timer = setTimeout(() => resolve(false), 2000); timer.unref?.(); })]).catch(() => false);
      credentials = { configured: Boolean(configured), checkedAt: Date.now() };
    }
    let localStatus = {};
    try { localStatus = await local("/api/status", {}, 1200); } catch { /* Report local services as unavailable when the optional probe fails. */ }
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
    res.writeHead(200, { "Content-Type": type, "Content-Length": info.size, "Cache-Control": path.extname(file) === ".html" ? "no-cache" : "public, max-age=3600" });
    if (req.method === "HEAD") return res.end();
    createReadStream(file).pipe(res);
  }
  return http.createServer(async (req, res) => {
    let counted = false;
    try {
      res.setHeader("X-Content-Type-Options", "nosniff");
      const port = req.socket.localPort;
      if (!new Set([`localhost:${port}`, `127.0.0.1:${port}`]).has(req.headers.host)) throw new HttpError(403, "This service accepts localhost requests only.");
      const origins = new Set(["http://localhost:5175", "http://127.0.0.1:5175", `http://localhost:${port}`, `http://127.0.0.1:${port}`]);
      if (req.headers.origin && !origins.has(req.headers.origin)) throw new HttpError(403, "This origin is not allowed.");
      if (req.headers["sec-fetch-site"] === "cross-site") throw new HttpError(403, "Cross-site requests are not allowed.");
      if (req.headers.origin) { res.setHeader("Access-Control-Allow-Origin", req.headers.origin); res.setHeader("Vary", "Origin"); }
      if (req.method === "OPTIONS") { res.writeHead(204, { "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" }); return res.end(); }
      const pathname = new URL(req.url, `http://${req.headers.host}`).pathname;
      if (req.method === "GET" && pathname === "/api/status") return send(res, 200, await status());
      if (pathname.startsWith("/api/") && active >= 6) throw new HttpError(429, "The guide is busy. Please try again shortly.");
      if (pathname.startsWith("/api/")) { active++; counted = true; }
      if (req.method === "GET" && pathname === "/api/health") {
        await observed("calculator", () => services.calculateWithCalcXml({ household: { person: { age: 35, income: 1 }, spouse: null, children: [], debts: { mortgage: 0, other: 0 }, resources: { savings: 0, existingCoverage: 0 } } }));
        const current = await status();
        return send(res, 200, { ...current, ok: true, provider: "amazon-bedrock", calculator: { ...current.calculator, reachable: true } });
      }
      if (req.method === "POST" && pathname === "/api/avatar/transcribe") {
        if (!(req.headers["content-type"] || "").startsWith("audio/wav")) throw new HttpError(415, "Send audio/wav.");
        const audio = await bytes(req, 970000);
        if (audio.length < 44 || audio.toString("ascii", 0, 4) !== "RIFF" || audio.toString("ascii", 8, 12) !== "WAVE") throw new HttpError(400, "Send a valid WAV recording.");
        const result = await local("/api/transcribe", { method: "POST", headers: { "Content-Type": "audio/wav" }, body: audio });
        return send(res, 200, { text: text(result.text, "Transcript", 6000) });
      }
      if (req.method === "POST" && pathname.startsWith("/api/")) {
        const data = await body(req);
        if (pathname === "/api/calculate") return send(res, 200, await observed("calculator", () => services.calculateWithCalcXml(validateCalculation(data))));
        if (pathname === "/api/chat" || pathname === "/api/guide") {
          if (data.provider && data.provider !== "bedrock") throw new HttpError(400, "This avatar is connected to Amazon Bedrock. The local language model is not used.");
          const messages = history(data.history);
          if (pathname === "/api/guide") { const question = text(data.question, "Question"); if (messages.at(-1)?.role !== "user" || messages.at(-1).text !== question) messages.push({ role: "user", text: question }); }
          if (data.assessment != null && (typeof data.assessment !== "object" || Array.isArray(data.assessment))) throw new HttpError(400, "Assessment must contain the calculator's structured result.");
          const calculatorInput = data.calculatorOptions ?? data.calculatorInput;
          const calculatorOptions = calculatorInput ? validateCalculation(calculatorInput) : {};
          const result = await observed("bedrock", () => services.chat(messages, profile(data.profile), text(data.context, "Context", 20000, true), { assessment: data.assessment, calculatorOptions }));
          const events = pathname === "/api/guide" && data.extractEvents === true ? await observed("bedrock", () => services.extractEvents(data.question)) : [];
          return send(res, 200, pathname === "/api/chat" ? result : { ...result, answer: result.reply, events, provider: "bedrock" });
        }
        if (pathname === "/api/intake") return send(res, 200, { household: await observed("bedrock", () => services.extractHousehold(text(data.text))) });
        if (pathname === "/api/events") return send(res, 200, { events: await observed("bedrock", () => services.extractEvents(text(data.text))) });
        if (pathname === "/api/explain") {
          if (data.kind === "diff" ? !data.diff : !data.assessment) throw new HttpError(400, "Provide the calculator assessment or difference to explain.");
          const result = await observed("bedrock", () => data.kind === "diff" ? services.explainDiff(data.diff) : services.explainAssessment(data.assessment));
          return send(res, 200, { text: result });
        }
        if (pathname === "/api/speak") {
          const audio = await observed("polly", () => services.synthesize(text(data.text, "Speech", 2800)));
          res.writeHead(200, { "Content-Type": "audio/mpeg", "Content-Length": audio.length, "Cache-Control": "no-store" }); return res.end(audio);
        }
        if (pathname === "/api/avatar/speech") {
          const utterance = text(data.text, "Speech", 2800);
          try { return send(res, 200, await observed("polly", () => services.synthesizeWithVisemes(utterance))); }
          catch {
            const localResult = await local("/api/speech", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: utterance }) });
            if (typeof localResult.audioBase64 !== "string" || !Array.isArray(localResult.visemes)) throw new HttpError(503, "Speech is unavailable. The written answer is still available.");
            return send(res, 200, { ...localResult, provider: "local-sapi", visemeSystem: "sapi", fallback: true, fallbackReason: "Amazon Polly is unavailable; using local Windows speech." });
          }
        }
      }
      if (pathname.startsWith("/api/")) throw new HttpError(404, "Unknown API endpoint.");
      if (["GET", "HEAD"].includes(req.method)) return await staticFile(req, res, pathname);
      throw new HttpError(405, "Method not allowed.");
    } catch (error) {
      if (res.headersSent) return res.destroy();
      // Provider diagnostics can contain secrets or prompts; return safe errors.
      const message = error instanceof HttpError ? error.message : "A required service could not complete the request. Check AWS access and the calculator connection, then try again.";
      return send(res, error instanceof HttpError ? error.status : 502, { error: message });
    } finally { if (counted) active--; }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 8790);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("PORT must be between 1024 and 65535.");
  const server = createServer();
  server.listen(port, "127.0.0.1", () => console.log(`LifeCast Bedrock gateway: http://127.0.0.1:${port}\nModel: ${MODEL_ID}; region: ${REGION}; voice: ${POLLY_VOICE}`));
}
