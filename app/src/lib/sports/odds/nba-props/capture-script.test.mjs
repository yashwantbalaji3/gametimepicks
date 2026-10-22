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
// Launched through tsx exactly as the workflow runs it (`npx tsx scripts/nba/capture-nba-props-odds.mjs`): the script
// imports TypeScript (identity-contract.ts), which plain `node` on the CI's Node 20 cannot load. The environment is
// still stripped to PATH + HOME, so no ODDS_API_KEY can ever reach the child.
const run = (...args) => spawnSync("npx", ["tsx", SCRIPT, ...args], { cwd: APP, encoding: "utf8", env: { PATH: process.env.PATH, HOME: process.env.HOME } });
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

/* ── STORAGE (founder decision, 2026-10-22): no raw or reconstructable sportsbook price is committed ────────────── */
test("STORAGE: a paid run needs a private directory outside every repository, checked before the key and before any call", () => {
  const src = strip(fs.readFileSync(SCRIPT, "utf8"));
  const check = src.indexOf("resolvePrivateDataDir(");
  assert.ok(check > 0, "the script resolves the private directory");
  assert.ok(check < src.indexOf("ODDS_API_KEY"), "before the key is read");
  assert.ok(check < src.indexOf("runNbaPropCapture("), "before the capture (the only network path) runs");
  assert.match(src, /if \(has\("--apply"\) && !priv\.ok\) refuse\(2/, "a paid run without one is refused");
  assert.match(src, /path\.join\(priv\.dir, "odds", "nba", "props"/, "price records are written under the private directory");
  assert.doesNotMatch(src, /data\/internal\/research\/odds\/nba\/props/, "never under the repository");
});

test("STORAGE: the workflow commits the credit ledger only, never a price record", () => {
  const wf = fs.readFileSync(path.join(APP, "..", ".github/workflows/nba-props-pilot.yml"), "utf8");
  const adds = [...wf.matchAll(/git add ([^\n]+)/g)].map((m) => m[1].trim());
  assert.deepEqual(adds, ['"$L"']);
  assert.match(wf, /L=data\/internal\/research\/odds\/nba\/authorization-ledger\.json/);
  assert.doesNotMatch(wf, /git add data\/internal\/research\/odds\/nba\/(\s|$)/, "no directory-wide add");
});

test("STORAGE: the committed NBA credit ledger carries credits and status only — no line, no price", () => {
  const f = path.join(APP, "..", "data/internal/research/odds/nba/authorization-ledger.json");
  if (!fs.existsSync(f)) return;
  const doc = JSON.parse(fs.readFileSync(f, "utf8"));
  const PRICE_KEY = /^(line|point|price|prices|overAmerican|underAmerican|odds|americanOdds|outcomes|bookmakers)$/i;
  const walk = (v, at) => {
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${at}[${i}]`));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { assert.ok(!PRICE_KEY.test(k), `${at}.${k} looks like a price field`); walk(x, `${at}.${k}`); }
  };
  walk(doc, "ledger");
});
