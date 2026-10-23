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
  { id: "mlb-props", label: "MLB player-prop leans", sportLabel: "MLB", class: "RESEARCH", tag: "market context · not picks", note: "Market context, not picks.", seasonStart: null, seasonLabel: null, href: "/results/picks/mlb/", days: [day("2031-07-14", 40, 38, 0, 6)] },
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
  const r = html.indexOf("Research / paused · graded, not public picks");
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

test("🔴 RESULTS INTEGRITY 2026-10-17 (#1123): every rate on a population card carries the shared small-sample note (sampleStateFor)", () => {
  // Export of 2026-10-17 showed "64.3% of 14 decided" (NFL), "50% of 10 decided" (EPL, UFC) and "45.8% of 24" (MLB) with
  // no caveat, while /epl, /ufc and /results/picks gate the same rates through sampleStateFor. The card now says it too.
  const cardOf = (label) => { const i = html.indexOf(label); return html.slice(i, html.indexOf("Every graded row", i)); };
  assert.match(cardOf("MLB game calls"), /62\.5% of 8 decided[\s\S]*far too few decided to judge accuracy/i, "8 decided is below the 30 floor");
  assert.match(cardOf("MLB player-prop leans"), /51\.3% of 78 decided[\s\S]*still a small sample/i, "78 decided is between 30 and 200");
  const big = renderToStaticMarkup(React.createElement(ResultsOverview, { populations: [{ ...pops[0], days: [day("2031-07-14", 120, 100)] }], products: [], seedToday: "2031-07-14" }));
  assert.match(big, /54\.5% of 220 decided/);
  assert.doesNotMatch(big, /too few decided|still a small sample/i, "at or above 200 decided no small-sample note");
});

/*
 * F05 (independent audit 2026-10-23): /results' "Public forecasts" MLB record counted calls the site had PAUSED at first
 * pitch (the total call) — a 4–5 seven-day record that was really 2–4 public + 2–1 paused. The overview now receives the
 * ledger split by publication status (lib/results/mlb-call-publication.mjs) and keeps each part in its own block.
 */
const split = [
  { id: "mlb-games", label: "MLB game calls", sportLabel: "MLB", class: "PUBLIC", group: "mlb-games", tag: null, note: null, seasonStart: "2031-03-01", seasonLabel: "2031 season", href: "/results/picks/mlb/", days: [day("2031-07-14", 2, 4)] },
  { id: "mlb-games-paused", label: "MLB game calls · paused or not shown", sportLabel: "MLB", class: "RESEARCH", group: "mlb-games", tag: "paused or not shown", note: "Paused.", seasonStart: "2031-03-01", seasonLabel: "2031 season", href: "/results/picks/mlb/", days: [day("2031-07-14", 2, 1)] },
  { id: "mlb-games-unknown", label: "MLB game calls · publication status unknown (legacy)", sportLabel: "MLB", class: "UNKNOWN", group: "mlb-games", tag: "status unknown", note: "Legacy.", seasonStart: "2031-03-01", seasonLabel: "2031 season", href: "/results/picks/mlb/", days: [day("2031-03-02", 7, 8)] },
  pops[2],
];
const render = (populations, seedToday, initialWindow) =>
  renderToStaticMarkup(React.createElement(ResultsOverview, { populations, products, seedToday, initialWindow }));
const between = (h, a, b) => { const i = h.indexOf(a); const j = b ? h.indexOf(b, i + 1) : h.length; assert.ok(i > -1, `missing ${a}`); return h.slice(i, j > -1 ? j : h.length); };

test("🔴 F05: the public MLB record holds only calls shown before first pitch; paused calls are their own labelled record", () => {
  const h = render(split, "2031-07-14", "d7");
  const pub = between(h, "Public forecasts", "Products · each its own record");
  assert.match(pub, /MLB game calls<\/h3>[\s\S]*2–4/, "the public card is the public rows only");
  assert.doesNotMatch(pub, /4–5|paused or not shown<\/h3>/, "never the pooled record, never the paused card");
  assert.match(pub, /Not counted here, graded separately below: 3 paused or not shown\./, "and it names what it leaves out in this window");
  const research = between(h, "Research / paused · graded, not public picks", "Publication status unknown (legacy)");
  assert.match(research, /MLB game calls · paused or not shown[\s\S]*2–1/);
  assert.match(research, /MLB player-prop leans/);
  const unknown = between(h, "Publication status unknown (legacy)", "Day by day");
  assert.match(unknown, /Nothing graded in this window/, "a legacy bucket with nothing in the window says so — no fabricated zero");
  const all = render(split, "2031-07-14", "all");
  assert.match(between(all, "Publication status unknown (legacy)", "Day by day"), /7–8/, "every legacy row stays on the record");
  assert.match(between(all, "Public forecasts", "Products"), /3 paused or not shown · 15 status unknown/);
});

test("🔴 F05: the day list's summary line counts public records only; the table names each non-public record", () => {
  const h = render(split, "2031-07-14", "d7");
  const day14 = between(h, 'data-date="2031-07-14"', "</li>");
  assert.match(day14, /MLB <strong[^>]*>2–4<\/strong>/);
  assert.doesNotMatch(day14, /MLB <strong[^>]*>4–5<\/strong>/);
  assert.match(day14, /MLB game calls · paused or not shown<\/td><td[^>]*>2<\/td><td[^>]*>1</);
});

/*
 * F06 (independent audit 2026-10-23): with the Today tab selected the blocks said "Nothing graded" while "Day by day"
 * directly below still started a week earlier. The list now follows the same window contract and sits in the panel.
 */
test("🔴 F06: Today scopes the day list — nothing graded today is said once, with the newest graded day one tap away", () => {
  const h = render(split, "2031-07-16", "today");
  const panel = between(h, 'role="tabpanel"');
  assert.match(h, /id="(\w+)-panel-today" role="tabpanel" aria-labelledby="\1-tab-today"/, "the panel is named by the selected tab");
  assert.match(h, /aria-selected="true" aria-controls="\w+-panel-today"/);
  assert.match(panel, /Day by day · Today/, "the list is inside the selected tab's panel and says its window");
  assert.doesNotMatch(panel, /data-date=/, "no day outside today is listed under Today");
  assert.match(panel, /Nothing graded today yet\./);
  assert.match(panel, /href="\/results\/date\/2031-07-14\/"[^>]*>The newest graded day is Mon, Jul 14 →/);
});

test("🔴 F06: 7 days, Season and All time each list exactly the days their counts cover", () => {
  const listed = (h) => [...h.matchAll(/data-date="(\d{4}-\d{2}-\d{2})"/g)].map((m) => m[1]);
  assert.deepEqual(listed(render(split, "2031-07-14", "today")), ["2031-07-14"]);
  assert.deepEqual(listed(render(split, "2031-07-16", "d7")), ["2031-07-14"], "Mar 2 is outside the 7-day window");
  assert.deepEqual(listed(render(split, "2031-07-16", "season")), ["2031-07-14", "2031-03-02"]);
  assert.deepEqual(listed(render(split, "2031-07-16", "all")), ["2031-07-14", "2031-03-02"]);
  const many = [{ ...split[0], days: Array.from({ length: 20 }, (_, i) => day(`2031-06-${String(30 - i).padStart(2, "0")}`, 1, 0)) }];
  const h = render(many, "2031-06-30", "all");
  assert.equal(listed(h).length, 14);
  assert.match(h, /The newest 14 of 20 graded days in this window\./, "a capped list says it is capped");
  assert.match(render(many, "2031-08-30", "d7"), /No graded day in this window\./);
});
