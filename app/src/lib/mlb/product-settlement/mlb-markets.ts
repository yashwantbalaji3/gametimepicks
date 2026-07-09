/**
 * MLB PRODUCT SETTLEMENT RULES — pure, side-effect-free grading for MLB product-card markets.
 *
 * This module is the settlement LOGIC only: given final scores / box-score stats it returns a
 * normalized outcome. It reads no artifacts, fetches nothing, and never touches money. It is the
 * building block for a SEPARATE MLB product-settlement ledger — it must never be wired into the
 * official 19-14 money record.
 *
 * Player-prop semantics MATCH the existing pipeline grader (pipeline/mlb/settle_mlb_results.py `_grade`):
 *   actual > line → Over wins / Under loses ;  actual < line → Under wins / Over loses ;  == line → push.
 * H+R+RBI = hits + runs + rbi. Team-market rules (moneyline / run line / total / team total) are the
 * standard sportsbook rules.
 *
 * Honesty rules (mirrors the mission's hard rules):
 *   • Equal to the line is a PUSH, never a loss.
 *   • A missing final score/stat is PENDING (or UNAVAILABLE), never a loss.
 *   • A postponed/cancelled/tied-and-not-final game is PENDING, never a loss.
 *   • "Did not play" is UNAVAILABLE (distinct from "stat missing" / "game not final").
 */

export type SettlementStatus = "win" | "loss" | "push" | "pending" | "unavailable";

export interface SettlementOutcome {
  status: SettlementStatus;
  /** The settled number (total runs / stat / margin) when known. */
  actual?: number;
  line?: number;
  reason: string;
}

const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
export type OverUnderSide = "over" | "under";
export type TeamSide = "home" | "away";

/**
 * Core over/under grader shared by every total/prop market. A missing line is UNAVAILABLE; a missing
 * actual is PENDING (never a loss); equal to the line is a PUSH.
 */
export function settleOverUnder(actual: number | null | undefined, side: OverUnderSide, line: number | null | undefined, pendingReason = "final stat not available"): SettlementOutcome {
  if (!isNum(line)) return { status: "unavailable", reason: "no line provided" };
  if (!isNum(actual)) return { status: "pending", line, reason: pendingReason };
  if (actual > line) return { status: side === "over" ? "win" : "loss", actual, line, reason: `${actual} > ${line}` };
  if (actual < line) return { status: side === "under" ? "win" : "loss", actual, line, reason: `${actual} < ${line}` };
  return { status: "push", actual, line, reason: `${actual} == ${line} (push)` };
}

/** Shared player-prop guard: DNP ⇒ unavailable; game-not-final ⇒ pending; else defer to over/under. */
function settleProp(actual: number | null | undefined, side: OverUnderSide, line: number | null | undefined, ctx?: { participated?: boolean; gameFinal?: boolean }): SettlementOutcome {
  if (ctx?.participated === false) return { status: "unavailable", reason: "player did not play" };
  if (ctx?.gameFinal === false) return { status: "pending", line: isNum(line) ? line : undefined, reason: "game not final" };
  return settleOverUnder(actual, side, line);
}

// ── Team markets ──

/** Moneyline: the higher final score wins. Missing/equal-and-not-final ⇒ pending (MLB has no ties). */
export function settleMlbMoneyline(input: { homeScore?: number | null; awayScore?: number | null; selectedTeam: TeamSide; gameFinal?: boolean }): SettlementOutcome {
  const { homeScore, awayScore, selectedTeam } = input;
  if (input.gameFinal === false) return { status: "pending", reason: "game not final" };
  if (!isNum(homeScore) || !isNum(awayScore)) return { status: "pending", reason: "final score not available" };
  if (homeScore === awayScore) return { status: "pending", reason: "scores equal — game not final (MLB has no ties)" };
  const winner: TeamSide = homeScore > awayScore ? "home" : "away";
  return { status: selectedTeam === winner ? "win" : "loss", actual: homeScore > awayScore ? homeScore - awayScore : awayScore - homeScore, reason: `${winner} won ${Math.max(homeScore, awayScore)}-${Math.min(homeScore, awayScore)}` };
}

/** Run line: the selected team's margin adjusted by its line. margin+line > 0 win, < 0 loss, == 0 push. */
export function settleMlbRunLine(input: { homeScore?: number | null; awayScore?: number | null; selectedTeam: TeamSide; line?: number | null; gameFinal?: boolean }): SettlementOutcome {
  const { homeScore, awayScore, selectedTeam, line } = input;
  if (input.gameFinal === false) return { status: "pending", line: isNum(line) ? line : undefined, reason: "game not final" };
  if (!isNum(line)) return { status: "unavailable", reason: "no line provided" };
  if (!isNum(homeScore) || !isNum(awayScore)) return { status: "pending", line, reason: "final score not available" };
  const selfScore = selectedTeam === "home" ? homeScore : awayScore;
  const oppScore = selectedTeam === "home" ? awayScore : homeScore;
  const adjusted = selfScore - oppScore + line;
  const status: SettlementStatus = adjusted > 0 ? "win" : adjusted < 0 ? "loss" : "push";
  return { status, actual: selfScore - oppScore, line, reason: `${selectedTeam} margin ${selfScore - oppScore} ${line >= 0 ? "+" : ""}${line} = ${adjusted}` };
}

/** Game total: over/under on home+away runs. */
export function settleMlbTotal(input: { homeScore?: number | null; awayScore?: number | null; side: OverUnderSide; line?: number | null; gameFinal?: boolean }): SettlementOutcome {
  const { homeScore, awayScore, side, line } = input;
  if (input.gameFinal === false) return { status: "pending", line: isNum(line) ? line : undefined, reason: "game not final" };
  if (!isNum(homeScore) || !isNum(awayScore)) return { status: "pending", line: isNum(line) ? line : undefined, reason: "final score not available" };
  return settleOverUnder(homeScore + awayScore, side, line, "game not final");
}

/** Team total: over/under on one team's runs. */
export function settleMlbTeamTotal(input: { teamScore?: number | null; side: OverUnderSide; line?: number | null; gameFinal?: boolean }): SettlementOutcome {
  if (input.gameFinal === false) return { status: "pending", line: isNum(input.line) ? input.line : undefined, reason: "game not final" };
  return settleOverUnder(input.teamScore, input.side, input.line, "final score not available");
}

// ── Player props (box-score stats) ──

export function settleMlbPitcherStrikeouts(input: { actualStrikeouts?: number | null; side: OverUnderSide; line?: number | null; participated?: boolean; gameFinal?: boolean }): SettlementOutcome {
  return settleProp(input.actualStrikeouts, input.side, input.line, input);
}

export function settleMlbBatterHits(input: { actualHits?: number | null; side: OverUnderSide; line?: number | null; participated?: boolean; gameFinal?: boolean }): SettlementOutcome {
  return settleProp(input.actualHits, input.side, input.line, input);
}

export function settleMlbTotalBases(input: { actualTotalBases?: number | null; side: OverUnderSide; line?: number | null; participated?: boolean; gameFinal?: boolean }): SettlementOutcome {
  return settleProp(input.actualTotalBases, input.side, input.line, input);
}

/** H+R+RBI: settle on hits + runs + rbi; any missing component ⇒ pending (never a partial guess). */
export function settleMlbHrrbi(input: { hits?: number | null; runs?: number | null; rbi?: number | null; side: OverUnderSide; line?: number | null; participated?: boolean; gameFinal?: boolean }): SettlementOutcome {
  if (input.participated === false) return { status: "unavailable", reason: "player did not play" };
  if (input.gameFinal === false) return { status: "pending", line: isNum(input.line) ? input.line : undefined, reason: "game not final" };
  const { hits, runs, rbi } = input;
  if (!isNum(hits) || !isNum(runs) || !isNum(rbi)) return { status: "pending", line: isNum(input.line) ? input.line : undefined, reason: "a H/R/RBI component is missing — never a partial settle" };
  return settleOverUnder(hits + runs + rbi, input.side, input.line);
}

/** Market keys this module can settle — the single source of truth for settlement support. */
export const SETTLEABLE_MLB_MARKETS = new Set([
  "moneyline", "run_line", "total", "team_totals",
  "pitcher_strikeouts", "batter_hits", "batter_total_bases", "batter_hits_runs_rbis",
]);

/** True when a settlement rule exists for this MLB market key. */
export function isMlbMarketSettleable(marketKey: string): boolean {
  return SETTLEABLE_MLB_MARKETS.has(marketKey);
}
