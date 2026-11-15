/**
 * NFL player evidence panel — synthetic props only.
 * Run (from app/): npx tsx --test src/components/nfl/player-evidence-panel.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const { default: Panel } = await import("./player-evidence-panel.tsx");

const e = (id, week, opp, rec, recYds, extra = {}) => ({ eventId: id, week, date: `2026-10-${String(week + 10).padStart(2, "0")}`, team: "NEW", opponent: opp, homeAway: "H", state: "STAT_LINE", stats: { targets: rec + 2, rec, recYds, ...extra } });
const gap = (id, week, opp) => ({ eventId: id, week, date: `2026-10-${String(week + 10).padStart(2, "0")}`, team: "NEW", opponent: opp, homeAway: "A", state: "NO_STAT_LINE" });
const LOG = [e("8", 8, "AAA", 5, 66), e("7", 7, "BBB", 7, 90), gap("6", 6, "CCC"), e("5", 5, "DDD", 4, 55), e("4", 4, "EEE", 6, 72, { recTd: 1 })];
const player = (markets) => ({ playerId: "nfl-athlete-9", name: "WR Nine", team: "NEW", markets });

test("no observed line ⇒ the panel says so and prints no hit rate or badge", () => {
  const html = renderToStaticMarkup(React.createElement(Panel, { players: [player({ player_reception_yds: { median: 61.2, p10: 22, p90: 104 }, anytime_td: { probability: 0.31 } })], evidence: { "nfl-athlete-9": LOG }, sourceNote: "src" }));
  assert.match(html, /No sportsbook line was captured for this market before kickoff, so no hit rate is shown\./);
  assert.doesNotMatch(html, /\d\/5/, "no N/5 claim without a line");
  assert.match(html, /official projection 61\.2 yds \(80% range 22–104\)/);
  assert.match(html, /1 game with no stat line/);
  assert.match(html, /no stat line<\/td>/, "the missing game stays in the log");
  assert.match(html, /Scored in 1 of last 4 recorded games/);
  assert.match(html, /not a sportsbook line/);
});

test("observed line with a gap in the window ⇒ partial record, no badge; complete window ⇒ badge + history caveat", () => {
  const withLine = { median: 5.1, market: { line: 4.5, sportsbook: "draftkings", capturedAt: "2026-11-15T12:00Z" } };
  const partial = renderToStaticMarkup(React.createElement(Panel, { players: [player({ player_receptions: withLine })], evidence: { "nfl-athlete-9": LOG }, sourceNote: "" }));
  assert.match(partial, /data-line-state="INCOMPLETE"/);
  assert.match(partial, /not a full 5-game record/);
  assert.doesNotMatch(partial, /over in \d\/5/);
  const full = [...LOG.filter((x) => x.state === "STAT_LINE"), e("3", 3, "FFF", 5, 60)];
  const html = renderToStaticMarkup(React.createElement(Panel, { players: [player({ player_receptions: withLine })], evidence: { "nfl-athlete-9": full }, sourceNote: "" }));
  assert.match(html, /over in 4\/5/);
  assert.match(html, /history, not a probability/);
});

test("players without evidence or without a supported market render nothing", () => {
  assert.equal(renderToStaticMarkup(React.createElement(Panel, { players: [player({ player_receptions: { median: 3 } })], evidence: {}, sourceNote: "" })), "");
  assert.equal(renderToStaticMarkup(React.createElement(Panel, { players: [player({ weird: { median: 3 } })], evidence: { "nfl-athlete-9": LOG }, sourceNote: "" })), "");
});
