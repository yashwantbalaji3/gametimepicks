/**
 * NBA MINUTES SHADOW PROJECTIONS — the concrete correction as a functional shadow (founder 2026-11-11: "not another
 * diagnostic"): the challenger minutes `nba-minutes-current-season@1` feed the official v0 player simulation, and the
 * result is a frozen pre-tip SHADOW projection per player. PURE, deterministic, no I/O. dataClass PRIVATE_RESEARCH ·
 * productEligible: false · NOT a public surface and NOT a build input (data/internal/research/nba/minutes-shadow/).
 * The official v0.1 forecasts, the lanes and every public number are unchanged.
 *
 * Per upcoming game whose official v0.1 forecast is frozen (and only before tip):
 *   - minutes   minutesChallengerSide (current-season box scores, v0.1's basis rule, 240 under each player's ceiling);
 *   - rates     the OFFICIAL frozen per-minute rates of each player (forecast.players[side].rates). The frozen file does
 *               not store their sds, so each is re-derived by the official minutes model (minutes-model.mjs
 *               expectedMinutes on the corpus box scores, at the official instant, for the player's history team) and
 *               used only when that run reproduces the frozen rates exactly (rateSdBasis "official-reproduced"); else
 *               game-sim.mjs's own fallback (0.5 × rate) applies and is labelled. So the shadow differs from the official
 *               in minutes only. A player the official could not project (no history) takes game-sim.mjs's team-pool
 *               fallback rate;
 *   - engine    simulateGame (game-sim.mjs, the official v0 engine, unchanged and byte-pinned) with the official game's
 *               seed policy (same seed per game). The challenger minutes already sum to 240, so the engine's own rescale
 *               is ≈ 1 (recorded per side). A side the ceiling leaves SHORT of 240 is refused (SHORT_POOL): the engine
 *               would scale it up past the players' own maxima, which the challenger forbids;
 *   - output    per player: expected minutes and the minutes / pts / reb / ast / threePm / combo quantiles. Team scores
 *               are NOT carried (the official composition withholds them).
 * Write-once per game: an entry already in the existing file is carried byte-for-byte, never recomputed.
 */
import { minutesChallengerSide, MINUTES_CHALLENGER_ID } from "./minutes-current-season.mjs";
import { simulateGame, DEFAULT_SIMULATIONS } from "./game-sim.mjs";
import { LABELS } from "./experimental-forecast.mjs";
import { expectedMinutes, STAT_KEYS } from "./minutes-model.mjs";

const r3 = (x) => (Number.isFinite(x) ? Number(x.toFixed(3)) : null);

/** The official rate sds, re-derived (see the header). Cache key: team | instant. */
function officialRateSd(g, side, athleteId, frozenRates, corpusBoxscores, cache) {
  if (!frozenRates || !Array.isArray(corpusBoxscores) || !corpusBoxscores.length) return { rateSd: null, basis: "fallback-0.5x-rate" };
  const other = (g[side]?.pool?.otherTeamHistory ?? []).find((x) => String(x.providerAthleteId) === String(athleteId));
  const team = String(other?.historyTeam ?? g[side]?.providerTeamId);
  const key = `${team}|${g.forecast.inputAsOf}`;
  if (!cache.has(key)) cache.set(key, expectedMinutes({ boxscores: corpusBoxscores, teamProviderId: team, asOfDateUtc: g.forecast.inputAsOf }));
  const row = cache.get(key).rows.find((r) => r.providerAthleteId === String(athleteId));
  const same = row?.rates && STAT_KEYS.every((k) => r3(row.rates[k]) === r3(frozenRates[k]));
  return same && row.rateSd ? { rateSd: row.rateSd, basis: "official-reproduced" } : { rateSd: null, basis: "fallback-0.5x-rate" };
}

export const MINUTES_SHADOW_SCHEMA = "nba-minutes-shadow-forecast@1";

/** The challenger side as minutes-model rows game-sim.mjs prepareRoster reads (official rates; null rates → pool fallback). */
function minutesRows(g, sideKey, side, frozenPlayers, corpusBoxscores, cache) {
  const official = new Map((frozenPlayers ?? []).map((p) => [String(p.providerAthleteId), p]));
  return side.players.map((p) => {
    const o = official.get(p.providerAthleteId);
    const sd = o ? officialRateSd(g, sideKey, p.providerAthleteId, o.rates, corpusBoxscores, cache) : { rateSd: null, basis: "team-pool-fallback" };
    return {
      rateSdBasis: sd.basis,
      providerAthleteId: p.providerAthleteId, name: p.name, availability: "active", injuryStatus: o?.injuryStatus ?? null,
      expectedMinutes: p.expectedMinutes, minutesSd: p.minutesSd, starterRate: o?.starterRate ?? null, basis: p.basis, gamesUsed: p.currentGames,
      rates: o?.rates ?? null, rateSd: sd.rateSd,
    };
  });
}

/**
 * @param date        ET slate date
 * @param now         ISO instant of this build (an entry is frozen only when now < tip)
 * @param slateGames  the official v0.1 frozen forecast games of `date`
 * @param boxscores   box-score docs available at build time (the challenger's leakage rule selects)
 * @param corpusBoxscores  the corpus box scores the official v0.1 read (to re-derive the official rate sds)
 * @param existing    the committed shadow file for `date`, or null
 * @returns { doc, added, refused } — `doc` depends only on its frozen entries
 */
export function minutesShadowDoc({ date, now, slateGames, boxscores, corpusBoxscores = [], existing = null, simulations = DEFAULT_SIMULATIONS }) {
  const cache = new Map();
  const kept = new Map((existing?.games ?? []).map((g) => [String(g.providerEventId), g]));
  const added = [], refused = [];
  for (const g of slateGames ?? []) {
    const id = String(g.providerEventId);
    if (kept.has(id) || g.label !== LABELS[2]) continue;
    if (!(Date.parse(now) < Date.parse(g.dateUtc))) { refused.push({ providerEventId: id, reason: "AT_OR_AFTER_TIP" }); continue; }
    const H = minutesChallengerSide(g, "home", boxscores), A = minutesChallengerSide(g, "away", boxscores);
    if (!H.ok || !A.ok) { refused.push({ providerEventId: id, reason: (H.ok ? A : H).reason }); continue; }
    if (H.shortfall > 0 || A.shortfall > 0) { refused.push({ providerEventId: id, reason: "SHORT_POOL" }); continue; }
    const rowsH = minutesRows(g, "home", H, g.forecast.players?.home, corpusBoxscores, cache);
    const rowsA = minutesRows(g, "away", A, g.forecast.players?.away, corpusBoxscores, cache);
    const sdBasis = Object.fromEntries([...rowsH, ...rowsA].map((r) => [r.providerAthleteId, r.rateSdBasis]));
    const sim = simulateGame({
      providerEventId: id, inputAsOf: g.forecast.inputAsOf, neutralSite: g.neutralSite === true,
      home: { minutes: { rows: rowsH, injuriesProvided: true } },
      away: { minutes: { rows: rowsA, injuriesProvided: true } },
      eloWinProbability: null, simulations,
    });
    const side = (S, players, engineMinutes) => ({
      challenger: MINUTES_CHALLENGER_ID, boxscoresUsed: S.boxscoresUsed, teamGamesUsed: S.teamGamesUsed,
      rawPool: S.rawPool, factor: S.factor, sum: S.sum, leftOut: S.leftOut, engineRescaleFactor: engineMinutes.rescaleFactor,
      players: players.map((p) => {
        const c = S.players.find((x) => x.providerAthleteId === String(p.providerAthleteId));
        return {
          providerAthleteId: String(p.providerAthleteId), name: p.name, inOfficialPool: c.inOfficialPool, minutesBasis: c.basis,
          expectedMinutes: p.expectedMinutes, challengerMinutes: c.expectedMinutes, minutesSd: p.minutesSd, ceiling: c.ceiling, officialExpectedMinutes: c.officialExpectedMinutes, ratesBasis: p.ratesBasis, rateSdBasis: sdBasis[String(p.providerAthleteId)],
          minutes: p.minutes, pts: p.pts, reb: p.reb, ast: p.ast, threePm: p.threePm, pra: p.pra, ptsReb: p.ptsReb, ptsAst: p.ptsAst,
        };
      }),
    });
    added.push({
      providerEventId: id, tipUtc: g.dateUtc, frozenAt: now, officialInputAsOf: g.forecast.inputAsOf,
      engine: { model: sim.modelVersion, simulations: sim.simulations, seed: sim.seed, seedPolicy: sim.seedPolicy },
      home: side(H, sim.players.home, sim.assumptions.minutes.home), away: side(A, sim.players.away, sim.assumptions.minutes.away),
    });
  }
  const doc = {
    schema: MINUTES_SHADOW_SCHEMA,
    dataClass: "PRIVATE_RESEARCH",
    productEligible: false,
    publicSurface: false,
    note: "SHADOW — never published, never a build input; the official v0.1 forecasts are unchanged. Minutes from nba-minutes-current-season@1; rates, engine and seed are the official ones; team scores are not carried.",
    date,
    games: [...kept.values(), ...added].sort((a, b) => Date.parse(a.tipUtc) - Date.parse(b.tipUtc) || a.providerEventId.localeCompare(b.providerEventId)),
  };
  return { doc, added: added.length, refused };
}
