/**
 * PRODUCT-DAY ADOPTION INVENTORY + FORWARD GUARD (Program 202 · Release A).
 *
 * This file IS the auditable A1 inventory the charter requires: every customer surface is
 * classified, and the classifications are enforced where enforcement is mechanical. The forward
 * guard makes it hard to reintroduce page-local product-day state: the two migrated surfaces may
 * not read sport artifacts to decide STATE, and their documented presentation-only reads are
 * named here so a new raw read fails loudly instead of drifting in.
 *
 * ── The A1 classification of record ─────────────────────────────────────────────────────────────
 *   /            ADOPTED            hub facts via buildProductDays + sportStateFromProductDay;
 *                                   liveness banner via mlbDay.events. Presentation-only reads:
 *                                   the MLB board (leans figure + sections Home shares with
 *                                   /today) and nfl/game-simulations (player-market COUNT).
 *   /today       ADOPTED            active-sports header via buildProductDays (P201); slate
 *                                   sections read the MLB board through its canonical loaders —
 *                                   the availability contract (lib/today/availability) is itself
 *                                   a canonical owner, not a duplicate.
 *   /simulate    PRESENTATION_ONLY  composes shared components over buildAllGameDetails and the
 *                                   market-coverage registry — existing canonical owners.
 *   sport hubs   LANE_OWNERS        each hub renders ITS OWN lane's canonical artifacts — that is
 *                                   ownership, not duplication; product-day derives FROM them.
 *   /cards/*     LANE_OWNERS        loadCurrentSportLabLadder owns current-vs-stale semantics.
 *   /build       PRESENTATION_ONLY  ladder/tier-grid/lab-ledger loaders are the parlay owners.
 *   /markets     PRESENTATION_ONLY  market-coverage + snapshot artifacts (Release B migrates its
 *                                   QUALIFICATION semantics — a different contract).
 *   /results     RECORD_OWNERS      accounting/ledger loaders; settled truth, not product-day.
 *   nav/mobile   N_A                route state, no product-day semantics.
 *
 * Run: npx tsx --test src/lib/product-day/adoption.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const app = process.cwd();
const read = (rel) => fs.readFileSync(path.join(app, rel), "utf8");
const home = read("src/app/page.tsx");
const today = read("src/app/today/page.tsx");

test("ADOPTED · the homepage consumes the authority and keeps no state-bearing raw sport reads", () => {
  assert.match(home, /buildProductDays\(/, "home consumes the owner");
  assert.match(home, /sportStateFromProductDay/, "home maps typed answers, never derives");
  assert.ok(!/deriveSportState\(/.test(home), "no page-local sport-state derivation");
  // Raw artifact paths that may NOT appear on the homepage any more — the owner reads them.
  for (const banned of ["card-latest.json", "soccer/epl", "nfl/index.json"]) {
    assert.ok(!home.includes(banned), `home reads ${banned} raw — that is the owner's job`);
  }
  // The ONE documented presentation-only raw read: the NFL player-market COUNT (display detail on
  // the card's status line; never a state input). Anything beyond it is a new duplicate.
  const rawReads = [...home.matchAll(/readCount\(\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(rawReads, ["nfl/game-simulations/latest.json"],
    "exactly the documented presentation-only read — a new raw read must be classified here first");
});

test("ADOPTED · /today's active-sports header speaks the owner's answer", () => {
  assert.match(today, /buildProductDays\(/, "today consumes the owner");
  assert.match(today, /state === "LIVE"/, "active means the owner's LIVE, not a local count");
});

test("empty arrays are not product state: the liveness banner reads the owner's event count", () => {
  assert.match(home, /latestSlateHasGames=\{\(mlbDay\?\.events \?\? 0\) > 0/,
    "the banner's has-games input is the owner's typed answer");
});

test("the owner stays the single interpreter: no second product-day module exists", () => {
  const dir = path.join(app, "src/lib/product-day");
  const modules = fs.readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
  assert.deepEqual(modules.sort(), ["product-day.ts", "qualified-leg.ts"],
    "new product-day-adjacent modules must be classified in this inventory first");
});
