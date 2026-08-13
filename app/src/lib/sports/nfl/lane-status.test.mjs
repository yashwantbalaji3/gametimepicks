/**
 * Release G guards (Program 171): the NFL lane status is DERIVED (never typed), the workflow is
 * state-safe and single-writer, and the internal lane artifact stays out of the public export.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const ROOT = path.join(APP, "..");
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const lane = read(path.join(APP, "public/data/admin/nfl-lane.json"));

test("the lane artifact is internal, stamped, and derived from committed receipts", () => {
  assert.equal(lane.dataClass, "INTERNAL_ADMIN");
  assert.equal(lane.program, "P171");
  assert.ok(Number.isFinite(Date.parse(lane.generatedAt)));
  // every headline field traces to a real artifact on disk
  assert.equal(lane.markets.state, "CAPTURED");
  assert.equal(lane.markets.events, read(path.join(APP, "public/data/nfl/markets/latest.json")).eventCount);
  const ledger = read(path.join(ROOT, "data/internal/research/odds/nfl/p171-ledger.json"));
  assert.equal(lane.credits.programSpend, ledger.cumulativeCredits, "spend is read from the ledger, never typed");
  assert.equal(lane.credits.ceiling, 3000);
  assert.equal(lane.credits.remainingProgram, 3000 - ledger.cumulativeCredits);
  assert.ok(lane.credits.openingBalance?.providerRequestsRemaining > 0, "provider-verified opening balance is recorded");
});

test("missing evidence renders UNKNOWN, never green and never zero", () => {
  const src = fs.readFileSync(path.join(APP, "scripts/nfl/build-nfl-lane-status.mjs"), "utf8");
  assert.match(src, /const UNKNOWN = \(why\) => \(\{ state: "UNKNOWN", detail: why \}\)/, "a single UNKNOWN helper covers every absent-artifact path");
  for (const field of ["markets", "credits", "vault"]) {
    assert.ok(new RegExp(`${field}[\\s\\S]{0,400}UNKNOWN\\(`).test(src), `${field} falls back to UNKNOWN when its artifact is absent`);
  }
  assert.doesNotMatch(src, /state: "HEALTHY"|state: "PROVEN"/, "the generator never hands out a green state of its own invention");
});

test("blockers are typed and reality-gated, including the ones nobody can code away", () => {
  const byId = Object.fromEntries(lane.blockers.map((b) => [b.id, b]));
  assert.equal(byId["preseason-participation"].state, "REALITY_GATED");
  assert.equal(byId["player-markets-absent"].state, "NO_MARKET");
  assert.match(byId["player-markets-absent"].detail, /not a retry target/);
  assert.equal(byId["first-settlement"].state, "NOT_YET_OBSERVABLE");
  assert.match(byId["first-settlement"].detail, /first settleable event/);
});

test("cadence stays UNPROVEN — a workflow file is not a receipt", () => {
  assert.equal(lane.cadence.state, "UNPROVEN");
  assert.match(lane.cadence.detail, /workflow file is not cadence proof/);
});

test("the event-window workflow is single-writer, fail-loud, and window-gated", () => {
  const wf = fs.readFileSync(path.join(ROOT, ".github/workflows/nfl-event-window.yml"), "utf8");
  assert.match(wf, /group: gtp-generated-artifacts/, "shares the one artifact-writer group");
  assert.match(wf, /cancel-in-progress: false/);
  const runBlocks = wf.split("run: |").slice(1);
  assert.ok(runBlocks.length >= 4);
  for (const b of runBlocks) assert.match(b, /set -euo pipefail/, "every run block fails loud (the P066 crash-printing-success lesson)");
  assert.match(wf, /NO_EVENTS/, "an empty window is a clean skip, not an outage");
  assert.match(wf, /steps\.window\.outputs\.events != '0'/, "every downstream step is gated on real pre-start events");
  assert.match(wf, /--receipt docs\/receipts\/ODDS_AUTHORIZATION_P171\.md/, "the paid step runs only under the committed receipt");
  assert.match(wf, /skip_odds/, "the chain can run for zero credits against the last capture");
  // the odds step is the ONLY credit-bearing step
  const oddsSteps = (wf.match(/ODDS_API_KEY: \$\{\{ secrets\.ODDS_API_KEY \}\}/g) ?? []).length;
  assert.equal(oddsSteps, 1, "exactly one step may see the key");
});

test("PUBLIC BOUNDARY · the internal lane artifact never reaches the public export", () => {
  // The sweep is deny-by-default and keeps only what the BUILD references. The lane artifact is
  // read by /launch, which is itself pruned — so the file must not survive in out/.
  const outData = path.join(APP, "out/data");
  if (!fs.existsSync(outData)) return; // no build in this run — the built-HTML guard covers CI
  assert.ok(!fs.existsSync(path.join(outData, "admin/nfl-lane.json")), "nfl-lane.json must not ship publicly");
  const nflHtml = path.join(APP, "out/nfl/index.html");
  if (fs.existsSync(nflHtml)) {
    const html = fs.readFileSync(nflHtml, "utf8");
    for (const marker of ["INTERNAL_ADMIN", "nfl-lane", "p171-ledger", "PRIVATE_RESEARCH", "role-shares-v1", "player-props-v1", "anytime-td-v1"]) {
      assert.ok(!html.includes(marker), `the public NFL page must not carry "${marker}"`);
    }
  }
});
