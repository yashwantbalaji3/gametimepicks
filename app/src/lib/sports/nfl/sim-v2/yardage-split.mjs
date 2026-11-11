/**
 * NFL SIMULATION V2 · MKT-02 YARDAGE-SPLIT CHALLENGER (market review 2026-11-09 MKT-02; NFL completion row C). Pure.
 *
 * THE DEFECT. The engine splits each drive's empirical net yards over its gaining plays in proportion to sampled
 * per-play gains. At team level that split leans to the run: simulated passing yards are biased low and rushing yards
 * high (validation A/B: 223 vs 250 and 216 vs 232 passing). Total yards per drive are unaffected.
 *
 * THE CHALLENGER. One number, α = the weight on a completion's sampled gain in the split (engine `yardageSplit`;
 * α = 1 is the incumbent). It is RE-FIT MECHANICALLY, WALK-FORWARD, for each target week, with no tuning:
 *   target   R = Σ passing yards / Σ (passing + rushing yards) over every team-game whose (season, season type, week) is
 *            STRICTLY BEFORE the target week, 2015 on (the drive-params window start). Same-week games never enter, so a
 *            Thursday game cannot inform the Sunday fit. Sources: team-games-v1 (2015–2025, nflverse play-by-play) and
 *            player-events-v1 (2026: Σ passer passYds, Σ rusher rushYds per team).
 *   solve    the simulated league pass share S(α) over FIT_RUNS seeded league-average games (θ = 0, no named players,
 *            fixed seed = common random numbers, so S is a deterministic monotone function of α) equals R, by bisection
 *            on [ALPHA_LO, ALPHA_HI] to FIT_TOLERANCE.
 * Every constant below is fixed in code before any challenger receipt is graded. It feeds NOTHING public: challenger
 * receipts live in their own directory, are never a receipt of record, and are graded beside the incumbent only.
 */
import { N_PERIODS, N_TSTAT, TEAM_STAT, runRng, simulateGame, tiltedTable } from "./engine.mjs";

export const MKT02_CHALLENGER = Object.freeze({
  challengerId: "nfl-sim-v2-mkt02-yardage-split",
  version: "1.0.0",
  rule: "α solves S(α) = league pass share of team-games strictly before the target week (2015 on); S over FIT_RUNS seeded league-average games",
});
export const FIRST_SEASON = 2015;
export const FIT_RUNS = 2000;
export const FIT_SEED = "6d6b7402";
export const ALPHA_LO = 0.5;
export const ALPHA_HI = 3;
export const FIT_TOLERANCE = 1e-4;
export const FIT_MAX_ITER = 40;

const TYPE_ORDER = { PRE: 0, REG: 1, POST: 2 };
/** Sort key of a (season, season type, week). Season type: "REG" | "POST" (ESPN 2 | 3 accepted). */
export function weekKey(season, seasonType, week) {
  const st = seasonType === 3 || seasonType === "3" ? "POST" : seasonType === 2 || seasonType === "2" ? "REG" : String(seasonType ?? "REG").toUpperCase();
  return season * 10000 + (TYPE_ORDER[st] ?? 1) * 100 + week;
}

/** One row per team-game: { key, season, team, passYds, rushYds } from team-games-v1 rows and player-events-v1 games. */
export function teamGameRows({ teamGames = [], playerEventGames = [] }) {
  const rows = [];
  for (const g of teamGames) {
    if (!(g.s >= FIRST_SEASON) || !Number.isFinite(g.passYds) || !Number.isFinite(g.rushYds)) continue;
    rows.push({ key: weekKey(g.s, g.st, g.wk), season: g.s, team: g.tm, passYds: g.passYds, rushYds: g.rushYds });
  }
  const covered = new Set(rows.map((r) => r.season));
  for (const g of playerEventGames) {
    if (!(g.season >= FIRST_SEASON) || covered.has(g.season)) continue; // one source per season
    const by = new Map();
    for (const p of g.players ?? []) {
      const t = by.get(p.teamAbbr) ?? { passYds: 0, rushYds: 0 };
      t.passYds += p.passYds ?? 0;
      t.rushYds += p.rushYds ?? 0;
      by.set(p.teamAbbr, t);
    }
    for (const [team, t] of [...by.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) rows.push({ key: weekKey(g.season, g.seasonType, g.week), season: g.season, team, ...t });
  }
  return rows;
}

/** The target pass share from rows strictly before the target week. */
export function targetPassShare(rows, asOfKey) {
  let pass = 0, rush = 0, n = 0, last = null;
  for (const r of rows) {
    if (!(r.key < asOfKey)) continue;
    pass += r.passYds; rush += r.rushYds; n += 1;
    if (last == null || r.key > last) last = r.key;
  }
  return n ? { share: pass / (pass + rush), teamGames: n, lastWeekKey: last } : null;
}

/** Simulated league pass share at α: Σ passYds / Σ (passYds + rushYds) over FIT_RUNS seeded league-average games. */
export function simPassShare(compiled, alpha, { runs = FIT_RUNS, seed = FIT_SEED } = {}) {
  const tables = [tiltedTable(compiled, 0), tiltedTable(compiled, 0)];
  const out = { team: [new Float64Array(N_TSTAT), new Float64Array(N_TSTAT)], period: [new Float64Array(N_PERIODS), new Float64Array(N_PERIODS)], players: null };
  let pass = 0, rush = 0;
  for (let i = 0; i < runs; i++) {
    simulateGame({ compiled, tables, rng: runRng(seed, i), out, yardageSplit: alpha === 1 ? null : { passGainWeight: alpha } });
    for (const s of [0, 1]) { pass += out.team[s][TEAM_STAT.passYds]; rush += out.team[s][TEAM_STAT.rushYds]; }
  }
  return pass / (pass + rush);
}

const r6 = (x) => Math.round(x * 1e6) / 1e6;

/**
 * Walk-forward fit for the target week. Returns null when no team-game precedes it.
 * @returns {{ challengerId, version, asOfWeekKey, alpha, targetPassShare, simPassShareAtAlpha, simPassShareIncumbent, teamGames, lastWeekKey, iterations }}
 */
export function fitYardageSplit({ compiled, rows, asOfKey, runs = FIT_RUNS, seed = FIT_SEED }) {
  const t = targetPassShare(rows, asOfKey);
  if (!t) return null;
  const S = (a) => simPassShare(compiled, a, { runs, seed });
  let lo = ALPHA_LO, hi = ALPHA_HI, it = 0, a = 1, s = S(1);
  const incumbent = s;
  if (Math.abs(s - t.share) > FIT_TOLERANCE) {
    for (; it < FIT_MAX_ITER; it++) {
      a = (lo + hi) / 2;
      s = S(a);
      if (Math.abs(s - t.share) <= FIT_TOLERANCE) break;
      if (s < t.share) lo = a; else hi = a;
    }
  }
  return { challengerId: MKT02_CHALLENGER.challengerId, version: MKT02_CHALLENGER.version, asOfWeekKey: asOfKey, alpha: r6(a), targetPassShare: r6(t.share), simPassShareAtAlpha: r6(s), simPassShareIncumbent: r6(incumbent), teamGames: t.teamGames, lastWeekKey: t.lastWeekKey, iterations: it };
}
