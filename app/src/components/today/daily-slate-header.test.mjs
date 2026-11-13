/**
 * The /today header and the games list under it describe the same day (UX 2026-11-13).
 * On 2026-11-13 at 12:50 AM ET the header said "No games today" above a list of nine NBA games: its chips came only from
 * sports whose forecast day was already LIVE, and tonight's lane had not published yet.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
globalThis.React = React; // the component compiles to classic React.createElement under tsx
const { default: TodayDailySlateHeader } = await import("./daily-slate-header.tsx");

const render = (props) => renderToStaticMarkup(React.createElement(TodayDailySlateHeader, { dateLabel: "Friday, November 13", slateRelative: null, activeSports: [], ...props }));

test("games listed for today are named in the header, with their count, even before a forecast lane is live", () => {
  const html = render({ gamesToday: [{ label: "NBA", count: 9 }] });
  assert.match(html, /NBA · 9 games/);
  assert.doesNotMatch(html, /No games today/);
});

test("'No games today' needs BOTH no active sport and no listed game", () => {
  assert.match(render({}), /No games today/);
  assert.doesNotMatch(render({ activeSports: ["NFL"] }), /No games today/);
});

test("a sport is named once: its count when its games are listed, its bare label when it is only active", () => {
  const html = render({ activeSports: ["NBA", "NFL"], gamesToday: [{ label: "NBA", count: 1 }] });
  assert.match(html, /NBA · 1 game</);
  assert.equal((html.match(/NBA/g) ?? []).length, 1);
  assert.match(html, />NFL</);
});

test("/today feeds the header from the same rows it lists", () => {
  const page = fs.readFileSync(path.join(process.cwd(), "src/app/today/page.tsx"), "utf8");
  assert.match(page, /const gamesTodayBySport = \[\.\.\.todayRows\.reduce\(/);
  assert.match(page, /gamesToday=\{gamesTodayBySport\}/);
});
