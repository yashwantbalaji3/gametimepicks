import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { plainCodes, PLAIN_CODES } from "./plain-codes.mjs";

const app = process.cwd();
const src = (p) => fs.readFileSync(path.join(app, p), "utf8");

test("the frozen registration sentence reads in the readout chip's words, and nothing else in it changes", () => {
  const frozen = "Run once 2000 decisive rows have settled on or after 2026-09-06. At roughly 400 decisive rows a day that is about five settled slates; running it earlier returns INSUFFICIENT_SAMPLE by design rather than an early answer.";
  const out = plainCodes(frozen);
  assert.match(out, /running it earlier returns “insufficient sample” by design rather than an early answer\.$/);
  assert.equal(out.replace("“insufficient sample”", "INSUFFICIENT_SAMPLE"), frozen, "only the code is replaced");
});

test("capability and lifecycle codes keep their meaning in reader words", () => {
  assert.equal(
    plainCodes("not cleared to publish model cards — the capability registry lists UFC as SCAFFOLD_ONLY, which may not show forward-looking model output"),
    "not cleared to publish model cards — the capability registry lists UFC as early-stage (scaffold only), which may not show forward-looking model output");
  assert.equal(plainCodes("RESEARCH_ONLY"), "research only, not published as a forecast");
  assert.equal(plainCodes("SECOND_LOOK_REJECTED — failed bar: threshold calibration (ECE 0.055 vs 0.05)"),
    "not cleared on a second review — failed bar: threshold calibration (ECE 0.055 vs 0.05)");
  assert.equal(plainCodes("development look PROCEED_TO_FORWARD_SHADOW (2022–2025)"), "development look cleared for a private forward test (2022–2025)");
  assert.equal(plainCodes("SHADOW / PRIVATE_RESEARCH — never public forecast history."), "SHADOW / private research — never public forecast history.");
});

test("the map is closed: unknown codes, plain words, empty and non-strings pass through untouched", () => {
  assert.equal(plainCodes("SOME_NEW_CODE stays visible so the export guard can name it"), "SOME_NEW_CODE stays visible so the export guard can name it");
  assert.equal(plainCodes("REJECTED and LIVE are words"), "REJECTED and LIVE are words");
  assert.equal(plainCodes(""), "");
  assert.equal(plainCodes(undefined), undefined);
  for (const [code, words] of Object.entries(PLAIN_CODES)) assert.doesNotMatch(words, /[A-Z]{3,}_[A-Z]/, `${code} → ${words}`);
});

test("every public render point of a data-carried sentence goes through plainCodes (the records are never edited)", () => {
  assert.match(src("src/components/results/candidate-readout.tsx"), /\{plainCodes\(reason\)\}[\s\S]*\{plainCodes\(r\.nextEvaluationCondition\)\}/);
  assert.match(src("src/components/home/suggested-parlays-preview.tsx"), /export const readableReason = \(reason: string\): string =>\s*plainCodes\(reason\)/);
  assert.match(src("src/app/nfl/game/[eventId]/page.tsx"), /\{plainCodes\(x\.reason\) \?\? "did not clear its evaluation bar"\}/);
  assert.match(src("src/components/nfl/forecast/methodology.tsx"), /\{plainCodes\(status\[k\]\.scope\)\}/);
  const nfl = src("src/app/nfl/page.tsx");
  assert.match(nfl, /\{plainCodes\(c\.detail\)\}/);
  assert.match(nfl, /\{plainCodes\(modelStatus\.totals\.detail\)\}/);
  assert.match(src("src/app/results/forecasts/page.tsx"), /\{plainCodes\(g\.reason\)\}/);
  assert.match(src("src/components/nfl/player-board.tsx"), /<\/strong> \{plainCodes\(f\.reason\)\}/);
  assert.match(nfl, /\{plainCodes\(productReceipts\.overDetermined\.gates\.join\("; "\)\)\}/);
  assert.match(src("src/app/results/parlay-lab/page.tsx"), /\{plainCodes\(s\.blocked\) \?\? "This lane is closed today\."\}/);
  // The sources of record keep their codes: this change is presentation only.
  assert.match(fs.readFileSync(path.join(app, "..", "data/internal/model-eval/registrations.json"), "utf8"), /INSUFFICIENT_SAMPLE/);
  assert.match(src("src/lib/forecast-ledger/compose.mjs"), /PRIVATE_RESEARCH/);
});
