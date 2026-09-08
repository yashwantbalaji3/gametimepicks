/**
 * PARTICIPATION LOOKUP (P247) — one owner for "did he play?", shared by the corpus builder's
 * self-validation and every evaluation lane, so the join rules cannot drift apart.
 *
 * Resolution order, all within (round(s), week, team):
 *   1. exact normalized name;
 *   2. last name, ONLY when unique in that team-game (nickname variants: Hollywood/Marquise,
 *      Gabe/Gabriel, Chig/Chigoziem — never a guess between two same-named candidates);
 * Postseason: the corpus restarts weeks at 1 (WC) … 5 (SB) while nflverse uses game_type
 * rounds — the round set is derived from the corpus week, week matched loosely inside it
 * (nflverse numbers those weeks 19-22).
 *
 * Returns total snaps (offense+defense+ST) or null when no record exists — null means the
 * player did not dress, the prop-market VOID case.
 */

const POST_ROUND = { 1: ["WC"], 2: ["DIV"], 3: ["CON"], 5: ["SB"], 4: ["CON", "SB"] };

export function normName(n) {
  return String(n)
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[.'`-]/g, "")
    .replace(/\s+(jr|sr|ii|iii|iv|v)$/i, "")
    .replace(/\s+/g, " ").trim();
}

/**
 * @param {{players: Record<string, number>, byLast: Record<string, Record<string, number>>}} part season doc
 * @param {{week?: number, seasonType?: number, phase?: number, dateUtc?: string}} game corpus game
 */
export function participationLookup(part, game, teamAbbr, playerName) {
  const wk = game.week;
  const month = game.dateUtc ? Number(game.dateUtc.slice(5, 7)) : null;
  const postseason = game.seasonType === 3 || game.phase === 3 || (wk != null && wk <= 5 && (month === 1 || month === 2));
  const nm = normName(playerName);
  const tries = [];
  if (postseason) {
    for (const round of POST_ROUND[wk] ?? ["WC", "DIV", "CON", "SB", "POST"]) {
      // nflverse numbers playoff weeks continuously (19-22); the round identifies the game.
      for (let w = 18; w <= 23; w += 1) tries.push([round, w]);
      tries.push([round, wk]);
    }
  } else {
    tries.push(["REG", wk]);
  }
  for (const [gt, w] of tries) {
    const v = part.players[`${gt}|${w}|${teamAbbr}|${nm}`];
    if (v != null) return v;
  }
  const last = nm.split(" ").at(-1) ?? nm;
  for (const [gt, w] of tries) {
    const cands = part.byLast[`${gt}|${w}|${teamAbbr}|${last}`];
    if (cands) {
      const names = Object.keys(cands);
      if (names.length === 1) return cands[names[0]];
    }
  }
  return null;
}
