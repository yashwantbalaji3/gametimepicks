/**
 * CompactRow weight (2026-10-23). The /nba "Games" window lists every game 3 days back to 7 days ahead (~70 rows
 * in season), and a static export ships each row twice (HTML + RSC flight). Inlined utilities and styles cost ~1 KB a
 * row; Production /nba reached 253.0 KiB (budget 250) on a 12-game slate. The row's styling now lives in globals.css
 * (.gtp-cr*), byte-for-byte; a built before/after showed the same rows, accessible names and computed styles.
 *
 * This guard needs no build, so it holds even when CI's export does not match Production's flags.
 * Run (from app/): npx tsx --test src/components/sport-hub/compact-row-weight.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;
const { default: GameSummary } = await import("./game-summary.tsx");

const APP = process.cwd();
// SYNTHETIC rows in the nba-hub row shape (no committed slate data: a slate-dependent fixture would turn main red as the
// schedule capture moves on). 30 rows: finals, upcoming and started, every one with two crests, as the window carries.
const TEAMS = [["BOS", "bos"], ["NYK", "ny"], ["MIA", "mia"], ["CHA", "cha"], ["LAL", "lal"], ["GSW", "gs"]];
const model = { rows: Array.from({ length: 30 }, (_, i) => {
  const [a, b] = [TEAMS[i % 6], TEAMS[(i + 1) % 6]];
  const status = i % 3 === 0 ? "final" : i % 3 === 1 ? "upcoming" : "started";
  return { id: `40190${9000 + i}`, startUtc: `2026-10-${String(20 + (i % 9)).padStart(2, "0")}T23:00:00Z`, startLabel: `Tue, Oct ${20 + (i % 9)} · 7:00 PM ET`,
    matchup: `${a[0]} @ ${b[0]}`, status, started: status !== "upcoming", read: null, reportState: "NONE", reportHref: null,
    reportNote: status === "final" ? `${a[0]} 101 – ${b[0]} 99` : null, participants: [{ name: a[0], logoTeam: a[1], logoSport: "nba" }, { name: b[0], logoTeam: b[1], logoSport: "nba" }], separator: "@" };
}) };
const html = renderToStaticMarkup(React.createElement(GameSummary, { rows: model.rows, unitLabel: "game", compact: true }));
const rows = html.match(/<li class="gtp-cr">[\s\S]*?<\/li>/g) ?? [];

test("every game in the window is still a row (nothing hidden)", () => {
  assert.equal(rows.length, model.rows.length);
});

test("the row carries one class per element and no inline style of its own (crests keep their per-size custom property)", () => {
  for (const r of rows) {
    const own = r.replace(/<span class="gtp-team-logo"[^>]*>[\s\S]*?<\/span>/g, "");
    assert.doesNotMatch(own, /style="/, "row styling belongs in globals.css .gtp-cr*");
  }
  const css = fs.readFileSync(path.join(APP, "src/app/globals.css"), "utf8");
  for (const c of [".gtp-cr {", ".gtp-cr-t {", ".gtp-cr-m {", ".gtp-cr-s {", ".gtp-cr-a {"]) assert.ok(css.includes(c), c);
});

test("per-row HTML stays bounded (measured 734 B on 2026-10-23; ~1,040 B when inlined)", () => {
  const per = rows.reduce((a, r) => a + Buffer.byteLength(r), 0) / rows.length;
  assert.ok(per < 800, `${Math.round(per)} B per compact row`);
});
