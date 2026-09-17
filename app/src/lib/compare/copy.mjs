/**
 * COMPARE COPY (v1.4 · §49 §76–§78) — the ONLY user-facing words for blocker codes and family coverage notes.
 *
 * Plain English, descriptive. Never a provider or file name, never "all-time", and never an evaluative word about a
 * side (winner, better, edge, advantage, stronger, best, hotter) — pinned by compare-projection.test.mjs CX1.
 *
 * Pure: no filesystem, no clock.
 */
import { BLOCKER } from "./contract.mjs";

/** @type {Record<string, (ctx: { kind: "team"|"player", sportName: string }) => string>} */
export const BLOCKER_COPY = Object.freeze({
  [BLOCKER.DIFFERENT_SPORT]: ({ kind }) => `These ${kind}s are from different sports. Compare works within one sport only.`,
  [BLOCKER.SAME_ENTITY]: ({ kind }) => `Both sides are the same ${kind}. Choose a different ${kind} for one side.`,
  [BLOCKER.SPORT_NOT_SUPPORTED]: ({ kind, sportName }) => `${sportName} ${kind} comparison is not available in GameTimePicks data.`,
  [BLOCKER.TEAM_RESULTS_UNSUPPORTED]: ({ sportName }) => `${sportName} final results are not yet an ID-based fact in GameTimePicks data, so no record, score or meeting can be compared.`,
  [BLOCKER.ENTITY_NOT_PUBLISHED]: ({ kind }) => `This link names a ${kind} that does not have a GameTimePicks research page. Choose from the list instead.`,
  [BLOCKER.NO_SHARED_SEASON]: ({ kind }) => `These ${kind}s have no season in which both have recorded games for this comparison.`,
  [BLOCKER.NO_SHARED_STAT]: () => "These players do not currently share a comparable factual stat family in GameTimePicks data.",
  [BLOCKER.STAT_NOT_SHARED]: () => "The stat in this link is not recorded for both players. Choose one of the stats they share.",
  [BLOCKER.SEASON_NOT_SHARED]: ({ kind }) => `The season in this link is not one both ${kind}s recorded. Choose a shared season.`,
  [BLOCKER.INSUFFICIENT_RECORDED_GAMES]: () => "There are not enough recorded games to compare.",
});

/** Unknown codes throw: a missing explanation must never render as nothing. */
export function blockerText(code, ctx) {
  const f = BLOCKER_COPY[code];
  if (!f) throw new Error(`compare copy: unknown blocker ${code}`);
  return f(ctx);
}

export const FAMILY_COVERAGE_COPY = Object.freeze({
  MLB_CAPTURED_ONLY: "MLB values come only from games where GameTimePicks captured this category. This is not a complete box-score history, so the two players' game counts can differ for reasons other than games played.",
  NFL_ESPN_LINES_2023_ON: "This stat is recorded in game lines from 2023 onward. Earlier games show it as not recorded, never as zero.",
});

export function familyCoverageText(code) {
  if (code == null) return null;
  const t = FAMILY_COVERAGE_COPY[code];
  if (!t) throw new Error(`compare copy: unknown family coverage ${code}`);
  return t;
}

export const SPORT_NAME = Object.freeze({ MLB: "MLB", NFL: "NFL", EPL: "Premier League", UFC: "UFC" });

/** "2025" for NFL-2025, "2025-26" for EPL-2025-26 — the canonical id's own label, never a guess. */
export const seasonLabel = (id) => String(id ?? "").replace(/^[A-Z]+-/, "");
