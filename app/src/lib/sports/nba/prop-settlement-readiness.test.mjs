/**
 * NBA player-prop settlement readiness: forward-graded evidence opens the settlement gate per family, and nothing else.
 * Run: npx tsx --test src/lib/sports/nba/prop-settlement-readiness.test.mjs
 *
 * Ledger entries below are TEST FIXTURES in the nba-prop-shadow-grade@1 shape. No line here is a price.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { nbaPropSettlementReadiness } from "./prop-settlement-readiness.mjs";
import { committedNbaPropReadiness } from "./prop-settlement-source.mjs";

const entry = (seq, family, state, { date = "2026-10-20", eventId = "401909088", playerId = "1" } = {}) => ({
  schema: "nba-prop-shadow-grade@1", seq, key: `${date}|${eventId}|${playerId}|${family}`, date, eventId, playerId, family, state,
});

test("no ledger, an empty ledger, or only pending rows: no family is ready", () => {
  assert.deepEqual(nbaPropSettlementReadiness(null).readyFamilies, []);
  assert.deepEqual(nbaPropSettlementReadiness([]).readyFamilies, []);
  assert.deepEqual(nbaPropSettlementReadiness([entry(1, "pts", "PENDING_FINAL"), entry(2, "reb", "NO_MEASUREMENT", { playerId: "2" })]).readyFamilies, []);
  assert.deepEqual(nbaPropSettlementReadiness([{ seq: 1, family: "pts", state: "GRADED" }]).readyFamilies, [], "an entry without the schema and key does not count");
});

test("a GRADED forward row makes its own family ready, per family, with counts", () => {
  const r = nbaPropSettlementReadiness([
    entry(1, "pts", "PENDING_FINAL"),
    entry(2, "pts", "GRADED"),                                   // supersedes seq 1 for the same key
    entry(3, "pra", "GRADED", { playerId: "7", eventId: "401909089" }),
    entry(4, "reb", "VOID_PENDING_REVIEW", { playerId: "8" }),
    entry(5, "minutes", "GRADED"),                               // not a bettable family: ignored
  ]);
  assert.deepEqual(r.readyFamilies, ["pra", "pts"]);
  assert.equal(r.families.pts.graded, 1);
  assert.deepEqual(r.families.pts.dates, ["2026-10-20"]);
  assert.equal(r.families.reb.graded, 0);
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r.readyFamilies));
});

test("the latest entry per key wins: a row that moved back under review stops counting", () => {
  const r = nbaPropSettlementReadiness([entry(1, "ast", "GRADED"), entry(2, "ast", "VOID_PENDING_REVIEW")]);
  assert.deepEqual(r.readyFamilies, []);
  const back = nbaPropSettlementReadiness([entry(1, "ast", "VOID_PENDING_REVIEW"), entry(2, "ast", "GRADED")]);
  assert.deepEqual(back.readyFamilies, ["ast"]);
});

test("the committed repo state today: the forward ledger has not been written yet, so every prop family is NOT ready", () => {
  const repo = path.resolve(process.cwd(), "..");
  const ledger = path.join(repo, "data/internal/research/nba/prop-grades/v0.1/ledger.jsonl");
  const r = committedNbaPropReadiness({ repoRoot: repo });
  if (!fs.existsSync(ledger)) assert.deepEqual(r.readyFamilies, [], "no ledger reads as not ready, never as ready");
  else assert.ok(Array.isArray(r.readyFamilies), "once the scheduled writer appends, readiness is read from it");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nba-ready-"));
  const dir = path.join(tmp, "data/internal/research/nba/prop-grades/v0.1");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "ledger.jsonl"), "{not json\n");
  assert.deepEqual(committedNbaPropReadiness({ repoRoot: tmp }).readyFamilies, [], "an unreadable ledger is not ready");
  fs.writeFileSync(path.join(dir, "ledger.jsonl"), `${JSON.stringify(entry(1, "threePm", "GRADED"))}\n`);
  assert.deepEqual(committedNbaPropReadiness({ repoRoot: tmp }).readyFamilies, ["threePm"]);
  fs.rmSync(tmp, { recursive: true, force: true });
});
