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
const LANE = JSON.parse(read("public/data/nba/experimental-public/latest.json"));

/* ── fixture: one slate, two past games, four players ─────────────────────────────────────────────────────────── */
const box = (id, dateUtc, players, { phase = 2, ft = [100, 90] } = {}) => ({
  doc: {
    providerEventId: id, phase, dateUtc, status: "STATUS_FINAL", boxscoreAvailable: true,
    teams: [{ providerTeamId: "1", abbr: "HHH", homeAway: "home" }, { providerTeamId: "2", abbr: "AAA", homeAway: "away" }],
    players: [
      ...players,
      // fillers so the team points equal the final
      { providerAthleteId: "fh", providerTeamId: "1", minutes: 10, pts: ft[0] - players.filter((p) => p.providerTeamId === "1" && Number.isInteger(p.minutes)).reduce((s, p) => s + p.pts, 0), reb: 0, ast: 0 },
      { providerAthleteId: "fa", providerTeamId: "2", minutes: 10, pts: ft[1] - players.filter((p) => p.providerTeamId === "2" && Number.isInteger(p.minutes)).reduce((s, p) => s + p.pts, 0), reb: 0, ast: 0 },
    ],
  },
  final: { state: "FINAL", ftHome: ft[0], ftAway: ft[1] },
});
const P = (id, team, minutes, pts, reb, ast, extra = {}) => ({ providerAthleteId: id, providerTeamId: team, minutes, pts, reb, ast, ...extra });
const SOURCES = [
  box("g1", "2026-11-05T00:00Z", [P("e", "1", 30, 20, 5, 4), P("d", "1", 20, 8, 2, 1), P("o", "2", 25, 12, 6, 3), P("x", "2", 15, 3, 1, 0)]),
  box("g2", "2026-11-07T00:00Z", [P("e", "1", 32, 10, 9, 2), P("d", "1", 0, 0, 0, 0, { didNotPlay: true }), P("o", "2", 22, 30, 1, 1), P("x", "2", 12, 4, 2, 2)]),
  box("g3", "2026-11-08T00:00Z", [P("e", "1", 30, 99, 9, 9)], { phase: 1 }), // preseason: never counted
  box("g4", "2026-11-09T00:30Z", [P("e", "1", 30, 99, 9, 9)]), // ET 2026-11-08 evening, before the slate: counted
  box("g5", "2026-11-10T00:30Z", [P("e", "1", 30, 99, 9, 9)]), // ET 2026-11-09 = the slate itself: never counted
];
const row = (id, name, injuryStatus, medians, expectedMinutes) => ({ providerAthleteId: id, name, injuryStatus, expectedMinutes, medians });
const lane = {
  date: "2026-11-09",
  games: [{
    providerEventId: "tonight", home: { abbr: "HHH" }, away: { abbr: "AAA" },
    players: {
      home: [row("e", "Eligible Eddie", null, { pts: 15, reb: 5, ast: 3 }, 30), row("d", "Doubtful Dan", "Day-To-Day", { pts: 7, reb: 2, ast: 1 }, 34)],
      away: [row("o", "Other Oscar", null, { pts: 12, reb: 4, ast: 2 }, 36)],
      unavailable: { away: [{ providerAthleteId: "x", name: "Out Xavier", reason: "RULED_OUT", status: "Out" }], home: [] },
    },
  }],
};

/* eligibility@1 inputs for the fixture: both captures fresh at NOW; d Day-To-Day, x Out on the injury report, u on no roster */
const NOW = "2026-11-09T20:00:00Z";
const rp = (id, status = "active") => ({ providerAthleteId: id, rosterStatusType: status });
const ELIG = {
  asOf: NOW,
  injuries: { generatedAt: "2026-11-09T19:00:00Z", entries: [
    { sport: "nba", providerTeamId: "1", athleteId: "d", athleteName: "Doubtful Dan", status: "Day-To-Day", statedAt: "2026-11-09T18:00:00Z" },
    { sport: "nba", providerTeamId: "2", athleteId: "x", athleteName: "Out Xavier", status: "Out", statedAt: "2026-11-09T18:00:00Z" },
  ] },
  roster: { capturedAt: "2026-11-09T19:00:00Z", teams: [
    { providerTeamId: "1", espnAbbr: "HHH", state: "CAPTURED", players: [rp("e"), rp("d", "day-to-day"), rp("m")] },
    { providerTeamId: "2", espnAbbr: "AAA", state: "CAPTURED", players: [rp("o"), rp("x")] },
  ] },
};
const opts = (slateIsToday = true, eligibility = ELIG) => ({ slateIsToday, eligibility });

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
    if ((feed ?? null) !== (lr.injuryStatus ?? null) || r.eligibility.state === "UNKNOWN") continue; // the report moved since the freeze, or a source is missing
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
  const json = JSON.stringify(T.trendsDrawerPayload(t)) + JSON.stringify(t);
  const keys = new Set([...json.matchAll(/"([A-Za-z_]+)":/g)].map((m) => m[1]));
  for (const k of keys) assert.doesNotMatch(k, /price|odds|line|book|american|decimal|vig|implied|market/i, `key ${k}`);
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
  assert.match(read("scripts/prune-internal-routes.mjs"), /\.\.\.TRENDS_ROUTES\]/);
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
