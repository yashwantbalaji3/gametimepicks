/**
 * Simulation Hub eligibility guards (Program 139).
 *
 * The founder's observation was specific: the homepage promoted a settled UFC archive beside active
 * MLB simulations. The rule that prevents it is one line — history is not activity — and it is the
 * kind of rule that gets quietly reverted by a future "just show all the sports" change.
 *
 * Run: npx tsx --test src/lib/home/simulation-hub.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { deriveSportState, isPrimary, stateLabel, partitionSports, SPORT_STATES } from "./simulation-hub.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const TODAY = "2026-08-05";

test("THE DEFECT · a settled archive is never primary, however old or complete", () => {
  const ufc = deriveSportState({ slateDate: TODAY, artifactDate: "2026-06-15", leans: 0, inSeason: false });
  assert.equal(ufc, SPORT_STATES.HISTORICAL_ONLY);
  assert.equal(isPrimary(ufc), false, "this is exactly the bug: UFC shown as if it were running");
  assert.match(stateLabel(ufc, { artifactDate: "2026-06-15" }), /Historical coverage · settled 2026-06-15/);
});

test("an archive with leans on it is STILL history — the count is not the point, the date is", () => {
  const s = deriveSportState({ slateDate: TODAY, artifactDate: "2026-06-15", leans: 42, inSeason: false });
  assert.equal(s, SPORT_STATES.HISTORICAL_ONLY);
  assert.equal(isPrimary(s), false);
});

test("today's slate with model leans is LIVE_TODAY and primary", () => {
  const s = deriveSportState({ slateDate: TODAY, artifactDate: TODAY, leans: 15, inSeason: true });
  assert.equal(s, SPORT_STATES.LIVE_TODAY);
  assert.equal(isPrimary(s), true);
  assert.equal(stateLabel(s), "Live today");
});

test("an in-season no-play stays PRIMARY — hiding a quiet day would look like an outage", () => {
  const s = deriveSportState({ slateDate: TODAY, artifactDate: TODAY, leans: 0, inSeason: true });
  assert.equal(s, SPORT_STATES.IN_SEASON_NO_SLATE);
  assert.equal(isPrimary(s), true, "a legitimate no-play is a product state, not an absence");
  assert.match(stateLabel(s), /no qualified slate/);
});

test("a covered event inside the look-ahead window is primary; outside it is not", () => {
  const near = deriveSportState({ slateDate: TODAY, artifactDate: null, nextEventDate: "2026-08-09" });
  assert.equal(near, SPORT_STATES.EVENT_THIS_WEEK);
  assert.equal(isPrimary(near), true);

  const far = deriveSportState({ slateDate: TODAY, artifactDate: null, nextEventDate: "2026-09-20" });
  assert.notEqual(far, SPORT_STATES.EVENT_THIS_WEEK, "a month out is not 'this week'");
  assert.equal(isPrimary(far), false);

  // A PAST date must never read as upcoming.
  const past = deriveSportState({ slateDate: TODAY, artifactDate: null, nextEventDate: "2026-07-01" });
  assert.equal(isPrimary(past), false);
});

test("no artifact and no season is NOT_SUPPORTED, never a hopeful primary slot", () => {
  const s = deriveSportState({ slateDate: TODAY });
  assert.equal(s, SPORT_STATES.NOT_SUPPORTED);
  assert.equal(isPrimary(s), false);
});

test("partitionSports preserves the caller's payload", () => {
  const { primary, secondary } = partitionSports([
    { id: "mlb", state: SPORT_STATES.LIVE_TODAY, card: { label: "MLB" } },
    { id: "ufc", state: SPORT_STATES.HISTORICAL_ONLY, card: { label: "UFC" } },
  ]);
  assert.deepEqual(primary.map((s) => s.id), ["mlb"]);
  assert.deepEqual(secondary.map((s) => s.id), ["ufc"]);
  assert.equal(primary[0].card.label, "MLB", "the attached card must survive partitioning");
});

test("the homepage derives the hub rather than hardcoding a sport list", () => {
  const page = fs.readFileSync(path.join(APP, "src/app/page.tsx"), "utf8");
  // P202 restatement: the invariant was "hub membership comes from artifacts, never a hardcoded
  // list". The artifacts now speak through ONE owner — the page consumes the product-day
  // authority and maps its typed answer into hub vocabulary, which is the same claim with a
  // single interpreter instead of page-local reads.
  assert.match(page, /buildProductDays/, "hub facts come from the product-day authority");
  assert.match(page, /sportStateFromProductDay/, "hub membership maps from the owner's typed state");
  assert.match(page, /partitionSports/, "primary/secondary split must use the shared rule");
  // The old subtitle asserted UFC's presence in the hub as a standing fact.
  assert.doesNotMatch(page, /the UFC card is a settled archive/,
    "the hub subtitle must describe what is actually rendered, not a fixed roster");
});

test("PRODUCTION TRUTH · the homepage presents UFC as live ONLY while it publishes bout predictions", () => {
  const home = path.join(APP, "out/index.html");
  if (!fs.existsSync(home)) return;                       // no build in this run
  const html = fs.readFileSync(home, "utf8");
  const hub = html.indexOf("Simulation Hub");
  const other = html.indexOf("Other coverage");
  if (hub === -1) return;
  // Anything between the two headings is the primary hub. P191: UFC may sit there now — but only
  // while the card artifact actually carries predictions. The invariant was never "UFC is excluded";
  // it was "nothing appears as a live simulation unless it is one", so it is checked against the
  // artifact rather than against the sport's name.
  const primaryBlock = other > hub ? html.slice(hub, other) : html.slice(hub);
  const cardPath = path.join(APP, "public/data/ufc/card-latest.json");
  const predicted = fs.existsSync(cardPath)
    ? (JSON.parse(fs.readFileSync(cardPath, "utf8")).bouts ?? []).filter((b) => b.prediction).length
    : 0;
  if (predicted > 0) {
    assert.match(primaryBlock, /UFC/, "UFC publishes bout predictions and belongs in the hub");
  } else {
    assert.doesNotMatch(primaryBlock, /UFC/, "UFC publishes no predictions and must not appear as a live simulation");
  }
});
