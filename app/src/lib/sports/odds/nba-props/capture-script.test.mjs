/**
 * The NBA prop capture script is a dry-run planner that refuses every paid path. Run from app/:
 *   npx tsx --test src/lib/sports/odds/nba-props/capture-script.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const APP = process.cwd();
const SCRIPT = path.join(APP, "scripts/nba/capture-nba-props-odds.mjs");
const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd: APP, encoding: "utf8", env: { PATH: process.env.PATH } });
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("the script makes no HTTP call itself and names no provider host; the key is read only after the receipt, with --apply", () => {
  const src = strip(fs.readFileSync(SCRIPT, "utf8"));
  assert.doesNotMatch(src, /\bfetch\s*\(|node:https?|axios|undici|XMLHttpRequest|api\.the-odds-api\.com|https?:\/\//);
  const keyAt = src.indexOf("ODDS_API_KEY");
  assert.ok(keyAt > src.indexOf("parseNbaPropsReceipt(receiptText"), "the key is read after the receipt parses");
  assert.match(src.slice(keyAt - 80, keyAt), /has\("--apply"\)/, "and only when --apply is given");
});

test("dry run: prints a points-first plan with zero network calls and a documented worst case", () => {
  const r = run("--now", "2026-10-21T12:00:00Z", "--lookahead-hours", "36");
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.mode, "DRY_RUN");
  assert.equal(out.networkCalls, 0);
  assert.deepEqual(out.plan.markets, ["player_points"]);
  assert.equal(out.plan.regionUnits, 1);
  assert.equal(out.plan.worstCaseCredits, out.events.length, "one credit per event for points across the eligible books");
  assert.match(out.plan.costingSource, /the-odds-api\.com\/liveapi\/guides\/v4/);
});

test("--authorized refuses without a receipt, with a non-receipt file, and with every existing odds receipt", () => {
  const a = run("--now", "2026-10-21T12:00:00Z", "--authorized");
  assert.equal(a.status, 2);
  assert.match(a.stderr, /no NBA player-prop receipt exists/);
  const b = run("--now", "2026-10-21T12:00:00Z", "--authorized", "--receipt", "README.md");
  assert.equal(b.status, 2);
  assert.match(b.stderr, /not a committed file under docs\/receipts/);
  for (const f of fs.readdirSync(path.join(APP, "..", "docs/receipts")).filter((x) => /ODDS_AUTHORIZATION/.test(x) && !/NBA/i.test(x))) {
    const c = run("--now", "2026-10-21T12:00:00Z", "--authorized", "--receipt", `docs/receipts/${f}`);
    assert.equal(c.status, 2, f);
    assert.match(c.stderr, /does not authorize NBA player props/);
  }
  // An NBA receipt, once committed, is DATED: after its date it refuses; and without --apply it never spends.
  for (const f of fs.readdirSync(path.join(APP, "..", "docs/receipts")).filter((x) => /ODDS_AUTHORIZATION/.test(x) && /NBA/i.test(x))) {
    const late = run("--now", "2030-01-01T00:00:00Z", "--authorized", "--receipt", `docs/receipts/${f}`);
    assert.equal(late.status, 2, `${f}: refused after its date`);
    const dry = run("--now", "2026-10-21T12:00:00Z", "--authorized", "--receipt", `docs/receipts/${f}`);
    assert.ok([0, 2].includes(dry.status), `${f}: dry run or refused, never a spend (${dry.stderr})`);
    if (dry.status === 0) assert.match(dry.stdout, /"state": "(DRY_RUN|NOTHING_TO_PRICE)"/);
  }
});
