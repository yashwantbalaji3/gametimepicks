/**
 * SESSION 12 · APPEND-ONLY WITHDRAWAL FOR A FROZEN TOP-5 ROW. Pure — the clock, the receipt, the boards and the
 * existing log are arguments; the producer (scripts/results/record-top-board-withdrawals.mjs) does the IO.
 *
 * ⚠ WHY. The frozen 2026-10-04 Top-5 (results/top-boards/2026-10-04.json, frozen 10-03 14:44Z, write-once)
 * ranks Zay Flowers #5 for receptions. The receipt itself records `participation: "QUESTIONABLE"` — he was
 * listed Questionable when it was published (the availability gate that now blocks that, #946, landed the
 * next day) and was still Questionable on the last board before his 17:00Z kickoff. The published bytes must
 * never change: the commit that added them is the proof they predate every result. But a reader must be able
 * to see that the row was not actionable.
 *
 * SO: a SIDECAR LOG beside the receipt, never inside it — results/top-board-withdrawals/<day>.json:
 *   { receipt: { path, publishedAt }, events: [ { forecastId, playerId, providerEventId, kickoffUtc, status,
 *     reason, source, observedAt, effectiveAt, recordedAt } ] }
 *   - APPEND-ONLY. Events are never edited, reordered or removed (verifyAppendOnly refuses it).
 *   - PRE-KICKOFF EVIDENCE ONLY. An observation stamped at or after the row's kickoff is never used: no
 *     hindsight. `recordedAt` may be later (the log can be written after the game) and is shown as such.
 *   - STATE = THE LAST EVENT. WITHDRAWN when the player's participation is not cleared for a public board
 *     (the SAME allowlist as the ranking gate), REINSTATED if a later pre-kickoff read clears him again.
 *   - PUBLICATION ≠ SETTLEMENT. This never grades, voids, settles or moves money. The settlement owner's word
 *     (reconciliation: inside / outside / void · did not play) is shown unchanged beside it.
 */
import { PUBLIC_BOARD_CLEARED } from "../../sports/nfl/board-ranking.mjs";

export const WITHDRAWAL = Object.freeze({ WITHDRAWN: "WITHDRAWN", REINSTATED: "REINSTATED" });
export const SOURCE = Object.freeze({
  /** The participation the frozen row itself recorded at publication — pre-kickoff by construction. */
  FROZEN_RECEIPT: "FROZEN_RECEIPT",
  /** The game's per-game player board, regenerated before kickoff from the injuries + rosters captures. */
  PLAYER_BOARD: "PLAYER_BOARD",
});
export const ARTIFACT = "results-top-board-withdrawals";

const ms = (iso) => { const t = Date.parse(String(iso ?? "").replace(/T(\d\d):(\d\d)Z$/, "T$1:$2:00Z")); return Number.isFinite(t) ? t : NaN; };

/** A participation string is cleared for a public board only if the ranking gate's allowlist says so. */
export const isCleared = (participation) => typeof participation === "string" && PUBLIC_BOARD_CLEARED.includes(participation);

/**
 * The participation a per-game board recorded for `playerId`, or null when the board does not mention him.
 * A player the board excluded as unavailable (coverage EXCLUDED_UNAVAILABLE) reads as the reason it gave.
 */
function boardParticipation(board, playerId) {
  const row = (board?.players ?? []).find((p) => p?.playerId === playerId && typeof p.participation === "string");
  if (row) return row.participation;
  let found = null;
  JSON.stringify(board?.coverage ?? board?.integrity ?? null, (k, v) => {
    if (!found && v && v.playerId === playerId && v.state === "EXCLUDED_UNAVAILABLE") found = `UNAVAILABLE (${v.reason ?? "no reason given"})`;
    return v;
  });
  return found;
}

/**
 * Every pre-kickoff observation of every frozen row, oldest first.
 * @param {any} receipt          the frozen day document (results/top-boards/<day>.json)
 * @param {Record<string, any>} boardsByEvent  per-game player boards keyed by providerEventId
 */
export function observeRows(receipt, boardsByEvent = {}) {
  const out = [];
  const publishedAt = receipt?.publishedAt ?? null;
  for (const b of receipt?.boards ?? []) {
    for (const r of b?.rows ?? []) {
      const base = { forecastId: r.forecastId, playerId: r.playerId, name: r.name, providerEventId: String(r.providerEventId), kickoffUtc: r.kickoffUtc };
      if (typeof r.participation === "string" && publishedAt) out.push({ ...base, participation: r.participation, observedAt: publishedAt, source: SOURCE.FROZEN_RECEIPT });
      const board = boardsByEvent[String(r.providerEventId)];
      const p = board ? boardParticipation(board, r.playerId) : null;
      const at = board?.availability?.injuriesCapturedAt ?? board?.generatedAt ?? null;
      if (p && at) out.push({ ...base, participation: p, observedAt: at, source: SOURCE.PLAYER_BOARD });
    }
  }
  return out.sort((a, b) => ms(a.observedAt) - ms(b.observedAt));
}

/** The log's current state for one row: its last event, or null (actionable as published). */
export function lastEvent(log, forecastId) {
  const ev = (log?.events ?? []).filter((e) => e.forecastId === forecastId);
  return ev.length ? ev[ev.length - 1] : null;
}

/** The withdrawal in force for a row (the last event, if it is a WITHDRAWN), else null. */
export function effectiveWithdrawal(log, forecastId) {
  const e = lastEvent(log, forecastId);
  return e && e.status === WITHDRAWAL.WITHDRAWN ? e : null;
}

/**
 * The next log: `existing` followed by any events the observations newly justify. Never edits `existing`.
 * @param {any} existing  the current log or null
 * @param {any} receipt   the frozen day document
 * @param {Array<any>} observations  from observeRows
 * @param {string} nowIso the recording clock
 */
export function appendWithdrawals(existing, receipt, observations, nowIso) {
  if (!Number.isFinite(ms(nowIso))) throw new Error("appendWithdrawals: nowIso required");
  if (!receipt?.date || !receipt?.publishedAt) throw new Error("appendWithdrawals: a frozen receipt (date, publishedAt) is required");
  const log = existing ?? { schemaVersion: 1, artifact: ARTIFACT, dataClass: "PUBLIC", date: receipt.date, receipt: { path: `results/top-boards/${receipt.date}.json`, publishedAt: receipt.publishedAt }, events: [] };
  if (log.date !== receipt.date || log.receipt?.publishedAt !== receipt.publishedAt) throw new Error(`appendWithdrawals: log for ${log.date} does not belong to the receipt for ${receipt.date}`);
  const events = [...log.events];
  for (const o of observations ?? []) {
    const k = ms(o.kickoffUtc);
    const at = ms(o.observedAt);
    if (!Number.isFinite(k) || !Number.isFinite(at) || at >= k) continue; // pre-kickoff evidence only — never hindsight
    if (at < ms(receipt.publishedAt)) continue;                         // nothing older than the publication itself
    const prev = [...events].reverse().find((e) => e.forecastId === o.forecastId) ?? null;
    if (prev && ms(prev.observedAt) > at) continue;                     // never let an older read overrule a newer one
    const blocked = !isCleared(o.participation);
    const status = blocked
      ? (prev?.status === WITHDRAWAL.WITHDRAWN ? null : WITHDRAWAL.WITHDRAWN)
      : (prev?.status === WITHDRAWAL.WITHDRAWN ? WITHDRAWAL.REINSTATED : null);
    if (!status) continue;
    events.push({
      forecastId: o.forecastId, playerId: o.playerId, name: o.name ?? null, providerEventId: o.providerEventId, kickoffUtc: o.kickoffUtc,
      status, reason: o.participation, source: o.source, observedAt: o.observedAt, effectiveAt: o.observedAt, recordedAt: nowIso,
    });
  }
  return { ...log, events };
}

/**
 * Refuse anything but an append. `prev` null means a new log. Every new event must be pre-kickoff evidence.
 * @returns {{ ok: boolean, reason: string | null }}
 */
export function verifyAppendOnly(prev, next) {
  if (!next || next.artifact !== ARTIFACT || !Array.isArray(next.events)) return { ok: false, reason: "not a withdrawal log" };
  if (prev) {
    if (prev.date !== next.date) return { ok: false, reason: "date changed" };
    if (JSON.stringify(prev.receipt) !== JSON.stringify(next.receipt)) return { ok: false, reason: "receipt reference changed" };
    if (next.events.length < prev.events.length) return { ok: false, reason: `events removed (${prev.events.length} → ${next.events.length})` };
    for (let i = 0; i < prev.events.length; i += 1) {
      if (JSON.stringify(prev.events[i]) !== JSON.stringify(next.events[i])) return { ok: false, reason: `event ${i} was edited or reordered` };
    }
  }
  for (const e of next.events.slice(prev?.events?.length ?? 0)) {
    if (!(ms(e.observedAt) < ms(e.kickoffUtc))) return { ok: false, reason: `${e.forecastId}: evidence ${e.observedAt} is not before kickoff ${e.kickoffUtc}` };
    if (e.status !== WITHDRAWAL.WITHDRAWN && e.status !== WITHDRAWAL.REINSTATED) return { ok: false, reason: `${e.forecastId}: unknown status ${e.status}` };
  }
  return { ok: true, reason: null };
}
