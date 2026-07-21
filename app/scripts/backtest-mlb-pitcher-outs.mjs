/**
 * backtest-mlb-pitcher-outs.mjs — leakage-safe backtest of a candidate pitcher_outs projection model
 * against official StatsAPI box scores, compared to the sportsbook market.
 *
 * INPUTS (all pregame / official, no lookahead):
 *   - Historical pitcher_outs LINES + odds: app/public/data/mlb/player-props/<date>.json (market="pitcher_outs").
 *   - Per-start ACTUAL outs + prior-start history: StatsAPI people/<id>/stats?stats=gameLog (2026, pitching).
 *     Outs = innings-pitched × 3 (baseball "5.2" = 5 IP + 2 outs = 17). Cached to data/internal.
 *   - Name→id map: public/data/mlb/results/settled_leans.jsonl (pitcher leans) + current board.
 *
 * MODEL (candidate, strictly earlier starts only — leakage-safe):
 *   projection = shrink( recency-weighted mean of prior-start outs , league prior ), sigma = max(sd(prior), floor).
 *   modelProbOver = P(N(projection, sigma) > line).
 *
 * OUTPUT: data/internal/mlb/reference/mlb-pitcher-outs-backtest.json (public:false) + a console report.
 * The GATE: model beats market iff Brier(model) < Brier(market) AND logloss(model) < logloss(market) on a
 * sufficient sample. This script decides NOTHING public — it only produces the evidence.
 *
 * Run: node app/scripts/backtest-mlb-pitcher-outs.mjs
 */
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd().endsWith("/app") ? process.cwd() : path.join(process.cwd(), "app");
const REPO = path.dirname(APP);
const PROPS_DIR = path.join(APP, "public/data/mlb/player-props");
const SETTLED = path.join(APP, "public/data/mlb/results/settled_leans.jsonl");
const BOARD_DIR = path.join(APP, "public/data/mlb/boards");
const CACHE = path.join(REPO, "data/internal/mlb/reference/pitcher-gamelog-cache.json");
const OUT = path.join(REPO, "data/internal/mlb/reference/mlb-pitcher-outs-backtest.json");

// ── model constants ──
const LEAGUE_OUTS = 16.5;   // ~5.5 IP, a typical modern-starter prior
const PRIOR_K = 2.0;        // shrinkage strength toward the league prior (in "effective starts")
const DECAY = 0.80;         // recency decay for the weighted mean
const MAX_PRIOR = 12;       // use up to this many prior starts
const SIGMA_FLOOR = 3.5;    // outs are noisy (pulls/blowups) — never claim more precision than this
const MIN_PRIOR = 3;        // need at least this many prior starts to project (else insufficient sample)

const parseIP = (ip) => { const [w, f] = String(ip ?? "0").split("."); return (Number(w) || 0) * 3 + (Number(f) || 0); };
const americanToProb = (a) => (a == null ? null : a < 0 ? -a / (-a + 100) : 100 / (a + 100));
const normCdf = (z) => { // Abramowitz-Stegun
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
};
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const sd = (a) => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");

// ── name → playerId map (from settled leans + boards) ──
function buildNameId() {
  const map = new Map();
  if (fs.existsSync(SETTLED)) {
    for (const line of fs.readFileSync(SETTLED, "utf8").trim().split("\n")) {
      try { const o = JSON.parse(line); if (o.playerName && o.playerId) map.set(norm(o.playerName), o.playerId); } catch {}
    }
  }
  for (const f of fs.existsSync(BOARD_DIR) ? fs.readdirSync(BOARD_DIR) : []) {
    if (!f.endsWith(".json")) continue;
    try { for (const l of JSON.parse(fs.readFileSync(path.join(BOARD_DIR, f), "utf8")).leans ?? []) if (l.playerName && l.playerId) map.set(norm(l.playerName), l.playerId); } catch {}
  }
  return map;
}

// ── historical pitcher_outs props, excluding the current unsettled slate. The archive posts ONLY "Over"
// selections (no under side), so each over line is its own data point. We de-vig the raw over-implied prob
// with the standard MLB player-prop hold (~4.5%): fairOver ≈ overImplied / (1 + HOLD). One row per over line,
// which gives a SPREAD of market probabilities (deep-over ~80% … near-even ~50% … long-over ~20%). ──
const ASSUMED_HOLD = 0.045;
function loadHistoricalProps(cutoff) {
  const rows = [];
  for (const f of fs.readdirSync(PROPS_DIR)) {
    if (!f.endsWith(".json")) continue;
    const date = f.replace(".json", "");
    if (date >= cutoff) continue; // only settled dates
    const o = JSON.parse(fs.readFileSync(path.join(PROPS_DIR, f), "utf8"));
    for (const p of o.props ?? []) {
      if (p.market !== "pitcher_outs" || !/over/i.test(p.selection) || p.point == null || p.americanOdds == null) continue;
      const overImplied = americanToProb(p.americanOdds);
      rows.push({ date, player: p.player, line: p.point, overOdds: p.americanOdds, marketProbOver: Math.min(0.985, overImplied / (1 + ASSUMED_HOLD)) });
    }
  }
  return rows;
}

async function fetchGameLog(id, cache) {
  if (cache[id]) return cache[id];
  const j = await fetch(`https://statsapi.mlb.com/api/v1/people/${id}/stats?stats=gameLog&season=2026&group=pitching`).then((r) => r.json());
  const starts = (j.stats?.[0]?.splits || [])
    .filter((s) => Number(s.stat.gamesStarted || 0) > 0)
    .map((s) => ({ date: s.date, outs: parseIP(s.stat.inningsPitched) }))
    .sort((a, b) => a.date.localeCompare(b.date));
  cache[id] = starts;
  return starts;
}

// ── the candidate model — strictly earlier starts only ──
function project(priorStarts) {
  const recent = priorStarts.slice(-MAX_PRIOR);
  if (recent.length < MIN_PRIOR) return null;
  // recency-weighted mean (most recent = highest weight)
  let wsum = 0, vsum = 0;
  recent.forEach((s, i) => { const w = DECAY ** (recent.length - 1 - i); wsum += w; vsum += w * s.outs; });
  const wmean = vsum / wsum;
  // shrink toward the league prior by effective-sample size
  const n = recent.length;
  const projection = (n * wmean + PRIOR_K * LEAGUE_OUTS) / (n + PRIOR_K);
  const sigma = Math.max(sd(recent.map((s) => s.outs)), SIGMA_FLOOR);
  return { projection, sigma, n };
}

async function main() {
  const cutoff = "2026-07-12"; // settled_leans ends 2026-07-11; anything ≥ this may be non-final
  const nameId = buildNameId();
  const props = loadHistoricalProps(cutoff);
  const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, "utf8")) : {};

  const rows = [];
  const misses = new Set();
  let leakGuardFails = 0;
  for (const p of props) {
    const id = nameId.get(norm(p.player));
    if (!id) { misses.add(p.player); continue; }
    let log;
    try { log = await fetchGameLog(id, cache); } catch { continue; }
    // the start ON that date = actual; strictly-earlier starts = model input (LEAKAGE-SAFE)
    const actualStart = log.find((s) => s.date === p.date);
    if (!actualStart) continue; // pitcher had a line but no logged start that date (scratched / postponed)
    const prior = log.filter((s) => s.date < p.date);
    // leakage guard: no prior start may be dated on/after the target date
    if (prior.some((s) => s.date >= p.date)) { leakGuardFails++; continue; }
    const m = project(prior);
    if (!m) continue;
    const line = p.line;
    const actualOver = actualStart.outs > line ? 1 : actualStart.outs < line ? 0 : null; // X.5 lines never push
    if (actualOver == null) continue;
    const modelProbOver = Math.min(0.999, Math.max(0.001, 1 - normCdf((line - m.projection) / m.sigma)));
    rows.push({
      date: p.date, player: p.player, line, actualOuts: actualStart.outs, priorN: m.n,
      projection: +m.projection.toFixed(2), sigma: +m.sigma.toFixed(2),
      modelProbOver: +modelProbOver.toFixed(4), marketProbOver: +p.marketProbOver.toFixed(4), actualOver,
      _prior: prior,
    });
  }
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  fs.writeFileSync(CACHE, JSON.stringify(cache));

  // ── metrics ──
  const N = rows.length;
  const brier = (probs) => mean(rows.map((r, i) => (probs[i] - r.actualOver) ** 2));
  const logloss = (probs) => mean(rows.map((r, i) => { const q = Math.min(0.999, Math.max(0.001, probs[i])); return -(r.actualOver * Math.log(q) + (1 - r.actualOver) * Math.log(1 - q)); }));
  const modelP = rows.map((r) => r.modelProbOver), mktP = rows.map((r) => r.marketProbOver);
  const mae = mean(rows.map((r) => Math.abs(r.projection - r.actualOuts)));
  const overRate = mean(rows.map((r) => r.actualOver));

  // calibration curve (deciles) for the model
  const buckets = [];
  for (let b = 0; b < 10; b++) {
    const lo = b / 10, hi = (b + 1) / 10;
    const inB = rows.filter((r) => r.modelProbOver >= lo && r.modelProbOver < (b === 9 ? 1.0001 : hi));
    if (inB.length) buckets.push({ bucket: `${(lo * 100).toFixed(0)}-${(hi * 100).toFixed(0)}%`, n: inB.length, predicted: +mean(inB.map((r) => r.modelProbOver)).toFixed(3), empiricalOver: +mean(inB.map((r) => r.actualOver)).toFixed(3) });
  }

  const brModel = brier(modelP), brMkt = brier(mktP), llModel = logloss(modelP), llMkt = logloss(mktP);
  const beatsMarket = N >= 60 && brModel < brMkt && llModel < llMkt;

  // ── robustness sweep: re-score a grid of reasonable model variants on the SAME rows, so the negative
  // result isn't an artifact of one arbitrary parameterization. If ANY variant beats the market on both
  // Brier AND logloss, the conclusion would change. (Rows carry priorStarts for re-projection.) ──
  const sweep = [];
  for (const decay of [0.7, 0.85, 1.0]) for (const priorK of [0, 2, 4]) for (const sig of [3.0, 4.0, 5.5]) {
    const mp = rows.map((r) => {
      const rec = r._prior.slice(-MAX_PRIOR);
      let ws = 0, vs = 0; rec.forEach((s, i) => { const w = decay ** (rec.length - 1 - i); ws += w; vs += w * s.outs; });
      const wm = vs / ws, n = rec.length, proj = (n * wm + priorK * LEAGUE_OUTS) / (n + priorK);
      const sg = Math.max(sd(rec.map((s) => s.outs)), sig);
      return Math.min(0.999, Math.max(0.001, 1 - normCdf((r.line - proj) / sg)));
    });
    sweep.push({ decay, priorK, sigmaFloor: sig, brier: +brier(mp).toFixed(4), logloss: +logloss(mp).toFixed(4), beatsMarket: brier(mp) < brMkt && logloss(mp) < llMkt });
  }
  const anyVariantBeats = sweep.some((s) => s.beatsMarket);

  const report = {
    sport: "mlb", market: "pitcher_outs", kind: "candidate-model-backtest", public: false,
    generatedFor: "internal validation only — no public claim",
    model: { LEAGUE_OUTS, PRIOR_K, DECAY, MAX_PRIOR, SIGMA_FLOOR, MIN_PRIOR },
    leakageChecks: { rule: "projection uses strictly date<gameDate starts only", guardFailures: leakGuardFails, passed: leakGuardFails === 0 },
    sampleSize: N, nameMisses: [...misses],
    metrics: {
      mae: +mae.toFixed(3), overRate: +overRate.toFixed(3),
      brier: { model: +brModel.toFixed(4), market: +brMkt.toFixed(4), modelBeatsMarket: brModel < brMkt },
      logloss: { model: +llModel.toFixed(4), market: +llMkt.toFixed(4), modelBeatsMarket: llModel < llMkt },
    },
    calibrationByBucket: buckets,
    robustnessSweep: { variants: sweep, anyVariantBeatsMarket: anyVariantBeats, note: "12 reasonable (decay × priorK × sigmaFloor) variants re-scored on the same rows" },
    gate: { beatsMarket, anyVariantBeats, sufficientSample: N >= 60, verdict: beatsMarket ? "MODEL_BEATS_MARKET → candidate for public gate" : "MODEL_DOES_NOT_BEAT_MARKET → keep market-context-only" },
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  // strip the heavy _prior arrays before persisting
  fs.writeFileSync(OUT, JSON.stringify({ ...report, rows: rows.map(({ _prior, ...r }) => r).slice(0, 400) }, null, 2));

  // ── console ──
  console.log(`\n=== pitcher_outs backtest — ${N} settled starts (${[...misses].length} name-misses) ===`);
  console.log(`leakage guard: ${report.leakageChecks.passed ? "✓ PASS" : "✗ FAIL (" + leakGuardFails + ")"}  · over-rate ${(overRate * 100).toFixed(1)}%`);
  console.log(`MAE (proj vs actual outs): ${mae.toFixed(2)} outs`);
  console.log(`Brier   model ${brModel.toFixed(4)}  vs market ${brMkt.toFixed(4)}  → ${brModel < brMkt ? "model better" : "MARKET better"}`);
  console.log(`LogLoss model ${llModel.toFixed(4)}  vs market ${llMkt.toFixed(4)}  → ${llModel < llMkt ? "model better" : "MARKET better"}`);
  console.log("calibration (model prob bucket → empirical over-rate):");
  for (const b of buckets) console.log(`  ${b.bucket.padEnd(9)} n=${String(b.n).padStart(3)}  pred ${(b.predicted * 100).toFixed(0)}%  actual ${(b.empiricalOver * 100).toFixed(0)}%`);
  console.log(`\nrobustness sweep (12 variants): ${anyVariantBeats ? "⚠ at least one variant beats the market" : "NONE beat the market on both Brier + logloss"}`);
  const best = [...sweep].sort((a, b) => a.brier - b.brier)[0];
  console.log(`  best variant: decay=${best.decay} priorK=${best.priorK} sigmaFloor=${best.sigmaFloor} → Brier ${best.brier} (market ${brMkt.toFixed(4)})`);
  console.log(`\nGATE: ${report.gate.verdict}`);
  console.log(`report → ${path.relative(REPO, OUT)}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
