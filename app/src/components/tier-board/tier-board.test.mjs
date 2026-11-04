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
  assert.match(h, /href="\/build\/#parlay-tiers"/, "Parlay Lab is the four-tier board on /build, not the redirecting /parlay-lab alias");
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

test("the engine's leg kinds and unapproved methodology dependencies are stated plainly, in its own words", () => {
  const board = view.tierBoardFromSuggestedCards(FIXTURE, "bank-builder", { allowFixture: true });
  assert.deepEqual(board.legKinds, FIXTURE.nbaLegKinds);
  assert.equal(board.pending.length, FIXTURE.methodologyDependencies.filter((m) => m.state !== "APPROVED").length);
  const t = text(html(React.createElement(TierBoardSection, { board, productName: "Bank Builder" })));
  assert.match(t, /Legs today: NBA game winners only\./);
  assert.match(t, /What today.s card can.t include yet/);
  for (const m of FIXTURE.methodologyDependencies) assert.ok(t.includes(m.effect.replace(/\s+/g, " ").slice(0, 60)), m.key);
  assert.doesNotMatch(t, /proposedMethod|10,000 runs/, "the proposal text stays out of the public card");
  assert.ok(FIXTURE.bankBuilder.nba.card.legs.every((l) => l.selection.teamAbbr), "the refreshed sample carries teamAbbr");
});

test("withheld and under-review player values are never displayed: only guard-pass players are listed, and none prints a non-pass figure", () => {
  const nonPass = FIXTURE.playerProjections.nba.filter((p) => p.guard?.state !== "pass");
  assert.ok(nonPass.length > 0, "the fixture holds blocked/review players, so the test can fail");
  for (const product of ["bank-builder", "moonshot"]) {
    const board = view.tierBoardFromSuggestedCards(FIXTURE, product, { allowFixture: true });
    const h = html(React.createElement(TierBoardSection, { board, productName: product }));
    const rows = [...h.matchAll(/<ul class="tb-player-list">([\s\S]*?)<\/ul>/g)].flatMap((m) => m[1].split("<li>").slice(1)).map(text);
    assert.ok(rows.length > 0, `${product}: key players render`);
    for (const p of nonPass) {
      const row = rows.find((r) => r.includes(p.name));
      if (row) assert.doesNotMatch(row, /\d/, `${p.name} (${p.guard.state}) prints no number`);
      assert.ok(!row, `${p.name} (${p.guard.state}) is omitted`);
    }
    for (const l of board.featured.legs) for (const p of l.players) {
      const src = FIXTURE.playerProjections.nba.find((x) => x.name === p.name && x.eventId === l.game.id);
      assert.equal(src.guard.state, "pass", `${p.name} is a guard-pass player`);
    }
  }
});

test("pages read the daily file only through the founder switch (decision b), default OFF", async () => {
  const { readSuggestedCards, PAGES_READ_DAILY_CARDS } = await import("../../lib/products/tier-board/load.ts");
  assert.equal(PAGES_READ_DAILY_CARDS, false, "committed OFF until the founder approves");
  const os = await import("node:os");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tb-"));
  fs.mkdirSync(path.join(root, "suggested-cards"));
  fs.writeFileSync(path.join(root, "suggested-cards", "2026-11-02.json"), JSON.stringify({ ...FIXTURE, fixture: false }));
  assert.equal(readSuggestedCards("2026-11-02", root), null, "switch off → no file read, Level A renders");
  assert.ok(readSuggestedCards("2026-11-02", root, true), "switch on → the day's file");
  fs.rmSync(root, { recursive: true });
});

test("shared Predicted Player Statistics: guarded (fail closed) on /bank-builder and /moonshot, unchanged on /build and everywhere else", async () => {
  const { default: LevelASuggestions } = await import("../products/level-a-suggestions.tsx");
  const proj = (playerId, name, median) => ({ eventId: "401", playerId, eventLabel: "AAA @ BBB", name, team: "BBB", availability: null, points: { median }, frozenAt: "2026-11-02T05:00:00Z" });
  const model = {
    productDay: "2026-11-02", label: "L.", method: "M.", legs: [], untiered: [], refusedByReason: {}, parlayLab: [],
    bankBuilder: { card: null, reason: "none" }, moonshot: { card: null, reason: "none" },
    nbaProjections: [proj("1", "Pass Player", 21.5), proj("2", "Review Player", 17.25), proj("3", "Blocked Player", 31.75), proj("4", "Unknown Player", 9.75)],
  };
  const guard = { "401:1": "pass", "401:2": "review", "401:3": "blocked" };
  for (const mode of ["bank-builder", "moonshot"]) {
    const t = text(html(React.createElement(LevelASuggestions, { model, mode, applyAvailabilityGuard: true, playerGuard: guard })));
    assert.match(t, /Pass Player .*21\.5/, `${mode}: the guard-pass player is listed`);
    for (const n of ["Review Player", "Blocked Player", "Unknown Player"]) assert.ok(!t.includes(n), `${mode}: ${n} is not listed`);
    for (const v of ["17.2", "17.3", "31.8", "31.7", "9.8", "9.7"]) assert.ok(!t.includes(v), `${mode}: withheld value ${v} never printed`);
    assert.match(t, /3 player projections are not listed here until they pass the player checks\./);
    const none = text(html(React.createElement(LevelASuggestions, { model, mode, applyAvailabilityGuard: true, playerGuard: null })));
    assert.ok(!/Pass Player|21\.5/.test(none), `${mode}: no guard data → nothing listed (fail closed)`);
  }
  // Unguarded (the default every other surface uses): all four, exactly as before.
  for (const mode of ["parlay-lab", "bank-builder"]) {
    const t = text(html(React.createElement(LevelASuggestions, { model, mode })));
    for (const n of ["Pass Player", "Review Player", "Blocked Player", "Unknown Player"]) assert.ok(t.includes(n), `${mode} unguarded: ${n} listed`);
    assert.doesNotMatch(t, /not listed here until/);
  }
  // Only the two product pages opt in; /build renders the shared block without the prop.
  const { execSync } = await import("node:child_process");
  const users = execSync("git grep -l applyAvailabilityGuard -- src", { encoding: "utf8" }).trim().split("\n").sort();
  assert.deepEqual(users, ["src/app/bank-builder/page.tsx", "src/app/moonshot/page.tsx", "src/components/products/level-a-suggestions.tsx", "src/components/tier-board/tier-board.test.mjs"]);
  assert.match(read("src/app/build/page.tsx"), /<LevelASuggestions model=\{[^}]+\} mode="parlay-lab" \/>/, "/build is unchanged");
});

test("rotation guard (engine a746932123): a flagged favourite reads as under review with its rotation players, never 'passed every guard'", () => {
  const board = view.tierBoardFromSuggestedCards(FIXTURE, "bank-builder", { allowFixture: true });
  const h = html(React.createElement(TierBoardSection, { board, productName: "Bank Builder" }));
  for (const leg of FIXTURE.bankBuilder.nba.card.legs.filter((l) => l.guard.state === "review")) {
    const block = text(h.split('<li class="tb-leg"').find((x) => x.includes(`data-leg="${leg.legId}"`)));
    assert.doesNotMatch(block, /passed every guard/, leg.legId);
    assert.match(block, /Eligible with review flags/);
    for (const r of leg.guard.rotationFlagged.filter((x) => x.flag !== "ROTATION_FROM_LANE")) assert.ok(block.includes(`${r.name} (${r.status})`) || /\+\d+ more/.test(block), `${leg.legId}: ${r.name}`);
  }
  assert.ok(!text(h).includes("Cody Williams"), "a guard-blocked key player is absent");
});

test("Parlay Lab: four tiers in band order, each a card or an explicit insufficient/blocked state with its reasons", async () => {
  const { default: ParlayTierBoard } = await import("./parlay-tier-board.tsx");
  const board = view.parlayTiersFromSuggestedCards(FIXTURE, { allowFixture: true });
  assert.equal(view.parlayTiersFromSuggestedCards(FIXTURE), null, "fixture refused by default");
  assert.deepEqual(board.tiers.map((t) => t.tier), ["low", "medium", "high", "longshot"]);
  for (const t of board.tiers) {
    const nba = FIXTURE.parlays.nba.find((x) => x.tier === t.tier);
    assert.equal(Boolean(t.card), Boolean(nba.card), t.tier);
    if (t.card) assert.ok(["low", "medium", "high", "longshot"].includes(t.card.tier) && t.card.tier === t.tier, `${t.tier}: card sits in its own band`);
  }
  const h = html(React.createElement(ParlayTierBoard, { board }));
  assert.match(h, /id="parlay-tiers"/);
  assert.equal((h.match(/data-parlay-tier="/g) ?? []).length, 4);
  assert.match(text(h), /Source: the frozen daily card file for 2026-11-02\./);
  // The insufficient state, explicitly, with the source's per-scope reason.
  const empty = { ...board, tiers: board.tiers.map((t, i) => (i === 2 ? { ...t, card: null, state: "insufficient", reasons: [{ scope: "nba", label: "NBA game winners card", text: "Insufficient eligible legs: only 2 games have a published probability" }] } : t)) };
  const he = html(React.createElement(ParlayTierBoard, { board: empty }));
  const high = text(he.split('data-parlay-tier="high"')[1].split('data-parlay-tier="longshot"')[0]);
  assert.match(high, /Insufficient eligible legs/);
  assert.match(high, /NBA game winners card: Insufficient eligible legs: only 2 games/);
  assert.doesNotMatch(text(he), /\$\d|[+−]\d{3}\b/, "no price or odds anywhere");
  const ids = [...h.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, "every id on the board is unique");
});

test("Level A fallback is labelled on every board; /build renders the Parlay Lab board with Level A folded beneath", async () => {
  const levelA = { productDay: "2026-11-03", parlayLab: [{ tier: "low", tierLabel: "Low Risk", card: null, reason: "a mixed card needs legs from two sports" }], bankBuilder: { card: null, reason: "x" }, moonshot: { card: null, reason: "y" } };
  const lab = view.parlayTiersFromLevelA(levelA);
  assert.equal(lab.origin, "level-a");
  assert.match(view.sourceLine(lab), /fallback/);
  const { default: ParlayTierBoard } = await import("./parlay-tier-board.tsx");
  assert.match(text(html(React.createElement(ParlayTierBoard, { board: lab }))), /Source: today.s model suggestions\. The frozen daily card file has not been published for 2026-11-03, so this is the fallback\./);
  const bb = view.tierBoardFromLevelA(levelA, "bank-builder");
  assert.match(text(html(React.createElement(TierBoardSection, { board: bb, productName: "Bank Builder" }))), /so this is the fallback/);
  const build = read("src/app/build/page.tsx");
  assert.match(build, /<ParlayTierBoard\s+board=\{loadParlayTiers\(/);
  assert.ok(build.indexOf("<ParlayTierBoard") < build.indexOf("{noCardToday ?"), "the tier board leads the page, above the MLB ladder's no-card panel");
  assert.match(build, /checks=\{levelAModel \? <LevelASuggestions model=\{levelAModel as unknown as LevelAModel\} mode="parlay-lab" \/> : null\}/);
});

test("Parlay Lab says things once: one model disclosure under the board, and shared empty-day reasons once", async () => {
  const { default: ParlayTierBoard } = await import("./parlay-tier-board.tsx");
  const board = view.parlayTiersFromSuggestedCards(FIXTURE, { allowFixture: true });
  const h = html(React.createElement(ParlayTierBoard, { board }));
  assert.equal((h.match(/data-card-disclosure=/g) ?? []).length, new Set(board.tiers.map((t) => t.card?.disclosure).filter(Boolean)).size);
  const reasons = [{ scope: "cross", label: "Mixed-sport card", text: "Insufficient eligible legs: a mixed card needs legs from two sports" }];
  const empty = { ...board, tiers: board.tiers.map((t) => ({ ...t, card: null, state: "insufficient", reasons })) };
  const he = html(React.createElement(ParlayTierBoard, { board: empty }));
  assert.equal((text(he).match(/a mixed card needs legs from two sports/g) ?? []).length, 1, "the shared reason prints once");
  assert.match(text(he), /Insufficient eligible legs for every tier today/);
  assert.equal((he.match(/data-parlay-tier-state="insufficient"/g) ?? []).length, 4, "each tier still says its state");
  // A reason that differs by tier (the NBA rule's game count) stays on its own tier; the common one still prints once.
  const mixed = { ...empty, tiers: empty.tiers.map((t, i) => ({ ...t, reasons: [...reasons, { scope: "nba", label: "NBA game winners card", text: `needs ${i + 2} games` }] })) };
  const hm = text(html(React.createElement(ParlayTierBoard, { board: mixed })));
  assert.equal((hm.match(/a mixed card needs legs from two sports/g) ?? []).length, 1);
  for (let i = 0; i < 4; i++) assert.equal((hm.match(new RegExp(`needs ${i + 2} games`, "g")) ?? []).length, 1);
});
