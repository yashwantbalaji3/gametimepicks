/**
 * NEW ARRIVALS — carried prior-club usage for pool-absent movers (P250-GD3). PRIVATE input,
 * PUBLIC_DERIVED output rows.
 *
 * THE GAP THIS CLOSES, reproduced on game day: A.J. Brown is on New England's current roster
 * (role evidence: WR, active) with a full 16-game 2025 season in our own player-events corpus —
 * and appeared NOWHERE on the product. The Aug-13 share snapshot lists players per club, so a
 * player traded after his last corpus game falls through both sieves: off his old club's list
 * (no longer rostered there) and off his new club's (the evaluated stint rule starts him at zero
 * evidence, his volume sitting in the unallocated OTHER mass). The rule is correct about what is
 * UNKNOWN — his role at the new club — but silently omitting the star the reader tunes in for is
 * a product defect, and 404 skill players league-wide sit in this gap (most are depth; the
 * notable movers are the problem).
 *
 * WHAT THIS PUBLISHES: for each roster-present, non-inactive skill player absent from a team's
 * share pool, his OWN most-recent-stint per-game averages from the committed corpus — plain
 * factual history ("2025 at PHI: 5.4 rec · 74 yds per game"), NO decay model, NO share invention,
 * NO team renormalization. The team simulation is untouched, so the validated receiving families
 * keep their meaning; the arrival is displayed beside them with the explicit frame that he is NOT
 * in those numbers and why. Once a game is observed at the new club, the stint rule admits him to
 * the allocator automatically and his arrival row retires by itself.
 *
 * NOTABILITY: prior-stint usage must clear the pool's own materiality thresholds scaled to
 * per-game fact (>= 3 targets/g, >= 6 carries/g, or >= 15 pass attempts/g, over >= 6 games) —
 * depth bodies with no meaningful history stay out, exactly as they are out of the pool.
 */

export const NEW_ARRIVALS_VERSION = 1;
const SKILL = new Set(["QB", "RB", "WR", "TE", "FB"]);
const MIN_GAMES = 6;

/** Aggregate one player's per-game averages over his most recent stint in one season's rows. */
function stintAverages(games) {
  // most recent stint = trailing run of games with one teamAbbr
  const sorted = [...games].sort((a, b) => String(a.dateUtc).localeCompare(String(b.dateUtc)));
  const lastTeam = sorted[sorted.length - 1].teamAbbr;
  const stint = [];
  for (let i = sorted.length - 1; i >= 0 && sorted[i].teamAbbr === lastTeam; i -= 1) stint.unshift(sorted[i]);
  const n = stint.length;
  const avg = (k) => Number((stint.reduce((s, g) => s + (g[k] ?? 0), 0) / n).toFixed(1));
  return {
    club: lastTeam,
    games: n,
    targetsPg: avg("targets"),
    receptionsPg: avg("rec"),
    recYdsPg: avg("recYds"),
    rushAttPg: avg("rushAtt"),
    rushYdsPg: avg("rushYds"),
    passAttPg: avg("passAtt"),
    passYdsPg: avg("passYds"),
  };
}

const notable = (a) => a.games >= MIN_GAMES && (a.targetsPg >= 3 || a.rushAttPg >= 6 || a.passAttPg >= 15);

/**
 * @param {object} p
 * @param {Array}  p.corpusSeasons  newest-first list of player-events season docs ({rows:[{players,dateUtc}...]} or plain game arrays)
 * @param {object} p.roleEvidence   the role-evidence artifact (events[].teams[abbr].players[])
 * @param {object} p.shares         role-shares current.json (teams[abbr][family].players[].playerId)
 * @returns Map providerEventId -> { [teamAbbr]: arrival[] }
 */
export function deriveNewArrivals({ corpusSeasons, roleEvidence, shares }) {
  // per-player game rows by playerId, newest season first — first season with rows wins.
  const byPlayer = new Map();
  for (const season of corpusSeasons) {
    const games = Array.isArray(season) ? season : season?.rows ?? season?.games ?? [];
    for (const g of games) {
      for (const pl of g.players ?? []) {
        if (!pl.playerId) continue;
        let rec = byPlayer.get(pl.playerId);
        if (!rec) { rec = { seasonIdx: null, rows: [] }; byPlayer.set(pl.playerId, rec); }
        const idx = corpusSeasons.indexOf(season);
        if (rec.seasonIdx == null) rec.seasonIdx = idx;
        if (rec.seasonIdx === idx) rec.rows.push({ ...pl, dateUtc: g.dateUtc });
      }
    }
  }
  const pool = new Map();
  for (const [t, fam] of Object.entries(shares?.teams ?? {})) {
    const ids = new Set();
    for (const f of ["targets", "rushAttempts", "passAttempts"]) for (const p of fam?.[f]?.players ?? []) ids.add(p.playerId);
    pool.set(t, ids);
  }
  const out = new Map();
  for (const ev of roleEvidence?.events ?? []) {
    const perTeam = {};
    for (const [abbr, tv] of Object.entries(ev.teams ?? {})) {
      const arrivals = [];
      for (const p of tv.players ?? []) {
        if (!SKILL.has(p.position) || p.state === "INACTIVE") continue;
        if (pool.get(abbr)?.has(p.playerId)) continue;
        const hist = byPlayer.get(p.playerId);
        if (!hist?.rows?.length) continue;                    // no corpus history — genuinely unknown, stays absent
        const a = stintAverages(hist.rows);
        if (a.club === abbr) continue;                        // same club ⇒ the stint rule already sees him
        if (!notable(a)) continue;
        arrivals.push({
          playerId: p.playerId, name: p.name, position: p.position, team: abbr,
          participation: p.state, lastSeason: a,
          note: `usage carried from ${a.club} (${a.games} games last season) — his role at ${abbr} is unobserved, so he is NOT in this game's simulated team numbers; his volume sits in the unallocated share until real usage is seen`,
        });
      }
      if (arrivals.length) perTeam[abbr] = arrivals.sort((x, y) => (y.lastSeason.targetsPg + y.lastSeason.rushAttPg) - (x.lastSeason.targetsPg + x.lastSeason.rushAttPg));
    }
    if (Object.keys(perTeam).length) out.set(ev.providerEventId, perTeam);
  }
  return out;
}
