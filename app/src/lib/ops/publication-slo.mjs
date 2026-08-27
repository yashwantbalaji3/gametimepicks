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


/* ── PER-SPORT LATENESS ───────────────────────────────────────────────────────────────────────── */

/**
 * The same judgement, generalised over any sport's forward horizon.
 *
 * WHY IT HAD TO GENERALISE. The 2026-08-27 dropped-event band did not only take MLB. NFL's 14:30
 * and 15:00 UTC slots went with it — sixteen preseason Week-4 games across the next 48 hours, the
 * first kicking off that evening, against an index still describing a game played four days
 * earlier. UFC's Thursday 11:00 UTC priced slot went too, two days before a thirteen-bout card.
 * Three sports, and the only reason any of it was known is that someone opened three artifacts by
 * hand. A detector that watches one sport reports one third of an outage.
 *
 * The unit differs per sport — MLB a day, NFL a window, UFC a card, EPL a matchweek — but the
 * question does not: is there an event coming that has no forecast, and is it late by its own
 * schedule? So the horizon is supplied by the caller and the judgement lives here.
 *
 * @param {object} args
 * @param {Array}  args.events       `[{ id, startUtc, label }]` — the sport's forward horizon
 * @param {Set}    args.published    ids that have a published pre-event forecast
 * @param {number} args.nowMs
 * @param {number} args.leadMinutes  how far before the earliest start the forecast must exist
 */
export function classifySport({ events, published, nowMs, leadMinutes }) {
  if (!Array.isArray(events)) {
    return {
      state: "UNKNOWN",
      reason: "this sport's forward horizon could not be established — not evidence that it is empty",
      deadlineUtc: null,
      counts: { scheduled: null, published: null, missedCoverage: null, awaiting: null },
    };
  }

  const at = (e) => Date.parse(e.startUtc);
  const started = (e) => { const t = at(e); return !Number.isFinite(t) || t <= nowMs; };
  const has = (e) => published.has(e.id);

  // A started event with no forecast can never gain one. It is not "awaiting" anything; it is a
  // permanent hole in the coverage, and it stays counted so the horizon is never reported as whole.
  const missed = events.filter((e) => started(e) && !has(e));
  const awaiting = events.filter((e) => !started(e) && !has(e));
  const counts = {
    scheduled: events.length,
    published: events.filter(has).length,
    missedCoverage: missed.length,
    awaiting: awaiting.length,
  };

  if (!events.length) {
    return { state: "NO_EVENT", reason: "no events in this sport's forward horizon", deadlineUtc: null, counts };
  }

  // The deadline belongs to the earliest event still WAITING for a forecast. An event already
  // published sets no deadline, and one already started is past every deadline it ever had.
  const nextStarts = awaiting.map(at).filter(Number.isFinite);
  const deadline = nextStarts.length ? Math.min(...nextStarts) - leadMinutes * 60_000 : null;
  const deadlineUtc = deadline === null ? null : new Date(deadline).toISOString();

  if (!awaiting.length) {
    return missed.length
      ? {
          state: "MISSED_COVERAGE",
          reason: `${missed.length} of ${events.length} event(s) started with no pre-event forecast; nothing is still pending`,
          deadlineUtc: null,
          counts,
          missed: missed.map((e) => ({ id: e.id, label: e.label ?? null, startUtc: e.startUtc ?? null })),
        }
      : { state: "PUBLISHED", reason: `all ${events.length} event(s) in the horizon carry a forecast`, deadlineUtc: null, counts };
  }

  if (deadline !== null && nowMs >= deadline) {
    return {
      state: "INCIDENT",
      reason:
        `${awaiting.length} event(s) have no forecast and the earliest one's deadline (${deadlineUtc}, ` +
        `${leadMinutes} min before its start) has passed`,
      deadlineUtc,
      counts,
      missed: missed.map((e) => ({ id: e.id, label: e.label ?? null, startUtc: e.startUtc ?? null })),
    };
  }

  return {
    state: "PUBLISHING",
    reason: `${awaiting.length} event(s) still awaiting a forecast, none of them late yet`,
    deadlineUtc,
    counts,
    missed: missed.map((e) => ({ id: e.id, label: e.label ?? null, startUtc: e.startUtc ?? null })),
  };
}

/**
 * Worst-of across sports. A single late sport makes the platform late — averaging or majority-voting
 * a fleet of pipelines is how three-quarters-broken reads as mostly fine.
 */
export const SPORT_STATE_SEVERITY = ["PUBLISHED", "NO_EVENT", "PUBLISHING", "MISSED_COVERAGE", "INCIDENT", "UNKNOWN"];

export function worstOf(states) {
  let worst = "PUBLISHED";
  for (const s of states) {
    if (SPORT_STATE_SEVERITY.indexOf(s) > SPORT_STATE_SEVERITY.indexOf(worst)) worst = s;
  }
  return worst;
}
