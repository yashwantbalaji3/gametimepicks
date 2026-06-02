/**
 * Shadow projection→probability recalibration study — OFFLINE, READ-ONLY.
 *
 * ⚠  SHADOW MODE. This script:
 *   - reads ONLY settled public-era optimizer-graded slates,
 *   - reconstructs the production projection→probability step,
 *   - tests whether a *recalibrated* model probability could beat the
 *     market out-of-sample (leave-one-day-out),
 *   - writes NOTHING to disk and changes NO user-facing behaviour.
 *   It does NOT wire anything live, does NOT touch the optimizer/UI, and
 *   does NOT consume audit/policy.json. Any live change is approval-gated.
 *
 * Why this exists (context from the 2026-06-02 audits, #239/#240):
 *   The model's `edgePct`/`confidence` are NOT predictive (edge is
 *   anti-predictive); market-implied probability is the only separating
 *   signal; the model's probability is OVERCONFIDENT (Brier ≈ coin-flip).
 *   The proposed real fix is to recalibrate the projection→probability
 *   STEP and PROVE the recalibrated probability beats the market
 *   out-of-sample BEFORE any wiring. This script is that proof-or-refute.
 *
 * Production mapping being recalibrated (identical for NBA + MLB):
 *     P(over) = 1 − Φ((line − projection) / σ)
 *     edgePct = (model_prob − implied_prob) × 100
 *   NBA: pipeline/score_model.py   MLB: pipeline/mlb/mlb_model.py
 *
 * Reconstruction:
 *   Every graded leg stores `projection`, `line`, `side`, `recentSeries`,
 *   `oddsForSide`. We rebuild σ_base = max(pstdev(recentSeries), floor)
 *   (MLB floors from mlb_model.py; NBA σ ≈ pstdev(recentSeries)). This
 *   reproduces the stored MLB edgePct to a ~0.0pp median and NBA to ~1pp
 *   (fidelity printed below). Because the CURRENT / RECALIBRATED / MARKET
 *   probabilities are all computed from the SAME reconstruction, residual
 *   fidelity error largely cancels in the *relative* comparison.
 *
 * Recalibration knobs (the projection→prob step only — per handoff §9):
 *   - σ-scale  k:  σ' = k · σ_base            (k>1 ⇒ less overconfident)
 *   - proj shrink λ: proj' = line + λ·(proj − line)   (λ<1 ⇒ pull the
 *                    projection toward the line = projection-bias damping)
 *   Fit by minimizing Brier on the TRAINING folds; evaluated OUT-OF-SAMPLE.
 *
 * Market baseline = raw implied of the chosen side (`oddsForSide`),
 *   matching the #240 audit convention. NOTE: this INCLUDES vig, so as a
 *   probability estimate it is biased slightly high (~2–3pp); we flag this
 *   wherever it affects a Brier comparison. As a *ranking* signal vig is
 *   ~monotone so separation is unaffected.
 *
 * Hard caveats: ~217 legs / 5 day-folds is a THIN, observational sample.
 *   Read pooled aggregates, not single per-day cells. No same-slate
 *   leakage: each leg is graded against its own final result; LOO never
 *   fits on the day it evaluates.
 *
 * Run:  cd app && npx tsx scripts/shadow-projection-recalibration.mjs
 */
import { readFileSync } from "node:fs";

// Public-era settled slates only. May 25/26 excluded (pre-public-era leak
// guard). May 31 has no graded slate. Pending/unresolved legs excluded.
const DATES = ["2026-05-27", "2026-05-28", "2026-05-29", "2026-05-30", "2026-06-01"];

// MLB σ floors — copied from pipeline/mlb/mlb_model.py (_BATTER_SIGMA_FLOOR
// + pitcher 1.6). NBA markets fall through to a tiny div-guard floor, so
// NBA σ_base = pstdev(recentSeries).
const SIGMA_FLOOR = {
  batter_hits: 0.85,
  batter_total_bases: 1.10,
  batter_hits_runs_rbis: 1.20,
  pitcher_strikeouts: 1.6,
};
const DIV_GUARD = 0.1;

// ── math ──────────────────────────────────────────────────────────────
// erf (Abramowitz & Stegun 7.1.26, |err| ≤ 1.5e-7) → standard normal CDF.
function erf(x) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
}
const phi = (z) => 0.5 * (1 + erf(z / Math.SQRT2));
const impliedRaw = (o) => (o >= 0 ? 100 / (o + 100) : Math.abs(o) / (Math.abs(o) + 100));
function pstdev(a) {
  if (a.length < 2) return 0;
  const m = a.reduce((x, y) => x + y, 0) / a.length;
  return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length);
}
const clamp = (p) => Math.min(1 - 1e-6, Math.max(1e-6, p));

// ── build deduped settled-leg dataset ────────────────────────────────
function load(date) {
  try { return JSON.parse(readFileSync(`public/data/parlays/optimizer-graded/${date}.json`, "utf8")); }
  catch { return null; }
}
const legs = [];
const seen = new Set();
let skippedInsufficient = 0;
for (const date of DATES) {
  const g = load(date);
  if (!g) continue;
  for (const s of g.uniqueSlips ?? []) {
    for (const l of s.legs) {
      const r = l.result;
      if (r !== "win" && r !== "loss") continue;            // pending excluded
      const key = `${date}|${l.leanId}`;
      if (seen.has(key)) continue;                           // dedup exposure
      seen.add(key);
      const rs = Array.isArray(l.recentSeries) ? l.recentSeries.map(Number).filter((v) => Number.isFinite(v)) : [];
      if (l.projection == null || l.oddsForSide == null || rs.length < 2 || l.side == null) {
        skippedInsufficient++;                               // never invent σ
        continue;
      }
      const floor = SIGMA_FLOOR[l.market] ?? DIV_GUARD;
      const sigmaBase = Math.max(pstdev(rs), floor);
      legs.push({
        date, sport: l.sport, market: l.market, side: l.side,
        line: l.line, projection: l.projection, sigmaBase,
        odds: l.oddsForSide, marketProb: impliedRaw(l.oddsForSide),
        edgeStored: l.edgePct ?? null,
        win: r === "win" ? 1 : 0,
      });
    }
  }
}

// Current (production-equivalent) model probability for the chosen side.
function currentProb(L) {
  const pOver = 1 - phi((L.line - L.projection) / L.sigmaBase);
  return L.side === "Over" ? pOver : 1 - pOver;
}
// Recalibrated probability: σ-scale k and projection-toward-line shrink λ.
function recalProb(L, k, lambda) {
  const proj = L.line + lambda * (L.projection - L.line);
  const sigma = Math.max(k * L.sigmaBase, DIV_GUARD);
  const pOver = 1 - phi((L.line - proj) / sigma);
  return L.side === "Over" ? pOver : 1 - pOver;
}

// ── metrics ──────────────────────────────────────────────────────────
const brier = (rows, p) => rows.reduce((a, L) => a + (p(L) - L.win) ** 2, 0) / rows.length;
const logloss = (rows, p) => rows.reduce((a, L) => { const q = clamp(p(L)); return a - (L.win * Math.log(q) + (1 - L.win) * Math.log(1 - q)); }, 0) / rows.length;
const hit = (rows) => { const n = rows.length, w = rows.reduce((a, L) => a + L.win, 0); return { n, w, pct: n ? w / n : 0 }; };
// Does ranking by `p` separate winners? top-half vs bottom-half hit rate.
function separation(rows, p) {
  const v = [...rows].sort((a, b) => p(a) - p(b));
  const h = Math.floor(v.length / 2);
  const bot = hit(v.slice(0, h)), top = hit(v.slice(h));
  return { bot, top, lift: top.pct - bot.pct };
}
const pctS = (x) => `${(x * 100).toFixed(0)}%`;
const hitS = (h) => `${h.w}/${h.n}=${pctS(h.pct)}`;

// Fit (k, λ) on a row set by minimizing Brier (grid search).
const K_GRID = []; for (let k = 0.6; k <= 4.001; k += 0.1) K_GRID.push(Math.round(k * 10) / 10);
const L_GRID = []; for (let l = 0.3; l <= 1.201; l += 0.1) L_GRID.push(Math.round(l * 10) / 10);
function fit(rows, { lambdaFixed = null } = {}) {
  let best = { k: 1, lambda: 1, brier: Infinity };
  for (const k of K_GRID) {
    for (const lambda of (lambdaFixed == null ? L_GRID : [lambdaFixed])) {
      const b = brier(rows, (L) => recalProb(L, k, lambda));
      if (b < best.brier) best = { k, lambda, brier: b };
    }
  }
  return best;
}

// ── report ───────────────────────────────────────────────────────────
const line = (s = "") => console.log(s);
line("════════════════════════════════════════════════════════════════════");
line(" SHADOW projection→probability recalibration study  (offline, read-only)");
line(" No live wiring · no UI/optimizer change · no policy.json · approval-gated");
line("════════════════════════════════════════════════════════════════════");

// dataset summary
const bySport = {}, byMkt = {}, byDay = {};
for (const L of legs) { bySport[L.sport] = (bySport[L.sport] || 0) + 1; byMkt[L.market] = (byMkt[L.market] || 0) + 1; byDay[L.date] = (byDay[L.date] || 0) + 1; }
const overall = hit(legs);
line(`\nDATASET: ${legs.length} deduped settled legs (public era May27–Jun1; pending excluded; ${skippedInsufficient} skipped for insufficient series).`);
line(`  overall leg hit rate: ${hitS(overall)}`);
line(`  by sport:  ${Object.entries(bySport).map(([k, v]) => `${k} ${v}`).join("  ")}`);
line(`  by market: ${Object.entries(byMkt).map(([k, v]) => `${k} ${v}`).join("  ")}`);
line(`  by day:    ${DATES.map((d) => `${d.slice(5)} ${byDay[d] || 0}`).join("  ")}`);

// reconstruction fidelity vs stored edgePct
const mlb = legs.filter((L) => L.sport === "mlb" && L.edgeStored != null);
const nba = legs.filter((L) => L.sport === "nba" && L.edgeStored != null);
function fidelity(rows) {
  if (!rows.length) return "—";
  const gaps = rows.map((L) => (currentProb(L) - L.marketProb) * 100 - L.edgeStored).sort((a, b) => a - b);
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  return `n=${gaps.length} median=${gaps[Math.floor(gaps.length / 2)].toFixed(2)}pp mean=${mean.toFixed(2)}pp`;
}
line(`\nRECONSTRUCTION FIDELITY (reconstructed edge − stored edgePct; small = faithful):`);
line(`  MLB ${fidelity(mlb)}`);
line(`  NBA ${fidelity(nba)}   (NBA uses pstdev(recentSeries) ≈ production dispersion)`);

// ── §1 baseline calibration (in-sample) ──
line(`\n── §1  BASELINE CALIBRATION (in-sample; confirms #240) ───────────────`);
line(`  metric              CURRENT model     MARKET (raw implied)`);
line(`  Brier (lower=better) ${brier(legs, currentProb).toFixed(4)}            ${brier(legs, (L) => L.marketProb).toFixed(4)}`);
line(`  LogLoss              ${logloss(legs, currentProb).toFixed(4)}            ${logloss(legs, (L) => L.marketProb).toFixed(4)}`);
line(`  (0.25 Brier / 0.693 LogLoss ≈ coin-flip. Market Brier carries vig bias.)`);
const sepCur = separation(legs, currentProb), sepMkt = separation(legs, (L) => L.marketProb);
line(`\n  Ranking separation (top-half vs bottom-half leg hit rate):`);
line(`    CURRENT model_prob:  bottom ${hitS(sepCur.bot)}  vs  top ${hitS(sepCur.top)}   lift ${(sepCur.lift * 100 >= 0 ? "+" : "")}${(sepCur.lift * 100).toFixed(0)}pp`);
line(`    MARKET implied:      bottom ${hitS(sepMkt.bot)}  vs  top ${hitS(sepMkt.top)}   lift ${(sepMkt.lift * 100 >= 0 ? "+" : "")}${(sepMkt.lift * 100).toFixed(0)}pp`);

// model-prob calibration table
line(`\n  CURRENT model_prob calibration (predicted vs ACTUAL):`);
const bands = [[0, 0.45], [0.45, 0.5], [0.5, 0.55], [0.55, 0.6], [0.6, 0.65], [0.65, 0.7], [0.7, 1.01]];
for (const [lo, hi] of bands) {
  const rows = legs.filter((L) => { const p = currentProb(L); return p >= lo && p < hi; });
  if (!rows.length) continue;
  const ap = rows.reduce((a, L) => a + currentProb(L), 0) / rows.length;
  const act = hit(rows).pct;
  line(`    pred ${(lo * 100).toFixed(0)}-${(hi * 100).toFixed(0)}%  n=${String(rows.length).padStart(3)}  pred=${pctS(ap)}  ACTUAL=${pctS(act)}  gap=${(act * 100 - ap * 100 >= 0 ? "+" : "")}${(act * 100 - ap * 100).toFixed(0)}pp`);
}

// ── §2 in-sample recalibration fit (optimistic) ──
line(`\n── §2  IN-SAMPLE recalibration fit (OPTIMISTIC — see §3 for honest OOS) ─`);
const fitAll = fit(legs);
const fitK = fit(legs, { lambdaFixed: 1 });
line(`  σ-scale only:   k=${fitK.k.toFixed(1)} λ=1.0   Brier ${fitK.brier.toFixed(4)}  (vs current ${brier(legs, currentProb).toFixed(4)})`);
line(`  σ-scale + shrink: k=${fitAll.k.toFixed(1)} λ=${fitAll.lambda.toFixed(1)}  Brier ${fitAll.brier.toFixed(4)}`);
const sepRecalIS = separation(legs, (L) => recalProb(L, fitAll.k, fitAll.lambda));
line(`  Recalibrated separation (in-sample): bottom ${hitS(sepRecalIS.bot)} vs top ${hitS(sepRecalIS.top)}  lift ${(sepRecalIS.lift * 100 >= 0 ? "+" : "")}${(sepRecalIS.lift * 100).toFixed(0)}pp`);
line(`  NOTE: σ/λ recalibration is ~monotone in the model's own ranking, so it`);
line(`        can fix CALIBRATION (Brier) but cannot manufacture DISCRIMINATION`);
line(`        the model never had. Watch whether separation/market gap closes OOS.`);

// ── §3 leave-one-day-out (honest, out-of-sample) ──
line(`\n── §3  LEAVE-ONE-DAY-OUT (fit on N−1 days, evaluate held-out day) ─────`);
line(`  day      n   Brier:cur   recal   market   | recal<market? recal<cur?  (k,λ fit)`);
const ooRows = [];   // pooled held-out predictions
let foldsRecalBeatsMkt = 0, foldsWithData = 0;
for (const d of DATES) {
  const test = legs.filter((L) => L.date === d);
  const train = legs.filter((L) => L.date !== d);
  if (!test.length || train.length < 10) continue;
  foldsWithData++;
  const f = fit(train);
  const bCur = brier(test, currentProb);
  const bRec = brier(test, (L) => recalProb(L, f.k, f.lambda));
  const bMkt = brier(test, (L) => L.marketProb);
  if (bRec < bMkt) foldsRecalBeatsMkt++;
  for (const L of test) ooRows.push({ ...L, _recal: recalProb(L, f.k, f.lambda) });
  line(`  ${d.slice(5)}  ${String(test.length).padStart(3)}   ${bCur.toFixed(4)}   ${bRec.toFixed(4)}  ${bMkt.toFixed(4)}  |  ${bRec < bMkt ? "YES" : "no "}          ${bRec < bCur ? "YES" : "no "}        (k=${f.k.toFixed(1)},λ=${f.lambda.toFixed(1)})`);
}
// pooled OOS metrics
const pooledCur = brier(ooRows, currentProb);
const pooledRec = ooRows.reduce((a, L) => a + (L._recal - L.win) ** 2, 0) / ooRows.length;
const pooledMkt = brier(ooRows, (L) => L.marketProb);
const sepPooledRec = separation(ooRows, (L) => L._recal);
const sepPooledMkt = separation(ooRows, (L) => L.marketProb);
line(`\n  POOLED out-of-sample (all held-out folds, n=${ooRows.length}):`);
line(`    Brier   current ${pooledCur.toFixed(4)}   recalibrated ${pooledRec.toFixed(4)}   market ${pooledMkt.toFixed(4)}`);
line(`    Separation (top vs bottom half):`);
line(`      recalibrated:  bottom ${hitS(sepPooledRec.bot)} vs top ${hitS(sepPooledRec.top)}  lift ${(sepPooledRec.lift * 100 >= 0 ? "+" : "")}${(sepPooledRec.lift * 100).toFixed(0)}pp`);
line(`      market:        bottom ${hitS(sepPooledMkt.bot)} vs top ${hitS(sepPooledMkt.top)}  lift ${(sepPooledMkt.lift * 100 >= 0 ? "+" : "")}${(sepPooledMkt.lift * 100).toFixed(0)}pp`);

// ── §4 verdict ──
line(`\n── §4  VERDICT (decision rule: wire ONLY if recal beats market OOS) ───`);
const brierBeatsMkt = pooledRec < pooledMkt;
const sepBeatsMkt = sepPooledRec.lift > sepPooledMkt.lift;
const majorityFolds = foldsRecalBeatsMkt > foldsWithData / 2;
line(`  recalibrated Brier < market Brier (pooled OOS):   ${brierBeatsMkt ? "YES" : "NO"}  (${pooledRec.toFixed(4)} vs ${pooledMkt.toFixed(4)})`);
line(`  recalibrated separation > market (pooled OOS):    ${sepBeatsMkt ? "YES" : "NO"}  (lift ${(sepPooledRec.lift * 100).toFixed(0)}pp vs ${(sepPooledMkt.lift * 100).toFixed(0)}pp)`);
line(`  recal beats market in majority of day-folds:      ${majorityFolds ? "YES" : "NO"}  (${foldsRecalBeatsMkt}/${foldsWithData})`);
const wire = brierBeatsMkt && sepBeatsMkt && majorityFolds;
line(`\n  ➤ DECISION: ${wire
  ? "Recalibrated probability beats the market OOS on all criteria — \n             candidate for wiring. PAUSE for operator approval (do NOT wire here)."
  : "Recalibrated probability does NOT beat the market out-of-sample. \n             KEEP SHADOW/observational. Do NOT wire. (Recalibration may still\n             improve Brier/calibration — note that separately; it is not a\n             reason to wire, and it is NOT a hit-rate claim.)"}`);
line(`\n  Caveats: ~${legs.length} legs / ${foldsWithData} day-folds is thin and observational.`);
line(`  Market baseline is raw implied (incl. vig). No same-slate leakage. No`);
line(`  performance/hit-rate claim is made or implied. SHADOW MODE — nothing wired.`);
line("════════════════════════════════════════════════════════════════════");
