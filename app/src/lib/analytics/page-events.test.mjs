import { test } from "node:test";
import assert from "node:assert/strict";

import { ctaDestinationForHref, funnelEventsForPath, homeCtaClickEvent, marketDisagreementOpenedEvent, sourceVisitEvent, todaySlateClickedFromResultsEvent } from "./page-events.ts";
import { validateEvent } from "./event-contract.ts";

const DAY = "2026-07-24";

test("each funnel path maps to the right existing event(s)", () => {
  assert.deepEqual(funnelEventsForPath("/today", { dayBucket: DAY }).map((e) => e.event), ["daily_hub_view", "daily_brief_view"]);
  assert.deepEqual(funnelEventsForPath("/games/mlb/kc-vs-det-2026-07-24", { dayBucket: DAY }).map((e) => e.event), ["game_report_open"]);
  assert.deepEqual(funnelEventsForPath("/results", { dayBucket: DAY }).map((e) => e.event), ["results_recap_open"]);
  assert.deepEqual(funnelEventsForPath("/results/mlb", { dayBucket: DAY }).map((e) => e.event), ["results_recap_open"]);
  assert.deepEqual(funnelEventsForPath("/mlb", { dayBucket: DAY }).map((e) => e.event), ["daily_hub_view"]);
});

test("v2 (Program 058-061) paths: home, markets, methodology, system-status", () => {
  // v1 deliberately emitted nothing for "/" — superseded: the public-beta funnel starts at Landing.
  assert.deepEqual(funnelEventsForPath("/", { dayBucket: DAY }).map((e) => e.event), ["homepage_viewed"]);
  assert.deepEqual(funnelEventsForPath("/markets", { dayBucket: DAY }).map((e) => e.event), ["market_center_view"]);
  assert.deepEqual(funnelEventsForPath("/methodology", { dayBucket: DAY }).map((e) => e.event), ["methodology_viewed"]);
  assert.deepEqual(funnelEventsForPath("/system-status", { dayBucket: DAY }).map((e) => e.event), ["status_viewed"]);
});

test("the existing clarity/trust routes map to learn_trust_open (the page view IS the control)", () => {
  const trust = (p) => funnelEventsForPath(p, { dayBucket: DAY })[0];
  assert.equal(trust("/learn").event, "learn_trust_open");
  assert.equal(trust("/learn").trustSurface, "how_it_works");
  assert.equal(trust("/market-guide").trustSurface, "market_guide");
  assert.equal(trust("/responsible-use").surface, "trust");
  assert.equal(trust("/responsible-use").trustSurface, "responsible_use");
  for (const p of ["/learn", "/market-guide", "/responsible-use"]) {
    for (const e of funnelEventsForPath(p, { dayBucket: DAY })) assert.equal(validateEvent(e).ok, true, p);
  }
  // Trust pages that already carry their own v2 view event must not ALSO emit learn_trust_open.
  assert.deepEqual(funnelEventsForPath("/methodology", { dayBucket: DAY }).map((e) => e.event), ["methodology_viewed"]);
  assert.deepEqual(funnelEventsForPath("/system-status", { dayBucket: DAY }).map((e) => e.event), ["status_viewed"]);
});

test("unmapped paths emit no page-VIEW event", () => {
  assert.deepEqual(funnelEventsForPath("/simulate", { dayBucket: DAY }), []);
  assert.deepEqual(funnelEventsForPath("/games/mlb", { dayBucket: DAY }), [], "the games index is not a single report");
  assert.deepEqual(funnelEventsForPath("/about", { dayBucket: DAY }), [], "no event is invented for a page without a defined funnel role");
});

test("the interaction builders bucket their destination and never carry a URL", () => {
  const primary = homeCtaClickEvent(DAY, "primary", "/simulate");
  assert.equal(primary.event, "home_cta_click");
  assert.equal(primary.cta, "primary");
  assert.equal(primary.destination, "simulate");
  assert.equal(validateEvent(primary).ok, true);
  assert.equal(homeCtaClickEvent(DAY, "secondary", "/today").destination, "today");
  assert.equal(validateEvent(homeCtaClickEvent(DAY, "secondary", "/today")).ok, true);

  assert.equal(ctaDestinationForHref("/results/mlb"), "results");
  assert.equal(ctaDestinationForHref("/games/mlb/a-vs-b-2026-07-24"), "games");
  assert.equal(ctaDestinationForHref("/market-guide"), "learn");
  assert.equal(ctaDestinationForHref("/today/?source=x#slate"), "today", "query + hash + trailing slash are stripped");
  assert.equal(ctaDestinationForHref("/bank-builder"), "other", "an unrecognised path is a bucket, never the path");

  const back = todaySlateClickedFromResultsEvent(DAY);
  assert.equal(back.event, "today_slate_clicked_from_results");
  assert.equal(back.sport, "mlb");
  assert.equal(validateEvent(back).ok, true);
  assert.equal(validateEvent(todaySlateClickedFromResultsEvent(DAY, "nba")).ok, true);

  // No builder may serialise a raw href into the payload.
  for (const e of [primary, back, homeCtaClickEvent(DAY, "primary", "/bank-builder")]) {
    assert.ok(!JSON.stringify(e).includes("/"), `no path leaks into ${e.event}`);
  }
});

test("trailing slashes + query strings are normalized before matching", () => {
  assert.deepEqual(funnelEventsForPath("/today/", { dayBucket: DAY }).map((e) => e.event), ["daily_hub_view", "daily_brief_view"]);
  assert.deepEqual(funnelEventsForPath("/results/?x=1", { dayBucket: DAY }).map((e) => e.event), ["results_recap_open"]);
});

test("every emitted funnel event validates against the contract (no PII, closed enums)", () => {
  for (const p of ["/today", "/games/mlb/a-vs-b-2026-07-24", "/results", "/mlb", "/", "/markets", "/methodology", "/system-status"]) {
    for (const e of funnelEventsForPath(p, { dayBucket: DAY })) assert.equal(validateEvent(e).ok, true, `${p} → ${e.event}`);
  }
  for (const s of ["x", "discord", "direct", "referral", "organic"]) assert.equal(validateEvent(sourceVisitEvent(s, DAY)).ok, true);
});

test("marketDisagreementOpenedEvent builds a valid v2 interaction event (coarse defaults, scoping allowed)", () => {
  const bare = marketDisagreementOpenedEvent(DAY);
  assert.equal(bare.event, "market_disagreement_opened");
  assert.equal(bare.surface, "markets");
  assert.equal(bare.sport, "mlb");
  assert.equal(bare.marketFamily, "other", "the /markets sort spans every family → the coarse catch-all");
  assert.equal(validateEvent(bare).ok, true);

  const scoped = marketDisagreementOpenedEvent(DAY, { sport: "mlb", marketFamily: "strikeouts" });
  assert.equal(scoped.marketFamily, "strikeouts");
  assert.equal(validateEvent(scoped).ok, true);
});
