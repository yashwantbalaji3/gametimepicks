#!/usr/bin/env node
/**
 * Soccer coherent match worlds (SW-1) — PRIVATE shadow receipt. $0, no network, no public file.
 *
 *   node scripts/soccer/build-soccer-match-worlds-shadow.mjs [--now <ISO>] [--runs 10000] [--dry-run]
 *
 * Reads forecasts that already exist and never changes them:
 *   · EPL live model (epl-model-v2-elo-poisson): app/public/data/soccer/epl/forecasts/latest.json, rows that carry
 *     λ and probabilities (withheld rows have neither and are listed as skipped, never filled in);
 *   · Dixon-Coles v2 private shadow (LaLiga, Serie A, Bundesliga): every frozen forecasts-*.json row.
 *
 * For each forecast it rebuilds the exact-score matrix from the recorded λ (and ρ), checks the rebuild against the
 * probabilities that forecast actually recorded, draws the seeded world set (lib/sports/soccer/match-worlds.mjs)
 * and writes the convergence report: sampled vs exact for the standard single legs and same-game joints.
 *
 * Nothing here is a forecast of record and nothing is published. Every probability in the receipt is the exact
 * matrix value (basis ANALYTIC_MODEL); the sampled share is the sampler's check, not a number to show.
 *   → data/internal/research/soccer/match-worlds-shadow/latest.json
 *
 * Exit 0 on success; 2 on usage; 3 if any rebuild mismatched or any world set failed the convergence check
 * (after writing the receipt, so the refusal is visible rather than a quiet gap).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scoreMatrix } from "../../src/lib/sports/soccer/dixon-coles.mjs";
import { MATCH_WORLDS_VERSION, MATCH_WORLDS_DEFAULTS, buildMatchWorlds } from "../../src/lib/sports/soccer/match-worlds.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.join(APP, "..");
const argv = process.argv.slice(2);
const arg = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const DRY = argv.includes("--dry-run");
const nowIso = arg("--now") ?? new Date().toISOString();
const runs = Number(arg("--runs") ?? MATCH_WORLDS_DEFAULTS.runs);
if (!Number.isFinite(Date.parse(nowIso)) || !(Number.isInteger(runs) && runs > 0)) {
  console.error("usage: build-soccer-match-worlds-shadow.mjs [--now <ISO>] [--runs <int>] [--dry-run]");
  process.exit(2);
}

const EPL_LATEST = path.join(APP, "public", "data", "soccer", "epl", "forecasts", "latest.json");
const DC_ROOT = path.join(ROOT, "data", "internal", "research", "soccer");
const DC_LEAGUES = ["laliga", "serie-a", "bundesliga"];
const OUT = path.join(DC_ROOT, "match-worlds-shadow", "latest.json");
// λ are stored to 4 dp and ρ to 6 dp, so a faithful rebuild agrees with the recorded probabilities to ~1e-5.
const REBUILD_TOLERANCE = 5e-4;

const rel = (p) => path.relative(ROOT, p);
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const r6 = (v) => (v == null || !Number.isFinite(v) ? v : Math.round(v * 1e6) / 1e6);

function candidates() {
  const out = [], skipped = [];
  if (fs.existsSync(EPL_LATEST)) {
    const doc = readJson(EPL_LATEST);
    for (const row of doc.rows ?? []) {
      const base = { league: "epl", eventId: row.eventId, matchup: row.matchup, kickoffUtc: row.kickoffUtc, modelId: row.modelId, source: rel(EPL_LATEST), sourceGeneratedAt: doc.generatedAt ?? null };
      if (!row.lambdas || !row.probs) { skipped.push({ ...base, reason: `no λ or probabilities recorded (state ${row.state ?? "unknown"}) — withheld, not filled in` }); continue; }
      out.push({ ...base, lambdas: row.lambdas, rho: 0, recorded: { home: row.probs.home, draw: row.probs.draw, away: row.probs.away, over25: row.over25, bttsYes: row.btts?.yes, homeOrDraw: row.doubleChance?.homeOrDraw } });
    }
  } else skipped.push({ league: "epl", source: rel(EPL_LATEST), reason: "file missing" });
  for (const league of DC_LEAGUES) {
    const dir = path.join(DC_ROOT, league, "shadow-dc-v2");
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^forecasts-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort() : [];
    for (const f of files) {
      for (const row of readJson(path.join(dir, f)).rows ?? []) {
        const base = { league, eventId: row.eventId, matchup: row.matchup, kickoffUtc: row.kickoffUtc, modelId: row.modelId, source: rel(path.join(dir, f)), forecastAt: row.forecastAt ?? null };
        if (!row.lambdas || !row.probs || !Number.isFinite(row.rho)) { skipped.push({ ...base, reason: "no λ/ρ/probabilities recorded" }); continue; }
        out.push({ ...base, lambdas: row.lambdas, rho: row.rho, recorded: { home: row.probs.home, draw: row.probs.draw, away: row.probs.away, over25: row.over25 } });
      }
    }
  }
  return { out, skipped };
}

const exactOf = (summary, label) => summary.singles.find((q) => q.legs[0] === label)?.probability;

function receiptFor(c) {
  const m = scoreMatrix(c.lambdas.home, c.lambdas.away, c.rho);
  const r = buildMatchWorlds({ eventId: c.eventId, modelId: c.modelId, lambdas: c.lambdas, rho: c.rho, grid: m.grid, runs });
  const rebuilt = {
    home: m.oneXTwo.home, draw: m.oneXTwo.draw, away: m.oneXTwo.away, over25: m.over25,
    bttsYes: exactOf(r.summary, "btts:yes"), homeOrDraw: exactOf(r.summary, "doubleChance:homeOrDraw"),
  };
  const diffs = Object.entries(c.recorded).filter(([, v]) => Number.isFinite(v)).map(([k, v]) => [k, Math.abs(rebuilt[k] - v)]);
  const maxRebuildDiff = Math.max(...diffs.map(([, d]) => d));
  const rebuildOk = maxRebuildDiff <= REBUILD_TOLERANCE;
  const conv = r.summary.convergence;
  const shape = (q) => ({ legs: q.legs, probability: r6(q.probability), basis: q.basis, sampled: r6(q.sampled.p), z: r6(q.convergence.z), mcStdError: r6(q.convergence.mcStdError), requiredRuns: q.convergence.requiredRuns });
  return {
    league: c.league, eventId: c.eventId, matchup: c.matchup, kickoffUtc: c.kickoffUtc, modelId: c.modelId,
    source: c.source, ...(c.forecastAt ? { forecastAt: c.forecastAt } : {}),
    lambdas: c.lambdas, rho: c.rho,
    rebuild: { ok: rebuildOk, checked: diffs.map(([k]) => k), maxAbsDiff: r6(maxRebuildDiff), tolerance: REBUILD_TOLERANCE },
    worldSetId: r.worldSetId, seed: r.seed, runs: r.runs,
    sampledMeanGoals: { home: r6(r.summary.sampledMeanGoals.home), away: r6(r.summary.sampledMeanGoals.away) },
    exactMeanGoals: { home: r6(m.expectedGoals.home), away: r6(m.expectedGoals.away) },
    convergence: { ...conv, maxAbsDiff: r6(conv.maxAbsDiff), maxAbsZ: r6(conv.maxAbsZ) },
    joints: r.summary.joints.map(shape),
    status: !rebuildOk ? "REBUILD_MISMATCH" : conv.withinNoise ? "CONVERGED" : "CONVERGENCE_FAILED",
  };
}

const { out, skipped } = candidates();
const matches = out.map(receiptFor);
const byStatus = matches.reduce((a, m) => ((a[m.status] = (a[m.status] ?? 0) + 1), a), {});
const doc = {
  schemaVersion: 1,
  artifact: "soccer-match-worlds-shadow",
  dataClass: "RESEARCH_SHADOW",
  public: false,
  generatedAt: new Date(Date.parse(nowIso)).toISOString(),
  version: MATCH_WORLDS_VERSION,
  rule: "Every probability is the exact score-matrix value (basis ANALYTIC_MODEL). Sampled shares are the sampler's convergence check only and are never published. Worlds exist for joint/player products (SW-3, P-2).",
  defaults: { ...MATCH_WORLDS_DEFAULTS },
  counts: { matches: matches.length, skipped: skipped.length, byStatus, byLeague: matches.reduce((a, m) => ((a[m.league] = (a[m.league] ?? 0) + 1), a), {}) },
  matches,
  skipped,
};

const bad = matches.filter((m) => m.status !== "CONVERGED");
console.log(`match worlds: ${matches.length} world sets (${JSON.stringify(byStatus)}), ${skipped.length} skipped, runs ${runs}`);
for (const m of bad) console.error(`  ${m.status}: ${m.league} ${m.eventId} (rebuild Δ ${m.rebuild.maxAbsDiff}, max |z| ${m.convergence.maxAbsZ})`);
if (!DRY) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const tmp = `${OUT}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(doc, null, 1) + "\n");
  fs.renameSync(tmp, OUT);
  console.log(`wrote ${rel(OUT)}`);
}
process.exit(bad.length ? 3 : 0);
