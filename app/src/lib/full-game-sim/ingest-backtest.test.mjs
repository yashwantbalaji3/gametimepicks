/**
 * MLB DAILY INGEST + INDEPENDENT INPUTS + ROLLING BACKTEST — internal, honest, money-safe.
 *
 * Pins the whole evidence layer: the team-market-line snapshot is APPEND-ONLY (never clobbers a
 * committed historical snapshot); the model-inputs (pitcher strength / park factors / full-game roll-up)
 * never fabricate a missing input and never claim usableForIndependentModel; the rolling backtest is
 * leakage-safe + conservative (never a public/founder rollout on a tiny sample); nothing is web-served;
 * the new scripts never write money; no public code imports the internal layer; money md5 is unchanged.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { ingestTeamMarketLines, buildTeamMarketLinesSnapshot } from "../../../scripts/ingest-mlb-team-market-lines.mjs";

const app = process.cwd();
const repo = path.join(app, "..");
const readJsonIf = (rel) => { const p = path.join(repo, rel); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null; };

test("1 · team-market-line snapshot is internal + deterministic + never faked", () => {
  const j = readJsonIf("data/internal/mlb/team-market-lines/2026-07-09.json");
  if (!j) return;
  assert.equal(j.public, false);
  assert.equal(j.activationStatus, "internal_only");
  assert.equal(j.officialMoneyRecordAffected, false);
  assert.equal(j.asOf, j.date, "deterministic marker (no wall-clock)");
  assert.ok(!("generatedAt" in j), "no wall-clock timestamp (idempotent)");
  assert.equal(j.status, "available");
  assert.ok(j.lines.length > 0);
  for (const l of j.lines) { if (l.moneyline) assert.ok(l.moneyline.homeWinProb >= 0 && l.moneyline.homeWinProb <= 1); }
});

test("2 · team-market ingest is APPEND-ONLY — an existing snapshot is never clobbered without --force", () => {
  // buildTeamMarketLinesSnapshot is pure re: money and deterministic (asOf === date).
  const snap = buildTeamMarketLinesSnapshot("2026-07-09");
  assert.equal(snap.asOf, snap.date);
  assert.equal(snap.public, false);
  // write:true, force:false against the committed snapshot must SKIP (no overwrite), never write.
  const r = ingestTeamMarketLines({ date: "2026-07-09", write: true, force: false });
  assert.equal(r.wrote, false, "no-overwrite guard: did not write");
  assert.equal(r.skippedExisting, true, "no-overwrite guard: skipped the existing committed snapshot");
});

test("3 · pitcher-strength is honest — neutral ratings, never invented, not usable for an independent model", () => {
  const j = readJsonIf("data/internal/mlb/model-inputs/pitcher-strength/2026-07-09.json");
  if (!j) return;
  assert.equal(j.public, false);
  assert.equal(j.usableForIndependentModel, false, "a probable name + neutral rating is not a model");
  for (const p of j.pitchers) {
    assert.equal(p.normalizedRating, 0, "neutral — no strength is invented");
    assert.equal(p.source, "neutral_default");
    assert.ok(typeof p.missingReason === "string" && p.missingReason.length > 0, "documents why it is neutral");
  }
});

test("4 · park factors are documented, bounded, and NOT claimed predictive", () => {
  const j = readJsonIf("data/internal/mlb/model-inputs/park-factors/static.json");
  if (!j) return;
  assert.equal(j.public, false);
  assert.equal(j.independentlyPredictive, false, "approximate static factors are not claimed predictive");
  assert.ok(j.maxTotalNudgePct > 0 && j.maxTotalNudgePct <= 0.05, "the applied effect is bounded small");
  for (const f of j.factors) {
    assert.ok(f.runFactor >= 0.8 && f.runFactor <= 1.25, `${f.team} run factor in a sane range`);
    assert.ok(["established_extreme", "moderate", "approximate", "neutral_default"].includes(f.confidence), "per-entry confidence");
  }
});

test("5 · full-game roll-up is leakage-safe + honest — completeness < usable threshold, missing stays missing", () => {
  const j = readJsonIf("data/internal/mlb/model-inputs/full-game/2026-07-09.json");
  if (!j) return;
  assert.equal(j.public, false);
  assert.equal(j.coverageSummary.usableForIndependentModel, false);
  assert.match(j.leakageNote, /strictly earlier|strictly-earlier/i, "leakage invariant documented");
  for (const g of j.games) {
    assert.equal(g.coverage.usableForIndependentModel, false, "never usable without pitcher strength");
    assert.ok(g.coverage.modelInputCompletenessScore < 0.7, "honest: thin coverage");
    assert.match(g.inputs.teamRunRates.source, /before_date|unavailable/, "run rates are strictly-earlier or absent");
    assert.ok(g.coverage.missing.some((m) => /pitcher strength/i.test(m)), "pitcher strength marked missing");
  }
});

test("6 · rolling backtest is leakage-safe + conservative (never a public/founder rollout on a tiny sample)", () => {
  const j = readJsonIf("data/internal/mlb/full-game-sim-backtests/rolling-latest.json");
  if (!j) return;
  assert.equal(j.public, false);
  assert.equal(j.officialMoneyRecordAffected, false);
  assert.match(j.leakageNote, /no learned parameters|strictly earlier|strictly-earlier/i, "leakage invariant documented");
  assert.ok(["insufficient_sample", "tracks_market", "underperforms_market", "candidate_for_shadow_review", "candidate_for_founder_review"].includes(j.verdict), `conservative verdict, got ${j.verdict}`);
  assert.notEqual(j.verdict, "public_ready");
  assert.notEqual(j.verdict, "candidate_for_public_rollout");
  // Market baseline + sim + shadow-adjusted are all reported (three-way honesty).
  assert.ok(j.metrics.moneyline.market && j.metrics.moneyline.sim && j.metrics.moneyline.shadowAdjusted, "three-way moneyline comparison present");
  if (j.metrics.gamesGraded < 50 || j.metrics.dates < 5) assert.ok(j.sampleWarning, "tiny sample is flagged");
});

test("7 · founder-review previews carry the fullGameSimUsed:false honesty marker + NO driving signal", () => {
  for (const product of ["bank-builder", "moonshot"]) {
    const j = readJsonIf(`data/internal/product-previews/${product}/2026-07-09.json`);
    if (!j) continue;
    // The honesty marker fullGameSimUsed:false is allowed/expected; any DRIVING signal is banned.
    if ("fullGameSimUsed" in j) assert.equal(j.fullGameSimUsed, false, `${product}: fullGameSimUsed must be false`);
    assert.doesNotMatch(JSON.stringify(j), /"fullGameSim(Signal|Score|Driven|Probability|Edge|Lean)"\s*:/i, `${product}: no fullGameSim driving signal`);
    assert.equal(j.active, false, `${product} preview not active`);
    assert.equal(j.exposure, 0);
  }
});

test("8 · no PUBLIC code imports the internal sim / inputs / backtest layer", () => {
  for (const dir of ["src/app", "src/components"]) {
    const root = path.join(app, dir);
    if (!fs.existsSync(root)) continue;
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(d, e.name);
      if (e.isDirectory()) return walk(p);
      return /\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : [];
    });
    for (const f of walk(root)) {
      const s = fs.readFileSync(f, "utf8");
      assert.doesNotMatch(s, /from\s+["'][^"']*full-game-sim\/mlb/, `${path.relative(app, f)} must not import the internal engine`);
      assert.doesNotMatch(s, /from\s+["'][^"']*(team-market-line|model-inputs\/|park-factors|full-game-sim-backtests)/, `${path.relative(app, f)} must not import internal inputs/backtests`);
    }
  }
});

test("9 · the new internal artifacts are NOT web-served", () => {
  for (const d of ["team-market-lines", "model-inputs", "full-game-sim", "full-game-sim-backtests"]) {
    assert.ok(!fs.existsSync(path.join(app, "public/data/mlb", d)), `${d} not under app/public`);
  }
});

test("10 · the new scripts never write a money artifact and never write under public/", () => {
  for (const s of ["ingest-mlb-team-market-lines.mjs", "ingest-mlb-team-market-lines-daily.mjs", "ingest-mlb-independent-inputs.mjs", "build-mlb-model-inputs.mjs", "build-mlb-full-game-sim-artifacts.mjs", "backtest-mlb-full-game-sim-rolling.mjs"]) {
    const src = fs.readFileSync(path.join(app, "scripts", s), "utf8");
    assert.doesNotMatch(src, /(readFileSync|writeFileSync|path\.join)\([^)]*(mr-dub|portfolio\.json|bankroll|daily-portfolio)/, `${s}: no fs op on a money artifact`);
    assert.doesNotMatch(src, /writeFileSync[^\n]*public\//, `${s}: never writes under public/`);
  }
});

test("11 · money md5 unchanged — the whole ingest/backtest layer is money-independent", () => {
  const md5 = crypto.createHash("md5").update(fs.readFileSync(path.join(app, "public/data/mr-dub/portfolio.json"))).digest("hex");
  assert.equal(md5, "affe6b21071f2b3be96bb2774eb347c3");
});
