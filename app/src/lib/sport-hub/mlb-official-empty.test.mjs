/**
 * #797 PR C · /mlb before the morning board names the day's OFFICIAL games instead of "0 scheduled … a date
 * with no games has none scheduled". Render of the shared empty state + source guards over the one adapter.
 * Fixture values only.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;
const { default: GameSummary } = await import("../../components/sport-hub/game-summary.tsx");

test("🔴 the empty state prints the schedule owner's count and routes onward when games exist off the board", () => {
  const html = renderToStaticMarkup(React.createElement(GameSummary, {
    rows: [], unitLabel: "Games",
    emptyCounts: "4 on the official schedule · 0 with a report · 0 with a supported read",
    emptyReason: "The official MLB schedule has 4 games on Tue, Jul 15.",
    emptyLink: { href: "/simulate/?sport=mlb", label: "See the 4 scheduled games on Simulate" },
  }));
  assert.match(html, /4 on the official schedule/);
  assert.doesNotMatch(html, /0 scheduled/, "a count the schedule contradicts is never printed");
  assert.match(html, /href="\/simulate\/?\?sport=mlb"/);
});

test("with no schedule evidence the empty state is unchanged: zero is still printed", () => {
  const html = renderToStaticMarkup(React.createElement(GameSummary, { rows: [], unitLabel: "Games" }));
  assert.match(html, /0 scheduled · 0 with a report · 0 with a supported read/);
  assert.doesNotMatch(html, /<a /, "no link without a destination that lists the games");
});

test("🔴 the MLB adapter asks the product day, never infers 'none scheduled' from an empty board", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "src/lib/sport-hub/adapters.ts"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(code, /none scheduled/, "an empty board is not evidence that nothing is scheduled");
  const fn = code.slice(code.indexOf("function mlbOfficialOnly"));
  assert.match(fn, /productDayFor\("mlb"/, "the official schedule comes from the existing product-day owner");
  assert.match(fn, /day\.productDate !== today \|\| day\.events <= 0 \|\| day\.eligible > 0/,
    "only today's official games that the board does not yet carry — a published board keeps its own rows");
  assert.doesNotMatch(fn.replace(/\$\{[^}]*\}/g, ""), /["'`][^"'`\n]*\btoday\b[^"'`\n]*["'`]/i, "reader text names the date, never 'today' (a static page outlives its day)");
  const hub = code.slice(code.indexOf("export function mlbHub"), code.indexOf("function mlbOfficialOnly"));
  assert.match(hub, /rows\.length === 0 \? mlbOfficialOnly\(nowIso\) : null/, "consulted only when the board has no rows");
});

test("the hub header hands the empty-state fields through on every path", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "src/components/sport-hub/hub-header.tsx"), "utf8");
  const calls = src.match(/<GameSummary [^>]*\/>/g) ?? [];
  assert.ok(calls.length >= 3);
  for (const c of calls) assert.match(c, /emptyCounts=\{model\.emptyCounts\} emptyLink=\{model\.emptyLink\}/);
});
