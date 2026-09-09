/**
 * P250-W1 — NFL Week 1 public-readiness contracts.
 *
 * The end-to-end sweep before the first regular-season kickoff found four classes of defect and
 * this file pins their fixes: (1) the product-day owner must never resurrect the retired preseason
 * note mid-season (covered in product-day.test.mjs); (2) surfaces that depend on a PRICE must
 * state OUR authorization state, never a claim about what the books offer, and must point at the
 * model forecasts that exist without one; (3) a started game's frozen pregame read never ranks as
 * a current "read"; (4) the NFL hub renders ONE canonical week table, with the generic quick list
 * collapsed behind it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");

test("End Zone Vault states OUR authorization, never what the books offer; disclaimer names the live model era", () => {
  const b = read("scripts/nfl/build-end-zone-vault.mjs");
  assert.match(b, /no authorized touchdown market is captured/);
  assert.ok(!b.includes("sportsbooks are not offering"), "no unobservable claim about the books");
  assert.match(b, /regular-season scoring model/);
  assert.ok(!/preseason model/.test(b), "the retired preseason era is not named as the source");
});

test("/cards/[sport] renders the lane's own derived blocker instead of a generic pricing promise", () => {
  const p = read("src/app/cards/[sport]/page.tsx");
  assert.match(p, /loadSportLabStreamBlocker/, "the ledger's typed reason is consulted");
  assert.match(p, /a missing authorized price removes the card, never the forecast/, "the forecast's existence is stated beside the blocker");
  const lib = read("src/lib/parlays/sport-lab-cards.ts");
  assert.match(lib, /export function loadSportLabStreamBlocker/, "the blocker loader is the ledger's, never typed on the page");
});

test("/markets names its price-scoped population and points at the model-only sports' hubs", () => {
  const p = read("src/app/markets/page.tsx");
  assert.match(p, /only markets with a current authorized sportsbook capture/);
  assert.match(p, /never the forecast/);
  assert.match(p, /buildProductDays/, "the sport list derives from the product-day owner, not prose");
});

test("a started game's frozen pregame read never enters Top Reads", () => {
  const t = read("src/lib/top-reads.ts");
  assert.match(t, /e\.lifecycle !== "UPCOMING"/, "only UPCOMING events rank");
});

test("the projected scorecard composes ONLY page-loaded artifact data — numbers where earned, typed absence where not", () => {
  const page = read("src/app/nfl/game/[eventId]/page.tsx");
  assert.match(page, /Projected scorecard/, "the scorecard section exists");
  assert.match(page, /expected statistical summaries · not one simulated game/, "it carries the P249 architecture label");
  assert.match(page, /Likely TD scorers/, "TD scorers render per team");
  assert.match(page, /Receiving leaders/, "receiving lines render per team");
  assert.match(page, /withheld, with the exact bar each failed/, "unearned families are stated inside the scorecard frame");
  assert.match(page, /x\.reason \?\? "did not clear its evaluation bar"/, "the failed bar is read from the artifact, never typed");
  // The scorecard can never source a number outside the two artifacts the page already loads.
  const section = page.slice(page.indexOf("P250-GD"), page.indexOf('aria-labelledby="score-range"'));
  assert.ok(!/readPublic|fs\.readFileSync/.test(section), "no new data reads inside the scorecard");
  // P250-GD2 (owner display decision): passing/rushing render as ESTIMATE lines — always behind the
  // family-state gate, always wearing the estimate marker and legend, never as bare validated numbers.
  assert.match(section, /hasPass = fams\.player_pass_yds\?\.state === "ESTIMATE" \|\| fams\.player_pass_yds\?\.state === "PUBLISHED"/, "passing renders only via its family state");
  assert.match(section, /Passing\{estMark\("player_pass_yds"\)\}/, "the passing group wears the estimate marker");
  assert.match(section, /Rushing leaders\{estMark\("player_rush_yds"\)\}/, "the rushing group wears the estimate marker");
  assert.match(section, /failed an evaluation bar and are/, "the estimate legend states the failure in the scorecard frame");
  assert.match(section, /x\.state === "WITHHELD"/, "truly-absent families stay a typed absence");
});

test("the NFL hub carries ONE canonical week table — the generic list collapses behind it", () => {
  const hub = read("src/app/nfl/page.tsx");
  assert.match(hub, /deferToCanonical=\{\{/, "the hub header defers to the weekly table");
  const header = read("src/components/sport-hub/hub-header.tsx");
  assert.match(header, /deferToCanonical/, "the collapse mode exists on the shared header");
  assert.match(header, /open the quick list/, "the quick list stays one click away, never deleted");
});
