/**
 * SESSION 5 · A6 — CURRENT-SEASON USAGE HAS A FRESHNESS CONTRACT.
 *
 * Receiving projections allocate from role-shares-v1/current.json, which folds player-events-v1/<season>.json
 * (Session 4 #874). Nothing checked that the capture kept up: had it stalled, every rookie's and mover's usage
 * would have frozen at the last captured week with every check green — the 79-receiver gap again, silently.
 *
 * THE RULE (no new number): every regular-season FINAL in the canonical NFL results owner whose kickoff is older
 * than the results bound (FRESHNESS_MATRIX.results, 36h — the window that owner is committed to) must be in the
 * season's player-event capture. Anchored on the ESPN results owner, NOT on the nflverse list the capture reads,
 * so a stalled upstream cannot make the check vacuous. A stale results capture is reported, never passed.
 *
 * Pure: the documents and the clock are arguments.
 */
import { checkFreshness, FRESHNESS_MATRIX } from "./season-context.mjs";

export const USAGE_FRESHNESS = Object.freeze({ CURRENT: "CURRENT", LAGGING: "LAGGING", RESULTS_STALE: "RESULTS_STALE", NO_CAPTURE: "NO_CAPTURE" });

/**
 * @param results  app/public/data/nfl/results/latest.json
 * @param events   data/internal/research/nfl/player-events-v1/<season>.json
 * @param season   the NFL season the capture partition belongs to
 * @param nowIso   the clock
 */
export function checkUsageCapture({ results, events, season, nowIso }) {
  const now = Date.parse(nowIso ?? "");
  if (!Number.isFinite(now)) throw new Error("checkUsageCapture: nowIso required");
  const fresh = checkFreshness("results", { sourceAsOf: results?.generatedAt ?? null, fetchedAt: results?.generatedAt ?? null }, nowIso);
  if (fresh.state !== "FRESH") return { state: USAGE_FRESHNESS.RESULTS_STALE, missing: [], reason: `the results owner is ${fresh.state}${fresh.reason ? `: ${fresh.reason}` : ""} — usage freshness cannot be judged against it` };
  if (!events || !Array.isArray(events.games)) return { state: USAGE_FRESHNESS.NO_CAPTURE, missing: [], reason: `no ${season} player-event capture` };
  const captured = new Set(events.games.map((g) => String(g.providerEventId)));
  const quarantined = new Set((events.quarantinedGames ?? []).map((g) => String(g.providerEventId ?? g)));
  const lagMs = FRESHNESS_MATRIX.results.hours * 3_600_000;
  const seasonOf = (iso) => { const d = new Date(iso); return d.getUTCMonth() < 6 ? d.getUTCFullYear() - 1 : d.getUTCFullYear(); };
  const owed = (results?.rows ?? []).filter((r) => r?.statusRaw === "STATUS_FINAL" && r.seasonType === 2
    && seasonOf(r.dateUtc) === season && now - Date.parse(r.dateUtc) > lagMs);
  /* A quarantined game was captured and refused by reconciliation — accounted for, not lagging. */
  const missing = owed.filter((r) => !captured.has(String(r.providerEventId)) && !quarantined.has(String(r.providerEventId)))
    .map((r) => ({ providerEventId: String(r.providerEventId), game: r.shortName ?? null, kickoffUtc: r.dateUtc }));
  return missing.length
    ? { state: USAGE_FRESHNESS.LAGGING, missing, reason: `${missing.length} final(s) older than ${FRESHNESS_MATRIX.results.hours}h are not in the ${season} player-event capture` }
    : { state: USAGE_FRESHNESS.CURRENT, missing: [], owed: owed.length, reason: `all ${owed.length} final(s) older than ${FRESHNESS_MATRIX.results.hours}h are captured` };
}
