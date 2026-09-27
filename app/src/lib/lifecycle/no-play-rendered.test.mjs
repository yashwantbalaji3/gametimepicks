/**
 * WHAT THE READER SEES (§8) — the defect was a SENTENCE, so the guard has to read the markup.
 *
 * `card-lifecycle.test.mjs` proves the derivation and pins the source. Neither would have caught the
 * original bug, because the derivation did not exist and the source condition looked reasonable: the
 * only way to see it was to render a date with published, unsettled cards and read the phrase.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;

import { cardLifecycleOf, CARD_LIFECYCLE } from "./card-lifecycle.mjs";

const mod = await import("../../components/results/trust-center.tsx");
const TrustCenter = mod.default;

/** The narrowest model the settlement row needs; everything else renders empty. */
const model = ({ publishedCount, lifecycle, realizedPnl = 0, status = "pending" }) => ({
  money: { activeBankroll: 0, crown: 0, openExposure: 0, realizedPnl: 0, record: { wins: 0, losses: 0, voids: 0, pending: 0 } },
  settlement: { status, realizedPnl, date: "2026-09-20", generatedAt: "2026-09-20T12:00:00Z", publishedCount, lifecycle },
  /* The component reads mlb.latestDate unconditionally; an empty performance block is enough. */
  mlb: { latestDate: null, daily: null, lifetime: null, markets: [] },
  ladders: [], legacyLadders: [], completedCards: [], awaitingCards: [],
  activeCardsCount: publishedCount, settledBankBuilderStepCount: 0, moonshot: null,
});

const render = (m) => renderToStaticMarkup(React.createElement(TrustCenter, { model: m }));

/**
 * Just the "Latest slate" row.
 *
 * ⚠ ASSERTING OVER THE WHOLE PAGE WAS WRONG, and it failed loudly rather than quietly, which was
 * lucky. The page legitimately EXPLAINS no-play days in two other places ("without an approved card,
 * it is a no-play day", "no-play days create nothing") — prose that should stay. The defect was one
 * row's LABEL, so the guard reads that row and nothing else.
 */
const slateRow = (html) => {
  const start = html.indexOf("Latest slate");
  assert.notEqual(start, -1, "the Latest slate row must exist, or this guard proves nothing");
  const end = html.indexOf("Settled-money exposure", start);
  return html.slice(start, end === -1 ? start + 600 : end);
};

test("🔴 a date with three published, unsettled cards does NOT read as a no-play day", () => {
  /* The external review's case: three published paper cards totalling $225, realized P&L 0. */
  const lifecycle = cardLifecycleOf({ published: 3 });
  const row = slateRow(render(model({ publishedCount: 3, lifecycle, realizedPnl: 0 })));
  assert.ok(!row.includes("no-play"), `the row still calls it a no-play day:\n${row}`);
  assert.ok(row.includes("not settled"), "it says what is actually true");
  assert.ok(row.includes("3 cards"), "and names the published count the old condition ignored");
});

test("a genuine no-play day still says so — the fix must not remove a true statement", () => {
  const row = slateRow(render(model({ publishedCount: 0, lifecycle: cardLifecycleOf({ published: 0 }), status: "none" })));
  assert.ok(row.includes("no-play"), "zero published cards IS a no-play day");
  assert.ok(!row.includes("0 cards"), "and does not append a card count to an absence");
});

test("a settled date reads as settled, not as a no-play day, even at exactly zero P&L", () => {
  /* Break-even is the other reading of realizedPnl === 0, and it is not an absence either. */
  const lifecycle = cardLifecycleOf({ published: 2, settled: 2 });
  assert.equal(lifecycle, CARD_LIFECYCLE.SETTLED);
  const row = slateRow(render(model({ publishedCount: 2, lifecycle, realizedPnl: 0, status: "settled" })));
  assert.ok(!row.includes("no-play"), "a break-even settled day is not a no-play day");
  assert.ok(row.includes("settled"));
});

test("a live date does not read as settled or as a no-play day", () => {
  const lifecycle = cardLifecycleOf({ published: 3, live: 1 });
  const row = slateRow(render(model({ publishedCount: 3, lifecycle })));
  assert.ok(!row.includes("no-play"));
  assert.ok(row.includes("live"));
});
