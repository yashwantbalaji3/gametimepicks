/**
 * v1.7 · F1 = Option A (founder decision 2026-09-22) — MARKET CONSTRUCTIONS ARE LABELLED AS SUCH.
 *
 * Bank Builder and Moonshot admit legs whose only probability is one bookmaker's de-vigged price.
 * Under Option A they keep doing so, but every surface must present them as market constructions —
 * "what the prices imply, not a prediction" — never as GameTimePicks model selections. This guard
 * pins the contract end to end:
 *   1. the published leg schema carries `probabilityBasis` (+ `impliedProbability`, the honest name
 *      for the number `modelConfidence` used to carry), derived from `probabilitySource` and never
 *      assumed — an unknown source is null, and null is never labelled "model";
 *   2. the read side resolves the basis for a day published BEFORE the field existed (the P257 carry
 *      keeps a placed day verbatim), so the chip renders on today's artifact without a regeneration;
 *   3. the Play surfaces render the "Market-implied" chip / "Market construction" label and no longer
 *      attribute a leg, a card or a no-play to "the model";
 *   4. mutation probe: a fixture leg with basis "market-implied" renders the market label and never a
 *      model label; an unknown basis renders no label at all.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { probabilityBasisOf, jointProbabilityBasisOf } from "../daily-portfolio/accounting.ts";
import { buildDailyPortfolio } from "../mr-dub/daily-portfolio.ts";

/* Same mount pattern as uiux/busiest-state.test.mjs: the component tree compiles against the classic
   runtime under tsx, and a .tsx module's default export arrives nested. */
globalThis.React = React;
const unwrap = (m) => m.default?.default ?? m.default;
const ladderMod = await import("../../components/ladders/product-lanes-ladder.tsx");
const chipMod = await import("../../components/products/probability-basis-chip.tsx");
const ProductLanesLadder = unwrap(ladderMod);
const ProbabilityBasisChip = unwrap(chipMod);
const { MarketConstructionLabel, MARKET_IMPLIED_CHIP, MARKET_CONSTRUCTION_LABEL } = chipMod.default?.MarketConstructionLabel ? chipMod.default : chipMod;

const APP = path.resolve(new URL(".", import.meta.url).pathname, "..", "..", "..");
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

/* ── 1. schema ───────────────────────────────────────────────────────────────────────────────── */

test("probabilityBasis is DERIVED from the source and never assumed", () => {
  assert.equal(probabilityBasisOf("market-devigged"), "market-implied");
  assert.equal(probabilityBasisOf("model"), "model");
  for (const unknown of [undefined, null, "", "consensus", "MARKET", 0]) assert.equal(probabilityBasisOf(unknown), null, `${String(unknown)} → null`);
  assert.equal(jointProbabilityBasisOf([{ probabilityBasis: "market-implied" }, { probabilityBasis: "market-implied" }]), "market-implied");
  assert.equal(jointProbabilityBasisOf([{ probabilityBasis: "model" }, { probabilityBasis: "model" }]), "model");
  assert.equal(jointProbabilityBasisOf([{ probabilityBasis: "model" }, { probabilityBasis: "market-implied" }]), "mixed");
  assert.equal(jointProbabilityBasisOf([{ probabilityBasis: "market-implied" }, {}]), null, "one unknown leg → the card's basis is unknown, not market-implied");
  assert.equal(jointProbabilityBasisOf([]), null);
});

test("the generator's leg shape carries probabilityBasis + impliedProbability and keeps modelConfidence only as a deprecated alias", () => {
  const src = read("src/lib/daily-portfolio/accounting.ts");
  const toLeg = src.slice(src.indexOf("const toLeg = "), src.indexOf("/** Map a Bank Builder GeneratedLane"));
  assert.match(toLeg, /probabilityBasis = probabilityBasisOf\(probabilitySource\)/, "basis derived from the source");
  assert.match(toLeg, /impliedProbability: probabilityBasis === "market-implied" \? p\.modelProbability : null/, "the honest name carries the market number");
  assert.match(toLeg, /probabilityBasis, probabilitySource,/);
  assert.match(src, /@deprecated \(F1 Option A\)/, "modelConfidence is marked deprecated, not silently renamed (settled receipts and the settlement reader still read it)");
  assert.match(src, /jointProbabilityBasis: jointProbabilityBasisOf\(g\.legs\.map\(toLeg\)\)/, "Bank Builder lanes carry the card-level basis");
  assert.match(src, /jointProbabilityBasis: jointProbabilityBasisOf\(legs\.map\(toLeg\)\)/, "Moonshot lanes carry the card-level basis");
  /* the approved-lane path records no source → null, never "model" */
  assert.match(src, /probabilityBasis: probabilityBasisOf\(leg\.probabilitySource\)/);
  /* the market-priced pool self-describes, so the derivation has a real input */
  assert.match(read("src/lib/daily-portfolio/mlb-team-legs.ts"), /probabilitySource: "market-devigged"/);
  /* the settlement reader prefers the honest name */
  assert.match(read("src/lib/settlement/daily-portfolio-settle.ts"), /dpLeg\.impliedProbability \?\? dpLeg\.modelConfidence/);
});

/* ── 2. read side ────────────────────────────────────────────────────────────────────────────── */

const leg = (extra = {}) => ({ id: "MLB:abc:mlb_moneyline:Texas_Rangers_to_win", matchup: "New York Mets @ Texas Rangers", market: "Moneyline", selection: "Texas Rangers to win", player: null, odds: -149, provider: "draftkings", modelConfidence: 0.5716, kickoffEt: "8:05 PM ET", risk: "Higher-volatility", photoUrl: null, teamLogo: null, ...extra });
const lane = (legs, extra = {}) => ({ id: "bank-builder-lane-a-step-1", product: "bank-builder", productLabel: "Bank Builder", lane: "A", step: 1, clearedSteps: 0, status: "active", stake: 100, exposure: 100, targetReturn: 200, fitsTarget: true, combinedOdds: 194, combinedDecimal: 2.94, potentialReturn: 294, legCount: legs.length, targetLegs: 2, legs, correlationNote: null, shortfallNote: null, whyThisCard: [], activationEligibility: { eligible: true, reason: "" }, ...extra });

function tempRoot(lanes) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-basis-"));
  fs.mkdirSync(path.join(root, "mr-dub"), { recursive: true });
  fs.writeFileSync(path.join(root, "mr-dub", "portfolio.json"), JSON.stringify({ currentBankroll: 1000, crownBankroll: 20465.4, record: { wins: 0, losses: 0, voids: 0, pending: 0 } }));
  fs.writeFileSync(path.join(root, "mr-dub", "daily-portfolio.json"), JSON.stringify({ version: "daily-portfolio-v1", date: "2026-09-22", generatedAt: "2026-09-22T15:30:00Z", activeBankroll: 1000, crownBankroll: 20465.4, openExposure: 100, availableBankroll: 900, potentialReturn: 294, products: { bankBuilder: { exposure: 100, record: {} }, moonshot: { exposure: 0, record: {} } }, lanes, settlement: { status: "pending", realizedPnl: 0 }, note: "" }));
  return root;
}

test("a day published BEFORE the field existed resolves its basis from probabilitySource (the P257 carry keeps a placed day verbatim)", () => {
  const root = tempRoot([
    lane([leg({ probabilitySource: "market-devigged" }), leg({ id: "MLB:def:mlb_total_runs:Over_8", selection: "Over 8", market: "Total runs", probabilitySource: "market-devigged" })]),
    lane([leg({ probabilitySource: "market-devigged" }), leg({ id: "MLB:ghi:mlb_run_line:x", selection: "Detroit Tigers +1.5", market: "Run line" })], { id: "bank-builder-lane-b-step-1", lane: "B" }),
    lane([leg({ probabilityBasis: "model", probabilitySource: "model" }), leg({ id: "MLB:jkl:m:x", probabilityBasis: "bogus" })], { id: "moonshot-lane-a-step-1", product: "moonshot", productLabel: "Moonshot" }),
  ]);
  const dp = buildDailyPortfolio(root, "2026-09-22T16:00:00Z", "2026-09-22");
  const [a, b, m] = dp.cards;
  assert.deepEqual(a.legs.map((l) => l.probabilityBasis), ["market-implied", "market-implied"]);
  assert.equal(a.jointProbabilityBasis, "market-implied");
  assert.deepEqual(b.legs.map((l) => l.probabilityBasis), ["market-implied", null], "no source recorded → null, not assumed");
  assert.equal(b.jointProbabilityBasis, null, "one unknown leg → the card is not labelled a market construction");
  assert.deepEqual(m.legs.map((l) => l.probabilityBasis), ["model", null], "a published value outside the closed set is ignored, never trusted");
  assert.equal(m.jointProbabilityBasis, null);
});

test("today's committed daily portfolio: every leg resolves a non-null basis through the reader (no regeneration required)", () => {
  const raw = JSON.parse(read("public/data/mr-dub/daily-portfolio.json"));
  const dp = buildDailyPortfolio(path.join(APP, "public", "data"), `${raw.date}T16:00:00Z`, raw.date);
  const legs = dp.cards.flatMap((c) => c.legs);
  for (const l of legs) assert.ok(l.probabilityBasis === "market-implied" || l.probabilityBasis === "model", `${l.selection}: basis ${String(l.probabilityBasis)}`);
  for (const c of dp.cards.filter((c) => c.legs.length)) assert.ok(c.jointProbabilityBasis === "market-implied" || c.jointProbabilityBasis === "model" || c.jointProbabilityBasis === "mixed", `${c.id}: card basis ${String(c.jointProbabilityBasis)}`);
  /* the published leg either carries the field or the source it is derived from */
  for (const l of raw.lanes.flatMap((x) => x.legs ?? [])) assert.ok(l.probabilityBasis || l.probabilitySource, `${l.id} carries neither probabilityBasis nor probabilitySource`);
});

/* ── 3. surfaces ─────────────────────────────────────────────────────────────────────────────── */

const LANE_SURFACES = ["src/components/ladders/product-lanes-ladder.tsx", "src/components/mr-dub/daily-portfolio-section.tsx"];
const PLAY_SURFACES = [
  "src/app/bank-builder/page.tsx", "src/app/moonshot/page.tsx", "src/app/mr-dub/page.tsx",
  ...LANE_SURFACES,
  "src/components/bank-builder/bank-builder-skipped-card.tsx", "src/components/bank-builder/climb-hero.tsx", "src/components/bank-builder/ladder-v2.tsx",
  "src/components/products/eligible-universe.tsx", "src/components/products/probability-basis-chip.tsx",
  "src/lib/daily-portfolio/accounting.ts", "src/lib/daily-portfolio/bank-builder-generation.ts", "src/lib/moonshot/rung-card.mjs",
];
/** Wording that attributes a market-priced leg, card or no-play to a model. */
const MODEL_ATTRIBUTION = [/model confidence/i, /model-qualified legs/i, /the model holds/i, /model pass\b/i, /model bar\b/i, /model discipline/i, /the model skips/i, /model skipped/i, /the model's ladder/i, /the model is holding/i, /combined hit probability/i, /avg leg confidence/i, /\bmodel \$\{Math\.round/];

test("the lane renderers mount the basis chip per leg and the market-construction label per card", () => {
  for (const rel of LANE_SURFACES) {
    const src = read(rel);
    assert.match(src, /import ProbabilityBasisChip, \{ MarketConstructionLabel \} from "@\/components\/products\/probability-basis-chip"/, rel);
    assert.match(src, /<ProbabilityBasisChip basis=\{leg\.probabilityBasis\} \/>/, `${rel} renders the per-leg chip`);
    assert.match(src, /<MarketConstructionLabel basis=\{card\.jointProbabilityBasis\} \/>/, `${rel} renders the card label`);
    assert.match(stripComments(src), /No eligible legs available/, `${rel} empty state names eligibility, not a model`);
  }
});

test("no Play surface, generator string or no-play reason attributes a market-priced leg to the model", () => {
  for (const rel of PLAY_SURFACES) {
    const src = stripComments(read(rel));
    for (const re of MODEL_ATTRIBUTION) assert.ok(!re.test(src), `${rel} contains ${re}`);
  }
  /* the exact strings that changed, pinned to their truthful replacements */
  const gen = stripComments(read("src/lib/daily-portfolio/bank-builder-generation.ts"));
  assert.match(gen, /a market-implied \$\{Math\.round\(hitProb \* 100\)\}% chance that every leg lands at \$\{tierLabel\(tier\)\} \(what the prices imply, not a forecast\)/);
  assert.match(gen, /avg market-implied leg probability \$\{avgConf\}%/);
  assert.match(gen, /fewer than 2 eligible legs available/i);
  assert.match(stripComments(read("src/lib/moonshot/rung-card.mjs")), /best market-implied chance of both landing \(\$\{pct\}% — what the prices imply, not a forecast\)/);
  assert.match(stripComments(read("src/lib/daily-portfolio/accounting.ts")), /fewer than 2 eligible legs — awaiting a full card/);
  assert.match(stripComments(read("src/app/today/page.tsx")), /No card reaches this step's price today — the ladder holds rather than force a play\./);
  assert.match(stripComments(read("src/components/mr-dub/daily-portfolio-section.tsx")), /No 2-leg team-market combo on today's slate reaches this step's price/);
  assert.match(stripComments(read("src/components/bank-builder/bank-builder-skipped-card.tsx")), /`market-implied \$\{Math\.round\(a\.modelProbability \* 100\)\}%`/);
});

/* ── 4. mutation probe ───────────────────────────────────────────────────────────────────────── */

/* Fixture teams that resolve to NO club mark on purpose: the crest component is a "use client" tree
   that the test renderer cannot mount, and the leg row (chip included) is identical on the ⚾ path. */
const card = (basis, joint) => ({
  id: "bank-builder-lane-a-step-1", product: "bank-builder", productLabel: "Bank Builder", lane: "A", step: 1, clearedSteps: 0, status: "active", stake: 100, targetReturn: 200, combinedOdds: 194, potentialReturn: 294, legCount: 2, targetLegs: 2,
  legs: [
    { id: "MLB:abc:mlb_total_runs:x", selection: "Over 8", marketLabel: "Total runs", matchup: "Fixture Away @ Fixture Home", odds: -149, player: null, probabilityBasis: basis },
    { id: "MLB:def:mlb_total_runs:y", selection: "Under 7.5", marketLabel: "Total runs", matchup: "Probe Away @ Probe Home", odds: -110, player: null, probabilityBasis: basis },
  ],
  correlationNote: null, shortfallNote: null, jointProbabilityBasis: joint,
});
const renderLadder = (c) => renderToStaticMarkup(React.createElement(ProductLanesLadder, { productLabel: "Bank Builder", product: "bank-builder", lanes: [c], accent: "gold" }));
const text = (html) => html.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/g, " ");

test("mutation probe · a market-implied leg renders the market label, never a model label; an unknown basis renders none", () => {
  const market = renderLadder(card("market-implied", "market-implied"));
  assert.equal((text(market).match(new RegExp(MARKET_IMPLIED_CHIP, "g")) ?? []).length, 2, "one chip per leg");
  assert.match(text(market), new RegExp(MARKET_CONSTRUCTION_LABEL));
  assert.match(text(market), /what the prices imply, not a prediction/);
  assert.doesNotMatch(text(market), /\bmodel\b/i, "no model wording anywhere on a market-constructed card");

  const unknown = renderLadder(card(null, null));
  assert.doesNotMatch(text(unknown), new RegExp(MARKET_IMPLIED_CHIP));
  assert.doesNotMatch(text(unknown), new RegExp(MARKET_CONSTRUCTION_LABEL));
  assert.doesNotMatch(text(unknown), /\bmodel\b/i, "an unknown basis is never labelled model");

  /* the chip itself, in isolation — the closed set is the whole vocabulary */
  assert.match(renderToStaticMarkup(React.createElement(ProbabilityBasisChip, { basis: "market-implied" })), />Market-implied</);
  assert.match(renderToStaticMarkup(React.createElement(ProbabilityBasisChip, { basis: "model" })), />Model</);
  assert.equal(renderToStaticMarkup(React.createElement(ProbabilityBasisChip, { basis: null })), "");
  assert.equal(renderToStaticMarkup(React.createElement(ProbabilityBasisChip, { basis: "bogus" })), "");
  assert.equal(renderToStaticMarkup(React.createElement(MarketConstructionLabel, { basis: "mixed" })), "", "a mixed card is not called a market construction");
  assert.equal(renderToStaticMarkup(React.createElement(MarketConstructionLabel, { basis: "model" })), "");
});
