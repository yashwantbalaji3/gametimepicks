/**
 * Level A model suggestions (founder policy 2026-10-23): a separate, non-transactional path.
 * Run: npx tsx --test src/lib/products/level-a/level-a.test.mjs
 * Selections below marked FIXTURE are test inputs; the committed-data checks assert invariants only.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { levelALeg, levelASuggestions, fairAmerican, tierForJoint, cardCopyText, productDayOf, POLICIES } from "./suggestions.mjs";
import { levelASources, mlbSelections, nbaSelections } from "./sources.mjs";
import { appendRecord, recordEntries, recordViolations } from "./record.mjs";
import { LEVEL_A_SUGGESTIONS_PUBLIC, levelAEnabled } from "./model.mjs";
import { LEVEL_A_DECISION_DOC, SPORT_CAPABILITIES, canEnterPredictionProducts, canShowLiveProjections, canEnterModelSuggestions, modelSuggestionOf } from "../../sport-capability-registry.ts";
import { getRiskBucketForCombinedOdds } from "../../parlays/risk-odds-bands.mjs";

globalThis.React = React;
const REPO = path.resolve(process.cwd(), "..");
const NOW = "2026-10-23T14:00:00Z";
const DAY = "2026-10-23";
/** FIXTURE selection. */
const sel = (o = {}) => ({
  sport: "epl", eventId: `fx-${Math.random().toString(36).slice(2, 8)}`, eventLabel: "Home v Away", startUtc: "2026-10-23T19:00:00Z", market: "1x2",
  selection: { code: "home", label: "Home to win" }, probability: 0.6,
  forecast: { owner: "fixture", modelId: "fx", stampedAt: "2026-10-23T08:00:00Z", ref: null }, uncertainty: null, participantStatuses: [],
  settlement: { grader: "soccer-1x2-official-final", market: "1x2", side: "home" }, ...o,
});

test("REGISTRY: Level A is its own axis; Level B (canEnterPredictionProducts) and the existing states are unchanged", () => {
  const levelB = Object.fromEntries(SPORT_CAPABILITIES.map((c) => [c.key, canEnterPredictionProducts(c.key)]));
  assert.deepEqual(Object.entries(levelB).filter(([, v]) => v).map(([k]) => k), ["mlb"], "only MLB is Level B, as before");
  assert.equal(SPORT_CAPABILITIES.find((c) => c.key === "nba").state, "HISTORICAL_ONLY", "NBA's state is not repurposed");
  assert.equal(canShowLiveProjections("nba"), false);
  for (const k of ["mlb", "nba", "epl", "ligue-1"]) assert.equal(canEnterModelSuggestions(k), true, k);
  for (const k of ["ufc", "nfl", "soccer", "nhl", "unknown-sport"]) assert.equal(canEnterModelSuggestions(k), false, k);
  assert.equal(modelSuggestionOf("nba").probabilityPublished, false, "NBA's official composition withholds the win probability");
});

test("LEG GATES: closed sport, timing, freezing, probability, availability and product day each refuse", () => {
  const r = (o) => levelALeg(sel(o), { now: NOW, productDay: DAY });
  assert.deepEqual(r({ sport: "ufc" }).refusal.reasons, ["SPORT_CLOSED"]);
  assert.ok(r({ startUtc: "2026-10-23T13:00:00Z" }).refusal.reasons.includes("EVENT_STARTED"));
  assert.ok(r({ startUtc: "2026-10-23T14:20:00Z" }).refusal.reasons.includes("INSIDE_CUTOFF"));
  assert.ok(r({ forecast: { owner: "f", modelId: null, stampedAt: "2026-10-23T19:30:00Z", ref: null } }).refusal.reasons.includes("FORECAST_NOT_FROZEN"));
  assert.ok(r({ probability: 1.2 }).refusal.reasons.includes("BAD_PROBABILITY"));
  assert.ok(r({ participantStatuses: ["Questionable"] }).refusal.reasons.includes("UNAVAILABLE"));
  assert.ok(r({ startUtc: "2026-10-25T19:00:00Z" }).refusal.reasons.includes("OTHER_PRODUCT_DAY"));
  assert.equal(productDayOf("2026-10-24T00:30:00Z"), "2026-10-23", "a 00:30Z start belongs to the previous ET evening");
  const ok = r({});
  assert.equal(ok.ok, true);
  assert.equal(ok.leg.priced, false);
  assert.equal(ok.leg.price, null);
});

test("NBA (probability withheld): a valid official side, never tiered, never in any card", () => {
  const nba = sel({ sport: "nba", market: "winner", selection: { code: "home", label: "MIL (official side)" }, probability: 0.63 });
  const legs = [nba, sel({ probability: 0.7 }), sel({ probability: 0.72 }), sel({ probability: 0.4 })];
  const out = levelASuggestions({ selections: legs, now: NOW, productDay: DAY });
  assert.equal(out.untiered.length, 1);
  assert.equal(out.untiered[0].probability, null, "even if a reader passed one, the withheld probability is dropped");
  const cards = [...out.parlayLab.map((t) => t.card), out.bankBuilder.card, out.moonshot.card].filter(Boolean);
  assert.ok(cards.length > 0);
  for (const c of cards) assert.ok(c.legs.every((l) => l.sport !== "nba"), "no NBA leg in a tiered card");
});

test("TIER RULE: the founder-approved D2 bands on the model-fair price of the joint probability; distinct events only", () => {
  for (const [p, tier] of [[0.55, "low"], [0.5, "low"], [0.3, "medium"], [0.2, "high"], [0.1, "longshot"], [0.7, null]]) {
    assert.equal(tierForJoint(p), tier, String(p));
    assert.equal(tierForJoint(p), getRiskBucketForCombinedOdds(fairAmerican(p)));
  }
  const same = sel({ eventId: "same" });
  const out = levelASuggestions({ selections: [same, { ...same, selection: { code: "away", label: "Away" }, probability: 0.3 }, sel({ probability: 0.8 })], now: NOW, productDay: DAY });
  assert.equal(out.legs.filter((l) => l.eventId === "same").length, 1, "one leg per event");
  for (const t of out.parlayLab) if (t.card) {
    assert.equal(new Set(t.card.legs.map((l) => l.eventId)).size, t.card.legs.length);
    assert.equal(t.card.tier, t.tier);
    assert.ok(Math.abs(t.card.jointProbability - t.card.legs.reduce((p, l) => p * l.probability, 1)) < 1e-4);
  }
});

test("PRODUCT POLICIES: Bank Builder 2 legs in Low/Medium; Moonshot 3 legs in High/Longshot; empty states say why", () => {
  const legs = [0.82, 0.75, 0.6, 0.55, 0.45, 0.4].map((p) => sel({ probability: p }));
  const out = levelASuggestions({ selections: legs, now: NOW, productDay: DAY });
  assert.equal(out.bankBuilder.card.legs.length, 2);
  assert.ok(["low", "medium"].includes(out.bankBuilder.card.tier));
  assert.equal(out.bankBuilder.card.policy, POLICIES.bankBuilder.id);
  assert.equal(out.moonshot.card.legs.length, 3);
  assert.ok(["high", "longshot"].includes(out.moonshot.card.tier));
  const thin = levelASuggestions({ selections: [sel()], now: NOW, productDay: DAY });
  assert.match(thin.bankBuilder.reason, /only 1 leg with a published probability/);
  assert.match(thin.moonshot.reason, /Moonshot needs 3 games/);
  for (const t of thin.parlayLab) assert.equal(t.card, null);
});

test("NOT A PRICE: no price, odds, payout or link anywhere in a Level A answer or its copy text", () => {
  const out = levelASuggestions({ selections: [0.7, 0.6, 0.45].map((p) => sel({ probability: p })), now: NOW, productDay: DAY });
  const json = JSON.stringify(out);
  assert.doesNotMatch(json, /"(americanOdds|overAmerican|underAmerican|odds|book|bookmaker|ev|edge)":/);
  assert.match(json, /"price":null/);
  for (const t of out.parlayLab) if (t.card) {
    assert.equal(t.card.payout, null);
    const text = cardCopyText(t.card);
    assert.doesNotMatch(text, /https?:\/\/|www\.|\$\d|[+-]\d{3}\b/);
    assert.match(text, /no price/);
  }
});

test("READERS on the committed forecasts (invariants): MLB never reads the market block; NBA probability is always null; soccer pick = the top 1X2 outcome", () => {
  const src = fs.readFileSync(path.resolve(process.cwd(), "src/lib/products/level-a/sources.mjs"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(src, /\.market\b(?!:)/, "the MLB snapshot's sportsbook `market` block is never read");
  for (const s of mlbSelections({ repoRoot: REPO, date: DAY })) assert.ok(s.probability == null || (s.probability > 0 && s.probability < 1));
  const laneDir = path.join(REPO, "app/public/data/nba/experimental-public");
  const laneDays = fs.readdirSync(laneDir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => f.slice(0, 10));
  assert.ok(laneDays.length > 0, "at least one published NBA lane day to check against");
  assert.deepEqual(nbaSelections({ repoRoot: REPO, date: "1999-01-01" }), { selections: [], projections: [] }, "no lane file for the day, no NBA");
  for (const d of laneDays) {
    const lane = JSON.parse(fs.readFileSync(path.join(laneDir, `${d}.json`), "utf8"));
    const n = nbaSelections({ repoRoot: REPO, date: d });
    assert.equal(n.selections.length, lane.games.length, d);
    for (const s of n.selections) {
      assert.equal(s.probability, null);
      const g = lane.games.find((x) => String(x.providerEventId) === s.eventId);
      assert.equal(s.selection.label, `${g.elo.favoured} (official side)`, "the side is the lane's published Elo side, verbatim");
      assert.equal(s.forecast.stampedAt, g.frozenAt);
    }
    for (const p of n.projections) assert.deepEqual(Object.keys(p.points), ["median"], "the lane withholds ranges; Level A shows none");
  }
  for (const s of levelASources({ repoRoot: REPO, date: DAY }).selections.filter((x) => x.market === "1x2")) {
    const u = s.uncertainty;
    assert.equal(s.probability, Math.max(u.home, u.draw, u.away), s.eventId);
  }
});

test("RECORD: append-only, no price, never after the first leg starts; a later different card is a revision", () => {
  const out = levelASuggestions({ selections: [0.7, 0.6, 0.45, 0.4].map((p) => sel({ probability: p })), now: NOW, productDay: DAY });
  const first = appendRecord([], recordEntries(out, { recordedAt: NOW }));
  assert.ok(first.length > 0);
  assert.equal(appendRecord(first, recordEntries(out, { recordedAt: NOW })).length, 0, "identical entries are not written twice");
  assert.equal(appendRecord([], recordEntries(out, { recordedAt: "2026-10-23T20:00:00Z" })).length, 0, "nothing is recorded after its first leg starts");
  const text = first.map((e) => `${JSON.stringify(e)}\n`).join("");
  assert.deepEqual(recordViolations({ beforeText: "", afterText: text }), []);
  assert.ok(recordViolations({ beforeText: "", afterText: text.replace('"price":null', '"price":-110') }).length > 0);
  const other = levelASuggestions({ selections: [0.71, 0.61, 0.46, 0.41].map((p) => sel({ probability: p })), now: NOW, productDay: DAY });
  const rev = appendRecord(first, recordEntries(other, { recordedAt: NOW }));
  assert.ok(rev.some((e) => e.revisionOf), "a different card for the same slot points at what it revises");
});

test("RENDER: the section shows the Official Forecast's pick and source, never a price or payout; pages gate it on the flag", async () => {
  const { default: LevelASuggestions } = await import("../../../components/products/level-a-suggestions.tsx");
  const out = levelASuggestions({ selections: [0.7, 0.6, 0.45].map((p) => sel({ probability: p })), now: NOW, productDay: DAY });
  const html = renderToStaticMarkup(React.createElement(LevelASuggestions, { model: { ...out, refusedByReason: {}, nbaProjections: [] }, mode: "parlay-lab" }));
  assert.match(html, /Model suggestions · 2026-10-23/);
  assert.match(html, /no sportsbook price/);
  assert.doesNotMatch(html, /\$\d|payout:|odds [+-]\d|href="https?:/);
  for (const f of ["src/app/bank-builder/page.tsx", "src/app/moonshot/page.tsx", "src/app/build/page.tsx"]) {
    const s = fs.readFileSync(path.resolve(process.cwd(), f), "utf8");
    assert.match(s, /^const LEVEL_A = levelAEnabled\(\);$/m, f);
    const gate = s.includes("{LEVEL_A ? <LevelASuggestions ") ? "{LEVEL_A ?" : "{levelAModel ?";
    assert.ok(s.includes(`${gate} <LevelASuggestions `), f);
    if (gate === "{levelAModel ?") assert.match(s, /const levelAModel = LEVEL_A \? buildLevelAModel\(\) : null;/, `${f}: the page's one Level A model exists only under the switch`);
    assert.doesNotMatch(s.slice(s.indexOf(gate) - 200, s.indexOf(gate)), /PARLAY_LAB_V2|v2Model \?/, `${f}: Level A renders under its own switch, not inside Parlay Lab V2`);
  }
});

test("WRITER: the record script is the one writer, offline, and writes no price", async () => {
  const { runRecord } = await import("../../../../scripts/products/record-level-a-suggestions.mjs");
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "levela-")), "s.jsonl");
  const r1 = runRecord({ now: NOW, day: DAY, write: true, file: tmp });
  const r2 = runRecord({ now: NOW, day: DAY, write: true, file: tmp });
  assert.equal(r2.added, 0, "re-running appends nothing");
  if (r1.added) assert.deepEqual(recordViolations({ beforeText: "", afterText: fs.readFileSync(tmp, "utf8") }), []);
  const script = fs.readFileSync(path.resolve(process.cwd(), "scripts/products/record-level-a-suggestions.mjs"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(script, /\bfetch\(|https?:\/\/|ODDS_API_KEY/);
});

test("SWITCH: one committed constant in level-a/model.mjs (flipped on in Release F); the env var is only an extra override", () => {
  // Release owner flip, Release F 2026-10-23, after acceptance (founder decision docs/decisions/2026-10-23-LEVEL-A-MODEL-SUGGESTIONS.md).
  // Rollback = set it back to false here and in model.mjs.
  assert.equal(LEVEL_A_SUGGESTIONS_PUBLIC, true, "Level A is public after release-owner acceptance (Release F 2026-10-23)");
  const hits = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (/\.(mjs|ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name) && /export const LEVEL_A_SUGGESTIONS_PUBLIC\b/.test(fs.readFileSync(f, "utf8"))) hits.push(path.relative(process.cwd(), f)); } };
  walk(path.resolve(process.cwd(), "src"));
  assert.deepEqual(hits, ["src/lib/products/level-a/model.mjs"], "the switch is defined in exactly one file");
  assert.equal(levelAEnabled({}), LEVEL_A_SUGGESTIONS_PUBLIC, "with no override the constant decides");
  assert.equal(levelAEnabled({ NEXT_PUBLIC_LEVEL_A_SUGGESTIONS: "1" }), true);
  assert.equal(levelAEnabled({ NEXT_PUBLIC_LEVEL_A_SUGGESTIONS: "true" }), LEVEL_A_SUGGESTIONS_PUBLIC, "only exactly \"1\" overrides; anything else leaves the constant in charge");
});

test("DECISION: the registry cites the founder's verbatim Level A text, and the file exists", () => {
  assert.equal(LEVEL_A_DECISION_DOC, "docs/decisions/2026-10-23-LEVEL-A-MODEL-SUGGESTIONS.md");
  const doc = fs.readFileSync(path.join(REPO, LEVEL_A_DECISION_DOC), "utf8");
  assert.match(doc, /LEVEL A — MODEL-SUGGESTED PICKS AND PARLAYS/);
});

test("DISCLOSURE: every card and its copy text say the games are assumed independent; NBA says why it is untiered", () => {
  const out = levelASuggestions({ selections: [0.7, 0.6, 0.45, 0.4, 0.35].map((p) => sel({ probability: p })).concat(sel({ sport: "nba", market: "winner", probability: null })), now: NOW, productDay: DAY });
  const cards = [...out.parlayLab.map((t) => t.card), out.bankBuilder.card, out.moonshot.card].filter(Boolean);
  assert.ok(cards.length > 0);
  for (const c of cards) {
    assert.match(c.dependency, /assumes the games are independent/i);
    assert.match(cardCopyText(c), /assumes the games are independent/i);
  }
  assert.match(out.untiered[0].probabilityNote, /^Untiered: no published NBA win probability/);
});
