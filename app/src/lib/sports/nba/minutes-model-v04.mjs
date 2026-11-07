/**
 * NBA v0.4 CANDIDATE (NOT ARMED) minutes model: v0.3's role prior with a LAGGED prior season for returners. PURE, no I/O.
 * NBA REGULAR SEASON — CANDIDATE SHADOW (NOT ARMED) · dataClass PRIVATE_RESEARCH · productEligible: false.
 *
 * WHY (docs/nba/NBA_PROJECTION_COVERAGE_GAP_2026-10-22.md). On the 2026-10-21 slate 7 rostered, not-Out players with NBA
 * history got NO projection from v0.1 or from the v0.3 replay (Irving, VanVleet, Lillard, Haliburton, Lyles, Niang,
 * Beekman). Each missed all of 2025-26 (injury or absence), and both families only read the newest season:
 *   - v0.1: minutes-model.mjs:97-98 (the team's newest season only) and roster-gated-pool.mjs:127-131 (the last-team
 *     lookup reads that team's newest season again) → INSUFFICIENT_HISTORY;
 *   - v0.3: minutes-model-v03.mjs:71-78 (seasons S and S−1 only) → no appearances → roleEstimate W = 0 → null.
 *
 * THE ONE v0.4 RULE (everything else is v0.3, called unchanged — minutes-model-v03.mjs and game-sim-v03.mjs are not
 * edited and stay pinned by their own FROZEN_SOURCES test):
 *   ROLE-PRIOR SEASON = S−1 when the athlete has >= MIN_GAMES_FOR_RATES (3, the frozen v0 constant) regular-season
 *   appearances in it; otherwise the most recent of S−2 … S−MAX_PRIOR_LAG that has them; otherwise S−1 (v0.3 exactly).
 *   The lagged season is used exactly as v0.3 uses S−1 (worth PRIOR_GAMES = 10 appearances, blended toward the current
 *   season, coach's-decision play rate) — no shrink, no discount, no new weight.
 * An athlete whose S−1 already qualifies gets the v0.3 record unchanged, so v0.4 differs from v0.3 only for lagged
 * athletes (pinned in minutes-model-v04.test.mjs).
 *
 * NEW CONSTANT (needs founder approval before arming; methodology constants need a source):
 *   MAX_PRIOR_LAG = 2 — bridges exactly one missed season. Source: structural, not fitted. corpus-v1 holds three
 *   regular seasons (2023-24 … 2025-26), so for a 2026-27 forecast S−2 = 2024-25 is the oldest season that is still one
 *   season stale; S−3 would be two seasons stale. No 2026-27 outcome and no market line was used to choose it.
 *
 * NOT COVERED: rookies (no NBA history) stay INSUFFICIENT_HISTORY (null, never 0). A rookie prior needs either a draft
 * capture (D-series approval) or a preregistration §3 amendment to read preseason minutes — see the design doc §4.
 */
import { MIN_GAMES_FOR_RATES } from "./minutes-model.mjs";
import { inPopulation, corpusSeasonOfDate } from "./sim-v1-profile.mjs";
import { indexRoleHistory, gatePoolV03, PARAMS as V03_PARAMS } from "./minutes-model-v03.mjs";

export const MINUTES_MODEL_V04_VERSION = "nba-minutes-model-v0.4-lagged-role-prior";
export const POOL_V04_VERSION = "nba-roster-gated-pool-v0.4";
export const PARAMS_V04 = Object.freeze({ ...V03_PARAMS, MAX_PRIOR_LAG: 2 });
export const V04_RULE = "v0.3 pool and role prior; the role-prior season is S−1 when it holds >= MIN_GAMES_FOR_RATES regular-season appearances, else the most recent of S−2…S−MAX_PRIOR_LAG that does, else S−1";

/**
 * The v0.3 index (indexRoleHistory, called unchanged) plus, for an athlete whose S−1 has fewer than MIN_GAMES_FOR_RATES
 * appearances, the most recent qualifying lagged season substituted as his prior. Pure. Same appearance rules as v0.3:
 * population filter (inPopulation), strictly before the instant, DNPs excluded (coach's decisions counted), minutes > 0.
 */
export function indexRoleHistoryV04(boxscores, { asOfDateUtc, population = "regular" }) {
  const base = indexRoleHistory(boxscores, { asOfDateUtc, population });
  const { currentSeason, priorSeason } = base;
  const lagSeasons = [];
  for (let k = 2; k <= PARAMS_V04.MAX_PRIOR_LAG; k += 1) lagSeasons.push(currentSeason - k);
  const cutoff = Date.parse(asOfDateUtc);
  const old = new Map(); // athleteId → { name, apps: {season: []}, coachDnp: {season: n}, dnp, nullMin, lastTeam, lastSeenDateUtc }
  const docs = (Array.isArray(boxscores) ? boxscores : [])
    .filter((d) => d?.boxscoreAvailable && typeof d.dateUtc === "string" && Date.parse(d.dateUtc) < cutoff && inPopulation(d.phase, population))
    .map((d) => ({ d, t: Date.parse(d.dateUtc), season: Number.isInteger(d.season) ? d.season : corpusSeasonOfDate(d.dateUtc) }))
    .filter((x) => lagSeasons.includes(x.season))
    .sort((a, b) => a.t - b.t || String(a.d.providerEventId).localeCompare(String(b.d.providerEventId)));
  for (const { d, season } of docs) {
    for (const p of d.players ?? []) {
      if (p?.providerAthleteId == null) continue;
      const id = String(p.providerAthleteId);
      let rec = old.get(id);
      if (!rec) { rec = { name: p.name ?? null, apps: Object.fromEntries(lagSeasons.map((s) => [s, []])), coachDnp: Object.fromEntries(lagSeasons.map((s) => [s, 0])), dnp: 0, nullMin: 0, lastTeam: null, lastSeenDateUtc: null }; old.set(id, rec); }
      if (p.name) rec.name = p.name;
      if (p.didNotPlay) { rec.dnp += 1; if (/COACH/i.test(String(p.dnpReason ?? ""))) rec.coachDnp[season] += 1; continue; }
      if (!Number.isInteger(p.minutes)) { rec.nullMin += 1; continue; }
      if (p.minutes <= 0) continue;
      rec.apps[season].push({ minutes: p.minutes, starter: p.starter === true, pts: p.pts, reb: p.reb, ast: p.ast, threePm: p.threePm, teamId: String(p.providerTeamId) });
      rec.lastTeam = String(p.providerTeamId);
      rec.lastSeenDateUtc = d.dateUtc;
    }
  }
  const byAthlete = new Map(base.byAthlete);
  const lagged = new Map();
  for (const [id, o] of old) {
    const cur = base.byAthlete.get(id) ?? null;
    if ((cur?.apps?.[priorSeason]?.length ?? 0) >= MIN_GAMES_FOR_RATES) continue; // S−1 qualifies → v0.3's record, untouched
    const season = lagSeasons.find((s) => o.apps[s].length >= MIN_GAMES_FOR_RATES);
    if (season == null) continue;
    byAthlete.set(id, {
      providerAthleteId: id,
      name: cur?.name ?? o.name,
      apps: { [priorSeason]: o.apps[season], [currentSeason]: cur?.apps?.[currentSeason] ?? [] },
      coachDnp: { [priorSeason]: o.coachDnp[season], [currentSeason]: cur?.coachDnp?.[currentSeason] ?? 0 },
      dnpCount: (cur?.dnpCount ?? 0) + o.dnp,
      nullMinutesCount: (cur?.nullMinutesCount ?? 0) + o.nullMin,
      lastTeam: cur?.lastTeam ?? o.lastTeam,
      lastSeenDateUtc: cur?.lastSeenDateUtc ?? o.lastSeenDateUtc,
    });
    lagged.set(id, { priorSeasonUsed: season, lagSeasons: currentSeason - season, priorSeasonAppearancesSkipped: cur?.apps?.[priorSeason]?.length ?? 0 });
  }
  return { ...base, byAthlete, lagged, maxPriorLag: PARAMS_V04.MAX_PRIOR_LAG };
}

/**
 * The v0.4 roster-gated pool: gatePoolV03 (same gate, same rows, same normalisation) over the v0.4 index, restamped
 * with the v0.4 versions and the list of lagged athletes. Pure.
 */
export function gatePoolV04({ rosters, providerTeamId, boxscores, asOfDateUtc, injuries = null, population = "regular", roleIndex = null }) {
  const idx = roleIndex ?? indexRoleHistoryV04(boxscores, { asOfDateUtc, population });
  if (!(idx.lagged instanceof Map)) throw new Error("gatePoolV04: roleIndex must come from indexRoleHistoryV04");
  const r = gatePoolV03({ rosters, providerTeamId, boxscores, asOfDateUtc, injuries, population, roleIndex: idx });
  if (r.state !== "GATED") return { ...r, gate: { ...r.gate, poolVersion: POOL_V04_VERSION } };
  const rows = r.rows.map((row) => {
    const lag = idx.lagged.get(row.providerAthleteId) ?? null;
    return { ...row, priorSeasonUsed: lag ? lag.priorSeasonUsed : idx.priorSeason, priorLagSeasons: lag ? lag.lagSeasons : 1 };
  });
  const laggedPrior = rows.filter((x) => x.priorLagSeasons > 1)
    .map((x) => ({ providerAthleteId: x.providerAthleteId, name: x.name, priorSeasonUsed: x.priorSeasonUsed, priorGames: x.priorGames, expectedMinutes: x.expectedMinutes, minutesState: x.minutesState }));
  return {
    ...r,
    modelVersion: MINUTES_MODEL_V04_VERSION,
    rows,
    gate: { ...r.gate, poolVersion: POOL_V04_VERSION, minutesModel: MINUTES_MODEL_V04_VERSION, params: { ...PARAMS_V04 }, rule: `${r.gate.rule}; ${V04_RULE}`, laggedPrior },
  };
}
