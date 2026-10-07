/**
 * Truth regression (2026-10-06): /results/picks published the NFL record as 64–43 when the true record is 61–43.
 * Three games that kicked off just after 00:00Z (TEN @ SF, LAR @ LAC, LAR @ DEN) sit in two settlement files each —
 * graded once against a superseded receipt and once against the latest pre-kickoff one — and the reader counted
 * both. The reader now keeps the forecast of record per game, the same rule the Forecast Ledger applies.
 *
 * Runs from app/ (the committed settlement files and ledger resolve from the repository root).
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { makeGradedPickOwners, nflSettlementOfRecord } from "./graded-pick-owners.mjs";

const APP = process.cwd();
const ROOT = path.resolve(APP, "..");
const SETTLE = path.join(ROOT, "data/internal/nfl/experimental-settlement");
const owners = makeGradedPickOwners({ appDir: APP, rootDir: ROOT });
const DUPLICATED = { "nfl-401874392": "TEN @ SF", "nfl-401873300": "LAR @ LAC", "nfl-401872962": "LAR @ DEN" };
const wl = (rows) => ({ w: rows.filter((r) => r.hit === true).length, l: rows.filter((r) => r.hit === false).length });

const ev = (id, at, correct, extra = {}) => ({ canonicalEventId: id, lineage: { forecastGeneratedAt: at }, grade: { winner: { correct } }, ...extra });

test("🔴 two representations of the same game count once — the latest pre-kickoff receipt is of record", () => {
  const kept = nflSettlementOfRecord([ev("nfl-1", "2026-09-27T23:40:42Z", true, { tag: "superseded" }), ev("nfl-1", "2026-09-28T00:17:41Z", true, { tag: "record" })]);
  assert.deepEqual(kept.map((e) => e.tag), ["record"]);
  const reversed = nflSettlementOfRecord([ev("nfl-1", "2026-09-28T00:17:41Z", false, { tag: "record" }), ev("nfl-1", "2026-09-27T23:40:42Z", true, { tag: "superseded" })]);
  assert.deepEqual(reversed.map((e) => e.tag), ["record"], "file order does not decide it");
});

test("genuinely distinct games still count independently; the provider id is the fallback key; an unkeyed row is left out (Q5)", () => {
  const kept = nflSettlementOfRecord([
    ev("nfl-1", "2026-09-28T00:00:00Z", true), ev("nfl-2", "2026-09-28T00:00:00Z", false),
    { providerEventId: "3", lineage: { forecastGeneratedAt: "a" } }, { canonicalEventId: "nfl-3", lineage: { forecastGeneratedAt: "b" } },
    { matchup: "no id" },
  ]);
  assert.equal(kept.length, 3, "nfl-1, nfl-2 and one nfl-3; the row with no game id is never counted (founder Q5, Stage 3E)");
  assert.ok(!kept.some((e) => e.matchup === "no id"));
});

test("🔴 from the committed data: 61–43, each duplicated game once, ties stay void", () => {
  const rows = owners.nflPicks();
  assert.equal(new Set(rows.map((r) => r.eventId)).size, rows.length, "one row per game");
  /* 61–43 is the record the #999 fix established for every game through 2026-10-04. It is pinned on that frozen
     window, so a newly graded game (MNF ATL @ NO, 2026-10-05, settled 2026-10-06) cannot fail it — and a
     re-introduced double count in that window still does. */
  assert.deepEqual(wl(rows.filter((r) => r.when <= "2026-10-04")), { w: 61, l: 43 });
  for (const [id, matchup] of Object.entries(DUPLICATED)) {
    const hits = rows.filter((r) => r.eventId === id);
    assert.equal(hits.length, 1, `${matchup} once`);
    assert.equal(hits[0].subject, matchup);
  }
  const ties = rows.filter((r) => r.actual === "tie");
  assert.ok(ties.every((r) => r.hit === null), "a tie is never a win or a loss");
});

test("non-duplicated games are untouched: same rows, same results as reading every file", () => {
  const raw = [];
  for (const f of fs.readdirSync(SETTLE).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x))) {
    for (const e of JSON.parse(fs.readFileSync(path.join(SETTLE, f), "utf8")).events ?? []) raw.push(e);
  }
  const rows = owners.nflPicks();
  const others = raw.filter((e) => !(e.canonicalEventId in DUPLICATED));
  assert.equal(rows.filter((r) => !(r.eventId in DUPLICATED)).length, others.length);
  const rawWl = { w: others.filter((e) => !e.grade?.actual?.tie && e.grade?.winner?.correct === true).length, l: others.filter((e) => !e.grade?.actual?.tie && e.grade?.winner?.correct === false).length };
  assert.deepEqual(wl(rows.filter((r) => !(r.eventId in DUPLICATED))), rawWl);
});

test("the reader picks the same receipt the Forecast Ledger names as of record", () => {
  const ledger = fs.readFileSync(path.join(ROOT, "data/internal/forecast-ledger/v1/nfl.jsonl"), "utf8").split("\n").filter(Boolean)
    .map((l) => JSON.parse(l)).filter((r) => r.family === "nfl_game_winner");
  const receiptByGame = new Map(ledger.map((r) => [`nfl-${r.eventId}`, r.receiptId]));
  const raw = [];
  for (const f of fs.readdirSync(SETTLE).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x))) {
    for (const e of JSON.parse(fs.readFileSync(path.join(SETTLE, f), "utf8")).events ?? []) raw.push(e);
  }
  for (const id of Object.keys(DUPLICATED)) {
    const kept = nflSettlementOfRecord(raw).find((e) => e.canonicalEventId === id);
    assert.equal(kept.lineage.receiptFile, receiptByGame.get(id), `${DUPLICATED[id]} uses the ledger's receipt of record`);
  }
});

test("🔴 the date view uses the same rows: Sun Sep 27 lists LAR @ DEN once", async () => {
  const { resultsDay } = await import("../results/v2/day.ts");
  const nfl = resultsDay("2026-09-27").nfl;
  assert.equal(nfl.filter((e) => e.id === "nfl-401872962").length, 1);
  assert.equal(new Set(nfl.map((e) => e.id)).size, nfl.length, "no game twice on any NFL day");
});
