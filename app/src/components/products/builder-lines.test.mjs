/**
 * /nfl/builder · LINES through the canonical rule (review of #1358).
 *   OPEN (a real encrypted artifact, the authorized-render key/dir pattern): every leg's line text, book label, ET
 *   capture time and price are exactly what the game page's line section shows for that player and family (the same
 *   rows, the same selection, the same instant); stale, after-kickoff and ineligible lines are refused with their own
 *   codes; an estimate / unofficial projection, a push and a yes/no market never make a leg.
 *   CLOSED (committed data, no key — every CI build): the page renders no line, price, book, record or tier wording,
 *   and no scenario card at all.
 * Run (from app/): npx tsx --test src/components/products/builder-lines.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;

import { FX_AS_OF, FX_BOARD, FX_EVENT, FX_OFFERS } from "../../lib/sports/nfl/__fixtures__/nfl-prop-line-synthetic.mjs";
import { NFL_LINES_DIR_ENV, NFL_LINES_SCHEMA, nflLinesAad } from "../../lib/sports/nfl/public-line-records.mjs";
import { encryptDisplayArtifact, ODDS_DISPLAY_KEY_ENV } from "../../lib/odds/display-crypto.mjs";
import { isEligibleOperator, isEligibleProvider, BOOK_AVAILABILITY_NOTE } from "../../lib/sports/odds/eligible-operators.mjs";
import { NFL_FAMILIES, NFL_PROP_LINE_ADAPTER, nflPropLineInputs } from "../../lib/sports/nfl/prop-line-adapter.mjs";
import { buildPropLineViews } from "../../lib/odds/prop-line-view.mjs";
import { nflOpenLineRecords } from "../../lib/sports/nfl/line-display-open.mjs";
import { nflEvidenceLines } from "../../lib/sports/nfl/evidence-line.mjs";
import { legCandidates } from "../../lib/sports/nfl/leg-candidates.mjs";
import { screenLegs } from "../../lib/sports/nfl/leg-screen.mjs";

const { publishedNflFamilies } = await import("../nfl/nfl-prop-lines.tsx");
const { default: SB } = await import("./scenario-builder.tsx");

function withEnv(vars, fn) {
  const before = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  try {
    for (const [k, v] of Object.entries(vars)) { if (v == null) delete process.env[k]; else process.env[k] = v; }
    return fn();
  } finally {
    for (const [k, v] of Object.entries(before)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
}
const ART_ROWS = FX_OFFERS.filter((o) => o.canonicalEventId === `nfl-${FX_EVENT}` && isEligibleOperator(o.book));
const BOARD = { ...FX_BOARD, players: FX_BOARD.players.map((p) => ({ ...p, eligibility: { state: "ELIGIBLE" } })) };
const g = (i, rec, recYds) => ({ eventId: `g${i}`, week: 9 - i, date: "2098-12-20", team: "AAA", opponent: "ZZZ", homeAway: "H", state: "STAT_LINE", stats: { rec, recYds, recTd: 1 } });
const LOGS = {
  "nfl-athlete-1": [[5, 70], [6, 70], [7, 70], [5, 70], [6, 50]].map(([r, y], i) => g(i, r, y)), // rec vs 4.5: 5/5 over; yds vs 64.5: 4/5 over
  "nfl-athlete-2": [[4, 30], [5, 30], [3.5, 30], [5, 30], [4, 30]].map(([r, y], i) => g(i, r, y)), // rec vs 3.5: a PUSH
  "nfl-athlete-3": [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0]].map(([r, y], i) => g(i, r, y)),
  "nfl-athlete-4": [[5, 20], [5, 20], [5, 20], [5, 20], [5, 20]].map(([r, y], i) => g(i, r, y)),
};
const off = (value) => ({ value, estimate: null });
/* the page's projections: PUBLISHED families official; passing / rushing yards (ESTIMATE on this board) estimates */
const PROJ = { [FX_EVENT]: {
  "nfl-athlete-1": { player_receptions: off(5.6), player_reception_yds: off(61.2), anytime_td: off(0.41) },
  "nfl-athlete-2": { player_receptions: off(3.5), player_reception_yds: off(30) },
  "nfl-athlete-3": { player_pass_yds: { value: 250, estimate: "Estimate: not an official projection" }, anytime_td: off(0.08) },
  "nfl-athlete-4": { player_receptions: off(2.4), player_reception_yds: off(18), player_rush_yds: { value: 70, estimate: "Estimate" } },
} };
const FAM = Object.fromEntries(["player_receptions", "player_reception_yds", "player_rush_yds", "player_pass_yds", "anytime_td"].map((f) => [f, { eligibleForOfficialProducts: true, gtpProbability: false }]));
const board = (id) => Object.values(NFL_FAMILIES).find((d) => d.board === id);

test("OPEN, real artifact: each leg is the game page section's line, price, book and time; every other pair is refused with its reason", () => {
  const key = crypto.randomBytes(32);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-nfl-builder-lines-"));
  fs.writeFileSync(path.join(dir, `${FX_EVENT}.json.enc`), encryptDisplayArtifact(JSON.stringify({ schema: NFL_LINES_SCHEMA, sport: "nfl", eventId: FX_EVENT, rows: ART_ROWS }), key, nflLinesAad(FX_EVENT)));
  try {
    withEnv({ [NFL_LINES_DIR_ENV]: dir, [ODDS_DISPLAY_KEY_ENV]: key.toString("hex") }, () => {
      const rows = nflOpenLineRecords(FX_EVENT);
      assert.equal(rows.length, ART_ROWS.length, "THE rule is open");
      const lines = nflEvidenceLines({ board: BOARD, rows, asOf: FX_AS_OF });
      const cands = legCandidates({ boards: [BOARD], evidenceByEvent: { [FX_EVENT]: LOGS }, now: FX_AS_OF, linesByEvent: { [FX_EVENT]: lines }, projectionsByEvent: PROJ });
      const r = screenLegs(cands, { families: FAM, isEligibleBook: isEligibleProvider });
      // the section, from the same rows at the same instant
      const views = buildPropLineViews(nflPropLineInputs({ board: BOARD, offers: rows, asOf: FX_AS_OF, families: publishedNflFamilies(BOARD) }).inputs, NFL_PROP_LINE_ADAPTER).rows;
      const view = (pid, fam) => views.find((v) => v.player.id === pid && board(fam) === NFL_FAMILIES[v.market.key]);
      assert.deepEqual(r.passed.map((l) => [l.playerId, l.family, l.side, l.tier]), [["nfl-athlete-1", "player_receptions", "over", "5/5"], ["nfl-athlete-1", "player_reception_yds", "over", "4/5"]]);
      for (const l of r.passed) {
        const v = view(l.playerId, l.family);
        assert.ok(v && (v.state === "COMPARED" || v.state === "DIRECTION_WITHHELD"), `${l.playerId} ${l.family}: the section compares this line`);
        assert.deepEqual([l.line.lineText, l.line.label, l.line.captured, l.line.price], [v.line.text, v.book.label, v.quotedAt.text, v.overPrice.value], `${l.playerId} ${l.family}`);
      }
      assert.deepEqual(r.reasons, {
        PROJECTION_NOT_OFFICIAL: 6, // athlete-3 passing + rushing yards, athlete-4 rushing yards (estimates) × 2 sides
        NO_OBSERVED_LINE: 2, // athlete-4 receiving yards × 2 (anytime TD is never a candidate: no row for it at all)
        PUSH_IN_RECORD: 2, // athlete-2 receptions, both sides
        LINE_NOT_COMPARED: 2, // athlete-2 receiving yards (stale), both sides
        LINE_NOT_CAPTURED_BEFORE_KICKOFF: 2, // athlete-4 receptions, both sides
        TREND_BELOW_4_OF_5: 2, // athlete-1's under sides
      }, JSON.stringify(r.reasons));
      // the reasons, pair by pair
      const why = Object.fromEntries(r.rejected.map((x) => [`${x.playerId}|${x.family}`, x.code]));
      assert.equal(why["nfl-athlete-2|player_receptions"], "PUSH_IN_RECORD", "3.5 receptions against a 3.5 line is a push");
      assert.equal(why["nfl-athlete-2|player_reception_yds"], "LINE_NOT_COMPARED", "the 20 h-old line: stale in the section");
      assert.equal(why["nfl-athlete-4|player_receptions"], "LINE_NOT_CAPTURED_BEFORE_KICKOFF");
      assert.equal(why["nfl-athlete-4|player_reception_yds"], "NO_OBSERVED_LINE", "only an ineligible book captured it ⇒ not in the artifact");
      assert.equal(why["nfl-athlete-1|anytime_td"], undefined, "anytime TD is not a builder leg: no candidate, no refusal");
      assert.ok(!cands.some((c) => c.family === "anytime_td"));
      assert.equal(why["nfl-athlete-3|player_pass_yds"], "PROJECTION_NOT_OFFICIAL");

      // the card prints the section's caption, the row's price, and the availability note beside the book
      /* one leg per player in a scenario: the second passed leg is shown as another player's (its line parts unchanged) */
      const legs = r.passed.map((l, i) => ({ playerId: i ? "nfl-athlete-99" : l.playerId, name: l.name, team: i ? "BBB" : l.team, eventId: l.eventId, kickoffUtc: l.kickoffUtc, family: l.family, side: l.side, line: l.line, tier: l.tier, decimal: l.decimal, probability: l.probability }));
      const html = renderToStaticMarkup(React.createElement(SB, { product: "moonshot", legs, candidates: cands.length, refusedBy: r.reasons, asOf: "slate" }));
      for (const l of r.passed) { const v = view(l.playerId, l.family); assert.ok(html.includes(`${v.line.text} at ${v.book.label}, captured ${v.quotedAt.text}`), `caption for ${l.family}`); }
      assert.ok(html.includes(BOOK_AVAILABILITY_NOTE));
      assert.match(html, /data-scenario-state="BUILT"/);
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("an ineligible operator's line (rows straight from a capture, not an artifact) is refused as INELIGIBLE_BOOK", () => {
  const lines = nflEvidenceLines({ board: BOARD, rows: FX_OFFERS, asOf: FX_AS_OF });
  const r = screenLegs(legCandidates({ boards: [BOARD], evidenceByEvent: { [FX_EVENT]: LOGS }, now: FX_AS_OF, linesByEvent: { [FX_EVENT]: lines }, projectionsByEvent: PROJ }), { families: FAM, isEligibleBook: isEligibleProvider });
  const why = Object.fromEntries(r.rejected.map((x) => [`${x.playerId}|${x.family}`, x.code]));
  assert.equal(why["nfl-athlete-4|player_reception_yds"], "INELIGIBLE_BOOK");
  assert.doesNotMatch(JSON.stringify(r.passed), /bovada/);
});

test("CLOSED (committed data, no key): the builder page carries no line, price, book, record or tier wording and no card", async () => {
  const { default: Page } = await import("../../app/nfl/builder/page.tsx");
  const html = withEnv({ [ODDS_DISPLAY_KEY_ENV]: null }, () => renderToStaticMarkup(React.createElement(Page)));
  assert.match(html, /Bank Builder and Moonshot, built from evidence/, "the page rendered");
  assert.match(html, /data-builder-state="UNAVAILABLE"/);
  assert.doesNotMatch(html, BUILDER_CLOSED_FORBIDDEN);
  assert.match(html, /href="\/nfl\/trends\/?"/, "the Trends link is back");
});

/** what a closed builder page must never print (shared with builder-rendered.test.mjs) */
const BUILDER_CLOSED_FORBIDDEN = /sportsbook|\bline\b|\blines\b|price|\bbook\b|\d\/5|\b[45] (?:for|of) 5\b|tier|data-scenario|data-leg|data-book-availability-note|hit rate|payout|parlay/i;

test("copy: eligibility is 'not ruled out on the injury report', never 'confirmed to play'; anytime TD's exclusion is stated", async () => {
  const page = fs.readFileSync(path.join(process.cwd(), "src/app/nfl/builder/page.tsx"), "utf8");
  const card = fs.readFileSync(path.join(process.cwd(), "src/components/products/scenario-builder.tsx"), "utf8");
  for (const src of [page, card]) assert.doesNotMatch(src, /confirmed (to play|eligible)/);
  assert.match(page, /not ruled out on the\s+injury report/);
  assert.match(page, /Anytime touchdown is not used: it has no over\/under line\./);
  const html = renderToStaticMarkup(React.createElement(SB, { product: "bankBuilder", legs: [], candidates: 4, refusedBy: { PLAYER_NOT_ELIGIBLE: 4 }, asOf: "slate" }));
  assert.match(html, /a player not ruled out on the injury report/);
  assert.match(html, /4<\/td><td>player ruled out on the injury report, or status not verified/);
  assert.doesNotMatch(html, /confirmed (to play|eligible)/);
});
