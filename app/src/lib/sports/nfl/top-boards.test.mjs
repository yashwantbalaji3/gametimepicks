/**
 * Founder Top boards (2026-10-29) — lib/sports/nfl/top-boards.mjs and the weekly-boards artifact's `topBoards` block.
 *
 *   five boards        pass / rush / receiving yards, receptions, anytime TD — Top 5 each, a maximum, never a quota
 *   official only      ranked from the per-game OFFICIAL player boards by the official median / probability; a price
 *                      rides beside a row and never orders it
 *   readiness          a family that is not publication-qualified carries its actual state, never rows
 *   scopes             weekly (events still to kick off) and daily (grouped by the ET date of kickoff)
 *   deterministic      the same inputs and --now give byte-identical output; the existing `boards` are untouched
 *
 * Run (from app/): npx tsx --test src/lib/sports/nfl/top-boards.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { buildTopBoards, readinessFor, etDateOfKickoff, TOP_BOARD_SPECS, TOP_BOARD_SIZE, TOP_BOARD_SOURCE } from "./top-boards.mjs";
import { BOARD_METRIC } from "./board-ranking.mjs";

const APP = process.cwd();
const read = (rel) => JSON.parse(fs.readFileSync(path.join(APP, rel), "utf8"));

const NOW = "2026-10-29T12:00:00Z";
const AVAIL = { injuriesCapturedAt: "2026-10-29T11:00:00Z", injuries: "FRESH", rosters: "FRESH" };
const FAMS = (over = {}) => ({
  player_pass_yds: { label: "Passing yards", state: "ESTIMATE", reason: "SECOND_LOOK_REJECTED — failed bar: threshold calibration (ECE 0.055 vs 0.05)", model: "nfl-player-share-level-v1" },
  player_rush_yds: { label: "Rushing yards", state: "ESTIMATE", reason: "SHADOW_ELIGIBLE — failed bar(s): calOk" },
  player_reception_yds: { label: "Receiving yards", state: "PUBLISHED", basis: "b" },
  player_receptions: { label: "Receptions", state: "PUBLISHED", basis: "b", model: "nfl-player-share-level-v1" },
  anytime_td: { label: "Anytime touchdown", state: "PUBLISHED", basis: "b", model: "nfl-anytime-td-opportunity-v1" },
  ...over,
});
const player = (id, team, v, participation = "AVAILABLE_ROLE_UNCERTAIN", extra = {}) => ({
  playerId: `nfl-athlete-${id}`, name: `P${id}`, team, participation,
  markets: {
    player_pass_yds: { mean: 900 + v, median: 900 + v, p10: 800, p90: 1000 },
    player_rush_yds: { mean: 500 + v, median: 500 + v, p10: 400, p90: 600 },
    player_reception_yds: { mean: v + 0.5, median: v + 0.25, p10: v - 20, p90: v + 40 },
    player_receptions: { mean: v / 10 + 0.3, median: Math.round(v / 10), p10: 1, p90: 9 },
    anytime_td: { probability: v / 200 },
    ...extra,
  },
});
const board = (id, kickoffUtc, players, fams = FAMS()) => ({ providerEventId: id, matchup: "AAA @ BBB", kickoffUtc, availability: AVAIL, families: fams, players });
const slotFor = (e, p, fam) => (fam === "anytime_td" && p === "nfl-athlete-1" ? { market: { sportsbook: "draftkings", yesOdds: 9999, capturedAt: NOW } } : { pricingState: "NOT_PROBED" });

const FIXTURE = [
  board("1", "2026-10-30T00:15Z", [player(1, "AAA", 50), player(2, "BBB", 90), player(3, "AAA", 70, "QUESTIONABLE")]), // Thu 8:15 PM ET
  board("2", "2026-11-01T17:00Z", [player(4, "AAA", 60), player(5, "BBB", 80), player(6, "AAA", 40), player(7, "BBB", 30), player(8, "AAA", 20)]),
  board("3", "2026-11-03T01:15Z", [player(9, "AAA", 100), player(10, "BBB", 10)]), // Mon 8:15 PM ET
];

test("five boards, in the founder's order, each declaring family + method + the official source", () => {
  assert.deepEqual(TOP_BOARD_SPECS.map((s) => s.family), ["player_pass_yds", "player_rush_yds", "player_reception_yds", "player_receptions", "anytime_td"]);
  for (const s of TOP_BOARD_SPECS) assert.equal(s.method, BOARD_METRIC[s.family], `${s.family}: ranks by the official headline`);
  assert.equal(BOARD_METRIC.player_receptions, "median", "receptions rank by the official median (founder 2026-10-29)");
  const tb = buildTopBoards({ weekBoards: FIXTURE, now: NOW, slotFor });
  for (const b of tb.weekly.boards) {
    assert.equal(b.source, TOP_BOARD_SOURCE);
    assert.equal(b.topN, TOP_BOARD_SIZE);
    assert.ok(b.family && b.method, "Command Center keys on family + method");
  }
});

test("ESTIMATE families rank as estimates (founder P0 2026-10-30): same rule, the one label, no price; WITHHELD/mixed never rank", () => {
  const tb = buildTopBoards({ weekBoards: FIXTURE, now: NOW, slotFor, forwardFor: (fam, model) => (fam === "player_pass_yds" && /share-level/.test(model ?? "") ? { state: "ACCUMULATING", n: 188, needed: 300 } : null) });
  const by = Object.fromEntries(tb.weekly.boards.map((b) => [b.family, b]));
  for (const f of ["player_pass_yds", "player_rush_yds"]) {
    assert.equal(by[f].state, "ESTIMATE", `${f}: ranks, as an estimate — never promoted to PUBLISHED`);
    assert.equal(by[f].estimate.label, "Estimate · calibration standard not yet met");
    assert.equal(by[f].readiness, undefined);
    assert.ok(by[f].rows.length > 0 && by[f].rows.length <= TOP_BOARD_SIZE);
    for (const r of by[f].rows) assert.ok(!("market" in r) && !("pricingState" in r), `${f} ${r.playerId}: an estimate carries no price slot`);
  }
  assert.equal(by.player_pass_yds.estimate.reason, FAMS().player_pass_yds.reason);
  for (const f of ["player_reception_yds", "player_receptions", "anytime_td"]) assert.equal(by[f].state, "PUBLISHED");
  // a family WITHHELD on one board (or mixed ESTIMATE/PUBLISHED) never ranks
  const mixed = [...FIXTURE.slice(0, 2), board("3", "2026-11-03T01:15Z", [player(9, "AAA", 100)], FAMS({ player_pass_yds: { label: "Passing yards", state: "WITHHELD", reason: "x" } }))];
  const m = buildTopBoards({ weekBoards: mixed, now: NOW, slotFor }).weekly.boards.find((b) => b.family === "player_pass_yds");
  assert.equal(m.state, "NOT_PUBLISHED");
  assert.equal(m.rows, undefined);
});

test("Top 5 is a maximum; blocked players never rank; order is the official value; exact numbers", () => {
  const tb = buildTopBoards({ weekBoards: FIXTURE, now: NOW, slotFor });
  const rec = tb.weekly.boards.find((b) => b.family === "player_reception_yds");
  assert.equal(rec.rows.length, 5);
  assert.deepEqual(rec.rows.map((r) => r.playerId), [9, 2, 5, 4, 1].map((n) => `nfl-athlete-${n}`), "by median, the Questionable P3 is skipped");
  assert.deepEqual(rec.rows.map((r) => r.rank), [1, 2, 3, 4, 5]);
  assert.equal(rec.rows[0].value, 100.25, "the stored median, unrounded");
  assert.equal(rec.rows[0].p10, 80);
  assert.equal(rec.availabilityExcluded, 1);
  const td = tb.weekly.boards.find((b) => b.family === "anytime_td");
  /* P1 carries a captured price; it rides beside the row and never moves it (P1 is the lowest of the five). */
  assert.equal(td.rows.at(-1).playerId, "nfl-athlete-1");
  assert.equal(td.rows.at(-1).market.yesOdds, 9999);
  assert.equal(td.rows[0].pricingState, "NOT_PROBED");
  const small = buildTopBoards({ weekBoards: [FIXTURE[2]], now: NOW, slotFor });
  assert.equal(small.weekly.boards.find((b) => b.family === "anytime_td").rows.length, 2, "fewer cleared players publish fewer rows");
});

test("daily scope: grouped by the ET date of kickoff; a finished day drops out; a started game leaves the weekly scope", () => {
  assert.equal(etDateOfKickoff("2026-10-30T00:15Z"), "2026-10-29", "Thursday night is Thursday in ET");
  assert.equal(etDateOfKickoff("2026-11-03T01:15Z"), "2026-11-02", "Monday night is Monday in ET");
  const tb = buildTopBoards({ weekBoards: FIXTURE, now: NOW, slotFor });
  assert.deepEqual(tb.daily.map((d) => d.etDate), ["2026-10-29", "2026-11-01", "2026-11-02"]);
  assert.deepEqual(tb.daily[0].scope.events, ["1"]);
  const mon = tb.daily[2].boards.find((b) => b.family === "player_reception_yds");
  assert.deepEqual(mon.rows.map((r) => r.playerId), ["nfl-athlete-9", "nfl-athlete-10"]);
  const after = buildTopBoards({ weekBoards: FIXTURE, now: "2026-10-30T01:00:00Z", slotFor });
  assert.deepEqual(after.daily.map((d) => d.etDate), ["2026-11-01", "2026-11-02"], "Thursday is over");
  assert.equal(after.weekly.scope.kind, "REMAINING_EVENTS");
  assert.deepEqual(after.weekly.scope.events, ["2", "3"]);
  assert.ok(!after.weekly.boards.flatMap((b) => b.rows ?? []).some((r) => r.providerEventId === "1"), "a started game never ranks");
});

test("a team pool the board withheld blocks the ranking (partial population is a false Top 5)", () => {
  const fams = FAMS({ player_receptions: { label: "Receptions", state: "PUBLISHED", basis: "b", withheldTeams: [{ team: "AAA" }] } });
  const tb = buildTopBoards({ weekBoards: [board("9", "2026-11-01T17:00Z", [player(1, "AAA", 50)], fams)], now: NOW, slotFor });
  const r = tb.weekly.boards.find((b) => b.family === "player_receptions");
  assert.equal(r.state, "NOT_PUBLISHED");
  assert.match(r.readiness.text, /^Receptions: not ranked — on 1 of 2 teams/);
});

test("readiness wording comes from the state and the forward evidence only", () => {
  assert.equal(readinessFor({ label: "X", state: "PUBLISHED" }).text, null);
  assert.equal(readinessFor({ label: "X", state: null }).code, "NO_OFFICIAL_PROJECTION");
  assert.match(readinessFor({ label: "X", state: "ESTIMATE", reason: "SHADOW_ELIGIBLE — failed bar(s): mae" }).text, /publication standard$/);
  assert.match(readinessFor({ label: "X", state: "ESTIMATE", reason: "calOk", forward: { state: "FORWARD_BREACHED", n: 604 } }).text, /below its bars after 604 graded player-games\)$/);
});

test("deterministic: the same inputs and instant build identical output; the instant is required", () => {
  const a = JSON.stringify(buildTopBoards({ weekBoards: FIXTURE, now: NOW, slotFor }));
  const b = JSON.stringify(buildTopBoards({ weekBoards: [...FIXTURE].reverse(), now: NOW, slotFor }));
  assert.equal(a, b, "input order never changes the output");
  assert.throws(() => buildTopBoards({ weekBoards: FIXTURE, now: undefined, slotFor }), /now \(ISO\) is required/);
  assert.doesNotMatch(fs.readFileSync(path.join(APP, "src/lib/sports/nfl/top-boards.mjs"), "utf8"), /Date\.now\(|new Date\(\)/, "no wall clock in the builder");
});

test("COMMITTED · the current week's artifact carries the five boards, additively, with the real readiness", () => {
  const wb = read("public/data/nfl/weekly-boards/latest.json");
  if (!wb.topBoards) return; // an artifact written before the builder change
  assert.equal(wb.schemaVersion, 1, "the existing contract is unchanged; topBoards is an additive block");
  for (const b of wb.boards) assert.ok(["id", "family", "metric", "topN", "title", "state"].every((k) => k in b), "existing boards keep their fields");
  assert.equal(wb.topBoards.contract, "nfl-top-boards@1");
  assert.deepEqual(wb.topBoards.weekly.boards.map((b) => b.family), TOP_BOARD_SPECS.map((s) => s.family));
  const elig = read("public/data/nfl/family-eligibility.json");
  for (const b of [wb.topBoards.weekly, ...wb.topBoards.daily].flatMap((s) => s.boards)) {
    if (b.state === "PUBLISHED" || b.state === "ESTIMATE") { assert.ok(b.rows.length <= 5); continue; }
    assert.ok(!("rows" in b), `${b.id}: a not-qualified family never carries rows`);
    assert.match(b.readiness.text, /^[A-Z][a-z ]+: not (yet published|ranked) — /);
    /* The forward clause quotes the same evidence the public eligibility artifact does. */
    const ft = elig.families.find((f) => f.family === b.family)?.evidence?.forwardTest;
    if (b.readiness.forwardTest?.state === "ACCUMULATING") assert.deepEqual([b.readiness.forwardTest.n, b.readiness.forwardTest.needed], [ft.n, ft.needed]);
  }
  /* The week's per-game boards publish pass/rush only as ESTIMATE: founder P0 2026-10-30, they rank again as labelled
     ESTIMATE boards (never promoted to PUBLISHED), carrying the board's failed bar and caveat and no price. Anything that
     is neither PUBLISHED nor ESTIMATE still does not rank. */
  for (const fam of ["player_pass_yds", "player_rush_yds"]) {
    const legacy = wb.boards.find((b) => b.family === fam);
    for (const scope of [wb.topBoards.weekly, ...wb.topBoards.daily, ...(wb.topBoards.fullWeek ? [wb.topBoards.fullWeek] : [])]) {
      const top = scope.boards.find((b) => b.family === fam);
      if (legacy?.state === "PUBLISHED") { assert.equal(top.state, "PUBLISHED", fam); continue; }
      if (legacy?.state !== "ESTIMATE") { assert.equal(top.state, "NOT_PUBLISHED", fam); continue; }
      assert.equal(top.state, "ESTIMATE", `${fam}: an estimate family ranks as an estimate, never promoted`);
      assert.equal(top.estimate.label, "Estimate · calibration standard not yet met", fam);
      assert.equal(top.estimate.reason, legacy.reason, `${fam}: the failed bar is the board's own`);
      assert.equal(top.estimate.caveat, legacy.caveat, `${fam}: the caveat is the board's own`);
      assert.ok(top.rows.length >= 1 && top.rows.length <= 5, fam);
      for (const r of top.rows) assert.ok(!("market" in r) && !("pricingState" in r), `${fam} ${r.name}: an estimate row carries no price`);
    }
  }
});

test("SOURCE · the builder emits topBoards from the official boards only (no odds, simulations or fallbacks rank)", () => {
  const src = fs.readFileSync(path.join(APP, "src/lib/sports/nfl/top-boards.mjs"), "utf8");
  const imports = [...src.matchAll(/^import .* from "(.+)";$/gm)].map((m) => m[1]).sort();
  assert.deepEqual(imports, ["./board-ranking.mjs", "./family-publication.mjs", "./matchup.mjs"], "nothing but the shared ranking rule, the publication policy's label and the matchup parser");
  const builder = fs.readFileSync(path.join(APP, "scripts/nfl/build-nfl-weekly-boards.mjs"), "utf8");
  assert.doesNotMatch(builder, /world-model|game-simulations|simulation/i, "the weekly builder reads no simulation");
  assert.match(builder, /topBoards: buildTopBoards\(\{\s*weekBoards: boards, now: NOW,/);
});
