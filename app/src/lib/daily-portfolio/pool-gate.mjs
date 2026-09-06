/**
 * THE CONSUMER'S GATE ON ITS INPUT.
 *
 * Product generation is scheduled at 15:30 UTC. The team-market pool it reads was written at 16:50
 * on 2026-09-05 and 17:05 on 2026-09-06 — both AFTER the nominal generation time. Generation
 * produced cards on both days only because it was itself late: 17:29 and 17:39. The margin was
 * thirty-nine minutes, then thirty-four. Nothing enforced the order; two independent timers drifted
 * in the same direction twice.
 *
 * P237 made a bad draw VISIBLE — the lanes now say "missing input" rather than "no qualifying card".
 * Visible is not fixed. This is the gate that makes generation depend on its producer instead of on
 * a clock, and it deliberately checks more than whether a file exists:
 *
 *   · the artifact is FOR the date being generated (an old file must never satisfy today)
 *   · it is the sport and schema expected
 *   · its population is non-empty, or explicitly and validly empty
 *   · its own `generatedAt` is not older than the freshness bound
 *   · it carries the provenance fields the downstream selector relies on
 *
 * A producer run that goes green with an empty unintended output fails this. That is the point.
 */
import fs from "node:fs";
import path from "node:path";

/** Verdicts. A refusal is a handled condition with its own name — never "successful generation". */
export const GATE = Object.freeze({
  OK: "OK",
  INPUT_MISSING: "INPUT_MISSING",
  INPUT_WRONG_DATE: "INPUT_WRONG_DATE",
  INPUT_MALFORMED: "INPUT_MALFORMED",
  INPUT_EMPTY: "INPUT_EMPTY",
  INPUT_STALE: "INPUT_STALE",
});

/** How old the pool may be relative to the moment of generation. A slate priced a day ago is not
 *  today's market, and re-reading it would publish yesterday's prices under today's date. */
export const MAX_POOL_AGE_MS = 12 * 60 * 60 * 1000;

const REQUIRED_GAME_FIELDS = ["gameId", "homeTeam", "awayTeam", "commenceTime"];

/**
 * @param {object} o
 * @param {string} o.root  public/data
 * @param {string} o.date  the date being generated, YYYY-MM-DD
 * @param {string} o.nowIso the moment of generation — injected, never read from the wall here
 * @returns {{verdict: string, detail: string, games: number, generatedAt: string|null, ageMs: number|null}}
 */
export function checkTeamMarketPool({ root, date, nowIso }) {
  const file = path.join(root, "mlb", "team-markets", `${date}.json`);
  const rel = `mlb/team-markets/${date}.json`;

  let raw;
  try { raw = fs.readFileSync(file, "utf8"); }
  catch {
    return { verdict: GATE.INPUT_MISSING, games: 0, generatedAt: null, ageMs: null,
      detail: `${rel} has not been written — the producer has not completed for this date` };
  }

  let doc;
  try { doc = JSON.parse(raw); }
  catch (e) {
    return { verdict: GATE.INPUT_MALFORMED, games: 0, generatedAt: null, ageMs: null,
      detail: `${rel} is not readable JSON (${e.message}) — an unreadable file is not a priced slate` };
  }

  // FOR THIS DATE. A stale file from another day satisfying today's dependency is the exact failure
  // an existence check permits, and it would publish another day's prices under today's heading.
  if (doc?.date && doc.date !== date) {
    return { verdict: GATE.INPUT_WRONG_DATE, games: 0, generatedAt: doc.generatedAt ?? null, ageMs: null,
      detail: `${rel} carries date ${doc.date}, not ${date}` };
  }
  if (doc?.sport && String(doc.sport).toLowerCase() !== "mlb") {
    return { verdict: GATE.INPUT_MALFORMED, games: 0, generatedAt: doc.generatedAt ?? null, ageMs: null,
      detail: `${rel} carries sport ${doc.sport}` };
  }

  const rawGames = doc?.games;
  const list = Array.isArray(rawGames) ? rawGames : rawGames && typeof rawGames === "object" ? Object.values(rawGames) : null;
  if (list === null) {
    return { verdict: GATE.INPUT_MALFORMED, games: 0, generatedAt: doc?.generatedAt ?? null, ageMs: null,
      detail: `${rel} has no games collection` };
  }
  if (list.length === 0) {
    /* An empty slate is legitimate — an off day has no games — but it is NOT a pool, and generation
     * against it must report no play for the right reason rather than a missing input. */
    return { verdict: GATE.INPUT_EMPTY, games: 0, generatedAt: doc?.generatedAt ?? null, ageMs: null,
      detail: `${rel} is a valid slate with no games` };
  }

  // Provenance the selector depends on. A game missing its start time cannot be pre-event filtered,
  // and a pool that cannot be pre-event filtered can card a game already under way.
  const incomplete = list.filter((g) => REQUIRED_GAME_FIELDS.some((f) => g?.[f] == null));
  if (incomplete.length) {
    return { verdict: GATE.INPUT_MALFORMED, games: list.length, generatedAt: doc?.generatedAt ?? null, ageMs: null,
      detail: `${incomplete.length} of ${list.length} games are missing one of ${REQUIRED_GAME_FIELDS.join("/")}` };
  }

  const gen = doc?.generatedAt ?? null;
  const genMs = gen ? Date.parse(gen) : NaN;
  const nowMs = Date.parse(nowIso);
  if (!Number.isFinite(genMs)) {
    return { verdict: GATE.INPUT_MALFORMED, games: list.length, generatedAt: gen, ageMs: null,
      detail: `${rel} carries no usable generatedAt — its age cannot be established` };
  }
  const ageMs = nowMs - genMs;
  if (ageMs > MAX_POOL_AGE_MS) {
    return { verdict: GATE.INPUT_STALE, games: list.length, generatedAt: gen, ageMs,
      detail: `${rel} was written ${Math.round(ageMs / 3600000)}h ago, beyond the ${MAX_POOL_AGE_MS / 3600000}h bound` };
  }

  return { verdict: GATE.OK, games: list.length, generatedAt: gen, ageMs,
    detail: `${list.length} games priced ${Math.round(ageMs / 60000)} minutes ago` };
}

/** Shell exit codes, so a workflow can branch on the KIND of refusal rather than on stdout. */
export const EXIT = Object.freeze({
  [GATE.OK]: 0,
  [GATE.INPUT_EMPTY]: 0,        // a valid empty slate — generation proceeds and reports no play
  [GATE.INPUT_MISSING]: 20,
  [GATE.INPUT_WRONG_DATE]: 21,
  [GATE.INPUT_MALFORMED]: 22,
  [GATE.INPUT_STALE]: 23,
});
