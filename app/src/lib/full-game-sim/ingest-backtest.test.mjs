/**
 * MLB INGEST + INDEPENDENT INPUTS + ROLLING BACKTEST (2026-07-09) — internal, honest, money-safe.
 *
 * Pins: the team-market-line snapshot + model-inputs + rolling-backtest artifacts are internal
 * (public:false, activationStatus internal_only, not web-served), honest (independent inputs never
 * fabricated; usableForIndependentModel false), leakage-safe + conservative (verdict never a public/
 * founder rollout on a tiny sample), the new scripts never write money, and money md5 is unchanged.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

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

test("2 · independent-inputs artifact is honest — missing stays missing, not usable yet", () => {
  const j = readJsonIf("data/internal/mlb/model-inputs/2026-07-09.json");
  if (!j) return;
  assert.equal(j.public, false);
  assert.equal(j.coverageSummary.usableForIndependentModel, false, "a probable-pitcher name + thin run rate is not an independent model");
  for (const g of j.games) {
    assert.equal(g.coverage.usableForIndependentModel, false);
    // Missing inputs are marked unavailable, never invented.
    assert.equal(g.inputs.parkFactor.source, "unavailable");
    assert.equal(g.inputs.weather.source, "unavailable");
    assert.ok(["statsapi_probable", "unavailable"].includes(g.inputs.probablePitchers.source));
    assert.ok(["computed_from_committed_linescores", "unavailable"].includes(g.inputs.teamRunRates.source));
    assert.ok(g.coverage.missing.includes("park factor"));
  }
});

test("3 · rolling backtest is leakage-safe + conservative (never a public/founder rollout on a tiny sample)", () => {
  const dir = path.join(repo, "data/internal/mlb/rolling-backtests");
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    assert.equal(j.public, false);
    assert.equal(j.officialMoneyRecordAffected, false);
    assert.ok(/no learned parameters|strictly-earlier/i.test(j.leakageNote), "leakage invariant documented");
    assert.ok(["insufficient_sample", "market_tracking_only", "experimental_improvement_unproven", "candidate_for_longer_shadow"].includes(j.verdict), `conservative verdict, got ${j.verdict}`);
    assert.notEqual(j.verdict, "candidate_for_public_rollout");
    if (j.metrics.gamesGraded < 50) assert.ok(j.sampleWarning, "tiny sample is flagged");
  }
});

test("4 · the new internal artifacts are NOT web-served", () => {
  for (const d of ["team-market-lines", "model-inputs", "rolling-backtests"]) {
    assert.ok(!fs.existsSync(path.join(app, "public/data/mlb", d)), `${d} not under app/public`);
  }
});

test("5 · the new scripts never write a money artifact", () => {
  for (const s of ["ingest-mlb-team-market-lines.mjs", "ingest-mlb-independent-inputs.mjs", "backtest-mlb-full-game-sim-rolling.mjs"]) {
    const src = fs.readFileSync(path.join(app, "scripts", s), "utf8");
    assert.doesNotMatch(src, /(readFileSync|writeFileSync|path\.join)\([^)]*(mr-dub|portfolio\.json|bankroll|daily-portfolio)/, `${s}: no fs op on a money artifact`);
    assert.doesNotMatch(src, /writeFileSync[^\n]*public\//, `${s}: never writes under public/`);
  }
});

test("6 · money md5 unchanged — the whole ingest/backtest layer is money-independent", () => {
  const md5 = crypto.createHash("md5").update(fs.readFileSync(path.join(app, "public/data/mr-dub/portfolio.json"))).digest("hex");
  assert.equal(md5, "affe6b21071f2b3be96bb2774eb347c3");
});
