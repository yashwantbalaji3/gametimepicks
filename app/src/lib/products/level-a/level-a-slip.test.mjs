/**
 * The model-only slip (founder P1, release owner 2026-10-26): collect public Level A legs across pages; the published
 * estimate only where the canonical source publishes one; flags; a combined estimate only from distinct, fully
 * estimated, pre-cutoff legs; no price, no payout, no link; nothing internal in the browser.
 * Run: npx tsx --test src/lib/products/level-a/level-a-slip.test.mjs
 * Legs marked FIXTURE are test inputs; the REAL-DATA tests read the committed 10-26 slate.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";

import {
  LEG_FLAG, MODEL_SLIP_LABEL, MODEL_SLIP_MAX_LEGS, MODEL_SLIP_STORAGE_KEY, addSlipLegs, clearModelSlip, emptyModelSlip, modelSlipText, modelSlipView,
  parseModelSlip, readModelSlip, removeSlipLeg, reorderSlipLeg, serializeModelSlip, toSlipLeg, writeModelSlip,
} from "./slip.mjs";
import { levelASlipLegFor, publishedEstimate, slipCatalogFor, slipLegFor, slipLegOf } from "./slip-legs.mjs";
import { jointShownFor, tierForJoint } from "./suggestions.mjs";
import { buildLevelAModel } from "./model.mjs";
import { ELO_WIN_PROBABILITY_LABEL } from "../../sports/nba/elo-win-probability.mjs";

globalThis.React = React;
const { default: LevelASuggestions } = await import("../../../components/products/level-a-suggestions.tsx");
const REPO = path.resolve(process.cwd(), "..");
const NOW = Date.parse("2026-10-26T12:00:00Z");
/** FIXTURE slip legs. */
const leg = (sport, eventId, o = {}) => ({ sport, eventId, eventLabel: `A${eventId} @ H${eventId}`, teams: [`A${eventId}`, `H${eventId}`], market: "winner", outcome: { code: "home", label: `H${eventId} to win` }, startUtc: "2026-10-26T23:00:00Z", frozenAt: "2026-10-26T13:00:00Z", estimate: { value: 0.7, text: "Official Forecast 70.0%", source: "fx" }, source: "fx", ...o });

test("STORE: own key, add/dedupe/remove/reorder/clear, a leg cap, guarded storage, a bad value reads empty", () => {
  assert.equal(MODEL_SLIP_STORAGE_KEY, "gtp.slip.model.v1");
  assert.notEqual(MODEL_SLIP_STORAGE_KEY, "gtp.slip.v1");
  assert.notEqual(MODEL_SLIP_STORAGE_KEY, "gtp.slip.v2");
  let s = addSlipLegs(emptyModelSlip(), [leg("mlb", "1"), leg("mlb", "1"), leg("nba", "2")]);
  assert.equal(s.legs.length, 2, "the same leg twice is one leg");
  s = reorderSlipLeg(s, 0, 1);
  assert.deepEqual(s.legs.map((l) => l.eventId), ["2", "1"]);
  s = removeSlipLeg(s, s.legs[0].key);
  assert.deepEqual(s.legs.map((l) => l.eventId), ["1"]);
  assert.deepEqual(clearModelSlip().legs, []);
  const many = addSlipLegs(emptyModelSlip(), Array.from({ length: 20 }, (_, i) => leg("mlb", String(i))));
  assert.equal(many.legs.length, MODEL_SLIP_MAX_LEGS);
  const mem = new Map();
  const ok = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.equal(writeModelSlip(ok, s), true);
  assert.deepEqual(readModelSlip(ok).legs.map((l) => l.key), s.legs.map((l) => l.key));
  const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("quota"); } };
  assert.deepEqual(readModelSlip(broken), emptyModelSlip());
  assert.equal(writeModelSlip(broken, s), false);
  assert.deepEqual(parseModelSlip("{not json"), emptyModelSlip());
  assert.deepEqual(parseModelSlip(JSON.stringify({ version: 99, legs: [leg("mlb", "1")] })), emptyModelSlip());
  assert.doesNotMatch(serializeModelSlip(s), /"key"/, "the key is derived, not stored");
});

test("PAYLOAD: only the allowed fields survive; a non-probability estimate is dropped", () => {
  const l = toSlipLeg({ ...leg("mlb", "1"), forecast: { ref: "data/internal/x" }, price: -110, receiptPayloadSha256: "abc", grader: "g", estimate: { value: 1.4, text: "x" } });
  assert.deepEqual(Object.keys(l).sort(), ["estimate", "eventId", "eventLabel", "frozenAt", "key", "market", "outcome", "source", "sport", "startUtc", "teams"]);
  assert.equal(l.estimate, null);
  assert.doesNotMatch(JSON.stringify(l), /data\/internal|price|odds|receipt|sha|grader/i);
});

test("FLAGS: the same game twice, conflicting outcomes, started, inside the 30-minute cutoff", () => {
  const s = addSlipLegs(emptyModelSlip(), [
    leg("epl", "9", { market: "1x2", outcome: { code: "home", label: "Home" } }),
    leg("epl", "9", { market: "1x2", outcome: { code: "away", label: "Away" } }),
    leg("mlb", "5"), leg("mlb", "5", { market: "total", outcome: { code: "over", label: "Over" } }),
    leg("nba", "7", { startUtc: "2026-10-26T11:00:00Z" }), leg("nba", "8", { startUtc: "2026-10-26T12:20:00Z" }),
  ]);
  const v = modelSlipView(s, { nowMs: NOW });
  const flags = Object.fromEntries(v.rows.map((r) => [`${r.leg.sport}:${r.leg.eventId}:${r.leg.outcome.code}`, r.flags]));
  assert.deepEqual(flags["epl:9:home"], ["CONFLICTING_OUTCOME"]);
  assert.deepEqual(flags["epl:9:away"], ["CONFLICTING_OUTCOME"]);
  assert.deepEqual(flags["mlb:5:home"], ["DUPLICATE_EVENT"]);
  assert.deepEqual(flags["nba:7:home"], ["EXPIRED"]);
  assert.deepEqual(flags["nba:8:home"], ["INSIDE_CUTOFF"]);
  assert.equal(v.rows[0].flagText[0], LEG_FLAG.CONFLICTING_OUTCOME);
});

test("COMBINED: only from 2+ distinct, fully estimated, pre-cutoff legs; exact joint, D2 tier, shared text; otherwise why not", () => {
  const view = (legs) => modelSlipView(addSlipLegs(emptyModelSlip(), legs), { nowMs: NOW }).combined;
  assert.deepEqual(view([leg("mlb", "1")]), { available: false, reason: "add at least two legs from different games" });
  assert.equal(view([leg("mlb", "1"), leg("nba", "2", { estimate: null, outcome: { code: "home", label: "BOS (official side)" } })]).reason, "BOS (official side) has no published estimate");
  assert.equal(view([leg("mlb", "1"), leg("mlb", "1", { market: "total", outcome: { code: "over", label: "Over" } })]).reason, "two legs are from the same game");
  assert.equal(view([leg("mlb", "1"), leg("nba", "2", { startUtc: "2026-10-26T11:00:00Z", outcome: { code: "home", label: "X" } })]).reason, "X has started or starts within 30 minutes");
  const c = view([leg("mlb", "1", { estimate: { value: 0.62, text: "a", source: "s" } }), leg("nba", "2", { estimate: { value: 0.8, text: "b", source: "s" } })]);
  assert.equal(c.available, true);
  assert.ok(Object.is(c.joint, 0.62 * 0.8));
  assert.equal(c.tier, tierForJoint(c.joint));
  assert.equal(c.shown, jointShownFor(c.joint, c.tier));
  assert.match(c.disclosure, /^Assumes the games are independent/);
  const short = view([leg("mlb", "1", { estimate: { value: 0.9, text: "a", source: "s" } }), leg("nba", "2", { estimate: { value: 0.9, text: "b", source: "s" } })]);
  assert.deepEqual([short.tier, short.note], [null, "shorter than the Low band, so not tiered"]);
});

test("COPY: the model-only line, each leg's own estimate text or 'no published estimate', flags; no link, price or provider data", () => {
  const s = addSlipLegs(emptyModelSlip(), [leg("mlb", "1"), leg("nba", "2", { estimate: null })]);
  const text = modelSlipText(modelSlipView(s, { nowMs: NOW }));
  assert.ok(text.includes(MODEL_SLIP_LABEL));
  assert.match(text, /Official Forecast 70\.0%/);
  assert.match(text, /no published estimate/);
  assert.match(text, /No combined estimate: H2 to win has no published estimate\./);
  assert.doesNotMatch(text, /https?:\/\/|www\.|\$\d|[+-]\d{3}\b|draftkings|fanduel|betmgm|caesars/i);
});

/* ─── real data: the committed 10-26 slate ─────────────────────────────────────────────────────────────────────── */
const DAY = "2026-10-26";
const REAL_NOW = "2026-10-26T18:30:00Z";
const MODEL = buildLevelAModel({ repoRoot: REPO, now: REAL_NOW, productDay: DAY, mixed: { enabled: false } });

test("REAL DATA PAYLOAD: canonical estimates only, the display's own text for NBA; nothing internal crosses", () => {
  const gw = MODEL.nbaGameWinners;
  assert.ok(gw?.public, "the NBA game-winner tiers are live on 10-26");
  const nbaLeg = gw.legs[0];
  const s = slipLegOf(nbaLeg);
  assert.ok(Object.is(s.estimate.value, nbaLeg.probability));
  assert.equal(s.estimate.text, `${ELO_WIN_PROBABILITY_LABEL}: ${nbaLeg.shownPct}`);
  for (const mode of ["parlay-lab", "bank-builder", "moonshot"]) {
    const cat = slipCatalogFor(MODEL, mode);
    assert.ok(cat.length > 0, mode);
    const json = JSON.stringify(cat);
    for (const banned of ["data/internal", "PRIVATE_RESEARCH", "payloadSha256", "receipt", "\"ref\"", "grader", "settlement", "americanOdds", "price", "apiKey"]) assert.ok(!json.includes(banned), `${mode}: "${banned}" must not reach the browser`);
    for (const l of cat) if (l.estimate) assert.ok(l.estimate.value > 0 && l.estimate.value < 1);
  }
  const mlb = MODEL.legs.find((l) => l.sport === "mlb");
  if (mlb) assert.equal(publishedEstimate(mlb).text, `Official Forecast ${(mlb.probability * 100).toFixed(1)}%`);
  assert.equal(publishedEstimate({ sport: "nba", selection: { code: "home" }, uncertainty: { kind: "side-only" } }), null, "a side-only NBA game: no estimate, never imputed");
});

test("HUB HELPER: levelASlipLegFor returns the exact Level A leg, or null when Level A has none", async () => {
  const gwLeg = MODEL.nbaGameWinners.legs[0];
  const viaHelper = await levelASlipLegFor("nba", gwLeg.eventId, { model: MODEL });
  assert.deepEqual(viaHelper, slipLegOf(gwLeg));
  assert.deepEqual(slipLegFor(MODEL, "nba", gwLeg.eventId), viaHelper);
  assert.equal(await levelASlipLegFor("nba", "999999999", { model: MODEL }), null);
  assert.equal(await levelASlipLegFor("nfl", gwLeg.eventId, { model: MODEL }), null, "a sport Level A does not cover");
});

test("REAL DATA RENDER: every leg and card on all three pages has an Add button, 44px, labelled; the bar's catalog covers every key", () => {
  for (const mode of ["parlay-lab", "bank-builder", "moonshot"]) {
    const html = renderToString(React.createElement(LevelASuggestions, { model: MODEL, mode }));
    const buttons = [...html.matchAll(/<button[^>]*aria-label="([^"]*)"[^>]*>(Add to slip|Add card to slip|In slip · remove)<\/button>/g)];
    assert.ok(buttons.length >= 3, `${mode}: ${buttons.length} buttons`);
    for (const b of buttons) {
      assert.match(b[0], /min-height:44px/);
      assert.match(b[0], /aria-pressed="false"/, "server render: nothing is in the slip yet");
      assert.ok(b[1].length > 8, "a label a screen reader can announce");
    }
    const cards = [...html.matchAll(/>Add card to slip</g)].length;
    assert.ok(cards >= 1, `${mode}: a card-level button`);
    assert.doesNotMatch(html, /Model slip \(/, "the bar renders nothing while the slip is empty");
  }
  const catKeys = new Set(slipCatalogFor(MODEL, "parlay-lab").map((l) => l.key));
  for (const l of [...MODEL.untiered, ...MODEL.nbaGameWinners.tiers.flatMap((t) => t.card?.legs ?? [])]) if (l.selection) assert.ok(catKeys.has(slipLegOf(l).key), l.eventId);
});

test("CLIENT GRAPH: the slip island reaches no node module, no server-only Level A module and no internal path", () => {
  const APP = process.cwd();
  const read = (f) => fs.readFileSync(f, "utf8");
  const resolve = (from, spec) => {
    const base = spec.startsWith("@/") ? path.join(APP, "src", spec.slice(2)) : spec.startsWith(".") ? path.resolve(path.dirname(from), spec) : null;
    if (!base) return null;
    for (const c of [base, `${base}.ts`, `${base}.tsx`, `${base}.mjs`, `${base}.js`]) if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
    return null;
  };
  const seen = new Set();
  const stack = [path.join(APP, "src/components/products/level-a-slip.tsx")];
  const bare = new Set();
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    for (const m of read(f).matchAll(/(?:from\s+|import\s*\(\s*)["']([^"']+)["']/g)) {
      const r = resolve(f, m[1]);
      if (r) stack.push(r); else bare.add(m[1]);
    }
  }
  const rel = [...seen].map((f) => path.relative(APP, f));
  assert.deepEqual([...bare].filter((b) => b.startsWith("node:") || b === "fs" || b === "path"), [], "no node module");
  for (const f of rel) assert.doesNotMatch(f, /level-a\/(model|sources|record|grade|slip-legs|nba-game-winner-source)\.|scripts\//, `${f} is server-only`);
  for (const f of seen) assert.doesNotMatch(read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, ""), /data\/internal/, path.relative(APP, f));
});

test("BUILD YOUR OWN: the priced gate is unchanged; an empty pool points to the model slip in one sentence", () => {
  const s = fs.readFileSync(path.resolve(process.cwd(), "src/app/build/custom/page.tsx"), "utf8");
  assert.match(s, /\{pool\.length === 0 \? \(\s*<p [^>]*data-model-slip-pointer="">/);
  assert.match(s, /Model-only picks \(no prices\) can be collected in the model slip from the/);
  assert.match(s, /<BuildExperience pool=\{pool\}/, "the priced builder is untouched");
});
