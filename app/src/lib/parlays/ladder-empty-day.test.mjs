/**
 * AN EMPTY LADDER MUST MEAN "NOTHING QUALIFIED", NEVER "NOTHING EXISTS YET".
 *
 * Those two render identically and mean opposite things. The ladder is rebuilt by daily-products at
 * 12:10 UTC and by nightly-settle at 05:30/07:30, while the candidate snapshot for the same ET day
 * is not written until ~14:09. So every morning it ran against a pool that did not exist, published
 * four skipped bands, and overwrote latest.json — and nothing rebuilt it afterwards, so the Parlay
 * Lab showed nothing for the rest of the day while eighteen perfectly good priced cards sat on disk.
 *
 * The fix is a refusal, not a reordering: the job may run at any hour, and the previous artifact is
 * the last thing that was actually true.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const SRC = fs.readFileSync(path.join(process.cwd(), "scripts", "parlays", "build-risk-ladder.mjs"), "utf8");
const BODY = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("the ladder refuses to publish an empty day when no candidate pool exists", () => {
  assert.match(BODY, /const hadPool =/, "the builder must distinguish an absent pool from an empty result");
  assert.match(BODY, /if \(!hadPool && cards\.length === 0\)/, "an absent pool with no cards must refuse");
  // The refusal has to come BEFORE the write, or it refuses after already overwriting.
  assert.ok(BODY.indexOf("if (!hadPool") < BODY.indexOf("writeFileSync"),
    "the refusal must precede the write");
  assert.ok(BODY.indexOf("if (!hadPool") < BODY.indexOf('"latest.json"'),
    "latest.json must not be overwritten before the refusal is evaluated");
});

test("a genuinely empty pool still publishes, with reasons", () => {
  /*
   * The other direction matters as much. A slate that produced candidates but qualified none is a
   * real no-play, and hiding it behind the same refusal would make a quiet day look like an outage
   * — which is the failure this repo's product-state contract exists to prevent.
   */
  assert.match(BODY, /hadPool = Boolean\(gradedToday\?\.publicRiskSections\) \|\| \(snapshotToday\?\.slips \?\? \[\]\)\.length > 0/,
    "the pool test must read the real sources, so a present-but-unqualifying pool still publishes");
});

test("PRODUCTION TRUTH · the published ladder is not a blank day over a live pool", () => {
  const root = path.join(process.cwd(), "public", "data", "parlays");
  const latest = path.join(root, "risk-ladder", "latest.json");
  if (!fs.existsSync(latest)) return;
  const l = JSON.parse(fs.readFileSync(latest, "utf8"));
  if ((l.cards ?? []).length > 0) return;                       // cards published — nothing to check

  // Zero cards is only defensible if that date's snapshot also has no usable slips.
  const snap = path.join(root, "snapshots", `${l.date}.json`);
  if (!fs.existsSync(snap)) return;                             // no pool — the refusal path
  const slips = JSON.parse(fs.readFileSync(snap, "utf8")).slips ?? [];
  assert.equal(slips.length, 0,
    `the ladder publishes 0 cards for ${l.date} while ${slips.length} candidate slips exist for the same date`);
});
