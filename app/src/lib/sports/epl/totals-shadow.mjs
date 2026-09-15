/**
 * EPL TEAM-SPECIFIC TOTALS — PRIVATE FORWARD SHADOW (P305-F). Pure. Publishes nothing.
 *
 * P305 (data/internal/research/epl/reports/epl-totals-replay-*.json) tested club-specific totals against the live
 * P304 model's constant total (the league's trailing goals per match). On 9,493 blind matches of four other leagues
 * and on the EPL second look, both candidates beat the constant on every totals bar — and the blind verdict is
 * REJECTED, on a 1X2 calibration ceiling the control itself fails on those leagues. That verdict stands. This module
 * runs the receipt's better candidate (goalRatios) as a SHADOW beside P304 on future EPL fixtures: same fixture, same
 * cutoff, same information state, its numbers on the private forecast row only, graded paired by the same grader.
 * The public forecast is P304's, unchanged, whatever the shadow says. Public adoption is a founder decision.
 *
 *   ratios     per club, decayed sums of attack evidence (goals for ÷ the league's per-side rate that stood before
 *              the match) and defence evidence (goals against ÷ the same), decay 0.5^(1/halfLife) per club match,
 *              each shrunk toward 1 with priorMatches of prior weight; at a season start every club's sums and weight
 *              are multiplied by (1 − seasonRegression); a club with no evidence is at ratio 1
 *   total      league rate × (att_home × def_away + att_away × def_home) / 2, the league rate being P304's own
 *              trailing 380-match figure (state.totalGoals), so the shadow differs from P304 ONLY by that multiplier
 *   split      λ_home = (total + supremacy) / 2, λ_away = (total − supremacy) / 2 with P304's supremacy, floored —
 *              then the same score matrix the product publishes (strength-state.mjs scoreMatrix)
 * Arithmetic follows scripts/research/soccer/replay-totals-history.mjs; a parity test re-scores a dev season.
 */
import { normalizeClubName, scoreMatrix } from "./strength-state.mjs";

export const EPL_TOTALS_SHADOW_MODEL_ID = "epl-totals-shadow-v1-goal-ratios";

const seasonStart = (s) => Number(String(s).slice(0, 4));
const seasonLabel = (y) => `${y}-${String(y + 1).slice(2)}`;
const seasonOfIso = (iso) => { const y = Number(iso.slice(0, 4)); const m = Number(iso.slice(5, 7)); return seasonLabel(m >= 7 ? y : y - 1); };

/**
 * @param {{ rows: Array<{season:string,dateUtc:string,home:string,away:string,ftHome:number,ftAway:number}>,
 *           cutoffIso: string, frozen: object, seasonClubs?: string[], aliases?: Record<string,string> }} input
 *   rows      openfootball history rows in corpus club names (history-openfootball-v1.json)
 *   frozen    the P305 registration's frozen block (seasons.warmup, totals.goalRatios, totalWindowMatches, totalPrior)
 */
export function fitGoalRatiosState({ rows, cutoffIso, frozen, seasonClubs = [], aliases = {} }) {
  const cutoff = Date.parse(cutoffIso ?? "");
  if (!Number.isFinite(cutoff)) throw new Error("fitGoalRatiosState: cutoffIso required");
  const T = frozen.totals?.goalRatios;
  if (!T) throw new Error("fitGoalRatiosState: frozen.totals.goalRatios missing");
  const rho = Math.pow(0.5, 1 / T.halfLifeMatches);
  const keep = 1 - T.seasonRegression;
  const aliasOf = new Map(Object.entries(aliases).map(([k, v]) => [normalizeClubName(k), v]));
  const resolve = (name) => aliasOf.get(normalizeClubName(name)) ?? name;

  /* The P305 registration keeps its season windows per league; the EPL block is the one this shadow is fit on. */
  const warmup = frozen.leagues?.epl?.warmup ?? frozen.seasons?.warmup;
  if (!warmup) throw new Error("fitGoalRatiosState: the registration's EPL warm-up window is missing");
  const warmupStart = seasonStart(warmup[0]);
  const all = (rows ?? []).filter((m) => Number.isInteger(m.ftHome) && Number.isInteger(m.ftAway) && seasonStart(m.season) >= warmupStart)
    .sort((a, b) => a.dateUtc.localeCompare(b.dateUtc) || a.home.localeCompare(b.home));
  const eligible = all.filter((m) => Date.parse(m.dateUtc) < cutoff);
  const clubsBySeason = new Map();
  for (const m of all) (clubsBySeason.get(m.season) ?? clubsBySeason.set(m.season, new Set()).get(m.season)).add(m.home).add(m.away);
  const currentSeason = seasonOfIso(new Date(cutoff).toISOString());
  for (const c of seasonClubs) (clubsBySeason.get(currentSeason) ?? clubsBySeason.set(currentSeason, new Set()).get(currentSeason)).add(resolve(c));

  const club = new Map();
  const stateOf = (c) => club.get(c) ?? club.set(c, { attS: 0, defS: 0, w: 0 }).get(c);
  const begun = new Set();
  const beginSeason = (season) => {
    begun.add(season);
    for (const c of clubsBySeason.get(season) ?? []) { const s = stateOf(c); s.attS *= keep; s.defS *= keep; s.w *= keep; }
  };
  /* The evidence normaliser: the league's trailing window with the prior standing in for matches not yet played. */
  const goalLog = [];
  const seededRate = (dateUtc) => {
    const at = Date.parse(dateUtc);
    let i = goalLog.length;
    while (i > 0 && goalLog[i - 1].at >= at) i -= 1;
    const recent = goalLog.slice(Math.max(0, i - frozen.totalWindowMatches), i);
    return (recent.reduce((a, g) => a + g.goals, 0) + (frozen.totalWindowMatches - recent.length) * frozen.totalPrior) / frozen.totalWindowMatches;
  };

  let i = 0;
  while (i < eligible.length) {
    const day = eligible[i].dateUtc.slice(0, 10);
    const slate = [];
    while (i < eligible.length && eligible[i].dateUtc.slice(0, 10) === day) slate.push(eligible[i++]);
    for (const s of new Set(slate.map((m) => m.season))) if (!begun.has(s)) beginSeason(s);
    for (const m of slate) {
      const league = seededRate(m.dateUtc);
      const side = league / 2;
      const tot = m.ftHome + m.ftAway;
      for (const [c, gf, ga] of [[m.home, m.ftHome, m.ftAway], [m.away, m.ftAway, m.ftHome]]) {
        const s = stateOf(c);
        s.attS = s.attS * rho + gf / side;
        s.defS = s.defS * rho + ga / side;
        s.w = s.w * rho + 1;
      }
      goalLog.push({ at: Date.parse(m.dateUtc), goals: tot });
    }
  }
  if (!begun.has(currentSeason) && clubsBySeason.has(currentSeason)) beginSeason(currentSeason);

  const ratio = (S, w) => (T.priorMatches + S) / (T.priorMatches + w);
  const ratiosFor = (name) => { const s = club.get(resolve(name)); return s ? { attack: ratio(s.attS, s.w), defence: ratio(s.defS, s.w), weight: s.w } : { attack: 1, defence: 1, weight: 0 }; };
  return {
    version: 1,
    modelId: EPL_TOTALS_SHADOW_MODEL_ID,
    cutoffIso,
    matchesFitted: eligible.length,
    constants: { ...T },
    ratiosFor,
    /** The total multiplier for one fixture: 1 means "the league rate", exactly P304's total. */
    multiplierFor(homeClub, awayClub) {
      const h = ratiosFor(homeClub), a = ratiosFor(awayClub);
      return (h.attack * a.defence + a.attack * h.defence) / 2;
    },
  };
}

/**
 * The shadow's score matrix for a fixture, from the LIVE P304 state (its total and its supremacy) and the ratios
 * state (its multiplier). Same grid, same fields as the published forecast, so the grader scores both alike.
 * @param {object} p304State  fitEloPoissonState output (has totalGoals and lambdasFor)
 * @param {object} ratiosState fitGoalRatiosState output
 * @param {{ lambdaFloor: number }} frozen the P305 frozen block
 */
export function shadowScoreMatrix(p304State, ratiosState, homeClub, awayClub, frozen) {
  const base = p304State.lambdasFor(homeClub, awayClub);
  const supremacy = base.lamHome - base.lamAway;
  const multiplier = ratiosState.multiplierFor(homeClub, awayClub);
  const total = p304State.totalGoals * multiplier;
  const lamHome = Math.max(frozen.lambdaFloor, (total + supremacy) / 2);
  const lamAway = Math.max(frozen.lambdaFloor, (total - supremacy) / 2);
  const pseudo = { ...p304State, modelId: ratiosState.modelId, lambdasFor: () => ({ lamHome, lamAway, coldStart: base.coldStart }) };
  const m = scoreMatrix(pseudo, homeClub, awayClub);
  return { ...m, multiplier: Number(multiplier.toFixed(5)), baseTotal: Number(p304State.totalGoals.toFixed(4)), ratios: { home: ratiosState.ratiosFor(homeClub), away: ratiosState.ratiosFor(awayClub) } };
}

/**
 * The private row block: what the grader needs and nothing the public artifact copies. Every number is an exact
 * read of the shadow's own grid; the P304 row beside it carries its own `model.totals.distribution`.
 */
export function shadowTotalsRow(matrix, protocolId) {
  return {
    modelId: matrix.modelId,
    protocol: protocolId,
    multiplier: matrix.multiplier,
    baseTotal: matrix.baseTotal,
    lambdas: matrix.lambdas,
    probs: matrix.oneXTwo,
    totals: { expected: matrix.totals.expected, over25: matrix.totals.over25, distribution: matrix.totals.distribution, ladder: matrix.totals.ladder },
  };
}
