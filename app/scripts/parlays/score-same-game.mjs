#!/usr/bin/env node
/**
 * SCORE THE SAME-GAME PREREGISTRATION (P272) — private research, prints and writes nothing public.
 *
 *   node app/scripts/parlays/score-same-game.mjs [--all]
 *
 * It reads the registration, scores ONLY cards graded on or after its `scoreCardsGradedFrom`, and
 * states the verdict its own bars imply. `--all` ignores that floor and is for describing the past
 * out loud — it prints a refusal banner and never emits a verdict, because the historical corpus
 * was already looked at and cannot answer the question.
 *
 * Exit: 0 a verdict (ACCEPTED or REJECTED) · 2 not enough cards yet · 3 the registration is missing.
 */
import fs from "node:fs";
import path from "node:path";
import { buildSameGameSplit } from "../../src/lib/parlays/lab/same-game.mjs";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..", "..");
const PREREG = path.join(REPO, "data", "internal", "research", "parlays", "preregistration-same-game-v1.json");
const DATA = path.join(REPO, "app", "public", "data", "parlays");
const all = process.argv.includes("--all");

if (!fs.existsSync(PREREG)) {
  console.error(`REFUSED: no preregistration at ${PREREG}. A score with no frozen bars is not a result.`);
  process.exit(3);
}
const prereg = JSON.parse(fs.readFileSync(PREREG, "utf8"));

const docs = [];
for (const stream of ["graded", "optimizer-graded"]) {
  const dir = path.join(DATA, stream);
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)); } catch { continue; }
  for (const f of files) {
    try { docs.push(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"))); } catch { /* a torn receipt is not a result */ }
  }
}

const split = buildSameGameSplit(docs, {
  since: all ? null : prereg.scoreCardsGradedFrom,
  minPerArm: prereg.bars.minCardsPerArmPerSize,
});

const pct = (v) => (v == null ? "     —" : `${(v * 100).toFixed(1).padStart(6)}%`);
console.log(all
  ? "DESCRIBING THE PAST — every graded card, including the ones already looked at. NO VERDICT FOLLOWS."
  : `Scoring cards graded on or after ${prereg.scoreCardsGradedFrom} (${split.beforeSince} earlier cards skipped).`);
console.log(`\n${"size".padStart(5)} ${"apart n".padStart(8)} ${"apart".padStart(7)} ${"shared n".padStart(9)} ${"shared".padStart(7)} ${"gap".padStart(7)}`);
for (const s of split.sizes) {
  console.log(
    `${String(s.legs).padStart(5)} ${String(s.apart.cards).padStart(8)} ${pct(s.apart.flatReturn)} ` +
    `${String(s.shared.cards).padStart(9)} ${pct(s.shared.flatReturn)} ${pct(s.flatReturnGap)}` +
    (s.comparable ? "" : "   (one arm too small to compare)"),
  );
}

if (all) { console.log("\nNo verdict: this run scored data the question was formed on."); process.exit(0); }

const c = split.combined;
const comparableSizes = split.sizes.filter((s) => s.comparable).length;
if (!c || split.cards < prereg.bars.minTotalCards || comparableSizes < prereg.bars.minComparableSizes) {
  console.log(`\nNOT YET: ${split.cards} cards and ${comparableSizes} comparable size(s); the bars need ` +
    `${prereg.bars.minTotalCards} cards and ${prereg.bars.minComparableSizes} sizes with ${prereg.bars.minCardsPerArmPerSize}+ per arm.`);
  process.exit(2);
}

const accepted = c.flatReturnGap <= -0.05 && c.agree;
console.log(`\nCombined over sizes ${c.sizes.join(", ")} (${c.cards} cards): flat-return gap ${pct(c.flatReturnGap)}` +
  `, hit-rate gap ${pct(c.hitRateGap)}, sizes ${c.agree ? "agree" : "DISAGREE in sign"}.`);
console.log(accepted
  ? "ACCEPTED — shared-game cards lost materially more, consistently across sizes. The disclosure may state it, with its sample."
  : "REJECTED — the bar was not met. The disclosure stays as it is: a link we looked for and did not find. Do not retry with a softer bar.");
process.exit(0);
