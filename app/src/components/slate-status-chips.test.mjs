/**
 * #794 PR 2 · the global day chip. Pure rules + a server render; fixture dates and clocks only.
 */
import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;
const { default: SlateStatusChips, dayChipText, underWay } = await import("./slate-status-chips.tsx");

const D = "2031-09-29";
const at = (iso) => Date.parse(iso);

test("🔴 the day chip counts the WHOLE day, only for the day it was computed, and only when known", () => {
  assert.equal(dayChipText({ today: D, countsFor: D, state: "EVENTS", eventsToday: 1 }), "Today · Sep 29 · 1 event");
  assert.equal(dayChipText({ today: D, countsFor: D, state: "EVENTS", eventsToday: 17 }), "Today · Sep 29 · 17 events");
  assert.equal(dayChipText({ today: D, countsFor: D, state: "NO_EVENTS", eventsToday: 0 }), "Today · Sep 29 · no games");
  assert.equal(dayChipText({ today: D, countsFor: D, state: "UNKNOWN", eventsToday: 0 }), "Today · Sep 29", "an unloaded schedule claims nothing");
  assert.equal(dayChipText({ today: "2031-09-30", countsFor: D, state: "EVENTS", eventsToday: 3 }), "Today · Sep 30", "yesterday's count never labels today");
});

test("'Games under way' only while a start has passed and its window is open", () => {
  const starts = [at("2031-09-30T00:15:00Z")]; // Mon 8:15 PM ET
  assert.equal(underWay(starts, at("2031-09-29T23:00:00Z")), false, "before kickoff");
  assert.equal(underWay(starts, at("2031-09-30T01:51:00Z")), true, "Q2");
  assert.equal(underWay(starts, at("2031-09-30T04:00:00Z")), false, "hours after");
  assert.equal(underWay([], at("2031-09-30T01:51:00Z")), false, "no starts, no claim");
});

test("🔴 the server render (seeded clock) never says 'Pregame slate', and links /live while a game is under way", () => {
  const html = renderToStaticMarkup(React.createElement(SlateStatusChips, {
    countsFor: D, serverToday: D, serverNowMs: at("2031-09-30T01:51:00Z"), state: "EVENTS", eventsToday: 1, startsMs: [at("2031-09-30T00:15:00Z")],
  }));
  assert.match(html, /Today · Sep 29 · 1 event/);
  assert.match(html, /href="\/live\/?"[^>]*>[\s\S]*Games under way/);
  assert.doesNotMatch(html, /Pregame slate/);
  const quiet = renderToStaticMarkup(React.createElement(SlateStatusChips, {
    countsFor: D, serverToday: D, serverNowMs: at("2031-09-29T15:00:00Z"), state: "NO_EVENTS", eventsToday: 0, startsMs: [],
  }));
  assert.match(quiet, /Today · Sep 29 · no games/);
  assert.doesNotMatch(quiet, /Games under way|Pregame slate/);
});
