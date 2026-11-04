/**
 * Founder Priority 4 — the redesigned Bank Builder / Moonshot tier board (view model + components).
 *
 *   fixture      a document tagged fixture:true is refused by default; only allowFixture renders it
 *   adapter      the engine's suggested-cards@1 file and the Level A model give the same card shape
 *   bands        the band ranges the hero prints are derived from PARLAY_ODDS_BANDS and agree with the bander
 *   pricing      no price, odds or payout renders unless the source authorizes it; MODEL PROJECTION is the only label
 *   states       qualified · model-only · blocked · insufficient · historical, one badge each, glyph + text
 *   journey      each leg opens (<details>) to team, projection, eligibility, availability, player and game links
 *   targets      every link and button the card renders carries a ≥44px target class
 *   pages        /bank-builder and /moonshot render the hero, today's card, one disclosure, and no fixture
 *
 * Run (from app/): npx tsx --test src/components/tier-board/tier-board.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;
process.env.__NEXT_TRAILING_SLASH = "true";

const APP = process.cwd();
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");
const FIXTURE = JSON.parse(read("src/lib/products/tier-board/__fixtures__/suggested-cards-2026-11-02.fixture.json"));

const view = await import("../../lib/products/tier-board/view.mjs");
const { getRiskBucketForCombinedOdds, PUBLIC_RISK_TIERS } = await import("../../lib/parlays/risk-odds-bands.mjs");
const { fairAmerican } = await import("../../lib/products/level-a/suggestions.mjs");
const { default: TierBoardSection } = await import("./tier-board-section.tsx");
const { default: ProductHero } = await import("./product-hero.tsx");
const { default: StateBadge } = await import("./state-badge.tsx");
const { default: ProductDisclosure } = await import("./product-disclosure.tsx");

const html = (el) => renderToStaticMarkup(el);
const text = (h) => h.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/g, " ").replace(/\s+/g, " ");

test("a fixture-tagged document is refused unless the caller opts in", () => {
  assert.equal(FIXTURE.fixture, true, "the committed sample is tagged test-only");
  assert.equal(view.tierBoardFromSuggestedCards(FIXTURE, "bank-builder"), null);
  assert.equal(view.tierBoardFor("bank-builder", { suggestedCards: FIXTURE, levelAModel: null, productDay: FIXTURE.productDay }), null);
  assert.ok(view.tierBoardFromSuggestedCards(FIXTURE, "bank-builder", { allowFixture: true }));
});

test("the page loader never reads a fixture: real pages read only public/data/suggested-cards/<day>.json", () => {
  const load = read("src/lib/products/tier-board/load.ts");
  assert.doesNotMatch(load, /__fixtures__|allowFixture/);
  for (const f of ["src/app/bank-builder/page.tsx", "src/app/moonshot/page.tsx"]) {
    const s = read(f);
    assert.doesNotMatch(s, /__fixtures__|allowFixture/, `${f} never touches the fixture`);
    assert.match(s, /loadTierBoard\("(bank-builder|moonshot)"/, `${f} reads the tier board`);
  }
  const dev = read("src/app/dev/tier-board-fixture/page.tsx");
  assert.ok(dev.indexOf("notFound()") < dev.indexOf("tierBoardFromSuggestedCards(fixture"), "the dev route's gate runs before the fixture is used");
});

test("suggested-cards@1 → the product's featured card, legs in order, model-only, unpriced", () => {
  const bb = view.tierBoardFromSuggestedCards(FIXTURE, "bank-builder", { allowFixture: true });
  const ms = view.tierBoardFromSuggestedCards(FIXTURE, "moonshot", { allowFixture: true });
  assert.equal(bb.featured.state, "model-only");
  assert.equal(bb.featured.legs.length, FIXTURE.bankBuilder.nba.card.legs.length);
  assert.deepEqual(bb.featured.legs.map((l) => l.key), FIXTURE.bankBuilder.nba.card.legs.map((l) => l.legId));
  assert.equal(bb.featured.joint, FIXTURE.bankBuilder.nba.card.jointShown);
  assert.ok(["low", "medium"].includes(bb.featured.tier), "Bank Builder stays in its bands");
  assert.ok(["high", "longshot"].includes(ms.featured.tier), "Moonshot stays in its bands");
  for (const b of [bb, ms]) {
    assert.equal(b.featured.pricing.authorized, false);
    for (const l of b.featured.legs) assert.equal(l.price, null);
    assert.ok(b.reasons.every((r) => !/\.$/.test(r.text)), "reasons end without a period (the panel adds one)");
  }
});

test("a card from the Level A model has the same shape (the engine reuses Level A)", () => {
  const card = FIXTURE.bankBuilder.nba.card;
  const levelA = { productDay: "2026-11-02", bankBuilder: { card: null, reason: "a mixed card needs legs from two sports" }, moonshot: { card: null, reason: "x" }, nbaGameWinners: { public: true, bankBuilder: { card, reason: null }, moonshot: { card: null, reason: "y" } } };
  const a = view.tierBoardFromLevelA(levelA, "bank-builder");
  const b = view.tierBoardFromSuggestedCards(FIXTURE, "bank-builder", { allowFixture: true });
  assert.equal(a.origin, "level-a");
  assert.deepEqual(a.featured.legs.map((l) => [l.key, l.title, l.projection.text]), b.featured.legs.map((l) => [l.key, l.title, l.projection.text]));
  const none = view.tierBoardFromLevelA({ ...levelA, nbaGameWinners: { public: false } }, "bank-builder");
  assert.equal(none.featured, null);
  assert.equal(none.state, "insufficient");
});

test("band ranges are derived from the band edges and agree with the bander on both sides of each edge", () => {
  for (const t of PUBLIC_RISK_TIERS) {
    const r = view.bandProbabilityRange(t);
    const inside = r.lo === 0 ? r.hi / 2 : (r.lo + r.hi) / 2;
    assert.equal(getRiskBucketForCombinedOdds(fairAmerican(inside)), t, `${t} midpoint`);
    assert.equal(getRiskBucketForCombinedOdds(fairAmerican(r.hi - 0.002)), t, `${t} just under its top`);
  }
  assert.equal(view.bandRangeText("low"), "50%–67%");
  assert.equal(view.bandRangeText("medium"), "25%–50%");
  assert.equal(view.bandRangeText("high"), "14.3%–25%");
  assert.equal(view.bandRangeText("longshot"), "under 14.3%");
});

test("a price renders only when authorized; the page's projection label is MODEL PROJECTION, never an estimate", () => {
  const board = view.tierBoardFromSuggestedCards(FIXTURE, "moonshot", { allowFixture: true });
  const h = html(React.createElement(TierBoardSection, { board, productName: "Moonshot" }));
  const t = text(h);
  assert.match(t, /MODEL PROJECTION/);
  /* The label rule: MODEL PROJECTION is the only projection LABEL. Engine prose ("Elo-derived estimate" in the approved
     NBA disclosure) is a sentence, not a label, so only label forms are refused here. */
  assert.doesNotMatch(t, /\bESTIMATE\b|\best\.|PROJECTED MEDIAN|Projected median|\bEST\b/);
  assert.equal((h.match(/data-tier-state=/g) ?? []).length, 1, "one state badge for the day's card");
  assert.doesNotMatch(t, /[+−-]\d{3}\b(?! more)/, "no American odds");
  assert.doesNotMatch(t, /\$\d/, "no money figure");
  assert.match(t, /No sportsbook price — model only/);
  assert.match(h, /data-pricing-authorized="false"/);

  const priced = structuredClone(board);
  priced.featured.pricing = { authorized: true, text: "Priced from a permitted sportsbook quote.", combined: { american: 650 } };
  assert.match(text(html(React.createElement(TierBoardSection, { board: priced, productName: "Moonshot" }))), /Combined \+650/);
});

test("every leg opens to identification, projection, eligibility, availability and its links", () => {
  const board = view.tierBoardFromSuggestedCards(FIXTURE, "bank-builder", { allowFixture: true });
  const h = html(React.createElement(TierBoardSection, { board, productName: "Bank Builder" }));
  const legs = h.split('<li class="tb-leg"').slice(1);
  assert.equal(legs.length, board.featured.legs.length);
  for (const leg of legs) {
    assert.match(leg, /^[^>]*><details><summary/, "a leg is a disclosure");
    for (const dt of ["Team", "MODEL PROJECTION", "Eligibility", "Availability", "Price"]) assert.match(leg, new RegExp(`<dt>${dt}</dt>`), dt);
    assert.match(leg, /data-leg-game-link="" href="\/nba\/#nba-exp-\d+"/, "the game page link");
    assert.match(leg, /data-leg-player-link="" href="\/nba\/projections\/2026-11-02\/"/, "the player page link");
    assert.match(leg, /Out at forecast freeze:|No player listed out/);
  }
  assert.match(h, /Why this combination/);
  assert.match(h, /model joint chance 50\.0% to 66\.7%/, "the band rule is the engine's own text");
  assert.match(h, /If any one leg loses, the whole card loses\./);
  assert.match(h, /href="\/build\/#level-a-parlay-lab"/, "Parlay Lab is the four-tier board on /build, not the redirecting /parlay-lab alias");
  assert.match(h, /Add card to Smart Betslip/);
});

test("the five states each have one badge with a glyph and a label", () => {
  const seen = new Set();
  for (const s of ["qualified", "model-only", "blocked", "insufficient", "historical", "MODEL_ONLY"]) {
    const h = html(React.createElement(StateBadge, { state: s }));
    const m = /data-tier-state="([^"]+)"/.exec(h);
    assert.ok(m, s);
    assert.match(h, /<span aria-hidden="true">.<\/span>/, `${s} carries a glyph`);
    seen.add(m[1]);
  }
  assert.equal(seen.size, 5);
});

test("empty states say which one it is and list the source's reasons", () => {
  const base = view.tierBoardFromSuggestedCards(FIXTURE, "bank-builder", { allowFixture: true });
  for (const [state, reason] of [["blocked", "NBA input blocked: x"], ["insufficient", "Insufficient eligible legs: y"]]) {
    const h = html(React.createElement(TierBoardSection, { board: { ...base, state, featured: null, reasons: [{ scope: "nba", text: reason }] }, productName: "Bank Builder" }));
    assert.match(h, new RegExp(`data-tier-board-state="${state}"`));
    assert.match(text(h), new RegExp(reason));
    assert.match(text(h), /No Bank Builder card today/);
  }
});

test("hero identities differ, quote derived bands, and every control is a 44px target", () => {
  const bb = html(React.createElement(ProductHero, { product: "bank-builder", state: "model-only", statusLabel: "S" }));
  const ms = html(React.createElement(ProductHero, { product: "moonshot", state: "insufficient", statusLabel: "S" }));
  assert.match(bb, /tb-hero--bank/);
  assert.match(ms, /tb-hero--moonshot/);
  assert.match(text(bb), /Low Risk model chance 50%–67%/);
  assert.match(text(ms), /Longshot model chance under 14\.3%/);
  assert.match(text(ms), /Most Moonshots lose/);
  const css = read("src/app/globals.css");
  for (const cls of ["tb-btn", "tb-link"]) assert.match(css, new RegExp(`\\.${cls} \\{[^}]*min-height: 44px`), cls);
  assert.match(css, /\.tb-leg-summary \{[^}]*min-height: 56px/);
  for (const h of [bb, ms]) for (const a of h.match(/<a [^>]*>/g)) assert.match(a, /class="tb-btn/, a);
});

test("one disclosure per page", () => {
  for (const f of ["src/app/bank-builder/page.tsx", "src/app/moonshot/page.tsx"]) {
    const s = read(f);
    assert.equal((s.match(/<ProductDisclosure /g) ?? []).length, 1, f);
    assert.doesNotMatch(s, /Paper-only educational tracking/, `${f}: the old footer disclaimer is gone`);
  }
  assert.match(text(html(React.createElement(ProductDisclosure, { productName: "Moonshot" }))), /paper-only and educational/);
});
