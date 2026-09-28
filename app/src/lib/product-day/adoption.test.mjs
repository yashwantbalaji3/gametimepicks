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
  // P250: the last exempted raw read (the retired preseason lane's player-market count) is gone —
  // the homepage now holds ZERO raw sport reads. A new one must be classified here first.
  const rawReads = [...home.matchAll(/readCount\(\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(rawReads, [], "no raw sport reads on the homepage — the owner reads the lanes");
  assert.ok(!home.includes("game-simulations/latest.json"), "the retired preseason lane is not read by home");
});

test("ADOPTED · /today's active-sports header speaks the owner's answer", () => {
  assert.match(today, /buildProductDays\(/, "today consumes the owner");
  assert.match(today, /state === "LIVE"/, "active means the owner's LIVE, not a local count");
});

test("🔴 the day claim is cross-sport: every liveness banner is either fed the cross-sport answer or scoped to its sport", () => {
  /*
   * 2026-09-28: this test used to PIN `latestSlateHasGames={(mlbDay?.events ?? 0) > 0 || …}` on the
   * homepage — the owner's answer, but only MLB's. With MLB at 0 (the day after the regular season)
   * the homepage said "No games today" over PHI @ CHI at 8:15 PM ET. The intent stands (the banner
   * reads the owner, never page-local arrays); the owner is now lib/product-day crossSportToday.
   */
  const pages = {};
  const walk = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const f = path.join(dir, e.name); if (e.isDirectory()) walk(f); else if (/\.tsx$/.test(e.name)) { const src = fs.readFileSync(f, "utf8"); if (/<SlateLivenessBanner\b/.test(src)) pages[path.relative(app, f)] = src; } } };
  walk(path.join(app, "src/app"));
  assert.ok(Object.keys(pages).length >= 5, `the scan finds the banner mounts (${Object.keys(pages).length})`);
  for (const [rel, src] of Object.entries(pages)) {
    for (const m of src.matchAll(/<SlateLivenessBanner\b[\s\S]*?\/>/g)) {
      const mount = m[0];
      const crossSport = /latestSlateHasGames=\{todayAcross\.eventsToday > 0\}/.test(mount) && /crossSportToday\(/.test(src);
      const scoped = /\bscope="[A-Z]{2,5}"/.test(mount);
      assert.ok(crossSport || scoped, `${rel}: a banner that is neither cross-sport nor scoped would turn one sport's empty day into "No games today"`);
      if (crossSport) assert.match(mount, /todayEvidence=/, `${rel}: a cross-sport banner states whether today's emptiness is proven`);
    }
  }
  for (const rel of ["src/app/page.tsx", "src/app/today/page.tsx", "src/app/moonshot/page.tsx"]) {
    assert.match(pages[rel] ?? "", /latestSlateHasGames=\{todayAcross\.eventsToday > 0\}/, `${rel} speaks for the whole day, so it reads the cross-sport owner`);
  }
  // The inputs that produced the defect never come back as a day claim.
  for (const src of Object.values(pages)) {
    assert.ok(!/latestSlateHasGames=\{[^}]*(topPicks|cards\.length|mlbDay\?\.events)/.test(src), "picks, cards or one sport's events are not evidence about the day");
  }
});

test("the owner stays the single interpreter: no second product-day module exists", () => {
  const dir = path.join(app, "src/lib/product-day");
  const modules = fs.readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
  assert.deepEqual(modules.sort(), ["product-day.ts", "qualified-leg.ts"],
    "new product-day-adjacent modules must be classified in this inventory first");
});
