/**
 * The score-shape receipt is the pregame record a score-shape grade will be read against, so it holds
 * the same promises as a forecast receipt: written before kickoff, never rewritten, a pre-kickoff
 * change is a new revision, and a started game gets nothing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  scoreShapeReceiptKey, scoreShapeReceiptDir, existingScoreShapeReceipts, planScoreShapeReceipt, writeScoreShapeReceipt,
} from "./score-shape-receipts.mjs";

const KICK = "2026-10-06T00:15Z";
const game = (over = {}) => ({
  providerEventId: "401872979", canonicalEventId: "nfl-401872979", matchup: "ATL @ NO", kickoffUtc: KICK, away: "ATL", home: "NO",
  centre: { marginMedian: 3, totalMedian: 44 }, finalScores: [{ away: 20, home: 24, probability: 0.02 }],
  keyNumbers: { byNumber: [{ number: 3, probability: 0.14 }] }, marginDistribution: [], totalDistribution: [], teamPointsDistribution: [],
  scoringRates: {}, overtimeProbability: 0.05, tieProbability: 0.003, ...over,
});
const forecast = (hash) => ({ generatedAt: "2026-10-05T16:00:00Z", model: { inputHash: hash, version: 2 } });
const tmpRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), "nfl-shape-receipts-"));
const write = (root, hash, nowIso) => writeScoreShapeReceipt({
  root, game: game(), forecast: forecast(hash), engineId: "engine-x", runs: 20000, nowIso,
  receiptKey: scoreShapeReceiptKey({ forecastInputHash: hash, engineId: "engine-x", runs: 20000 }),
});
const files = (root) => fs.readdirSync(scoreShapeReceiptDir(root, KICK)).sort();

test("a pre-kickoff run writes the original receipt with its provenance", () => {
  const root = tmpRoot();
  assert.equal(write(root, "aaa", "2026-10-05T16:00:00Z").action, "WRITE_ORIGINAL");
  assert.deepEqual(files(root), ["401872979.json"]);
  const r = JSON.parse(fs.readFileSync(path.join(scoreShapeReceiptDir(root, KICK), "401872979.json"), "utf8"));
  assert.equal(r.solvedOnto.forecastInputHash, "aaa");
  assert.equal(r.generatedAt, "2026-10-05T16:00:00Z");
  assert.equal(r.shape.overtimeProbability, 0.05);
});

test("the same inputs re-run is UNCHANGED and writes nothing", () => {
  const root = tmpRoot();
  write(root, "aaa", "2026-10-05T16:00:00Z");
  const before = fs.readFileSync(path.join(scoreShapeReceiptDir(root, KICK), "401872979.json"), "utf8");
  assert.equal(write(root, "aaa", "2026-10-05T20:00:00Z").action, "UNCHANGED");
  assert.deepEqual(files(root), ["401872979.json"]);
  assert.equal(fs.readFileSync(path.join(scoreShapeReceiptDir(root, KICK), "401872979.json"), "utf8"), before);
});

test("a pre-kickoff input change writes a revision and leaves the original byte-identical", () => {
  const root = tmpRoot();
  write(root, "aaa", "2026-10-05T16:00:00Z");
  const before = fs.readFileSync(path.join(scoreShapeReceiptDir(root, KICK), "401872979.json"), "utf8");
  const plan = write(root, "bbb", "2026-10-05T22:30:00Z");
  assert.equal(plan.action, "WRITE_REVISION");
  assert.deepEqual(files(root), ["401872979-rev-20261005T2230Z.json", "401872979.json"]);
  assert.equal(fs.readFileSync(path.join(scoreShapeReceiptDir(root, KICK), "401872979.json"), "utf8"), before);
  const rev = JSON.parse(fs.readFileSync(path.join(scoreShapeReceiptDir(root, KICK), plan.file), "utf8"));
  assert.equal(rev.revisionOf, "401872979.json");
  // the latest revision is what the next run compares against
  assert.equal(write(root, "bbb", "2026-10-05T23:00:00Z").action, "UNCHANGED");
});

test("a started game is never written, even with new inputs", () => {
  const root = tmpRoot();
  assert.equal(write(root, "aaa", KICK.replace("Z", ":00Z")).action, "LOCKED_AT_KICKOFF");
  assert.equal(fs.existsSync(scoreShapeReceiptDir(root, KICK)), false);
  write(root, "aaa", "2026-10-05T16:00:00Z");
  assert.equal(write(root, "ccc", "2026-10-06T01:00:00Z").action, "LOCKED_AT_KICKOFF");
  assert.deepEqual(files(root), ["401872979.json"]);
});

test("no forecast inputHash means no receipt (missing is not a guess)", () => {
  assert.equal(scoreShapeReceiptKey({ forecastInputHash: null, engineId: "e", runs: 1 }), null);
  assert.equal(planScoreShapeReceipt({ providerEventId: "1", kickoffUtc: KICK, receiptKey: null, nowIso: "2026-10-05T16:00:00Z" }).action, "NO_KEY");
});

test("a revision stamp that already exists is never overwritten", () => {
  const root = tmpRoot();
  write(root, "aaa", "2026-10-05T16:00:00Z");
  write(root, "bbb", "2026-10-05T22:30:00Z");
  const dir = scoreShapeReceiptDir(root, KICK);
  const before = fs.readFileSync(path.join(dir, "401872979-rev-20261005T2230Z.json"), "utf8");
  assert.equal(write(root, "ccc", "2026-10-05T22:30:30Z").action, "UNCHANGED");
  assert.equal(fs.readFileSync(path.join(dir, "401872979-rev-20261005T2230Z.json"), "utf8"), before);
  assert.equal(existingScoreShapeReceipts(dir, "401872979").length, 2);
});
