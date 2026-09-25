/**
 * THE CONFIRMED BATTING ORDER — and the leakage rule that lets it be used at all.
 *
 * Run: npx tsx --test src/lib/mlb/full-game/confirmed-lineup.test.mjs
 *
 * The full-game engine built each side from the board's PROP LINES: a batter existed only if a book
 * had posted a hit line for him. At board time six to eight per team are posted, so the rest were
 * replacement-level padding and "batting order" was prop-listing order. Every game on 2026-08-21
 * came out `degraded`, fourteen of fifteen padded — while the confirmed nine-man orders for all
 * fifteen sat on disk, captured free from StatsAPI eight times a day.
 *
 * It matters because this engine simulates plate appearances: leadoff takes about 4.6 to the ninth
 * hitter's 3.9. Who bats where is worth something over ten thousand games.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { selectConfirmedLineup } from "./confirmed-lineup.ts";
import { gameInputsFromBoard } from "./board-adapter.ts";

const nine = (offset = 0) => Array.from({ length: 9 }, (_, i) => ({
  playerId: 1000 + offset + i, name: `P${offset + i}`, position: "OF", battingOrderSlot: i + 1,
}));
const snap = (o) => ({ gamePk: 1, eventStartTime: "2026-08-21T23:10:00Z", ...o });

test("LEAKAGE · a snapshot at or after first pitch is refused", () => {
  /*
   * Checked against the snapshot's own eventStartTime rather than its researchEligible flag. A flag
   * that asserts a property is not the property — and a capture taken after the first pitch can see
   * the lineup that actually took the field, including a late scratch nobody knew about pregame.
   */
  const after = selectConfirmedLineup([snap({
    capturedAt: "2026-08-21T23:10:00Z", researchEligible: true,
    away: { posted: true, count: 9, lineup: nine() }, home: { posted: true, count: 9, lineup: nine(50) },
  })]);
  assert.equal(after.away, null, "captured exactly at first pitch is not pregame");
  assert.equal(after.home, null);

  const before = selectConfirmedLineup([snap({
    capturedAt: "2026-08-21T20:10:00Z",
    away: { posted: true, count: 9, lineup: nine() }, home: { posted: true, count: 9, lineup: nine(50) },
  })]);
  assert.ok(before.away && before.home, "three hours before first pitch is exactly the intended window");
});

test("the LATEST pregame snapshot wins, per side independently", () => {
  // The two teams post at different times. Requiring both would throw away a confirmed home lineup
  // for an hour while the away side is still out.
  const out = selectConfirmedLineup([
    snap({ capturedAt: "2026-08-21T19:00:00Z", home: { posted: true, count: 9, lineup: nine(50) } }),
    snap({ capturedAt: "2026-08-21T21:00:00Z", away: { posted: true, count: 9, lineup: nine(90) } }),
  ]);
  assert.equal(out.home.batters[0].playerId, 1050, "home came from the earlier snapshot");
  assert.equal(out.away.batters[0].playerId, 1090, "away from the later one");
  assert.equal(out.away.capturedAt, "2026-08-21T21:00:00Z");
});

test("a partial or malformed order is NOT a confirmed lineup", () => {
  const eight = nine().slice(0, 8);
  assert.equal(selectConfirmedLineup([snap({ capturedAt: "2026-08-21T20:00:00Z", away: { posted: true, count: 8, lineup: eight } })]).away, null);
  // posted:false with a full list is a lineup nobody has published.
  assert.equal(selectConfirmedLineup([snap({ capturedAt: "2026-08-21T20:00:00Z", away: { posted: false, count: 9, lineup: nine() } })]).away, null);
  // Duplicate or gapped slots mean the capture caught a lineup mid-write.
  const dup = nine(); dup[3].battingOrderSlot = 3;
  assert.equal(selectConfirmedLineup([snap({ capturedAt: "2026-08-21T20:00:00Z", away: { posted: true, count: 9, lineup: dup } })]).away, null);
});

test("slots are returned in batting order regardless of capture order", () => {
  const shuffled = [...nine()].reverse();
  const out = selectConfirmedLineup([snap({ capturedAt: "2026-08-21T20:00:00Z", away: { posted: true, count: 9, lineup: shuffled } })]);
  assert.deepEqual(out.away.batters.map((b) => b.battingOrderSlot), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

/* ── AGAINST THE REAL SLATE ──────────────────────────────────────────────────────────────────── */

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const DATE = "2026-08-21";
const boardPath = path.join(APP, `public/data/mlb/boards/${DATE}.json`);
const lineupDir = path.join(REPO, `data/internal/mlb/pregame-archive/pregame-features/lineup/${DATE}`);

function realConfirmed() {
  const byGame = new Map();
  for (const f of fs.readdirSync(lineupDir).filter((x) => x.endsWith(".json"))) {
    const s = JSON.parse(fs.readFileSync(path.join(lineupDir, f), "utf8"));
    if (!byGame.has(s.gamePk)) byGame.set(s.gamePk, []);
    byGame.get(s.gamePk).push(s);
  }
  const out = new Map();
  for (const [g, snaps] of byGame) out.set(g, selectConfirmedLineup(snaps));
  return out;
}

test("REAL SLATE · the confirmed order replaces padding, and the padding was the whole gap", () => {
  if (!fs.existsSync(boardPath) || !fs.existsSync(lineupDir)) return;
  const board = JSON.parse(fs.readFileSync(boardPath, "utf8"));

  const before = gameInputsFromBoard(board, undefined, undefined);
  const after = gameInputsFromBoard(board, undefined, realConfirmed());

  const padded = (inputs) => inputs.filter((g) => g.completeness.awayLineupCount < 9 || g.completeness.homeLineupCount < 9).length;
  assert.ok(padded(before) > 0, "the premise: this slate WAS padded without confirmed orders");
  assert.equal(padded(after), 0, "and is not, with them");

  /*
   * THIS USED TO ASSERT `ready(after) > ready(before)`, AND THAT PROXY WAS THE DEFECT.
   *
   * A confirmed order supplies identities and slots. It does not post a single prop line, so it
   * cannot make a batter RATED and has no business moving a level that is a claim about
   * projections. The assertion passed only because `fullyReady` was reading `realCount`, which the
   * confirmed path sets to nine unconditionally — so the test was measuring the inflation rather
   * than the improvement, and it went green on the day READY per slate jumped from 1-4 to 12-15.
   *
   * What the confirmed order actually delivers is the line above: the padding is gone. The level is
   * pinned UNCHANGED here, and the projections-not-slots rule is proven directly in
   * completeness-level.test.mjs.
   */
  const ready = (inputs) => inputs.filter((g) => g.completeness.level === "ready").length;
  assert.equal(
    ready(after), ready(before),
    `a confirmed batting order posts no prop lines, so it must not move READY (${ready(before)} → ${ready(after)})`,
  );
  /*
   * A confirmed order can only LOWER the rated count, never raise it: it posts no lines, and it
   * drops the batters who had one but are not in the nine. On 2026-08-21 that is 241 -> 219 — the
   * twenty-two priced batters the prop-derived lineup was simulating who were not starting. Slots
   * go the other way (241 -> 270, the padding replaced), which is exactly why the two counts cannot
   * answer each other's question.
   */
  const rated = (inputs) => inputs.reduce((n, g) => n + g.completeness.awayRatedCount + g.completeness.homeRatedCount, 0);
  assert.ok(rated(after) <= rated(before), `a confirmed order posts no lines (${rated(before)} → ${rated(after)})`);
  const slots = (inputs) => inputs.reduce((n, g) => n + g.completeness.awayLineupCount + g.completeness.homeLineupCount, 0);
  assert.ok(slots(after) > slots(before), `and it does fill slots (${slots(before)} → ${slots(after)})`);

  // confirmed_batting_order was listed as permanently missing. It must now be absent from the games
  // that actually have one, and still present on any that do not.
  for (const g of after) {
    const both = g.completeness.awayLineupSource === "confirmed" && g.completeness.homeLineupSource === "confirmed";
    assert.equal(
      g.completeness.missingFamilies.includes("confirmed_batting_order"), !both,
      `${g.awayTeam} @ ${g.homeTeam}: the missing-families list must match the sources actually used`,
    );
  }
});

test("REAL SLATE · a batter with no posted line keeps his identity and slot", () => {
  if (!fs.existsSync(boardPath) || !fs.existsSync(lineupDir)) return;
  const board = JSON.parse(fs.readFileSync(boardPath, "utf8"));
  const after = gameInputsFromBoard(board, undefined, realConfirmed());
  const g = after.find((x) => x.completeness.awayLineupSource === "confirmed" && x.completeness.awayRatedCount < 9);
  if (!g) return;   // every batter priced on this slate
  /*
   * The point of the change. Before, an unpriced batter did not exist and a replacement hitter took
   * his slot; now he is himself, in his own slot, priced at replacement level. That is a strictly
   * smaller assumption, and it is why ratedCount is reported separately from lineup count.
   */
  assert.equal(g.awayLineup.length, 9);
  assert.ok(g.awayLineup.every((b) => Number.isFinite(b.playerId)), "every slot names a real player");
  assert.ok(g.completeness.awayRatedCount < 9 && g.completeness.awayRatedCount >= 0);
});
