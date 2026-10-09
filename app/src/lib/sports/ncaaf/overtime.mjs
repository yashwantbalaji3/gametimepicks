/**
 * NCAAF overtime: season rule regimes, the observed per-period points table, and the empirical per-possession
 * distributions the world engine draws from (NCAAF-003.3). PRIVATE_RESEARCH.
 *
 * Rules (NCAA Football Rules Committee, 2021 change — ncaa.org 2021-10-27): from 2021, a team scoring a
 * touchdown in the 2nd overtime must attempt a two-point try, and from the 3rd overtime each period is one
 * alternating two-point attempt per team. Verified against ESPN line scores 2021–2025: OT2 per-team points ⊂
 * {0, 3, 6, 8} and OT3+ ⊂ {0, 2} in every unquarantined game, and regulation was tied in every OT game.
 * 2016–2020 line scores show the older regime (7s in OT2; 3/6/8 in OT3+). Worlds for seasons before 2021 are
 * REFUSED: their rules are not encoded.
 *
 * Point-in-time: a distribution for slate day D uses only OT periods of games with slateDate < D. OT1 is the
 * same in every regime since 2016 (kick or two-point try after a touchdown), so OT1 pools 2016+; OT2 and OT3+
 * pool only games under the 2021 regime.
 *
 * Pure.
 */

export const OT_REGIME_2021 = Object.freeze({
  id: "ncaa-ot-2021",
  fromSeason: 2021,
  allowed: Object.freeze({ 1: [0, 3, 6, 7, 8], 2: [0, 3, 6, 8], "3+": [0, 2] }),
  source: "NCAA Football Rules Committee overtime change effective 2021 (ncaa.org/news/2021/10/27)",
});
/** Minimum observed team-periods per period type before a distribution may be used. */
export const MIN_OT_OBSERVATIONS = 20;

export function otRegime(season) {
  return season >= OT_REGIME_2021.fromSeason ? OT_REGIME_2021 : null;
}

const periodKey = (k) => (k >= 3 ? "3+" : String(k));

/**
 * One OT table row from a played-final normalised event with overtime, or a quarantine reason.
 * Row: { eventId, season, slateDate, homeRegulation, awayRegulation, homeOt[], awayOt[] }.
 */
export function overtimeRow(event, slateDate) {
  const n = event.overtimePeriods;
  const hp = event.home.periodScores, ap = event.away.periodScores;
  const base = { eventId: event.providerEventId, season: event.season, slateDate };
  if (!hp || !ap) return { ...base, quarantined: "MISSING_PERIOD_SCORES" };
  if (hp.length !== 4 + n || ap.length !== 4 + n) return { ...base, quarantined: "PERIOD_COUNT_MISMATCH" };
  const homeRegulation = hp.slice(0, 4).reduce((s, v) => s + v, 0), awayRegulation = ap.slice(0, 4).reduce((s, v) => s + v, 0);
  if (homeRegulation !== awayRegulation) return { ...base, quarantined: "REGULATION_NOT_TIED" };
  const homeOt = hp.slice(4), awayOt = ap.slice(4);
  // Each OT period is one possession per team: never more than 8 points (TD + two-point try).
  if ([...homeOt, ...awayOt].some((v) => v > 8)) return { ...base, quarantined: "OT_PERIOD_OVER_8" };
  const regime = otRegime(event.season);
  if (regime) {
    for (let k = 0; k < n; k++) {
      const allowed = regime.allowed[periodKey(k + 1)];
      if (!allowed.includes(homeOt[k]) || !allowed.includes(awayOt[k])) return { ...base, quarantined: "OT_POINTS_OUTSIDE_RULES" };
    }
  }
  return { ...base, homeRegulation, awayRegulation, homeOt, awayOt };
}

/**
 * Empirical per-team-period points distribution for each period type, as of slate day D, for season `season`.
 * → { regime, periods: { "1": { values, probs, n }, … } } or { refused: reason }.
 */
export function otDistribution(otRows, slateDate, season) {
  const regime = otRegime(season);
  if (!regime) return { refused: `OT_RULES_NOT_ENCODED_FOR_${season}` };
  const counts = { 1: new Map(), 2: new Map(), "3+": new Map() };
  for (const r of otRows) {
    if (r.quarantined || !(r.slateDate < slateDate)) continue;
    r.homeOt.forEach((_, k) => {
      const key = periodKey(k + 1);
      if (key !== "1" && r.season < regime.fromSeason) return; // OT2/OT3+ only from the same rule regime
      for (const v of [r.homeOt[k], r.awayOt[k]]) counts[key].set(v, (counts[key].get(v) ?? 0) + 1);
    });
  }
  const periods = {};
  for (const [key, m] of Object.entries(counts)) {
    const n = [...m.values()].reduce((s, v) => s + v, 0);
    if (n < MIN_OT_OBSERVATIONS) return { refused: `OT_DISTRIBUTION_INSUFFICIENT_${key}_n${n}` };
    const values = [...m.keys()].sort((a, b) => a - b);
    // Only rule-allowed values can be drawn (anything else was quarantined upstream).
    if (values.some((v) => !regime.allowed[key].includes(v))) return { refused: `OT_VALUE_OUTSIDE_RULES_${key}` };
    periods[key] = { values, probs: values.map((v) => m.get(v) / n), n };
  }
  return { regime: regime.id, periods };
}
