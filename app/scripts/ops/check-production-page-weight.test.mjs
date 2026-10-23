/**
 * The Production page-weight check's pure parts (the network half is exercised by running the script post-deploy).
 * Run (from app/): npx tsx --test scripts/ops/check-production-page-weight.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { urlPathOf, familyPaths, verdict, exitCodeOf, OPS_USER_AGENT, stripDpl } from "./check-production-page-weight.mjs";
import { BUDGET_KB, FAMILY_BUDGET_KB } from "../../src/lib/uiux/page-weight-budgets.mjs";

test("budget keys map to the served paths", () => {
  assert.equal(urlPathOf("index.html"), "/");
  assert.equal(urlPathOf("nba/index.html"), "/nba/");
  assert.equal(urlPathOf("nba/projections/index.html"), "/nba/projections/");
  for (const rel of Object.keys(BUDGET_KB)) assert.match(urlPathOf(rel), /^\/([a-z0-9-]+\/)*$/, rel);
});

test("family pages are the ones the parent links to (deduped, sorted, capped)", () => {
  const html = '<a href="/nba/simulation/401909095/">x</a><a href="/nba/simulation/401909095/">x</a><a href="/nba/simulation/401909096/">y</a><a href="/nba/projections/2026-10-23/">z</a><a href="/nba/simulation/401909096/#official">w</a>';
  assert.deepEqual(familyPaths("nba/simulation", html), ["/nba/simulation/401909095/", "/nba/simulation/401909096/"]);
  assert.deepEqual(familyPaths("nba/projections", html), ["/nba/projections/2026-10-23/"]);
  assert.deepEqual(familyPaths("nba/simulation", html, 1), ["/nba/simulation/401909095/"]);
  assert.deepEqual(familyPaths("nba/simulation", null), []);
  assert.ok(Object.keys(FAMILY_BUDGET_KB).length > 0);
});

test("KiB exactly as page-weight.test.mjs (/1024); an unreachable page is never within budget", () => {
  assert.equal(verdict({ path: "/nba/", bytes: 259073, budgetKB: 250 }).state, "OVER", "Production /nba on 2026-10-23 (253.0 KiB)");
  assert.equal(verdict({ path: "/nba/", bytes: 259073, budgetKB: 250 }).kib, 253);
  assert.equal(verdict({ path: "/nba/", bytes: 250 * 1024, budgetKB: 250 }).state, "OK");
  assert.equal(verdict({ path: "/nba/", bytes: undefined, budgetKB: 250, error: "HTTP 503" }).state, "UNREACHABLE");
});

test("a bot challenge is UNKNOWN and never a pass; exit codes: 0 all OK, 1 any breach, 2 could-not-tell", () => {
  const ch = verdict({ path: "/nba/", bytes: 1, budgetKB: 250, challenged: true });
  assert.equal(ch.state, "UNKNOWN");
  const ok = verdict({ path: "/", bytes: 1024, budgetKB: 250 }), over = verdict({ path: "/nba/", bytes: 259073, budgetKB: 250 });
  assert.equal(exitCodeOf([ok]), 0);
  assert.equal(exitCodeOf([ok, over, ch]), 1);
  assert.equal(exitCodeOf([ok, ch]), 2);
  assert.equal(exitCodeOf([]), 2, "measuring nothing is not a pass");
  assert.match(OPS_USER_AGENT, /^gametimepicks-ops-/);
});

test("OVER is judged on the RAW served bytes; the dpl-stripped size is printed beside it (release owner 2026-10-23)", () => {
  const html = '<link href="/_next/static/css/a.css?dpl=dpl_AbC123"/><script src="/_next/static/chunks/x.js?dpl=dpl_AbC123&v=2"></script><a href="/nba/?x=1&dpl=dpl_Q9">';
  assert.equal(stripDpl(html), '<link href="/_next/static/css/a.css"/><script src="/_next/static/chunks/x.js?v=2"></script><a href="/nba/?x=1">');
  // Production /nba 2026-10-23: 257,608 B raw, 2,795 B of dpl suffixes → over raw, under stripped
  const f = verdict({ path: "/nba/", bytes: 257608, strippedBytes: 257608 - 2795, budgetKB: 250 });
  assert.equal(f.state, "OVER");
  assert.equal(f.kib, 251.6);
  assert.equal(f.strippedKib, 248.8);
});
