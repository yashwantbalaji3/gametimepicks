/**
 * Results V2 · B-2 — the overview answers first, keeps every record separate, keeps research apart, and shows
 * products only by their canonical headline. Server render at the seed day with fixtures + a source guard.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;
const { default: ResultsOverview } = await import("./results-overview.tsx");

const day = (date, won, lost, push = 0, v = 0) => ({ date, won, lost, push, void: v });
const pops = [
  { id: "mlb-games", label: "MLB game calls", sportLabel: "MLB", class: "PUBLIC", note: null, seasonStart: "2031-03-01", seasonLabel: "2031 season", href: "/results/picks/mlb/", days: [day("2031-07-14", 3, 1, 1), day("2031-07-10", 2, 2)] },
  { id: "ufc-fights", label: "UFC fight winners", sportLabel: "UFC", class: "PUBLIC", note: null, seasonStart: null, seasonLabel: null, href: "/results/picks/ufc/", days: [day("2031-06-01", 5, 5)] },
  { id: "mlb-props", label: "MLB player-prop leans", sportLabel: "MLB", class: "RESEARCH", note: "Market context, not picks.", seasonStart: null, seasonLabel: null, href: "/results/picks/mlb/", days: [day("2031-07-14", 40, 38, 0, 6)] },
];
const products = [{ id: "bank-builder", label: "Bank Builder", recordLabel: "37–36", pendingLabel: "0 pending · 73 settled", window: null, note: "n", href: "/bank-builder/" }];
const html = renderToStaticMarkup(React.createElement(ResultsOverview, { populations: pops, products, seedToday: "2031-07-14" }));

test("🔴 the answer comes first: a heading, windows, and one card per public record with its own W–L and denominator", () => {
  assert.match(html, /How GameTimePicks did/);
  assert.match(html, /role="tablist"[\s\S]*Today[\s\S]*7 days[\s\S]*30 days[\s\S]*Season[\s\S]*All time/);
  assert.match(html, /MLB game calls[\s\S]*5–3–1[\s\S]*62\.5% of 8 decided/, "7-day default: 3+2 won, 1+2 lost, 1 push — a push is not decisive");
  assert.match(html, /UFC fight winners[\s\S]*Nothing graded in this window/, "no fabricated zero record for an empty window");
});

test("🔴 no universal percentage across records; research is in its own labelled block", () => {
  assert.doesNotMatch(html, /overall hit rate|all picks combined|site-wide/i);
  const r = html.indexOf("Model research · not public picks");
  assert.ok(r > -1 && html.indexOf("MLB player-prop leans") > r, "the research record renders inside the research block");
  assert.match(html, /market context · not picks/);
});

test("products show only their canonical headline, never a recomputed record", () => {
  assert.match(html, /Bank Builder[\s\S]*37–36[\s\S]*0 pending · 73 settled/);
  const page = fs.readFileSync(path.join(process.cwd(), "src/app/results/page.tsx"), "utf8");
  assert.match(page, /currentProductRecord\(id, projection\)/, "the page asks the canonical reader");
  assert.match(page, /resultsV2Populations\(currentEtDate\(\)\)/);
  assert.ok(page.indexOf("<ResultsOverview") < page.indexOf("<ResultsExplorer"), "the overview leads the detailed record");
});

test("the day-by-day tracker lists graded days newest first, public records in the summary line", () => {
  const i = html.indexOf("Day by day");
  assert.ok(i > -1);
  const tracker = html.slice(i);
  assert.ok(tracker.indexOf("Mon, Jul 14") < tracker.indexOf("Thu, Jul 10"), "newest first");
  assert.match(tracker, /MLB <strong[^>]*>3–1<\/strong>–1/);
});
