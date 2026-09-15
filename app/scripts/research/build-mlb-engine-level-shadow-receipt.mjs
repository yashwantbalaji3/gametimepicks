#!/usr/bin/env node
/**
 * P317 — MLB engine-level shadow receipt. Grades the private candidate-vs-control rows the full-game generator
 * writes (data/internal/research/mlb/engine-level-shadow/<date>.json) against committed StatsAPI linescores, and
 * rebuilds receipt.json: ACCUMULATING until the registered minimum, then ONE verdict, written once and never
 * rewritten (a later run that finds a verdict keeps it and only refreshes the running metrics beside it).
 *
 * Protocol: data/internal/research/mlb/reports/engine-level-shadow-protocol.json. Research only; nothing public.
 * Usage (from app/): npx tsx scripts/research/build-mlb-engine-level-shadow-receipt.mjs [--now ISO] [--write]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO = path.join(APP, "..");
const SHADOW_DIR = path.join(REPO, "data/internal/research/mlb/engine-level-shadow");
const PROTOCOL = path.join(REPO, "data/internal/research/mlb/reports/engine-level-shadow-protocol.json");
const LINESCORES = path.join(REPO, "data/internal/mlb/linescores");
const argOf = (f) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : null; };
const NOW = argOf("--now") ?? new Date().toISOString();
const WRITE = process.argv.includes("--write");
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const r4 = (v) => (Number.isFinite(v) ? Number(v.toFixed(4)) : null);
const meanOf = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

const protocol = readJson(PROTOCOL);
if (!protocol) { console.error("no protocol — refusing to grade an unregistered shadow"); process.exit(1); }
const MIN = protocol.forward.minimumGames;

/* ── join rows to finals ───────────────────────────────────────────────────────────────────────── */
const graded = [];
let rowsSeen = 0, pending = 0;
const files = fs.existsSync(SHADOW_DIR) ? fs.readdirSync(SHADOW_DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort() : [];
for (const f of files) {
  const doc = readJson(path.join(SHADOW_DIR, f));
  const finals = new Map(((readJson(path.join(LINESCORES, f)) ?? {}).games ?? []).filter((g) => g.isFinal && Number.isFinite(g.homeRuns) && Number.isFinite(g.awayRuns)).map((g) => [g.gamePk, g.homeRuns + g.awayRuns]));
  for (const row of doc?.rows ?? []) {
    rowsSeen += 1;
    const actual = finals.get(row.gamePk);
    if (!Number.isFinite(actual)) { pending += 1; continue; }
    graded.push({ ...row, actual });
  }
}

/* ── per-arm metrics (the protocol's) ──────────────────────────────────────────────────────────── */
const clip = (p) => Math.min(1 - 1e-6, Math.max(1e-6, p));
function armMetrics(list, arm) {
  const stats = list.map((g) => {
    const d = g[arm]; const mass = d.distribution.reduce((s, b) => s + b.probability, 0) || 1;
    const cdfBelow = d.distribution.filter((b) => b.value < g.actual).reduce((s, b) => s + b.probability, 0) / mass;
    const pAt = d.distribution.filter((b) => b.value === g.actual).reduce((s, b) => s + b.probability, 0) / mass;
    const pOver = g.marketTotalLine != null ? d.distribution.filter((b) => b.value > g.marketTotalLine).reduce((s, b) => s + b.probability, 0) / mass : null;
    const over = g.marketTotalLine != null ? (g.actual > g.marketTotalLine ? 1 : g.actual < g.marketTotalLine ? 0 : null) : null;
    return { level: g.actual - d.mean, covered: g.actual >= d.p10 && g.actual <= d.p90 ? 1 : 0, width: d.p90 - d.p10, pit: cdfBelow + 0.5 * pAt, ll: pOver != null && over != null ? -Math.log(clip(over ? pOver : 1 - pOver)) : null };
  });
  const pitHist = Array.from({ length: 10 }, (_, i) => stats.filter((s) => Math.min(9, Math.floor(s.pit * 10)) === i).length / (stats.length || 1));
  const lls = stats.map((s) => s.ll).filter((v) => v != null);
  return { n: stats.length, level: r4(meanOf(stats.map((s) => s.level))), coverageP10P90: r4(meanOf(stats.map((s) => s.covered))), meanWidthP10P90: r4(meanOf(stats.map((s) => s.width))), pitTailMass: r4(pitHist[0] + pitHist[9]), fixedOverLogLoss: lls.length ? r4(meanOf(lls)) : null, linedGames: lls.length };
}
const control = armMetrics(graded, "control");
const candidate = armMetrics(graded, "candidate");

/* ── the bars, read once ───────────────────────────────────────────────────────────────────────── */
function judge() {
  const checks = {
    levelAbsError: Math.abs(candidate.level) <= 0.5,
    improvesLevel: Math.abs(candidate.level) < Math.abs(control.level),
    coverageP10P90: candidate.coverageP10P90 >= 0.76 && candidate.coverageP10P90 <= 0.86,
    pitTailMass: candidate.pitTailMass <= 0.25,
    noWorseFixedOverLogLoss: candidate.fixedOverLogLoss == null || control.fixedOverLogLoss == null || candidate.fixedOverLogLoss <= control.fixedOverLogLoss + 0.005,
    widthGuard: candidate.meanWidthP10P90 <= control.meanWidthP10P90 * 1.15,
  };
  return { checks, verdict: Object.values(checks).every(Boolean) ? "ENGINE_LEVEL_PASS" : "ENGINE_LEVEL_FAIL" };
}

const prior = readJson(path.join(SHADOW_DIR, "receipt.json"));
const receipt = {
  schemaVersion: 1, artifact: "mlb-engine-level-shadow-receipt", dataClass: "PRIVATE_RESEARCH", program: "317",
  protocol: "data/internal/research/mlb/reports/engine-level-shadow-protocol.json", candidateId: protocol.candidate.id,
  updatedAt: NOW, rowsSeen, pending, graded: graded.length, needed: MIN, dates: [...new Set(graded.map((g) => g.date))].sort(),
  control, candidate,
  directions: "level = actual − simulated mean (0 is right); coverage targets 0.80; PIT tail mass 0.20 if well specified; log loss lower is better; width is the mean p10–p90 span",
  state: prior?.verdict ? "DECIDED" : graded.length >= MIN ? "DECIDED" : "ACCUMULATING",
  /* ONE LOOK: a verdict, once written, is carried verbatim — the running metrics beside it keep updating. */
  verdict: prior?.verdict ?? (graded.length >= MIN ? judge().verdict : null),
  decidedAt: prior?.decidedAt ?? (graded.length >= MIN ? NOW : null),
  decidedOn: prior?.decidedOn ?? (graded.length >= MIN ? { graded: graded.length, control, candidate, checks: judge().checks } : null),
  consequence: protocol.forward.consequence,
};
console.log(`engine-level shadow: ${graded.length}/${MIN} graded (${pending} pending, ${rowsSeen} rows) · control level ${control.level} cov ${control.coverageP10P90} PIT ${control.pitTailMass} · candidate level ${candidate.level} cov ${candidate.coverageP10P90} PIT ${candidate.pitTailMass} width ${candidate.meanWidthP10P90} vs ${control.meanWidthP10P90} · ${receipt.state}${receipt.verdict ? ` ${receipt.verdict}` : ""}`);
if (WRITE) {
  fs.mkdirSync(SHADOW_DIR, { recursive: true });
  fs.writeFileSync(path.join(SHADOW_DIR, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
  console.log("wrote data/internal/research/mlb/engine-level-shadow/receipt.json");
}
