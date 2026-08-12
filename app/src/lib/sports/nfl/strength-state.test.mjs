/**
 * NFL strength-state + event-assembly guards (Program 166 · Release E).
 *
 * The leakage proofs are structural: the state at cutoff T ignores the target and everything
 * after it; the baseline's arithmetic is reproduced parameter-for-parameter; preseason never
 * fits. The REAL-EVENT case assembles tonight's next scheduled game from committed artifacts and
 * must land READY_EXCEPT_ODDS with the odds refusal as the only gap.
 *
 * Run: npx tsx --test src/lib/sports/nfl/strength-state.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { strengthStateAt, ELO_PARAMS } from "./strength-state.mjs";
import { assembleNflEvent } from "./event-assembly.mjs";

const G = (id, dateUtc, home, away, ftHome, ftAway, over = {}) => ({ providerEventId: id, dateUtc, home, away, ftHome, ftAway, statusRaw: "STATUS_FINAL", seasonType: 2, season: 2025, ...over });

test("baseline arithmetic reproduced: params match the committed evaluator; a win moves ratings symmetrically", () => {
  assert.deepEqual({ ...ELO_PARAMS }, { K: 20, HOME_ADVANTAGE: 48, MEAN: 1505, SEASON_REGRESSION: 1 / 3 });
  const s = strengthStateAt({ rows: [G("g1", "2025-09-07T17:00Z", "KC", "DET", 27, 20)], cutoffIso: "2025-09-08T00:00:00Z" });
  assert.equal(s.gamesFolded, 1);
  const kc = s.ratingFor("KC"), det = s.ratingFor("DET");
  assert.ok(kc > 1505 && det < 1505);
  assert.ok(Math.abs((kc - 1505) + (det - 1505)) < 1e-9, "zero-sum update");
  assert.ok(s.winProbability("KC", "DET") > 0.5, "home advantage + higher rating");
});

test("LEAKAGE: the target game and everything after the cutoff contribute NOTHING; preseason and ties never fit", () => {
  const rows = [
    G("early", "2025-09-07T17:00Z", "KC", "DET", 27, 20),
    G("target", "2025-09-14T17:00Z", "KC", "DET", 10, 31),
    G("later", "2025-09-21T17:00Z", "KC", "DET", 3, 45),
    G("pre", "2025-08-09T17:00Z", "KC", "DET", 50, 0, { seasonType: 1 }),
    G("tie", "2025-09-10T17:00Z", "KC", "DET", 20, 20),
  ];
  const atTarget = strengthStateAt({ rows, cutoffIso: "2025-09-14T17:00Z" });
  assert.equal(atTarget.gamesFolded, 1, "only the early final folds — target/later/preseason/tie all excluded");
  const without = strengthStateAt({ rows: rows.filter((r) => r.providerEventId === "early"), cutoffIso: "2025-09-14T17:00Z" });
  assert.deepEqual(atTarget.ratings, without.ratings, "the state at T is bit-identical with or without future rows present");
});

test("season boundary applies the one-third regression to mean, exactly once per boundary", () => {
  const rows = [
    G("s1", "2025-12-07T17:00Z", "KC", "DET", 27, 20, { season: 2025 }),
    G("s2", "2026-09-13T17:00Z", "BUF", "MIA", 21, 14, { season: 2026 }),
  ];
  const s = strengthStateAt({ rows, cutoffIso: "2026-09-14T00:00:00Z" });
  const kcAfterRegression = 1505 + (strengthStateAt({ rows: [rows[0]], cutoffIso: "2026-01-01T00:00:00Z" }).ratingFor("KC") - 1505) * (1 - 1 / 3);
  assert.ok(Math.abs(s.ratingFor("KC") - kcAfterRegression) < 1e-9, "KC regressed one-third toward mean at the boundary");
});

test("REAL EVENT · the next scheduled game assembles to READY_EXCEPT_ODDS from committed artifacts alone", () => {
  const schedule = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "nfl", "schedule", "latest.json"), "utf8"));
  const injuries = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "..", "data", "internal", "research", "injuries", "nfl", "latest.json"), "utf8"));
  const corpus = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "..", "data", "internal", "research", "nfl", "corpus-v1.json"), "utf8"));
  const nowIso = new Date(Date.parse(schedule.generatedAt) + 60_000).toISOString(); // just after capture — pre-kickoff for upcoming rows
  const next = schedule.rows.filter((r) => Date.parse(r.dateUtc) > Date.parse(nowIso)).sort((a, b) => a.dateUtc.localeCompare(b.dateUtc))[0];
  assert.ok(next, "an upcoming scheduled game exists");
  const out = assembleNflEvent({ event: next, nowIso, strengthRows: corpus.rows, injuriesArtifact: injuries });
  assert.equal(out.decision, "REFUSED", "no probability artifact may exist without odds");
  assert.equal(out.summary, "READY_EXCEPT_ODDS", "odds is the ONLY gap — the charter's valuable state, proven");
  assert.equal(out.reasons.length, 1);
  assert.match(out.reasons[0], /odds is BLOCKED_EXTERNAL/);
  assert.ok(out.evidence.strengthState.gamesFolded > 500, "the strength fold consumed the corpus");
  assert.match(out.evidence.strengthState.note, /target game cannot contribute/);
  const post = assembleNflEvent({ event: next, nowIso: "2027-01-01T00:00:00Z", strengthRows: corpus.rows, injuriesArtifact: injuries });
  assert.ok(post.reasons.some((r) => /post-start/.test(r)), "a started event refuses assembly outright");
});
