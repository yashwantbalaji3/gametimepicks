/**
 * Results V2 · B-1 — the aggregation rules, parity with the existing graded record, and the read model on the
 * live tree. Fixture dates for the rules; the live tree only for parity (same owner rows, two consumers).
 */
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { outcomeFromHit, outcomeFromWord, dailySeries, windowsFrom, finish, population } from "./populations.mjs";
import { makeGradedPickOwners } from "../../sports/graded-pick-owners.mjs";
import { buildGradedRecord } from "../../sports/graded-picks.mjs";

const T = "2031-07-14";
const rows = [
  { date: "2031-07-14", outcome: "WIN" }, { date: "2031-07-14", outcome: "LOSS" }, { date: "2031-07-14", outcome: "PUSH" },
  { date: "2031-07-10", outcome: "WIN" }, { date: "2031-07-10", outcome: "VOID" },
  { date: "2031-06-20", outcome: "LOSS" },
  { date: "2031-05-01", outcome: "WIN" },
  { date: null, outcome: "WIN" }, { date: "2031-07-14", outcome: "MAYBE" },
];

test("outcomes: a miss is a loss, a push and a void are neither; unreadable is never guessed", () => {
  assert.equal(outcomeFromHit(true), "WIN"); assert.equal(outcomeFromHit(false), "LOSS"); assert.equal(outcomeFromHit(null), "VOID");
  assert.equal(outcomeFromWord("win"), "WIN"); assert.equal(outcomeFromWord("PUSH"), "PUSH"); assert.equal(outcomeFromWord("pending"), null);
});

test("🔴 the daily series counts per day, newest first, and never drops or dates a row it cannot read", () => {
  const s = dailySeries(rows);
  assert.deepEqual(s.days[0], { date: "2031-07-14", won: 1, lost: 1, push: 1, void: 0 });
  assert.equal(s.days.length, 4);
  assert.equal(s.undated, 1, "the dateless row is counted as undated");
  assert.equal(s.unreadable, 1, "the unreadable outcome is counted, not guessed");
});

test("🔴 windows: push and void are never decisive; hit rate only when something was decided; season is optional", () => {
  const w = windowsFrom(dailySeries(rows).days, { today: T, seasonStart: "2031-06-01" });
  assert.deepEqual([w.today.won, w.today.lost, w.today.push, w.today.decisive, w.today.hitRate], [1, 1, 1, 2, 0.5]);
  assert.deepEqual([w.d7.won, w.d7.lost, w.d7.void, w.d7.decisive], [2, 1, 1, 3], "the 7-day window includes 07-10");
  assert.equal(w.d30.lost, 2, "the 30-day window reaches 06-20");
  assert.equal(w.season.won + w.season.lost, 4, "season from 06-01 excludes 05-01");
  assert.equal(w.all.won, 3);
  assert.equal(finish({ won: 0, lost: 0, push: 2, void: 1 }).hitRate, null, "no decided row ⇒ no rate, never 0%");
  assert.equal(windowsFrom([], { today: T }).season, null);
});

test("windows follow the reader's day: the same series read a day later has an empty 'today'", () => {
  const days = dailySeries(rows).days;
  assert.equal(windowsFrom(days, { today: "2031-07-15" }).today.n, 0);
  assert.equal(windowsFrom(days, { today: "2031-07-13" }).today.n, 0, "a future row never counts before its day");
});

test("a population's pending is null unless an owner carries it — never a zero", () => {
  const p = population({ id: "x", sport: "mlb", label: "X", klass: "PUBLIC", kind: "GAME", owner: "o", rows, today: T });
  assert.equal(p.pending, null);
});

test("🔴 parity: V2's all-time counts equal the existing graded record for every sport (same owner rows)", () => {
  const appDir = process.cwd(); const rootDir = path.resolve(appDir, "..");
  const owners = makeGradedPickOwners({ appDir, rootDir });
  for (const [sport, picks] of [["nfl", owners.nflPicks()], ["epl", owners.eplPicks()], ["ufc", owners.ufcPicks()], ["mlb", owners.mlbPicks()]]) {
    if (!picks) { console.log(`# ${sport}: no ledger on disk — nothing to reconcile (announced)`); continue; }
    const rec = buildGradedRecord({ sport, label: sport, picks, shown: 10, what: "", caveat: "" });
    const p = population({ id: sport, sport, label: sport, klass: "PUBLIC", kind: "GAME", owner: "o", today: "2099-01-01",
      rows: picks.map((r) => ({ date: r.when ?? null, outcome: outcomeFromHit(r.hit) })) });
    const all = p.windows.all;
    assert.equal(all.won, rec.counts.hits, `${sport}: hits`);
    assert.equal(all.lost, rec.counts.misses, `${sport}: misses`);
    assert.equal(all.void + p.undated, rec.counts.voided + (rec.counts.total - rec.counts.counted - rec.counts.voided), `${sport}: voids reconcile`);
  }
});

test("🔴 owners date a game by its ET day — Monday Night Football is a Monday game, not Tuesday", () => {
  const src = (p) => import("node:fs").then((fs) => fs.readFileSync(path.join(process.cwd(), p), "utf8"));
  return src("src/lib/sports/graded-pick-owners.mjs").then((s) => {
    assert.match(s, /when: etDayOf\(e\.kickoffUtc, f\)/, "NFL: ET day of kickoff");
    assert.doesNotMatch(s, /when: String\(e\.kickoffUtc \?\? f\)\.slice\(0, 10\)/, "never the UTC slice");
    const ET = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
    assert.equal(ET.format(new Date("2031-09-30T00:15:00Z")), "2031-09-29", "the rule the owner applies");
  });
});
