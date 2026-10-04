import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import { createServer } from "../server/index.mjs";
import { analyzeEvent, analyzeHealth, analyzeLocation } from "../server/insights.mjs";

const reply = (json) => async () => ({ output: { message: { content: [{ text: `Here you go: ${JSON.stringify(json)}` }] } } });

async function fixture(t, services) {
  const server = createServer({ localOrigin: "http://127.0.0.1:8765", services: { bedrockConfigured: async () => true, ...services }, fetch: async () => Response.json({}) });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  return (route, body) => fetch(base + route, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

test("insight routes validate input and pass sanitized requests to the services", async (t) => {
  const seen = {};
  const post = await fixture(t, {
    analyzeEvent: async (input) => { seen.event = input; return { title: "Hurricane damage", category: "mortgage", amount: 150000, years: 2, summary: "ok" }; },
    analyzeHealth: async (metrics) => { seen.health = metrics; return { percent: -3, headline: "ok", reasons: [] }; },
    analyzeLocation: async (where) => { seen.location = where; return { found: true, percent: 6 }; },
  });
  let r = await post("/api/insights/event", { text: "Hurricane in Florida", age: 40, currentAge: 38, location: "Miami, FL", annualIncome: 125000 });
  assert.equal(r.status, 200); assert.equal(seen.event.text, "Hurricane in Florida"); assert.equal(seen.event.location, "Miami, FL");
  assert.equal((await post("/api/insights/event", { text: "", age: 40, currentAge: 38 })).status, 400);
  assert.equal((await post("/api/insights/event", { text: "x", age: 400, currentAge: 38 })).status, 400);

  r = await post("/api/insights/health", { metrics: { days: 90, avgDailySteps: 9000, secret: "ignored" } });
  assert.equal(r.status, 200); assert.equal(seen.health.avgDailySteps, 9000); assert.equal("secret" in seen.health, false);
  assert.equal((await post("/api/insights/health", { metrics: { days: 90 } })).status, 400);
  assert.equal((await post("/api/insights/health", { metrics: { days: 90, restingHeartRate: 900 } })).status, 400);

  assert.equal((await post("/api/insights/location", { query: "Miami, FL" })).status, 200); assert.deepEqual(seen.location, { query: "Miami, FL" });
  assert.equal((await post("/api/insights/location", { lat: 25.77, lon: -80.19 })).status, 200); assert.deepEqual(seen.location, { lat: 25.77, lon: -80.19 });
  assert.equal((await post("/api/insights/location", { lat: 200, lon: 0 })).status, 400);
});

test("AI estimates are clamped: health ±10%, location 0–10%, event amounts and years bounded", async (t) => {
  t.mock.method(BedrockRuntimeClient.prototype, "send", reply({ percent: -25, headline: "Great habits.", reasons: ["a", "b", "c", "d"] }));
  const health = await analyzeHealth({ days: 90, avgDailySteps: 12000 });
  assert.equal(health.percent, -10); assert.equal(health.reasons.length, 3);

  t.mock.method(BedrockRuntimeClient.prototype, "send", reply({ title: "A very long event title that keeps going and going", category: "boats", amount: 9e12, years: 99, summary: "Big." }));
  const event = await analyzeEvent({ text: "Buy a yacht", age: 40, currentAge: 38 });
  assert.equal(event.category, "other"); assert.equal(event.amount, 5000000); assert.equal(event.years, 30); assert.ok(event.title.length <= 40);
});

test("health headlines agree with the bounded percentage, including zero and contradictory directions", async (t) => {
  const mock = t.mock.method(BedrockRuntimeClient.prototype, "send");
  for (const [json, expected] of [
    [{ percent: -25, headline: "Strong activity lowered the plan by 25 percent." }, "Strong activity lowered the plan by 10%."],
    [{ percent: 25, headline: "Short sleep raised the plan by 25%." }, "Short sleep raised the plan by 10%."],
    [{ percent: 0, headline: "Strong activity lowered the plan by 3%." }, "Your habits did not change the plan."],
    [{ percent: 4, headline: "Strong activity lowered the plan by 4%." }, "Your habits raised the plan by 4%."],
  ]) {
    mock.mock.mockImplementation(reply(json));
    const result = await analyzeHealth({ days: 90, avgDailySteps: 12000 });
    assert.equal(result.headline, expected);
  }
});

test("location insight geocodes, finds the county and reads FEMA National Risk Index ratings", async (t) => {
  const urls = [];
  const fakeFetch = async (url) => {
    urls.push(String(url));
    if (String(url).includes("nominatim")) return Response.json([{ lat: "25.77", lon: "-80.19", name: "Miami", address: { city: "Miami", state: "Florida" } }]);
    if (String(url).includes("geocoding.geo.census.gov")) return Response.json({ result: { geographies: { Counties: [{ GEOID: "12086", NAME: "Miami-Dade County" }] } } });
    return Response.json({ features: [{ attributes: { COUNTY: "Miami-Dade", STATEABBRV: "FL", RISK_RATNG: "Very High", RISK_SCORE: 99.6, NRI_VER: "December 2025", HRCN_RISKR: "Very High", WFIR_RISKR: "Relatively Moderate", ERQK_RISKR: "Relatively Low", AVLN_RISKR: "Not Applicable" } }] });
  };
  const mock = t.mock.method(BedrockRuntimeClient.prototype, "send", reply({ percent: 42, headline: "Hurricane risk raised the plan by 42%.", reasons: ["Hurricane: very high"] }));
  const result = await analyzeLocation({ query: "Miami, FL" }, { fetch: fakeFetch });
  assert.equal(result.found, true); assert.equal(result.county, "Miami-Dade, FL"); assert.equal(result.percent, 10);
  assert.equal(result.headline, "Hurricane risk raised the plan by 10%.");
  assert.equal(result.hazards[0].label, "Hurricane"); assert.equal(result.hazards.some((h) => h.rating === "Not Applicable"), false);
  assert.equal(result.source.name, "FEMA National Risk Index"); assert.equal(result.source.version, "December 2025");
  assert.ok(urls[2].includes("STCOFIPS%3D%2712086%27"));

  mock.mock.mockImplementation(reply({ percent: -4, headline: "Local risk lowered the plan by 4%." }));
  const unchanged = await analyzeLocation({ lat: 25.77, lon: -80.19 }, { fetch: fakeFetch });
  assert.equal(unchanged.percent, 0);
  assert.equal(unchanged.headline, "Miami-Dade, FL's natural-hazard ratings did not change the illustrative plan.");

  const missing = await analyzeLocation({ query: "Nowhere" }, { fetch: async () => Response.json([]) });
  assert.equal(missing.found, false);
});
