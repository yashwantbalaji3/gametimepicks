/**
 * Parlay Lab V2 · the /dev/parlay-lab-fixture route: its fixture models, its gate, and the slip behaviour the browser
 * spec (e2e/parlay-lab-v2.spec.ts) expects. Run from app/: npx tsx --test src/lib/parlays/v2/lab-fixture-page.test.mjs
 * FIXTURE — not real picks, not real prices.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { buildFixtureModels, FIXTURE_ALLOWED_OPERATORS, FIXTURE_NOW, FIXTURE_PAGE_LABEL } from "./__fixtures__/lab-fixture-page.mjs";
import { PR1130_KNOWN_OFFSHORE_KEYS, OFFSHORE_TITLES } from "./__fixtures__/v2-fixtures.mjs";
import { parlayFixtureRouteEnabled, DEV_ROUTES_ENV } from "./dev-route.mjs";
import { makeOperatorPredicate } from "./operators.mjs";
import { slipFromCard, slipView, addLeg, removeLeg, reorderLeg, SLIP_STATE, PRICE_NOT_VERIFIED } from "../../slip/smart-slip.mjs";

const APP = process.cwd();
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");
const tier = (m, t) => m.tiers.find((x) => x.tier === t);
const codes = (t) => t.reasons.map((r) => r.code);

test("qualified scenario: High has one QUALIFIED fixture card; the other three tiers say why they are empty", () => {
  const { qualified } = buildFixtureModels();
  assert.deepEqual(qualified.tiers.map((t) => t.tier), ["low", "medium", "high", "longshot"]);
  const high = tier(qualified, "high");
  assert.equal(high.status, "QUALIFIED");
  assert.deepEqual(high.cards.map((c) => c.cardId), ["fixture-high-1"]);
  assert.equal(high.cards[0].combinedPriceText, "+320");
  assert.ok(codes(tier(qualified, "medium")).includes("SAME_EVENT"));
  assert.ok(codes(tier(qualified, "low")).includes("PRICE_STALE"));
  assert.ok(codes(tier(qualified, "longshot")).includes("NO_CANDIDATE"));
  for (const t of qualified.tiers) assert.equal(t.history, null);
});

test("none scenario: four NO QUALIFYING PARLAY tiers, each with a reason", () => {
  const { none } = buildFixtureModels();
  for (const t of none.tiers) {
    assert.equal(t.status, "NO_QUALIFYING_PARLAY", t.tier);
    assert.ok(t.reasons.length >= 1, t.tier);
  }
});

test("the fixture models are synthetic through and through: fixture names only, no offshore book anywhere", () => {
  const m = buildFixtureModels();
  const json = JSON.stringify(m);
  for (const name of [...PR1130_KNOWN_OFFSHORE_KEYS, ...OFFSHORE_TITLES]) assert.ok(!json.toLowerCase().includes(name.toLowerCase()), name);
  for (const l of tier(m.qualified, "high").cards[0].legs) assert.match(`${l.selection} ${l.game}`, /Fixture/);
  assert.equal(FIXTURE_PAGE_LABEL, "FIXTURE — not real picks, not real prices");
  assert.ok(!/https?:\/\//.test(json), "no URL of any kind in the model");
});

test("the slip, driven exactly as the page drives it: snapshot, invalidation, same-game, expired-price hiding", () => {
  const { qualified, addable } = buildFixtureModels();
  const allow = makeOperatorPredicate(FIXTURE_ALLOWED_OPERATORS);
  const nowMs = Date.parse(FIXTURE_NOW);
  const s0 = slipFromCard(tier(qualified, "high").cards[0]);
  assert.equal(slipView(s0, { nowMs, isVerifiedOperator: allow }).state, SLIP_STATE.PRICED_AS_RECORDED);
  assert.equal(slipView(s0, { nowMs }).state, SLIP_STATE.PRICE_NOT_VERIFIED, "without the injected allowlist the seam hides every price");

  const s1 = addLeg(s0, addable.find((a) => a.id === "new-game").leg);
  assert.equal(slipView(s1, { nowMs, isVerifiedOperator: allow }).state, SLIP_STATE.PRICE_CHANGED_REVERIFY);
  assert.equal(slipView(reorderLeg(s0, 0, 1), { nowMs, isVerifiedOperator: allow }).state, SLIP_STATE.PRICE_CHANGED_REVERIFY);
  assert.equal(slipView(removeLeg(s0, s0.legs[0].key), { nowMs, isVerifiedOperator: allow }).state, SLIP_STATE.PRICE_CHANGED_REVERIFY);

  const sg = slipView(addLeg(s0, addable.find((a) => a.id === "same-game").leg), { nowMs, isVerifiedOperator: allow });
  assert.equal(sg.sameGame, true);
  assert.match(sg.sameGameNote, /same game/);

  const late = slipView(s0, { nowMs: nowMs + 7 * 3_600_000, isVerifiedOperator: allow });
  assert.equal(late.state, SLIP_STATE.PRICE_NOT_VERIFIED);
  for (const l of late.legs) {
    assert.equal(l.priceVisible, false);
    assert.equal(l.priceText, PRICE_NOT_VERIFIED);
    assert.equal(l.bookText, null, "a hidden price hides its book too");
    assert.equal(l.freshness, "EXPIRED");
  }
});

test("GATE · content only with GTP_DEV_ROUTES=1, and the page 404s before it builds any fixture", () => {
  assert.equal(DEV_ROUTES_ENV, "GTP_DEV_ROUTES");
  assert.equal(parlayFixtureRouteEnabled({}), false);
  assert.equal(parlayFixtureRouteEnabled({ GTP_DEV_ROUTES: "0" }), false);
  assert.equal(parlayFixtureRouteEnabled({ GTP_DEV_ROUTES: "true" }), false, "exactly \"1\", nothing looser");
  assert.equal(parlayFixtureRouteEnabled({ GTP_DEV_ROUTES: "1" }), true);
  const page = read("src/app/dev/parlay-lab-fixture/page.tsx");
  const body = page.slice(page.indexOf("export default function"));
  assert.ok(body.indexOf("if (!parlayFixtureRouteEnabled()) notFound();") > -1, "the gate");
  assert.ok(body.indexOf("notFound()") < body.indexOf("buildFixtureModels()"), "the gate runs before any fixture is built");
  assert.doesNotMatch(page, /generateStaticParams/, "a single static page");
  assert.match(page, /index: false, follow: false/, "noindex");
  const client = read("src/app/dev/parlay-lab-fixture/fixture-client.tsx");
  assert.doesNotMatch(client, /__fixtures__/, "the client receives fixture data as props, it never bundles the fixtures");
  assert.doesNotMatch(client, /localStorage/, "the fixture slip is never persisted");
  assert.match(client, /persist: false/);
});

test("nothing links to the dev route", () => {
  const hits = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!p.includes(`${path.sep}dev${path.sep}parlay-lab-fixture`)) walk(p); continue; }
      if (/\.(tsx?|mjs)$/.test(e.name) && !/\.test\./.test(e.name) && /(href|push|replace)\s*[=(:]\s*\{?\s*["'`]\/dev\/parlay-lab-fixture/.test(fs.readFileSync(p, "utf8"))) hits.push(path.relative(APP, p));
    }
  })(path.join(APP, "src"));
  assert.deepEqual(hits, [], "no link, push or redirect to the dev route");
});
