/**
 * NBA player trends (trends slice 2026-11-09): values are the graders' box-score figures, no price field exists in any
 * output, availability is eligibility@1 only and anything but featurable-ELIGIBLE is never ranked (the same verdict as
 * the NBA Top Boards for the same player and slate), a minutes projection above 42 is shown but never numbered (NBA-MIN-01), the order never uses the history counts, and with the flag
 * off the route is a 404 that the prune deletes and the data route ships nothing.
 * Run: npx tsx --test src/lib/sports/nba/trends.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;
const T = await import("./trends.ts");
const { buildLaneTopBoards } = await import("./lane-top-boards.mjs");
const { resolveEligibility } = await import("../../availability/eligibility.mjs");
const { gradedBoxscore } = await import("./projection-board-actuals.ts");
const APP = process.cwd();
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");
const text = (h) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const LANE = JSON.parse(read("public/data/nba/experimental-public/latest.json"));

const { box, P, SOURCES, row, lane, NOW, rp, ELIG, opts, REC } = await import("./__fixtures__/trends-fixture.mjs");


test("counting rule: regular season before the slate, FINAL with agreeing points, measured lines only; 'above' is strictly greater", () => {
  const t = T.buildTrends(lane, SOURCES, opts());
  assert.equal(t.gamesRead, 3, "g1, g2, g4 count; preseason g3 and the slate's own g5 do not");
  const e = t.rows.find((r) => r.playerId === "e");
  assert.deepEqual(e.games.map((g) => g.eventId), ["g4", "g2", "g1"], "newest first");
  assert.deepEqual(e.windows.find((w) => w.size === 5), { size: 5, played: 3, above: { pts: 2, reb: 2, ast: 2 } }, "20>15, 10<15, 99>15 · 5=5 is not above");
  const d = t.rows.find((r) => r.playerId === "d");
  assert.deepEqual(d.games.map((g) => g.eventId), ["g1"], "a DNP is not a game for him — never a 0");
});

test("availability is eligibility@1 only: featurable ELIGIBLE is numbered; Day-To-Day (QUESTIONABLE) is not verified, Out is ineligible, both unranked and listed", () => {
  const t = T.buildTrends(lane, SOURCES, opts());
  const by = Object.fromEntries(t.rows.map((r) => [r.playerId, r]));
  assert.equal(by.e.availability, "eligible");
  assert.equal(by.o.availability, "eligible");
  assert.equal(by.d.availability, "not-verified");
  assert.equal(by.d.rank, null, "an unknown-availability player is not ranked");
  assert.equal(by.x.availability, "ineligible");
  assert.equal(by.x.rank, null);
  assert.equal(by.x.reference, null, "no projection → no reference, no counts");
  assert.equal(by.x.windows[0].above, null);
  assert.deepEqual(t.rows.map((r) => r.playerId), ["o", "e", "d", "x"], "eligible by expected minutes, then not verified, then ineligible");
  assert.deepEqual([by.o.rank, by.e.rank], [1, 2]);
  // a lane that is not tonight's: nobody is eligible, nobody is ranked
  const stale = T.buildTrends(lane, SOURCES, opts(false));
  assert.ok(stale.rows.every((r) => r.rank == null), "not tonight's slate: nobody is ranked");
  assert.ok(t.rows.every((r) => r.eligibility.contractVersion === "eligibility@1"), "every row carries its eligibility@1 record");
});

test("one source: the lane's injuryStatus is never read, and UNKNOWN (stale, missing or no roster record) is never ranked", () => {
  // the lane says nothing about "u", but his team's captured roster does not list him → INELIGIBLE (NOT_ON_ROSTER)
  const withU = { ...lane, games: [{ ...lane.games[0], players: { ...lane.games[0].players, away: [...lane.games[0].players.away, row("u", "Unknown Ulf", null, { pts: 9, reb: 3, ast: 1 }, 40)] } }] };
  const by = Object.fromEntries(T.buildTrends(withU, SOURCES, opts()).rows.map((r) => [r.playerId, r]));
  assert.equal(by.u.eligibility.state, "INELIGIBLE");
  assert.deepEqual(by.u.eligibility.reasons, ["NOT_ON_ROSTER"]);
  assert.equal(by.u.availability, "ineligible");
  assert.equal(by.u.rank, null);
  assert.equal(by.u.availabilityNote, "not eligible to play: no longer on the team's roster");
  // his team's roster was not captured → UNKNOWN (no roster record) → not verified, unranked
  const noAway = { ...ELIG, roster: { ...ELIG.roster, teams: [ELIG.roster.teams[0], { ...ELIG.roster.teams[1], state: "FAILED" }] } };
  const o = T.buildTrends(lane, SOURCES, opts(true, noAway)).rows.find((r) => r.playerId === "o");
  assert.deepEqual([o.eligibility.state, o.eligibility.reasons, o.availability, o.rank], ["UNKNOWN", ["NO_ROSTER_RECORD"], "not-verified", null]);
  assert.match(o.availabilityNote, /^availability not confirmed: not on any captured roster/);
  // a lane that calls "e" Out does not change his verdict: the injury report does
  const laneOut = { ...lane, games: [{ ...lane.games[0], players: { ...lane.games[0].players, home: [row("e", "Eligible Eddie", "Out", { pts: 15, reb: 5, ast: 3 }, 30), lane.games[0].players.home[1]] } }] };
  assert.equal(T.buildTrends(laneOut, SOURCES, opts()).rows.find((r) => r.playerId === "e").availability, "eligible");
  // stale captures (older than 6 h at asOf) or none at all: every player UNKNOWN, nobody ranked
  for (const eligibility of [{ ...ELIG, asOf: "2026-11-10T03:00:00Z" }, { asOf: NOW, injuries: null, roster: null }]) {
    const t = T.buildTrends(lane, SOURCES, opts(true, eligibility));
    assert.ok(t.rows.every((r) => r.rank == null), "nobody ranked");
    assert.ok(t.rows.filter((r) => r.playerId !== "x").every((r) => r.eligibility.state === "UNKNOWN"));
  }
  // the verdict is resolveEligibility's own for the same player, team and instant
  for (const r of T.buildTrends(lane, SOURCES, opts()).rows) {
    const team = { HHH: "1", AAA: "2" }[r.team];
    assert.equal(r.eligibility.state, resolveEligibility({ sport: "nba", playerId: r.playerId, teamId: team, asOf: NOW, injuries: ELIG.injuries, roster: ELIG.roster }).state, r.playerId);
  }
});

test("NBA-MIN-01: expected minutes above 42 keep the row with 'minutes projection under review' and leave the numbered list", () => {
  assert.equal(T.MINUTES_REVIEW_ABOVE, 42);
  const harden = { ...lane, games: [{ ...lane.games[0], players: { ...lane.games[0].players, home: [row("e", "Eligible Eddie", null, { pts: 15, reb: 5, ast: 3 }, 46.8), row("m", "Max Minutes", null, { pts: 9, reb: 3, ast: 2 }, 42), lane.games[0].players.home[1]] } }] };
  const t = T.buildTrends(harden, SOURCES, opts());
  const by = Object.fromEntries(t.rows.map((r) => [r.playerId, r]));
  assert.equal(by.e.availability, "eligible", "the eligibility verdict is unchanged");
  assert.equal(by.e.minutesUnderReview, true);
  assert.equal(by.e.rank, null, "46.8 expected minutes: not numbered");
  assert.equal(by.e.expectedMinutes, 46.8, "the model's figure is shown as published, never changed");
  assert.ok(by.e.reference && by.e.windows[0].above, "the row still shows its median and its history");
  assert.equal(by.m.minutesUnderReview, false, "exactly 42 is not above 42");
  assert.deepEqual(t.rows.filter((r) => r.rank != null).map((r) => [r.playerId, r.rank]), [["m", 1], ["o", 2]], "the minutes-ordered list skips the 46.8");
  assert.equal(T.trendsDrawerPayload(t).players.e.minutesUnderReview, true);
  return import("../../../components/nba/trends/trends-view.tsx").then(({ default: View }) => {
    const h = renderToStaticMarkup(React.createElement(View, { trends: t }));
    const eRow = /<tr[^>]*data-trn-player="e"[^]*?<\/tr>/.exec(h)[0];
    assert.match(eRow, /minutes projection under review/);
    assert.doesNotMatch(eRow, /class="trn-rank"/);
    assert.equal((h.match(/data-trn-minutes-review/g) ?? []).length, 1);
  });
});

test("PARITY with the NBA Top Boards: Trends ranks only players the Top Boards would rank, and gives the same verdict when both read the same report", () => {
  // fixture: the lane's designations are the injury report's (same instant) → identical verdicts, player by player
  const sameLane = { ...lane, schema: LANE.schema, games: lane.games.map((g) => ({ ...g, tipUtc: "2026-11-10T00:30Z" })) };
  const tb = buildLaneTopBoards(sameLane, { nowIso: NOW });
  const tbExcluded = new Set(tb.excluded.map((x) => x.providerAthleteId));
  const t = T.buildTrends(sameLane, SOURCES, opts());
  for (const r of t.rows.filter((x) => x.reference)) assert.equal(r.availability === "eligible", !tbExcluded.has(r.playerId), `${r.playerId}: Trends and Top Boards agree`);

  // REAL DATA, committed slate: eligibility@1 at the captures' own instant (fresh) vs the Top Boards over the same lane
  const read2 = (rel) => JSON.parse(fs.readFileSync(path.join(APP, "..", rel), "utf8"));
  const injuries = read2("data/internal/research/injuries/nba/latest.json");
  const roster = read2("data/internal/research/nba/rosters/latest.json");
  const asOf = [injuries.generatedAt, roster.capturedAt].sort().at(-1);
  const real = T.buildTrends(LANE, T.loadTrendSources(LANE.date), { slateIsToday: true, eligibility: { asOf, injuries, roster } });
  const board = buildLaneTopBoards(LANE, { nowIso: [LANE.generatedAt, ...LANE.games.map((g) => g.frozenAt)].filter(Boolean).sort().at(-1) });
  const withheld = new Set(board.excluded.map((x) => x.providerAthleteId));
  const laneRows = new Map(LANE.games.flatMap((g) => [...g.players.home, ...g.players.away]).map((p) => [String(p.providerAthleteId), p]));
  const ranked = real.rows.filter((r) => r.rank != null);
  for (const r of ranked) {
    assert.equal(r.eligibility.state, "ELIGIBLE", `${r.name}: ranked only when ELIGIBLE`);
    assert.ok(!withheld.has(r.playerId), `${r.name}: Trends never ranks a player the Top Boards withhold`);
  }
  let same = 0;
  for (const r of real.rows) {
    const lr = laneRows.get(r.playerId);
    if (!lr || !r.reference || r.minutesUnderReview) continue;
    const feed = r.eligibility.sources.injuries.status ?? null;
    // the report moved since the freeze, a source is missing, or the roster moved since the freeze (the Top Boards read the
    // frozen lane's roster; Lawson Lovering 2026-11-11: in the 08:23Z lane, off the 13:04Z LAL roster capture)
    if ((feed ?? null) !== (lr.injuryStatus ?? null) || r.eligibility.state === "UNKNOWN" || r.eligibility.reasons?.includes("NOT_ON_ROSTER")) continue;
    same += 1;
    assert.equal(r.availability === "eligible", !withheld.has(r.playerId), `${r.name}: same report, same verdict`);
  }
  assert.ok(same > 50, `compared ${same} players on the same report`);
});

test("the order never uses the history counts (a player above the median in every game does not move up)", () => {
  const hot = { ...lane, games: [{ ...lane.games[0], players: { ...lane.games[0].players, home: [row("e", "Eligible Eddie", null, { pts: 1, reb: 0, ast: 0 }, 1), lane.games[0].players.home[1]] } }] };
  const t = T.buildTrends(hot, SOURCES, opts());
  assert.equal(t.rows.find((r) => r.playerId === "e").rank, 2, "fewest expected minutes → last, however many games above");
});

test("REAL DATA: every game a row shows equals the graders' box score for that event, stat by stat", () => {
  const t = T.loadNbaTrends(LANE, LANE.date);
  assert.ok(t.rows.length > 0 && t.gamesRead > 0, "the committed slate and box scores produce rows");
  let checked = 0;
  for (const r of t.rows.slice(0, 40)) {
    for (const g of r.games) {
      const doc = gradedBoxscore(g.eventId);
      const a = doc.players.find((p) => String(p.providerAthleteId) === r.playerId);
      assert.ok(a, `${r.playerId} in ${g.eventId}`);
      for (const k of ["minutes", "pts", "reb", "ast"]) assert.equal(g[k], a[k], `${r.name} ${g.eventId} ${k}`);
      checked += 1;
    }
    const lr = LANE.games.flatMap((x) => [...x.players.home, ...x.players.away]).find((p) => String(p.providerAthleteId) === r.playerId);
    if (r.reference) for (const k of ["pts", "reb", "ast"]) assert.equal(r.reference[k], lr.medians[k], "the reference is the lane's own median");
  }
  assert.ok(checked > 50, `checked ${checked} player-games`);
});

test("no price field anywhere: rows, drawer payload and the rendered page carry no line, price, odds or book", () => {
  const t = T.loadNbaTrends(LANE, LANE.date);
  // the drawer file: no line-ish key at all; the rows: only the gated `lines` (page HTML only, see below), never a price
  const keysOf = (o) => new Set([...JSON.stringify(o).matchAll(/"([A-Za-z_]+)":/g)].map((m) => m[1]));
  for (const k of keysOf(T.trendsDrawerPayload(t))) assert.doesNotMatch(k, /price|odds|line|book|american|decimal|vig|implied|market/i, `drawer key ${k}`);
  for (const k of keysOf(t)) assert.doesNotMatch(k === "lines" ? "" : k, /price|odds|line|book|american|decimal|vig|implied|market/i, `row key ${k}`);
  return import("../../../components/nba/trends/trends-view.tsx").then(({ default: View }) => {
    const h = renderToStaticMarkup(React.createElement(View, { trends: t }));
    assert.match(h, /MODEL PROJECTION/);
    assert.match(h, /History, not a probability/);
    const visible = h.replace(/<[^>]+>/g, " ");
    const bad = /.{0,40}(\d\s?%|(?<![\d.])[+-]\d{3}\b).{0,20}/i.exec(visible);
    assert.equal(bad, null, `no percentage and no American price in the page: ${bad?.[0]}`);
    const ranked = [...h.matchAll(/data-trn-availability="(\w[\w-]*)"[^]*?<\/th>/g)].map((m) => [m[1], /class="trn-rank"/.test(m[0])]);
    assert.ok(ranked.every(([a, r]) => (a === "eligible") || !r), "no rank number on a not-verified or ineligible row");
  });
});

test("flag OFF: the page 404s outside the literal flag branch, the prune deletes it, the data route ships nothing", async () => {
  const page = read("src/app/trends/page.tsx");
  assert.match(page, /if \(process\.env\.GTP_NBA_TRENDS_PUBLIC === "1"\) \{[^]*?\n  \}\n  notFound\(\);\n\}/, "notFound() whenever the literal flag branch is not taken");
  assert.doesNotMatch(page, /^import [^\n]*(trends-view|lib\/sports\/nba\/trends)/m, "the view and loader are imported only inside the branch");
  assert.match(read("next.config.mjs"), /GTP_NBA_TRENDS_PUBLIC: process\.env\.GTP_NBA_TRENDS_PUBLIC === "1" \? "1" : "0"/);
  assert.match(read("scripts/prune-internal-routes.mjs"), /const TRENDS_ROUTES = process\.env\.GTP_NBA_TRENDS_PUBLIC === "1" \? \[\] : \["trends"\];/);
  assert.match(read("scripts/prune-internal-routes.mjs"), /\.\.\.TRENDS_ROUTES[,\]]/);
  const prev = process.env.GTP_NBA_TRENDS_PUBLIC; delete process.env.GTP_NBA_TRENDS_PUBLIC;
  try {
    const { GET } = await import("../../../app/data/nba-trends.json/route.ts");
    assert.deepEqual(await (await GET()).json(), { disabled: true });
  } finally { if (prev !== undefined) process.env.GTP_NBA_TRENDS_PUBLIC = prev; }
  // and when the export exists from a flag-OFF build, there is no /trends page in it
  const out = path.join(APP, "out");
  // (the export's own data file says which build made it: a flag-OFF build writes {"disabled":true})
  const dataFile = path.join(out, "data", "nba-trends.json");
  const builtOff = fs.existsSync(dataFile) ? JSON.parse(fs.readFileSync(dataFile, "utf8")).disabled === true : fs.existsSync(out);
  if (builtOff) {
    assert.ok(!fs.existsSync(path.join(out, "trends")), "out/trends was pruned");
    if (fs.existsSync(dataFile)) assert.deepEqual(JSON.parse(fs.readFileSync(dataFile, "utf8")), { disabled: true }, "no trends data ships");
  }
});

test("tonight's matchup reads from the player's side: home 'vs', away '@'", () => {
  const t = T.buildTrends(lane, SOURCES, opts());
  const by = Object.fromEntries(t.rows.map((r) => [r.playerId, r]));
  assert.equal(by.e.home, true);
  assert.equal(by.o.home, false);
  return import("../../../components/nba/trends/trends-view.tsx").then(({ default: View }) => {
    const h = renderToStaticMarkup(React.createElement(View, { trends: t }));
    assert.match(h, /HHH vs AAA/);
    assert.match(h, /AAA @ HHH/);
  });
});

/* ── slice 2: lines only through the display gate; hit counts; no line in the drawer file; no price anywhere ───── */
const { DISPLAY_AUTHORIZATION } = await import("../../odds/display-authorization.mjs");

test("hit rate at a line: games strictly above the line in the last 5 / 10 / 20 played (fixture)", () => {
  const games = [30, 12, 25, 25, 8, 40, 19, 25].map((pts, i) => ({ eventId: `g${i}`, pts, reb: 0, ast: 0 }));
  assert.deepEqual(T.hitRateAtLine(games, "pts", 24.5), [{ size: 5, played: 5, hit: 3 }, { size: 10, played: 8, hit: 5 }, { size: 20, played: 8, hit: 5 }]);
  assert.deepEqual(T.hitRateAtLine(games, "pts", 25)[0], { size: 5, played: 5, hit: 1 }, "a whole-number line met exactly is not a hit");
  // through buildTrends: Eddie's PTS history newest first 99 (g4), 10 (g2), 20 (g1) at 15.5 → 2 of 3
  const lines = T.gatedTrendLines([REC("e", "pts", 15.5)]);
  const e = T.buildTrends(lane, SOURCES, { ...opts(), lines }).rows.find((r) => r.playerId === "e");
  assert.deepEqual(e.lines, [{ stat: "pts", line: 15.5, capturedAt: "2026-11-09T17:00:00Z", hits: [{ size: 5, played: 3, hit: 2 }, { size: 10, played: 3, hit: 2 }, { size: 20, played: 3, hit: 2 }] }]);
});

test("the gate: no line unless the site surface AND the family's direction are authorized; only line + capture time survive", () => {
  const recs = [REC("e", "pts", 15.5), REC("e", "threePm", 1.5), REC("o", "ast", 2.5, "2026-11-09T16:00:00Z"), REC("o", "ast", 3.5, "2026-11-09T18:00:00Z"), REC("o", "reb", "n/a")];
  const ok = T.gatedTrendLines(recs);
  assert.deepEqual([...ok.entries()], [["e|pts", { line: 15.5, capturedAt: "2026-11-09T17:00:00Z" }], ["o|ast", { line: 3.5, capturedAt: "2026-11-09T18:00:00Z" }]], "threePm is unqualified; a malformed line is dropped; the newest capture wins");
  for (const v of ok.values()) assert.deepEqual(Object.keys(v).sort(), ["capturedAt", "line"], "no price, book or odds field survives");
  // site display switched off → nothing; a family unqualified → nothing; no records (no key / no file) → null
  const off = { ...DISPLAY_AUTHORIZATION, nba: { ...DISPLAY_AUTHORIZATION.nba, siteDisplay: false } };
  assert.equal(T.gatedTrendLines(recs, { authorization: off }).size, 0);
  const unq = { ...DISPLAY_AUTHORIZATION, nba: { ...DISPLAY_AUTHORIZATION.nba, directionQualified: {} } };
  assert.equal(T.gatedTrendLines(recs, { authorization: unq }).size, 0);
  assert.equal(T.gatedTrendLines(null), null);
  // nothing authorized → no line rendered anywhere on the page
  return import("../../../components/nba/trends/trends-view.tsx").then(({ default: View }) => {
    const none = renderToStaticMarkup(React.createElement(View, { trends: T.buildTrends(lane, SOURCES, { ...opts(), lines: T.gatedTrendLines(recs, { authorization: off }) }) }));
    assert.doesNotMatch(none, /data-trn-hit|15\.5|at \d+\.\d/);
    const shown = renderToStaticMarkup(React.createElement(View, { trends: T.buildTrends(lane, SOURCES, { ...opts(), lines: ok }) }));
    const block = /<div hidden="" data-trn-hit="e" data-trn-record="line">[^]*?<\/div>/.exec(shown)?.[0];
    assert.ok(block, "the gated block is written into the page for the drawer");
    assert.match(text(block), /PTS at 15\.5 hit 2 of 3 \(last 5\) · hit 2 of 3 \(last 10\) · hit 2 of 3 \(last 20\) line captured Nov 9, 12:00 PM ET/);
    assert.match(block, /Observed record, not a probability/);
    assert.doesNotMatch(shown, /somebook|-115|-105|overAmerican|underAmerican|odds/i, "never a book, price or odds");
  });
});

test("the drawer file never carries a line (provider terms: display yes, a downloadable feed no)", () => {
  const t = T.buildTrends(lane, SOURCES, { ...opts(), lines: T.gatedTrendLines([REC("e", "pts", 15.5)]) });
  assert.equal(t.rows.find((r) => r.playerId === "e").lines.length, 1);
  const json = JSON.stringify(T.trendsDrawerPayload(t));
  assert.doesNotMatch(json, /"lines?"|15\.5|capturedAt/, "no line, no capture time in /data/nba-trends.json");
  assert.match(read("src/lib/sports/nba/trends.ts"), /gatedTrendLines\(nbaPublicLineRecords\(lane\.date\)\)/, "the build reads lines only through the gated reader");
  for (const f of ["trends-panel.tsx", "trends-filters.tsx"]) assert.doesNotMatch(read(`src/components/trends/${f}`), /lib\/odds|public-line-records|line-publication/, `${f} (client) never imports a line source`);
});

test("EXPORT (flag-ON build): no price, odds or book in /trends or its drawer file", () => {
  const html = path.join(APP, "out", "trends", "index.html"), data = path.join(APP, "out", "data", "nba-trends.json");
  if (!fs.existsSync(html)) return; // a flag-OFF export: the prune test above covers it
  for (const f of [html, path.join(APP, "out", "trends", "index.txt"), data].filter((x) => fs.existsSync(x))) {
    const all = fs.readFileSync(f, "utf8");
    // pages: the trends section only — the site footer credits "The Odds API" (a link) on every page, which is
    // attribution, not a price; the section ends before it
    let body = all;
    if (!f.endsWith(".json")) {
      const from = all.indexOf("trn-root");
      assert.ok(from > 0, `${path.basename(f)}: the trends section is in the file`);
      body = all.slice(from).split(/the-odds-api|The Odds API/)[0];
      assert.ok(body.includes("trn-table"), `${path.basename(f)}: the section reaches the table`);
    }
    const visible = f.endsWith(".html") ? body.replace(/<script[^]*?<\/script>/g, "").replace(/<[^>]+>/g, " ") : body;
    assert.doesNotMatch(visible, /(?<![\w.:-])[+-]\d{3}(?!\d)/, `${path.basename(f)}: an American price`);
    assert.doesNotMatch(body, /overAmerican|underAmerican|overPrice|underPrice|"book"|sportsbook odds|\bodds\b/i, `${path.basename(f)}: a price or odds field`);
  }
  if (fs.existsSync(data)) assert.doesNotMatch(fs.readFileSync(data, "utf8"), /"lines?"|capturedAt/, "the drawer file carries no line");
});
