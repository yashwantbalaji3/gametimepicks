/**
 * THE RENDERED PROGRESS RAIL (§5) — what a reader actually sees, not what the contract returns.
 *
 * `tracked-prediction.test.mjs` proves `railStateOf` cannot return a result state outside
 * FINAL_CANONICAL. That is necessary and not sufficient: a component is free to paint a green bar
 * from a live number without asking, and the rule that matters to a reader is about PIXELS AND
 * WORDS. So this renders the real component through react-dom/server and reads the markup.
 *
 * Run: cd app && npx tsx --test src/lib/live/tracked-prediction-rail.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React; // the component tree compiles against the classic runtime under tsx

import {
  MEASUREMENT_STATES as M, FINALITY, SETTLEMENT_STATUS, MARKET_KIND, RAIL_STATE as R,
  makeTrackedPrediction,
} from "./tracked-prediction.mjs";

const mod = await import("../../components/live/tracked-prediction-rail.tsx");
const { TrackedPredictionRail, TrackedPredictionGroup } = mod;

const render = (el) => renderToStaticMarkup(el);
const text = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const pred = (o = {}) => makeTrackedPrediction({
  sport: "nfl", eventId: "401872960",
  participantId: "nfl-athlete-3043078", participantName: "Derrick Henry",
  marketFamily: "player_reception_yds", label: "Receiving yards",
  marketKind: MARKET_KIND.ADDITIVE,
  pregame: { modelPrediction: 9.73, modelRange: { low: 0, high: 37.3 }, line: 9.5,
             sportsbook: "draftkings", overPrice: -113, underPrice: -111,
             capturedAt: "2026-09-26T16:49:46Z" },
  live: { measurementState: M.MEASURED, currentValue: 41 },
  ...o,
});

/* ── the rule, in rendered output ───────────────────────────────────────────────────────────── */

/** Every colour that means "this was won", and the words that would. */
const WIN_FILL = "var(--vault-success)";
const WIN_WORDS = /\bwon\b|\bwin\b|\bcashed\b|\bhit\b/i;

test("§5.2 · a live value far past the line renders NO win colour and NO win word", () => {
  /*
   * 41 receiving yards against a frozen 9.5 line, game in play. A sportsbook slip would be green.
   * This row says CURRENTLY ABOVE LINE, in the live tone, and nothing anywhere claims a result.
   */
  const html = render(React.createElement(TrackedPredictionRail, { prediction: pred() }));
  assert.match(text(html), /Currently above line/i);
  assert.equal(html.includes(WIN_FILL), false, "a live row painted the win colour");
  assert.equal(WIN_WORDS.test(text(html).replace(/Currently above line/i, "")), false,
    "a live row used settlement language");
});

test("§5.2 · an UNDER that is 'already won' in the third quarter renders as a measurement", () => {
  const html = render(React.createElement(TrackedPredictionRail, {
    prediction: pred({ live: { measurementState: M.MEASURED, currentValue: 2 } }),
  }));
  assert.match(text(html), /Currently below line/i);
  assert.equal(html.includes(WIN_FILL), false);
});

test("§5.2 · a provider FINAL still renders a measurement, never a result", () => {
  const html = render(React.createElement(TrackedPredictionRail, {
    prediction: pred({
      final: { finality: FINALITY.FINAL_PROVISIONAL, actualValue: 41 },
      settlement: { status: SETTLEMENT_STATUS.SETTLED, forecastResult: "HIT" },
    }),
  }));
  assert.equal(html.includes(WIN_FILL), false, "a provisional final spent the result");
  assert.match(text(html), /Final . awaiting settlement/i);
});

test("only a SETTLED canonical final renders the win treatment", () => {
  const win = render(React.createElement(TrackedPredictionRail, {
    prediction: pred({
      final: { finality: FINALITY.FINAL_CANONICAL, actualValue: 41 },
      settlement: { status: SETTLEMENT_STATUS.SETTLED, forecastResult: "HIT" },
    }),
  }));
  assert.ok(win.includes(WIN_FILL), "a settled hit must be unmistakable");
  assert.match(text(win), /Final . hit/i);

  const loss = render(React.createElement(TrackedPredictionRail, {
    prediction: pred({
      final: { finality: FINALITY.FINAL_CANONICAL, actualValue: 2 },
      settlement: { status: SETTLEMENT_STATUS.SETTLED, forecastResult: "MISS" },
    }),
  }));
  assert.ok(loss.includes("var(--vault-loss-red)"));
  assert.match(text(loss), /Final . miss/i);
});

/* ── missing is not zero ────────────────────────────────────────────────────────────────────── */

test("§3 · an absent value renders an em dash, never a 0", () => {
  const html = render(React.createElement(TrackedPredictionRail, {
    prediction: pred({ live: { measurementState: M.NO_MEASUREMENT, currentValue: null } }),
  }));
  const t = text(html);
  assert.match(t, /—/, "an absent value must render as a dash");
  assert.equal(/\b0\b/.test(t.replace(/-1\d\d|\d+:\d+/g, "")), false, "an absent value rendered as a zero");
});

test("§3 · a binary market with no measurement says 'not yet recorded', not 'No'", () => {
  const td = pred({
    marketFamily: "anytime_td", label: "Anytime touchdown", marketKind: MARKET_KIND.BINARY,
    pregame: { modelProbability: 0.75, line: null, capturedAt: "2026-09-26T16:49:46Z", modelPrediction: 0.75 },
    live: { measurementState: M.NO_MEASUREMENT, currentValue: null },
  });
  const t = text(render(React.createElement(TrackedPredictionRail, { prediction: td })));
  assert.match(t, /Not yet recorded/i);
});

test("a family that is not live-measurable says so, and shows the reason", () => {
  const td = pred({
    marketFamily: "anytime_td", label: "Anytime touchdown", marketKind: MARKET_KIND.BINARY,
    pregame: { modelProbability: 0.75, modelPrediction: 0.75, line: null,
               capturedAt: "2026-09-26T16:49:46Z", provenance: "no feed states the scorer by id" },
    live: { measurementState: M.MARKET_UNSUPPORTED, currentValue: null },
  });
  const t = text(render(React.createElement(TrackedPredictionRail, { prediction: td })));
  assert.match(t, /Not trackable live/i);
  assert.match(t, /no feed states the scorer by id/i);
});

/* ── §5.1 · the frozen side is shown, with its provenance ───────────────────────────────────── */

test("§5.1 · the frozen book, line, both prices and capture instant are on the row", () => {
  const t = text(render(React.createElement(TrackedPredictionRail, { prediction: pred() })));
  assert.match(t, /draftkings/i);
  assert.match(t, /9\.5/);
  assert.match(t, /-113/);
  assert.match(t, /-111/);
  assert.match(t, /16:49Z/, "captured-before-kickoff proof must be visible, not implied");
});

/* ── §5.3 · colour never carries state alone ────────────────────────────────────────────────── */

test("§5.3 · every rail state is stated in WORDS as well as colour", () => {
  const cases = [
    [{ live: { measurementState: M.AWAITING_EVENT, currentValue: null } }, /Scheduled/i],
    [{ live: { measurementState: M.SOURCE_STALE, currentValue: 12 } }, /Feed delayed/i],
    [{ live: { measurementState: M.IDENTITY_UNRESOLVED, currentValue: null } }, /No measurement/i],
    [{ live: { measurementState: M.EVENT_NOT_TRACKABLE, currentValue: null } }, /Void . no action/i],
  ];
  for (const [o, re] of cases) {
    const t = text(render(React.createElement(TrackedPredictionRail, { prediction: pred(o) })));
    assert.match(t, re, `state rendered no words: ${JSON.stringify(o)}`);
  }
});

test("§5.3 · the bar is aria-hidden and a full sentence reaches assistive technology", () => {
  const html = render(React.createElement(TrackedPredictionRail, { prediction: pred() }));
  assert.match(html, /aria-hidden="true"/, "decoration must not be announced");
  assert.match(html, /class="sr-only"/, "the row's meaning must reach a screen reader");
  const sr = (html.match(/<span class="sr-only">([^<]+)<\/span>/) ?? [])[1] ?? "";
  // current value, target, status and finality — all four, in one sentence.
  assert.match(sr, /Derrick Henry/);
  assert.match(sr, /current value of 41/);
  assert.match(sr, /frozen draftkings line of 9\.5/);
  assert.match(sr, /Status: Currently above line/);
  assert.match(sr, /The event is not final/);
});

/* ── §5.4 · grouping, and a score that was never given ──────────────────────────────────────── */

test("§5.4 · a group renders its predictions and omits a score it was not handed", () => {
  const html = render(React.createElement(TrackedPredictionGroup, {
    title: "BAL @ DAL", predictions: [pred(), pred({ participantName: "Zay Flowers" })],
  }));
  const t = text(html);
  assert.match(t, /BAL @ DAL/);
  assert.match(t, /Derrick Henry/);
  assert.match(t, /Zay Flowers/);
  assert.equal(/\b0\s*-\s*0\b/.test(t), false, "an absent score must not render as 0-0");

  const withScore = text(render(React.createElement(TrackedPredictionGroup, {
    title: "BAL @ DAL", score: "14-10", period: "Q3", clock: "4:12", predictions: [pred()],
  })));
  assert.match(withScore, /14-10/);
  assert.match(withScore, /Q3/);
  assert.match(withScore, /4:12/);
});

/* ── no probability is expressible ──────────────────────────────────────────────────────────── */

test("§5 · no percentage, pace or 'on track' reading can reach the rail", () => {
  const withProb = pred({ pregame: { ...pred().pregame, modelProbability: 0.83 } });
  const t = text(render(React.createElement(TrackedPredictionRail, { prediction: withProb })));
  assert.equal(/on track|pace|projected to finish|\b83%/i.test(t), false,
    "the rail rendered a forecast reading");
});

test("§9 · a TERMINAL market renders the ROUND, never a bare internal value", () => {
  /*
   * ⚠ MEASURED IN THE BROWSER AT 375px, 2026-09-26. The fight-winner row rendered "1" beside the
   * fighter's name — the join's internal value, which to a reader looks like a score. A bout in
   * progress has no current value; the round is the only thing that is true about it.
   */
  const bout = makeTrackedPrediction({
    sport: "ufc", eventId: "600061266", participantType: "FIGHTER",
    participantName: "Raul Rosas Jr.", marketFamily: "fight_winner", label: "Fight winner",
    marketKind: MARKET_KIND.TERMINAL,
    pregame: { modelPrediction: 0.82, modelProbability: 0.8238, line: null, capturedAt: "2026-09-26T14:55:20Z" },
    live: { measurementState: M.MEASURED, currentValue: 1, periodState: "R2", clock: "3:41" },
  });
  const t = text(render(React.createElement(TrackedPredictionRail, { prediction: bout })));
  assert.match(t, /Live . unresolved/i);
  assert.match(t, /R2/, "the round is the live state of a bout");
  assert.match(t, /3:41/);
  assert.equal((t.match(/R2/g) ?? []).length, 1, "the same fact twice reads as two facts");
  // The internal 1 must not reach the reader as a value or a target.
  assert.equal(/Raul Rosas Jr\. . Fight winner\s+1\b/.test(t), false, "the internal value leaked to the row");
});

test("a band row shows the BAND and says no line was purchased", () => {
  /* "104 / 96 hi" was this product's own shorthand leaking to a reader. */
  const band = pred({
    pregame: { modelPrediction: 58.1, modelRange: { low: 25, high: 96 }, line: null,
               capturedAt: "2026-09-26T16:49:46Z" },
    live: { measurementState: M.MEASURED, currentValue: 104 },
  });
  const t = text(render(React.createElement(TrackedPredictionRail, { prediction: band })));
  assert.equal(/\bhi\b/.test(t), false, "internal shorthand reached the reader");
  assert.match(t, /25.96/, "the band must be shown as a band");
  assert.match(t, /no sportsbook line published/i, "a model band must not read as a market number");
  assert.match(t, /Currently above pregame range/i);
});
