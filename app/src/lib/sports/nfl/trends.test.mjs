/**
 * NFL QB trends on the shared Trends board (trends-shared 2026-11-11): the adapter on a fixture (logs, threshold counts,
 * order, R5, eligibility@1 with the starter rule), the 5/5 · 4/5 · 3/5 filter counts, no line unless the NFL family is
 * display- AND direction-authorized and never a price, eligibility parity with the NFL participation gate, the flag-OFF
 * wiring, and real committed data (every log row equals the player-events box score).
 * Run: npx tsx --test src/lib/sports/nfl/trends.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;
process.env.__NEXT_TRAILING_SLASH = "true";
const T = await import("./trends.ts");
const { gatedLines } = await import("../../trends/lines.ts");
const { DISPLAY_AUTHORIZATION } = await import("../../odds/display-authorization.mjs");
const { resolveEligibility } = await import("../../availability/eligibility.mjs");
const { opportunityEligibility, teamIdsFromRoster } = await import("./participation-eligibility.mjs");
const { default: View } = await import("../../../components/nfl/trends/nfl-trends-view.tsx");
const APP = process.cwd();
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");
const text = (h) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

/* ── fixture: two upcoming games, four QBs, six past games ─────────────────────────────────────────────────────── */
const NOW = "2026-11-10T22:00:00Z";
const q = (playerId, name, team, [yds, td, cmp, att, int]) => ({ playerId: `nfl-athlete-${playerId}`, name, team, stats: { passYds: { p50: yds }, passTd: { p50: td }, cmp: { p50: cmp }, passAtt: { p50: att }, int: { p50: int } } });
const RECEIPTS = [
  { eventId: "g1", eventStart: "2026-11-13T01:15Z", home: { abbr: "WSH" }, away: { abbr: "LAR" }, playerStatDistributions: [q("1", "Alpha", "WSH", [220, 1, 22, 33, 1]), q("2", "Bravo", "LAR", [240, 2, 24, 36, 0]), { playerId: "nfl-athlete-9", name: "Backup", team: "WSH", stats: { passAtt: { p50: 2 } } }] },
  { eventId: "g2", eventStart: "2026-11-16T18:00Z", home: { abbr: "KC" }, away: { abbr: "BUF" }, playerStatDistributions: [q("3", "Charlie", "KC", [200, 1, 20, 30, 1]), q("4", "Delta", "BUF", [210, 2, 21, 31, 0])] },
];
const pl = (id, team, [cmp, att, yds, td, int]) => ({ playerId: `nfl-athlete-${id}`, teamAbbr: team, passCmp: cmp, passAtt: att, passYds: yds, passTd: td, passInt: int });
const G = (id, dateUtc, home, away, players, { final = true, seasonType = 2 } = {}) => ({ providerEventId: id, seasonType, dateUtc, home, away, ftHome: final ? 20 : null, ftAway: final ? 17 : null, players });
// nflverse codes on the game (WAS, LA), ESPN codes on the player rows (WSH, LAR)
const GAMES = [
  G("p1", "2026-10-05T17:00Z", "WAS", "DAL", [pl("1", "WSH", [25, 35, 250, 2, 0])]),
  G("p2", "2026-10-12T17:00Z", "NYG", "WAS", [pl("1", "WSH", [20, 30, 200, 1, 1])]),
  G("p3", "2026-10-19T17:00Z", "WAS", "PHI", [pl("1", "WSH", [24, 34, 230, 1, 0])]),
  G("p4", "2026-10-26T17:00Z", "WAS", "SEA", [pl("1", "WSH", [21, 31, 221, 2, 2])]),
  G("p5", "2026-11-02T18:00Z", "LA", "WAS", [pl("1", "WSH", [30, 40, 300, 3, 0]), pl("2", "LAR", [22, 30, 241, 1, 0])]),
  G("p6", "2026-11-09T18:00Z", "WAS", "NO", [pl("1", "WSH", [10, 15, 99, 0, 0])], { final: false }), // no final: not a game
  G("p7", "2026-08-20T17:00Z", "WAS", "BAL", [pl("1", "WSH", [9, 9, 99, 9, 9])], { seasonType: 1 }),    // preseason
  G("p8", "2026-11-01T17:00Z", "BUF", "MIA", [pl("4", "BUF", [0, 0, 0, 0, 0])]),                         // no attempt
];
const rosterTeam = (abbr, id, players) => ({ teamAbbr: abbr, providerTeamId: id, players: players.map(([pid, status = "active"]) => ({ id: pid, status: { type: status } })) });
const ELIG = {
  asOf: NOW,
  injuries: { generatedAt: "2026-11-10T21:00:00Z", entries: [
    { sport: "nfl", providerTeamId: "14", athleteId: "2", athleteName: "Bravo", status: "Doubtful", statedAt: "2026-11-10T20:00Z" },
    { sport: "nfl", providerTeamId: "12", athleteId: "3", athleteName: "Charlie", status: "Questionable", statedAt: "2026-11-10T20:00Z" },
  ] },
  roster: { generatedAt: "2026-11-10T21:00:00Z", teams: [rosterTeam("WSH", "28", [["1"], ["9"]]), rosterTeam("LAR", "14", [["2"]]), rosterTeam("KC", "12", [["3"]]), rosterTeam("BUF", "2", [])] },
};
const R5 = { g1: { state: "KNOWN" }, g2: { state: "KNOWN" } };
const build = (over = {}) => T.buildNflTrends({ receipts: RECEIPTS, games: GAMES, eligibility: ELIG, teamInputsOf: (id) => R5[id] ?? null, ...over });
const by = (m) => Object.fromEntries(m.rows.map((r) => [r.name, r]));

test("game logs: newest first, finals only, regular season + postseason, ≥ 1 attempt, nflverse game codes read as ESPN", () => {
  const logs = T.nflQbGameLogs(GAMES, "1", RECEIPTS[0].eventStart);
  assert.deepEqual(logs.map((g) => [g.eventId, g.team, g.opp, g.home]), [["p5", "WSH", "LAR", false], ["p4", "WSH", "SEA", true], ["p3", "WSH", "PHI", true], ["p2", "WSH", "NYG", false], ["p1", "WSH", "DAL", true]]);
  assert.deepEqual(logs[0], { eventId: "p5", dateEt: "2026-11-02", team: "WSH", opp: "LAR", home: false, passYds: 300, passTd: 3, passCmp: 30, passAtt: 40, passInt: 0 });
  assert.deepEqual(T.nflQbGameLogs(GAMES, "4", RECEIPTS[1].eventStart), [], "a game with no attempt is not a game for him — never a 0");
});

test("the adapter: MODEL PROJECTION threshold counts, the order, R5 and eligibility@1 with the starter rule", () => {
  const m = build(), b = by(m);
  assert.equal(m.slateDate, "2026-11-12");
  assert.equal(b.Backup, undefined, "only the projected QB per team (largest attempts median)");
  // Alpha (WSH): threshold 220 yds — 300, 221, 230, 200, 250 → 4 above; L10 = the same five
  assert.deepEqual(b.Alpha.windows, [{ size: 5, played: 5, above: { passYds: 4, passTd: 3, passCmp: 3, passAtt: 3, passInt: 1 } }, { size: 10, played: 5, above: { passYds: 4, passTd: 3, passCmp: 3, passAtt: 3, passInt: 1 } }]);
  assert.equal(b.Alpha.availability, "eligible");
  assert.equal(b.Alpha.rank, 1, "the only ranked QB");
  assert.deepEqual([b.Alpha.opp, b.Alpha.home, b.Alpha.position], ["LAR", true, "QB"]);
  assert.deepEqual([b.Bravo.availability, b.Bravo.rank, b.Bravo.availabilityNote], ["ineligible", null, "not eligible to play: a starter listed doubtful"], "a Doubtful starting QB is INELIGIBLE");
  assert.deepEqual([b.Charlie.availability, b.Charlie.rank], ["not-verified", null]);
  assert.match(b.Charlie.availabilityNote, /flagged questionable, so not ranked/);
  assert.deepEqual([b.Delta.eligibility.state, b.Delta.availability, b.Delta.rank], ["INELIGIBLE", "ineligible", null], "on no row of his team's captured roster");
  // R5: a QB-blind game shows no projection and ranks nobody; a game with no record is unknown
  for (const state of ["BLIND_TO_STARTING_QB_ABSENCE", null]) {
    const blind = by(build({ teamInputsOf: (id) => (id === "g1" ? (state ? { state } : null) : R5[id]) }));
    assert.equal(blind.Alpha.reference, null);
    assert.equal(blind.Alpha.rank, null);
    assert.equal(blind.Alpha.windows[0].above, null, "no threshold, no counts");
    assert.match(blind.Alpha.availabilityNote, /does not know this game's starting-QB situation \(R5\)/);
  }
  // stale captures → UNKNOWN → nobody ranked; not the coming week → nobody ranked
  assert.ok(build({ eligibility: { ...ELIG, asOf: "2026-11-11T05:00:00Z" } }).rows.every((r) => r.rank == null));
  assert.ok(build({ slateIsCurrent: false }).rows.every((r) => r.rank == null));
  // order: projected attempts, never the counts
  const two = by(build({ eligibility: { ...ELIG, injuries: { ...ELIG.injuries, entries: [] }, roster: { ...ELIG.roster, teams: [...ELIG.roster.teams.slice(0, 3), rosterTeam("BUF", "2", [["4"]])] } } }));
  assert.deepEqual([two.Bravo.rank, two.Alpha.rank, two.Delta.rank, two.Charlie.rank], [1, 2, 3, 4], "36 > 33 > 31 > 30 attempts");
});

test("the 5/5 · 4/5 · 3/5 filter: each row carries its last-5 count per stat; the counts select the right QBs", () => {
  const h = renderToStaticMarkup(React.createElement(View, { trends: build() }));
  const rows = [...h.matchAll(/<tr data-trn-player="(\d+)"([^>]*)>/g)].map((m) => ({ id: m[1], attrs: m[2] }));
  const h5 = (r, k) => /data-h5-passyds="(\d*)"/.exec(r.attrs)?.[1] ?? (k, "");
  assert.deepEqual(Object.fromEntries(rows.map((r) => [r.id, h5(r)])), { 1: "4", 2: "1", 3: "", 4: "" }, "Alpha 4 of 5 above 220; Bravo 1 of 1 above 240; no games → no count");
  const atLeast = (n) => rows.filter((r) => h5(r) !== "" && Number(h5(r)) >= n).map((r) => r.id);
  assert.deepEqual([atLeast(5), atLeast(4), atLeast(3)], [[], ["1"], ["1"]]);
  assert.match(h, /<td data-trn-opp="">LAR<\/td><td data-trn-ha="">Home<\/td>/, "opponent and home/away columns");
  assert.match(read("src/components/trends/trends-filters.tsx"), /\["5", "5 of 5 above"\], \["4", "4\+ of 5 above"\], \["3", "3\+ of 5 above"\]/);
  assert.match(text(h), /model threshold · games above/);
  assert.match(text(h), /a model threshold, not a sportsbook line/);
});

test("lines: none unless NFL site display AND the family's direction are authorized; a stat with no family never; never a price", () => {
  const recs = T.nflTrendLineRecords([
    { playerId: "nfl-athlete-1", market: "player_pass_yds", line: 224.5, capturedAt: "2026-11-10T18:00:00Z", book: "somebook", overPrice: -110 },
    { playerId: "nfl-athlete-1", market: "player_pass_tds", line: 1.5, capturedAt: "2026-11-10T18:00:00Z" },
  ], { player_pass_yds: "pass_yds" });
  assert.equal(gatedLines(recs, { sport: "nfl", stats: ["passYds", "passTd"] }).size, 0, "today: pass_yds is unqualified for a direction");
  const qualified = { ...DISPLAY_AUTHORIZATION, nfl: { ...DISPLAY_AUTHORIZATION.nfl, directionQualified: { ...DISPLAY_AUTHORIZATION.nfl.directionQualified, pass_yds: { qualified: true, evidence: "fixture", approvedBy: "fixture", approvedAt: "2026-11-11" } } } };
  const lines = gatedLines(recs, { sport: "nfl", stats: ["passYds", "passTd"], authorization: qualified });
  assert.deepEqual([...lines.entries()], [["1|passYds", { line: 224.5, capturedAt: "2026-11-10T18:00:00Z" }]], "only the family that exists and is qualified; line + capture time only");
  const m = build({ lines });
  assert.deepEqual(by(m).Alpha.lines[0].hits, [{ size: 5, played: 5, hit: 3 }, { size: 10, played: 5, hit: 3 }], "300, 230, 250 above 224.5");
  const h = renderToStaticMarkup(React.createElement(View, { trends: m }));
  assert.match(text(h), /PASS YDS at 224\.5 hit 3 of 5 · hit 3 of 5 \(last 10\)/);
  assert.match(h, /data-h5-passyds="4"/, "with a line the filter still counts the MODEL threshold (220), never the line (224.5)");
  for (const s of [h, JSON.stringify(T.nflTrendsPanelPayload(m))]) assert.doesNotMatch(s, /somebook|-110|overPrice|underPrice|American|\bodds\b/i);
  assert.doesNotMatch(JSON.stringify(T.nflTrendsPanelPayload(m)), /224\.5|"lines?"|capturedAt/, "the drawer file never carries a line");
  const none = renderToStaticMarkup(React.createElement(View, { trends: build({ lines: gatedLines(recs, { sport: "nfl", stats: ["passYds"] }) }) }));
  assert.doesNotMatch(none, /data-trn-hit|224\.5/, "unauthorized: no line rendered");
});

test("eligibility parity: Trends' verdict is eligibility@1's, the same as the NFL participation gate's — except the Doubtful-starter rule", () => {
  const m = build();
  const teamIdByAbbr = teamIdsFromRoster(ELIG.roster);
  for (const r of m.rows) {
    const own = resolveEligibility({ sport: "nfl", playerId: `nfl-athlete-${r.playerId}`, teamId: teamIdByAbbr[r.team], asOf: NOW, injuries: ELIG.injuries, roster: ELIG.roster, starter: true });
    assert.equal(r.eligibility.state, own.state, r.name);
    const board = opportunityEligibility({ playerId: `nfl-athlete-${r.playerId}` }, r.team, { asOf: NOW, injuries: ELIG.injuries, roster: ELIG.roster, teamIdByAbbr });
    const doubtfulStarter = own.reasons.includes("DOUBTFUL_STARTER");
    assert.equal(r.eligibility.state === "ELIGIBLE", doubtfulStarter ? false : board.eligible, `${r.name}: same verdict as the participation gate${doubtfulStarter ? " (starter rule: stricter)" : ""}`);
    if (r.rank != null) assert.equal(r.eligibility.state, "ELIGIBLE", `${r.name}: ranked only when ELIGIBLE`);
  }
});

test("flag OFF: /nfl/trends 404s outside the literal flag branch, the prune deletes it, the data route ships nothing", async () => {
  const page = read("src/app/nfl/trends/page.tsx");
  assert.match(page, /if \(process\.env\.GTP_NFL_TRENDS_PUBLIC === "1"\) \{[^]*?\n  \}\n  notFound\(\);\n\}/);
  assert.doesNotMatch(page, /^import [^\n]*(nfl-trends|sports\/nfl\/trends)/m, "the view and adapter are imported only inside the branch");
  assert.match(read("next.config.mjs"), /GTP_NFL_TRENDS_PUBLIC: process\.env\.GTP_NFL_TRENDS_PUBLIC === "1" \? "1" : "0"/);
  assert.match(read("scripts/prune-internal-routes.mjs"), /const NFL_TRENDS_ROUTES = process\.env\.GTP_NFL_TRENDS_PUBLIC === "1" \? \[\] : \["nfl\/trends"\];/);
  assert.match(read("scripts/prune-internal-routes.mjs"), /\.\.\.NFL_TRENDS_ROUTES\]/);
  const prev = process.env.GTP_NFL_TRENDS_PUBLIC; delete process.env.GTP_NFL_TRENDS_PUBLIC;
  try {
    const { GET } = await import("../../../app/data/nfl-trends.json/route.ts");
    assert.deepEqual(await (await GET()).json(), { disabled: true });
  } finally { if (prev !== undefined) process.env.GTP_NFL_TRENDS_PUBLIC = prev; }
});

test("REAL DATA (committed week): every log row equals the player-events box score; ranked QBs are ELIGIBLE in R5-allowed games", async () => {
  const m = await T.loadNflTrends("2026-11-10T22:00:00Z");
  assert.ok(m.rows.length >= 20, `${m.rows.length} QBs in the coming week`);
  const games = new Map();
  for (const f of ["2025.json", "2026.json"]) for (const g of JSON.parse(fs.readFileSync(path.join(APP, "..", "data/internal/research/nfl/player-events-v1", f), "utf8")).games) games.set(String(g.providerEventId), g);
  let checked = 0;
  for (const r of m.rows) {
    for (const g of r.games) {
      const p = games.get(g.eventId)?.players.find((x) => x.playerId === `nfl-athlete-${r.playerId}`);
      assert.ok(p, `${r.name} in ${g.eventId}`);
      for (const k of ["passYds", "passTd", "passCmp", "passAtt", "passInt"]) assert.equal(g[k], p[k], `${r.name} ${g.eventId} ${k}`);
      checked += 1;
    }
    if (r.rank != null) { assert.equal(r.eligibility.state, "ELIGIBLE"); assert.ok(r.reference); }
  }
  assert.ok(checked > 100, `checked ${checked} QB-games`);
  assert.doesNotMatch(JSON.stringify(T.nflTrendsPanelPayload(m)), /"lines?"|capturedAt|American|overPrice|\bodds\b/i);
});
