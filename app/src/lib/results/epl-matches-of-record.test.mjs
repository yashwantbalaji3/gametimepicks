/**
 * Stage 3E · optional Soccer slice pins. Identity fixtures are Soccer's own (lib/sports/soccer/__fixtures__/
 * canonical-match.json, committed rows); grader-log rows are synthetic. No live count is read or pinned.
 * Runs from app/: npx tsx --test src/lib/results/epl-matches-of-record.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { eplMatchesOfRecord } from "./epl-matches-of-record.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const F = JSON.parse(fs.readFileSync(path.join(HERE, "../sports/soccer/__fixtures__/canonical-match.json"), "utf8"));

test("a match published under two kickoff ids is ONE question; the last pre-start copy is of record", () => {
  const s = eplMatchesOfRecord({ copies: F.eplForecastCopies, graded: [], captures: F.eplCaptures });
  assert.equal(s.providerIds, 2);
  assert.equal(s.matches, 1);
  assert.equal(s.matchesWithSeveralIds, 1);
  assert.equal(s.pending[0].publishedAt, "2026-08-29T22:56:44Z");
  assert.equal(s.superseded, 2);
  assert.equal(s.idConflicts.length, 0);
});

const grade = (o) => ({ eventId: "soccer:epl:fulham-v-sunderland:20260830t1300", matchup: "Sunderland v Fulham", kickoffUtc: "2026-08-30T13:00:00Z",
  forecastGeneratedAt: "2026-08-30T12:40:00Z", forecast: { probs: { home: 0.4, draw: 0.3, away: 0.3 } }, scores: { hit: true }, ...o });

test("a graded match: the grader log's forecast is of record, even when the dated files no longer hold it", () => {
  const g = grade({});
  const s = eplMatchesOfRecord({ copies: F.eplForecastCopies, graded: [g], captures: F.eplCaptures });
  assert.equal(s.matches, 1);
  assert.equal(s.graded.length, 1);
  assert.equal(s.graded[0].row, g);
  assert.equal(s.pending.length, 0, "the match is not also pending under its old id");
  assert.equal(s.supersededByGrader, 3);
});

test("a grader row generated at/after kickoff is LATE; two grader rows for one match are a CONFLICT (never one picked)", () => {
  const late = eplMatchesOfRecord({ copies: [], graded: [grade({ forecastGeneratedAt: "2026-08-30T13:05:00Z" })], captures: F.eplCaptures });
  assert.equal(late.graded.length, 0);
  assert.equal(late.late.length, 1);
  const two = eplMatchesOfRecord({ copies: [], graded: [grade({}), grade({ eventId: "soccer:epl:fulham-v-sunderland:20260829t1400", forecastGeneratedAt: "2026-08-29T13:00:00Z", kickoffUtc: "2026-08-29T14:00:00Z" })], captures: F.eplCaptures });
  assert.equal(two.graded.length, 0);
  assert.equal(two.conflicts.length, 1);
});

test("a row Soccer's identity refuses is UNKEYED (Q5): excluded and counted, never a loss", () => {
  const s = eplMatchesOfRecord({ copies: [], graded: [grade({ eventId: null, matchup: "Sunderland" })], captures: [] });
  assert.equal(s.graded.length, 0);
  assert.equal(s.unkeyed.length, 1);
});
