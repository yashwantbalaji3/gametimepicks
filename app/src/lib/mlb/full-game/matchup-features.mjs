/**
 * MLB-002 · challenger mlb-pa-matchup-v1 — attach point-in-time matchup rates to an engine GameInput. PURE: the caller
 * supplies the pregame capture documents; nothing here reads a clock, the network or the filesystem.
 *
 * The rules are exactly those registered in docs/research/mlb/mlb-002/matchup-v1/PREREGISTRATION.md (amendments 1–3)
 * and frozen for the forward shadow (FORWARD-PREREGISTRATION.md): log5 inputs shrunk with fixed priors, the league
 * PA-by-slot reference, and these missing-data rules — unknown hand → pooled splits; unknown slot → the published
 * 3.85 PA; no splits / no season line → league rates. Every capture used must be at or before the cutoff and before
 * the game's first pitch; each one used is reported back with its capture time.
 */

export const MATCHUP_V1_ID = "mlb-pa-matchup-v1";
/** League constants frozen from dev-window captures (docs/research/mlb/mlb-002/matchup-v1/league-constants.json, a38523dba6). */
export const MATCHUP_V1_LEAGUE = Object.freeze({ k: 0.2174465920651068, bb: 0.0909861586362095, hr: 0.030934985665402755, hbp: 0.011 });
/** League PA by batting slot — a frozen copy of PA_BY_SLOT (scripts/capture-mlb-pregame-pa-opportunity.mjs); a test pins equality. */
export const MATCHUP_V1_PA_BY_SLOT = Object.freeze({ 1: 4.65, 2: 4.55, 3: 4.45, 4: 4.35, 5: 4.25, 6: 4.1, 7: 4.0, 8: 3.9, 9: 3.75 });
export const MATCHUP_V1_PRIORS = Object.freeze({
  batter: Object.freeze({ k: 60, bb: 120, hr: 170 }),
  pitcher: Object.freeze({ k: 70, bb: 170, hr: 500 }),
  prevSeasonWeight: 0.5,
  bfPerIp: 4.25,
  starterProjectionBf: 25,
  priorSplitsDays: 10,
  publishedPaPerGame: 3.85,
});

const ms = (iso) => {
  const t = Date.parse(iso ?? "");
  return Number.isFinite(t) ? t : null;
};
const usable = (doc, cutoff) => ms(doc?.capturedAt) != null && ms(doc.capturedAt) <= cutoff && ms(doc.capturedAt) < (ms(doc.eventStartTime) ?? Infinity);
const latest = (docs) => docs.slice().sort((a, b) => ms(b.capturedAt) - ms(a.capturedAt))[0] ?? null;
const shrink = (count, n, prior, league) => (count + prior * league) / (n + prior);

function splitCounts(doc, hand, w) {
  const keys = hand === "R" ? ["vsRHP"] : hand === "L" ? ["vsLHP"] : ["vsRHP", "vsLHP"];
  let pa = 0; let k = 0; let bb = 0; let hr = 0;
  for (const key of keys) {
    const a = doc.seasonSplits?.[key];
    const b = doc.previousSeason?.[key];
    if (a) { pa += a.pa ?? 0; k += a.k ?? 0; bb += a.bb ?? 0; hr += a.hr ?? 0; }
    if (b) { pa += w * (b.pa ?? 0); k += w * (b.k ?? 0); bb += w * (b.bb ?? 0); hr += w * (b.hr ?? 0); }
  }
  return { pa, k, bb, hr };
}

/**
 * @param {object} a
 * @param {object} a.input        the champion's GameInput (left untouched; a new object is returned)
 * @param {number} a.cutoffMs     the run's clock (generatedAt), never later than first pitch
 * @param {{k:number, bb:number, hr:number, hbp:number}} a.league  frozen league constants
 * @param {Record<number, number>} a.paBySlot  league PA by batting slot
 * @param {{ splitsSameGame: object[], splitsPrior: object[], workload: object[], matchup: object[] }} a.captures
 *        candidate capture documents (any times; filtered here)
 */
export function matchupInputFor({ input, cutoffMs, league: L, paBySlot, captures }) {
  const P = MATCHUP_V1_PRIORS;
  const used = [];
  const mu = latest((captures.matchup ?? []).filter((d) => d.gamePk === input.gamePk && usable(d, cutoffMs)));
  const pw = latest((captures.workload ?? []).filter((d) => d.gamePk === input.gamePk && usable(d, cutoffMs)));
  if (mu) used.push({ family: "matchup", capturedAt: mu.capturedAt });
  if (pw) used.push({ family: "pitcher_workload", capturedAt: pw.capturedAt });
  const hand = { home: mu?.homeStartingPitcher?.pitchHand ?? null, away: mu?.awayStartingPitcher?.pitchHand ?? null };
  const slotOf = new Map();
  for (const side of ["homeBatters", "awayBatters"]) for (const b of mu?.[side] ?? []) if (b.playerId && b.battingOrderSlot) slotOf.set(b.playerId, b.battingOrderSlot);
  const coverage = { batters: 0, battersWithSplits: 0, battersWithSlot: 0, starters: 0, startersWithLine: 0 };
  const c = input.completeness ?? {};
  const splitsFor = (playerId) => {
    const same = latest((captures.splitsSameGame ?? []).filter((d) => d.playerId === playerId && d.gamePk === input.gamePk && usable(d, cutoffMs)));
    if (same) return same;
    const floor = cutoffMs - P.priorSplitsDays * 86400e3;
    // Earlier-date captures are pregame by construction for THIS game; only the capture time is checked.
    return latest((captures.splitsPrior ?? []).filter((d) => d.playerId === playerId && ms(d.capturedAt) != null && ms(d.capturedAt) <= cutoffMs && ms(d.capturedAt) >= floor));
  };
  const lineup = (rows, confirmed, oppHand) => rows.map((b, i) => {
    coverage.batters += 1;
    if (!Number.isFinite(b.playerId) || b.playerId < 0) return b; // replacement-level filler keeps the published model
    const doc = splitsFor(b.playerId);
    const slot = confirmed ? i + 1 : slotOf.get(b.playerId) ?? null;
    if (slot) coverage.battersWithSlot += 1;
    if (doc) { coverage.battersWithSplits += 1; used.push({ family: "batter_splits", playerId: b.playerId, capturedAt: doc.capturedAt }); }
    const rates = (h) => {
      if (!doc) return { k: L.k, bb: L.bb, hr: L.hr };
      const s = splitCounts(doc, h, P.prevSeasonWeight);
      return { k: shrink(s.k, s.pa, P.batter.k, L.k), bb: shrink(s.bb, s.pa, P.batter.bb, L.bb), hr: shrink(s.hr, s.pa, P.batter.hr, L.hr) };
    };
    return { ...b, matchup: { slotPa: slot ? paBySlot[slot] : P.publishedPaPerGame, vsStarter: rates(oppHand), vsBullpen: rates(null) } };
  });
  const starter = (s, side) => {
    if (!s) return s;
    coverage.starters += 1;
    const p = pw?.pitchers?.[side];
    const st = p && p.id === s.playerId ? p.seasonToDate : null;
    if (st) coverage.startersWithLine += 1;
    const bf = st ? (st.ip ?? 0) * P.bfPerIp : 0;
    const kProj = s.expStrikeouts != null && Number.isFinite(s.expStrikeouts) && s.expStrikeouts > 0 ? s.expStrikeouts / P.starterProjectionBf : null;
    return { ...s, matchup: { k: kProj ?? shrink(st?.k ?? 0, bf, P.pitcher.k, L.k), bb: shrink(st?.bb ?? 0, bf, P.pitcher.bb, L.bb), hr: shrink(st?.hr ?? 0, bf, P.pitcher.hr, L.hr) } };
  };
  return {
    input: {
      ...input,
      awayLineup: lineup(input.awayLineup, c.awayLineupSource === "confirmed", hand.home),
      homeLineup: lineup(input.homeLineup, c.homeLineupSource === "confirmed", hand.away),
      awayStarter: starter(input.awayStarter, "away"),
      homeStarter: starter(input.homeStarter, "home"),
    },
    coverage,
    captures: used,
  };
}
