/**
 * PUBLICATION-SLO CLASSIFIER — the six states the public surfaces must be able to tell apart.
 *
 * Pure and dependency-free on purpose. The runner (app/scripts/ops/publication-slo.mjs) does the
 * network, the filesystem and the clock; this file does the judgement, so the guards can drive
 * every state without any of the three.
 *
 * See the runner's header for why this exists at all — the short version is that on 2026-08-27 the
 * site had no way to distinguish "not published yet" at 6 AM from "not published yet" at 2 PM, and
 * the day the generation chain silently received no scheduled events, it said the healthy thing.
 */
/**
 * The five states the public surfaces must be able to tell apart. Pure — every input is passed in,
 * so the guards can drive it without a clock, a network or a filesystem.
 *
 *   PUBLISHED   — a real board exists for the date.
 *   NO_EVENT    — the schedule is known and empty. A quiet day, not an incident.
 *   PUBLISHING  — no board yet, and the deadline has not passed. The normal morning state.
 *   INPUT_GATED — a board exists but is a typed pending shell (no market, no key, cost floor…).
 *   INCIDENT    — no board and the deadline has passed. Something that should have run did not.
 *   UNKNOWN     — the schedule could not be established. Never green.
 */
export function classify({ games, board, nowMs: at, leadMinutes }) {
  if (board?.present && board.leans > 0) {
    return { state: "PUBLISHED", reason: `board published with ${board.leans} rows`, deadlineUtc: null };
  }
  if (games === null) {
    return {
      state: "UNKNOWN",
      reason: "the day's schedule could not be established from any source — this is not evidence of an empty day",
      deadlineUtc: null,
    };
  }
  if (games.length === 0) {
    return { state: "NO_EVENT", reason: "no games are scheduled for this date", deadlineUtc: null };
  }

  const startTimes = games.map((g) => Date.parse(g.startUtc)).filter(Number.isFinite);
  // An unreadable start time cannot set a deadline, and refusing to guess one is the point: the
  // deadline is a claim about the schedule, so it is made only from starts we could actually read.
  const earliest = startTimes.length ? Math.min(...startTimes) : null;
  const deadline = earliest === null ? null : earliest - leadMinutes * 60_000;
  const deadlineUtc = deadline === null ? null : new Date(deadline).toISOString();

  if (board?.present) {
    return {
      state: "INPUT_GATED",
      reason: `a board exists for the date but carries no rows${board.pendingReason ? ` — ${board.pendingReason}` : ""}`,
      deadlineUtc,
    };
  }
  if (deadline === null) {
    return {
      state: "UNKNOWN",
      reason: `${games.length} game(s) are scheduled but none carries a readable start time, so no deadline can be derived`,
      deadlineUtc: null,
    };
  }
  if (at < deadline) {
    return {
      state: "PUBLISHING",
      reason: `today's slate is not published yet and is not late — the deadline is ${deadlineUtc}`,
      deadlineUtc,
    };
  }
  return {
    state: "INCIDENT",
    reason:
      `no board exists for ${games.length} scheduled game(s) and the publication deadline (${deadlineUtc}, ` +
      `${leadMinutes} min before the first start) has passed`,
    deadlineUtc,
  };
}

