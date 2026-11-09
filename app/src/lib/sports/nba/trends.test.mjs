/**
 * NBA player trends (trends slice 2026-11-09): values are the graders' box-score figures, no price field exists in any
 * output, availability other than eligible is never ranked, the order never uses the history counts, and with the flag
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

test("counting rule: regular season before the slate, FINAL with agreeing points, measured lines only; 'above' is strictly greater", () => {
  const t = T.buildTrends(lane, SOURCES, { slateIsToday: true });
  assert.equal(t.gamesRead, 3, "g1, g2, g4 count; preseason g3 and the slate's own g5 do not");
  const e = t.rows.find((r) => r.playerId === "e");
  assert.deepEqual(e.games.map((g) => g.eventId), ["g4", "g2", "g1"], "newest first");
  assert.deepEqual(e.windows.find((w) => w.size === 5), { size: 5, played: 3, above: { pts: 2, reb: 2, ast: 2 } }, "20>15, 10<15, 99>15 · 5=5 is not above");
  const d = t.rows.find((r) => r.playerId === "d");
  assert.deepEqual(d.games.map((g) => g.eventId), ["g1"], "a DNP is not a game for him — never a 0");
});

test("availability: only eligible players are numbered; Day-To-Day is not verified, Out is ineligible, both unranked and listed", () => {
  const t = T.buildTrends(lane, SOURCES, { slateIsToday: true });
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
  const stale = T.buildTrends(lane, SOURCES, { slateIsToday: false });
  assert.ok(stale.rows.every((r) => r.rank == null && r.availability !== "eligible"));
});

test("the order never uses the history counts (a player above the median in every game does not move up)", () => {
  const hot = { ...lane, games: [{ ...lane.games[0], players: { ...lane.games[0].players, home: [row("e", "Eligible Eddie", null, { pts: 1, reb: 0, ast: 0 }, 1), lane.games[0].players.home[1]] } }] };
  const t = T.buildTrends(hot, SOURCES, { slateIsToday: true });
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
  if (fs.existsSync(out) && process.env.GTP_NBA_TRENDS_PUBLIC !== "1") assert.ok(!fs.existsSync(path.join(out, "trends")), "out/trends was pruned");
});
