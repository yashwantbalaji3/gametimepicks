/**
 * NBA box-score LINE READER — the one stat extraction every NBA grader uses. PURE, client-safe, no imports.
 *
 * Two graders read a player's line from the same stored box score (`boxscore-parse.mjs` shape):
 *   - Top Board grading (`top-board-grading.mjs`): projection accuracy against the frozen board row.
 *   - Player-prop grading (`prop-settlement.mjs`): OVER/UNDER against a recorded line.
 * Both call these three functions, so they cannot disagree on which row is the player's, on whether he
 * played, or on what his stat was. Each grader then applies its own rules to the measurement.
 *
 * Rules (inherited from the parser, not re-decided here):
 *   - A box score counts only when it is FINAL and holds player rows.
 *   - The player is matched by provider athlete id, compared as a string. Never by name.
 *   - `didNotPlay` is DNP, whatever the stats say.
 *   - A stat or minutes value that is not an integer is not a measurement. It is never read as 0.
 */

/** The measurement states a line can be in. */
export const LINE_STATE = Object.freeze({
  MEASURED: "MEASURED",
  NOT_IN_BOXSCORE: "NOT_IN_BOXSCORE",
  DNP: "DNP",
  NULL_ACTUAL: "NULL_ACTUAL",
});

/** True when the box-score document is FINAL and holds player rows. */
export function isFinalBoxscore(doc) {
  return Boolean(doc?.boxscoreAvailable) && /FINAL/.test(String(doc?.status ?? ""));
}

/** The athlete's row in a box-score document, matched by provider athlete id as a string, or null. */
export function boxscoreAthlete(doc, providerAthleteId) {
  const id = String(providerAthleteId);
  return (doc?.players ?? []).find((p) => String(p.providerAthleteId) === id) ?? null;
}

/**
 * Read `stats` from one athlete row. Returns a new object and never modifies the row.
 *   NOT_IN_BOXSCORE  no row
 *   DNP              the row is flagged didNotPlay
 *   NULL_ACTUAL      minutes or any requested stat is not an integer (raw values are echoed for the reason text)
 *   MEASURED         minutes and every requested stat are integers
 *
 * @param {object|null} athlete a row from `boxscoreAthlete`
 * @param {string[]} stats      box-score stat keys (pts, reb, ast, threePm, ...)
 */
export function measureAthlete(athlete, stats) {
  if (!athlete) return { state: LINE_STATE.NOT_IN_BOXSCORE, minutes: null, values: null, dnpReason: null };
  if (athlete.didNotPlay) return { state: LINE_STATE.DNP, minutes: null, values: null, dnpReason: athlete.dnpReason ?? null };
  const values = {};
  for (const s of stats) values[s] = athlete[s];
  const integral = Number.isInteger(athlete.minutes) && stats.every((s) => Number.isInteger(values[s]));
  return { state: integral ? LINE_STATE.MEASURED : LINE_STATE.NULL_ACTUAL, minutes: athlete.minutes ?? null, values, dnpReason: null };
}
