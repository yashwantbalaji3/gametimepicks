/**
 * LIVE-F (Release 2B) — the shared live event card renders the same facts the same way for every sport.
 * Rendered for real (renderToStaticMarkup), not grepped.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;
const { default: LiveEventCard, LiveStateChip, liveEtTime } = await import("../../components/live/live-event-card.tsx");

const base = {
  spoken: "Seattle Seahawks at Denver Broncos. Scheduled. No score reported.",
  sport: "nfl",
  away: { abbr: "SEA", name: "Seattle Seahawks", score: null },
  home: { abbr: "DEN", name: "Denver Broncos", score: null },
  reportHref: "/nfl/game/401/",
};
const html = (props) => renderToStaticMarkup(React.createElement(LiveEventCard, { ...base, ...props }));

test("scheduled: start time, em-dash scores (never 0), full names, a visible 44px report link, one spoken summary", () => {
  const h = html({ state: "PRE", label: "Scheduled", when: liveEtTime("2026-10-16T00:15:00Z"), started: false });
  assert.match(h, /Thu · 8:15\sPM ET/);
  assert.equal((h.match(/>—</g) || []).length, 2, "both absent scores are em dashes");
  assert.doesNotMatch(h, />0</, "no invented zero");
  assert.match(h, /Seattle Seahawks/);
  const link = /<a [^>]*href="\/nfl\/game\/401\/?"[^>]*>(.*?)<\/a>/.exec(h); // Link drops the slash outside the app
  assert.ok(link, "the report link is rendered");
  assert.match(link[0], /min-height:44px/);
  assert.match(link[1].replace(/<!-- -->/g, ""), /^Open game report →$/);
  assert.equal((h.match(/class="sr-only"/g) || []).length, 1);
  assert.match(h, /aria-hidden="true"/, "the visual rows are hidden from assistive tech; the summary carries them");
});

test("live shows the period; final shows none — the caller passes null and the card prints nothing", () => {
  assert.match(html({ state: "LIVE", label: "Live", when: "Q3 · 7:27", started: true, away: { ...base.away, score: 14 }, home: { ...base.home, score: 10 } }), /Q3 · 7:27/);
  const fin = html({ state: "FINAL_PENDING_SETTLEMENT", label: "Final · grading pending", when: null, started: true, away: { ...base.away, score: 24 }, home: { ...base.home, score: 21 } });
  assert.match(fin, /Final · grading pending/);
  assert.doesNotMatch(fin, /Q\d|Top|Bot/);
});

test("every lifecycle state has a chip in words, and an unknown state falls back without crashing", () => {
  for (const [s, l] of [["PRE", "Scheduled"], ["LIVE", "Live"], ["DELAYED", "Delayed"], ["FINAL_PENDING_SETTLEMENT", "Final · grading pending"], ["SETTLED", "Final"], ["POSTPONED", "Postponed"], ["CANCELLED", "Cancelled"], ["UNAVAILABLE", "Live tracking unavailable"], ["SOMETHING_NEW", "Status unknown"]]) {
    assert.match(renderToStaticMarkup(React.createElement(LiveStateChip, { state: s, label: l })), new RegExp(`>${l}<`));
  }
});

test("both hubs render this card, and neither keeps a private chip or team row", () => {
  for (const f of ["src/components/live/live-hub.tsx", "src/components/live/nfl-live-hub.tsx"]) {
    const s = fs.readFileSync(f, "utf8");
    assert.match(s, /<LiveEventCard/, f);
    assert.doesNotMatch(s, /function StateChip|function TeamRow/, `${f} keeps no duplicate primitive`);
  }
});
