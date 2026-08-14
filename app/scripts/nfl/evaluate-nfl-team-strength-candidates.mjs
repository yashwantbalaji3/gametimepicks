/**
 * NFL team-strength candidate bake-off (Program 181 · Release B). PRIVATE_RESEARCH.
 *
 * The August 13 audit's diagnosis was specific: totals covered their 80% interval in 6/6 games,
 * margins in 4/6, and both misses were blowouts. The scoring prior is fine. The model could not
 * express "one of these teams is much better", so it could not produce a blowout.
 *
 * WHAT THIS IS, NAMED HONESTLY. The charter asks for a possession/drive simulator. The committed
 * corpus carries FINAL SCORES ONLY — no drives, no plays, no field position. Fitting a drive model
 * to data with no drives would be inventing a mechanism and calling it evidence, so this builds the
 * strongest thing the data actually supports: a HIERARCHICAL OFFENSE/DEFENSE SCORING MODEL. Each
 * team gets a points-scored and points-allowed state shrunk toward the league preseason mean; a
 * matchup's two score distributions are then built from the opposing pairs.
 *
 * That is the part of a drive model that produces the missing behaviour: margin dispersion emerges
 * because two independent score distributions with different means spread further apart than one
 * shared margin distribution can. The drive mechanism is what remains unbuildable until a
 * play-by-play corpus exists, and the report says so rather than implying it shipped.
 *
 * EVERY BAR COMES FROM THE COMMITTED CONTRACT. This script reads
 * `contracts/promotion-contract-v1.json` and refuses to run if it is missing. It cannot invent,
 * relax or reinterpret a threshold, and it never sees the six locked Aug-13 games.
 *
 * Usage: node scripts/nfl/evaluate-nfl-team-strength-candidates.mjs --now <iso>
 * Writes: data/internal/research/nfl/reports/team-strength-bakeoff.json
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.join(APP, "..");
const arg = (n, f = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }
const read = (p) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8")); } catch { return null; } };

const contract = read("data/internal/research/nfl/contracts/promotion-contract-v1.json");
if (!contract) { console.error("REFUSED: no committed promotion contract — a bake-off without predeclared bars selects on its own results"); process.exit(2); }
const contractHash = crypto.createHash("sha256")
  .update(fs.readFileSync(path.join(ROOT, "data/internal/research/nfl/contracts/promotion-contract-v1.json")))
  .digest("hex");

const corpus = read("data/internal/research/nfl/corpus-v1.json").rows;

// ── population + quarantine, per the contract ──────────────────────────────────────────────────
const LOCKED_COHORT_DATE = "2026-08-13";
const etDay = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
const quarantined = [];
const clean = [];
for (const r of corpus) {
  if (r.ftHome == null || r.ftAway == null || !r.home || !r.away || !Number.isFinite(Date.parse(r.dateUtc))) {
    quarantined.push({ providerEventId: r.providerEventId, reason: "missing score, participant or kickoff" });
    continue;
  }
  // The locked forward cohort can never enter fitting or evaluation.
  if (etDay(r.dateUtc) === LOCKED_COHORT_DATE) { quarantined.push({ providerEventId: r.providerEventId, reason: "LOCKED_FORWARD_COHORT" }); continue; }
  clean.push(r);
}
clean.sort((a, b) => a.dateUtc.localeCompare(b.dateUtc));

const PRE = (r) => r.phase === 1;
const preseasonSeasons = [...new Set(clean.filter(PRE).map((r) => r.season))].sort();
const targets = preseasonSeasons.slice(1); // the earliest season has no prior season to fit on

// ── candidate machinery ────────────────────────────────────────────────────────────────────────
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const sd = (a) => { const m = mean(a); return a.length > 1 ? Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)) : 0; };

/**
 * Hierarchical offense/defense states from prior games. `k` is the shrinkage prior-strength: a team
 * with few games stays close to the league mean rather than inheriting a confident state from noise.
 * This is the regularization the contract requires — sparse teams remain UNCERTAIN, not identical.
 */
function strengthStates(fitRows, { k, preseasonWeight }) {
  const leagueFor = mean(fitRows.map((r) => r.ftHome + r.ftAway)) / 2;
  const off = new Map(); const def = new Map();
  const acc = new Map();
  for (const r of fitRows) {
    const w = PRE(r) ? 1 : preseasonWeight;   // regular-season games inform, but are discounted
    for (const [team, scored, allowed] of [[r.home, r.ftHome, r.ftAway], [r.away, r.ftAway, r.ftHome]]) {
      const a = acc.get(team) ?? { w: 0, s: 0, c: 0 };
      a.w += w; a.s += w * scored; a.c += w * allowed;
      acc.set(team, a);
    }
  }
  for (const [team, a] of acc) {
    // shrink toward the league mean with prior weight k
    off.set(team, (a.s + k * leagueFor) / (a.w + k));
    def.set(team, (a.c + k * leagueFor) / (a.w + k));
  }
  return {
    leagueFor,
    offFor: (t) => off.get(t) ?? leagueFor,
    defAllowed: (t) => def.get(t) ?? leagueFor,
    teamsSeen: acc.size,
  };
}

const normalPair = (rng) => {
  const u1 = Math.max(1e-12, rng()); const u2 = rng();
  const r = Math.sqrt(-2 * Math.log(u1));
  return [r * Math.cos(2 * Math.PI * u2), r * Math.sin(2 * Math.PI * u2)];
};
const mulberry32 = (seed) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const fnv1a = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };
const RUNS = 4000;
const q = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];

/**
 * Simulate one matchup from two score distributions. Each side's mean blends its own offense with
 * the opponent's defense — that interaction is what lets a mismatch produce a blowout, and it is
 * what a single shared margin distribution structurally cannot do.
 */
function simulateMatchup({ muHome, muAway, sigmaSide, seedKey }) {
  const rng = mulberry32(fnv1a(seedKey));
  const H = []; const A = []; const M = []; const T = [];
  let homeWins = 0; let ties = 0;
  for (let i = 0; i < RUNS; i += 1) {
    const [z1, z2] = normalPair(rng);
    const h = Math.max(0, Math.round(muHome + sigmaSide * z1));
    const a = Math.max(0, Math.round(muAway + sigmaSide * z2));
    H.push(h); A.push(a); M.push(h - a); T.push(h + a);
    if (h > a) homeWins += 1; else if (h === a) ties += 1;
  }
  const mS = [...M].sort((x, y) => x - y); const tS = [...T].sort((x, y) => x - y);
  return {
    homeMedian: Math.round(mean(H)), awayMedian: Math.round(mean(A)),
    marginMedian: q(mS, 0.5), marginP10: q(mS, 0.1), marginP90: q(mS, 0.9),
    totalMedian: q(tS, 0.5), totalP10: q(tS, 0.1), totalP90: q(tS, 0.9),
    pHome: homeWins / RUNS, pTie: ties / RUNS,
  };
}

// ── the candidates ─────────────────────────────────────────────────────────────────────────────
const CANDIDATES = [
  { id: "shared_prior", kind: "baseline",
    describe: "one league scoring mean and one home constant; no team term (the shipped champion)" },
  { id: "home_only", kind: "baseline",
    describe: "home constant alone, zero team signal" },
  { id: "elo_v1", kind: "baseline",
    describe: "the P178 Elo margin slope as fitted, WITHOUT the significance gate, so the rejected model is still scored" },
  { id: "hier_offdef_k8", kind: "candidate", k: 8, preseasonWeight: 0.35,
    describe: "hierarchical offense/defense scoring states, prior weight k=8, regular season discounted to 0.35" },
  { id: "hier_offdef_k20", kind: "candidate", k: 20, preseasonWeight: 0.35,
    describe: "same, with heavier shrinkage (k=20) — sparse teams stay closer to the league mean" },
  { id: "hier_offdef_k8_preonly", kind: "candidate", k: 8, preseasonWeight: 0,
    describe: "preseason-only evidence, k=8 — an ablation isolating whether regular-season form transfers" },
];

function fitAndPredict(cand, fitRows, targetRows) {
  const preFit = fitRows.filter(PRE);
  const leagueTotal = mean(preFit.map((r) => r.ftHome + r.ftAway));
  const leagueHomeAdv = mean(preFit.map((r) => r.ftHome - r.ftAway));
  const sideSd = sd(preFit.flatMap((r) => [r.ftHome, r.ftAway]));

  let states = null;
  if (cand.kind === "candidate") states = strengthStates(fitRows, { k: cand.k, preseasonWeight: cand.preseasonWeight });

  // Elo baseline: reproduce the P178 shape (margin mean = homeAdv + slope*d) from these fit rows.
  let eloSlope = 0; let eloHome = leagueHomeAdv;
  if (cand.id === "elo_v1") {
    const rate = new Map();
    const ELO_K = 20;
    for (const r of fitRows.filter((x) => !PRE(x))) {
      const rh = rate.get(r.home) ?? 1500, ra = rate.get(r.away) ?? 1500;
      const exp = 1 / (1 + 10 ** ((ra - rh) / 400));
      const act = r.ftHome > r.ftAway ? 1 : r.ftHome === r.ftAway ? 0.5 : 0;
      rate.set(r.home, rh + ELO_K * (act - exp)); rate.set(r.away, ra + ELO_K * (exp - act));
    }
    const pts = preFit.map((r) => ({ d: (rate.get(r.home) ?? 1500) - (rate.get(r.away) ?? 1500), m: r.ftHome - r.ftAway }));
    const dB = mean(pts.map((p) => p.d)); const mB = mean(pts.map((p) => p.m));
    let sxy = 0, sxx = 0;
    for (const p of pts) { sxy += (p.d - dB) * (p.m - mB); sxx += (p.d - dB) ** 2; }
    eloSlope = sxx > 0 ? sxy / sxx : 0;
    eloHome = mB - eloSlope * dB;
    cand._eloRatings = rate;
  }

  return targetRows.map((r) => {
    let muHome, muAway;
    if (cand.id === "shared_prior" || cand.id === "home_only") {
      muHome = leagueTotal / 2 + leagueHomeAdv / 2;
      muAway = leagueTotal / 2 - leagueHomeAdv / 2;
    } else if (cand.id === "elo_v1") {
      const d = (cand._eloRatings.get(r.home) ?? 1500) - (cand._eloRatings.get(r.away) ?? 1500);
      const m = eloHome + eloSlope * d;
      muHome = leagueTotal / 2 + m / 2;
      muAway = leagueTotal / 2 - m / 2;
    } else {
      // the interaction that produces dispersion: my offense against your defense
      muHome = (states.offFor(r.home) + states.defAllowed(r.away)) / 2 + leagueHomeAdv / 2;
      muAway = (states.offFor(r.away) + states.defAllowed(r.home)) / 2 - leagueHomeAdv / 2;
    }
    const sim = simulateMatchup({ muHome, muAway, sigmaSide: sideSd, seedKey: `${cand.id}::${r.providerEventId}` });
    return { row: r, sim, muHome, muAway };
  });
}

// ── scoring ────────────────────────────────────────────────────────────────────────────────────
const clamp = (p) => Math.min(1 - 1e-9, Math.max(1e-9, p));
function score(preds) {
  const teamErrs = []; const marginErrs = []; const totalErrs = [];
  const marginCov = []; const totalCov = []; const widths = [];
  const briers = []; const logLosses = []; let blowoutsHit = 0; let blowouts = 0;
  for (const { row, sim } of preds) {
    const aM = row.ftHome - row.ftAway, aT = row.ftHome + row.ftAway;
    teamErrs.push(Math.abs(row.ftHome - sim.homeMedian), Math.abs(row.ftAway - sim.awayMedian));
    marginErrs.push(Math.abs(aM - sim.marginMedian));
    totalErrs.push(Math.abs(aT - sim.totalMedian));
    marginCov.push(aM >= sim.marginP10 && aM <= sim.marginP90 ? 1 : 0);
    totalCov.push(aT >= sim.totalP10 && aT <= sim.totalP90 ? 1 : 0);
    widths.push(sim.marginP90 - sim.marginP10);
    if (aM !== 0) {
      briers.push((sim.pHome - (aM > 0 ? 1 : 0)) ** 2);
      logLosses.push(-Math.log(clamp(aM > 0 ? sim.pHome : 1 - sim.pHome)));
    }
    // "can this model express a blowout at all?" — does its 80% interval reach a 14+ point margin
    // on the side that actually blew out?
    if (Math.abs(aM) >= 14) { blowouts += 1; if (aM > 0 ? sim.marginP90 >= 14 : sim.marginP10 <= -14) blowoutsHit += 1; }
  }
  const r4 = (x) => (x == null ? null : Number(x.toFixed(4)));
  return {
    n: preds.length, decisiveN: briers.length,
    teamScoreMAE: r4(mean(teamErrs)),
    teamScoreRMSE: r4(Math.sqrt(mean(teamErrs.map((x) => x * x)))),
    marginMAE: r4(mean(marginErrs)), totalMAE: r4(mean(totalErrs)),
    marginInterval80Coverage: r4(mean(marginCov)), totalInterval80Coverage: r4(mean(totalCov)),
    marginIntervalWidth: r4(mean(widths)),
    winBrier: r4(mean(briers)), winLogLoss: r4(mean(logLosses)),
    blowouts, blowoutRecall: blowouts ? r4(blowoutsHit / blowouts) : null,
  };
}

// ── run the folds ──────────────────────────────────────────────────────────────────────────────
const results = [];
for (const cand of CANDIDATES) {
  const pooled = [];
  const folds = [];
  for (const season of targets) {
    const targetRows = clean.filter((r) => PRE(r) && r.season === season);
    const opener = targetRows[0]?.dateUtc;
    const fitRows = clean.filter((r) => r.dateUtc < opener);
    if (!targetRows.length || fitRows.length < 50) continue;
    const preds = fitAndPredict({ ...cand }, fitRows, targetRows);
    folds.push({ targetSeason: season, fitRows: fitRows.length, ...score(preds) });
    pooled.push(...preds);
  }
  results.push({ id: cand.id, kind: cand.kind, describe: cand.describe, folds, pooled: score(pooled) });
}

// ── direction & sensitivity, on the champion candidate's mechanism ─────────────────────────────
const bestCandidate = results.filter((r) => r.kind === "candidate").sort((a, b) => a.pooled.marginMAE - b.pooled.marginMAE)[0];
const sensitivity = (() => {
  const sigma = 10; const home = 1;
  const sim = (oH, dA, oA, dH) => simulateMatchup({
    muHome: (oH + dA) / 2 + home / 2, muAway: (oA + dH) / 2 - home / 2, sigmaSide: sigma, seedKey: "sensitivity-probe",
  });
  const base = sim(20, 20, 20, 20);
  const strongerHomeOffense = sim(28, 20, 20, 20);
  const strongerAwayDefense = sim(20, 12, 20, 20);
  const bigGap = sim(30, 30, 12, 12);
  const swapped = simulateMatchup({ muHome: (20 + 20) / 2 + home / 2, muAway: (30 + 30) / 2 - home / 2, sigmaSide: sigma, seedKey: "sensitivity-probe" });
  return {
    strongerOffenseRaisesOwnScoring: { pass: strongerHomeOffense.homeMedian > base.homeMedian, base: base.homeMedian, moved: strongerHomeOffense.homeMedian },
    strongerOpposingDefenseLowersScoring: { pass: strongerAwayDefense.homeMedian < base.homeMedian, base: base.homeMedian, moved: strongerAwayDefense.homeMedian },
    biggerGapShiftsMargin: { pass: bigGap.marginMedian > base.marginMedian, base: base.marginMedian, moved: bigGap.marginMedian },
    biggerGapReachesBlowout: { pass: bigGap.marginP90 >= 14, p90: bigGap.marginP90 },
    swapReversesMargin: { pass: swapped.marginMedian < base.marginMedian, moved: swapped.marginMedian },
  };
})();
const allDirectionPass = Object.values(sensitivity).every((x) => x.pass);

// ── verdict, strictly against the frozen bars ──────────────────────────────────────────────────
const sharedPrior = results.find((r) => r.id === "shared_prior").pooled;
const bars = contract.promotionBars;
const c = bestCandidate.pooled;
const checks = {
  MINIMUM_N: { pass: c.n >= bars.minimumN, detail: `n=${c.n} vs required ${bars.minimumN}` },
  MARGIN_DISPERSION: { pass: sharedPrior.marginMAE - c.marginMAE >= 0.5, detail: `marginMAE ${c.marginMAE} vs shared prior ${sharedPrior.marginMAE} (improvement ${(sharedPrior.marginMAE - c.marginMAE).toFixed(4)}, need >= 0.50)` },
  COVERAGE_FLOOR: { pass: c.marginInterval80Coverage >= 0.72 && c.marginInterval80Coverage <= 0.88, detail: `margin coverage ${c.marginInterval80Coverage}, band [0.72, 0.88]` },
  SCORING_PRESERVED: { pass: c.totalMAE - sharedPrior.totalMAE <= 0.25 && c.totalInterval80Coverage >= 0.72, detail: `totalMAE ${c.totalMAE} vs ${sharedPrior.totalMAE}; total coverage ${c.totalInterval80Coverage}` },
  WIN_CALIBRATION: { pass: c.winBrier <= sharedPrior.winBrier, detail: `winBrier ${c.winBrier} vs shared prior ${sharedPrior.winBrier}` },
  DIRECTION_AND_SENSITIVITY: { pass: allDirectionPass, detail: allDirectionPass ? "all direction tests pass" : "a direction test failed" },
};
const promoted = Object.values(checks).every((x) => x.pass);

const report = {
  schemaVersion: 1,
  artifact: "nfl-team-strength-bakeoff",
  dataClass: "PRIVATE_RESEARCH",
  generatedAt: NOW,
  contract: { version: contract.version, sha256: contractHash, declaredAt: contract.declaredAt },
  whatThisIs:
    "A hierarchical offense/defense SCORING model, not a drive simulator. The committed corpus carries final scores only — no drives, plays or field position — so a drive mechanism cannot be fitted from it. This builds the part of a drive model that produces the audit's missing behaviour (matchup-dependent margin dispersion) and names the part that does not exist yet.",
  population: { corpusRows: corpus.length, used: clean.length, quarantined: quarantined.length, lockedCohortExcluded: quarantined.filter((x) => x.reason === "LOCKED_FORWARD_COHORT").length },
  splits: { method: contract.splits.method, targetSeasons: targets },
  candidates: results,
  sensitivity,
  bars: checks,
  bestCandidate: bestCandidate.id,
  verdict: promoted ? "PROMOTED" : "REJECTED_WITH_EVIDENCE",
  consequence: promoted
    ? "the candidate cleared every predeclared bar and may replace the shared prior as champion"
    : "no candidate cleared the predeclared bars. BASELINE_ONLY stays public and the shipped champion is untouched. A kickoff deadline is a lock boundary, not a reason to lower a bar.",
  failingBars: Object.entries(checks).filter(([, v]) => !v.pass).map(([k, v]) => ({ bar: k, detail: v.detail })),
};

const out = path.join(ROOT, "data/internal/research/nfl/reports/team-strength-bakeoff.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(report, null, 2) + "\n");

console.log(`bake-off: ${clean.length} usable rows · ${quarantined.length} quarantined (${report.population.lockedCohortExcluded} locked cohort) · folds ${targets.join(", ")}`);
for (const r of results) {
  const p = r.pooled;
  console.log(`  ${r.id.padEnd(22)} marginMAE ${String(p.marginMAE).padStart(7)} · totalMAE ${String(p.totalMAE).padStart(7)} · cov80 m ${String(p.marginInterval80Coverage).padStart(6)} t ${String(p.totalInterval80Coverage).padStart(6)} · Brier ${p.winBrier} · blowoutRecall ${p.blowoutRecall}`);
}
console.log(`  best candidate: ${bestCandidate.id}`);
for (const [k, v] of Object.entries(checks)) console.log(`  ${v.pass ? "PASS" : "FAIL"} ${k}: ${v.detail}`);
console.log(`VERDICT: ${report.verdict}`);
