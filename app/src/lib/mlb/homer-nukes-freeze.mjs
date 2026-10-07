/**
 * HOMER NUKES · WRITE-ONCE PREGAME MEMBERSHIP (Stage 5D groundwork, Product Engine prep · not yet wired to a reader).
 *
 * The problem. build-homer-nukes.mjs runs several times a day and OVERWROTE public/data/mlb/homer-nukes/<date>.json
 * each time, and the settler grades whatever that file says at settlement. Nothing stopped a run after first pitch
 * from changing who is on the Top 5, so the public Top-5 record rested on membership that was not provably frozen
 * (roadmap §4: a Top-N record is valid only when membership and rank were frozen before the event). On Oct 4–6
 * every rewrite happened to land before first pitch, so this is a latent gap, not a live error.
 *
 * The rule (Stage 3 Q1 applied to a board): every build appends a REVISION to an append-only per-day log; the board
 * of record is the last revision. A revision is refused once any game involved has started — the earliest start
 * among the members of the current board of record AND of the new board. So once one pick's game begins, nobody can
 * be added, dropped, re-ranked or re-priced, and the started pick cannot be swapped out. A revision identical to the
 * board of record is not appended (no churn). Nothing is ever rewritten or deleted.
 *
 * Fail closed: a member with no parseable start makes the board unfreezable (refused), never "not started".
 *
 * Pure: no fs, no clock (`nowIso` is an argument).
 */

export const REVISION_LOG_SCHEMA = "mlb-homer-nukes-revisions@1";

export const REFUSAL = Object.freeze({
  NO_PICKS: "NO_PICKS",
  START_UNKNOWN: "START_UNKNOWN",
  STARTED: "STARTED",
  NOT_AFTER_LAST: "NOT_AFTER_LAST", // clock went backwards vs the last revision: refuse rather than reorder history
  DATE_MISMATCH: "DATE_MISMATCH",
});

/** The membership-and-rank content of a board: what a Top-5 record is about. */
export function membershipOf(board) {
  return (board?.picks ?? []).map((p, i) => ({
    rank: i + 1,
    playerId: p.playerId ?? null,
    player: p.player ?? null,
    teamAbbr: p.teamAbbr ?? null,
    gamePk: p.gamePk ?? null,
    gameDate: p.gameDate ?? null,
    probability: typeof p.probability === "number" ? p.probability : null,
  }));
}

const startMs = (m) => Date.parse(m?.gameDate ?? "");
const sameMembership = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** The board of record: the last appended revision, or null. */
export function boardOfRecord(log) {
  const r = log?.revisions ?? [];
  return r.length ? r[r.length - 1] : null;
}

/**
 * Try to append `board` (a build-homer-nukes artifact) as a new revision.
 * @returns {{ log: object, appended: boolean, reason: string|null }}  `log` is a NEW object; the input is untouched.
 */
export function appendRevision(log, board, nowIso) {
  const nowMs = Date.parse(nowIso ?? "");
  if (!Number.isFinite(nowMs)) throw new Error("appendRevision: nowIso must be a parseable instant");
  const date = board?.date ?? null;
  const base = log ?? { schema: REVISION_LOG_SCHEMA, artifact: "mlb-homer-nukes-revisions", date, revisions: [] };
  const refuse = (reason) => ({ log: base, appended: false, reason });
  if (base.date && date && base.date !== date) return refuse(REFUSAL.DATE_MISMATCH);

  const members = membershipOf(board);
  if (!members.length) return refuse(REFUSAL.NO_PICKS);
  const current = boardOfRecord(base);
  const involved = [...members, ...(current?.members ?? [])];
  const starts = involved.map(startMs);
  if (starts.some((s) => !Number.isFinite(s))) return refuse(REFUSAL.START_UNKNOWN);
  if (nowMs >= Math.min(...starts)) return refuse(REFUSAL.STARTED);
  if (current && !(nowMs > Date.parse(current.publishedAt))) return refuse(REFUSAL.NOT_AFTER_LAST);
  if (current && sameMembership(current.members, members)) return { log: base, appended: false, reason: null }; // identical: no churn

  const revision = {
    revision: (current?.revision ?? 0) + 1,
    publishedAt: new Date(nowMs).toISOString(),
    sourceGeneratedAt: board.generatedAt ?? null,
    modelId: board.model?.id ?? null,
    modelState: board.model?.state ?? null,
    firstPitchUtc: new Date(Math.min(...members.map(startMs))).toISOString(),
    members,
  };
  return { log: { ...base, revisions: [...base.revisions, revision] }, appended: true, reason: null };
}

/**
 * Read-time check for a settler or Results reader: was this day's board of record frozen before every member's
 * start? Returns problems (empty = provably frozen).
 */
export function verifyFrozen(log) {
  const p = [];
  const r = log?.revisions ?? [];
  if (!r.length) return ["no revisions: membership was never frozen"];
  r.forEach((rev, i) => {
    if (rev.revision !== i + 1) p.push(`revision ${i + 1} is numbered ${rev.revision}`);
    if (i && !(Date.parse(rev.publishedAt) > Date.parse(r[i - 1].publishedAt))) p.push(`revision ${rev.revision} is not after the one before`);
    // a revision may not replace a board one of whose games had already started
    for (const m of i ? r[i - 1].members ?? [] : []) {
      if (!(Date.parse(rev.publishedAt) < startMs(m))) p.push(`revision ${rev.revision} replaced ${m.player ?? m.playerId} after first pitch`);
    }
  });
  const last = r[r.length - 1];
  for (const m of last.members ?? []) {
    if (!(Date.parse(last.publishedAt) < startMs(m))) p.push(`${m.player ?? m.playerId}: board of record published at/after first pitch`);
  }
  return p;
}
