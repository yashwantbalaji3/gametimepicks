/**
 * THE CANDIDATE READOUT — Program 234 · Release H.
 *
 * Joins the committed registrations to the audit's own numbers and prints the verdict the frozen
 * terms produce. It computes no metric of its own: `model-learning-audit.mjs` owns the scoring, this
 * owns only the question "does that clear a bar somebody fixed in advance?".
 *
 * It cannot promote anything. There is no code path here from a good score to a live model — the
 * verdict is printed, optionally written to an artifact, and acted on by a person or not at all.
 *
 *   npx tsx scripts/model-learning-audit.mjs --json /tmp/audit.json
 *   npx tsx scripts/model-eval/evaluate-candidate.mjs --audit /tmp/audit.json [--write]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { decide, validateRegistration } from "../../src/lib/model-eval/preregistration.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const arg = (n, d = null) => { const i = process.argv.indexOf(`--${n}`); return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : d; };

const REG_PATH = path.join(APP, "..", "data", "internal", "model-eval", "registrations.json");
const OUT_PATH = path.join(APP, "..", "data", "internal", "model-eval", "latest-readout.json");

const auditPath = arg("audit");
if (!auditPath) { console.error("REFUSED: --audit <path to model-learning-audit --json output> is required"); process.exit(2); }

const audit = JSON.parse(fs.readFileSync(auditPath, "utf8"));
const regs = JSON.parse(fs.readFileSync(REG_PATH, "utf8")).registrations ?? [];

const bt = audit.calibrationBacktest ?? null;
if (!bt) { console.error("REFUSED: the audit carries no calibrationBacktest block"); process.exit(2); }

/**
 * The observation, read from the audit. `eligibleRows` is passed explicitly rather than assumed:
 * using the scored count as its own denominator would report 100% coverage by construction, and a
 * future source whose eligible population is larger will then show a coverage below 1 instead of
 * silently claiming everything was scored.
 */
const observationFor = (reg) => {
  const scores = bt.scores ?? {};
  const candKey = reg.candidateVersion.startsWith("isotonic") ? "isotonic"
    : reg.candidateVersion.startsWith("platt") ? "platt" : reg.candidateVersion;
  const incKey = reg.incumbentVersion === "raw-model" ? "rawModel" : reg.incumbentVersion;
  return {
    evaluationFrom: bt.testDates?.[0] ?? null,
    evaluationTo: bt.testDates?.[1] ?? null,
    decisiveRows: bt.testRows ?? 0,
    eligibleRows: bt.testRows ?? 0,
    candidate: scores[candKey] ?? {},
    incumbent: scores[incKey] ?? {},
  };
};

const rows = [];
for (const reg of regs) {
  const v = validateRegistration(reg);
  const obs = observationFor(reg);
  const d = decide(reg, obs);
  rows.push({
    id: reg.id, sport: reg.sport, state: reg.state,
    candidate: reg.candidateVersion, incumbent: reg.incumbentVersion,
    metric: reg.metric,
    cohort: [obs.evaluationFrom, obs.evaluationTo],
    n: obs.decisiveRows, coverage: d.coverage,
    delta: d.delta, verdict: d.verdict, reasons: d.reasons,
    registrationValid: v.ok,
    nextEvaluationCondition: reg.nextEvaluationCondition ?? null,
  });
}

for (const r of rows) {
  console.log(`\n[${r.sport}] ${r.id}  ·  ${r.state}`);
  console.log(`  ${r.candidate} vs ${r.incumbent} on ${r.metric}`);
  console.log(`  cohort ${r.cohort[0]} → ${r.cohort[1]} · n=${r.n}${r.coverage != null ? ` · coverage ${(r.coverage * 100).toFixed(1)}%` : ""}${r.delta != null ? ` · delta ${r.delta.toFixed(6)}` : ""}`);
  console.log(`  VERDICT: ${r.verdict}`);
  for (const reason of r.reasons) console.log(`    · ${reason}`);
  if (r.nextEvaluationCondition) console.log(`  next: ${r.nextEvaluationCondition}`);
}
console.log(`\nNothing here promotes a model. The incumbent continues until a person acts on this readout.`);
console.log(`Reproduce: npx tsx scripts/model-learning-audit.mjs --json /tmp/audit.json && npx tsx scripts/model-eval/evaluate-candidate.mjs --audit /tmp/audit.json`);

if (process.argv.includes("--write")) {
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify({
    schemaVersion: 1, artifact: "model-eval-readout", dataClass: "INTERNAL_RESEARCH",
    auditDateRange: audit.dateRange ?? null, rows,
    note: "Verdicts under frozen terms. PROMOTION_EARNED is a recommendation; promotion is a separate governed act.",
  }, null, 2) + "\n");
  console.log(`\nwrote ${path.relative(path.join(APP, ".."), OUT_PATH)}`);
}
