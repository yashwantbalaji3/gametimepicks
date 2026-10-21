/**
 * Smart Betslip · handoff capability matrix, the link gates, and the rendered "Compare sportsbook odds" surface.
 * Run from app/: npx tsx --test src/lib/slip/compare-ui.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  CAPABILITY_MATRIX, HANDOFF, CLAIM, TERMS_PERMIT_SPORTSBOOK_LINKS, HANDOFF_LINKS_FLAG, MATRIX_COVERS_ALLOWLIST, MATRIX_DOC,
  handoffFor, handoffLinks, handoffLinksEnabled,
} from "./handoff-capability.mjs";
import { ELIGIBLE_OPERATOR_KEYS, KNOWN_OFFSHORE_KEYS } from "../sports/odds/eligible-operators.mjs";
import { parseNbaPropResponses } from "../sports/odds/nba-props/parse.mjs";
import { SCHEDULE, rosterFor, EVENT_1, ok } from "../sports/odds/nba-props/__fixtures__/event-odds.fixture.mjs";
import { slipFromCard } from "./smart-slip.mjs";

globalThis.React = React;
const { default: SportsbookOddsCompare } = await import("../../components/slip/SportsbookOddsCompare.tsx");
const { default: SmartBetslip } = await import("../../components/parlays/v2/SmartBetslip.tsx");

const APP = process.cwd();
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const NOW_MS = Date.parse("2026-10-22T22:05:00.000Z");
const SOURCES = ["src/lib/slip/handoff-capability.mjs", "src/lib/slip/odds-comparison.mjs", "src/components/slip/SportsbookOddsCompare.tsx", "src/components/parlays/v2/SmartBetslip.tsx"];
const SPORTSBOOK_URL = /https?:\/\/|www\.|\b(?:draftkings|fanduel|betmgm|caesars|betrivers|fanatics|espnbet|betparx|thescore)\.[a-z]{2,}|addToBetslip|betslip\?/i;

const { records } = parseNbaPropResponses([ok(EVENT_1)], { schedule: SCHEDULE, rosterFor });
const LEGS = [
  { sport: "nba", eventId: "900000001", playerId: "9100001", family: "pts", side: "over", line: 24.5, game: "BOS @ NYK", player: "Fixture Guard One", marketLabel: "Points" },
  { sport: "nba", eventId: "900000001", playerId: "9100003", family: "pts", side: "under", line: 18.5, game: "BOS @ NYK", player: "Fixture Big Three", marketLabel: "Points" },
];

test("capability matrix: one row per eligible operator, every capability MANUAL_ENTRY, no template, every claim labelled", () => {
  assert.equal(MATRIX_COVERS_ALLOWLIST, true);
  for (const k of ELIGIBLE_OPERATOR_KEYS) {
    const h = handoffFor(k);
    assert.equal(h.capability, HANDOFF.MANUAL_ENTRY, k);
    assert.equal(h.label, "Enter these legs yourself at the sportsbook");
    assert.equal(h.source, MATRIX_DOC);
  }
  for (const [k, row] of Object.entries(CAPABILITY_MATRIX)) {
    assert.equal(row.operatorTemplate, null, `${k}: no verified operator template exists`);
    assert.equal(row.multiLegPrefill.status, CLAIM.UNVERIFIED, `${k}: multi-leg prefill is undocumented everywhere`);
    for (const f of ["marketDeepLink", "singleLegPrefill", "multiLegPrefill", "affiliate", "geo"]) assert.ok([CLAIM.VERIFIED, CLAIM.UNVERIFIED].includes(row[f].status), `${k}.${f}`);
  }
  for (const k of KNOWN_OFFSHORE_KEYS) assert.equal(CAPABILITY_MATRIX[k], undefined, `${k} has no row`);
  assert.equal(handoffFor("bovada").capability, HANDOFF.MANUAL_ENTRY);
  assert.ok(fs.existsSync(path.join(APP, "..", MATRIX_DOC)), "the matrix doc is committed");
});

test("links are OFF twice: the Terms gate is a constant false, the flag defaults off, and nothing is emitted either way", () => {
  assert.equal(TERMS_PERMIT_SPORTSBOOK_LINKS, false);
  assert.equal(HANDOFF_LINKS_FLAG, "NEXT_PUBLIC_SPORTSBOOK_HANDOFF_LINKS");
  assert.equal(handoffLinksEnabled({}), false);
  assert.equal(handoffLinksEnabled({ [HANDOFF_LINKS_FLAG]: "1" }), false, "the flag alone cannot open the legal gate");
  for (const k of ELIGIBLE_OPERATOR_KEYS) {
    assert.deepEqual(handoffLinks(k, LEGS, {}), { links: [], reason: "TERMS_DO_NOT_PERMIT_SPORTSBOOK_LINKS" });
    assert.deepEqual(handoffLinks(k, LEGS, { env: { [HANDOFF_LINKS_FLAG]: "1" } }).links, []);
  }
});

test("no sportsbook URL, anchor, or navigation in the comparison sources", () => {
  for (const rel of SOURCES) {
    const src = strip(read(rel));
    assert.doesNotMatch(src, SPORTSBOOK_URL, rel);
    assert.doesNotMatch(src, /target="_blank"|window\.open|location\.href|location\.assign/, rel);
    for (const href of src.matchAll(/href=\{?"([^"]+)"/g)) assert.ok(href[1].startsWith("/"), `${rel}: only site-internal links (${href[1]})`);
  }
  assert.doesNotMatch(strip(read("src/components/slip/SportsbookOddsCompare.tsx")), /<a\b|<Link\b/, "the compare surface renders no anchor at all");
});

test("RENDERED: the open comparison names books, prices, the copy action and the honest handoff label — and no sportsbook URL", () => {
  const html = renderToStaticMarkup(React.createElement(SportsbookOddsCompare, { legs: LEGS, priceRecords: records, nowMs: NOW_MS, defaultOpen: true }));
  for (const s of ["Compare sportsbook odds", "DraftKings", "FanDuel", "All 2 legs priced", "1 of 2 legs priced", "Copy slip", "Enter these legs yourself at the sportsbook", "Same game", "We do not link to sportsbooks", "Sportsbook availability varies by state."]) {
    assert.ok(html.toLowerCase().includes(s.toLowerCase()), s);
  }
  assert.match(html, /This sportsbook&#x27;s line is different \(19\.5\)/);
  assert.doesNotMatch(html, SPORTSBOOK_URL);
  assert.doesNotMatch(html, /<a\b|href=/);
  assert.match(html, /data-handoff="MANUAL_ENTRY"/);
  assert.doesNotMatch(html, /FULL_PREFILL|PARTIAL_LINK/);
});

test("RENDERED: with no recorded prices the surface says there is nothing to compare (no invented book)", () => {
  const html = renderToStaticMarkup(React.createElement(SportsbookOddsCompare, { legs: LEGS, priceRecords: [], nowMs: NOW_MS, defaultOpen: true }));
  assert.match(html, /No sportsbook has a recorded price for these exact legs yet/);
  assert.doesNotMatch(html, /DraftKings|FanDuel/);
});

test("RENDERED: the whole Smart Betslip with the flag set still emits no sportsbook URL; its only link is /responsible-use", () => {
  const prev = process.env[HANDOFF_LINKS_FLAG];
  process.env[HANDOFF_LINKS_FLAG] = "1";
  try {
    const slip = slipFromCard({ cardId: "fx", legs: LEGS.map((l) => ({ ...l, selection: `${l.player} ${l.side}`, market: "player_points", book: "DraftKings", price: -110, capturedAt: "2026-10-22T21:55:00Z" })) });
    assert.equal(slip.legs[0].playerId, "9100001", "the slip keeps the comparison identity");
    const html = renderToStaticMarkup(React.createElement(SmartBetslip, { slip, nowMs: NOW_MS, onRemove() {}, onMove() {}, onClear() {}, priceRecords: records }));
    assert.match(html, /Compare sportsbook odds/);
    assert.doesNotMatch(html, SPORTSBOOK_URL);
    assert.deepEqual([...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]), ["/responsible-use"]);
  } finally {
    if (prev === undefined) delete process.env[HANDOFF_LINKS_FLAG]; else process.env[HANDOFF_LINKS_FLAG] = prev;
  }
});

test("uiux guards: design tokens only, and no '#NNNN' issue references in shipped source (write 'PR 1130')", () => {
  const files = [...SOURCES, "src/lib/sports/odds/nba-props/contract.mjs", "src/lib/sports/odds/nba-props/parse.mjs", "src/lib/sports/odds/nba-props/credits.mjs", "src/lib/sports/odds/nba-props/evaluator-bridge.mjs", "src/lib/sports/odds/nba-props/player-identity.mjs"];
  for (const rel of files.filter((f) => f !== "src/components/parlays/v2/SmartBetslip.tsx")) {
    const raw = read(rel);
    assert.doesNotMatch(raw, /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/, `${rel}: raw colour or '#NNNN' reference`);
  }
  assert.doesNotMatch(strip(read("src/components/parlays/v2/SmartBetslip.tsx")), /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
});
