/**
 * PRE-LAUNCH HARDENING (Plan 0002) — locks the safety rails added for the July-10 soft launch:
 *   • the Odds-API credit-floor guard is fail-closed + env-overridable, and check_odds_key enforces it,
 *   • the refresh is money-idempotent (md5-guarded) so re-running can't drift canonical money,
 *   • the derived status generator is byte-idempotent for a fixed clock (only generatedAt varies live),
 *   • OWNER_ACTIONS.md documents the three secrets without ever printing a value.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const repo = path.join(process.cwd(), "..");
const readRepo = (rel) => fs.readFileSync(path.join(repo, rel), "utf8");

test("credit-floor guard: refresh checks credits BEFORE any paid fetch, fail-closed + env-overridable", () => {
  const refresh = readRepo("scripts/refresh_daily_products.sh");
  assert.match(refresh, /ODDS_CREDIT_FLOOR:-5000/, "default floor 5,000, overridable via ODDS_CREDIT_FLOOR");
  assert.match(refresh, /check_odds_key --min-credits/, "invokes the credit check");
  assert.match(refresh, /refusing the paid refresh/i, "aborts loudly when below floor");
  // Ordering: the guard must precede the actual fetch execution. `build_odds_only_projections.py` also
  // appears in the top-of-file PLAN printout, so anchor on the real execution section marker instead.
  const guardIdx = refresh.indexOf("credit-floor guard");
  const execIdx = refresh.indexOf('say "World Cup');
  assert.ok(guardIdx > 0 && execIdx > 0 && guardIdx < execIdx, "guard runs before the WC fetch execution");
});

test("check_odds_key enforces the floor fail-closed (exit 3) and is advisory when credits are unknown", () => {
  const py = readRepo("pipeline/check_odds_key.py");
  assert.match(py, /--min-credits/, "has the floor flag");
  assert.match(py, /--emit-remaining/, "has the machine-readable emit flag");
  assert.match(py, /return 3/, "exits 3 (fail-closed) below floor");
  assert.match(py, /not enforced \(advisory\)/, "advisory (does not block) when remaining is unknown");
  assert.match(py, /FREE \/v4\/sports|\/v4\/sports\//, "uses the FREE endpoint (no credits burned to check)");
});

test("refresh is MONEY-idempotent: it md5-guards canonical money (re-running never drifts the bankroll)", () => {
  const refresh = readRepo("scripts/refresh_daily_products.sh");
  assert.match(refresh, /BEFORE=\$\(cat "\$\{MONEY_FILES\[@\]\}" \| md5\)/, "snapshots money md5 before");
  assert.match(refresh, /CANONICAL MONEY CHANGED/, "hard-fails if money moved during a display refresh");
  // The known cosmetic delta across runs is generatedAt — documented, not masked.
  assert.match(refresh, /never move money|display-only|md5-guard/i, "money guard is explicit");
});

test("derived status generator is byte-idempotent for a fixed clock (only generatedAt varies live)", () => {
  const NOW = "2026-07-06T18:00:00Z";
  // TEST ISOLATION: write to a temp file via --out so this NEVER mutates the committed
  // public/data/admin/status.json (which previously left the working tree dirty on every suite run).
  const out = path.join(os.tmpdir(), `gtp-admin-status-${process.pid}-${NOW.replace(/[^0-9]/g, "")}.json`);
  const gen = () => { execFileSync("npx", ["tsx", "scripts/build-admin-status.mjs", "--now", NOW, "--out", out], { cwd: process.cwd(), stdio: "ignore" }); return fs.readFileSync(out, "utf8"); };
  try {
    const a = gen(); const b = gen();
    assert.equal(a, b, "same clock → byte-identical status.json (deterministic, no drift)");
  } finally {
    fs.rmSync(out, { force: true });
  }
});

test("OWNER_ACTIONS.md documents all three secrets and never prints a value", () => {
  const doc = readRepo("docs/OWNER_ACTIONS.md");
  for (const sec of ["VERCEL_DEPLOY_HOOK_URL", "ODDS_API_KEY", "API_FOOTBALL_KEY"]) assert.match(doc, new RegExp(sec), `documents ${sec}`);
  assert.match(doc, /nightly-settle|daily-lifecycle|daily-rebuild/, "names the workflows that depend on the secrets");
  // No secret VALUE patterns (long hex/base64-ish tokens) leaked into the doc.
  assert.ok(!/[A-Za-z0-9_-]{32,}/.test(doc.replace(/https?:\/\/\S+/g, "")), "no secret-length token appears in the doc");
});
