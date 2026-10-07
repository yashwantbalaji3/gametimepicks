/**
 * Stage 3C — historical NFL game-winner semantics on the forecast-of-record contract (forecast-of-record.mjs).
 *
 * WHY. NFL game forecasts froze both teams' win chances plus a tie chance, and no side: e.g. CIN @ PIT froze PIT
 * 49.63%, CIN 47.47%, tie 2.90%. Readers then worked a side out after the fact with "P(home) > 0.5 else away", which
 * names the team we gave the LOWER chance whenever tie mass pushes both teams under 50% (CIN @ PIT graded CIN, a loss;
 * LAR @ PHI graded LAR, a win). The week report used "home >= away", so the readers disagreed on those two games.
 *
 * THE RULE (founder Q4 = HIGHER, 2026-10-06 22:22Z). A winner forecast with frozen team win probabilities and no
 * frozen published side is graded on the MODEL-FAVORED team: the team with the higher frozen win probability. Tie
 * mass is not a team and is ignored; an exact tie between the teams gives no side (NO_PICK, never HOME). The side is
 * read from the frozen receipt only, never from the result. It is shown as "historical model-favored winner
 * accuracy", never as a published "our pick". The old "P(home) > 0.5 else away" rule is not approved.
 * A tie GAME (no winner) is VOID: never a loss.
 *
 * APPEND-ONLY CORRECTION. The receipts and the settler's dated grade files are never rewritten. The two games whose
 * stored grade used the old rule are restated by a committed correction log (data/internal/nfl/winner-corrections/
 * *.json, write-once files, one per correction run) naming each game, its frozen probabilities, the stored grade
 * (before), the restated grade (after), the rule and the founder decision. winnerOfRecord() refuses a stored grade
 * that disagrees with the rule unless the log restates it, and refuses a log entry the rule does not reproduce: no
 * reader can silently use either rule.
 *
 * Pure: no fs. Callers read files and pass parsed objects in.
 */
import {
  HISTORICAL_MODEL_FAVORED_LABEL, OUTCOME, SIDE_BASIS, outcomeOf, sideOf,
} from "./forecast-of-record.mjs";

export const NFL_SPORT = "NFL";
export const NFL_WINNER_FAMILY = "nfl_game_winner";
export { HISTORICAL_MODEL_FAVORED_LABEL };

/** The ledger's directional basis for a Q4-graded winner row (replaces the misnamed HIGHER_WIN_PROBABILITY_SIDE). */
export const NFL_WINNER_BASIS = SIDE_BASIS.HISTORICAL_MODEL_FAVORED;

export const NFL_MODEL_FAVORED_RULE =
  "historical model-favored winner: the team with the higher frozen win probability (tie mass ignored; an exact tie is no side); a tie game is void";

/** The rule the settler used before Stage 3C, named in every correction entry (never applied any more). */
export const SUPERSEDED_RULE = "P(home) > 0.5 else away";

/** Founder decision the correction log cites. */
export const DECISION_REF = Object.freeze({
  decision: "Q4 HIGHER",
  by: "Yash",
  at: "2026-10-06T22:22:19Z",
  message: "cmsg_018esqVkc9tL9hjPpUhCNowmPMre9wy1wG2rPfVjB5jrGL",
});

/** Where correction logs live, relative to the repo root. */
export const CORRECTIONS_DIR = "data/internal/nfl/winner-corrections";
export const CORRECTION_SCHEMA = "nfl-winner-correction@1";

const isProb = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;

/** A frozen receipt's winProbability → the contract's sideProbabilities. Missing stays missing. */
function sideProbabilities(wp) {
  if (!wp || !isProb(wp.home) || !isProb(wp.away)) return null;
  return { HOME: wp.home, AWAY: wp.away, ...(isProb(wp.tieMass) ? { TIE: wp.tieMass } : {}) };
}

/**
 * One NFL winner forecast → CanonicalForecast. `publishedSide` is the 3D seam: a receipt that froze a side (or
 * TOO_CLOSE) is graded on it; without one, the Q4 historical model-favored basis applies.
 * @param {{ providerEventId: string|number, canonicalEventId?: string|null, winProbability: object,
 *           publishedSide?: string|null, actual?: { home: number, away: number }|null, receiptId?: string|null,
 *           publishedAt?: string|null, kickoffUtc?: string|null }} a
 */
export function nflWinnerForecast({ providerEventId, canonicalEventId = null, winProbability, publishedSide = null, actual = null, receiptId = null, publishedAt = null, kickoffUtc = null }) {
  const settled = actual != null && Number.isInteger(actual.home) && Number.isInteger(actual.away);
  const id = providerEventId == null ? null : String(providerEventId);
  return {
    sport: NFL_SPORT,
    eventId: id,
    subjectType: "GAME",
    subjectId: canonicalEventId ?? (id != null ? `nfl-${id}` : null),
    family: NFL_WINNER_FAMILY,
    line: null,
    publishedAt,
    canonicalStart: kickoffUtc,
    receiptId,
    frozenSide: typeof publishedSide === "string" && publishedSide ? publishedSide : null,
    sideBasis: typeof publishedSide === "string" && publishedSide ? null : SIDE_BASIS.HISTORICAL_MODEL_FAVORED,
    sideProbabilities: sideProbabilities(winProbability),
    state: settled ? "SETTLED" : "PENDING",
    finalSide: settled ? (actual.home > actual.away ? "HOME" : actual.home < actual.away ? "AWAY" : "TIE") : null,
  };
}

/** The model-favored side of a frozen winProbability ({ side: "HOME" | "AWAY" | null, basis }). */
export function nflModelFavored(winProbability) {
  return sideOf(nflWinnerForecast({ providerEventId: "x", winProbability }));
}

/**
 * The settler's `grade.winner` block under the rule (same shape the dated files carry, plus `sideBasis` and `rule`).
 * `modelFavoured` keeps its historical spelling; "EVEN" is an exact tie between the teams (no side).
 */
export function nflWinnerGrade({ winProbability, actual, publishedSide = null }) {
  const f = nflWinnerForecast({ providerEventId: "x", winProbability, actual, publishedSide });
  const { side, basis } = sideOf(f);
  const o = outcomeOf(f);
  if (f.finalSide === "TIE") return { outcome: "TIE", correct: null, note: "a tie has no winner side; excluded from the decisive denominator" };
  return {
    outcome: f.finalSide,
    modelFavoured: side ?? "EVEN",
    correct: o === OUTCOME.WIN ? true : o === OUTCOME.LOSS ? false : null,
    sideBasis: basis,
    rule: basis === SIDE_BASIS.HISTORICAL_MODEL_FAVORED ? NFL_MODEL_FAVORED_RULE : null,
  };
}

const sameWinner = (a, b) => (a?.modelFavoured ?? null) === (b?.modelFavoured ?? null) && (a?.correct ?? null) === (b?.correct ?? null);

/**
 * Index committed correction logs: providerEventId → entry. Files are write-once and read in name order; the same
 * game restated twice must agree, or the logs are refused.
 * @param {Array<{ file: string, doc: object }>} logs
 */
export function indexCorrections(logs) {
  const out = new Map();
  for (const { file, doc } of [...(logs ?? [])].sort((a, b) => String(a.file).localeCompare(String(b.file)))) {
    if (doc?.schemaVersion !== CORRECTION_SCHEMA) throw new Error(`nfl winner corrections: ${file} is not ${CORRECTION_SCHEMA}`);
    for (const e of doc.entries ?? []) {
      const id = String(e?.providerEventId ?? "");
      if (!id) throw new Error(`nfl winner corrections: ${file} has an entry without providerEventId`);
      const prev = out.get(id);
      if (prev && !sameWinner(prev.after, e.after)) throw new Error(`nfl winner corrections: ${id} restated differently in ${prev.file} and ${file}`);
      if (!prev) out.set(id, { ...e, file, correctionId: doc.correctionId });
    }
  }
  return out;
}

/**
 * The winner grade of record for one settled event: the stored grade when it already follows the rule, else the
 * restated grade from the correction log. Throws when the stored grade breaks the rule with no restatement, or when
 * a restatement does not match the rule (fail closed: no reader may carry either rule silently).
 * @param {object} event   a settler event (grade.winner, grade.actual)
 * @param {object} receipt the frozen receipt it graded (forecastSummary.winProbability)
 * @param {Map<string, object>} corrections  indexCorrections() output
 * @returns {{ winner: object, correction: object|null }}
 */
export function winnerOfRecord(event, receipt, corrections = new Map()) {
  const stored = event?.grade?.winner ?? null;
  const actual = event?.grade?.actual ?? null;
  const wp = receipt?.forecastSummary?.winProbability ?? null;
  const id = String(event?.providerEventId ?? "");
  const entry = corrections.get(id) ?? null;
  if (!wp) {
    if (entry) throw new Error(`nfl winner: ${id} has a correction but no frozen receipt to check it against`);
    return { winner: stored, correction: null }; // no frozen probabilities: nothing to restate (missing stays missing)
  }
  const ruled = nflWinnerGrade({ winProbability: wp, actual, publishedSide: receipt?.publishedSide ?? null });
  if (ruled.outcome === "TIE") return { winner: stored ?? ruled, correction: null };
  if (sameWinner(stored, ruled)) {
    if (entry) throw new Error(`nfl winner: ${id} is listed in ${entry.file} but its stored grade already follows the rule`);
    return { winner: { ...stored, sideBasis: ruled.sideBasis, rule: ruled.rule }, correction: null };
  }
  if (!entry) throw new Error(`nfl winner: ${id} stored grade ${JSON.stringify({ modelFavoured: stored?.modelFavoured, correct: stored?.correct })} breaks the rule (${JSON.stringify({ modelFavoured: ruled.modelFavoured, correct: ruled.correct })}) and no correction restates it`);
  if (!sameWinner(entry.after, ruled)) throw new Error(`nfl winner: ${id} correction in ${entry.file} does not reproduce the rule`);
  return { winner: { ...stored, ...ruled }, correction: { correctionId: entry.correctionId, file: entry.file, before: entry.before } };
}

/**
 * The entries a NEW correction log must hold: every settled event whose stored grade breaks the rule and that no
 * committed log restates yet. Used by scripts/results/nfl-winner-corrections.mjs.
 * @param {Array<{ event: object, receipt: object, gradedIn: string }>} graded
 */
export function pendingCorrections(graded, corrections = new Map()) {
  const out = [];
  for (const { event, receipt, gradedIn } of graded ?? []) {
    const wp = receipt?.forecastSummary?.winProbability ?? null;
    if (!wp) continue;
    const ruled = nflWinnerGrade({ winProbability: wp, actual: event?.grade?.actual ?? null, publishedSide: receipt?.publishedSide ?? null });
    const stored = event?.grade?.winner ?? null;
    if (ruled.outcome === "TIE" || sameWinner(stored, ruled) || corrections.has(String(event.providerEventId))) continue;
    out.push({
      providerEventId: String(event.providerEventId),
      canonicalEventId: event.canonicalEventId ?? null,
      matchup: event.matchup ?? null,
      kickoffUtc: event.kickoffUtc ?? null,
      gradedIn,
      receiptFile: event.lineage?.receiptFile ?? null,
      frozenWinProbability: { home: wp.home, away: wp.away, tieMass: wp.tieMass ?? null },
      finalScore: { home: event.grade?.actual?.home ?? null, away: event.grade?.actual?.away ?? null },
      before: { modelFavoured: stored?.modelFavoured ?? null, correct: stored?.correct ?? null, rule: SUPERSEDED_RULE },
      after: { modelFavoured: ruled.modelFavoured, correct: ruled.correct, rule: NFL_MODEL_FAVORED_RULE },
    });
  }
  return out.sort((a, b) => a.providerEventId.localeCompare(b.providerEventId));
}
