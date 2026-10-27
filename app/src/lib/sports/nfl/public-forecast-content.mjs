/**
 * NFL · PUBLIC FORECAST FILES CHANGE ONLY WHEN THEIR CONTENT DOES (cost work, 2026-10-26).
 *
 * forecasts/latest.json, forecasts/<date>.json and forecasts/frozen-latest.json are critical deploy paths: a commit that
 * touches them builds Production at once. Every event window rewrote them because each carries the run's clock, so
 * 43 of 58 event-window commits from 10-19 16Z to 10-26 16Z built for timestamps alone (measure-nfl-critical-churn.mjs).
 *
 * Two documents have the same content when they are equal after removing ONLY the clocks a run stamps on an otherwise
 * identical forecast — the run's `generatedAt` (document and forecast), the strength cutoff (= the run's NOW), the
 * schedule capture's own stamp and the participation record's stamp. Everything a reader sees or the record depends
 * on — forecastSummary, marketComparison (with its capture time), teamInputs, the side decision, model and heads, the
 * set and order of games, the date, refusals — is content. Canonical comparison: key order never matters.
 * Pure.
 */
const DOC_CLOCKS = new Set(["generatedAt"]);
const FORECAST_CLOCKS = new Set(["generatedAt"]);
const EVIDENCE_CLOCKS = new Set(["strengthCutoff", "schedule"]);
const TEAM_INPUT_CLOCKS = new Set(["participationAsOf"]);

const omit = (o, keys) => (o && typeof o === "object" && !Array.isArray(o) ? Object.fromEntries(Object.entries(o).filter(([k]) => !keys.has(k))) : o);

function stripForecast(f) {
  const out = omit(f, FORECAST_CLOCKS);
  if (out?.evidence) out.evidence = omit(out.evidence, EVIDENCE_CLOCKS);
  if (out?.teamInputs) out.teamInputs = omit(out.teamInputs, TEAM_INPUT_CLOCKS);
  return out;
}

/** The document without run clocks. */
export function publicForecastContent(doc) {
  if (!doc || typeof doc !== "object") return doc ?? null;
  const out = omit(doc, DOC_CLOCKS);
  if (Array.isArray(out.forecasts)) out.forecasts = out.forecasts.map(stripForecast);
  return out;
}

/** JSON with sorted keys, so equal content compares equal whatever order a writer used. */
export function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`;
  return JSON.stringify(v ?? null);
}

/** Same content (true) → a writer leaves the committed file's bytes alone. */
export const samePublicForecastContent = (a, b) => a != null && b != null && canonical(publicForecastContent(a)) === canonical(publicForecastContent(b));
