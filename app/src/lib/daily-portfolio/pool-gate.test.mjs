import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkTeamMarketPool, GATE, EXIT, MAX_POOL_AGE_MS } from "./pool-gate.mjs";

const NOW = "2026-09-06T17:39:00Z";
const game = (id) => ({ gameId: id, homeTeam: "H", awayTeam: "A", commenceTime: "2026-09-06T23:00:00Z" });
const store = (doc, name = "2026-09-06.json") => {
  const r = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-gate-"));
  if (doc !== undefined) {
    const p = path.join(r, "mlb", "team-markets", name);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, typeof doc === "string" ? doc : JSON.stringify(doc));
  }
  return r;
};
const ok = { sport: "mlb", date: "2026-09-06", generatedAt: "2026-09-06T17:05:40Z", games: [game("g1"), game("g2")] };

test("a valid fresh pool passes and reports its size and age", () => {
  const r = checkTeamMarketPool({ root: store(ok), date: "2026-09-06", nowIso: NOW });
  assert.equal(r.verdict, GATE.OK);
  assert.equal(r.games, 2);
  assert.equal(EXIT[r.verdict], 0);
  assert.match(r.detail, /33 minutes ago/);   // the real 2026-09-06 margin
});

test("THE RACE: no artifact yet is INPUT_MISSING, and it does not exit 0", () => {
  /*
   * The producer wrote its pool at 17:05 and 16:50 on the two days observed, both AFTER the 15:30
   * nominal generation time. Generation succeeded only because it was itself late. Had it run on
   * time this is the state it would have met, and it must not read as a slate that came up short.
   */
  const r = checkTeamMarketPool({ root: store(undefined), date: "2026-09-06", nowIso: "2026-09-06T15:30:00Z" });
  assert.equal(r.verdict, GATE.INPUT_MISSING);
  assert.notEqual(EXIT[r.verdict], 0, "a missing input must not exit successfully");
  assert.match(r.detail, /producer has not completed/);
});

test("yesterday's file must never satisfy today's dependency", () => {
  // An existence check passes here. That is why this is not an existence check.
  const r = checkTeamMarketPool({ root: store({ ...ok, date: "2026-09-05" }), date: "2026-09-06", nowIso: NOW });
  assert.equal(r.verdict, GATE.INPUT_WRONG_DATE);
  assert.match(r.detail, /carries date 2026-09-05/);
});

test("a stale pool is refused even when it is for the right date", () => {
  const old = { ...ok, generatedAt: new Date(Date.parse(NOW) - MAX_POOL_AGE_MS - 60_000).toISOString() };
  const r = checkTeamMarketPool({ root: store(old), date: "2026-09-06", nowIso: NOW });
  assert.equal(r.verdict, GATE.INPUT_STALE);
  assert.ok(r.ageMs > MAX_POOL_AGE_MS);
});

test("a green producer run with an empty output is a valid empty slate, not a pool", () => {
  const r = checkTeamMarketPool({ root: store({ ...ok, games: [] }), date: "2026-09-06", nowIso: NOW });
  assert.equal(r.verdict, GATE.INPUT_EMPTY);
  assert.equal(EXIT[r.verdict], 0, "an off day is legitimate — generation proceeds and reports no play");
  assert.notEqual(r.verdict, GATE.OK, "but it is not a priced pool");
});

test("a game missing its start time fails the gate rather than reaching the selector", () => {
  // Without commenceTime the pre-event filter cannot run, and a pool that cannot be pre-event
  // filtered can card a game already under way.
  const bad = { ...ok, games: [game("g1"), { gameId: "g2", homeTeam: "H", awayTeam: "A" }] };
  const r = checkTeamMarketPool({ root: store(bad), date: "2026-09-06", nowIso: NOW });
  assert.equal(r.verdict, GATE.INPUT_MALFORMED);
  assert.match(r.detail, /commenceTime/);
});

test("unreadable, wrong-sport, no-collection and no-timestamp all refuse distinctly", () => {
  const cases = [
    [store("{ not json"), GATE.INPUT_MALFORMED, /readable JSON/],
    [store({ ...ok, sport: "nfl" }), GATE.INPUT_MALFORMED, /sport nfl/],
    [store({ ...ok, games: undefined }), GATE.INPUT_MALFORMED, /no games collection/],
    [store({ ...ok, generatedAt: undefined }), GATE.INPUT_MALFORMED, /age cannot be established/],
  ];
  for (const [root, verdict, re] of cases) {
    const r = checkTeamMarketPool({ root, date: "2026-09-06", nowIso: NOW });
    assert.equal(r.verdict, verdict);
    assert.match(r.detail, re);
  }
});

test("the object form of `games` is accepted — it is what the real artifact uses", () => {
  const r = checkTeamMarketPool({ root: store({ ...ok, games: { a: game("a"), b: game("b") } }), date: "2026-09-06", nowIso: NOW });
  assert.equal(r.verdict, GATE.OK);
  assert.equal(r.games, 2);
});

test("every verdict has an exit code, and only the two benign ones are zero", () => {
  for (const v of Object.values(GATE)) assert.equal(typeof EXIT[v], "number", `${v} has no exit code`);
  const zero = Object.values(GATE).filter((v) => EXIT[v] === 0);
  assert.deepEqual(zero.sort(), [GATE.INPUT_EMPTY, GATE.OK].sort());
});

test("LIVE · today's real pool passes its own gate", () => {
  const r = checkTeamMarketPool({ root: path.join(process.cwd(), "public", "data"), date: "2026-09-06", nowIso: new Date().toISOString() });
  assert.ok([GATE.OK, GATE.INPUT_STALE].includes(r.verdict), `today's pool verdict is ${r.verdict}: ${r.detail}`);
  if (r.verdict === GATE.OK) assert.ok(r.games > 0);
});
