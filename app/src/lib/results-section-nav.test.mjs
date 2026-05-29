/**
 * Tests for the learning-signal status summarizer used by the
 * Results in-page nav.
 *
 * Locks the honesty rule: counts come straight from row statuses,
 * never invented.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeLearningSignalCounts } from "../components/results-section-nav.tsx";

test("empty input → empty string (never invents counts)", () => {
  assert.equal(summarizeLearningSignalCounts([]), "");
});

test("single confirmed-not-consumed → '1 confirmed'", () => {
  assert.equal(
    summarizeLearningSignalCounts([{ status: "confirmed-not-consumed" }]),
    "1 confirmed",
  );
});

test("mixed bucket counts in canonical order", () => {
  const rows = [
    { status: "confirmed-not-consumed" },
    { status: "tracking" },
    { status: "too-small" },
    { status: "too-small" },
    { status: "too-small" },
    { status: "shadow-test-candidate" },
    { status: "tracking" },
  ];
  // Expected order: confirmed → shadow → tracking → too-small
  assert.equal(
    summarizeLearningSignalCounts(rows),
    "1 confirmed · 1 shadow · 2 tracking · 3 too small",
  );
});

test("unknown status defaults into tracking (never silently dropped)", () => {
  const rows = [
    { status: "unknown" },
    { status: "tracking" },
  ];
  assert.equal(
    summarizeLearningSignalCounts(rows),
    "2 tracking",
  );
});

test("only too-small rows", () => {
  assert.equal(
    summarizeLearningSignalCounts([
      { status: "too-small" },
      { status: "too-small" },
    ]),
    "2 too small",
  );
});
