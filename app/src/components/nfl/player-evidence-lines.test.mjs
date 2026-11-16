/**
 * Recent form panel · OPEN state fed with a real ENCRYPTED line artifact (the authorized-render key/dir pattern):
 *   - the panel's line for (player, family) is exactly the line the page's line section displays — value text, book
 *     label and ET quote time — and a pair the section does not compare gets no hit rate;
 *   - the public board's per-player offer slot is ignored, even when present and different;
 *   - a push (value == line) is reported, never folded into the over count.
 * Run (from app/): npx tsx --test src/components/nfl/player-evidence-lines.test.mjs
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
import { isEligibleOperator } from "../../lib/sports/odds/eligible-operators.mjs";
import { NFL_FAMILIES, NFL_PROP_LINE_ADAPTER, nflPropLineInputs } from "../../lib/sports/nfl/prop-line-adapter.mjs";
import { buildPropLineViews } from "../../lib/odds/prop-line-view.mjs";
import { nflOpenLineRecords } from "../../lib/sports/nfl/line-display-open.mjs";
import { nflEvidenceLines } from "../../lib/sports/nfl/evidence-line.mjs";

const { default: NflPropLines, publishedNflFamilies } = await import("./nfl-prop-lines.tsx");
const { default: Panel } = await import("./player-evidence-panel.tsx");

function withEnv(vars, fn) {
  const before = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  try {
    for (const [k, v] of Object.entries(vars)) { if (v == null) delete process.env[k]; else process.env[k] = v; }
    return fn();
  } finally {
    for (const [k, v] of Object.entries(before)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
}
/* the artifact holds what a real one may: this event's rows from eligible books only (validateNflLineArtifact) */
const ART_ROWS = FX_OFFERS.filter((o) => o.canonicalEventId === `nfl-${FX_EVENT}` && isEligibleOperator(o.book));
function artifactDir(key) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-nfl-evidence-lines-"));
  fs.writeFileSync(path.join(dir, `${FX_EVENT}.json.enc`), encryptDisplayArtifact(JSON.stringify({ schema: NFL_LINES_SCHEMA, sport: "nfl", eventId: FX_EVENT, rows: ART_ROWS }), key, nflLinesAad(FX_EVENT)));
  return dir;
}
const strip = (h) => h.replace(/<!-- -->/g, "");
const boardFamily = (f) => NFL_FAMILIES[f].board;
const e = (w, rec, recYds) => ({ eventId: `g${w}`, week: w, date: `2098-12-${String(w + 10).padStart(2, "0")}`, team: "AAA", opponent: "ZZZ", homeAway: "H", state: "STAT_LINE", stats: { rec, recYds } });
const LOGS = { "nfl-athlete-1": [e(9, 5, 70), e(8, 4, 64.5), e(7, 6, 50), e(6, 4, 66), e(5, 3, 80)], "nfl-athlete-2": [e(9, 3.5, 40), e(8, 4, 20), e(7, 1, 31), e(6, 3.5, 28), e(5, 5, 10)] };
const proj = (value) => ({ value, p10: null, p90: null, kind: "count", text: String(value), range: null, estimate: null, market: null });
const PROJ = Object.fromEntries(Object.keys(LOGS).map((id) => [id, Object.fromEntries(Object.entries(FX_BOARD.players.find((p) => p.playerId === id).markets).filter(([k]) => k !== "anytime_td").map(([k, m]) => [k, proj(m.median)]))]));
const block = (html, player, fam) => { const i = html.indexOf(`data-evidence-player="${player}"`); const j = html.indexOf(`data-evidence-family="${fam}"`, i); return j < 0 ? null : html.slice(j, html.indexOf("</div></div>", j) + 12); };

test("open, real artifact: the panel's line == the line section's displayed line for every pair; uncompared pairs get no hit rate", () => {
  const key = crypto.randomBytes(32);
  const dir = artifactDir(key);
  try {
    withEnv({ [NFL_LINES_DIR_ENV]: dir, [ODDS_DISPLAY_KEY_ENV]: key.toString("hex") }, () => {
      const rows = nflOpenLineRecords(FX_EVENT);
      assert.ok(Array.isArray(rows) && rows.length === ART_ROWS.length, "THE rule is open and returns the artifact's rows");
      // the section, exactly as NflPropLines builds it from these rows at this instant
      const sectionHtml = strip(renderToStaticMarkup(React.createElement(NflPropLines, { board: FX_BOARD, offers: rows, asOf: FX_AS_OF })));
      const views = buildPropLineViews(nflPropLineInputs({ board: FX_BOARD, offers: rows, asOf: FX_AS_OF, families: publishedNflFamilies(FX_BOARD) }).inputs, NFL_PROP_LINE_ADAPTER).rows;
      const shown = views.filter((v) => v.state === "COMPARED" || v.state === "DIRECTION_WITHHELD");
      assert.ok(shown.length >= 3, "non-vacuous: the section shows several qualified lines");
      // the panel's lines, exactly as the page builds them
      const lines = nflEvidenceLines({ board: FX_BOARD, rows, asOf: FX_AS_OF });
      const observed = Object.entries(lines).filter(([, v]) => v.state === "OBSERVED").map(([k, v]) => `${k}|${v.lineText}|${v.sportsbook}|${v.captured}`).sort();
      const expected = shown.map((v) => `${v.player.id}|${boardFamily(v.market.key)}|${v.line.text}|${v.book.label}|${v.quotedAt.text}`).sort();
      assert.deepEqual(observed, expected, "the same pairs, the same line text, book label and quote time");
      for (const v of shown) {
        assert.ok(sectionHtml.includes(v.line.text) && sectionHtml.includes(v.book.label), `the section prints ${v.line.text} at ${v.book.label}`);
      }
      // pairs the section shows but does NOT compare (stale, after kickoff): never OBSERVED
      for (const v of views.filter((x) => !shown.includes(x) && NFL_FAMILIES[x.market.key].kind === "OU")) {
        const k = `${v.player.id}|${boardFamily(v.market.key)}`;
        if (lines[k]) assert.notEqual(lines[k].state, "OBSERVED", `${k} (${v.state})`);
      }
      assert.equal(lines["nfl-athlete-2|player_reception_yds"].state, "UNUSABLE", "the STALE row");
      assert.equal(lines["nfl-athlete-4|player_receptions"].state, "NOT_BEFORE_KICKOFF", "the after-kickoff row");
      assert.equal(lines["nfl-athlete-4|player_reception_yds"].state, "NO_LINE", "only an ineligible book captured ⇒ not in the artifact ⇒ no line");
      assert.equal(lines["nfl-athlete-1|anytime_td"], undefined, "a yes/no market is never a line");
      assert.equal(lines["nfl-athlete-3|player_pass_yds"], undefined, "a non-PUBLISHED family is not compared by the section ⇒ no entry");

      // the panel rendered with those lines prints each section line in the right family block
      const html = renderToStaticMarkup(React.createElement(Panel, { players: FX_BOARD.players, evidence: LOGS, projections: PROJ, sourceNote: "src", lines }));
      for (const v of shown.filter((x) => LOGS[x.player.id])) {
        const blk = block(html, v.player.id, boardFamily(v.market.key));
        assert.ok(blk.includes(`today&#x27;s line ${v.line.text} at ${v.book.label}, captured ${v.quotedAt.text}`), `${v.player.id} ${v.market.key}: ${blk}`);
      }
      // athlete-1 receptions vs 4.5 (DraftKings wins the time tie over FanDuel 5.5): 5,4,6,4,3 ⇒ over in 2/5
      assert.ok(block(html, "nfl-athlete-1", "player_receptions").includes("line 4.5 at DraftKings, captured Jan 10, 10:00 AM ET: over in 2/5."));
      // athlete-2 receptions vs 3.5 (BetMGM): 3.5, 4, 1, 3.5, 5 ⇒ 2 over, 2 pushes, 1 under
      assert.ok(block(html, "nfl-athlete-2", "player_receptions").includes("line 3.5 at BetMGM, captured Jan 10, 10:00 AM ET: over in 2/5, 2 pushes."));
      assert.match(block(html, "nfl-athlete-2", "player_reception_yds"), /data-line-state="UNUSABLE"/);
      assert.doesNotMatch(block(html, "nfl-athlete-2", "player_reception_yds"), /29\.5|over in/);
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("the board's offer slot is ignored, even when present and different from the artifact", () => {
  const slotBoard = { ...FX_BOARD, players: FX_BOARD.players.map((p) => p.playerId === "nfl-athlete-1"
    ? { ...p, markets: { ...p.markets, player_receptions: { ...p.markets.player_receptions, market: { sportsbook: "fanduel", line: 9.5, overOdds: -110, underOdds: -110, capturedAt: "2099-01-10T15:30:00Z" } } } }
    : p) };
  const rows = ART_ROWS;
  const a = nflEvidenceLines({ board: slotBoard, rows, asOf: FX_AS_OF }), b = nflEvidenceLines({ board: FX_BOARD, rows, asOf: FX_AS_OF });
  assert.deepEqual(a, b, "the slot changes nothing");
  assert.equal(a["nfl-athlete-1|player_receptions"].lineText, "4.5");
  const html = renderToStaticMarkup(React.createElement(Panel, { players: slotBoard.players, evidence: LOGS, projections: PROJ, sourceNote: "src", lines: a }));
  assert.doesNotMatch(html, /9\.5/);
  // a slot with NO artifact line for the pair ⇒ "none captured", never the slot's line
  const noRow = nflEvidenceLines({ board: slotBoard, rows: rows.filter((r) => !(r.playerId === "nfl-athlete-1" && r.market === "player_receptions")), asOf: FX_AS_OF });
  assert.equal(noRow["nfl-athlete-1|player_receptions"].state, "NO_LINE");
  const h2 = renderToStaticMarkup(React.createElement(Panel, { players: slotBoard.players, evidence: LOGS, projections: PROJ, sourceNote: "src", lines: noRow }));
  assert.doesNotMatch(h2, /9\.5/);
  assert.match(block(h2, "nfl-athlete-1", "player_receptions"), /No sportsbook line was captured for this market before kickoff/);
  // closed rule (rows null) ⇒ no lines at all, whatever the slot holds
  assert.equal(nflEvidenceLines({ board: slotBoard, rows: null, asOf: FX_AS_OF }), null);
});
