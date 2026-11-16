/**
 * NFL player evidence panel — synthetic props only, through the game page's REAL path:
 * fixture board → sanitizePlayerBoard → playerRows/gameTabs (the page's player tabs) → evidenceProjections → panel,
 * and the panel's LINES exactly as the page builds them: artifact-shaped offer rows → nflEvidenceLines (the line section's
 * own selection: nflPropLineInputs + nflCompareToLine). The board's per-player offer slot is never a source.
 * Run (from app/): npx tsx --test src/components/nfl/player-evidence-panel.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const { default: Panel } = await import("./player-evidence-panel.tsx");
const { estimateFamilies, gameTabs, playerRows, formatValue } = await import("../../lib/sports/nfl/forecast-view.mjs");
const { evidenceProjections } = await import("../../lib/sports/nfl/evidence-projections.mjs");
const { sanitizePlayerBoard } = await import("../../lib/sports/odds/public-offer-sanitizer.mjs");
const { nflEvidenceLines } = await import("../../lib/sports/nfl/evidence-line.mjs");

const KICK = "2026-11-16T18:00Z", EV = "700000009";
/* the section's comparison instant: 1 h after the fixture captures (inside the 12 h freshness window) */
const ASOF = "2026-11-15T18:00:00Z";
const e = (id, week, opp, rec, recYds, extra = {}) => ({ eventId: id, week, date: `2026-10-${String(week + 10).padStart(2, "0")}`, team: "NEW", opponent: opp, homeAway: "H", state: "STAT_LINE", stats: { targets: rec + 2, rec, recYds, ...extra } });
const gap = (id, week, opp) => ({ eventId: id, week, date: `2026-10-${String(week + 10).padStart(2, "0")}`, team: "NEW", opponent: opp, homeAway: "A", state: "NO_STAT_LINE" });
const LOG = [e("8", 8, "AAA", 5, 66), e("7", 7, "BBB", 7, 90), gap("6", 6, "CCC"), e("5", 5, "DDD", 4, 55), e("4", 4, "EEE", 6, 72, { recTd: 1 })];
const FULL = [...LOG.filter((x) => x.state === "STAT_LINE"), e("3", 3, "FFF", 5, 60)];
const A = "nfl-athlete-9", B = "nfl-athlete-10", C = "nfl-athlete-11";

const dist = (p10, p90) => ({ points: [{ q: 0.1, v: p10 }, { q: 0.9, v: p90 }] });
const FORECAST = { providerEventId: "e1", matchup: "OPP @ NEW", kickoffUtc: KICK, home: { abbr: "NEW" }, away: { abbr: "OPP" } };
/* official snapshot: A published in receptions + rec yards; B an ESTIMATE in rush yards; C projected in nothing usable */
const OFFICIAL = { snapshotId: "snap-1", eventId: "e1", sources: [], players: [
  { playerId: A, team: "NEW", participation: "ACTIVE", families: { player_receptions: { state: "PUBLISHED", median: 5, expected: 5.2, distribution: dist(3, 8) }, player_reception_yds: { state: "PUBLISHED", median: 61, expected: 63.4, distribution: dist(22, 104) } } },
  { playerId: B, team: "NEW", participation: "ACTIVE", families: { player_rush_yds: { state: "ESTIMATE", median: 48, expected: 50.1, distribution: dist(18, 85) } } },
  { playerId: C, team: "NEW", participation: "ACTIVE", families: { player_reception_yds: { state: "WITHHELD", median: 30, expected: 31 } } },
] };
const offer = (sportsbook, line, capturedAt = "2026-11-15T17:00:00Z") => ({ sportsbook, line, overOdds: -110, underOdds: -110, capturedAt });
const BOARD = (aRecMarket) => ({ providerEventId: EV, kickoffUtc: KICK, families: { player_receptions: { state: "PUBLISHED" }, player_reception_yds: { state: "PUBLISHED" }, player_rush_yds: { state: "ESTIMATE", reason: "CALIBRATION_FAILED" } }, players: [
  { playerId: A, name: "WR Nine", team: "NEW", markets: { player_receptions: { median: 5, market: aRecMarket }, player_reception_yds: { median: 61, market: offer("betonlineag", 58.5) } } },
  { playerId: B, name: "RB Ten", team: "NEW", markets: { player_rush_yds: { median: 48, market: offer("draftkings", 45.5) } } },
  { playerId: C, name: "WR Eleven", team: "NEW", markets: { player_reception_yds: { median: 30, market: offer("draftkings", 28.5) } } },
] });

/** the ARTIFACT rows for a scenario: by default one row per board offer slot (same book, line, capture time) */
const artifactRow = (playerId, market, o) => ({ canonicalEventId: `nfl-${EV}`, playerId, market, book: o.sportsbook, line: o.line, overPrice: o.overOdds, underPrice: o.underOdds, capturedAt: o.capturedAt });
const rowsFromSlots = (raw) => raw.players.flatMap((p) => Object.entries(p.markets).filter(([, m]) => m.market).map(([k, m]) => artifactRow(p.playerId, k, m.market)));
/** exactly what the game page does with a board (and, for lines, with the game's OPEN rows) */
function pageProps(rawBoard, evidence, rows = rowsFromSlots(rawBoard)) {
  const board = sanitizePlayerBoard(rawBoard);
  const view = { players: playerRows({ forecast: FORECAST, official: OFFICIAL, board }), estimates: estimateFamilies(board), unprojected: {} };
  const tabs = gameTabs(view);
  return { tabs, props: { players: board.players, evidence, projections: evidenceProjections(tabs), kickoffUtc: KICK, sourceNote: "src", __lines: nflEvidenceLines({ board, rows, asOf: ASOF }) } };
}
/* ON: the rule is open (the page passes nflEvidenceLines of the open rows); OFF: the rule is closed (lines null) */
const ON = "ON", OFF = "OFF";
const render = (p, mode = ON) => { const { __lines, ...rest } = p; return renderToStaticMarkup(React.createElement(Panel, { ...rest, lines: mode === ON ? __lines : null })); };
const famBlock = (html, player, fam) => { const i = html.indexOf(`data-evidence-player="${player}"`); const j = html.indexOf(`data-evidence-family="${fam}"`, i); return j < 0 ? null : html.slice(j, html.indexOf("</div></div>", j) + 12); };

test("B · the panel prints exactly the game page's rows: official values, Estimate for an estimate family, nothing official where the page has no row", () => {
  const { tabs, props } = pageProps(BOARD(offer("draftkings", 4.5)), { [A]: FULL, [B]: FULL, [C]: LOG });
  const html = render(props);
  const row = (k, id) => tabs.lists[k].find((r) => r.player.playerId === id)?.entry;
  // A · receptions and receiving yards: the page's formatted value and range, called official
  for (const [k, mk, unit] of [["receptions", "player_receptions", "rec"], ["receivingYards", "player_reception_yds", "yds"]]) {
    const en = row(k, A), kind = k === "receptions" ? "count" : "yards";
    const blk = famBlock(html, A, mk);
    assert.match(blk, /data-projection-state="OFFICIAL"/);
    assert.ok(blk.includes(`official projection ${formatValue(kind, en.value)} ${unit} (80% range ${formatValue(kind, en.p10)}–${formatValue(kind, en.p90)})`), `${mk}: ${blk.slice(0, 200)}`);
  }
  // B · rush yards is an ESTIMATE on the page: labelled estimate, never "official", and no line beside it
  const b = famBlock(html, B, "player_rush_yds");
  assert.ok(tabs.families.find((f) => f.key === "rushingYards").estimate, "the page labels the family an estimate");
  assert.match(b, /data-projection-state="ESTIMATE"/);
  assert.ok(b.includes(`estimate ${formatValue("yards", row("rushingYards", B).value)} yds`));
  assert.doesNotMatch(b, /· official projection/);
  assert.doesNotMatch(b, /over in \d\/5|45\.5/, "an estimate carries no line, so no hit rate");
  // C · WITHHELD in the snapshot ⇒ no page row ⇒ "no official projection", history only, no hit rate from the board's line
  assert.equal(row("receivingYards", C), undefined);
  const c = famBlock(html, C, "player_reception_yds");
  assert.match(c, /data-projection-state="NONE"/);
  assert.match(c, /no official projection/);
  assert.doesNotMatch(c, /28\.5|over in/);
  assert.match(html, /1 game with no stat line/);
  assert.match(html, /no stat line<\/td>/, "the missing game stays in the log");
});

test("A · a hit rate always names the line, the book and the capture time (ET); an ineligible operator's line is withheld", () => {
  const { props } = pageProps(BOARD(offer("draftkings", 4.5)), { [A]: FULL });
  const html = render(props);
  const rec = famBlock(html, A, "player_receptions");
  assert.match(rec, /data-line-state="COMPLETE"/);
  assert.ok(rec.includes("Last 5 vs today&#x27;s line 4.5 at DraftKings, captured Nov 15, 12:00 PM ET: over in 4/5"), rec);
  // receiving yards: the offer is betonlineag (ineligible) ⇒ sanitised to withheld ⇒ "withheld", no number, no rate
  const yds = famBlock(html, A, "player_reception_yds");
  assert.match(yds, /data-line-state="WITHHELD"/);
  assert.match(yds, /line is withheld and no hit rate is shown/);
  assert.doesNotMatch(yds, /58\.5|betonline|over in/);
  assert.doesNotMatch(html, /betonline/i);
});

test("A · a line at/after kickoff, or too old for the section ⇒ no hit rate; no capture instant or nothing captured ⇒ says none was captured", () => {
  for (const m of [offer("draftkings", 4.5, KICK), offer("draftkings", 4.5, "2026-11-16T19:00Z")]) {
    const blk = famBlock(render(pageProps(BOARD(m), { [A]: FULL }).props), A, "player_receptions");
    assert.match(blk, /data-line-state="NOT_BEFORE_KICKOFF"/);
    assert.doesNotMatch(blk, /over in/);
  }
  // captured 13 h before the section's comparison instant: the section calls it STALE and compares nothing ⇒ neither do we
  const stale = famBlock(render(pageProps(BOARD(offer("draftkings", 4.5, "2026-11-15T05:00:00Z")), { [A]: FULL }).props), A, "player_receptions");
  assert.match(stale, /data-line-state="UNUSABLE"/);
  assert.match(stale, /not one we compare against/);
  assert.doesNotMatch(stale, /over in|4\.5/);
  const noInstant = famBlock(render(pageProps(BOARD({ ...offer("draftkings", 4.5), capturedAt: null }), { [A]: FULL }).props), A, "player_receptions");
  assert.match(noInstant, /data-line-state="NO_LINE"/, "a row without a readable capture instant is never selected (nflChooseOffer)");
  assert.doesNotMatch(noInstant, /over in/);
  const none = famBlock(render(pageProps(BOARD(null), { [A]: FULL }).props), A, "player_receptions");
  assert.match(none, /No sportsbook line was captured for this market before kickoff, so no hit rate is shown\./);
  const partial = famBlock(render(pageProps(BOARD(offer("draftkings", 4.5)), { [A]: LOG }).props), A, "player_receptions");
  assert.match(partial, /data-line-state="INCOMPLETE"/);
  assert.match(partial, /line 4\.5 at DraftKings, captured Nov 15, 12:00 PM ET: .*not a full 5-game record/);
});

test("A · a printed book name carries BOOK_AVAILABILITY_NOTE on the same line; no book printed ⇒ no note", async () => {
  const { BOOK_AVAILABILITY_NOTE } = await import("../../lib/sports/odds/eligible-operators.mjs");
  const html = render(pageProps(BOARD(offer("draftkings", 4.5)), { [A]: FULL }).props);
  const rec = famBlock(html, A, "player_receptions");
  assert.match(rec, /at DraftKings, captured/);
  const line = rec.slice(rec.indexOf('data-line-state="COMPLETE"'), rec.indexOf("</div>", rec.indexOf('data-line-state="COMPLETE"')));
  assert.ok(line.includes(BOOK_AVAILABILITY_NOTE), `the note is on the hit-rate line itself: ${line}`);
  assert.equal(html.split(BOOK_AVAILABILITY_NOTE).length - 1, 1, "one note per printed book line (the withheld rec-yds line names no book)");
  for (const p of [pageProps(BOARD(null), { [A]: FULL }).props, pageProps(BOARD({ ...offer("draftkings", 4.5), capturedAt: null }), { [A]: FULL }).props]) {
    const h = render(p);
    assert.doesNotMatch(h, /at draftkings/i);
    assert.ok(!h.includes(BOOK_AVAILABILITY_NOTE), "no book printed ⇒ no note");
  }
});

test("players without evidence, or with no supported family, render nothing", () => {
  const { props } = pageProps(BOARD(null), {});
  assert.equal(render(props), "");
  assert.equal(render({ ...props, players: [{ playerId: A, name: "x", team: "NEW", markets: { weird: {} } }], projections: {}, evidence: { [A]: LOG } }), "");
});

test("switch OFF · history, chart, projection band and summaries only: no line state, hit rate, line value, book or availability note", async () => {
  const { BOOK_AVAILABILITY_NOTE } = await import("../../lib/sports/odds/eligible-operators.mjs");
  const { NO_RATE_TEXT } = await import("../../lib/sports/nfl/evidence-line.mjs");
  const boards = [BOARD(offer("draftkings", 4.5)), BOARD(null), BOARD({ ...offer("draftkings", 4.5), capturedAt: null })];
  for (const raw of boards) {
    for (const ev of [{ [A]: FULL, [B]: FULL, [C]: LOG }, { [A]: LOG }]) {
      const { props } = pageProps(raw, ev);
      const on = render(props, ON), off = render(props, OFF);
      assert.match(on, /data-line-state=/, "non-vacuous: the same props DO print a line state with the switch on");
      // the switch-off guard's pattern (nfl-prop-lines-switch-off.test.mjs), plus every line artefact the panel can print
      assert.doesNotMatch(off, /data-prop-line|nfl-prop-lines|sportsbook line|Not an over\/under market|Official projection not published/);
      assert.doesNotMatch(off, /data-line-state|data-book-availability-note|today&#x27;s line|over in|hit rate|sportsbook|withheld/i);
      assert.doesNotMatch(off, /draftkings|betonline/i, "no book name");
      assert.doesNotMatch(off, /\b(4\.5|45\.5|58\.5|28\.5)\b/, "no line value");
      assert.ok(!off.includes(BOOK_AVAILABILITY_NOTE));
      for (const t of Object.values(NO_RATE_TEXT)) assert.ok(!off.includes(t.replace(/'/g, "&#x27;")));
      // what stays: the actual games, the chart and band, the projection and the descriptive summaries
      assert.match(off, /data-evidence-player="nfl-athlete-9"/);
      assert.match(off, /data-projection-state="OFFICIAL"/);
      assert.match(off, /official projection /);
      assert.match(off, /class="ev-svg"/);
      assert.match(off, /class="ev-band"/);
      assert.match(off, /class="ev-med"/);
      assert.match(off, /Last 5 median /);
      assert.match(off, /model&#x27;s median and 80% range\./);
      assert.match(off, /<td>vs AAA<\/td>|vs AAA/);
    }
  }
  const { props } = pageProps(BOARD(offer("draftkings", 4.5)), { [A]: LOG });
  assert.match(render(props, OFF), /1 game with no stat line/);
  assert.match(render(props, OFF), /no stat line<\/td>/);
});

test("the section note never calls the chart a sportsbook line, in either state", () => {
  const { props } = pageProps(BOARD(offer("draftkings", 4.5)), { [A]: FULL });
  for (const d of [ON, OFF]) {
    const intro = render(props, d).match(/<p class="ev-intro">[\s\S]*?<\/p>/)?.[0];
    assert.ok(intro, "the section note is rendered");
    assert.match(intro, /dashed line and shaded band are the model&#x27;s median and 80% range\./);
    assert.doesNotMatch(intro, /sportsbook|betting line|not a [a-z ]*line/i);
  }
});
