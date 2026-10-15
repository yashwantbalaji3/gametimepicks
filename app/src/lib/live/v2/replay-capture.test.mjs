/**
 * The V2 capture replay (scripts/live/replay-v2-capture.mjs) agrees where the feeds agree, calls a one-pass
 * transition lag a LAG, and reports every persisting difference as a DISAGREEMENT — including a score shown
 * before kickoff. Recorded files are only read.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { espnTruth, comparePass, replayDir } from "../../../../scripts/live/replay-v2-capture.mjs";

const env = (state, { away = null, home = null, number = null, clock = null } = {}) => ({
  event: { eventId: "nfl:401872995", providerEventId: "401872995", sport: "nfl", startTime: "2026-10-16T00:15:00Z", state, stateDetail: null,
    fetchedAt: "2026-10-16T01:00:00Z", period: number ? { number, label: `Q${number}`, clock, phase: null } : null,
    competitors: { away: { abbr: "SEA", name: "Seattle Seahawks", score: away }, home: { abbr: "DEN", name: "Denver Broncos", score: home } } },
});
const espn = (name, { away, home, period = 0, clock = "0:00" } = {}) => ({ header: { competitions: [{ status: { type: { name }, period, displayClock: clock },
  competitors: [{ homeAway: "home", score: home === undefined ? undefined : String(home) }, { homeAway: "away", score: away === undefined ? undefined : String(away) }] }] } });

test("espnTruth classifies ESPN states and reads scores, period and clock", () => {
  assert.equal(espnTruth(espn("STATUS_SCHEDULED")).cls, "PRE");
  assert.equal(espnTruth(espn("STATUS_HALFTIME", { away: 7, home: 3, period: 2 })).cls, "IN_PLAY");
  assert.equal(espnTruth(espn("STATUS_FINAL", { away: 24, home: 20 })).cls, "FINAL");
  assert.deepEqual(espnTruth(espn("STATUS_IN_PROGRESS", { away: 14, home: 10, period: 2, clock: "7:22" })), { cls: "IN_PLAY", name: "STATUS_IN_PROGRESS", period: 2, clock: "7:22", home: 10, away: 14 });
  assert.equal(espnTruth({}), null);
});

test("agreement: pregame without scores, live with matching score/quarter/clock, final", () => {
  assert.deepEqual(comparePass("a", env("PRE"), espn("STATUS_SCHEDULED")).issues, []);
  assert.deepEqual(comparePass("b", env("LIVE", { away: 14, home: 10, number: 2, clock: "7:22" }), espn("STATUS_IN_PROGRESS", { away: 14, home: 10, period: 2, clock: "7:22" })).issues, []);
  assert.deepEqual(comparePass("c", env("FINAL", { away: 24, home: 20 }), espn("STATUS_FINAL", { away: 24, home: 20 })).issues, []);
});

test("NEGATIVE CONTROLS: a score before kickoff, a wrong score, a wrong quarter are all caught", () => {
  assert.equal(comparePass("x", env("PRE", { away: 0, home: 0 }), espn("STATUS_SCHEDULED")).issues[0].kind, "score");
  assert.ok(comparePass("y", env("LIVE", { away: 14, home: 7, number: 2, clock: "7:22" }), espn("STATUS_IN_PROGRESS", { away: 14, home: 10, period: 2, clock: "7:22" })).issues.some((i) => i.kind === "score"));
  assert.ok(comparePass("z", env("LIVE", { away: 14, home: 10, number: 3, clock: "7:22" }), espn("STATUS_IN_PROGRESS", { away: 14, home: 10, period: 2, clock: "7:22" })).issues.some((i) => i.kind === "period"));
  assert.equal(comparePass("r", { state: "UNAVAILABLE", reason: "PROVIDER_ERROR" }, espn("STATUS_IN_PROGRESS")).refusal, "PROVIDER_ERROR");
});

test("replayDir: a one-pass kickoff lag is LAG; a persisting difference is a DISAGREEMENT; files are only read", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "v2-replay-"));
  const put = (t, e, s) => { fs.writeFileSync(path.join(dir, `${t}-event.json`), JSON.stringify(e)); fs.writeFileSync(path.join(dir, `${t}-espn.json`), JSON.stringify(s)); };
  try {
    put("20261016T000500Z", env("PRE"), espn("STATUS_SCHEDULED"));
    put("20261016T001700Z", env("PRE"), espn("STATUS_IN_PROGRESS", { away: 0, home: 0, period: 1, clock: "14:20" }));    // gateway cache: lag
    put("20261016T002200Z", env("LIVE", { away: 0, home: 0, number: 1, clock: "9:01" }), espn("STATUS_IN_PROGRESS", { away: 0, home: 0, period: 1, clock: "9:01" }));
    put("20261016T010000Z", env("LIVE", { away: 7, home: 0, number: 2, clock: "5:00" }), espn("STATUS_IN_PROGRESS", { away: 7, home: 3, period: 2, clock: "5:00" })); // wrong
    put("20261016T010500Z", env("LIVE", { away: 7, home: 0, number: 2, clock: "1:10" }), espn("STATUS_IN_PROGRESS", { away: 7, home: 3, period: 2, clock: "1:10" })); // still wrong
    const before = fs.readdirSync(dir).map((f) => fs.readFileSync(path.join(dir, f), "utf8")).join("|");
    const r = replayDir(dir);
    assert.equal(r.passes, 5);
    assert.ok(r.lags.some((l) => l.t === "20261016T001700Z" && l.kind === "status"), "the kickoff transition one pass late is a lag");
    assert.ok(!r.disagreements.some((d) => d.t === "20261016T001700Z"), "nothing on the lagging kickoff pass is a disagreement");
    assert.deepEqual(r.disagreements.map((d) => [d.t, d.kind]), [["20261016T010000Z", "score"], ["20261016T010500Z", "score"]], "the persisting wrong score is a disagreement on both passes (V2 and the gateway agree; ESPN differs)");
    assert.equal(fs.readdirSync(dir).map((f) => fs.readFileSync(path.join(dir, f), "utf8")).join("|"), before, "recorded files untouched");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
