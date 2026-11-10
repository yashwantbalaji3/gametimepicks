/**
 * Every final on a sport hub carries FINAL · settled (PD 2026-11-10, after #1304's prod check: /nba's "Forecast vs.
 * Actual · recent games" still printed "Final BKN 93 – DAL 130 · Official Forecast: …" on its old row, with no state tag).
 * Both hub row models — the NBA list's (hub-overview nbaGameRowModel) and every other hub's (game-summary hubRowModel) —
 * are the shared GameCard's, and only a SETTLED final is tagged: a final under review keeps its note and no tag.
 * Run: npx tsx --test src/components/game/hub-finals-tag.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;
process.env.__NEXT_TRAILING_SLASH = "true";
const { NbaGameList, nbaGameRowModel } = await import("../nba/hub-overview.tsx");
const { hubRowModel } = await import("../sport-hub/game-summary.tsx");
const { isSettledFinal } = await import("../../lib/sport-hub/contract.ts");
const { nbaHubFrom } = await import("../../lib/sport-hub/nba-hub.ts");

const APP = process.cwd();
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");
const text = (h) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const nbaRow = (id, extra) => ({ id, startUtc: "2026-11-09T00:00:00Z", startLabel: "Nov 8", matchup: "BKN @ DAL", status: "final", started: true, read: null, reportState: "NONE", reportHref: null, reportNote: "BKN 93 – DAL 130", participants: [{ name: "BKN", logoTeam: "bkn", logoSport: "nba" }, { name: "DAL", logoTeam: "dal", logoSport: "nba" }], separator: "@", ...extra });

test("isSettledFinal: a final unless the owner marks it under review", () => {
  assert.equal(isSettledFinal({ status: "final" }), true);
  assert.equal(isSettledFinal({ status: "final", resultState: "settled" }), true);
  assert.equal(isSettledFinal({ status: "final", resultState: "under-review" }), false);
  for (const status of ["scheduled", "in progress", "started or final", "postponed"]) assert.equal(isSettledFinal({ status }), false, status);
});

test("/nba recent games: the shared row — FINAL · settled on the score, MODEL PROJECTION on the frozen side, no tag under review", () => {
  const rows = [nbaRow("a", { resultState: "settled" }), nbaRow("b", { reportNote: "BKN 93 – DAL 130 (under review)", resultState: "under-review" }), nbaRow("c", { status: "scheduled", started: false, reportNote: "Official Forecast publishes on game day, before tip-off" })];
  const h = renderToStaticMarkup(React.createElement(NbaGameList, { rows, heading: "Forecast vs. Actual · recent games", forecasts: new Map([["a", "Dallas Mavericks"]]) }));
  const li = h.match(/<li\b[\s\S]*?<\/li>/g);
  assert.equal(li.length, 3);
  for (const l of li) assert.match(l, /^<li class="gtp-cr" data-game-card="row">/, "the shared card's row density");
  assert.match(text(li[0]), /FINAL · settled BKN 93 – DAL 130 MODEL PROJECTION Dallas Mavericks favoured/);
  assert.match(li[0], /data-game-state="final"[\s\S]*data-game-state="official"/);
  assert.doesNotMatch(li[0], /class="gtp-cr-s"/, "a settled final's tag replaces the status word");
  assert.doesNotMatch(li[1], /data-game-state="final"/, "under review: not settled, never tagged");
  assert.match(text(li[1]), /Final BKN 93 – DAL 130 \(under review\) no Official Forecast published/);
  assert.doesNotMatch(li[2], /data-game-state/, "an upcoming row states no result and no forecast");
  assert.match(text(li[2]), /Upcoming Official Forecast publishes on game day/);
  assert.equal(nbaGameRowModel(rows[0]).facts.length, 1, "no forecasts map (the upcoming list): the score only");
});

test("every other hub (hubRowModel): a settled final is tagged FINAL · settled, pointing at its report; nothing else is", () => {
  const base = { id: "x", startUtc: "2026-11-08T18:00:00Z", startLabel: "Nov 8", matchup: "PHI @ ATL", started: true, read: { kind: "MODEL_FORECAST", label: "ATL 61%", favored: "ATL" }, reportState: "ARCHIVE", reportHref: "/games/nfl/x/" };
  const fin = hubRowModel({ ...base, status: "final" }, "Games");
  assert.deepEqual(fin.facts.map((f) => [f.state, f.text]), [["official", "ATL 61%"], ["final", "result on the report"]]);
  assert.deepEqual(hubRowModel({ ...base, status: "final", reportState: "NONE", reportHref: null }, "Games").facts.at(-1), { state: "final", text: "game finished" });
  for (const status of ["in progress", "started or final", "scheduled"]) assert.ok(!hubRowModel({ ...base, status }, "Games").facts.some((f) => f.state === "final"), status);
});

test("REAL DATA: the /nba hub's own rows mark every settled final settled and every under-review final under review", () => {
  const schedule = JSON.parse(read("public/data/nba/schedule/latest.json"));
  const finals = JSON.parse(read("public/data/nba/results/finals-2026-27.json"));
  const hub = nbaHubFrom({ schedule, finals, nowIso: "2026-11-10T16:00:00Z" });
  const played = hub.rows.filter((r) => r.status === "final");
  assert.ok(played.length > 5, `${played.length} finals in the window`);
  for (const r of played) {
    assert.equal(r.resultState, /under review/.test(r.reportNote) ? "under-review" : "settled", r.id);
  }
  assert.match(read("src/app/nba/page.tsx"), /<NbaGameList rows=\{played\} heading="Forecast vs\. Actual · recent games"/);
});
