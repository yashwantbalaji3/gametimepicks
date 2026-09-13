/**
 * WHAT A PROP ROW CAN HONESTLY SAY ABOUT ITS GAME (P289).
 *
 * A prop row carries two different facts, and they fail independently:
 *
 *   · WHICH GAME it belongs to — `gamePk`, `homeTeamAbbr`, `awayTeamAbbr`, from the schedule join.
 *   · WHICH SIDE the player is on — `playerTeamAbbr`, `opponentAbbr`, from the PLAYER join.
 *
 * The player join is the fragile one. The odds provider spells names without accents, so "Yandy
 * Diaz", "Jose Ramirez", "Ronald Acuna Jr." and ninety-seven others never match their accented
 * canonical form; `playerId`, `playerTeamAbbr` and `opponentAbbr` all come back null. The game join
 * succeeds anyway — the row still knows it is BAL at TB.
 *
 * The row rendered `${playerTeamAbbr ?? "—"} vs ${opponentAbbr ?? "—"}`, so those rows printed
 * "— vs —": two dashes and the word "vs", conveying nothing, in the line whose whole job is to place
 * the player. Measured on the built export: **3,989 rendered rows across 100 players**.
 *
 * A dash is the right character for one missing value in a table of numbers. It is the wrong answer
 * to "which game is this?" when the row knows the game. So:
 *
 *   both sides known   → "TB vs BAL"    (unchanged; the player's own team leads)
 *   side unknown, game known → "BAL @ TB"  (states the GAME, claims nothing about the side)
 *   neither known      → null            (the caller omits the line rather than printing dashes)
 *
 * Nothing is invented: every string here is assembled from abbreviations already on the row. In
 * particular this NEVER guesses which side the player is on — that is the fact that is missing, and
 * inferring it from a name is how the wrong team gets printed beside a real player.
 */

export interface LeanMatchupFields {
  readonly playerTeamAbbr?: string | null;
  readonly opponentAbbr?: string | null;
  readonly homeTeamAbbr?: string | null;
  readonly awayTeamAbbr?: string | null;
}

export type LeanMatchup =
  | { kind: "SIDED"; label: string; team: string; opponent: string }
  | { kind: "GAME_ONLY"; label: string; home: string; away: string }
  | null;

const clean = (v: string | null | undefined): string | null => {
  const s = (v ?? "").trim();
  return s.length > 0 ? s : null;
};

/**
 * The strongest true statement this row can make about its game, or null when it can make none.
 */
export function leanMatchup(lean: LeanMatchupFields): LeanMatchup {
  const team = clean(lean.playerTeamAbbr);
  const opponent = clean(lean.opponentAbbr);
  if (team && opponent) return { kind: "SIDED", label: `${team} vs ${opponent}`, team, opponent };

  const home = clean(lean.homeTeamAbbr);
  const away = clean(lean.awayTeamAbbr);
  /* Both halves of the game, or it is not a game. One known team on its own cannot be placed: "BAL @"
     reads as a truncation, and "BAL" alone would be taken for the player's team — the very claim the
     missing join means we cannot make. */
  if (home && away) return { kind: "GAME_ONLY", label: `${away} @ ${home}`, home, away };

  return null;
}
