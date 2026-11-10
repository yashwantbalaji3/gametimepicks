/**
 * NFL QB PROPS · R5 AT FREEZE (pre-registration v1.1). The official forecast's teamInputs.state per game, captured by
 * the per-slate job while the public forecast files still carry that game (they hold the current week only), so grade
 * mode can apply R5 weeks later. Interim until CANON-01's nflOfficialOfRecord is on main.
 */
import fs from "node:fs";
import path from "node:path";
import { unionFrozenForecasts } from "./public-forecast-union.mjs";
import { nflPublicRecordResolver } from "./public-record.mjs";
import { r5Allows } from "./qb-props-markets.mjs";

export const FORECASTS_DIR = "app/public/data/nfl/forecasts";
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

export const R5_LOG_REL = "data/internal/research/nfl/qb-props/r5-at-freeze.json";
export const R5_LOG_SCHEMA = "gtp.nfl.qb-props-r5-at-freeze@1";
const ms = (iso) => { const t = Date.parse(String(iso ?? "").replace(/T(\d\d):(\d\d)Z$/, "T$1:$2:00Z")); return Number.isFinite(t) ? t : null; };

/**
 * PURE. Fold the current official forecasts into the R5 log: per event with a known kickoff, keep the latest forecast
 * generated strictly before kickoff (a later or post-kickoff forecast never replaces it). Deterministic, no clock.
 * @param {{events?: Record<string, {eventStart:string, forecastGeneratedAt:string, teamInputsState:string|null}>}|null} prev
 * @param {any[]} forecasts the official forecasts (latest ∪ frozen-latest)
 * @param {Map<string,string>} eventStartById kickoff per event (from its receipts)
 */
export function foldR5Log(prev, forecasts, eventStartById) {
  const events = { ...(prev?.events ?? {}) };
  for (const f of forecasts ?? []) {
    const id = String(f.providerEventId);
    const start = eventStartById.get(id);
    if (!start || !(ms(f.generatedAt) < ms(start))) continue;
    const cur = events[id];
    if (cur && !(ms(f.generatedAt) > ms(cur.forecastGeneratedAt))) continue;
    events[id] = { eventStart: start, forecastGeneratedAt: f.generatedAt, teamInputsState: f.teamInputs?.state ?? null };
  }
  return { schema: R5_LOG_SCHEMA, rule: "latest official forecast generated before kickoff; teamInputs.state; r5Allows decides", events: Object.fromEntries(Object.entries(events).sort(([a], [b]) => a.localeCompare(b))) };
}
/** The current official forecasts from the public files (what the site serves this week). */
export function currentOfficialForecasts(root, { resolve = nflPublicRecordResolver(root) } = {}) {
  const dir = path.join(root, FORECASTS_DIR);
  return unionFrozenForecasts(readJson(path.join(dir, "latest.json")), readJson(path.join(dir, "frozen-latest.json")), { resolve })?.forecasts ?? [];
}
/** R5 per game from the log; no entry ⇒ not allowed. */
export const r5FromLog = (log) => ({ eventId }) => { const e = log?.events?.[String(eventId)]; return e ? r5Allows({ state: e.teamInputsState }) : false; };
export const readR5Log = (root) => readJson(path.join(root, R5_LOG_REL));
