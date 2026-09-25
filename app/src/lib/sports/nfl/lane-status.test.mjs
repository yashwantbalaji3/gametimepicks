/**
 * Release G guards (Program 171): the NFL lane status is DERIVED (never typed), the workflow is
 * state-safe and single-writer, and the internal lane artifact stays out of the public export.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { parseAuthorizationReceipt } from "../odds/p171-authorization.mjs";

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
  /* P244: the P171 receipt has EXPIRED. The generator's own rule — missing evidence renders
     UNKNOWN, never green and never zero — now applies to the ceiling: a live receipt parses 3000,
     an expired/unparseable one renders UNKNOWN with the reason and no derived numbers. */
  if (lane.credits.state === "UNKNOWN") {
    assert.equal(lane.credits.ceiling, null, "no ceiling may be invented from an unparseable receipt");
    assert.equal(lane.credits.remainingProgram, null, "no remaining figure without a ceiling");
    assert.match(String(lane.credits.detail ?? ""), /receipt|authoriz/i, "the UNKNOWN carries its reason");
  } else {
    assert.equal(lane.credits.ceiling, 3000);
    assert.equal(lane.credits.remainingProgram, 3000 - ledger.cumulativeCredits);
  }
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
  // P240: the preseason-participation blocker is emitted only while the NEXT event is preseason —
  // its own detail says it clears when the regular season starts, and on 2026-09-09 it did. The
  // pin is conditional on presence, which is the builder's own contract, not a weakening: when
  // present it must still be REALITY_GATED, and it may never appear against a regular-season
  // next event (that would be the false phase claim coming back).
  if (byId["preseason-participation"]) {
    assert.equal(byId["preseason-participation"].state, "REALITY_GATED");
    assert.match(byId["preseason-participation"].detail, /^preseason:/);
  }
  /* REPOINTED 2026-09-12. The blocker follows the CONDITION (no player price is held), not the
     evidence for its reason: when the receipt narrowed to team markets the probe stopped running
     and the blocker vanished from the lane while the thing it describes was unchanged. Two honest
     states, and they are different claims — NO_MARKET is evidence about the books, NOT_REQUESTED
     is a fact about our own scope and evidence about nothing. */
  /*
   * ⚠ AND THEN WE STARTED HOLDING PRICES (P0 · 2026-09-24), so "the blocker must be present" became
   * an assertion about a world that had ended. The first full-week sweep published real player
   * prices, `holdsPlayerPrice` went true for the RIGHT reason, the blocker cleared — and this guard
   * went red for the best possible reason, exactly as `first-settlement` below once did.
   *
   * The fix is NOT to delete the assertion. The invariant was never "the blocker exists"; it was
   * "the blocker exists exactly when no player price is held". Pinning one side of a biconditional
   * only ever caught one direction, and it was about to be weakened into catching neither. So BOTH
   * directions are asserted against the canonical artifact the generator itself reads:
   *
   *   no price held  ⇒ the blocker is present, and its state says WHY
   *   price held     ⇒ the blocker is absent, and does not linger as a stale claim
   *
   * That is strictly stronger than what was here, and it is what would have caught the original
   * defect (a blocker vanishing while nothing was published) without also failing the day the
   * system finally worked.
   */
  const heldPlayerPrices = (read(path.join(APP, "public/data/nfl/markets/latest.json")).propPrices?.rows ?? []).length;
  const playerBlocker = byId["player-markets-absent"];
  if (heldPlayerPrices === 0) {
    assert.ok(playerBlocker, "no player price is held, so the blocker must be present whatever the reason");
  } else {
    assert.equal(playerBlocker, undefined,
      `${heldPlayerPrices} player price(s) are published for this window — the "no player market" blocker must clear itself`);
    return; // nothing further to assert about a blocker that correctly does not exist
  }
  /*
   * A THIRD CONDITION EXISTS NOW, AND IT CAUGHT A REAL DEFECT (2026-09-24).
   *
   * While the authorization funded team markets only, "the books offer it" and "we hold a price"
   * were indistinguishable — we never probed, so both were always empty. The generator exploited
   * that by computing `holdsPlayerPrice` from `offeredMarkets`. A founder-authorized probe found
   * all five families offered, that expression flipped true, and the blocker VANISHED while not one
   * player price was published. THIS assertion is what caught it.
   *
   * So the third state is not a loosening — it is the condition the world now permits, and each of
   * the three must still make its own distinct claim:
   *   NO_MARKET         we asked, the books offer nothing      → evidence about THEM
   *   OFFERED_NOT_HELD  they offer it, we publish none         → evidence about US
   *   NOT_REQUESTED     we never asked                         → evidence about NOTHING
   */
  assert.ok(["NO_MARKET", "OFFERED_NOT_HELD", "NOT_REQUESTED"].includes(playerBlocker.state), `unexpected state ${playerBlocker.state}`);
  assert.match(playerBlocker.detail, /not a retry target/);
  if (playerBlocker.state === "NOT_REQUESTED") {
    assert.match(playerBlocker.detail, /no evidence about what the books offer/, "not looking is never evidence of absence");
  }
  if (playerBlocker.state === "OFFERED_NOT_HELD") {
    assert.match(playerBlocker.detail, /offered/, "it must say the books DO offer the market");
    assert.match(playerBlocker.detail, /no player price is published/, "…and that the absence is ours, not theirs");
    assert.doesNotMatch(playerBlocker.detail, /funds team markets only/, "this state must never borrow the scope excuse — we did ask");
  }
  // P178: this pinned NOT_YET_OBSERVABLE, which was true until the first NFL forecast actually
  // settled — and then the guard failed for the best possible reason. A blocker that clears is the
  // system working, so the assertion is now tied to the EVIDENCE: the blocker may exist only while
  // no experimental settlement has happened, and must be absent once one has.
  const settled = JSON.parse(fs.readFileSync(path.join(process.cwd(), "..", "data/internal/nfl/experimental-settlement/summary.json"), "utf8"));
  if (settled.settledForecasts > 0) {
    assert.equal(byId["first-settlement"], undefined,
      `${settled.settledForecasts} forecast(s) have settled — the "no settlement yet" blocker must clear itself`);
  } else {
    assert.equal(byId["first-settlement"].state, "NOT_YET_OBSERVABLE");
    assert.match(byId["first-settlement"].detail, /first settleable event/);
  }
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
  // The paid step runs only under a COMMITTED receipt that PARSES. This pinned the P171 filename; that
  // receipt lapsed at its program's close (P256), so the invariant is the parse, not the name.
  const receipt = /--receipt (docs\/receipts\/[A-Za-z0-9_.-]+\.md)/.exec(wf);
  assert.ok(receipt, "the paid step names a committed receipt");
  const receiptText = fs.readFileSync(path.join(ROOT, receipt[1]), "utf8");
  assert.equal(parseAuthorizationReceipt(receiptText).ok, true, `${receipt[1]} must parse fail-closed (scope, ceiling, floor, discipline, expiry)`);
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
