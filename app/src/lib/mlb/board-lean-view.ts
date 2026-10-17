import type { MlbBoardLean } from "@/lib/types-mlb";

/**
 * The slice of a board lean that the interactive MLB board (MlbBoardClient → filter console, game sections,
 * lean rows) actually reads (2026-10-15, COST-002 HTML reduction).
 *
 * MlbBoardClient is a client component, so every prop it receives is serialized into each page's inline RSC
 * payload. A raw lean is ~2.6 KB (provider refs, implied probabilities, a full-season recent series …); a busy
 * archived date carries ~700 of them, about 1.8 MB per page, none of which the client reads. The client now
 * receives only these fields, so rendered output is unchanged while the payload shrinks.
 *
 * The guarantee is the type: the client tree is typed against MlbBoardLeanView, so reading a field that is not
 * listed here is a compile error, not a silently missing value. Two value-level trims, both exact:
 *   - recentSeries keeps its last 10 points: the sparkline draws slice(-10) and labels min(length, 10);
 *   - reason is kept only when reasonBullets is empty: the row reads it only as that fallback.
 */
export const BOARD_LEAN_VIEW_FIELDS = [
  "id",
  "gameId",
  "gamePk",
  "commenceTime",
  "homeTeamAbbr",
  "awayTeamAbbr",
  "playerId",
  "playerName",
  "playerTeamAbbr",
  "opponentAbbr",
  "playerRole",
  "marketKey",
  "line",
  "oddsOver",
  "oddsUnder",
  "bookmaker",
  "projection",
  "sigma",
  "recentSeries",
  "lean",
  "confidence",
  "edgePct",
  "riskFlags",
  "reason",
  "reasonBullets",
] as const satisfies readonly (keyof MlbBoardLean)[];

export type MlbBoardLeanView = Pick<MlbBoardLean, (typeof BOARD_LEAN_VIEW_FIELDS)[number]>;

export function toBoardLeanView(l: MlbBoardLean): MlbBoardLeanView {
  const out = {} as Record<string, unknown>;
  for (const k of BOARD_LEAN_VIEW_FIELDS) if (l[k] !== undefined) out[k] = l[k];
  if (Array.isArray(l.recentSeries)) out.recentSeries = l.recentSeries.slice(-10);
  if (l.reasonBullets && l.reasonBullets.length > 0) out.reason = "";
  return out as MlbBoardLeanView;
}
