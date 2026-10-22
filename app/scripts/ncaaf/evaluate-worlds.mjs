/**
 * NCAAF-003 · world diagnostics under docs/ncaaf/WORLD_MODEL_SPEC.md §3. PRIVATE_RESEARCH.
 *
 *   --phase dev       2022–2023 FBS–FBS → experiments/003-dev-diagnostics.json, then writes 003-freeze.json
 *   --phase holdout   REFUSES unless 003-freeze.json is committed and the engine/model files are unchanged
 *                     since its commit → experiments/003-holdout-diagnostics.json (write-once)
 *
 * Replays the corpus from 2016 with the frozen C2 inside the world wrapper and the frozen C1 alongside, so
 * every world is built from earlier slate days only.
 *
 * Run (from app/): node scripts/ncaaf/evaluate-worlds.mjs --phase dev --now 2026-10-10T00:00:00Z
 */
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createWorldModel, BANK_NEIGHBOURS, DEFAULT_WORLDS, WORLD_ENGINE_VERSION } from "../../src/lib/sports/ncaaf/game-worlds.mjs";
import { brier, ece, logLoss, normalCrps } from "../../src/lib/sports/ncaaf/metrics.mjs";
import { createModel } from "../../src/lib/sports/ncaaf/models.mjs";
import { walkForward } from "../../src/lib/sports/ncaaf/walk-forward.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.resolve(APP, "..");
const RES = path.join(ROOT, "data", "internal", "research", "ncaaf");
const EXP = path.join(RES, "experiments");
const ENGINE_FILES = ["app/src/lib/sports/ncaaf/game-worlds.mjs", "app/src/lib/sports/ncaaf/overtime.mjs", "app/src/lib/sports/ncaaf/models.mjs", "app/src/lib/sports/ncaaf/walk-forward.mjs", "app/scripts/ncaaf/evaluate-worlds.mjs"];

const arg = (name, fb = null) => { const i = process.argv.indexOf(name); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fb; };
const PHASE = arg("--phase"), NOW = arg("--now");
if (!["dev", "holdout"].includes(PHASE)) { console.error("REFUSED: --phase dev|holdout"); process.exit(1); }
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }
const WINDOW = PHASE === "dev" ? [2022, 2023] : [2024, 2025];
const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }).trim();
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

// ── frozen inputs ────────────────────────────────────────────────────────────────────────────────
const freeze002 = JSON.parse(fs.readFileSync(path.join(EXP, "002-freeze.json"), "utf8"));
const C2 = freeze002.scoreChampion.spec, C1 = freeze002.winnerChampion.spec;
const manifestText = fs.readFileSync(path.join(RES, "corpus", "v1", "manifest.json"), "utf8");
const manifest = JSON.parse(manifestText);
const rows = Object.keys(manifest.seasons).map(Number).sort().filter((s) => s <= WINDOW.at(-1)).flatMap((s) => {
  const text = fs.readFileSync(path.join(RES, "corpus", "v1", `games-${s}.jsonl`), "utf8");
  if (sha256(text) !== manifest.seasons[s].sha256) { console.error(`REFUSED: games-${s}.jsonl hash mismatch`); process.exit(1); }
  return text.trim().split("\n").map((l) => JSON.parse(l));
});
const otText = fs.readFileSync(path.join(RES, "corpus", "v1", "overtime-periods.json"), "utf8");
const ot = JSON.parse(otText);

if (PHASE === "holdout") {
  const f = JSON.parse(fs.readFileSync(path.join(EXP, "003-freeze.json"), "utf8"));
  if (!/^[0-9a-f]{40}$/.test(f.codeCommit)) { console.error("REFUSED: commit 003-freeze.json and record its sha first"); process.exit(1); }
  try { git("merge-base", "--is-ancestor", f.codeCommit, "HEAD"); } catch { console.error("REFUSED: freeze commit not an ancestor of HEAD"); process.exit(1); }
  const changed = git("diff", "--name-only", f.codeCommit, "--", ...ENGINE_FILES) || git("status", "--porcelain", "--", ...ENGINE_FILES.map((x) => path.join(ROOT, x)));
  if (changed) { console.error(`REFUSED: engine files changed since freeze:\n${changed}`); process.exit(1); }
  if (f.corpusManifestSha256 !== sha256(manifestText) || f.overtimeTableSha256 !== sha256(otText)) { console.error("REFUSED: inputs differ from the freeze"); process.exit(1); }
}

// ── run ──────────────────────────────────────────────────────────────────────────────────────────
const keep = (r) => WINDOW.includes(r.season) && r.pairing === "FBS-FBS";
const t0 = Date.now();
const world = walkForward(createWorldModel(createModel(C2), { otRows: ot.games, quarantinedIds: new Set(ot.quarantined.map((q) => q.eventId)) }), rows, { keep });
const elo = new Map(walkForward(createModel(C1), rows, { keep }).map((f) => [f.eventId, f.pHome]));
console.log(`simulated ${world.length} games in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

const crpsDiscrete = (hist, x) => {
  const keys = Object.keys(hist).map(Number).sort((a, b) => a - b);
  const n = keys.reduce((s, k) => s + hist[k], 0);
  let F = 0, s = 0;
  const lo = Math.min(keys[0], x), hi = Math.max(keys.at(-1), x);
  const h = new Map(keys.map((k) => [k, hist[k]]));
  for (let z = lo; z <= hi; z++) { F += (h.get(z) ?? 0) / n; s += (F - (z >= x ? 1 : 0)) ** 2; }
  return s;
};
const freq = (hist, pred) => { const n = Object.values(hist).reduce((s, v) => s + v, 0); return Object.entries(hist).reduce((s, [k, v]) => s + (pred(Number(k)) ? v : 0), 0) / n; };
const mean = (xs) => xs.reduce((s, v) => s + v, 0) / xs.length;

const ok = world.filter((f) => !f.worlds.refused);
const refused = world.filter((f) => f.worlds.refused).reduce((o, f) => ((o[f.worlds.refused] = (o[f.worlds.refused] ?? 0) + 1), o), {});
const pw = ok.map((f) => f.worlds.pHome), ys = ok.map((f) => f.homeWin);
const structure = {
  overtimeRate: { predicted: mean(ok.map((f) => f.worlds.counts.overtimeWorlds / f.worlds.worlds)), actual: mean(ok.map((f) => (rows.find((r) => r.eventId === f.eventId).overtimePeriods > 0 ? 1 : 0))) },
};
const shapes = {
  absMargin3: (m) => Math.abs(m) === 3, absMargin7: (m) => Math.abs(m) === 7, absMargin10: (m) => Math.abs(m) === 10, absMargin14: (m) => Math.abs(m) === 14,
  oneScore: (m) => Math.abs(m) <= 7, blowout28plus: (m) => Math.abs(m) >= 28,
};
for (const [k, pred] of Object.entries(shapes)) structure[k] = { predicted: mean(ok.map((f) => freq(f.worlds.marginHistogram, pred))), actual: mean(ok.map((f) => (pred(f.margin) ? 1 : 0))) };
for (let lo = 0; lo < 105; lo += 7) {
  const pred = (t) => t >= lo && t < lo + 7;
  structure[`total${lo}to${lo + 6}`] = { predicted: mean(ok.map((f) => freq(f.worlds.totalHistogram, pred))), actual: mean(ok.map((f) => (pred(f.total) ? 1 : 0))) };
}
const elop = ok.map((f) => elo.get(f.eventId));
const receiptsSha256 = sha256(ok.map((f) => JSON.stringify(f.worlds)).join("\n"));
const report = {
  schemaVersion: 1, phase: PHASE, window: WINDOW, population: "FBS-FBS", engine: WORLD_ENGINE_VERSION, worldsPerEvent: DEFAULT_WORLDS, bankNeighbours: BANK_NEIGHBOURS,
  inputs: { scoreChampion: C2, winnerChampion: C1, corpusManifestSha256: sha256(manifestText), overtimeTableSha256: sha256(otText) },
  games: world.length, simulated: ok.length, refused,
  coherence: { incoherentWorlds: 0, note: "simulateEvent throws on any incoherent world; reaching this line means 0" },
  receiptsSha256,
  winner: {
    worlds: { logLoss: mean(ok.map((f) => logLoss(f.worlds.pHome, f.homeWin))), brier: mean(ok.map((f) => brier(f.worlds.pHome, f.homeWin))), ece: ece(pw, ys) },
    c2Analytic: { logLoss: mean(ok.map((f) => logLoss(f.pHome, f.homeWin))), ece: ece(ok.map((f) => f.pHome), ys) },
    c1Elo: { logLoss: mean(ok.map((f, i) => logLoss(elop[i], f.homeWin))), ece: ece(elop, ys) },
    absDiffWorldVsC1: { mean: mean(ok.map((f, i) => Math.abs(f.worlds.pHome - elop[i]))), p90: ok.map((f, i) => Math.abs(f.worlds.pHome - elop[i])).sort((a, b) => a - b)[Math.floor(0.9 * ok.length)] },
  },
  margin: {
    crpsWorlds: mean(ok.map((f) => crpsDiscrete(f.worlds.marginHistogram, f.margin))),
    crpsC2Normal: mean(ok.map((f) => normalCrps(f.marginMean, f.marginSd, f.margin))),
    coverage80: mean(ok.map((f) => (f.margin >= f.worlds.marginPercentiles.p10 && f.margin <= f.worlds.marginPercentiles.p90 ? 1 : 0))),
    bias: mean(ok.map((f) => f.worlds.mean.margin - f.margin)),
  },
  total: {
    crpsWorlds: mean(ok.map((f) => crpsDiscrete(f.worlds.totalHistogram, f.total))),
    crpsC2Normal: mean(ok.map((f) => normalCrps(f.totalMean, f.totalSd, f.total))),
    coverage80: mean(ok.map((f) => (f.total >= f.worlds.totalPercentiles.p10 && f.total <= f.worlds.totalPercentiles.p90 ? 1 : 0))),
    bias: mean(ok.map((f) => f.worlds.mean.total - f.total)),
  },
  structure,
};
const body = `${JSON.stringify(report, null, 2)}\n`;
const out = path.join(EXP, `003-${PHASE}-diagnostics.json`);
if (PHASE === "holdout" && fs.existsSync(out)) {
  if (fs.readFileSync(out, "utf8") !== body) { console.error("REFUSED: a different holdout diagnostics file exists (write-once)"); process.exit(1); }
  console.log("holdout diagnostics reproduced byte-for-byte");
} else fs.writeFileSync(out, body);
if (PHASE === "dev") {
  fs.writeFileSync(path.join(EXP, "003-freeze.json"), `${JSON.stringify({
    schemaVersion: 1, frozenAt: NOW, engine: WORLD_ENGINE_VERSION, worldsPerEvent: DEFAULT_WORLDS, bankNeighbours: BANK_NEIGHBOURS, baseSeed: 20261009,
    scoreChampion: C2, winnerChampion: C1, corpusManifestSha256: sha256(manifestText), overtimeTableSha256: sha256(otText),
    engineFiles: ENGINE_FILES, devReceiptsSha256: receiptsSha256, codeCommit: "TO_BE_SET_BY_FREEZE_COMMIT",
  }, null, 2)}\n`);
}
console.log(JSON.stringify({ simulated: ok.length, refused, winner: report.winner, margin: report.margin, total: report.total }, null, 1));
for (const [k, v] of Object.entries(structure)) console.log(`${k.padEnd(16)} predicted ${v.predicted.toFixed(4)} actual ${v.actual.toFixed(4)}`);
