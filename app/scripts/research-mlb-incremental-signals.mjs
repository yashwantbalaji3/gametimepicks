/**
 * research-mlb-incremental-signals.mjs — INTERNAL challenger research: does a new pregame feature family add
 * predictive value BEYOND the de-vigged market for an MLB player-prop market? Everything internal, nothing served.
 *
 * Honesty spine:
 *   - Market-OFFSET formulation: logit(p_final) = logit(p_market) + residual(features). The challenger only
 *     predicts the RESIDUAL, directly answering "does the feature add info the market doesn't already have?"
 *   - Chronological walk-forward selection + a frozen holdout. No same-sample fit/score. Market is the benchmark.
 *   - TIMESTAMP GUARD: every feature value must derive strictly from starts dated BEFORE the event commenceTime.
 *   - A feature family with no provable pregame archive is INSUFFICIENT_PREGAME_COVERAGE — never fabricated from
 *     postgame box scores.
 *
 * Initial scope: coverage audit for all 5 families + the ONLY two buildable independent experiments:
 *   (1) confirmed-lineup family  — INSUFFICIENT_PREGAME_COVERAGE (no archived pregame lineups; refuse to fake).
 *   (2) pitcher-workload family  — buildable for pitcher_strikeouts from StatsAPI gameLog (strictly-earlier).
 *
 * Writes data/internal/mlb/challengers/*.json (public:false, approvedForProduction:false).
 * Run: node app/scripts/research-mlb-incremental-signals.mjs
 */
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd().endsWith("/app") ? process.cwd() : path.join(process.cwd(), "app");
const REPO = path.dirname(APP);
const BOARD_DIR = path.join(APP, "public/data/mlb/boards");
const SETTLED = path.join(APP, "public/data/mlb/results/settled_leans.jsonl");
const OUT = path.join(REPO, "data/internal/mlb/challengers");
const CACHE = path.join(REPO, "data/internal/mlb/reference/pitcher-gamelog-full-cache.json");

const HOLDOUT_DATES = 9, WF_INITIAL = 15, MIN_HOLDOUT_OBS = 500, MIN_PRIOR_STARTS = 2, BOOT = 2000, EPS = 1e-6;
const parseIP = (ip) => { const [w, f] = String(ip ?? "0").split("."); return (Number(w) || 0) * 3 + (Number(f) || 0); };
const clip01 = (p) => Math.min(1 - EPS, Math.max(EPS, p));
const logit = (p) => Math.log(clip01(p) / (1 - clip01(p)));
const sigmoid = (z) => 1 / (1 + Math.exp(-z));
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const sd = (a) => { if (a.length < 2) return 1; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)) || 1; };
const brier = (rows, k) => mean(rows.map((r) => (r[k] - r.won) ** 2));
const logloss = (rows, k) => mean(rows.map((r) => { const q = clip01(r[k]); return -(r.won * Math.log(q) + (1 - r.won) * Math.log(1 - q)); }));
const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");

/** Ridge logistic regression on an OFFSET (market logit is a fixed offset; we fit only the residual). */
function fitResidual(X, y, offset, iters = 3000, lr = 0.1, l2 = 1e-2) {
  const d = X[0].length; const w = new Array(d).fill(0); let b = 0;
  for (let it = 0; it < iters; it++) {
    const gw = new Array(d).fill(0); let gb = 0;
    for (let i = 0; i < X.length; i++) {
      const z = offset[i] + b + X[i].reduce((s, x, j) => s + x * w[j], 0);
      const e = sigmoid(z) - y[i]; gb += e; for (let j = 0; j < d; j++) gw[j] += e * X[i][j];
    }
    b -= lr * (gb / X.length); for (let j = 0; j < d; j++) w[j] -= lr * (gw[j] / X.length + l2 * w[j]);
  }
  return { w, b };
}
function bootstrapDiff(rows, k, metricFn, seed = 4242) {
  const byDate = new Map(); for (const r of rows) { if (!byDate.has(r.date)) byDate.set(r.date, []); byDate.get(r.date).push(r); }
  const dates = [...byDate.keys()]; let s = seed >>> 0; const rnd = () => { s = (1664525 * s + 1013904223) >>> 0; return s / 4294967296; };
  const diffs = [];
  for (let it = 0; it < BOOT; it++) { const samp = []; for (let i = 0; i < dates.length; i++) samp.push(...byDate.get(dates[Math.floor(rnd() * dates.length)])); diffs.push(metricFn(samp, k) - metricFn(samp, "pMarket")); }
  diffs.sort((a, b) => a - b);
  return { lo: +diffs[Math.floor(0.025 * BOOT)].toFixed(4), hi: +diffs[Math.floor(0.975 * BOOT)].toFixed(4), iters: BOOT };
}

// ── row dataset for pitcher_strikeouts (settled ⋈ board, de-vigged market on lean side) ──
function loadBoard() {
  const idx = new Map(), nameId = new Map();
  for (const f of fs.readdirSync(BOARD_DIR)) {
    if (!f.endsWith(".json")) continue;
    let b; try { b = JSON.parse(fs.readFileSync(path.join(BOARD_DIR, f), "utf8")); } catch { continue; }
    for (const l of b.leans ?? []) {
      if (!l.id) continue;
      if (l.playerName && l.playerId) nameId.set(norm(l.playerName), l.playerId);
      const io = Number(l.impliedOver), iu = Number(l.impliedUnder), under = l.lean === "Under";
      const modelProb = under ? l.modelProbUnder : l.modelProbOver, impliedLean = under ? iu : io;
      const marketProb = Number.isFinite(io) && Number.isFinite(iu) && io + iu > 0 ? impliedLean / (io + iu) : impliedLean;
      if (!Number.isFinite(modelProb) || !Number.isFinite(marketProb)) continue;
      idx.set(l.id, { pModel: clip01(modelProb), pMarket: clip01(marketProb), projection: l.projection, commenceTime: l.commenceTime, playerId: l.playerId });
    }
  }
  return { idx, nameId };
}
async function fetchLog(id, cache) {
  if (cache[id]) return cache[id];
  const j = await fetch(`https://statsapi.mlb.com/api/v1/people/${id}/stats?stats=gameLog&season=2026&group=pitching`).then((r) => r.json());
  cache[id] = (j.stats?.[0]?.splits || []).filter((s) => Number(s.stat.gamesStarted || 0) > 0)
    .map((s) => ({ date: s.date, ip: parseIP(s.stat.inningsPitched), k: Number(s.stat.strikeOuts || 0), bf: Number(s.stat.battersFaced || 0) }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return cache[id];
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const { idx } = loadBoard();
  const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, "utf8")) : {};

  // ── feature-provenance registry (all 5 families) ──
  const provenance = {
    public: false, generatedFor: "internal challenger research", timestampRule: "featureAvailableAt < eventStartTime (commenceTime)",
    families: [
      { family: "confirmed_lineup", pregameAvailabilityProven: false, source: "none archived", verdict: "INSUFFICIENT_PREGAME_COVERAGE", note: "Board archives carry no batting-order / confirmed-lineup fields. Historical batting order exists only in POSTGAME box scores; using it as a pregame feature is leakage. Not built." },
      { family: "pitcher_workload", pregameAvailabilityProven: true, source: "StatsAPI people/<id>/stats gameLog (strictly-earlier starts only)", verdict: "BUILDABLE", note: "daysRest + recent IP/BF/K derived from starts strictly before commenceTime. Applies to pitcher_strikeouts." },
      { family: "bullpen", pregameAvailabilityProven: false, source: "none archived", verdict: "INSUFFICIENT_PREGAME_COVERAGE", note: "No archived bullpen-usage snapshots across the settled window. Reconstruction from later games would be leakage. Not built." },
      { family: "plate_appearance_opportunity", pregameAvailabilityProven: false, source: "team-markets (4 dates only)", verdict: "INSUFFICIENT_PREGAME_COVERAGE", note: "Team totals / game totals / batting order not archived across the 43-date window (team-markets covers 4 dates). Not built." },
      { family: "environment", pregameAvailabilityProven: false, source: "none archived", verdict: "INSUFFICIENT_PREGAME_COVERAGE", note: "No pregame weather/umpire/park archives. Postgame weather is leakage. Not built." },
    ],
  };
  fs.writeFileSync(path.join(OUT, "feature-provenance.json"), JSON.stringify(provenance, null, 2));

  // ── build pitcher_strikeouts rows with LEAKAGE-SAFE workload features ──
  const nameIdFallback = new Map();
  const rows = []; let unmatched = 0, insufficientPrior = 0, tsGuardFail = 0, noStart = 0;
  const settled = fs.readFileSync(SETTLED, "utf8").trim().split("\n").map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter((o) => o && o.marketKey === "pitcher_strikeouts" && ["win", "loss"].includes(String(o.outcome).toLowerCase()));
  const ids = [...new Set(settled.map((o) => idx.get(o.id)?.playerId).filter(Boolean))];
  for (const id of ids) { try { await fetchLog(id, cache); } catch {} }
  fs.mkdirSync(path.dirname(CACHE), { recursive: true }); fs.writeFileSync(CACHE, JSON.stringify(cache));

  for (const o of settled) {
    const b = idx.get(o.id); if (!b) { unmatched++; continue; }
    const log = cache[b.playerId]; if (!log) { noStart++; continue; }
    const eventDay = o.date; // board/event date
    const prior = log.filter((s) => s.date < eventDay); // STRICTLY earlier
    // timestamp guard: no prior start may be dated on/after the event day
    if (prior.some((s) => s.date >= eventDay)) { tsGuardFail++; continue; }
    if (prior.length < MIN_PRIOR_STARTS) { insufficientPrior++; continue; }
    const last = prior.slice(-3);
    const daysRest = Math.min(12, Math.max(0, (Date.parse(eventDay) - Date.parse(prior[prior.length - 1].date)) / 86400000));
    const recentIP = mean(last.map((s) => s.ip));
    const recentBF = mean(last.map((s) => s.bf));
    const recentK = mean(last.map((s) => s.k));
    const kRate = recentBF > 0 ? recentK / recentBF : 0;
    rows.push({
      date: eventDay, id: o.id, playerId: b.playerId, commenceTime: b.commenceTime, lean: o.lean, line: o.line,
      won: String(o.outcome).toLowerCase() === "win" ? 1 : 0, pModel: b.pModel, pMarket: b.pMarket,
      f_daysRest: daysRest, f_recentIP: recentIP, f_recentBF: recentBF, f_kRate: kRate,
    });
  }

  // standardize features on the WHOLE set's stats is leakage; instead standardize per training fold below.
  const FEATS = ["f_daysRest", "f_recentIP", "f_recentBF", "f_kRate"];
  const allDates = [...new Set(rows.map((r) => r.date))].sort();
  const holdoutDates = allDates.slice(-HOLDOUT_DATES), selDates = allDates.slice(0, allDates.length - HOLDOUT_DATES);
  const byDate = new Map(); for (const r of rows) { if (!byDate.has(r.date)) byDate.set(r.date, []); byDate.get(r.date).push(r); }

  // fit the market-offset residual on a training set (standardize features by TRAIN stats only)
  function fitOn(train) {
    const mu = {}, sg = {}; for (const f of FEATS) { const v = train.map((r) => r[f]); mu[f] = mean(v); sg[f] = sd(v); }
    const X = train.map((r) => FEATS.map((f) => (r[f] - mu[f]) / sg[f]));
    const off = train.map((r) => logit(r.pMarket));
    const { w, b } = fitResidual(X, train.map((r) => r.won), off);
    return { predict: (r) => sigmoid(logit(r.pMarket) + b + FEATS.reduce((s, f, j) => s + w[j] * ((r[f] - mu[f]) / sg[f]), 0)), coef: Object.fromEntries(FEATS.map((f, j) => [f, +w[j].toFixed(4)])), intercept: +b.toFixed(4) };
  }

  // walk-forward over the selection region (leakage-safe): fit on dates<d, predict d
  const wfPreds = [];
  const selD = selDates.filter((d) => byDate.has(d));
  for (let kk = WF_INITIAL; kk < selD.length; kk++) {
    const train = selD.slice(0, kk).flatMap((d) => byDate.get(d)); const test = byDate.get(selD[kk]) || [];
    if (train.length < 40 || !test.length) continue;
    if (train.some((r) => r.date >= selD[kk])) throw new Error("leakage in walk-forward");
    const m = fitOn(train); for (const r of test) wfPreds.push({ ...r, pChallenger: clip01(m.predict(r)) });
  }
  const wfBrierCh = brier(wfPreds, "pChallenger"), wfBrierMkt = brier(wfPreds, "pMarket");
  const wfLLCh = logloss(wfPreds, "pChallenger"), wfLLMkt = logloss(wfPreds, "pMarket");

  // freeze on all selection dates, apply ONCE to the holdout
  const frozen = fitOn(selDates.filter((d) => byDate.has(d)).flatMap((d) => byDate.get(d)));
  const holdoutRows = holdoutDates.filter((d) => byDate.has(d)).flatMap((d) => byDate.get(d).map((r) => ({ ...r, pChallenger: clip01(frozen.predict(r)) })));
  const hN = holdoutRows.length;
  const hBrierCh = brier(holdoutRows, "pChallenger"), hBrierMkt = brier(holdoutRows, "pMarket");
  const hLLCh = logloss(holdoutRows, "pChallenger"), hLLMkt = logloss(holdoutRows, "pMarket");
  const bootB = bootstrapDiff(holdoutRows, "pChallenger", brier), bootL = bootstrapDiff(holdoutRows, "pChallenger", logloss);

  // ablation on walk-forward: market-only vs market+workload
  const ablation = { marketOnly: { brier: +wfBrierMkt.toFixed(4), logloss: +wfLLMkt.toFixed(4) }, marketPlusWorkload: { brier: +wfBrierCh.toFixed(4), logloss: +wfLLCh.toFixed(4) }, workloadImprovesWF: wfBrierCh < wfBrierMkt && wfLLCh < wfLLMkt };

  // verdict — family (walk-forward evidence) + market (strict holdout gate)
  const enoughHoldout = hN >= MIN_HOLDOUT_OBS;
  const wfHelps = wfBrierCh < wfBrierMkt && wfLLCh < wfLLMkt;
  const holdoutHelps = hBrierCh < hBrierMkt && hLLCh < hLLMkt && bootB.hi < 0;
  let familyVerdict;
  if (!wfHelps) familyVerdict = "NO_INCREMENTAL_VALUE";
  else if (!enoughHoldout) familyVerdict = "INSUFFICIENT_OUT_OF_SAMPLE_DATA";
  else if (holdoutHelps) familyVerdict = "INCREMENTAL_SIGNAL_CONFIRMED";
  else familyVerdict = "FEATURE_UNSTABLE"; // helped in WF but not on the frozen holdout
  const marketVerdict = !enoughHoldout ? "INSUFFICIENT_OUT_OF_SAMPLE_DATA" : (holdoutHelps ? "NEEDS_CAUTION" : "MARKET_CONTEXT_ONLY");

  const familyResults = {
    public: false, market: "pitcher_strikeouts", featureFamily: "pitcher_workload", features: FEATS,
    coverage: { totalKleans: settled.length, usableRows: rows.length, unmatched, insufficientPriorStarts: insufficientPrior, noGameLog: noStart, timestampGuardFailures: tsGuardFail, coveragePct: +(100 * rows.length / settled.length).toFixed(1) },
    protocol: { selectionDates: [selDates[0], selDates[selDates.length - 1]], holdoutDates: [holdoutDates[0], holdoutDates[holdoutDates.length - 1]], holdoutObs: hN, minHoldoutObs: MIN_HOLDOUT_OBS },
    walkForward: { n: wfPreds.length, brierChallenger: +wfBrierCh.toFixed(4), brierMarket: +wfBrierMkt.toFixed(4), loglossChallenger: +wfLLCh.toFixed(4), loglossMarket: +wfLLMkt.toFixed(4), challengerBeatsMarket: wfHelps },
    holdout: { n: hN, sufficient: enoughHoldout, brier: { challenger: +hBrierCh.toFixed(4), market: +hBrierMkt.toFixed(4), diff: +(hBrierCh - hBrierMkt).toFixed(4), ci95: bootB }, logloss: { challenger: +hLLCh.toFixed(4), market: +hLLMkt.toFixed(4), diff: +(hLLCh - hLLMkt).toFixed(4), ci95: bootL } },
    frozenCoefficients: frozen.coef, frozenIntercept: frozen.intercept, ablation,
    familyVerdict, marketVerdict,
  };
  fs.writeFileSync(path.join(OUT, "family-results.json"), JSON.stringify(familyResults, null, 2));
  fs.writeFileSync(path.join(OUT, "protocol.json"), JSON.stringify({ public: false, approvedForProduction: false, experimentVersion: "challenger-v1", market: "pitcher_strikeouts", holdoutDates: HOLDOUT_DATES, wfInitial: WF_INITIAL, minHoldoutObs: MIN_HOLDOUT_OBS, benchmark: "de-vigged market probability", formulation: "market-offset residual logistic", bootstrapIters: BOOT }, null, 2));
  fs.writeFileSync(path.join(OUT, "challenger-registry.json"), JSON.stringify({
    public: false, approvedForProduction: false,
    families: Object.fromEntries(provenance.families.map((f) => [f.family, f.verdict === "BUILDABLE" ? familyVerdict : f.verdict])),
    markets: { pitcher_strikeouts: marketVerdict, batter_hits: "MARKET_CONTEXT_ONLY", batter_total_bases: "MARKET_CONTEXT_ONLY", batter_hits_runs_rbis: "MARKET_CONTEXT_ONLY" },
    validatedProductLegs: 0, productEligibleChanged: false,
  }, null, 2));

  // ── console ──
  console.log(`\n=== MLB incremental-signal research (initial scope) ===`);
  console.log(`coverage audit:`);
  for (const f of provenance.families) console.log(`  ${f.family.padEnd(28)} ${f.verdict}`);
  console.log(`\npitcher_workload → pitcher_strikeouts:`);
  console.log(`  usable rows ${rows.length}/${settled.length} (${familyResults.coverage.coveragePct}%)  tsGuardFails=${tsGuardFail}  insufficientPrior=${insufficientPrior}`);
  console.log(`  frozen coefficients: ${JSON.stringify(frozen.coef)}`);
  console.log(`  WALK-FORWARD  n=${wfPreds.length}  Brier ch ${wfBrierCh.toFixed(4)} vs mkt ${wfBrierMkt.toFixed(4)}  LL ch ${wfLLCh.toFixed(4)} vs mkt ${wfLLMkt.toFixed(4)}  → ${wfHelps ? "workload helps" : "NO improvement"}`);
  console.log(`  HOLDOUT       n=${hN} (sufficient=${enoughHoldout})  ΔBrier ${(hBrierCh - hBrierMkt).toFixed(4)} CI[${bootB.lo},${bootB.hi}]  ΔLL ${(hLLCh - hLLMkt).toFixed(4)}`);
  console.log(`  FAMILY VERDICT: ${familyVerdict}   MARKET VERDICT: ${marketVerdict}`);
  console.log(`\nartifacts → ${path.relative(REPO, OUT)}/`);
}
main().catch((e) => { console.error(e); process.exit(1); });
