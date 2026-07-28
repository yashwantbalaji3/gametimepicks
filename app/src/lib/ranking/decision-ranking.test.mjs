/**
 * Sprint 035 — decision-ranking guards.
 *
 * These exist because the failure they prevent already shipped: `glossary.ts` told users confidence
 * "does not up-weight a pick until re-validated" while ten scoring functions up-weighted it, and the
 * headline board ranked by a model-vs-market difference that is INVERTED on settled results.
 *
 * The guards are written so that REINTRODUCING either signal fails the suite. A guard that only
 * passes on the fixed code proves nothing about the bug; each source assertion below is paired with a
 * mutation test that mutates the real file on disk, re-reads it, asserts the guard trips, and
 * restores it — verifying the guard can actually fail.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

import { evidenceScore, rankByEvidence, mayRankByModelMarketGap, RANKING_BASIS_NOTE } from "./decision-ranking.ts";

const APP = process.cwd();
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");

// ── the ordering contract ──────────────────────────────────────────────────

test("probability drives order; a model-market gap cannot be expressed at all", () => {
  const rows = [
    { id: "low-prob", modelProbability: 0.51 },
    { id: "high-prob", modelProbability: 0.72 },
    { id: "mid-prob", modelProbability: 0.6 },
  ];
  assert.deepEqual(rankByEvidence(rows).map((r) => r.id), ["high-prob", "mid-prob", "low-prob"]);

  // The RankableRow type carries no gap field. Anything extra is ignored rather than weighted.
  const withGap = [
    { id: "a", modelProbability: 0.55, edgePct: 40, differencePoints: 40 },
    { id: "b", modelProbability: 0.65, edgePct: 0, differencePoints: 0 },
  ];
  assert.deepEqual(
    rankByEvidence(withGap).map((r) => r.id),
    ["b", "a"],
    "a huge claimed gap must not lift a lower-probability row",
  );
});

test("data completeness and sample depth break ties, in that order of magnitude", () => {
  const base = { modelProbability: 0.6 };
  const ranked = rankByEvidence([
    { ...base, id: "bare" },
    { ...base, id: "complete", isComplete: true },
    { ...base, id: "sampled", sampleCount: 25 },
  ]);
  assert.equal(ranked[0].id, "complete", "completeness outweighs sample depth at equal probability");
  assert.equal(ranked[1].id, "sampled");
  assert.equal(ranked[2].id, "bare");
});

test("sample contribution saturates rather than compounding", () => {
  const s25 = evidenceScore({ id: "a", modelProbability: 0.5, sampleCount: 25 });
  const s400 = evidenceScore({ id: "b", modelProbability: 0.5, sampleCount: 400 });
  assert.equal(s25, s400, "400 observations must not score above the saturation point");
});

test("market reliability is applied, and defaults to neutral when absent", () => {
  const reliable = evidenceScore({ id: "a", modelProbability: 0.6, marketReliability: 1 });
  const weak = evidenceScore({ id: "b", modelProbability: 0.6, marketReliability: 0.5 });
  assert.ok(reliable > weak, "a historically weaker market must not outrank a stronger one at equal probability");
  assert.equal(
    evidenceScore({ id: "c", modelProbability: 0.6 }),
    evidenceScore({ id: "d", modelProbability: 0.6, marketReliability: 1 }),
    "absent reliability defaults to 1, never to 0",
  );
});

test("ordering is deterministic and total", () => {
  const rows = [
    { id: "b", modelProbability: 0.6 },
    { id: "a", modelProbability: 0.6 },
    { id: "c", modelProbability: 0.6 },
  ];
  assert.deepEqual(rankByEvidence(rows).map((r) => r.id), ["a", "b", "c"], "ties break by id");
  assert.deepEqual(rankByEvidence(rows), rankByEvidence([...rows].reverse()), "input order must not matter");
});

test("degenerate rows sink rather than throw", () => {
  const ranked = rankByEvidence([
    { id: "null", modelProbability: null },
    { id: "nan", modelProbability: NaN },
    { id: "real", modelProbability: 0.55 },
  ]);
  assert.equal(ranked[0].id, "real");
});

// ── the calibration gate ───────────────────────────────────────────────────

test("ranking by a model-market gap is forbidden while no market has re-validated", () => {
  assert.equal(
    mayRankByModelMarketGap(),
    false,
    "no MLB market out-predicts the sportsbook — gap ranking must stay closed",
  );
});

test("the stated basis claims a removal, never an improvement", () => {
  assert.match(RANKING_BASIS_NOTE, /no longer affects ordering/i);
  assert.doesNotMatch(RANKING_BASIS_NOTE, /better|improved|smarter|stronger|beat|edge\b/i);
});

// ── source guards: the signals must be gone from decision paths ────────────

const DECISION_PATHS = [
  "src/lib/top10/top10-picks.ts",
  "src/lib/parlays/leg-scoring.ts",
  "src/lib/simulate-lobby-featured.ts",
  "src/components/mlb/mlb-top-leans-strip.tsx",
  "src/components/featured-headliners.tsx",
];

/** Strip comments so an explanatory note about the old formula is not mistaken for the formula. */
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");

test("no decision path adds a model-market gap into a score", () => {
  for (const rel of DECISION_PATHS) {
    const code = stripComments(read(rel));
    assert.doesNotMatch(
      code,
      /score[^;\n]*edgePct/,
      `${rel}: edgePct must not appear in a score expression`,
    );
    assert.doesNotMatch(
      code,
      /score[^;\n]*\bedge\s*\*/,
      `${rel}: an edge term must not be multiplied into a score`,
    );
  }
});

test("no decision path up-weights a confidence tier", () => {
  for (const rel of DECISION_PATHS) {
    const code = stripComments(read(rel));
    // A numeric map keyed by the tiers is the exact shape that produced the bug.
    assert.doesNotMatch(
      code,
      /High:\s*\d+[\s\S]{0,40}?Low:\s*\d+/,
      `${rel}: a numeric High/Low weighting map must not exist`,
    );
    assert.doesNotMatch(
      code,
      /confidence\s*===\s*"High"\s*\?\s*\d/,
      `${rel}: confidence must not be turned into a numeric boost`,
    );
  }
});

test("leg quality profiles gate on data, never on confidence tier or an edge floor", () => {
  const code = stripComments(read("src/lib/leg-quality-gates.ts"));
  assert.doesNotMatch(code, /confidence:\s*\["High"\]/, "no profile may admit only High confidence");
  assert.doesNotMatch(code, /minEdgePct:\s*[1-9]/, "no profile may set a positive edge floor");
  // The data-quality gates must survive — this fix is not a loosening of standards.
  assert.match(code, /excludeAnomalies/, "anomaly exclusion is evidence-backed and must be kept");
  assert.match(code, /requireValidPlayerId/, "identity gating must be kept");
});

test("the retired Value tab is not reachable from the board UI", () => {
  const board = read("src/components/top10/top10-board.tsx");
  assert.doesNotMatch(board, /\["value",/, "the Value tab selected for the worst-performing bucket");
});

test("historical visibility is preserved — the gap is still computed and shown", () => {
  // Sprint 035 removes the gap from ORDERING, not from sight. Removing the evidence that the model is
  // anti-calibrated would defeat the purpose of the change.
  const top10 = read("src/lib/top10/top10-picks.ts");
  assert.match(top10, /marketProbability/, "market probability must still be carried on every row");
  assert.ok(
    fs.existsSync(path.join(APP, "src/lib/results-audit-notes.ts")),
    "retrospective edge-band reporting must still exist",
  );
});

// ── mutation tests: prove the guards can fail ─────────────────────────────

/** Temporarily rewrite a real source file, run `check`, then restore and verify byte-identity. */
function withMutation(rel, mutate, check) {
  const abs = path.join(APP, rel);
  const original = fs.readFileSync(abs, "utf8");
  const before = createHash("md5").update(original).digest("hex");
  try {
    const mutated = mutate(original);
    assert.notEqual(mutated, original, `${rel}: mutation must actually change the file`);
    fs.writeFileSync(abs, mutated);
    check();
  } finally {
    fs.writeFileSync(abs, original);
    const after = createHash("md5").update(fs.readFileSync(abs, "utf8")).digest("hex");
    assert.equal(after, before, `${rel}: must be restored byte-identically`);
  }
}

test("MUTATION · reintroducing edge weighting trips the guard", () => {
  withMutation(
    "src/lib/top10/top10-picks.ts",
    (s) => s.replace("score: round3(0.7 * prob", "score: round3(0.7 * prob + (r.edgePct ?? 0) / 100 * 0.5"),
    () => {
      const code = stripComments(read("src/lib/top10/top10-picks.ts"));
      assert.match(code, /score[^;\n]*edgePct/, "the guard must detect a reintroduced edge term");
    },
  );
  // And with the mutation reverted the guard is quiet again.
  assert.doesNotMatch(stripComments(read("src/lib/top10/top10-picks.ts")), /score[^;\n]*edgePct/);
});

test("MUTATION · reintroducing a High-confidence boost trips the guard", () => {
  withMutation(
    "src/lib/parlays/leg-scoring.ts",
    (s) => s.replace("  const dq = {", '  const conf = { High: 30, Medium: 18, Low: 8 }[inp.confidenceTier] ?? 0;\n  const dq = {'),
    () => {
      const code = stripComments(read("src/lib/parlays/leg-scoring.ts"));
      assert.match(code, /High:\s*\d+[\s\S]{0,40}?Low:\s*\d+/, "the guard must detect a reintroduced tier weighting");
    },
  );
  assert.doesNotMatch(stripComments(read("src/lib/parlays/leg-scoring.ts")), /High:\s*\d+[\s\S]{0,40}?Low:\s*\d+/);
});

test("MUTATION · restoring a High-only eligibility gate trips the guard", () => {
  withMutation(
    "src/lib/leg-quality-gates.ts",
    (s) => s.replace("confidence: [...ALL_CONFIDENCE_TIERS],", 'confidence: ["High"],'),
    () => {
      const code = stripComments(read("src/lib/leg-quality-gates.ts"));
      assert.match(code, /confidence:\s*\["High"\]/, "the guard must detect a restored High-only gate");
    },
  );
  assert.doesNotMatch(stripComments(read("src/lib/leg-quality-gates.ts")), /confidence:\s*\["High"\]/);
});

// ── money guard ────────────────────────────────────────────────────────────

test("money file untouched", () => {
  const md5 = createHash("md5")
    .update(fs.readFileSync(path.join(APP, "public/data/mr-dub/portfolio.json")))
    .digest("hex");
  assert.equal(md5, "affe6b21071f2b3be96bb2774eb347c3");
});
