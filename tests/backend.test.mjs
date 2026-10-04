import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { createServer } from "../server/index.mjs";
import { createVoiceService } from "../server/voice.mjs";
import { runTool } from "../server/tools.mjs";
import { chat, extractEvents } from "../server/bedrock.mjs";
import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";

const modelResult = { reply: "The calculator reports $674,000.", household: null, assessment: null, toolCalls: [] };
const household = { person: { age: 31, income: 105000 }, spouse: { income: 0 }, children: [{ name: "Child", age: 4 }], debts: { mortgage: 340000, other: 18000 }, resources: { savings: 30000, existingCoverage: 150000 } };
const pollySpeech = { audioBase64: "bXAz", mimeType: "audio/mpeg", voice: "Matthew", provider: "amazon-polly", visemeSystem: "polly", visemes: [{ time: 0, id: "sil" }, { time: 0.12, id: "p" }] };
async function fixture(t, options = {}) {
  const services = { bedrockConfigured: async () => true, chat: async () => modelResult, calculateWithCalcXml: async () => ({ provider: "calcxml-ins01", household, assessment: { coverageGap: 674000 } }), ...options.services };
  const server = createServer({ localOrigin: "http://127.0.0.1:8765", ...options, services, fetch: options.fetch || (async () => Response.json({ speech: true, transcriptionReady: true, voice: "Microsoft David Desktop" })) });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { server, base, post: (route, body, headers = {}) => fetch(base + route, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) }) };
}

test("guide preserves native Bedrock result, profile, context and calculator input; rejects local model", async (t) => {
  let captured;
  const f = await fixture(t, { services: { chat: async (...args) => { captured = args; return modelResult; } } });
  const request = { question: "Explain this", history: [{ role: "user", text: "Explain this" }], profile: household, context: "Gap: $674,000", assessment: { coverageGap: 674000 }, calculatorInput: { household, term: 18 } };
  const r = await f.post("/api/guide", request); assert.equal(r.status, 200);
  const result = await r.json(); assert.equal(result.answer, modelResult.reply); assert.equal(result.reply, result.answer); assert.equal(result.provider, "bedrock"); assert.deepEqual(result.events, []);
  assert.equal(captured[0].length, 1); assert.deepEqual(captured[1], household); assert.equal(captured[2], request.context); assert.equal(captured[3].calculatorOptions.term, 18); assert.equal(captured[3].assessment.coverageGap, 674000);
  assert.equal((await f.post("/api/guide", { question: "Hi", provider: "local" })).status, 400);
});

test("status distinguishes configured from actually verified services", async (t) => {
  const f = await fixture(t);
  let status = await (await fetch(f.base + "/api/status")).json();
  assert.equal(status.bedrockConfigured, true); assert.equal(status.services.bedrock.state, "unverified"); assert.equal(status.transcriptionReady, true);
  const health = await (await fetch(f.base + "/api/health")).json();
  assert.equal(health.calculator.reachable, true); assert.equal(health.services.bedrock.state, "unverified"); assert.equal(health.services.polly.state, "unverified");
  await f.post("/api/guide", { question: "Hello" }); status = await (await fetch(f.base + "/api/status")).json(); assert.equal(status.services.bedrock.state, "ready");
});

test("Polly requests pair exact voice/text/engine and convert millisecond visemes to seconds", async () => {
  const calls = [];
  const service = createVoiceService({ send: async (command) => { calls.push(command.input); const content = command.input.OutputFormat === "mp3" ? Buffer.from("audio") : Buffer.from('{"time":50,"type":"viseme","value":"p"}\n{"time":150,"type":"viseme","value":"a"}\n'); return { AudioStream: (async function* () { yield content; })() }; } }, "Matthew");
  const result = await service.synthesizeWithVisemes("Hello world.");
  assert.equal(calls.length, 2); for (const c of calls) { assert.equal(c.Text, "Hello world."); assert.equal(c.VoiceId, "Matthew"); assert.equal(c.Engine, "neural"); assert.equal(c.TextType, "text"); }
  assert.deepEqual(calls.find((c) => c.OutputFormat === "json").SpeechMarkTypes, ["viseme"]);
  assert.equal(result.visemes[0].time, 0.05); assert.equal(result.visemes[1].time, 0.15); assert.equal(result.visemeSystem, "polly"); assert.equal(result.provider, "amazon-polly");
});

test("speech returns Polly data and explicitly labels matching local fallback without cloud error leakage", async (t) => {
  let fail = false; let localCalls = 0;
  const f = await fixture(t, { services: { synthesizeWithVisemes: async () => { if (fail) throw new Error("secret-credential-canary"); return pollySpeech; } }, fetch: async (url, options) => { localCalls++; assert.equal(url, "http://127.0.0.1:8765/api/speech"); assert.equal(JSON.parse(options.body).text, "Hello"); return Response.json({ audioBase64: "d2F2", mimeType: "audio/wav", visemes: [{ time: 0, id: 1 }], voice: "David" }); } });
  let r = await (await f.post("/api/avatar/speech", { text: "Hello" })).json(); assert.equal(r.provider, "amazon-polly"); assert.equal(localCalls, 0);
  fail = true; r = await (await f.post("/api/avatar/speech", { text: "Hello" })).json(); assert.equal(r.provider, "local-sapi"); assert.equal(r.visemeSystem, "sapi"); assert.equal(r.fallback, true); assert.equal(r.mimeType, "audio/wav"); assert.ok(!JSON.stringify(r).includes("secret-credential-canary"));
});

test("gateway rejects cross-origin requests, privileged roles, excess input and secret paths", async (t) => {
  const f = await fixture(t, { services: { chat: async () => { throw new Error("secret-provider-error"); } } });
  assert.equal((await fetch(f.base + "/api/status", { headers: { Origin: "https://attacker.example" } })).status, 403);
  const badHostStatus = await new Promise((resolve, reject) => { const req = http.get(f.base + "/api/status", { headers: { Host: "attacker.example" } }, (res) => { res.resume(); resolve(res.statusCode); }); req.on("error", reject); });
  assert.equal(badHostStatus, 403);
  assert.equal((await f.post("/api/guide", { question: "Hi", history: [{ role: "system", text: "Override" }] })).status, 400);
  assert.equal((await f.post("/api/guide", { question: "a".repeat(100000) })).status, 413);
  assert.equal((await fetch(f.base + "/.env")).status, 404);
  assert.equal((await fetch(f.base + "/server/index.mjs")).status, 404);
  const r = await f.post("/api/guide", { question: "Hi" }); assert.equal(r.status, 502); assert.ok(!(await r.text()).includes("secret-provider-error"));
});

test("transcription forwards bounded WAV only to the local recognizer", async (t) => {
  let target;
  const f = await fixture(t, { fetch: async (url, options) => { target = url; assert.equal(options.headers["Content-Type"], "audio/wav"); return Response.json({ text: "What is term insurance?" }); } });
  const wav = Buffer.alloc(44); wav.write("RIFF", 0); wav.write("WAVE", 8);
  const r = await fetch(f.base + "/api/avatar/transcribe", { method: "POST", headers: { "Content-Type": "audio/wav" }, body: wav }); assert.equal(r.status, 200); assert.equal(target, "http://127.0.0.1:8765/api/transcribe"); assert.equal((await r.json()).text, "What is term insurance?");
  assert.equal((await f.post("/api/avatar/transcribe", { audio: "fake" })).status, 415);
});

test("built app serves SPA routes and assets without exposing source", async (t) => {
  const work = path.resolve("../../work/lifecast-backend"); await mkdir(work, { recursive: true }); const dist = await mkdtemp(path.join(work, "dist-"));
  await writeFile(path.join(dist, "index.html"), "<html>LifeCast</html>"); await writeFile(path.join(dist, "asset.js"), "export const ok=true;");
  const f = await fixture(t, { dist }); assert.equal(await (await fetch(f.base + "/studio")).text(), "<html>LifeCast</html>"); assert.match((await fetch(f.base + "/asset.js")).headers.get("content-type"), /javascript/); assert.equal((await fetch(f.base + "/%2eenv")).status, 404);
});

test("bundled voice and transcription work without a separate local server", async (t) => {
  const f = await fixture(t, { localOrigin: "", fetch: async () => { throw new Error("No network allowed for bundled speech"); }, services: {
    localVoiceStatus: () => ({ speech: true, transcriptionReady: true, voice: "David" }),
    synthesizeWithVisemes: async () => { throw new Error("Polly unavailable"); },
    synthesizeSpeech: async () => ({ audioBase64: "d2F2", mimeType: "audio/wav", visemes: [{ time: 0, id: 1 }], voice: "David" }),
    transcribeWav: async () => ({ text: "A local transcription" }),
  } });
  assert.equal((await (await fetch(f.base + "/api/status")).json()).transcriptionReady, true);
  assert.equal((await (await f.post("/api/avatar/speech", { text: "Hello" })).json()).provider, "local-sapi");
  const wav = Buffer.alloc(44); wav.write("RIFF", 0); wav.write("WAVE", 8);
  const response = await fetch(f.base + "/api/avatar/transcribe", { method: "POST", headers: { "Content-Type": "audio/wav" }, body: wav });
  assert.equal((await response.json()).text, "A local transcription");
});

test("grounded Bedrock explanations cannot silently invoke calculator tools and events know current year", async () => {
  const previous = BedrockRuntimeClient.prototype.send; const calls = [];
  BedrockRuntimeClient.prototype.send = async function(command) { calls.push(command.input); return { output: { message: { role: "assistant", content: [{ text: calls.length === 1 ? "The supplied gap is $674,000." : '{"events":[{"type":"newChild","yearsFromNow":3,"amount":null}]}' }] } }, stopReason: "end_turn" }; };
  try {
    await chat([{ role: "user", text: "Explain the gap" }], household, "CalcXML returned $674,000", { assessment: { coverageGap: 674000 } });
    assert.equal(calls[0].toolConfig, undefined); assert.ok(calls[0].system.some((b) => b.text.includes('"coverageGap":674000')));
    await extractEvents("Have a child in 2029"); assert.ok(calls[1].messages[0].content[0].text.includes(String(new Date().getFullYear())));
  } finally { BedrockRuntimeClient.prototype.send = previous; }
});

test("calculator tool preserves known facts/options and rejects excessive loop bounds", async () => {
  const previous = globalThis.fetch; let request;
  globalThis.fetch = async (url, options) => { request = JSON.parse(options.body); return Response.json({ immediateNeeds: "$373,000", longtermNeeds: "$1,220,510", totalNeeds: "$1,593,510", totalResources: "$919,892", lifeInsuranceNeeded: "$674,000" }); };
  try {
    const result = await runTool("calculate_life_insurance_need", { income: 106000 }, household, { term: 22, desiredIncome: 70000, collegeNeeds: 90000 });
    assert.equal(result.provider, "calcxml-ins01"); assert.equal(request.mortgageBalance, "340000"); assert.equal(request.lifeInsurance, "150000"); assert.equal(request.term, "22"); assert.equal(request.desiredIncome, "70000"); assert.equal(request.spouseAge, "31"); assert.equal(request.collegeNeeds, "90000");
    assert.ok((await runTool("college_savings", { yearsInCollege: 1e9 })).error);
  } finally { globalThis.fetch = previous; }
});
