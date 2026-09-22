/**
 * NBA sim dispersion diagnostic (NBA readiness, v0 → v1 calibration evidence) — READ-ONLY harness.
 * NBA PRESEASON — EXPERIMENTAL · dataClass PRIVATE_RESEARCH · productEligible: false.
 *
 * Runs the UNCHANGED game-sim.mjs on a deterministic sample of HISTORICAL regular-season games with
 * strictly as-of inputs (Elo through the tip-off instant, minutes/rates from box scores strictly
 * before it, no injuries feed — the feed did not exist then, and "unknown" is not "active" but the
 * v0 pool rule treats unknown as playable, exactly as the artifact records), and decomposes the
 * simulated margin/total dispersion by switching noise sources off one at a time:
 *
 *   full          minutes ~ N(mu, sd_m) AND per-minute rates ~ N(r, sd_r)  (the v0 artifact)
 *   minutesFixed  minutes pinned at expectation, rate noise on
 *   ratesFixed    rates pinned at expectation, minutes noise on
 *   bothFixed     both pinned — what is left is score rounding only
 *
 * plus an ANALYTIC per-player partition of the independent-sum variance (rate term mu²·sd_r²,
 * minutes term r²·sd_m², cross term sd_m²·sd_r²), and the corpus-measured facts the sim ignores:
 * within-team covariance (team pts variance ÷ sum of player pts variances) and the between-team
 * score correlation (from total vs margin variance). Nothing here changes a model constant; it
 * produces the evidence for docs/V17_NBA_SIM_DISPERSION_DIAGNOSTIC.md and the v1 preregistration.
 *
 * Run (from app/):
 *   npx tsx scripts/nba/diagnose-sim-dispersion.mjs --season 2025 --games 60 --simulations 4000 [--write]
 * --season is the CORPUS season label (2025 = the 2024-25 season). --write stores the report under
 * data/internal/research/nba/reports/sim-dispersion-diagnostic-<season>.json (internal research only).
 * Exit: 0 ok · 1 usage / refused
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildTeamRatings, ratingFor, winProbability } from "../../src/lib/sports/nba/team-rating.mjs";
import { expectedMinutes, STAT_KEYS } from "../../src/lib/sports/nba/minutes-model.mjs";
import { simulateGame, prepareRoster, NBA_SIM_MODEL_VERSION, MINUTES_RESCALE_BOUNDS, DEFAULT_MINUTES_SD_RATIO } from "../../src/lib/sports/nba/game-sim.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const NBA = path.resolve(APP, "..", "data", "internal", "research", "nba");
const CORPUS = path.join(NBA, "corpus-v1.json");
const BOXSCORES = path.join(NBA, "boxscores");
const REPORTS = path.join(NBA, "reports");

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n) => { const i = argv.indexOf(n); return i === -1 ? null : argv[i + 1] ?? null; };
const SEASON = Number(opt("--season") ?? 2025);
const GAMES = Number(opt("--games") ?? 60);
const SIMS = Number(opt("--simulations") ?? 4000);
const WRITE = flag("--write");
const MIN_DAYS_INTO_SEASON = 30; // trailing-10 windows must exist; earlier games would test cold starts, not dispersion
if (![2024, 2025, 2026].includes(SEASON)) { console.error("REFUSED: --season must be a corpus season (2024 · 2025 · 2026)"); process.exit(1); }
if (!Number.isInteger(GAMES) || GAMES < 5) { console.error("REFUSED: --games ≥ 5"); process.exit(1); }
if (!Number.isInteger(SIMS) || SIMS < 100) { console.error("REFUSED: --simulations ≥ 100"); process.exit(1); }

const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const corpus = readJson(CORPUS);
const rows = corpus.rows ?? [];
const boxscores = fs.readdirSync(BOXSCORES).filter((f) => /^\d+\.json$/.test(f)).map((f) => readJson(path.join(BOXSCORES, f)));
const boxById = new Map(boxscores.map((d) => [String(d.providerEventId), d]));

/* ─────────────── realized dispersion from the corpus (the target) ─────────────── */
const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const pvar = (xs) => { const m = mean(xs); return xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length; };
const sd = (xs) => Math.sqrt(pvar(xs));
const r2 = (x) => (x == null || !Number.isFinite(x) ? null : Number(x.toFixed(2)));
const r3 = (x) => (x == null || !Number.isFinite(x) ? null : Number(x.toFixed(3)));
function realized(label, rs) {
  const m = rs.map((r) => r.ftHome - r.ftAway), t = rs.map((r) => r.ftHome + r.ftAway);
  const h = rs.map((r) => r.ftHome), a = rs.map((r) => r.ftAway);
  const cov = (pvar(t) - pvar(m)) / 4;
  return { label, n: rs.length, marginMean: r2(mean(m)), marginSD: r2(sd(m)), marginAbsMean: r2(mean(m.map(Math.abs))), totalMean: r2(mean(t)), totalSD: r2(sd(t)), homeSD: r2(sd(h)), awaySD: r2(sd(a)), corrHomeAway: r3(cov / (sd(h) * sd(a))) };
}
const reg = rows.filter((r) => r.phase === 2), pre = rows.filter((r) => r.phase === 1);
const realizedTable = [
  realized("regular · all seasons", reg), realized("regular · non-OT", reg.filter((r) => !r.overtime)), realized("regular · OT only", reg.filter((r) => r.overtime)),
  realized(`regular · season ${SEASON}`, reg.filter((r) => r.season === SEASON)), realized(`regular · season ${SEASON} · non-OT`, reg.filter((r) => r.season === SEASON && !r.overtime)),
  realized("preseason · all seasons", pre), realized("preseason · non-OT", pre.filter((r) => !r.overtime)),
];

/* ─────────────── within-team covariance the sim ignores (corpus, non-OT regular season) ─────────────── */
function withinTeam(season) {
  const ids = reg.filter((r) => r.season === season && !r.overtime).map((r) => String(r.providerEventId));
  const teamGames = new Map();
  for (const id of ids) {
    const doc = boxById.get(id); if (!doc) continue;
    for (const t of doc.teams) {
      const pl = new Map(); let tp = 0;
      for (const p of doc.players) { if (p.providerTeamId !== t.providerTeamId || p.didNotPlay || !Number.isInteger(p.minutes) || !Number.isInteger(p.pts)) continue; pl.set(p.providerAthleteId, p.pts); tp += p.pts; }
      if (!teamGames.has(t.providerTeamId)) teamGames.set(t.providerTeamId, []);
      teamGames.get(t.providerTeamId).push({ pl, tp });
    }
  }
  const ratios = [], teamSDs = [], sumSDs = [];
  for (const gs of teamGames.values()) {
    const teamVar = pvar(gs.map((g) => g.tp));
    const byP = new Map();
    for (const g of gs) for (const [pid, pts] of g.pl) { if (!byP.has(pid)) byP.set(pid, []); byP.get(pid).push(pts); }
    let s = 0; for (const xs of byP.values()) if (xs.length >= 5) s += pvar(xs) * xs.length / gs.length; // appearance-weighted (absent ≠ zero)
    ratios.push(teamVar / s); teamSDs.push(Math.sqrt(teamVar)); sumSDs.push(Math.sqrt(s));
  }
  return { season, teams: teamGames.size, teamPtsSD: r2(mean(teamSDs)), sqrtSumPlayerVar: r2(mean(sumSDs)), ratioTeamVarToSumPlayerVar: r3(mean(ratios)), note: "ratio < 1 ⇒ teammates' points are NEGATIVELY correlated (shared possessions); an independent sum overstates team SD by 1/sqrt(ratio)" };
}
const within = withinTeam(SEASON);

/* ─────────────── sample ─────────────── */
const seasonRows = reg.filter((r) => r.season === SEASON).sort((a, b) => Date.parse(a.dateUtc) - Date.parse(b.dateUtc) || String(a.providerEventId).localeCompare(String(b.providerEventId)));
const seasonStart = Date.parse(seasonRows[0].dateUtc);
const eligible = seasonRows.filter((r) => Date.parse(r.dateUtc) >= seasonStart + MIN_DAYS_INTO_SEASON * 86400_000 && boxById.get(String(r.providerEventId))?.boxscoreAvailable);
const step = Math.max(1, Math.floor(eligible.length / GAMES));
const sample = eligible.filter((_, i) => i % step === 0).slice(0, GAMES);

/* ─────────────── configurations ─────────────── */
function poolRates(rowsIn) {
  const pool = rowsIn.filter((r) => r.availability !== "out" && Number.isFinite(r.expectedMinutes) && r.expectedMinutes > 0);
  const out = {};
  for (const k of STAT_KEYS) {
    const withRate = pool.filter((r) => r.rates && Number.isFinite(r.rates[k]));
    const w = withRate.reduce((s, r) => s + r.expectedMinutes, 0);
    out[k] = w > 0 ? withRate.reduce((s, r) => s + r.rates[k] * r.expectedMinutes, 0) / w : null;
  }
  return out;
}
/** Rewrite a minutes result so every pooled player has explicit rates (pool fallback made explicit) and the requested sds. */
function configure(minutesResult, { fixMinutes, fixRates }) {
  const pool = poolRates(minutesResult.rows);
  const rows = minutesResult.rows.map((r) => {
    const rates = Object.fromEntries(STAT_KEYS.map((k) => [k, r.rates && Number.isFinite(r.rates[k]) ? r.rates[k] : pool[k]]));
    const rateSd = Object.fromEntries(STAT_KEYS.map((k) => [k, fixRates ? 0 : (r.rateSd && Number.isFinite(r.rateSd[k]) ? r.rateSd[k] : (rates[k] != null ? rates[k] * 0.5 : null))]));
    const minutesSd = fixMinutes ? 0 : (Number.isFinite(r.minutesSd) ? r.minutesSd : (Number.isFinite(r.expectedMinutes) ? r.expectedMinutes * DEFAULT_MINUTES_SD_RATIO : null));
    return { ...r, rates, rateSd, minutesSd };
  });
  return { ...minutesResult, rows };
}
const CONFIGS = { full: { fixMinutes: false, fixRates: false }, minutesFixed: { fixMinutes: true, fixRates: false }, ratesFixed: { fixMinutes: false, fixRates: true }, bothFixed: { fixMinutes: true, fixRates: true } };

/** Analytic partition of the independent-sum points variance for one prepared side (the sim's own roster after rescale). */
function analytic(sidePlayers) {
  let rateTerm = 0, minutesTerm = 0, crossTerm = 0;
  for (const p of sidePlayers) {
    const mu = p.expectedMinutes, sm = p.minutesSd ?? 0, r = p.rates.pts ?? 0, sr = p.rateSd.pts ?? 0;
    rateTerm += mu * mu * sr * sr; minutesTerm += r * r * sm * sm; crossTerm += sm * sm * sr * sr;
  }
  return { rateTerm, minutesTerm, crossTerm };
}

/* ─────────────── run ─────────────── */
console.log(`sim dispersion diagnostic · corpus season ${SEASON} · ${sample.length} sampled regular-season games (every ${step}th of ${eligible.length} eligible after day ${MIN_DAYS_INTO_SEASON}) · ${SIMS} sims · model ${NBA_SIM_MODEL_VERSION}`);
const perGame = [];
const agg = Object.fromEntries(Object.keys(CONFIGS).map((c) => [c, { marginSD: [], totalSD: [], homeSD: [], marginErr: [], totalErr: [], cover80Margin: 0, cover80Total: 0, brier: [], tie: [] }]));
const eloBrier = [];
const an = { rateTerm: [], minutesTerm: [], crossTerm: [], rescale: [], poolSize: [], defaultSd: [], poolRateSubs: [], scaledPool: [] };
for (const g of sample) {
  const box = boxById.get(String(g.providerEventId));
  const homeId = box.teams.find((t) => t.homeAway === "home")?.providerTeamId, awayId = box.teams.find((t) => t.homeAway === "away")?.providerTeamId;
  if (!homeId || !awayId) continue;
  const now = g.dateUtc;
  const ratings = buildTeamRatings(rows, { throughDateUtc: now, targetSeason: SEASON });
  const hr = ratingFor(ratings, g.home), ar = ratingFor(ratings, g.away);
  const eloP = winProbability(hr.rating, ar.rating, { neutralSite: g.neutralSite === true });
  const y = g.ftHome > g.ftAway ? 1 : 0;
  eloBrier.push((eloP - y) ** 2);
  const hm = expectedMinutes({ boxscores, teamProviderId: homeId, asOfDateUtc: now, injuries: null, population: "regular" });
  const am = expectedMinutes({ boxscores, teamProviderId: awayId, asOfDateUtc: now, injuries: null, population: "regular" });
  const rec = { providerEventId: String(g.providerEventId), dateUtc: now, matchup: `${g.away} @ ${g.home}`, final: { ftHome: g.ftHome, ftAway: g.ftAway, overtime: g.overtime === true }, eloPHome: r3(eloP), configs: {} };
  for (const [name, cfg] of Object.entries(CONFIGS)) {
    const out = simulateGame({ providerEventId: g.providerEventId, inputAsOf: now, neutralSite: g.neutralSite === true, home: { name: g.home, providerTeamId: homeId, rating: hr, minutes: configure(hm, cfg) }, away: { name: g.away, providerTeamId: awayId, rating: ar, minutes: configure(am, cfg) }, eloWinProbability: eloP, simulations: SIMS });
    const s = out.sim, a = agg[name];
    a.marginSD.push(s.margin.sd); a.totalSD.push(s.total.sd); a.homeSD.push(s.home.sd);
    a.marginErr.push(s.margin.mean - (g.ftHome - g.ftAway)); a.totalErr.push(s.total.mean - (g.ftHome + g.ftAway));
    const rm = g.ftHome - g.ftAway, rt = g.ftHome + g.ftAway;
    if (rm >= s.margin.p10 && rm <= s.margin.p90) a.cover80Margin += 1;
    if (rt >= s.total.p10 && rt <= s.total.p90) a.cover80Total += 1;
    a.brier.push((s.pHome - y) ** 2); a.tie.push(s.tieMass);
    rec.configs[name] = { pHome: s.pHome, marginMean: s.margin.mean, marginSD: s.margin.sd, totalMean: s.total.mean, totalSD: s.total.sd, tieMass: s.tieMass };
    if (name === "full") {
      const ah = analytic(prepareRoster(configure(hm, cfg)).players), aa = analytic(prepareRoster(configure(am, cfg)).players); // prepared (rescaled) rosters carry rateSd; the artifact view does not
      an.rateTerm.push(ah.rateTerm + aa.rateTerm); an.minutesTerm.push(ah.minutesTerm + aa.minutesTerm); an.crossTerm.push(ah.crossTerm + aa.crossTerm);
      for (const side of ["home", "away"]) { const m = out.assumptions.minutes[side]; an.rescale.push(m.rescaleFactor); an.poolSize.push(out.assumptions.availability[side].poolSize); an.defaultSd.push(m.defaultSdSubstitutions); an.poolRateSubs.push(m.poolRateSubstitutions); an.scaledPool.push(m.scaledPoolMinutes); }
    }
  }
  perGame.push(rec);
}

const n = perGame.length;
const sampleRealized = realized(`sampled ${n} games`, sample.slice(0, n));
const decomposition = Object.fromEntries(Object.entries(agg).map(([name, a]) => [name, {
  simMarginSD_mean: r2(mean(a.marginSD)), simTotalSD_mean: r2(mean(a.totalSD)), simHomeSD_mean: r2(mean(a.homeSD)),
  forecastErrorSD_margin: r2(sd(a.marginErr)), forecastErrorSD_total: r2(sd(a.totalErr)), marginBias: r2(mean(a.marginErr)), totalBias: r2(mean(a.totalErr)),
  coverage80_margin: r3(a.cover80Margin / n), coverage80_total: r3(a.cover80Total / n), simBrier: r3(mean(a.brier)), tieMass_mean: r3(mean(a.tie)),
}]));
const analyticPartition = {
  note: "variance of the INDEPENDENT player sum (both teams), from the prepared v0 rosters: sqrt of each term, points; the sum of the three ≈ the full-config margin variance before clipping/rounding",
  rateTermSD: r2(Math.sqrt(mean(an.rateTerm))), minutesTermSD: r2(Math.sqrt(mean(an.minutesTerm))), crossTermSD: r2(Math.sqrt(mean(an.crossTerm))),
  totalIndependentSD: r2(Math.sqrt(mean(an.rateTerm) + mean(an.minutesTerm) + mean(an.crossTerm))),
  rescaleFactor_mean: r3(mean(an.rescale)), rescaleFactor_min: r3(Math.min(...an.rescale)), rescaleFactor_max: r3(Math.max(...an.rescale)), rescaleBounds: { ...MINUTES_RESCALE_BOUNDS },
  poolSize_mean: r2(mean(an.poolSize)), scaledPoolMinutes_mean: r2(mean(an.scaledPool)), defaultSdSubstitutions_perSide: r2(mean(an.defaultSd)), poolRateSubstitutions_perSide: r2(mean(an.poolRateSubs)),
};
const report = {
  schemaVersion: 1, artifact: "nba-sim-dispersion-diagnostic", dataClass: "PRIVATE_RESEARCH", productEligible: false,
  modelVersion: NBA_SIM_MODEL_VERSION, generatedAt: new Date().toISOString(), season: SEASON, sampledGames: n, simulations: SIMS, sampling: { minDaysIntoSeason: MIN_DAYS_INTO_SEASON, eligible: eligible.length, step },
  realized: realizedTable, sampleRealized, withinTeamCovariance: within, eloBrier_sample: r3(mean(eloBrier)),
  decomposition, analyticPartition, perGame,
};
console.log("\nREALIZED (corpus):");
for (const r of realizedTable) console.log(`  ${r.label.padEnd(34)} n=${String(r.n).padStart(5)} marginSD ${r.marginSD} · totalSD ${r.totalSD} · homeSD ${r.homeSD} · corr(H,A) ${r.corrHomeAway} · |margin| ${r.marginAbsMean}`);
console.log(`  sample: marginSD ${sampleRealized.marginSD} · totalSD ${sampleRealized.totalSD}`);
console.log(`WITHIN-TEAM: team pts SD ${within.teamPtsSD} vs sqrt(Σ player var) ${within.sqrtSumPlayerVar} → ratio ${within.ratioTeamVarToSumPlayerVar}`);
console.log("\nDECOMPOSITION (sim, mean over sampled games):");
for (const [name, d] of Object.entries(decomposition)) console.log(`  ${name.padEnd(13)} simMarginSD ${d.simMarginSD_mean} · simTotalSD ${d.simTotalSD_mean} · errSD margin ${d.forecastErrorSD_margin} total ${d.forecastErrorSD_total} · bias margin ${d.marginBias} total ${d.totalBias} · cover80 margin ${d.coverage80_margin} total ${d.coverage80_total} · brier ${d.simBrier} · tie ${d.tieMass_mean}`);
console.log(`  elo brier ${report.eloBrier_sample}`);
console.log(`ANALYTIC: rate ${analyticPartition.rateTermSD} · minutes ${analyticPartition.minutesTermSD} · cross ${analyticPartition.crossTermSD} · independent total ${analyticPartition.totalIndependentSD} · rescale mean ${analyticPartition.rescaleFactor_mean} [${analyticPartition.rescaleFactor_min}, ${analyticPartition.rescaleFactor_max}] · pool ${analyticPartition.poolSize_mean} · scaled pool min ${analyticPartition.scaledPoolMinutes_mean} · default-sd/side ${analyticPartition.defaultSdSubstitutions_perSide} · pool-rate/side ${analyticPartition.poolRateSubstitutions_perSide}`);
if (WRITE) {
  fs.mkdirSync(REPORTS, { recursive: true });
  const out = path.join(REPORTS, `sim-dispersion-diagnostic-${SEASON}.json`);
  fs.writeFileSync(out, JSON.stringify(report, null, 1));
  console.log(`wrote ${path.relative(path.resolve(APP, ".."), out)}`);
} else console.log("dry run — pass --write to store the report");
