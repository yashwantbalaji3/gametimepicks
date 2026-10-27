/**
 * Track B from the command line — build one NFL recap DRAFT and print its decision digests. Never approves or
 * publishes; approvals go through a surface (the console) so they land in the ledger with the founder's identity.
 *
 *   node command-center/recap/run-recap.mjs                     latest settled slate, latest kickoff
 *   node command-center/recap/run-recap.mjs --event 401873022   one event
 *   node command-center/recap/run-recap.mjs --date 2026-10-25   one Eastern date (gate report for every game)
 *   --out <dir>                                                 default command-center/out/recap
 */
import path from "node:path";
import { CC_ROOT } from "../lib/util.mjs";
import { inspectSlate, candidateFor, buildRecapDraft } from "./pipeline.mjs";

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const outDir = path.resolve(opt("out") ?? path.join(CC_ROOT, "out/recap"));

let candidate;
if (opt("event")) {
  candidate = candidateFor(opt("event")).candidate;
} else {
  const slate = inspectSlate({ date: opt("date") });
  console.log(`Slate ${slate.slateDate} · ${slate.ledger.path} sha256 ${slate.ledger.sha256.slice(0, 12)}`);
  for (const g of slate.games) {
    console.log(`  ${g.verdict.pass ? "PASS   " : "REFUSED"} ${g.eventId} ${g.matchup}${g.verdict.pass ? "" : ` — ${g.verdict.refusals.map((r) => r.code).join(", ")}`}`);
  }
  const eligible = slate.games.filter((g) => g.verdict.pass).sort((a, b) => b.eventStart.localeCompare(a.eventStart));
  if (!eligible.length) {
    console.log("Nothing eligible to draft.");
    process.exit(0);
  }
  candidate = eligible[0].candidate;
}

const draft = await buildRecapDraft(candidate, { outDir });
if (!draft.ok) {
  console.log(`REFUSED ${candidate.eventId}:`);
  for (const r of draft.verdict.refusals) console.log(`  ${r.code}: ${r.detail}`);
  process.exit(1);
}
console.log(`\nDraft: ${draft.headline}`);
console.log(`Graphic: ${path.join(outDir, draft.media.file)} (${draft.media.width}×${draft.media.height}, sha256 ${draft.media.sha256.slice(0, 12)}…)`);
for (const w of draft.verdict.warnings) console.log(`Warning ${w.code}: ${w.detail}`);
for (const v of draft.captionSet.variants) {
  const check = draft.captionChecks.find((c) => c.id === v.id);
  const pb = draft.publishBundles.find((p) => p.bundle.captionId === v.id);
  console.log(`\nCaption ${v.id} (${v.tone}, ${v.text.length} chars, validator ${check.ok ? "✓" : `✗ ${check.problems.map((p) => p.code).join(", ")}`})`);
  console.log(`  ${v.text}`);
  console.log(`  publish-bundle digest ${pb.digest}`);
}
console.log("\nNot approved, not published. Approve in the CEO console (Phase 1: mock publisher only).");
