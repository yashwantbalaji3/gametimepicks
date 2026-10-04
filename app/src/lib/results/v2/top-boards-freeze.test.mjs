/**
 * Results V2 · B-4a — frozen daily Top-5 boards. The ranking is ONE shared rule; a board is frozen once,
 * before the day's first kickoff, from PUBLISHED families only; it is never written late and never rewritten.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { rankFamily, familyStateAcross } from "../../sports/nfl/board-ranking.mjs";

const SCRIPT = path.join(process.cwd(), "scripts/results/freeze-daily-top-boards.mjs");
const { freezeDay } = await import(SCRIPT);

const fam = (state, extra = {}) => ({ label: "L", state, ...(state === "PUBLISHED" ? { basis: "b" } : { reason: "why" }), model: "m-v1", ...extra });
const player = (id, markets, participation = "AVAILABLE_ROLE_UNCERTAIN") => ({ playerId: id, name: id.toUpperCase(), team: "AAA", participation, markets });
/* Session 11: every per-game board carries the availability read its rows were joined against (6 h before kickoff here). */
const availabilityFor = (kickoffUtc) => {
  const k = Date.parse(kickoffUtc);
  return Number.isFinite(k) ? { injuriesCapturedAt: new Date(k - 6 * 3600e3).toISOString(), injuries: "FRESH", rosters: "FRESH" } : undefined;
};
const board = (eventId, kickoffUtc, players, families = { player_rush_yds: fam("PUBLISHED"), player_pass_yds: fam("ESTIMATE"), anytime_td: fam("PUBLISHED") }) =>
  ({ providerEventId: eventId, matchup: "AAA @ BBB", kickoffUtc, generatedAt: "2031-10-01T10:00:00Z", availability: availabilityFor(kickoffUtc), families, players });
const noPrices = { slotFor: () => ({ pricingState: "NOT_PROBED" }) };

test("🔴 ranking: out players never rank, a missing metric is never zero-filled, ties break on the model's mean then id", () => {
  const b = [board("1", "2031-10-02T17:00Z", [
    player("b", { r: { median: 5, mean: 4.6 } }), player("a", { r: { median: 5, mean: 4.6 } }), player("c", { r: { median: 5, mean: 5.2 } }),
    player("d", { r: { median: 9, mean: 9 } }, "INACTIVE"), player("e", { r: { median: null } }), player("f", {}),
  ])];
  assert.deepEqual(rankFamily(b, "r", "median", { asOf: "2031-10-02T12:00:00Z" }).map((x) => x.player.playerId), ["c", "a", "b"]);
});

test("a family publishes across a day only when every board publishes it", () => {
  const p = board("1", "x", [], { r: fam("PUBLISHED") });
  const e = board("2", "x", [], { r: fam("ESTIMATE") });
  assert.equal(familyStateAcross([p, p], "r").state, "PUBLISHED");
  assert.equal(familyStateAcross([p, e], "r").state, "WITHHELD");
  assert.equal(familyStateAcross([e, e], "r").state, "ESTIMATE");
});

test("🔴 freezeDay: published families only, a maximum of five, typed price absence, no invented ids", () => {
  const players = ["p1", "p2", "p3", "p4", "p5", "p6", "p7"].map((id, i) => player(id, { player_rush_yds: { median: 90 - i, p10: 20, p90: 140, mean: 90 - i }, player_pass_yds: { median: 250 }, ...(i < 2 ? { anytime_td: { probability: 0.5 - i / 10 } } : {}) }));
  const doc = freezeDay("2031-10-02", [board("401", "2031-10-02T17:00Z", players)], "2031-10-02T12:00:00Z", noPrices);
  const rush = doc.boards.find((b) => b.propFamily === "player_rush_yds");
  assert.equal(rush.rows.length, 5, "top five of seven");
  assert.deepEqual(rush.rows.map((r) => r.rank), [1, 2, 3, 4, 5]);
  assert.equal(doc.boards.find((b) => b.propFamily === "anytime_td").rows.length, 2, "fewer qualify → fewer rows, never padded");
  assert.ok(!doc.boards.some((b) => b.propFamily === "player_pass_yds"), "an ESTIMATE family is never ranked");
  assert.equal(doc.ineligible.find((x) => x.propFamily === "player_pass_yds").state, "ESTIMATE");
  const r = rush.rows[0];
  assert.equal(r.forecastId, "401:p1:player_rush_yds");
  assert.equal(r.line, null); assert.equal(r.pricingState, "NOT_PROBED"); assert.equal(r.teamId, null);
  assert.deepEqual(r.projection, { median: 90, p10: 20, p90: 140 });
  assert.equal(doc.publishedAt, "2031-10-02T12:00:00Z");
  for (const k of ["date", "publishedAt", "boards", "ineligible", "firstKickoffUtc"]) assert.ok(k in doc, k);
  for (const k of ["rank", "forecastId", "playerId", "teamId", "opponent", "line", "projection", "kickoffUtc"]) assert.ok(k in r, k);
  assert.equal(r.opponent, "BBB");
});

function tmpApp(boards) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-top-boards-"));
  const bd = path.join(dir, "public/data/nfl/player-board");
  fs.mkdirSync(bd, { recursive: true });
  for (const b of boards) fs.writeFileSync(path.join(bd, `${b.providerEventId}.json`), JSON.stringify(b));
  return dir;
}
const run = (cwd, now) => execFileSync(process.execPath, [SCRIPT, "--now", now], { cwd, encoding: "utf8" });
const outFile = (dir, day) => path.join(dir, "public/data/results/top-boards", `${day}.json`);

test("🔴 write-once, never retrospective, never early: the freeze window is [first kickoff − 24h, first kickoff)", () => {
  const ps = [player("p1", { player_rush_yds: { median: 80, p10: 10, p90: 150 } })];
  const dir = tmpApp([board("501", "2031-10-05T17:00Z", ps), board("502", "2031-10-05T20:25Z", ps)]);
  try {
    run(dir, "2031-10-04T10:00:00Z");
    assert.ok(!fs.existsSync(outFile(dir, "2031-10-05")), "31h ahead: too early");
    run(dir, "2031-10-05T18:00:00Z");
    assert.ok(!fs.existsSync(outFile(dir, "2031-10-05")), "after the first kickoff: never frozen late");
    run(dir, "2031-10-05T12:00:00Z");
    const first = fs.readFileSync(outFile(dir, "2031-10-05"), "utf8");
    assert.match(first, /"publishedAt": "2031-10-05T12:00:00Z"/);
    // The boards change (a new top rusher appears); a second pre-kickoff run must not rewrite the frozen day.
    const changed = board("501", "2031-10-05T17:00Z", [player("p9", { player_rush_yds: { median: 200, p10: 100, p90: 300 } })]);
    fs.writeFileSync(path.join(dir, "public/data/nfl/player-board/501.json"), JSON.stringify(changed));
    assert.match(run(dir, "2031-10-05T16:00:00Z"), /already frozen — write-once/);
    assert.equal(fs.readFileSync(outFile(dir, "2031-10-05"), "utf8"), first, "byte-identical after a later run");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("the weekly boards rank with the SAME shared rule (no second copy of the sort)", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "scripts/nfl/build-nfl-weekly-boards.mjs"), "utf8");
  assert.match(src, /rankFamily\(scoped, family, metric, \{ asOf: NOW, blocked \}\)/);
  assert.match(src, /familyStateAcross\(boards, key\)/);
  assert.doesNotMatch(src, /rows\.sort\(/, "no local ranking");
  const fz = fs.readFileSync(SCRIPT, "utf8");
  assert.match(fz, /flag: "wx"/, "the write itself refuses to overwrite");
});
