/**
 * HOMEPAGE EVENT SPOTLIGHT — reusable selector + UFC 329 first implementation.
 *
 * Proves: a UFC spotlight is built only when there are live sims and the card isn't settled; its copy is
 * MARKET-IMPLIED and carries no forbidden over-claim (model picks live / best bet / lock / edge / EV);
 * the selector returns the first available candidate; the REAL committed artifacts yield a UFC 329
 * spotlight that links to /ufc; and the homepage + Today page are wired to render it.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildUfcSpotlight, selectHomepageSpotlight, spotlightCopyIsHonest, SPOTLIGHT_FORBIDDEN } from "./spotlight-event.ts";
import { loadHomepageSpotlight } from "./load-spotlight.ts";

const read = (p) => fs.readFileSync(p, "utf8");
const ufcInputs = (over = {}) => ({
  moneylineV1Ready: true, projectionCount: 9, oddsBackedCount: 9, fightCount: 14,
  eventName: "UFC 329: McGregor vs. Holloway 2", eventDate: "2026-07-11T21:00Z",
  gradedRows: 0, gradedTarget: 150, isSettled: false, whenLabel: "tomorrow", ...over,
});

test("1 · a UFC spotlight is built from live sims, market-implied, honest copy", () => {
  const e = buildUfcSpotlight(ufcInputs());
  assert.ok(e, "spotlight built");
  assert.equal(e.title, "UFC 329 Fight Simulator");
  assert.equal(e.sport, "UFC");
  assert.equal(e.sourceMode, "market_implied_simulation");
  assert.equal(e.cta.href, "/ufc");
  assert.equal(e.secondaryCta?.href, "/ufc?tab=fight-card");
  assert.match(e.subtitle, /Market-implied simulations are live for tomorrow's fight card/);
  assert.ok(e.chips.includes("14 fights loaded"));
  assert.ok(e.chips.includes("9 odds-backed simulations"));
  assert.ok(e.chips.includes("Model picks validating: 0 / 150"));
  assert.ok(e.chips.includes("Paper-only"));
  assert.equal(spotlightCopyIsHonest(e), true, "no forbidden over-claim");
});

test("2 · no spotlight for a settled card, a PAST event, or when sims aren't available (no stale events)", () => {
  assert.equal(buildUfcSpotlight(ufcInputs({ isSettled: true })), null, "settled ⇒ no spotlight");
  assert.equal(buildUfcSpotlight(ufcInputs({ isPast: true })), null, "past event ⇒ no spotlight");
  assert.equal(buildUfcSpotlight(ufcInputs({ moneylineV1Ready: false })), null, "no model ⇒ no spotlight");
  assert.equal(buildUfcSpotlight(ufcInputs({ oddsBackedCount: 0 })), null, "no odds-backed sims ⇒ no spotlight");
  assert.equal(buildUfcSpotlight(ufcInputs({ projectionCount: 0 })), null, "no projections ⇒ no spotlight");
});

test("3 · the spotlight NEVER carries forbidden over-claims", () => {
  const e = buildUfcSpotlight(ufcInputs());
  const blob = JSON.stringify(e).toLowerCase();
  for (const w of SPOTLIGHT_FORBIDDEN) assert.ok(!blob.includes(w), `no "${w}" in the spotlight`);
  // Explicit belt-and-suspenders on the exact banned phrases.
  for (const w of ["model picks live", "best bet", "positive ev", "guaranteed"]) assert.ok(!blob.includes(w));
});

test("4 · selector returns the first available candidate (priority order), else null", () => {
  const e = buildUfcSpotlight(ufcInputs());
  assert.equal(selectHomepageSpotlight([null, e]), e, "skips nulls, returns first live");
  assert.equal(selectHomepageSpotlight([null, undefined]), null, "nothing live ⇒ null (normal homepage)");
});

test("5 · the REAL committed artifacts yield a UFC 329 spotlight linking to /ufc", () => {
  const e = loadHomepageSpotlight("2026-07-10");
  assert.ok(e, "a spotlight is available for the committed slate");
  assert.equal(e.sport, "UFC");
  assert.match(e.title, /Fight Simulator/);
  assert.equal(e.cta.href, "/ufc");
  assert.match(e.subtitle, /Market-implied simulations are live/);
  assert.equal(spotlightCopyIsHonest(e), true);
});

test("6 · homepage + Today page render the spotlight from the shared loader", () => {
  const home = read("src/app/page.tsx");
  assert.match(home, /import EventSpotlight/, "home imports the component");
  assert.match(home, /loadHomepageSpotlight\(serverToday\)/, "home uses the loader with the real clock (past-event safe)");
  assert.match(home, /<EventSpotlight event=\{spotlightEvent\}/, "home renders it above the hero");
  const todayPage = read("src/app/today/page.tsx");
  assert.match(todayPage, /loadHomepageSpotlight\(serverToday\)/, "Today uses the loader with the real clock");
  assert.match(todayPage, /<EventSpotlight event=\{todaySpotlight\}/, "Today renders it");
});

test("7 · the rendering component hardcodes no forbidden copy and is data-driven to /ufc", () => {
  // The component renders copy; the lib legitimately lists the forbidden words in its guard, so only the
  // component (and any static strings it paints) is checked here.
  const comp = read("src/components/home/event-spotlight.tsx");
  assert.match(comp, /event\.cta\.href/, "CTA uses the event href (data-driven, not hardcoded)");
  const low = comp.toLowerCase();
  for (const w of ["best bet", "positive ev", "guaranteed", "model picks live", "lock ", " edge"]) {
    assert.ok(!low.includes(w), `component hardcodes no "${w}"`);
  }
});
