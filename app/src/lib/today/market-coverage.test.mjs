/**
 * market-coverage guards — Sprint 032 Phase 2.
 *
 * Two jobs. First, pin the denominator: a game with no intelligence must still count against the
 * slate, because the failure mode this file exists to prevent is a shrinking denominator making a
 * partial slate look like full coverage. Second, pin the honesty ceiling: coverage describes what
 * is SHOWABLE and must never imply the model was validated against the market — it was not, for
 * any MLB family.
 *
 * The real slate today is uniformly FULL_COMPARISON with zero gates, so every degraded path is
 * exercised synthetically. A guard that only ever sees the happy path is not a guard.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  buildMarketCoverage,
  coverageHeadline,
  GAME_FAMILIES,
  GATE_EXPLANATION,
  MODE_LABEL,
} from "./market-coverage.ts";

const app = process.cwd();

// ── synthetic fixtures ─────────────────────────────────────────────────────

const mi = (mode, { hasModel, hasSportsbook, blockedBy = [], validated = false } = {}) => ({
  mode,
  blockedBy,
  hasModel: hasModel ?? (mode === "FULL_COMPARISON" || mode === "MODEL_ONLY"),
  hasSportsbook: hasSportsbook ?? (mode === "FULL_COMPARISON" || mode === "SPORTSBOOK_ONLY"),
  modelValidatedAgainstMarket: validated,
});

const CURRENT_READING = (capturedAt) => ({
  state: "CURRENT",
  artifactDate: "2026-07-27",
  generatedAt: capturedAt,
  ageDays: 0,
  isCurrent: true,
});

const game = (modes, opts = {}) => ({
  marketIntelligence: {
    gameId: "g",
    snapshot: {
      capturedAt: opts.capturedAt ?? "2026-07-27T16:35:04.082Z",
      captureLabel: "Sportsbook snapshot captured Jul 27 at 12:35 PM ET",
      bookmaker: "draftkings",
      // `in` rather than `??` on purpose: an explicit `freshness: null` means "the artifact made no
      // freshness claim" and must survive, not fall back to a fabricated CURRENT reading.
      freshness: "freshness" in opts ? opts.freshness : CURRENT_READING(opts.capturedAt ?? "2026-07-27T16:35:04.082Z"),
    },
    moneyline: { intelligence: modes.moneyline },
    runLine: { intelligence: modes.runLine },
    total: { intelligence: modes.total },
  },
  marketIsHistorical: opts.historical ?? false,
});

const allModes = (m, opts) => ({ moneyline: mi(m, opts), runLine: mi(m, opts), total: mi(m, opts) });

// ── denominator integrity ──────────────────────────────────────────────────

test("a game with no intelligence still counts against every family total", () => {
  const cov = buildMarketCoverage([game(allModes("FULL_COMPARISON")), { marketIntelligence: null }], "2026-07-27");
  assert.equal(cov.totalGames, 2);
  assert.equal(cov.gamesWithIntelligence, 1);
  for (const f of cov.families) {
    assert.equal(f.total, 2, `${f.family} denominator must be the whole slate`);
    assert.equal(f.counts.FULL_COMPARISON, 1);
    assert.equal(f.counts.UNAVAILABLE, 1, `${f.family} must count the intelligence-less game`);
    const summed = Object.values(f.counts).reduce((a, b) => a + b, 0);
    assert.equal(summed, cov.totalGames, `${f.family} counts must sum to the slate total`);
  }
});

test("undefined and missing marketIntelligence are treated identically to null", () => {
  const cov = buildMarketCoverage([{}, { marketIntelligence: undefined }, { marketIntelligence: null }], "2026-07-27");
  assert.equal(cov.gamesWithIntelligence, 0);
  assert.equal(cov.isEmpty, true, "nothing showable must read as empty, not as zero-coverage-but-fine");
  for (const f of cov.families) assert.equal(f.counts.UNAVAILABLE, 3);
});

test("a family block missing from an otherwise-present intelligence counts as unavailable", () => {
  const g = game(allModes("FULL_COMPARISON"));
  delete g.marketIntelligence.total;
  const cov = buildMarketCoverage([g], "2026-07-27");
  const total = cov.families.find((f) => f.family === "total");
  assert.equal(total.counts.UNAVAILABLE, 1, "an absent family must not inherit its siblings' mode");
  assert.equal(total.counts.FULL_COMPARISON, 0);
});

// ── gates ──────────────────────────────────────────────────────────────────

test("gates are tallied, explained, and ordered most-frequent-first", () => {
  const blocked = {
    moneyline: mi("SPORTSBOOK_ONLY", { blockedBy: ["MODEL_ARTIFACT_MISSING"] }),
    runLine: mi("SPORTSBOOK_ONLY", { blockedBy: ["MODEL_ARTIFACT_MISSING", "THRESHOLD_UNSUPPORTED"] }),
    total: mi("UNAVAILABLE", { blockedBy: ["NO_SPORTSBOOK_MARKET"] }),
  };
  const cov = buildMarketCoverage([game(blocked), game(blocked)], "2026-07-27");
  assert.equal(cov.gates[0].gate, "MODEL_ARTIFACT_MISSING");
  assert.equal(cov.gates[0].count, 4, "2 games x 2 families");
  for (const g of cov.gates) {
    assert.ok(g.explanation && g.explanation.length > 0, `${g.gate} needs a reader-facing explanation`);
    assert.equal(g.explanation, GATE_EXPLANATION[g.gate]);
  }
  const counts = cov.gates.map((g) => g.count);
  assert.deepEqual(counts, [...counts].sort((a, b) => b - a), "gates must be ordered by frequency");
});

test("gate ordering is deterministic when counts tie", () => {
  const tied = {
    moneyline: mi("UNAVAILABLE", { blockedBy: ["TEAM_UNRESOLVED"] }),
    runLine: mi("UNAVAILABLE", { blockedBy: ["EVENT_UNRESOLVED"] }),
    total: mi("UNAVAILABLE", { blockedBy: ["MARKET_INCOMPLETE"] }),
  };
  const once = buildMarketCoverage([game(tied)], "2026-07-27").gates.map((g) => g.gate);
  const twice = buildMarketCoverage([game(tied)], "2026-07-27").gates.map((g) => g.gate);
  assert.deepEqual(once, twice);
  assert.deepEqual(once, [...once].sort(), "ties break alphabetically so builds are reproducible");
});

test("every PairingGate has an explanation and no explanation is an apology or a promise", () => {
  for (const [gate, text] of Object.entries(GATE_EXPLANATION)) {
    assert.ok(text.length > 10, `${gate} explanation too thin`);
    assert.doesNotMatch(text, /soon|coming|we will|working on|sorry/i, `${gate} must state a fact, not a roadmap`);
  }
});

// ── honesty ceiling ────────────────────────────────────────────────────────

test("validation against the market is reported, never assumed", () => {
  const unvalidated = buildMarketCoverage([game(allModes("FULL_COMPARISON"))], "2026-07-27");
  assert.equal(
    unvalidated.anyFamilyValidatedAgainstMarket,
    false,
    "no MLB family is validated against the market — full comparison must not imply otherwise",
  );

  const validated = buildMarketCoverage([game(allModes("FULL_COMPARISON", { validated: true }))], "2026-07-27");
  assert.equal(validated.anyFamilyValidatedAgainstMarket, true, "the flag must be read, not hardcoded");
});

test("no label or headline claims accuracy, advantage, or certainty", () => {
  const BANNED = /\bedge\b|\block\b|\bsafe\b|\bguaranteed\b|beat the market|value|profit|advantage|better than/i;
  const cov = buildMarketCoverage([game(allModes("FULL_COMPARISON"))], "2026-07-27");
  const copy = [
    coverageHeadline(cov),
    ...Object.values(MODE_LABEL),
    ...Object.values(GATE_EXPLANATION),
  ].join("\n");
  assert.doesNotMatch(copy, BANNED, "coverage copy must describe availability only");
});

test("headline states counts and degrades honestly", () => {
  assert.match(coverageHeadline(buildMarketCoverage([], null)), /No games/i);
  assert.match(
    coverageHeadline(buildMarketCoverage([{ marketIntelligence: null }], "2026-07-27")),
    /No sportsbook or model data/i,
  );
  const full = coverageHeadline(buildMarketCoverage([game(allModes("FULL_COMPARISON"))], "2026-07-27"));
  assert.match(full, /1 game on this slate/, "singular must not read '1 games'");

  const two = coverageHeadline(buildMarketCoverage([game(allModes("FULL_COMPARISON")), game(allModes("FULL_COMPARISON"))], "2026-07-27"));
  assert.match(two, /2 games on this slate/);
});

// ── snapshot provenance ────────────────────────────────────────────────────

test("snapshot reflects the NEWEST capture across the slate", () => {
  const older = game(allModes("FULL_COMPARISON"), { capturedAt: "2026-07-27T10:00:00.000Z" });
  const newer = game(allModes("FULL_COMPARISON"), { capturedAt: "2026-07-27T16:35:04.082Z" });
  // Order must not matter — otherwise provenance depends on however the slate happened to sort.
  for (const slate of [[older, newer], [newer, older]]) {
    const cov = buildMarketCoverage(slate, "2026-07-27");
    assert.equal(cov.snapshot.capturedAt, "2026-07-27T16:35:04.082Z");
  }
});

test("snapshot currency comes from the canonical reading, never inferred", () => {
  const stale = game(allModes("FULL_COMPARISON"), {
    freshness: { state: "STALE", artifactDate: "2026-07-20", generatedAt: null, ageDays: 7, isCurrent: false },
  });
  const cov = buildMarketCoverage([stale], "2026-07-27");
  assert.equal(cov.snapshot.freshness, "STALE");
  assert.equal(cov.snapshot.ageDays, 7);
  assert.equal(cov.snapshot.isCurrent, false);

  // A reading that omits isCurrent must NOT be promoted to current.
  const silent = game(allModes("FULL_COMPARISON"), { freshness: { state: "UNAVAILABLE", artifactDate: null, generatedAt: null, ageDays: null } });
  assert.equal(buildMarketCoverage([silent], "2026-07-27").snapshot.isCurrent, false);

  // No freshness block at all → no claim.
  const none = game(allModes("FULL_COMPARISON"), { freshness: null });
  const noneCov = buildMarketCoverage([none], "2026-07-27");
  assert.equal(noneCov.snapshot.freshness, null);
  assert.equal(noneCov.snapshot.isCurrent, false);
});

test("an unparseable capture timestamp never becomes provenance", () => {
  const bad = game(allModes("FULL_COMPARISON"), { capturedAt: "whenever" });
  const cov = buildMarketCoverage([bad], "2026-07-27");
  assert.equal(cov.snapshot.capturedAt, null, "a malformed timestamp must not be presented as a capture time");
  assert.equal(cov.snapshot.isCurrent, false);
});

// ── real slate ─────────────────────────────────────────────────────────────

test("FUNCTIONAL · derives real coverage from the live artifacts", async () => {
  const { buildAllGameDetails } = await import("../game-detail.ts");
  const details = buildAllGameDetails().filter((d) => d.sport === "mlb");
  if (details.length === 0) return; // empty slate is a legitimate state, not a failure

  const date = [...new Set(details.map((d) => d.date))].sort().pop();
  const slate = details.filter((d) => d.date === date);
  const cov = buildMarketCoverage(slate, date);

  assert.equal(cov.totalGames, slate.length);
  assert.ok(cov.gamesWithIntelligence <= cov.totalGames);
  assert.equal(
    cov.anyFamilyValidatedAgainstMarket,
    false,
    "no MLB family is validated against the market — if this flips, the demotion status changed",
  );
  for (const f of cov.families) {
    assert.equal(Object.values(f.counts).reduce((a, b) => a + b, 0), cov.totalGames);
    assert.ok(GAME_FAMILIES.includes(f.family));
  }
  // Whatever the snapshot says, it may only claim currency via the canonical reading.
  if (cov.snapshot.isCurrent) assert.ok(cov.snapshot.capturedAt, "a current snapshot must carry a capture time");
});

// ── money guard ────────────────────────────────────────────────────────────

test("money file untouched", () => {
  const md5 = createHash("md5")
    .update(fs.readFileSync(path.join(app, "public/data/mr-dub/portfolio.json")))
    .digest("hex");
  assert.equal(md5, "affe6b21071f2b3be96bb2774eb347c3");
});
