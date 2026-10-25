/**
 * Level A mixed-sport cards (level-a-mixed@1; docs/LEVEL_A_MIXED_SPORT_DESIGN.md, ACCEPTED FOR IMPLEMENTATION
 * 2026-10-24). Run: npx tsx --test src/lib/products/level-a/level-a-mixed.test.mjs
 * Legs marked FIXTURE are test inputs; the REAL-DATA test reads the committed lane and receipts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";

import { LEVEL_A_MIXED_POLICIES, LEVEL_A_MIXED_PUBLIC, levelAMixed, levelAMixedEnabled } from "./mixed.mjs";
import { levelACardKey } from "./engine.mjs";
import { cardCopyText, jointShownFor, levelASuggestions, tierForJoint } from "./suggestions.mjs";
import { buildLevelAModel, LEVEL_A_SERVED_SCHEMA, modelSha256 } from "./model.mjs";
import { recordEntries } from "./record.mjs";
import { gradeEntry } from "./grade.mjs";
import { PAGE_FOR, verifyServed } from "../../../../scripts/products/record-level-a-from-deployment.mjs";

globalThis.React = React;
const { default: LevelASuggestions } = await import("../../../components/products/level-a-suggestions.tsx");
const REPO = path.resolve(process.cwd(), "..");
const NOW = "2026-10-24T12:00:00Z";
const DAY = "2026-10-24";
let n = 0;
/** FIXTURE cross-sport selection (admitted by the real levelALeg). */
const sel = (sport, p, o = {}) => ({
  sport, eventId: `fx-${sport}-${++n}`, eventLabel: sport === "mlb" ? `Away${n} @ Home${n}` : `Home${n} v Away${n}`, startUtc: "2026-10-24T19:00:00Z", market: sport === "mlb" ? "winner" : "1x2",
  selection: { code: "home", label: `Club ${n} to win` }, probability: p,
  forecast: { owner: "fixture", modelId: "fx", stampedAt: "2026-10-24T08:00:00Z", ref: null }, uncertainty: null, participantStatuses: [],
  settlement: { grader: "fx", market: "1x2", side: "home" }, ...o,
});
/** FIXTURE NBA legs in the shape the NBA game-winner rule admits (exact p, the display's label and text). */
const nba = (p, i) => ({ schema: "gtp.level-a.leg@1", levelA: true, sport: "nba", eventId: `4019${String(i).padStart(5, "0")}`, eventLabel: `AW${i} @ HM${i}`, market: "winner", startUtc: "2026-10-24T23:00Z", selection: { code: "home", label: `HM${i} (official side)` }, probability: p, shownPct: `${Math.round(p * 100)}%`, label: "Elo-derived game-winner estimate", tierable: true, forecast: { owner: "nba-official-composition@1", modelId: null, stampedAt: "2026-10-24T13:16:03Z", ref: null }, settlement: { grader: "nba-settlement-contract", market: "moneyline", side: "home" }, priced: false, price: null });
const crossSport = () => levelASuggestions({ selections: [sel("mlb", 0.62), sel("epl", 0.55), sel("ligue-1", 0.48), sel("epl", 0.44)], now: NOW, productDay: DAY }).legs;
const NBA_LEGS = [nba(0.85, 1), nba(0.74, 2), nba(0.66, 3), nba(0.57, 4)];
const DISCLOSURE = "DISPLAY DISCLOSURE (a real build prints the context text)";

test("SWITCH: its own committed constant (one file), default false; only \"1\" overrides; works either way", () => {
  assert.equal(LEVEL_A_MIXED_PUBLIC, false, "mixed cards ship OFF; flipped only after a §7-style package");
  const defs = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (/\.(mjs|ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name) && /export const LEVEL_A_MIXED_PUBLIC\b/.test(fs.readFileSync(f, "utf8"))) defs.push(path.relative(process.cwd(), f)); } };
  walk(path.resolve(process.cwd(), "src"));
  assert.deepEqual(defs, ["src/lib/products/level-a/mixed.mjs"]);
  assert.equal(levelAMixedEnabled({}), LEVEL_A_MIXED_PUBLIC);
  assert.equal(levelAMixedEnabled({ NEXT_PUBLIC_LEVEL_A_MIXED: "1" }), true);
  assert.equal(levelAMixedEnabled({ NEXT_PUBLIC_LEVEL_A_MIXED: "true" }), LEVEL_A_MIXED_PUBLIC);
});

test("OFF: the Level A model is byte-identical (no key, the cross-sport cards untouched)", () => {
  const off = JSON.stringify(buildLevelAModel({ repoRoot: REPO, now: NOW, productDay: DAY, mixed: { enabled: false } }));
  assert.equal("mixed" in JSON.parse(off), false);
  const def = JSON.stringify(buildLevelAModel({ repoRoot: REPO, now: NOW, productDay: DAY }));
  assert.equal(def, LEVEL_A_MIXED_PUBLIC ? JSON.stringify(buildLevelAModel({ repoRoot: REPO, now: NOW, productDay: DAY, mixed: { enabled: true } })) : off, "the default follows the switch exactly");
});

test("ENGINE: two sports per card, distinct events, the exact D2 band of the joint, highest joint, product rules", () => {
  const m = levelAMixed({ crossSportLegs: crossSport(), nbaLegs: NBA_LEGS, disclosure: DISCLOSURE, enabled: true });
  const cards = [...m.parlayLab.map((t) => t.card), m.bankBuilder.card, m.moonshot.card].filter(Boolean);
  assert.ok(cards.length >= 3);
  for (const c of cards) {
    assert.ok(new Set(c.legs.map((l) => l.sport)).size >= 2, "a mixed card holds at least two sports");
    assert.equal(new Set(c.legs.map((l) => `${l.sport}:${l.eventId}`)).size, c.legs.length);
    assert.ok(Object.is(c.jointProbability, c.legs.reduce((p, l) => p * l.probability, 1)), "joint = product of the published probabilities");
    assert.equal(tierForJoint(c.jointProbability), c.tier);
    assert.ok(c.policy.startsWith("level-a-mixed@1/"));
    assert.deepEqual([c.priced, c.price, c.payout], [false, null, null]);
  }
  for (const t of m.parlayLab) if (t.card) assert.equal(t.card.policy, LEVEL_A_MIXED_POLICIES.parlayLab);
  assert.ok(m.bankBuilder.card.legs.length === 2 && ["low", "medium"].includes(m.bankBuilder.card.tier));
  if (m.moonshot.card) assert.ok(m.moonshot.card.tier === "longshot" && m.moonshot.card.legs.length <= 5);
  const one = levelAMixed({ crossSportLegs: [], nbaLegs: NBA_LEGS, enabled: true });
  for (const t of one.parlayLab) assert.match(t.reason, /^a mixed card needs legs from two sports; today only NBA has a leg/);
});

test("NBA LEGS: only what the NBA rule admitted (exact p, published); an untiered NBA side never enters", () => {
  const untieredNba = { ...NBA_LEGS[0], eventId: "409999999", probability: null, tierable: false };
  const m = levelAMixed({ crossSportLegs: [...crossSport(), untieredNba], nbaLegs: [NBA_LEGS[1]], enabled: true });
  for (const c of [...m.parlayLab.map((t) => t.card), m.bankBuilder.card, m.moonshot.card].filter(Boolean)) assert.ok(c.legs.every((l) => l.eventId !== "409999999"));
  const src = fs.readFileSync(path.resolve(process.cwd(), "src/lib/products/level-a/mixed.mjs"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(src, /import \{ best \} from "\.\/engine\.mjs";/, "the same engine as the NBA rule");
  assert.doesNotMatch(src.replace(/^import .*$/gm, ""), /node:fs|readFileSync|\.sim\b|\.elo\b|odds|fetch\(/);
});

test("RENDER + RECORDER: labels per leg, the disclosure once, exact card keys on all three pages; the recorder verifies and refuses a mismatch", () => {
  const answer = levelASuggestions({ selections: [sel("mlb", 0.62), sel("epl", 0.55), sel("ligue-1", 0.48)], now: NOW, productDay: DAY });
  const mixed = levelAMixed({ crossSportLegs: answer.legs, nbaLegs: NBA_LEGS, disclosure: DISCLOSURE, enabled: true });
  const model = { asOf: NOW, ...answer, parlayLab: mixed.parlayLab, bankBuilder: mixed.bankBuilder, moonshot: mixed.moonshot, mixed: { public: true, policy: mixed.policy, sports: mixed.sports, disclosure: mixed.disclosure }, refusedByReason: {}, nbaProjections: [] };
  const pages = {};
  for (const [mode, page] of [["parlay-lab", "/build/"], ["bank-builder", "/bank-builder/"], ["moonshot", "/moonshot/"]]) {
    const html = renderToString(React.createElement(LevelASuggestions, { model, mode }));
    pages[page] = html;
    const text = html.replace(/<!-- -->/g, "");
    const shown = mode === "parlay-lab" ? mixed.parlayLab.map((t) => t.card) : [mode === "bank-builder" ? mixed.bankBuilder.card : mixed.moonshot.card];
    assert.deepEqual([...html.matchAll(/data-level-a-card="([^"]+)"/g)].map((m) => m[1]), shown.filter(Boolean).map(levelACardKey), `${mode}: exactly the engine's cards`);
    for (const c of shown.filter(Boolean)) {
      assert.ok(text.includes(`model joint probability ${jointShownFor(c.jointProbability, c.tier)}`));
      for (const l of c.legs) if (l.sport === "nba") assert.ok(text.includes(`Elo-derived game-winner estimate: ${l.shownPct}`), "the NBA leg keeps its own label");
    }
    if (shown.some((c) => c?.legs.some((l) => l.sport === "nba"))) assert.equal(text.split(DISCLOSURE).length - 1, 1, `${mode}: the display's disclosure once`);
  }
  const served = { schema: LEVEL_A_SERVED_SCHEMA, public: true, asOf: NOW, productDay: DAY, model };
  served.modelSha256 = modelSha256(model);
  const sha = "a".repeat(40);
  assert.deepEqual(verifyServed({ sha, buildInfo: { builtAt: NOW, commit: { sha } }, served, pages }), { ok: true, problems: [] });
  const tampered = { ...pages, "/build/": pages["/build/"].replace(/data-level-a-card="[^"]+"/, 'data-level-a-card="other"') };
  assert.equal(verifyServed({ sha, buildInfo: { builtAt: NOW, commit: { sha } }, served, pages: tampered }).ok, false);
});

test("RECORD, GRADE, COPY: recorded under level-a-mixed@1; each leg graded by its own sport; copy keeps each leg's label", () => {
  const m = levelAMixed({ crossSportLegs: crossSport(), nbaLegs: NBA_LEGS, disclosure: DISCLOSURE, enabled: true });
  const model = { productDay: DAY, parlayLab: m.parlayLab, bankBuilder: m.bankBuilder, moonshot: m.moonshot, untiered: [] };
  const rows = recordEntries(model, { recordedAt: NOW });
  assert.ok(rows.length > 0 && rows.every((r) => r.policy.startsWith("level-a-mixed@1/")));
  const finals = { mlb: () => ({ homeRuns: 5, awayRuns: 2, isFinal: true }), soccer: () => ({ status: "FULL_TIME", homeGoalsFT: 2, awayGoalsFT: 0 }), nba: () => null };
  for (const r of rows) {
    const g = gradeEntry(r, finals);
    for (const l of g.legs) assert.equal(l.result, l.sport === "nba" ? "pending" : "win", `${l.sport}: routed to its own rule`);
    assert.equal(g.result, r.legs.some((l) => l.sport === "nba") ? "pending" : "win");
  }
  const withNba = [...m.parlayLab.map((t) => t.card), m.bankBuilder.card, m.moonshot.card].find((c) => c?.legs.some((l) => l.sport === "nba"));
  const copy = cardCopyText(withNba);
  for (const l of withNba.legs.filter((x) => x.sport === "nba")) assert.ok(copy.includes(`Elo-derived game-winner estimate: ${l.shownPct}`));
  assert.ok(copy.includes(DISCLOSURE));
  assert.match(copy, /assumes the games are independent/i);
  assert.doesNotMatch(copy, /https?:\/\/|\$\d|[+-]\d{3}\b/);
});

test("REAL DATA (committed lane + receipts): with both NBA switches and mixed on, NBA legs carry the receipts' exact p", () => {
  const m = buildLevelAModel({ repoRoot: REPO, now: NOW, productDay: DAY, mixed: { enabled: true }, nbaGameWinners: { enabled: true } });
  assert.ok(m.mixed?.public === true);
  const receipts = new Map((JSON.parse(fs.readFileSync(path.join(REPO, "data/internal/research/nba/experimental-v0.1/forecasts", `${DAY}.json`), "utf8")).games ?? []).map((g) => [String(g.providerEventId), g.forecast?.elo?.pHome]));
  for (const c of [...m.parlayLab.map((t) => t.card), m.bankBuilder.card, m.moonshot.card].filter(Boolean)) {
    assert.ok(new Set(c.legs.map((l) => l.sport)).size >= 2);
    for (const l of c.legs.filter((x) => x.sport === "nba")) {
      const pHome = receipts.get(String(l.eventId));
      assert.ok(Object.is(l.probability, l.selection.code === "home" ? pHome : 1 - pHome), `${l.eventId}: the receipt's exact number`);
    }
  }
});
