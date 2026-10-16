/**
 * NCAAF-004 · challenger tuning and the single E26 evaluation (docs/ncaaf/CHALLENGER_REGISTER.md).
 * PRIVATE_RESEARCH.
 *
 *   --phase tune   tune H1/H3/H4 on spent windows (2016–2025 replay) → experiments/004-tuning.json + 004-freeze.json
 *   --phase e26    REFUSES unless 004-freeze.json is committed and code is unchanged since; scores incumbents and
 *                  challengers once on 2026 FBS–FBS (slate ≤ 2026-10-05) → experiments/004-e26-receipt.json (write-once)
 *
 * Run (from app/): node scripts/ncaaf/evaluate-challengers.mjs --phase tune --now <actual UTC time>
 */
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createAnalogWorldModel, createRecalibrated, createRidgeDivision } from "../../src/lib/sports/ncaaf/challengers.mjs";
import { createWorldModel } from "../../src/lib/sports/ncaaf/game-worlds.mjs";
import { clusterBootstrap, logLoss, normalCrps, scoreForecasts } from "../../src/lib/sports/ncaaf/metrics.mjs";
import { createModel } from "../../src/lib/sports/ncaaf/models.mjs";
import { walkForward } from "../../src/lib/sports/ncaaf/walk-forward.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.resolve(APP, "..");
const RES = path.join(ROOT, "data", "internal", "research", "ncaaf");
const EXP = path.join(RES, "experiments");
const CODE_FILES = ["app/src/lib/sports/ncaaf/challengers.mjs", "app/src/lib/sports/ncaaf/models.mjs", "app/src/lib/sports/ncaaf/game-worlds.mjs", "app/src/lib/sports/ncaaf/overtime.mjs", "app/src/lib/sports/ncaaf/walk-forward.mjs", "app/src/lib/sports/ncaaf/metrics.mjs", "app/scripts/ncaaf/evaluate-challengers.mjs"];
const BOOT = { reps: 2000, seed: 20261009 };

const arg = (name, fb = null) => { const i = process.argv.indexOf(name); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fb; };
const PHASE = arg("--phase"), NOW = arg("--now");
if (!["tune", "e26"].includes(PHASE)) { console.error("REFUSED: --phase tune|e26"); process.exit(1); }
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }
const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }).trim();
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
const writeJson = (name, o) => fs.writeFileSync(path.join(EXP, name), `${JSON.stringify(o, null, 2)}\n`);

// ── inputs ───────────────────────────────────────────────────────────────────────────────────────
const readCorpus = (dir, seasons, manifest) => seasons.flatMap((s) => {
  const text = fs.readFileSync(path.join(RES, "corpus", dir, `games-${s}.jsonl`), "utf8");
  const want = manifest.seasons ? manifest.seasons[s].sha256 : manifest.sha256;
  if (sha256(text) !== want) { console.error(`REFUSED: ${dir}/games-${s}.jsonl hash mismatch`); process.exit(1); }
  return text.trim().split("\n").map((l) => JSON.parse(l));
});
const v1Text = fs.readFileSync(path.join(RES, "corpus", "v1", "manifest.json"), "utf8");
const v1 = JSON.parse(v1Text);
const hist = readCorpus("v1", Object.keys(v1.seasons).map(Number).sort(), v1);
const otText = fs.readFileSync(path.join(RES, "corpus", "v1", "overtime-periods.json"), "utf8");
const ot = JSON.parse(otText);
const freeze002 = JSON.parse(fs.readFileSync(path.join(EXP, "002-freeze.json"), "utf8"));
const C1 = freeze002.winnerChampion.spec, C2 = freeze002.scoreChampion.spec;

const grid = (o) => Object.entries(o).reduce((acc, [k, vs]) => acc.flatMap((a) => vs.map((v) => ({ ...a, [k]: v }))), [{}]);
const mean = (xs) => xs.reduce((s, v) => s + v, 0) / xs.length;
const crpsDiscrete = (h, x) => {
  const keys = Object.keys(h).map(Number).sort((a, b) => a - b);
  const n = keys.reduce((s, k) => s + h[k], 0);
  const m = new Map(keys.map((k) => [k, h[k]]));
  let F = 0, s = 0;
  for (let z = Math.min(keys[0], x); z <= Math.max(keys.at(-1), x); z++) { F += (m.get(z) ?? 0) / n; s += (F - (z >= x ? 1 : 0)) ** 2; }
  return s;
};
const worldScore = (f) => crpsDiscrete(f.worlds.marginHistogram, f.margin) + crpsDiscrete(f.worlds.totalHistogram, f.total);
const normalScore = (f) => normalCrps(f.marginMean, f.marginSd, f.margin) + normalCrps(f.totalMean, f.totalSd, f.total);
const winnerLoss = (f) => logLoss(f.pHome, f.homeWin);
const otTable = { otRows: ot.games, quarantinedIds: new Set(ot.quarantined.map((q) => q.eventId)) };

// ── tune ─────────────────────────────────────────────────────────────────────────────────────────
if (PHASE === "tune") {
  const prim = (seasons) => (r) => seasons.includes(r.season) && r.pairing === "FBS-FBS";
  const S2125 = [2021, 2022, 2023, 2024, 2025], S2225 = [2022, 2023, 2024, 2025];
  const out = {};
  const h1 = grid({ K: [20, 30, 40, 50, 60], HFA: [40, 55, 70, 85, 100, 115, 130], c: [0.7, 0.8, 0.9, 0.95], dFcs: [200, 300, 400, 500, 600, 700] }).map((g) => {
    const spec = { id: "C1", ...g };
    return { spec, logLoss: mean(walkForward(createModel(spec), hist, { keep: prim(S2125) }).map(winnerLoss)) };
  });
  out.H1 = { objective: "logLoss 2021-25", best: h1.reduce((b, r) => (r.logLoss < b.logLoss ? r : b)), configs: h1.length, top5: [...h1].sort((a, b) => a.logLoss - b.logLoss).slice(0, 5) };
  console.log(`H1 best ${JSON.stringify(out.H1.best)}`);
  const h3 = grid({ lambda: [2, 5, 10, 20], H: [120, 240, 365, 730], lambdaDiv: [0.1, 1, 10] }).map((g, i) => {
    const f = walkForward(createRidgeDivision(g), hist, { keep: prim(S2125) });
    const r = { spec: { id: "C2d", ...g }, scoreObjective: mean(f.map(normalScore)) };
    console.log(`H3 ${i + 1}/48 ${JSON.stringify(g)} ${r.scoreObjective.toFixed(4)}`);
    return r;
  });
  out.H3 = { objective: "margin CRPS + total CRPS 2021-25", best: h3.reduce((b, r) => (r.scoreObjective < b.scoreObjective ? r : b)), results: h3 };
  const h4 = [100, 200, 300, 500].map((K) => {
    const f = walkForward(createAnalogWorldModel(createModel(C2), { K }), hist, { keep: prim(S2225) }).filter((x) => !x.worlds.refused);
    const r = { spec: { id: "W2", K, inner: C2 }, n: f.length, scoreObjective: mean(f.map(worldScore)), logLoss: mean(f.map((x) => logLoss(x.worlds.pHome, x.homeWin))) };
    console.log(`H4 K=${K} n=${r.n} ${r.scoreObjective.toFixed(4)}`);
    return r;
  });
  out.H4 = { objective: "exact discrete margin CRPS + total CRPS 2022-25", best: h4.reduce((b, r) => (r.scoreObjective < b.scoreObjective ? r : b)), results: h4 };
  writeJson("004-tuning.json", { schemaVersion: 1, register: "docs/ncaaf/CHALLENGER_REGISTER.md", generatedAt: NOW, corpusManifestSha256: sha256(v1Text), tuning: out });
  writeJson("004-freeze.json", {
    schemaVersion: 1, frozenAt: NOW,
    incumbents: { C1, C2, W1: { engine: "ncaaf-worlds@1", inner: C2 } },
    challengers: { H1: out.H1.best.spec, H2: { id: "C1r", inner: C1, firstSeason: 2017 }, H3: out.H3.best.spec, H4: out.H4.best.spec },
    e26: { corpus: "corpus/e26", season: 2026, throughSlateDate: "2026-10-05" },
    corpusManifestSha256: sha256(v1Text), overtimeTableSha256: sha256(otText), codeFiles: CODE_FILES, codeCommit: "TO_BE_SET_BY_FREEZE_COMMIT",
  });
  console.log(`frozen: H1 ${JSON.stringify(out.H1.best.spec)} · H3 ${JSON.stringify(out.H3.best.spec)} · H4 K=${out.H4.best.spec.K}`);
}

// ── e26 ──────────────────────────────────────────────────────────────────────────────────────────
if (PHASE === "e26") {
  const f = JSON.parse(fs.readFileSync(path.join(EXP, "004-freeze.json"), "utf8"));
  if (!/^[0-9a-f]{40}$/.test(f.codeCommit)) { console.error("REFUSED: commit 004-freeze.json and record its sha first"); process.exit(1); }
  try { git("merge-base", "--is-ancestor", f.codeCommit, "HEAD"); } catch { console.error("REFUSED: freeze commit not an ancestor of HEAD"); process.exit(1); }
  const changed = git("diff", "--name-only", f.codeCommit, "--", ...CODE_FILES) || git("status", "--porcelain", "--", ...CODE_FILES.map((x) => path.join(ROOT, x)));
  if (changed) { console.error(`REFUSED: code changed since freeze:\n${changed}`); process.exit(1); }
  if (f.corpusManifestSha256 !== sha256(v1Text) || f.overtimeTableSha256 !== sha256(otText)) { console.error("REFUSED: inputs differ from freeze"); process.exit(1); }
  const e26Text = fs.readFileSync(path.join(RES, "corpus", "e26", "manifest.json"), "utf8");
  const e26m = JSON.parse(e26Text);
  const rows = [...hist, ...readCorpus("e26", [2026], e26m)];
  const keep = (r) => r.season === 2026 && (r.pairing === "FBS-FBS" || r.pairing === "FBS-FCS");
  const run = (m) => walkForward(m, rows, { keep });
  const R = {
    C1: run(createModel(f.incumbents.C1)),
    C1w: run(createModel(f.challengers.H1)),
    C1r: run(createRecalibrated(createModel(f.challengers.H2.inner), { firstSeason: f.challengers.H2.firstSeason })),
    C2: run(createModel(f.incumbents.C2)),
    C2d: run(createRidgeDivision(f.challengers.H3)),
    W1: run(createWorldModel(createModel(f.incumbents.C2), otTable)),
    W2: run(createAnalogWorldModel(createModel(f.challengers.H4.inner), { K: f.challengers.H4.K })),
  };
  const primary = (xs) => xs.filter((x) => x.pairing === "FBS-FBS");
  const paired = (a, b, loss) => {
    const byId = new Map(primary(b).map((x) => [x.eventId, x]));
    const recs = primary(a).filter((x) => byId.has(x.eventId)).map((x) => ({ cluster: x.cluster, d: loss(x) - loss(byId.get(x.eventId)) }));
    const bs = clusterBootstrap(recs, (rs) => rs.reduce((s, r) => s + r.d, 0) / rs.length, BOOT);
    return { meanDifference: bs.estimate, ci95: [bs.lo, bs.hi], weekClusters: bs.clusters, n: recs.length, replaces: bs.hi < 0 };
  };
  const shapes = { overtime: null, absMargin3: (m) => Math.abs(m) === 3, absMargin7: (m) => Math.abs(m) === 7, oneScore: (m) => Math.abs(m) <= 7, blowout28plus: (m) => Math.abs(m) >= 28 };
  const structure = (xs) => {
    const ok = primary(xs).filter((x) => !x.worlds.refused);
    const freq = (h, p) => { const n = Object.values(h).reduce((s, v) => s + v, 0); return Object.entries(h).reduce((s, [k, v]) => s + (p(Number(k)) ? v : 0), 0) / n; };
    return Object.fromEntries(Object.entries(shapes).map(([k, p]) => [k, k === "overtime"
      ? { predicted: mean(ok.map((x) => x.worlds.counts.overtimeWorlds / x.worlds.worlds)), actual: mean(ok.map((x) => (rows.find((r) => r.eventId === x.eventId).overtimePeriods > 0 ? 1 : 0))) }
      : { predicted: mean(ok.map((x) => freq(x.worlds.marginHistogram, p))), actual: mean(ok.map((x) => (p(x.margin) ? 1 : 0))) }]));
  };
  const worldMetrics = (xs) => {
    const ok = primary(xs).filter((x) => !x.worlds.refused);
    return { n: ok.length, refused: primary(xs).length - ok.length, logLoss: mean(ok.map((x) => logLoss(x.worlds.pHome, x.homeWin))), marginCrps: mean(ok.map((x) => crpsDiscrete(x.worlds.marginHistogram, x.margin))), totalCrps: mean(ok.map((x) => crpsDiscrete(x.worlds.totalHistogram, x.total))), marginCoverage80: mean(ok.map((x) => (x.margin >= x.worlds.marginPercentiles.p10 && x.margin <= x.worlds.marginPercentiles.p90 ? 1 : 0))), totalCoverage80: mean(ok.map((x) => (x.total >= x.worlds.totalPercentiles.p10 && x.total <= x.worlds.totalPercentiles.p90 ? 1 : 0))) };
  };
  const wpaired = (a, b) => paired(a.filter((x) => !x.worlds.refused), b.filter((x) => !x.worlds.refused), worldScore);
  const receipt = {
    schemaVersion: 1, phase: "e26", window: "2026 FBS–FBS, slateDate ≤ 2026-10-05 (backtest, not forward evidence)", frozenCodeCommit: f.codeCommit,
    e26ManifestSha256: sha256(e26Text), corpusManifestSha256: sha256(v1Text),
    metrics: Object.fromEntries(["C1", "C1w", "C1r", "C2", "C2d"].map((k) => [k, { primary: scoreForecasts(primary(R[k])), secondaryFbsFcs: scoreForecasts(R[k].filter((x) => x.pairing === "FBS-FCS")) }])),
    worlds: { W1: { ...worldMetrics(R.W1), structure: structure(R.W1) }, W2: { ...worldMetrics(R.W2), structure: structure(R.W2) } },
    decisions: {
      H1_C1w_vs_C1: paired(R.C1w, R.C1, winnerLoss),
      H2_C1r_vs_C1: paired(R.C1r, R.C1, winnerLoss),
      H3_C2d_vs_C2: paired(R.C2d, R.C2, normalScore),
      H4_W2_vs_W1: wpaired(R.W2, R.W1),
    },
  };
  const body = `${JSON.stringify(receipt, null, 2)}\n`;
  const outFile = path.join(EXP, "004-e26-receipt.json");
  if (fs.existsSync(outFile)) {
    if (fs.readFileSync(outFile, "utf8") !== body) { console.error("REFUSED: a different E26 receipt exists (write-once)"); process.exit(1); }
    console.log("E26 receipt reproduced byte-for-byte");
  } else { fs.writeFileSync(outFile, body); console.log("wrote 004-e26-receipt.json (write-once)"); }
  for (const [k, d] of Object.entries(receipt.decisions)) console.log(`${k}: Δ=${d.meanDifference.toFixed(4)} CI [${d.ci95[0].toFixed(4)}, ${d.ci95[1].toFixed(4)}] n=${d.n} clusters=${d.weekClusters} → ${d.replaces ? "REPLACES" : "incumbent stays"}`);
}
