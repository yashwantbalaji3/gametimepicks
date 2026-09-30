/**
 * Phase A-1 · every sport hub opens with the SAME event card: participants (crest or initials), start,
 * lifecycle, the GameTimePicks read as the headline with its kind always printed, and one action. Render of
 * the shared component with fixtures + adapter source guards + a built check when the export is present.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;
const { default: GameSummary } = await import("../../components/sport-hub/game-summary.tsx");

const row = (over = {}) => ({
  id: "g1", startUtc: "2031-07-14T23:05:00Z", startLabel: "Mon, Jul 14 · 7:05 PM ET", matchup: "PHI @ ATL", status: "scheduled",
  started: false, read: { label: "ATL · PHI +1.5", kind: "MODEL_FORECAST", detail: "simulation" }, reportState: "READY", reportHref: "/games/mlb/phi-vs-atl-2031-07-14/",
  participants: [{ name: "PHI", logoTeam: "PHI", logoSport: "mlb" }, { name: "ATL", logoTeam: "ATL", logoSport: "mlb" }], separator: "@", ...over,
});
const html = (rows) => renderToStaticMarkup(React.createElement(GameSummary, { rows, unitLabel: "Games" }));

test("🔴 an event renders as a card with both sides, the read as its headline, its kind, and one action", () => {
  const h = html([row()]);
  assert.doesNotMatch(h, /<table/, "no spreadsheet table");
  assert.match(h, /<li[^>]*rounded-2xl/);
  assert.match(h, /PHI<\/span>[\s\S]*@[\s\S]*ATL<\/span>/, "both sides, in matchup order, with the separator");
  assert.match(h, /text-\[18px\] font-bold[^>]*>ATL · PHI \+1\.5</, "a model read is the headline");
  assert.match(h, /model forecast · simulation/, "the read's kind is always printed");
  assert.match(h, /Open report/);
  assert.match(h, /href="\/games\/mlb\/phi-vs-atl-2031-07-14\/?"/);
});

test("a market price is never given the forecast's weight, and is labelled as the market's", () => {
  const h = html([row({ read: { label: "Atlanta Braves · 64%", kind: "MARKET_PRICE", detail: "odds_api" } })]);
  assert.doesNotMatch(h, /text-\[18px\] font-bold[^>]*>Atlanta Braves/);
  assert.match(h, /market price · odds_api/);
});

test("fighters without crests get initials; an event with no report says why instead of linking", () => {
  const h = html([row({ matchup: "Natalia Silva vs Wang Cong", participants: [{ name: "Natalia Silva" }, { name: "Wang Cong" }], separator: "vs", read: null, reportState: "NONE", reportHref: null, reportNote: "not modelled — no tracked history" })]);
  assert.match(h, />NS</); assert.match(h, />WC</);
  assert.match(h, /No supported read for this game/);
  assert.match(h, /not modelled — no tracked history/);
  assert.doesNotMatch(h, /Open report/);
});

test("S1 · a model favourite is emphasised and its owner's published split is drawn; a market price gets neither", () => {
  const nfl = { label: "PIT 54.4%", kind: "MODEL_FORECAST", detail: "experimental", favored: "PIT", split: [{ label: "PIT", p: 0.544 }, { label: "CLE", p: 0.426 }] };
  const base = { matchup: "PIT @ CLE", participants: [{ name: "PIT", logoTeam: "PIT", logoSport: "nfl" }, { name: "CLE", logoTeam: "CLE", logoSport: "nfl" }], separator: "@" };
  const h = html([row({ ...base, read: nfl })]);
  assert.match(h, /\(model favourite\)/, "the favoured side is announced");
  assert.equal((h.match(/\(model favourite\)/g) ?? []).length, 1, "exactly one side is the favourite");
  assert.match(h, />54%</); assert.match(h, />43%</);
  assert.match(h, /width:54\.4%/, "the bar is the owner's number, not a rounded or derived one");
  const m = html([row({ ...base, read: { ...nfl, kind: "MARKET_PRICE" } })]);
  assert.doesNotMatch(m, /model favourite/, "a market price never marks a favourite");
  assert.doesNotMatch(m, /width:54\.4%/, "…and never draws the model's bar");
  const bad = html([row({ ...base, read: { ...nfl, split: [{ label: "PIT", p: 0.7 }, { label: "CLE", p: 0.6 }] } })]);
  assert.doesNotMatch(bad, /width:70%/, "an undrawable split is not drawn");
  const stranger = html([row({ ...base, read: { ...nfl, favored: "BAL" } })]);
  assert.doesNotMatch(stranger, /model favourite/, "a favourite that is not a side marks nobody");
});

test("rows without participants still render their matchup text (no invented sides)", () => {
  const h = html([row({ participants: undefined, separator: undefined, matchup: "TBD v TBD" })]);
  assert.match(h, />TBD v TBD</);
});

test("every adapter states participants for its sport (source guard)", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "src/lib/sport-hub/adapters.ts"), "utf8");
  assert.ok((src.match(/participants: \[/g) ?? []).length >= 4, "MLB/NFL (details), NFL period, EPL forecast + schedule rows");
  assert.match(src, /separator: "@" as const/); assert.match(src, /separator: "v" as const/); assert.match(src, /separator: "vs" as const/);
});

test("BUILT (when present): every hub's games section is cards, not a table", () => {
  for (const hub of ["mlb", "nfl", "epl", "ufc"]) {
    const f = path.join(process.cwd(), "out", hub, "index.html");
    if (!fs.existsSync(f)) continue;
    const h = fs.readFileSync(f, "utf8");
    const at = h.indexOf(`id="${hub}-games"`);
    if (at === -1) continue;
    const sect = h.slice(at, at + 20000);
    assert.doesNotMatch(sect.slice(0, sect.indexOf("</section>") > 0 ? sect.indexOf("</section>") : 8000), /<table/, `${hub}: games section has no table`);
  }
});
