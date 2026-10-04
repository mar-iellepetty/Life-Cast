// ---------------------------------------------------------------------------
// AI insights for the planner's illustrative timeline.
//
//   analyzeEvent     A custom life event in the user's own words ("hurricane in
//                    Florida") -> an estimated cost, category and duration, plus
//                    a short explanation.
//   analyzeHealth    A summary of Apple Health habits -> a small adjustment.
//   analyzeLocation  A place -> FEMA National Risk Index ratings for its county
//                    -> a small adjustment.
//
// Bedrock writes the estimates and explanations. Every number it returns is
// clamped here: health adjustments to -10..+10 percent, location adjustments to
// 0..+10 percent. These adjust only the illustrative timeline; CalcXML remains
// the source of the current assessment.
// ---------------------------------------------------------------------------

import { converse, extractJson } from "./bedrock.mjs";

const clamp = (value, min, max, fallback) => (typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback);
const round1 = (n) => Math.round(n * 10) / 10;
const cleanText = (value, max, fallback = "") => (typeof value === "string" && value.trim() ? value.trim().replace(/\s+/g, " ").slice(0, max) : fallback);
const cleanList = (value, max = 3) => (Array.isArray(value) ? value.map((v) => cleanText(v, 200)).filter(Boolean).slice(0, max) : []);

function adjustmentHeadline(value, percent, fallback) {
  const headline = cleanText(value, 160, fallback);
  const lowered = /lower|reduc|decreas/i.test(headline);
  const raised = /rais|increas|higher/i.test(headline);
  const consistent = percent === 0 ? !lowered && !raised : percent < 0 ? lowered && !raised : raised && !lowered;
  if (!consistent) return fallback;
  // Model prose must use the same bounded adjustment as the plotted result.
  return headline.replace(/[+\-\u2212]?\d+(?:\.\d+)?\s*(?:%|percent\b)/gi, `${Math.abs(percent)}%`);
}

// ---------------------------------------------------------------------------
// 1. Custom life events
// ---------------------------------------------------------------------------

const EVENT_SYSTEM = `
You estimate the financial effect of a life event for a life-insurance planning illustration.
Reply with ONLY a JSON object:
{"title": short name (max 40 chars),
 "category": "mortgage" for anything about a home or property (purchase, repairs, storm/fire/flood damage, rebuilding), "education" for schooling, or "other",
 "amount": total estimated cost in US dollars (number, 0 if none),
 "years": years over which the cost is paid or recovered (1-30),
 "summary": 1-2 short plain sentences: what you expect to change and why, with the dollar estimate}
RULES:
- Use the household facts and location provided. Base estimates on typical US costs.
- Be realistic and moderate. Never alarming. No markdown. No product advice.
- If the event has no clear cost, use amount 0 and say so briefly.
`.trim();

export async function analyzeEvent(input, { signal } = {}) {
  const facts = {
    event: input.text,
    eventAge: input.age,
    currentAge: input.currentAge,
    location: input.location || "not provided",
    annualIncome: input.annualIncome,
    mortgageBalance: input.mortgage,
    savings: input.savings,
    children: input.children,
    estimatedNeedAtEventAge: input.needAtAge,
  };
  const raw = await converse({ system: EVENT_SYSTEM, user: `Household and event:\n${JSON.stringify(facts)}`, temperature: 0.2, maxTokens: 350, signal });
  const json = extractJson(raw);
  if (!json) throw new Error("The event estimate was not returned in the expected format.");
  const category = ["mortgage", "education", "other"].includes(json.category) ? json.category : "other";
  return {
    title: cleanText(json.title, 40, cleanText(input.text, 40, "Custom event")),
    category,
    amount: Math.round(clamp(json.amount, 0, 5_000_000, 0) / 100) * 100,
    years: Math.round(clamp(json.years, 1, 30, 5)),
    summary: cleanText(json.summary, 320, "Lincoln could not explain this estimate."),
  };
}

// ---------------------------------------------------------------------------
// 2. Apple Health habits
// ---------------------------------------------------------------------------

const HEALTH_SYSTEM = `
You review a person's recent health-habit averages for a life-insurance planning illustration.
Reply with ONLY a JSON object:
{"percent": adjustment to the illustrative coverage need, a number from -10 to 10
            (negative = healthier habits, slightly lower need; positive = higher risk, slightly higher need),
 "headline": one short sentence stating the change, e.g. "Your activity lowered the plan by 3%.",
 "reasons": 1-3 very short reasons tied to the numbers}
RULES:
- Keep adjustments small; most people fall between -5 and 5.
- The headline and reasons must agree with the sign of percent. Name the specific habits that caused the change (for example "short sleep raised it" or "strong activity lowered it"); never call habits healthy while raising the plan.
- Ignore missing metrics. Be encouraging, never judgmental or medical. No markdown.
`.trim();

export async function analyzeHealth(metrics, { signal } = {}) {
  const raw = await converse({ system: HEALTH_SYSTEM, user: `Recent health averages:\n${JSON.stringify(metrics)}`, temperature: 0.2, maxTokens: 300, signal });
  const json = extractJson(raw);
  if (!json) throw new Error("The health review was not returned in the expected format.");
  const percent = round1(clamp(json.percent, -10, 10, 0));
  const fallback = percent === 0 ? "Your habits did not change the plan." : `Your habits ${percent < 0 ? "lowered" : "raised"} the plan by ${Math.abs(percent)}%.`;
  return { percent, headline: adjustmentHeadline(json.headline, percent, fallback), reasons: cleanList(json.reasons) };
}

// ---------------------------------------------------------------------------
// 3. Location and environmental risk (FEMA National Risk Index)
// ---------------------------------------------------------------------------

export const NRI_SOURCE = { name: "FEMA National Risk Index", url: "https://hazards.fema.gov/nri/" };
const NRI_QUERY = "https://services.arcgis.com/XG15cJAlne2vxtgt/arcgis/rest/services/National_Risk_Index_Counties/FeatureServer/0/query";
const HAZARDS = {
  HRCN: "Hurricane", CFLD: "Coastal flooding", RFLD: "Riverine flooding", IFLD: "Inland flooding", WFIR: "Wildfire",
  ERQK: "Earthquake", TRND: "Tornado", HWAV: "Heat wave", CWAV: "Cold wave", DRGT: "Drought", HAIL: "Hail",
  LTNG: "Lightning", SWND: "Strong wind", WNTW: "Winter weather", LNDS: "Landslide", TSUN: "Tsunami", AVLN: "Avalanche",
  ISTM: "Ice storm", VLCN: "Volcanic activity",
};
const RATING_ORDER = ["Very High", "Relatively High", "Relatively Moderate", "Relatively Low", "Very Low"];
const geoCache = new Map();

async function getJson(fetchImpl, url, signal, headers = {}) {
  const response = await fetchImpl(url, { headers: { Accept: "application/json", ...headers }, redirect: "follow", signal: AbortSignal.any([AbortSignal.timeout(15000), ...(signal ? [signal] : [])]) });
  if (!response.ok) throw new Error(`Lookup failed with HTTP ${response.status}.`);
  return response.json();
}

async function geocode(fetchImpl, query, signal) {
  const key = query.toLowerCase();
  if (geoCache.has(key)) return geoCache.get(key);
  const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q: query, format: "json", limit: "1", countrycodes: "us", addressdetails: "1" })}`;
  const results = await getJson(fetchImpl, url, signal, { "User-Agent": "LifeCast-planner/1.0 (educational life-insurance demo)" });
  const hit = Array.isArray(results) ? results[0] : null;
  if (!hit) return null;
  const place = { lat: Number(hit.lat), lon: Number(hit.lon), label: [hit.address?.city || hit.address?.town || hit.address?.village || hit.name, hit.address?.state].filter(Boolean).join(", ") };
  if (geoCache.size > 200) geoCache.delete(geoCache.keys().next().value);
  geoCache.set(key, place);
  return place;
}

async function countyFips(fetchImpl, lat, lon, signal) {
  const url = `https://geocoding.geo.census.gov/geocoder/geographies/coordinates?${new URLSearchParams({ x: String(lon), y: String(lat), benchmark: "Public_AR_Current", vintage: "Current_Current", layers: "Counties", format: "json" })}`;
  const data = await getJson(fetchImpl, url, signal);
  const county = data?.result?.geographies?.Counties?.[0];
  return county ? { fips: String(county.GEOID), name: String(county.NAME) } : null;
}

async function nriRatings(fetchImpl, fips, signal) {
  if (!/^\d{5}$/.test(fips)) return null;
  const url = `${NRI_QUERY}?${new URLSearchParams({ where: `STCOFIPS='${fips}'`, outFields: "*", returnGeometry: "false", f: "json" })}`;
  const data = await getJson(fetchImpl, url, signal);
  const a = data?.features?.[0]?.attributes;
  if (!a) return null;
  const hazards = Object.entries(HAZARDS)
    .map(([code, label]) => ({ label, rating: a[`${code}_RISKR`] }))
    .filter((h) => RATING_ORDER.includes(h.rating))
    .sort((x, y) => RATING_ORDER.indexOf(x.rating) - RATING_ORDER.indexOf(y.rating));
  return { county: `${a.COUNTY}, ${a.STATEABBRV}`, overall: a.RISK_RATNG, score: Math.round(Number(a.RISK_SCORE) || 0), version: a.NRI_VER, hazards };
}

const LOCATION_SYSTEM = `
You explain environmental risk for a life-insurance planning illustration, using FEMA National Risk Index ratings.
Reply with ONLY a JSON object:
{"percent": increase to the illustrative coverage need, a number from 0 to 10 (higher for "Very High" overall or hazard ratings),
 "headline": one short sentence, e.g. "Hurricane and flood risk in Miami-Dade raised the plan by 6%.",
 "reasons": 1-3 very short reasons naming the top hazards and what they could mean for a household (property damage, disruption)}
RULES:
- Low or very low risk should be 0-2. Keep it calm and factual. No markdown. No product advice.
`.trim();

export async function analyzeLocation(input, { signal, fetch: fetchImpl = fetch } = {}) {
  let point = Number.isFinite(input.lat) && Number.isFinite(input.lon) ? { lat: input.lat, lon: input.lon, label: "" } : null;
  if (!point && input.query) point = await geocode(fetchImpl, input.query, signal);
  if (!point) return { found: false, message: "We could not find that place. Try a US city and state, or a ZIP code." };
  const county = await countyFips(fetchImpl, point.lat, point.lon, signal);
  if (!county) return { found: false, message: "That location is outside the counties covered by the FEMA National Risk Index." };
  const nri = await nriRatings(fetchImpl, county.fips, signal);
  if (!nri) return { found: false, message: "FEMA National Risk Index data is not available for that county." };
  const top = nri.hazards.slice(0, 4);
  const raw = await converse({ system: LOCATION_SYSTEM, user: `County: ${nri.county}\nOverall risk: ${nri.overall} (score ${nri.score} of 100)\nTop hazards: ${JSON.stringify(top)}`, temperature: 0.2, maxTokens: 300, signal });
  const json = extractJson(raw) || {};
  const percent = round1(clamp(json.percent, 0, 10, 0));
  return {
    found: true,
    place: point.label || county.name,
    county: nri.county,
    overall: nri.overall,
    score: nri.score,
    hazards: top,
    percent,
    headline: adjustmentHeadline(json.headline, percent, percent === 0
      ? `${nri.county}'s natural-hazard ratings did not change the illustrative plan.`
      : `${nri.county}'s natural-hazard ratings raised the illustrative plan by ${percent}%.`),
    reasons: cleanList(json.reasons),
    source: { ...NRI_SOURCE, version: nri.version },
  };
}
