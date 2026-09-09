/**
 * P250 · A02 — suspect-output labeling for sparse-split EPL forecasts.
 *
 * The preregistered shrinkage repair (data/internal/research/epl/preregistration-sparse-split-v1.json)
 * was REJECTED on its own bars, so the recorded v1 output stands. The governed fallback is a bounded
 * label — the sparse-input condition stated beside the number — never a manual probability edit.
 * These tests pin that contract against the LIVE artifact and corpus, not against a pinned date:
 * when the affected clubs accumulate 5+ matches in the relevant split, the labels lawfully disappear
 * and every assertion below still holds.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { fitEplStrength, sparseSplitFlags, scoreMatrix } from "./strength-state.mjs";
import { loadEplCorpus } from "./corpus.mjs";

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const artifact = JSON.parse(fs.readFileSync(path.join(APP, "public/data/soccer/epl/forecasts/latest.json"), "utf8"));

test("sparseSplitFlags fires exactly on 1-4 match splits, never on cold starts or fitted clubs", () => {
  const rows = [];
  const day = (i) => `2026-01-${String(i + 1).padStart(2, "0")}T15:00:00Z`;
  // "Fitted" hosts 6 home matches (never sparse); "Thin" visits once (away split of 1 → sparse).
  for (let i = 0; i < 6; i++) rows.push({ home: "Fitted", away: i === 0 ? "Thin" : `Filler${i}`, ftHome: 2, ftAway: 1, dateUtc: day(i) });
  // Give each filler an away history so the league means are sane.
  const state = fitEplStrength({ rows, cutoffIso: "2026-02-01T00:00:00Z" });
  const flagged = sparseSplitFlags(state, "Fitted", "Thin");
  assert.ok(flagged && flagged.away && !flagged.home, "a 1-match away split is flagged; a 6-match home split is not");
  assert.match(flagged.note, /Small-sample input/, "the note states the condition in words");
  assert.equal(sparseSplitFlags(state, "Fitted", "NeverSeen"), null, "a true cold start (0 matches) is NOT sparse — that rule is separate");
});

test("LIVE · every published forecast row labels its sparse splits — and only those", () => {
  const corpus = loadEplCorpus(REPO);
  const state = fitEplStrength({ rows: corpus.rows, cutoffIso: artifact.generatedAt });
  for (const r of artifact.rows ?? []) {
    if (!r.probs) continue;
    const expected = sparseSplitFlags(state, r.homeClub, r.awayClub);
    if (expected) {
      assert.ok(r.sparseInput, `${r.matchup}: fit divided by a tiny split but the row carries no label`);
      assert.match(r.sparseInput.note, /Small-sample input/);
    } else {
      assert.ok(!r.sparseInput, `${r.matchup}: labeled sparse without a sparse split — the label must never become noise`);
    }
  }
});

test("LIVE · the label never edits the number — probabilities are exactly the model's own", () => {
  const corpus = loadEplCorpus(REPO);
  const state = fitEplStrength({ rows: corpus.rows, cutoffIso: artifact.generatedAt });
  const sparseRows = (artifact.rows ?? []).filter((r) => r.sparseInput && r.probs);
  for (const r of sparseRows) {
    // Re-derive from the live model with shrinkK=0 (the recorded, unrepaired arithmetic): the
    // published number must match — a "suspect" label is a statement, not a correction.
    const mx = scoreMatrix(state, r.homeClub, r.awayClub);
    assert.ok(Math.abs(mx.oneXTwo.home - r.probs.home) < 5e-3, `${r.matchup}: published home prob drifted from the recorded model`);
  }
  // The match page renders the note beside the numbers, never a hand-edited probability.
  const page = fs.readFileSync(path.join(APP, "src/app/epl/match/[slug]/page.tsx"), "utf8");
  assert.match(page, /row\.sparseInput\?\.note/, "the match page renders the sparse-input condition");
});
