/**
 * SHARED TRENDS · TWO RECORDS, NEVER MIXED (founder 2026-11-11): a MODEL-THRESHOLD record (games above the MODEL
 * PROJECTION — the table's counts, the 5/5 · 4/5 · 3/5 filter) never renders with a sportsbook-line label, and a
 * SPORTSBOOK-LINE record (the gated line block) never renders with a model label; no count or filter combines them.
 * Checked on both sports with lines present.
 * Run: npx tsx --test src/components/trends/trends-records.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;
process.env.__NEXT_TRAILING_SLASH = "true";
const NBA = await import("../../lib/sports/nba/trends.ts");
const { snapshotCases } = await import("../../lib/sports/nba/__fixtures__/trends-fixture.mjs");
const { default: NbaView } = await import("../nba/trends/trends-view.tsx");
const NFL = await import("../../lib/sports/nfl/trends.ts");
const { default: NflView } = await import("../nfl/trends/nfl-trends-view.tsx");
const { DISPLAY_AUTHORIZATION } = await import("../../lib/odds/display-authorization.mjs");
const { gatedLines } = await import("../../lib/trends/lines.ts");
const text = (h) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const LINE_LABEL = /SPORTSBOOK LINE|sportsbook line|\bline captured\b|\bat \d+(\.\d)?\b/;
const MODEL_LABEL = /MODEL PROJECTION|model threshold|\bmedian\b|projection/i;

// an NFL week with a (fixture-authorized) passing-yards line
const q = (id, team, att) => ({ playerId: `nfl-athlete-${id}`, name: `QB ${id}`, team, stats: { passYds: { p50: 220 }, passTd: { p50: 1 }, cmp: { p50: 22 }, passAtt: { p50: att }, int: { p50: 1 } } });
const games = [300, 221, 230, 200, 250].map((yds, i) => ({ providerEventId: `p${i}`, seasonType: 2, dateUtc: `2026-10-0${i + 1}T17:00Z`, home: "WAS", away: "DAL", ftHome: 20, ftAway: 17, players: [{ playerId: "nfl-athlete-1", teamAbbr: "WSH", passCmp: 20, passAtt: 30, passYds: yds, passTd: 1, passInt: 0 }] }));
const nflLines = gatedLines([{ athleteId: "1", stat: "passYds", family: "pass_yds", line: 224.5, capturedAt: "2026-11-10T18:00:00Z" }], {
  sport: "nfl", stats: ["passYds"],
  authorization: { ...DISPLAY_AUTHORIZATION, nfl: { ...DISPLAY_AUTHORIZATION.nfl, directionQualified: { ...DISPLAY_AUTHORIZATION.nfl.directionQualified, pass_yds: { qualified: true, evidence: "fixture", approvedBy: "fixture", approvedAt: "2026-11-11" } } } },
});
const nflModel = NFL.buildNflTrends({
  receipts: [{ eventId: "g1", eventStart: "2026-11-13T01:15Z", home: { abbr: "WSH" }, away: { abbr: "LAR" }, playerStatDistributions: [q("1", "WSH", 33)] }],
  games, teamInputsOf: () => ({ state: "KNOWN" }), lines: nflLines,
  eligibility: { asOf: "2026-11-10T22:00:00Z", injuries: { generatedAt: "2026-11-10T21:00:00Z", entries: [] }, roster: { generatedAt: "2026-11-10T21:00:00Z", teams: [{ teamAbbr: "WSH", providerTeamId: "28", players: [{ id: "1", status: { type: "active" } }] }] } },
});
const PAGES = {
  nba: renderToStaticMarkup(React.createElement(NbaView, { trends: snapshotCases(NBA).tonight })),
  nfl: renderToStaticMarkup(React.createElement(NflView, { trends: nflModel })),
};

for (const [sport, h] of Object.entries(PAGES)) {
  test(`${sport}: a model-threshold record never carries a sportsbook-line label`, () => {
    const cells = h.match(/<td data-trn-stat="[^"]+"[^]*?<\/td>/g) ?? [];
    assert.ok(cells.length >= 3, "model-threshold cells rendered");
    for (const c of cells) assert.doesNotMatch(text(c), LINE_LABEL, `${sport} cell: ${text(c)}`);
    const heads = h.match(/<th scope="col" data-trn-col="[^"]+">[^]*?<\/th>/g) ?? [];
    for (const th of heads) assert.doesNotMatch(text(th), /SPORTSBOOK LINE/, `${sport} header ${text(th)}`);
    // titles on the counts name the model figure only
    for (const t of h.matchAll(/<span title="([^"]+)">L\d+/g)) assert.doesNotMatch(t[1], /line/i);
  });

  test(`${sport}: a sportsbook-line record never carries a model label, always its own badge`, () => {
    const blocks = h.match(/<div hidden="" data-trn-hit="[^"]+" data-trn-record="line">[^]*?<\/div>/g) ?? [];
    assert.ok(blocks.length >= 1, "a line block rendered (lines present in the fixture)");
    for (const b of blocks) {
      assert.match(b, /<span class="trn-badge is-line">SPORTSBOOK LINE<\/span>/);
      assert.doesNotMatch(text(b), MODEL_LABEL, `${sport} line block: ${text(b)}`);
    }
    assert.equal((h.match(/SPORTSBOOK LINE/g) ?? []).length, blocks.length, "the badge appears on line records only");
  });
}

test("no count or filter combines the two: the 5/5 filter reads the model count even where a line exists", () => {
  const row = nflModel.rows[0];
  assert.deepEqual([row.windows[0].above.passYds, row.lines[0].hits[0].hit], [4, 3], "model 220: 4 of 5 · line 224.5: 3 of 5");
  assert.match(PAGES.nfl, /data-h5-passyds="4"/);
  assert.doesNotMatch(PAGES.nfl, /data-h5-passyds="3"/);
  assert.doesNotMatch(fs.readFileSync(path.join(process.cwd(), "src/components/trends/trends-board.tsx"), "utf8").replace(/\/\*[^]*?\*\//g, "").replace(/\/\/.*$/gm, ""), /h5Attrs[^]*?\.lines/, "the filter attribute never reads lines");
  const panel = fs.readFileSync(path.join(process.cwd(), "src/components/trends/trends-panel.tsx"), "utf8");
  assert.match(panel, />Sportsbook line record<\/h3>/, "the panel's line section is its own section");
  assert.match(panel, /<span className="gtp-kind-chip-lite">MODEL PROJECTION<\/span> \{spec\.referenceNote\}<\/h3>/, "and the model section its own");
});
