/**
 * NCAAF-002 · walk-forward evaluation under docs/ncaaf/MODEL_EVALUATION_PROTOCOL.md. PRIVATE_RESEARCH.
 *
 * Three phases, each writing its own receipt under data/internal/research/ncaaf/experiments/:
 *
 *   --phase dev         tune each candidate's registered grid on 2021–2022 (FBS–FBS)    → 002-dev-tuning.json
 *   --phase validation  score tuned candidates on 2023, apply the §6 selection rule,
 *                       write the freeze proposal                                       → 002-validation.json, 002-freeze.json
 *   --phase holdout     REFUSES unless 002-freeze.json is committed, the model code is unchanged since its
 *                       commit and the corpus hash matches; scores 2024–2025 once (§7)  → 002-holdout-receipt.json (write-once)
 *
 * Every phase replays the corpus from 2016 with the walk-forward runner, so each scored game is forecast from
 * earlier slate days only. Bootstrap = week clusters, 2,000 reps, seed 20261009.
 *
 * Run (from app/): node scripts/ncaaf/evaluate-baselines.mjs --phase dev --now 2026-10-09T22:00:00Z
 */
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { clusterBootstrap, logLoss, normalCrps, reliability, scoreForecasts } from "../../src/lib/sports/ncaaf/metrics.mjs";
import { createModel } from "../../src/lib/sports/ncaaf/models.mjs";
import { walkForward } from "../../src/lib/sports/ncaaf/walk-forward.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.resolve(APP, "..");
const CORPUS = path.join(ROOT, "data", "internal", "research", "ncaaf", "corpus", "v1");
const EXP = path.join(ROOT, "data", "internal", "research", "ncaaf", "experiments");
const MODEL_FILES = ["app/src/lib/sports/ncaaf/models.mjs", "app/src/lib/sports/ncaaf/walk-forward.mjs", "app/src/lib/sports/ncaaf/metrics.mjs", "app/scripts/ncaaf/evaluate-baselines.mjs"];

const arg = (name, fb = null) => { const i = process.argv.indexOf(name); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fb; };
const PHASE = arg("--phase");
const NOW = arg("--now");
if (!["dev", "validation", "holdout"].includes(PHASE)) { console.error("REFUSED: --phase dev|validation|holdout"); process.exit(1); }
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }

const BOOT = { reps: 2000, seed: 20261009 };
const WINDOWS = { dev: [2021, 2022], validation: [2023], holdout: [2024, 2025] };
const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }).trim();
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
const writeJson = (name, obj) => { fs.mkdirSync(EXP, { recursive: true }); fs.writeFileSync(path.join(EXP, name), `${JSON.stringify(obj, null, 2)}\n`); };
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(EXP, name), "utf8"));

// ── corpus ────────────────────────────────────────────────────────────────────────────────────────
const manifestText = fs.readFileSync(path.join(CORPUS, "manifest.json"), "utf8");
const manifest = JSON.parse(manifestText);
const corpusSha = sha256(manifestText);
const lastSeason = Math.max(...WINDOWS[PHASE]);
const rows = Object.keys(manifest.seasons).map(Number).sort().filter((s) => s <= lastSeason).flatMap((s) => {
  const text = fs.readFileSync(path.join(CORPUS, `games-${s}.jsonl`), "utf8");
  if (sha256(text) !== manifest.seasons[s].sha256) { console.error(`REFUSED: games-${s}.jsonl does not match its manifest hash`); process.exit(1); }
  return text.trim().split("\n").map((l) => JSON.parse(l));
});
const inWindow = (r) => WINDOWS[PHASE].includes(r.season);
const primary = (r) => inWindow(r) && r.pairing === "FBS-FBS";
const secondary = (r) => inWindow(r) && r.pairing === "FBS-FCS";

// ── grids (protocol §4) ──────────────────────────────────────────────────────────────────────────
const grid = (o) => Object.entries(o).reduce((acc, [k, vs]) => acc.flatMap((a) => vs.map((v) => ({ ...a, [k]: v }))), [{}]);
const GRIDS = {
  C1: grid({ K: [20, 30, 40, 50], HFA: [40, 55, 70, 85], c: [0.5, 0.6, 0.7, 0.8], dFcs: [200, 300, 400] }).map((g) => ({ id: "C1", ...g })),
  C2: grid({ lambda: [2, 5, 10, 20], H: [120, 240, 365, 730] }).map((g) => ({ id: "C2", ...g })),
};
const scoreObjective = (m) => m.margin.crps + m.total.crps;

function run(spec, keep = (r) => primary(r) || secondary(r)) {
  const t0 = Date.now();
  const f = walkForward(createModel(spec), rows, { keep });
  return { forecasts: f, seconds: (Date.now() - t0) / 1000 };
}

const COHORTS = {
  all: () => true,
  weeks1to4: (r) => r.seasonType === 2 && r.week <= 4,
  weeks5plus: (r) => r.seasonType === 2 && r.week >= 5,
  conference: (r) => r.conferenceGame === true,
  nonConference: (r) => r.conferenceGame === false,
  neutral: (r) => r.neutralSite === true,
  postseason: (r) => r.seasonType === 3,
};
function report(forecasts) {
  const p = forecasts.filter((f) => f.pairing === "FBS-FBS");
  const out = { primary: {}, bySeason: {}, secondaryFbsFcs: scoreForecasts(forecasts.filter((f) => f.pairing === "FBS-FCS")) };
  for (const [k, pred] of Object.entries(COHORTS)) out.primary[k] = scoreForecasts(p.filter(pred));
  for (const s of WINDOWS[PHASE]) out.bySeason[s] = scoreForecasts(p.filter((f) => f.season === s));
  return out;
}

/** Paired week-bootstrap of mean(loss_a − loss_b) over the primary games both forecast. */
function paired(a, b, loss) {
  const byId = new Map(b.filter((f) => f.pairing === "FBS-FBS").map((f) => [f.eventId, f]));
  const recs = a.filter((f) => f.pairing === "FBS-FBS" && byId.has(f.eventId)).map((f) => ({ cluster: f.cluster, d: loss(f) - loss(byId.get(f.eventId)) }));
  return clusterBootstrap(recs, (rs) => rs.reduce((s, r) => s + r.d, 0) / rs.length, BOOT);
}
const winnerLoss = (f) => logLoss(f.pHome, f.homeWin);
const scoreLoss = (f) => normalCrps(f.marginMean, f.marginSd, f.margin) + normalCrps(f.totalMean, f.totalSd, f.total);

/** §6: walk the complexity order; a candidate replaces the champion only if its paired 95% CI is entirely < 0. */
function select(order, results, loss) {
  let champ = order[0];
  const steps = [];
  for (const c of order.slice(1)) {
    const d = paired(results[c].forecasts, results[champ].forecasts, loss);
    const replaces = d.hi < 0;
    steps.push({ challenger: c, incumbent: champ, meanDifference: d.estimate, ci95: [d.lo, d.hi], weekClusters: d.clusters, replaces });
    if (replaces) champ = c;
  }
  return { champion: champ, steps };
}

const provenance = () => ({
  head: git("rev-parse", "HEAD"),
  modelFilesDirty: git("status", "--porcelain", "--", ...MODEL_FILES.map((f) => path.join(ROOT, f))) !== "",
  node: process.version,
  corpusManifestSha256: corpusSha,
  bootstrap: BOOT,
});

// ── phases ───────────────────────────────────────────────────────────────────────────────────────
if (PHASE === "dev") {
  const tuning = {};
  for (const id of ["C1", "C2"]) {
    const results = GRIDS[id].map((spec, i) => {
      const { forecasts, seconds } = run(spec, primary);
      const m = scoreForecasts(forecasts);
      if (id === "C2" || i % 24 === 0) console.log(`${id} ${i + 1}/${GRIDS[id].length} ${JSON.stringify(spec)} logLoss=${m.logLoss.toFixed(4)} score=${scoreObjective(m).toFixed(3)} (${seconds.toFixed(1)}s)`);
      return { spec, n: m.n, logLoss: m.logLoss, scoreObjective: scoreObjective(m) };
    });
    // Grid is enumerated smallest-values-first, so the first minimum is the simpler tie-break (§4).
    const key = id === "C1" ? "logLoss" : "scoreObjective";
    const best = results.reduce((b, r) => (r[key] < b[key] ? r : b));
    tuning[id] = { objective: key, best: best.spec, results };
  }
  // C3 grid = C2's best (λ, H) × λ_c.
  GRIDS.C3 = [1, 3, 10, 30].map((lambdaC) => ({ id: "C3", lambda: tuning.C2.best.lambda, H: tuning.C2.best.H, lambdaC }));
  const c3 = GRIDS.C3.map((spec) => {
    const { forecasts, seconds } = run(spec, primary);
    const m = scoreForecasts(forecasts);
    console.log(`C3 ${JSON.stringify(spec)} logLoss=${m.logLoss.toFixed(4)} score=${scoreObjective(m).toFixed(3)} (${seconds.toFixed(1)}s)`);
    return { spec, n: m.n, logLoss: m.logLoss, scoreObjective: scoreObjective(m) };
  });
  tuning.C3 = { objective: "scoreObjective", best: c3.reduce((b, r) => (r.scoreObjective < b.scoreObjective ? r : b)).spec, results: c3 };
  writeJson("002-dev-tuning.json", { schemaVersion: 1, protocol: "docs/ncaaf/MODEL_EVALUATION_PROTOCOL.md (v1 + amendment 1)", phase: "dev", window: WINDOWS.dev, population: "FBS-FBS", generatedAt: NOW, provenance: provenance(), tuning });
  console.log(`best: C1 ${JSON.stringify(tuning.C1.best)} · C2 ${JSON.stringify(tuning.C2.best)} · C3 ${JSON.stringify(tuning.C3.best)}`);
}

if (PHASE === "validation") {
  const dev = readJson("002-dev-tuning.json");
  const specs = { B0: { id: "B0" }, B1: { id: "B1" }, C1: dev.tuning.C1.best, C2: dev.tuning.C2.best, C3: dev.tuning.C3.best };
  const results = {};
  for (const [id, spec] of Object.entries(specs)) { results[id] = run(spec); console.log(`${id} validation ran in ${results[id].seconds.toFixed(1)}s`); }
  const candidates = Object.fromEntries(Object.entries(specs).map(([id, spec]) => [id, { spec, ...report(results[id].forecasts) }]));
  const order = ["B0", "B1", "C1", "C2", "C3"];
  const winner = select(order, results, winnerLoss);
  const score = select(order, results, scoreLoss);
  writeJson("002-validation.json", { schemaVersion: 1, phase: "validation", window: WINDOWS.validation, generatedAt: NOW, provenance: provenance(), selectionRule: "protocol §6 — complexity order B0<B1<C1<C2<C3; replace only if paired week-bootstrap 95% CI of the loss difference is entirely < 0", winnerSelection: winner, scoreSelection: score, candidates });
  const freeze = {
    schemaVersion: 1,
    frozenAt: NOW,
    protocol: "docs/ncaaf/MODEL_EVALUATION_PROTOCOL.md (v1 + amendment 1)",
    corpusManifestSha256: corpusSha,
    winnerChampion: { id: winner.champion, spec: specs[winner.champion] },
    scoreChampion: { id: score.champion, spec: specs[score.champion] },
    baselines: { B0: specs.B0, B1: specs.B1 },
    allTuned: specs,
    modelFiles: MODEL_FILES,
    codeCommit: "TO_BE_SET_BY_FREEZE_COMMIT",
    note: "The holdout phase refuses to run until codeCommit names a commit containing this file and the model files are unchanged since it.",
  };
  writeJson("002-freeze.json", freeze);
  console.log(`winner champion: ${winner.champion} · score champion: ${score.champion}`);
  for (const s of [...winner.steps, ...score.steps]) console.log(`  ${s.challenger} vs ${s.incumbent}: Δ=${s.meanDifference.toFixed(4)} CI [${s.ci95[0].toFixed(4)}, ${s.ci95[1].toFixed(4)}] → ${s.replaces ? "replaces" : "kept incumbent"}`);
}

if (PHASE === "holdout") {
  const freezePath = path.join(EXP, "002-freeze.json");
  if (!fs.existsSync(freezePath)) { console.error("REFUSED: no 002-freeze.json"); process.exit(1); }
  const freeze = readJson("002-freeze.json");
  if (!/^[0-9a-f]{40}$/.test(freeze.codeCommit)) { console.error("REFUSED: freeze.codeCommit is not a commit sha — commit the freeze first"); process.exit(1); }
  try { git("merge-base", "--is-ancestor", freeze.codeCommit, "HEAD"); } catch { console.error("REFUSED: freeze commit is not an ancestor of HEAD"); process.exit(1); }
  const committedFreeze = git("show", `${freeze.codeCommit}:data/internal/research/ncaaf/experiments/002-freeze.json`);
  const { codeCommit: _a, ...frozenBody } = JSON.parse(committedFreeze); const { codeCommit: _b, ...currentBody } = freeze;
  if (JSON.stringify(frozenBody) !== JSON.stringify(currentBody)) { console.error("REFUSED: 002-freeze.json differs from the committed freeze"); process.exit(1); }
  const changed = git("diff", "--name-only", freeze.codeCommit, "--", ...MODEL_FILES);
  const dirty = git("status", "--porcelain", "--", ...MODEL_FILES.map((f) => path.join(ROOT, f)));
  if (changed || dirty) { console.error(`REFUSED: model files changed since the freeze commit:\n${changed}\n${dirty}`); process.exit(1); }
  if (freeze.corpusManifestSha256 !== corpusSha) { console.error("REFUSED: corpus differs from the frozen corpus"); process.exit(1); }

  const specs = { B0: freeze.baselines.B0, B1: freeze.baselines.B1, ...Object.fromEntries([freeze.winnerChampion, freeze.scoreChampion].map((c) => [c.id, c.spec])) };
  const results = {};
  for (const [id, spec] of Object.entries(specs)) { results[id] = run(spec); console.log(`${id} holdout ran in ${results[id].seconds.toFixed(1)}s`); }
  const candidates = Object.fromEntries(Object.entries(specs).map(([id, spec]) => [id, { spec, ...report(results[id].forecasts) }]));
  const W = freeze.winnerChampion.id, S = freeze.scoreChampion.id;
  const wm = candidates[W].primary.all, sm = candidates[S].primary.all;
  const vsB1 = paired(results[W].forecasts, results.B1.forecasts, winnerLoss);
  const bars = {
    a_logLossBeatsB1: { value: vsB1.estimate, ci95: [vsB1.lo, vsB1.hi], pass: vsB1.hi < 0 },
    b_calibration: { ece: wm.ece, slope: wm.calibration.slope, intercept: wm.calibration.intercept, pass: wm.ece <= 0.03 && wm.calibration.slope >= 0.85 && wm.calibration.slope <= 1.15 },
    c_intervalCoverage: { margin: sm.margin.coverage80, total: sm.total.coverage80, pass: [sm.margin.coverage80, sm.total.coverage80].every((c) => c >= 0.75 && c <= 0.85) },
  };
  const receipt = {
    schemaVersion: 1, phase: "holdout", window: WINDOWS.holdout, frozenCodeCommit: freeze.codeCommit, corpusManifestSha256: corpusSha,
    winnerChampion: W, scoreChampion: S, bars, gate002Pass: Object.values(bars).every((b) => b.pass),
    reliabilityWinnerChampion: reliability(results[W].forecasts.filter((f) => f.pairing === "FBS-FBS").map((f) => f.pHome), results[W].forecasts.filter((f) => f.pairing === "FBS-FBS").map((f) => f.homeWin)),
    candidates,
  };
  const body = `${JSON.stringify(receipt, null, 2)}\n`;
  const out = path.join(EXP, "002-holdout-receipt.json");
  if (fs.existsSync(out)) {
    if (fs.readFileSync(out, "utf8") !== body) { console.error("REFUSED: a different holdout receipt already exists (write-once)"); process.exit(1); }
    console.log("holdout receipt reproduced byte-for-byte");
  } else {
    fs.writeFileSync(out, body);
    console.log("wrote 002-holdout-receipt.json (write-once)");
  }
  console.log(JSON.stringify(bars, null, 2));
  console.log(`Gate 002 research bars: ${receipt.gate002Pass ? "PASS" : "FAIL"}`);
}
