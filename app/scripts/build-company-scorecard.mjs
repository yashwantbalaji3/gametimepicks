/**
 * Compute the department + company completion scorecard from the checklist (Program 128-133).
 * Pure read of `company-checklist.mjs` through the tested calculator — no number is typed by hand.
 *
 *   node app/scripts/build-company-scorecard.mjs [--md]
 */
import { completion, confidence, companyRollup } from "../src/lib/scorecard/scorecard.mjs";
import { DEPARTMENTS } from "../src/lib/scorecard/company-checklist.mjs";

const MD = process.argv.includes("--md");

const rows = DEPARTMENTS.map((d) => {
  const c = completion(d.items);
  const conf = confidence(d.items);
  return {
    name: d.name,
    companyWeight: d.companyWeight,
    pct: c.pct,
    applicable: c.applicable,
    confidence: conf.level,
    freshShare: conf.freshShare,
    // The weakest links, for the backlog.
    gaps: d.items
      .filter((i) => ["NOT_STARTED", "BLOCKED_EXTERNAL", "DESIGNED_ONLY", "IN_PROGRESS"].includes(i.status))
      .map((i) => ({ item: i.item, weight: i.weight, status: i.status, evidence: i.evidence })),
  };
});

const roll = companyRollup(rows);

if (MD) {
  console.log("| Department | Weight | Completion | Confidence | Applicable items |");
  console.log("|---|---:|---:|---|---:|");
  for (const r of rows) {
    console.log(`| ${r.name} | ${r.companyWeight} | **${r.pct}%** | ${r.confidence} (${r.freshShare}% fresh) | ${r.applicable} |`);
  }
  console.log(`\n**Overall Company Completion: ${roll.pct}%** (weighted across ${roll.departmentsScored} departments; weights sum to 100)\n`);
  console.log("### Highest-weight open items (the backlog, ordered by weight then department weight)\n");
  const backlog = rows
    .flatMap((r) => r.gaps.map((g) => ({ ...g, dept: r.name, deptWeight: r.companyWeight })))
    .sort((a, b) => b.weight - a.weight || b.deptWeight - a.deptWeight);
  console.log("| Dept | Item | W | Status | Evidence |");
  console.log("|---|---|---:|---|---|");
  for (const b of backlog) console.log(`| ${b.dept} | ${b.item} | ${b.weight} | ${b.status} | ${b.evidence} |`);
} else {
  for (const r of rows) {
    console.log(`${String(r.pct).padStart(3)}%  w${String(r.companyWeight).padStart(2)}  ${r.confidence.padEnd(6)} ${r.name}`);
  }
  console.log(`\nOVERALL: ${roll.pct}%  (${roll.departmentsScored} departments, weights sum 100)`);
}

// ── Sports (§13) ───────────────────────────────────────────────────────────────
import { SPORTS } from "../src/lib/scorecard/sport-checklist.mjs";
import { assertLaunchState } from "../src/lib/scorecard/scorecard.mjs";
console.log(MD ? "\n### Sport completion\n\n| Sport | Launch state | Completion | Applicable | Note |\n|---|---|---:|---:|---|" : "\n-- sports --");
for (const s of SPORTS) {
  assertLaunchState(s.launchState);
  const c = completion(s.categories);
  console.log(MD
    ? `| ${s.name} | ${s.launchState} | **${c.pct === null ? "n/a" : c.pct + "%"}** | ${c.applicable} | ${s.note} |`
    : `${String(c.pct ?? "n/a").padStart(4)}%  ${s.launchState.padEnd(22)} ${s.name}`);
}
