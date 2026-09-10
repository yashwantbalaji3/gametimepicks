#!/usr/bin/env node
/**
 * PUBLISH THE MODEL'S OWN CALIBRATION RECORD.
 *
 * Reads the experimental-settlement summary — the ledger that already grades every published
 * forecast against the official result — and turns its coverage numbers into a verdict a person can
 * read. Judgement lives in src/lib/sports/nfl/interval-calibration.mjs and is guarded there.
 *
 * WHY IT IS PUBLISHED AND NOT KEPT PRIVATE. The 80% label appears on every NFL game page. Its
 * realised frequency was measured for a whole preseason, sat at 65%, and lived in
 * data/internal/ where no surface read it. A confidence label whose track record is private is a
 * claim without a receipt, and this project publishes receipts.
 *
 * Usage: node app/scripts/nfl/build-interval-calibration.mjs [--now <iso>] [--write]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CALIBRATION_BARS, judgeCohort, worstState } from "../../src/lib/sports/nfl/interval-calibration.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.resolve(APP, "..");
const arg = (f, d) => { const i = process.argv.indexOf(f); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const NOW = arg("--now", new Date().toISOString());
const WRITE = process.argv.includes("--write");

const summaryPath = path.join(ROOT, "data/internal/nfl/experimental-settlement/summary.json");
let summary = null;
try { summary = JSON.parse(fs.readFileSync(summaryPath, "utf8")); } catch { summary = null; }

if (!summary) {
  console.error("no experimental-settlement summary — nothing to judge (this is not evidence of good calibration)");
  process.exit(0);
}

const cohorts = Object.values(summary.cohorts ?? {});
const judged = cohorts.map(judgeCohort);

const artifact = {
  _note:
    "How often this model's published intervals actually contained the result. Derived from the " +
    "experimental-settlement ledger, which grades every published forecast against the official " +
    "final score. Educational and paper-only; not a betting record.",
  schemaVersion: 1,
  artifact: "nfl-interval-calibration",
  dataClass: "PUBLIC_DERIVED",
  generatedAt: NOW,
  modelVersion: summary.modelVersion ?? null,
  ledgerGeneratedAt: summary.generatedAt ?? null,
  bars: { minSample: CALIBRATION_BARS.MIN_SAMPLE, zThreshold: CALIBRATION_BARS.Z_THRESHOLD },
  nominalCoverage: 0.8,
  /* Cohorts never merge: preseason and regular-season football are different games. */
  cohorts: judged,
  worst: worstState(judged),
  /*
   * The proposal is recorded, not applied. Adoption needs a preregistration and a held-out
   * evaluation like every other promotion here — widening an interval until its coverage number
   * looks right is fitting the label to the sample.
   */
  action:
    worstState(judged) === "OVERCONFIDENT"
      ? "OPEN — a published interval is narrower than its label. A widening factor is proposed on the cohort; adopting it requires a preregistration and a held-out evaluation."
      : worstState(judged) === "UNDERCONFIDENT"
        ? "OPEN — a published interval is wider than its label needs."
        : worstState(judged) === "CALIBRATED"
          ? "NONE — published intervals match their labels within the preregistered bar."
          : "NONE YET — not enough settled forecasts to judge.",
};

const out = path.join(APP, "public/data/nfl/interval-calibration.json");
if (WRITE) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(artifact, null, 2)}\n`);
}

for (const c of judged) {
  console.log(`\n${c.label} · n=${c.n}`);
  console.log(`  winner accuracy ${c.winnerAccuracy ?? "—"} · margin MAE ${c.marginMAE ?? "—"} · total MAE ${c.totalMAE ?? "—"}`);
  for (const k of ["margin", "total"]) {
    const v = c[k];
    console.log(`  ${k.padEnd(6)} ${String(v.state).padEnd(14)} ${v.claim}` + (v.impliedScale && v.state === "OVERCONFIDENT" ? ` · proposed widening ×${v.impliedScale}` : ""));
  }
}
console.log(`\nworst: ${artifact.worst}\n${artifact.action}`);
if (WRITE) console.log(`wrote ${path.relative(ROOT, out)}`);
