/**
 * The run-line row of the full-game report's Overview "Our simulation vs Market snapshot" table
 * (TRUTH-001, 2026-10-09).
 *
 * THE DEFECT. The row was labelled "<HOME> −1.5 cover" and paired the simulation's P(home wins by 2+)
 * with `market.runLine.homeCover`, the book's no-vig probability that home covers at the line the book
 * POSTED. `market.runLine.line` is that line, SIGNED for the home side (team-markets `runLine.line` =
 * `runLine.home.line`): −1.5 when home lays, +1.5 when home receives, and occasionally an alternate
 * (±2.5, +3.5, +4.5). On every game where home received +1.5 (372 of 816 committed market blocks) the
 * row compared −1.5 against +1.5 — e.g. 2026-10-06 LAD @ ATL showed "ATL −1.5 cover: ours 26% · market
 * 65%", a false 38-point gap; at the book's own +1.5 the simulation says 55%.
 *
 * THE RULE. Both cells answer the SAME question: home covering at the book's signed line. The model
 * side comes from `homeCoverProbability` (lib/markets/game-intelligence), the one sign rule shared with
 * /markets and the Model vs Market tab. When the line's sign or the simulated magnitude is missing,
 * the market cell is withheld rather than paired with a different question.
 */

import { homeCoverProbability } from "@/lib/markets/game-intelligence";
import type { FullGameSimGame } from "./types";

export type RunLineOverviewState =
  /** Both cells answer "home covers at the book's signed line". */
  | "COMPARED"
  /** No sportsbook run line for this game. The model cell shows the standard home −1.5. */
  | "NO_MARKET"
  /** The book posted a line whose magnitude the simulation did not publish: no interpolation. */
  | "LINE_NOT_SIMULATED";

export interface RunLineOverviewRow {
  readonly state: RunLineOverviewState;
  /** The home side's signed line both cells refer to (−1.5 in NO_MARKET). */
  readonly homeLine: number;
  /** "−1.5" / "+1.5" with a real minus sign. */
  readonly lineLabel: string;
  readonly ours: number | null;
  readonly market: number | null;
}

export function formatSignedLine(line: number): string {
  if (line === 0) return "0";
  return line < 0 ? `−${Math.abs(line)}` : `+${line}`;
}

export function runLineOverviewRow(game: Pick<FullGameSimGame, "gamePk" | "runLine" | "market">): RunLineOverviewRow {
  const posted = game.market?.runLine?.line;
  const marketCover = game.market?.runLine?.homeCover;
  if (typeof posted !== "number" || !Number.isFinite(posted) || posted === 0) {
    const standard = (game.runLine ?? []).find((r) => r.line === 1.5);
    return {
      state: "NO_MARKET",
      homeLine: -1.5,
      lineLabel: formatSignedLine(-1.5),
      ours: typeof standard?.homeCover === "number" ? standard.homeCover : null,
      market: null,
    };
  }
  const model = homeCoverProbability({ gamePk: game.gamePk, runLine: game.runLine ?? [] }, posted);
  const market = typeof marketCover === "number" && Number.isFinite(marketCover) ? marketCover : null;
  if (!model) {
    return { state: "LINE_NOT_SIMULATED", homeLine: posted, lineLabel: formatSignedLine(posted), ours: null, market };
  }
  return { state: "COMPARED", homeLine: posted, lineLabel: formatSignedLine(posted), ours: model.prob, market };
}
