/**
 * WHICH STARTED GAMES STAY PUBLISHED — the selection behind forecasts/frozen-latest.json.
 *
 * Every run of build-nfl-public-forecasts publishes only games that have not started (latest.json);
 * the started games of the CURRENT week are carried here, each exactly as its last pre-kickoff receipt
 * (P295). The week, though, is decided by the schedule: once every game of week N has kicked off, the
 * next run's current week is N+1.
 *
 * ⚠ 2026-09-28: PHI @ CHI (Week 3, Monday night) kicked off at 00:15Z. At 00:50Z the run published
 *   Week 4, its current week became 4, and the game — in the second quarter — left both files, so
 *   nfl/index.json, /nfl and /simulate lost a game being played (Home said "No NFL games today").
 *
 * THE ROLLOVER RULE (the only addition): a started game from an EARLIER week is still carried while it
 * is in progress by the shared lifecycle owner (NFL_DURATION_HOURS after kickoff) AND has not reached a
 * terminal state — a STATUS_FINAL result or a settlement. The moment either is true it drops out, as it
 * always did; the clock bound means nothing survives indefinitely if a final never arrives. Everything
 * else is unchanged: only receipts generated BEFORE their own kickoff are ever carried (a frozen
 * forecast is never regenerated), a game already in the live set is never carried twice, and one
 * receipt per event (the latest pre-kickoff revision) is chosen.
 */
import { eventState, EVENT_STATE } from "../event-lifecycle.mjs";
import { NFL_DURATION_HOURS, effectiveLifecycle } from "./effective-lifecycle.mjs";

/**
 * @param {{ receipts: Array<object>, currentPeriod: {seasonType:number, week:number}|null, nowIso: string,
 *           liveIds: Set<string>, terminalIds: Set<string> }} input
 * @returns {Array<object>} the receipts to publish as frozen, one per event, ascending by kickoff
 */
export function selectFrozenReceipts({ receipts, currentPeriod, nowIso, liveIds, terminalIds }) {
  const nowMs = Date.parse(nowIso);
  const best = new Map();
  for (const rec of receipts ?? []) {
    if (!rec?.providerEventId || !rec.kickoffUtc || !rec.generatedAt || !rec.forecastSummary) continue;
    const id = String(rec.providerEventId);
    const kickoff = Date.parse(rec.kickoffUtc);
    if (!Number.isFinite(kickoff) || kickoff > nowMs) continue;              // not started: latest.json owns it
    if (liveIds.has(id)) continue;                                           // never published twice
    if (!(Date.parse(rec.generatedAt) < kickoff)) continue;                   // frozen means pre-kickoff, always
    const currentWeek = !!currentPeriod && rec.seasonType === currentPeriod.seasonType && rec.week === currentPeriod.week;
    if (!currentWeek && !carriedThroughRollover(rec, nowIso, terminalIds)) continue;
    if (!best.has(id) || rec.generatedAt > best.get(id).generatedAt) best.set(id, rec);
  }
  return [...best.values()].sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc));
}

/** An earlier week's started game survives the rollover only while in progress and not terminal. */
export function carriedThroughRollover(rec, nowIso, terminalIds) {
  if (terminalIds.has(String(rec.providerEventId))) return false;
  return eventState({ startUtc: rec.kickoffUtc, nowIso, durationHours: NFL_DURATION_HOURS }) === EVENT_STATE.IN_PROGRESS;
}

/** Terminal ids from the owners that already mean "over": a STATUS_FINAL result, or a settlement. */
export function terminalEventIds({ resultsRows = [], settledIds = [] } = {}) {
  const ids = new Set(settledIds.map(String));
  for (const r of resultsRows) if (/^STATUS_FINAL/.test(r?.statusRaw ?? "") && r?.providerEventId != null) ids.add(String(r.providerEventId));
  return ids;
}

/**
 * THE /nfl "EARLIER WEEK'S GAME" LINE — which index events it may name.
 *
 * ⚠ 2026-10-18: /nfl said "SEA @ DEN · kicked off Thu 8:15 PM ET · Follow live" three days after that game
 *   went final. The index carries it as lifecycle SETTLED (graded), and results/latest.json has STATUS_FINAL,
 *   but the page selected `hasStarted(e) && !weekIds.has(id)` — and hasStarted is true for SETTLED too. The
 *   game had left the week's ids only because the schedule capture stops listing a finished game.
 *
 * The line exists for a game still being played (see the rollover rule above), so it takes only events whose
 * effective lifecycle is STARTED — never SETTLED — and drops any event a terminal owner (a STATUS_FINAL result
 * or a settlement, via `terminalEventIds`) already calls over. Terminal-ness comes from those canonical fields,
 * never from the clock.
 *
 * @template {{ providerEventId: string, lifecycle?: string, kickoffUtc?: string|null }} E
 * @param {E[]} indexEvents
 * @param {{ weekIds: Set<string|undefined>, nowIso: string, terminalIds: Set<string> }} opts
 * @returns {E[]}
 */
export function carriedInPlayEvents(indexEvents, { weekIds, nowIso, terminalIds }) {
  return (indexEvents ?? []).filter((e) =>
    effectiveLifecycle(e, nowIso) === "STARTED"
    && !terminalIds.has(String(e.providerEventId))
    && !weekIds.has(e.providerEventId));
}
