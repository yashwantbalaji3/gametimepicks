/**
 * A Premier League club's RECORDED RESULTS for its team page (Batch 1 · #8).
 *
 * /teams/epl/<club>/ said final results were not recorded — fixtures only — while /epl showed every played 2026-27 match
 * graded. Both now read the same thing: the graded ledger (public/data/soccer/epl/results/graded-forecasts.jsonl, read
 * by lib/sports/epl/graded-record.ts loadEplGradedRecord — the /epl hub's own reader), whose rows carry the official
 * full-time score.
 *
 * THE JOIN IS BY EVENT ID, NEVER BY NAME. The research projection's team rows and the ledger share one event id
 * (soccer:epl:<a>-v-<b>:<kickoff>), so a result attaches to exactly the fixture the team page already lists, with the
 * projection's own home/away flag and opponent id. As a second check the club's name must sit on the side of the
 * ledger's "Home v Away" matchup that the home/away flag says it played; a row that disagrees is dropped and counted
 * (`mismatched`), never guessed at.
 *
 * Nothing is graded here: W/D/L is the club's own goals against the opponent's in the recorded final score.
 *
 * Pure: no filesystem, no clock.
 */

/**
 * @param {{ teamName: string, games: Array<[string, string|null, string, "H"|"A"|"N", string|null, string, number|null, number|null, string|null]>, ledger: Array<{ eventId: string, matchup: string, kickoffUtc: string, actual: { homeGoalsFT: number, awayGoalsFT: number } | null }> }} o
 * @returns {{ rows: Array<{ eventId: string, kickoffUtc: string, seasonId: string, ha: "H"|"A", opponentId: string|null, own: number, opp: number, result: "W"|"D"|"L" }>, record: { w: number, d: number, l: number, played: number, scored: number, conceded: number }, mismatched: number }}
 */
export function eplTeamResults({ teamName, games, ledger }) {
  const byId = new Map();
  for (const m of ledger ?? []) {
    const a = m?.actual;
    if (m?.eventId && a && Number.isInteger(a.homeGoalsFT) && Number.isInteger(a.awayGoalsFT)) byId.set(String(m.eventId), m);
  }
  const rows = [];
  let mismatched = 0;
  for (const g of games ?? []) {
    const m = byId.get(String(g[0]));
    if (!m || (g[3] !== "H" && g[3] !== "A")) continue;
    const [home, away] = String(m.matchup ?? "").split(" v ");
    const side = g[3] === "H" ? home : away;
    if (!side || side.trim() !== teamName) { mismatched += 1; continue; }
    const own = g[3] === "H" ? m.actual.homeGoalsFT : m.actual.awayGoalsFT;
    const opp = g[3] === "H" ? m.actual.awayGoalsFT : m.actual.homeGoalsFT;
    rows.push({
      eventId: String(g[0]), kickoffUtc: String(m.kickoffUtc ?? g[1] ?? ""), seasonId: g[2], ha: g[3], opponentId: g[4] ?? null,
      own, opp, result: own > opp ? "W" : own < opp ? "L" : "D",
    });
  }
  rows.sort((a, b) => b.kickoffUtc.localeCompare(a.kickoffUtc) || a.eventId.localeCompare(b.eventId));
  const record = rows.reduce((r, x) => ({
    w: r.w + (x.result === "W" ? 1 : 0), d: r.d + (x.result === "D" ? 1 : 0), l: r.l + (x.result === "L" ? 1 : 0),
    played: r.played + 1, scored: r.scored + x.own, conceded: r.conceded + x.opp,
  }), { w: 0, d: 0, l: 0, played: 0, scored: 0, conceded: 0 });
  return { rows, record, mismatched };
}
