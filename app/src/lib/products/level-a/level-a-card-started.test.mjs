/**
 * A served Level A card is fixed at build time, and a mixed card's legs start at different times. Measured 2026-11-02:
 * a card kept offering "Add card to slip" and its joint estimate after a leg had started, until the next build, because
 * the slip only refused once EVERY leg had started. The reader's clock now ends the whole card at its FIRST started leg.
 * The static HTML never changes (the recorder reads it, and the server has no reader clock).
 *
 * Run: npx tsx --test src/lib/products/level-a/level-a-card-started.test.mjs
 * Selections marked FIXTURE are test inputs.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";

import { levelASuggestions } from "./suggestions.mjs";
import { levelAMixed } from "./mixed.mjs";
import { CARD_STARTED_LINE, LEG_FLAG } from "./slip.mjs";
import { cardHasStarted, slipLegStarted, STARTED_UNAVAILABLE } from "../../slip/slip-add-gate.ts";

globalThis.React = React;
const { default: LevelASuggestions } = await import("../../../components/products/level-a-suggestions.tsx");
const { AddToSlip, CardStarted, CardStartedLine, WhileCardPregame } = await import("../../../components/products/level-a-slip.tsx");

const AS_OF = "2026-11-02T14:00:00.000Z";
const EARLY = "2026-11-02T17:00:00Z";
const LATE = "2026-11-03T00:30:00Z";
const AFTER_EARLY = "2026-11-02T18:00:00.000Z";

let n = 0;
/** FIXTURE selection: a leg of its own game, with its own kickoff. */
const sel = (sport, p, startUtc) => ({
  sport, eventId: `fx-${++n}`, eventLabel: `Home ${n} v Away ${n}`, startUtc, market: "winner",
  selection: { code: "home", label: `Club ${n} to win` }, probability: p,
  forecast: { owner: "fixture", modelId: "fx", stampedAt: "2026-11-02T08:00:00Z", ref: null }, uncertainty: null, participantStatuses: [],
  settlement: { grader: "fixture", market: "winner", side: "home" },
});

function mixedModel() {
  const answer = levelASuggestions({ selections: [sel("mlb", 0.72, EARLY), sel("epl", 0.7, LATE), sel("ligue-1", 0.68, LATE)], now: AS_OF, productDay: "2026-11-02" });
  const mixed = levelAMixed({ crossSportLegs: answer.legs, nbaLegs: [], disclosure: null, enabled: true });
  return { asOf: AS_OF, ...answer, parlayLab: mixed.parlayLab, bankBuilder: mixed.bankBuilder, moonshot: mixed.moonshot, mixed: { public: true, policy: mixed.policy, sports: mixed.sports, disclosure: null }, refusedByReason: {}, nbaProjections: [] };
}

const code = (rel) => fs.readFileSync(path.join(process.cwd(), rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("THE RULE: one started leg ends the whole card; the slip's own start rule decides what 'started' means", () => {
  const starts = [EARLY, LATE];
  assert.equal(cardHasStarted(starts, "2026-11-02T16:00:00.000Z"), false, "no leg has started");
  assert.equal(cardHasStarted(starts, EARLY), true, "AT first pitch counts, as it does on the slip");
  assert.equal(cardHasStarted(starts, AFTER_EARLY), true, "MIXED: one leg started, one still ahead");
  assert.equal(cardHasStarted(starts, "2026-11-03T06:00:00.000Z"), true, "every leg started");
  assert.equal(cardHasStarted(["not a date", LATE], AS_OF), true, "an unparseable start fails closed, as slipLegStarted does");
  assert.equal(cardHasStarted([null, LATE], AS_OF), false, "no start carried is not provably started");
  for (const s of starts) assert.equal(cardHasStarted([s], AFTER_EARLY), slipLegStarted({ startUtc: s }, AFTER_EARLY), "one rule with the slip");
});

test("HYDRATION: no reader clock yet means no decision; the static HTML is the build's own card", () => {
  assert.equal(cardHasStarted([EARLY], null), false);
  const model = mixedModel();
  const card = model.parlayLab.find((t) => t.card)?.card;
  assert.ok(card && new Set(card.legs.map((l) => l.startUtc)).size === 2, "the fixture is a mixed card with two kickoffs");
  const html = renderToString(React.createElement(LevelASuggestions, { model, mode: "parlay-lab" })).replace(/<!-- -->/g, "");
  assert.match(html, /model joint probability/, "the recorder's page check reads this text in the HTML");
  assert.match(html, />Add card to slip</);
  assert.match(html, />Copy selections</);
  assert.ok(!html.includes(CARD_STARTED_LINE), "the server never prints the started line");
});

test("A STARTED CARD: joint and copy gone, one honest line, the card button refused; a single leg still ahead stays addable", () => {
  const card = (started) => renderToString(React.createElement(CardStarted.Provider, { value: started },
    React.createElement(WhileCardPregame, null, React.createElement("span", null, "model joint probability 40.0%")),
    React.createElement(CardStartedLine),
    React.createElement(AddToSlip, { keys: ["mlb|1|winner|home", "epl|2|winner|home"], label: "Add card to slip", name: "Mixed (2 legs)", wholeCard: true }),
    React.createElement(AddToSlip, { keys: ["epl|2|winner|home"], name: "Club to win, Home v Away" }))).replace(/<!-- -->/g, "");
  const pregame = card(false);
  assert.match(pregame, /model joint probability 40\.0%/);
  assert.match(pregame, />Add card to slip</);
  assert.ok(!pregame.includes(CARD_STARTED_LINE));

  const started = card(true);
  assert.doesNotMatch(started, /model joint probability/, "the joint estimate stops being offered");
  assert.ok(started.includes(CARD_STARTED_LINE), "and the card says why, once");
  assert.equal(started.split(CARD_STARTED_LINE).length - 1, 1);
  assert.doesNotMatch(started, />Add card to slip</, "the card cannot be added");
  const refused = started.match(/<button[^>]*disabled[^>]*aria-label="Mixed \(2 legs\): [^"]*"[^>]*>([^<]*)<\/button>/);
  assert.ok(refused, "the card button is disabled and labelled");
  assert.equal(refused[1], STARTED_UNAVAILABLE, "the slip's own disabled words");
  assert.match(started, />Add to slip</, "a leg still ahead keeps its own button: only the started leg's own gate refuses it");
});

test("THE WORDING is the slip's own, and the line says what stopped", () => {
  assert.equal(LEG_FLAG.EXPIRED, "Started: no longer a pre-game suggestion");
  assert.ok(CARD_STARTED_LINE.startsWith(LEG_FLAG.EXPIRED));
  assert.match(CARD_STARTED_LINE, /cannot be added/);
  assert.match(CARD_STARTED_LINE, /no joint estimate/i);
  assert.doesNotMatch(CARD_STARTED_LINE, /\bodds\b|\bprice\b|payout/i);
});

test("BOTH CARD SURFACES are wired: Level A and NBA tiers scope on their own legs' starts and gate joint and copy", () => {
  for (const f of ["src/components/products/level-a-suggestions.tsx", "src/components/products/nba-game-winners.tsx"]) {
    const s = code(f);
    assert.match(s, /<CardStartScope starts=\{\(c\?\.legs \?\? \[\]\)\.map\(\(l\) => l\.startUtc\)\}>/, `${f}: the scope reads every leg's start`);
    assert.match(s, /<WhileCardPregame><span[^>]*>\{c\.tierLabel\} · model joint probability /, `${f}: the joint is gated`);
    assert.match(s, /<CardStartedLine \/>/, `${f}: the line`);
    assert.match(s, /<WhileCardPregame><LevelACopy /, `${f}: the copy text carries the joint, so it is gated too`);
    assert.match(s, /label="Add card to slip"[^\n]*wholeCard/, `${f}: the card button is a whole-card add`);
    assert.doesNotMatch(s, /<AddToSlip keys=\{\[[^\n]*wholeCard/, `${f}: a single leg's button is not`);
  }
});

test("THE CLICK RACE: a whole-card add refuses every leg if any has started, so it can never add a partial card", () => {
  const store = code("src/lib/products/level-a/slip-store.ts");
  assert.match(store, /if \(whole && keys\.some\(\(k\) => catalogLegStarted\(k, now\)\)\) return;/);
  assert.match(code("src/components/products/level-a-slip.tsx"), /add\(keys, \{ whole: wholeCard \}\)/);
});
