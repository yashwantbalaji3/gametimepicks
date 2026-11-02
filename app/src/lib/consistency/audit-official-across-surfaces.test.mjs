/**
 * ONE OFFICIAL VALUE ACROSS SURFACES (app/scripts/consistency/audit-official-across-surfaces.mjs). Fixtures prove each
 * surface reports a tampered value by surface, event, player, market and value, that a legitimate mismatch keeps its row
 * and gets a class, and that absence is reported rather than passed. One run over a frozen committed slate proves the CLI
 * writes nothing. Lives under src/ so the CI unit phase runs it.
 */
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { CLASS, auditRows, classifyAuditRecord, newLedger, nbaSurfaces, nflSurfaces, readSocialDir, renderMarkdown, socialSurfaces } from "../../../scripts/consistency/audit-official-across-surfaces.mjs";
import { projectionMismatches } from "./checks.mjs";
import { nbaOfficialSnapshot } from "./official-snapshot.mjs";
import { stampReceipt } from "../sports/nba/forecast-receipt.mjs";

const q = (p50) => ({ p10: p50 - 1, p50, p90: p50 + 1, mean: p50 });
const player = (id, name, expectedMinutes, pts) => ({ providerAthleteId: id, name, expectedMinutes, availability: "active", injuryStatus: null, pts: q(pts), reb: q(5.06), ast: q(3.04), threePm: q(1.5), pra: q(pts + 8.1), ptsReb: q(pts + 5.06), ptsAst: q(pts + 3.04), minutes: q(expectedMinutes) });

function snapshot() {
  const game = stampReceipt({
    providerEventId: "900", etDate: "2026-11-02", dateUtc: "2026-11-03T00:00Z", home: { abbr: "HOM", providerTeamId: "h" }, away: { abbr: "AWY", providerTeamId: "a" },
    forecast: { elo: { pHome: 0.6, pAway: 0.4 }, publishedSide: "HOME", sideRule: { id: "nba-winner-side@1", head: "elo" }, players: { home: [player("1", "Home Star", 34.26, 22.34)], away: [player("2", "Away Star", 30.04, 18.26)] } },
  }, { family: "v0.1", modelVersion: "m", now: "2026-11-02T06:00:00Z", inputs: {} });
  return nbaOfficialSnapshot("900", { official: { doc: { family: "v0.1", games: [game] }, path: "x.json", sha256: null } });
}

const r1 = (x) => Math.round(x * 10) / 10;
const laneRow = (id, name, min, pts) => ({ providerAthleteId: id, name, expectedMinutes: min, medians: { pts: r1(pts), reb: 5.1, ast: 3, threePm: 1.5 }, comboMedians: { pra: r1(pts + 8.1), ptsReb: r1(pts + 5.06), ptsAst: r1(pts + 3.04) } });
function surfaces(snap) {
  const home = laneRow("1", "Home Star", 34.3, 22.34), away = laneRow("2", "Away Star", 30, 18.26);
  const laneGame = { providerEventId: "900", frozenAt: "2026-11-02T06:00:00Z", home: { abbr: "HOM" }, away: { abbr: "AWY" }, elo: { favoured: "HOM", state: "FAVOURED" }, receipt: { payloadSha256: snap.sources[0].inputRef }, players: { home: [home], away: [away] } };
  const boardRow = (r) => ({ id: `900:${r.providerAthleteId}`, game: "900", name: r.name, min: r.expectedMinutes, v: [r.medians.pts, r.medians.reb, r.medians.ast, r.medians.threePm, r.comboMedians.pra, r.comboMedians.ptsReb, r.comboMedians.ptsAst] });
  return {
    snapshot: snap, laneGame,
    hubGame: { id: "900", favoured: { abbr: "HOM" }, frozenAt: "2026-11-02T06:00:00Z" },
    boardRowsOf: [boardRow(home), boardRow(away)],
    topBoards: { rows: [{ providerEventId: "900", providerAthleteId: "1", name: "Home Star", market: "pts", value: 22.3 }] },
    theater: { freezeSha: snap.sources[0].inputRef, panel: { snapshotId: snap.snapshotId, favouredSide: "HOME", players: [{ playerId: "1", displayName: "Home Star", expectedMinutes: 34.26, medians: { pts: 22.34, reb: 5.06, ast: 3.04, threePm: 1.5 } }] } },
    publicPayload: { ok: true, official: { elo: null, players: [{ playerId: "1", displayName: "Home Star", medians: { pts: 22.3, reb: 5.1, ast: 3, threePm: 1.5 } }] } },
    settled: { game: laneGame },
    record: { providerEventId: "900", side: "HOM" },
  };
}
const run = (i) => { const led = newLedger(); nbaSurfaces(led, i); return led; };

test("NBA: a clean slate has no mismatch rows, and every surface counted comparisons", () => {
  const led = run(surfaces(snapshot()));
  assert.deepEqual(led.mismatches, []);
  const c = Object.fromEntries(led.coverageRows().map((r) => [r.surface, r]));
  for (const s of ["nba-lane", "nba-hub", "nba-projections", "nba-top-boards.public", "theater.artifact", "theater.public-payload", "nba-game-page.settled", "results-v2.nba-record"]) assert.ok(c[s]?.compared > 0, `${s} compared`);
});

test("NBA: each tampered value is reported by surface, event, player, market and value, as UNEXPLAINED", () => {
  const cases = [
    ["nba-lane", "pra", (i) => { i.laneGame.players.home[0].comboMedians.pra = 99; }, 99],
    ["nba-projections", "pts", (i) => { i.boardRowsOf[0].v[0] = 21.9; }, 21.9],
    ["nba-top-boards.public", "pts", (i) => { i.topBoards.rows[0].value = 25; }, 25],
    ["theater.artifact", "reb", (i) => { i.theater.panel.players[0].medians.reb = 7; }, 7],
    ["theater.public-payload", "ast", (i) => { i.publicPayload.official.players[0].medians.ast = 4; }, 4],
  ];
  for (const [surface, market, tamper, value] of cases) {
    const i = surfaces(snapshot());
    tamper(i);
    const rows = run(i).mismatches;
    assert.equal(rows.length, 1, `${surface}: ${JSON.stringify(rows)}`);
    const r = rows[0];
    assert.deepEqual([r.surface, r.eventId, r.market, r.value, r.classification], [surface, "900", market, value, CLASS.UNEXPLAINED]);
    assert.ok(r.playerId === "1", `${surface} names the player id`);
    assert.ok(r.official != null, `${surface} prints the official value`);
  }
});

test("NBA: a side or a receipt that disagrees is reported, and a surface with no data is absent, not passed", () => {
  const i = surfaces(snapshot());
  i.hubGame.favoured.abbr = "AWY";
  i.record.side = "AWY";
  i.settled = { game: { ...i.laneGame, receipt: { payloadSha256: "f".repeat(64) } } };
  i.theater = null;
  i.publicPayload = { ok: false, reason: "LANE_MISMATCH" };
  const led = run(i);
  assert.deepEqual(led.mismatches.map((m) => `${m.surface}:${m.field}`).sort(), ["nba-game-page.settled:freezeReceipt", "nba-hub:favoured", "results-v2.nba-record:side"]);
  const c = Object.fromEntries(led.coverageRows().map((r) => [r.surface, r]));
  assert.deepEqual([c["theater.artifact"].eventsAbsent, c["theater.artifact"].compared], [1, 0]);
  assert.deepEqual(c["theater.public-payload"].absentReasons, ["LANE_MISMATCH"]);
});

const nflSnap = () => ({
  sport: "NFL", eventId: "401", matchup: "CHI @ SEA", home: { abbr: "SEA" }, away: { abbr: "CHI" },
  game: { pHomePublished: 0.66, pAway: 0.34, projectedScore: { home: 26, away: 20 }, total: { median: 46 }, winner: { side: "HOME" } },
  players: [{ playerId: "nfl-athlete-1", displayName: "A", families: { player_receptions: { median: 6, distribution: {} }, anytime_td: { median: null, distribution: { p: 0.5 } } } }],
});
const frozen = (over) => ({ publishedAt: "2026-11-01T00:00:00Z", boards: [{ propFamily: "player_receptions", rows: [{ providerEventId: "401", playerId: "nfl-athlete-1", name: "A", boardGeneratedAt: "2026-10-31T00:00:00Z", projection: { median: 5.7 }, ...over }] }] });

test("NFL Results board: an earlier freeze that differs keeps its row, classed FROZEN_BEFORE_FINAL with both instants", () => {
  const led = newLedger();
  nflSurfaces(led, { snapshot: nflSnap(), record: null, boardGeneratedAt: "2026-11-01T12:00:00Z", frozenBoards: frozen({}) });
  const rows = led.mismatches;
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].surface, rows[0].official, rows[0].value, rows[0].classification], ["results-v2.top-boards", 6, 5.7, CLASS.FROZEN_BEFORE_FINAL]);
  assert.match(rows[0].note, /2026-10-31T00:00:00Z.*2026-11-01T12:00:00Z/);
});

test("NFL Results board: the same revision that differs is UNEXPLAINED; boards frozen before the ruling keep whole numbers", () => {
  const led = newLedger();
  nflSurfaces(led, { snapshot: nflSnap(), record: null, boardGeneratedAt: "2026-10-31T00:00:00Z", frozenBoards: frozen({}) });
  assert.equal(led.mismatches[0].classification, CLASS.UNEXPLAINED);
  const old = newLedger();
  nflSurfaces(old, { snapshot: nflSnap(), record: null, boardGeneratedAt: "2026-10-20T00:00:00Z", frozenBoards: { ...frozen({ boardGeneratedAt: "2026-10-20T00:00:00Z", projection: { median: 6 } }), publishedAt: "2026-10-25T00:00:00Z" } });
  assert.deepEqual(old.mismatches, []);
});

test("NFL index, week page, hub and vault are held to the snapshot; absent surfaces say so", () => {
  const led = newLedger();
  nflSurfaces(led, {
    snapshot: nflSnap(), record: { model: { inputHash: "abc" } }, boardGeneratedAt: "2026-11-01T00:00:00Z",
    index: { winProbability: { home: 0.66, away: 0.33 }, projectedScore: { home: 26, away: 20 }, total: { median: 46 }, receipt: { inputHash: "abc" } },
    vault: { selections: [{ providerEventId: "401", playerId: "nfl-athlete-1", name: "A", tdProbability: 0.5 }], watchlist: [] },
  });
  assert.deepEqual(led.mismatches.map((m) => `${m.surface}:${m.field}:${m.value}`), ["nfl-index:pAway:0.33"]);
  const c = Object.fromEntries(led.coverageRows().map((r) => [r.surface, r]));
  assert.equal(c["nfl-week-page"].eventsAbsent, 1);
  assert.equal(c["nfl-hub"].eventsAbsent, 1);
  assert.equal(c["nfl-end-zone-vault"].compared, 1);
});

test("audit.mjs records: every item becomes a row, classed by surface; allItems stays out of JSON and the baseline", () => {
  const snap = { sport: "NFL", eventId: "401", snapshotId: "s" };
  const pairs = [1, 2, 3, 4, 5].map((i) => ({ subjectId: `p${i}`, label: `P${i}`, family: "player_rush_yds", field: "median", expected: 10, actual: 10 + i }));
  const [rec] = projectionMismatches({ snapshot: snap, surface: "nfl-simulation-v2.players", pairs, correction: "x", owner: "y" });
  assert.equal(rec.examples.length, 3);
  assert.equal(rec.allItems.length, 5);
  assert.ok(!Object.keys(rec).includes("allItems"));
  assert.ok(!JSON.stringify(rec).includes("allItems"));
  const led = newLedger();
  auditRows(led, [rec]);
  assert.equal(led.mismatches.length, 5);
  assert.ok(led.mismatches.every((m) => m.classification === CLASS.LABELLED_SIMULATION));

  const cls = (d) => classifyAuditRecord(d).classification;
  assert.equal(cls({ surface: "nfl-game-page.supporting-simulation", sport: "NFL" }), CLASS.LABELLED_SIMULATION);
  assert.equal(cls({ surface: "simulation-theater.default", sport: "NBA" }), CLASS.LABELLED_SIMULATION);
  assert.equal(cls({ surface: "simulation-theater.default", sport: "NFL" }), CLASS.UNEXPLAINED, "NFL has no labelled-runs policy");
  assert.equal(cls({ surface: "nfl-live-props.frozen", sport: "NFL", severity: "WARN" }), CLASS.FROZEN_BEFORE_FINAL);
  assert.equal(cls({ surface: "nfl-live-props.frozen", sport: "NFL", severity: "ERROR" }), CLASS.UNEXPLAINED);
  assert.equal(cls({ surface: "nba-public-lane", sport: "NBA" }), CLASS.UNEXPLAINED);
});

test("social directory: claims read at their own printed precision; unreadable and valueless objects are counted, not passed", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "social-pack-"));
  try {
    fs.mkdirSync(path.join(dir, "nested"));
    fs.writeFileSync(path.join(dir, "ok.json"), JSON.stringify({ events: [{ providerEventId: "900", official: { favoured: "HOM" }, players: [{ providerAthleteId: "1", name: "Home Star", medians: { pts: 22.3 }, comboMedians: { pra: 30.4 } }] }] }));
    fs.writeFileSync(path.join(dir, "nested/post.json"), JSON.stringify({ eventId: "900", legs: [{ playerId: "1", name: "Home Star", market: "reb", value: 9.5 }, { playerId: "2", note: "no value" }] }));
    fs.writeFileSync(path.join(dir, "other.json"), JSON.stringify({ eventId: "111", favoured: "XYZ" }));
    fs.writeFileSync(path.join(dir, "bad.json"), "{");
    const read = readSocialDir(dir);
    const led = newLedger();
    const s = socialSurfaces(led, read, [snapshot()]);
    assert.deepEqual(led.mismatches.map((m) => `${m.market}:${m.official}:${m.value}:${m.source}`), [`reb:5.1:9.5:${path.join("nested", "post.json")}`]);
    assert.deepEqual([s.files, s.unreadableFiles, s.playerObjectsWithNoReadableValue, s.outOfScopeClaims], [4, 1, 1, 1]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("report names the class counts and prints a legitimate row beside its value", () => {
  const led = newLedger();
  nflSurfaces(led, { snapshot: nflSnap(), record: null, boardGeneratedAt: "2026-11-01T12:00:00Z", frozenBoards: frozen({}) });
  const md = renderMarkdown({ date: null, events: { NBA: [], NFL: ["401"] }, snapshots: [{ eventId: "401", matchup: "CHI @ SEA" }], refusals: [], coverage: led.coverageRows(), social: null, researchBoards: 0, summary: { mismatches: 1, byClass: { UNEXPLAINED: 0, FROZEN_BEFORE_FINAL: 1, LABELLED_SIMULATION: 0 } }, mismatches: led.mismatches });
  assert.match(md, /1 FROZEN_BEFORE_FINAL/);
  assert.match(md, /FROZEN_BEFORE_FINAL \| results-v2\.top-boards \| NFL \| CHI @ SEA 401 \| A \| player_receptions \| median \| 6 \| 5\.7 \| -0\.3/);
});

test("CLI on a frozen committed slate: reports coverage and writes nothing", () => {
  const app = process.cwd();
  const watched = ["public/data/nba/experimental-public/2026-10-29.json", "../data/internal/research/nba/experimental-v0.1/forecasts/2026-10-29.json", "../data/internal/research/nba/top-boards/v0.1/2026-10-29.json"].map((p) => path.join(app, p));
  const hash = () => watched.map((p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex"));
  const before = hash();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "across-surfaces-"));
  try {
    const out = path.join(tmp, "r.json");
    const script = path.resolve("scripts/consistency/audit-official-across-surfaces.mjs");
    const r = spawnSync("npx", ["tsx", script, "--date", "2026-10-29", "--json", out], { encoding: "utf8", cwd: app });
    assert.equal(r.status, 0, r.stderr);
    const rep = JSON.parse(fs.readFileSync(out, "utf8"));
    assert.equal(rep.readOnly, true);
    const c = Object.fromEntries(rep.coverage.map((x) => [x.surface, x]));
    for (const s of ["nba-lane", "nba-projections", "nba-top-board.v0.1"]) assert.ok(c[s]?.compared > 0, `${s} was compared`);
    assert.deepEqual(hash(), before);
    const inside = spawnSync("npx", ["tsx", script, "--date", "2026-10-29", "--json", path.join(app, "x.json")], { encoding: "utf8", cwd: app });
    assert.equal(inside.status, 2);
    assert.match(inside.stderr, /inside the repository/);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
