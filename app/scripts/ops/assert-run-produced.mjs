/**
 * DID THIS RUN ACTUALLY PRODUCE ANYTHING?
 *
 * Three failures in one day were green-but-broken, and every one of them would have been caught
 * here:
 *
 *   · nightly-settle's risk-ladder step became `node … || true fi`, which exits 0 while running
 *     nothing. The job reported success and Aug 17 never settled.
 *   · ufc-fight-week ran for weeks without ever completing; the first two failures were loud, but
 *     the third made a successful paid call and wrote no artifact at all.
 *   · daily-products rebuilt the parlay ladder against a pool that did not exist, wrote four
 *     skipped bands, and left the Parlay Lab blank for a day.
 *
 * A workflow step's exit code answers "did the command return zero", which is a different question
 * from "did the pipeline do its work". This answers the second one, the only way it can be answered
 * from outside: the artifact the step exists to produce must be on disk and must have been written
 * DURING this run.
 *
 * Usage (from a workflow, after the producing step):
 *   node app/scripts/ops/assert-run-produced.mjs --since "$RUN_STARTED" \
 *        app/public/data/parlays/risk-ladder/latest.json [more paths...]
 *
 * Options:
 *   --since <ISO>     the run's start; an artifact older than this was not produced by this run
 *   --allow-missing   report and exit 0 rather than failing (for a genuinely optional product)
 *
 * Freshness is read from the artifact's OWN `generatedAt` where it has one, and falls back to mtime.
 * The stamp is preferred deliberately: a file can be rewritten byte-identically by a job that did
 * nothing useful, and several jobs here are content-idempotent on purpose, so mtime alone would
 * pass a run that regenerated yesterday's answer.
 */
import fs from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i > -1 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : null;
};
const ALLOW_MISSING = argv.includes("--allow-missing");
const SINCE = flag("--since");
const paths = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--since");

if (!paths.length) {
  console.error("assert-run-produced: no artifact paths given — this guard would pass vacuously.");
  process.exit(2);
}

const sinceMs = SINCE ? Date.parse(SINCE) : NaN;
if (SINCE && !Number.isFinite(sinceMs)) {
  console.error(`assert-run-produced: --since "${SINCE}" is not a parsable instant.`);
  process.exit(2);
}

/** The artifact's own stamp where it has one; mtime otherwise. */
function writtenAt(file) {
  try {
    const doc = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const k of ["generatedAt", "capturedAt", "settledAt", "builtAt"]) {
      const v = doc?.[k];
      if (typeof v === "string" && Number.isFinite(Date.parse(v))) return { at: Date.parse(v), source: k };
    }
  } catch { /* not JSON, or unparsable — fall through to mtime */ }
  try { return { at: fs.statSync(file).mtimeMs, source: "mtime" }; } catch { return null; }
}

const failures = [];
for (const rel of paths) {
  const file = path.resolve(rel);
  if (!fs.existsSync(file)) {
    const msg = `${rel} — the step reported success but produced no artifact`;
    if (ALLOW_MISSING) { console.log(`  (allowed) ${msg}`); continue; }
    failures.push(msg);
    continue;
  }
  const w = writtenAt(file);
  if (!w) { failures.push(`${rel} — exists but its age cannot be read`); continue; }

  if (Number.isFinite(sinceMs) && w.at < sinceMs) {
    const ageMin = ((sinceMs - w.at) / 60000).toFixed(1);
    failures.push(`${rel} — last written ${ageMin} min BEFORE this run started (${w.source}); this run produced nothing`);
    continue;
  }
  console.log(`  ok ${rel} — written ${new Date(w.at).toISOString()} (${w.source})`);
}

if (failures.length) {
  console.error("\nassert-run-produced: this run did not produce what it claims to.");
  for (const f of failures) console.error(`  ✗ ${f}`);
  console.error("\nA zero exit code means the command returned; it does not mean the pipeline ran.");
  process.exit(1);
}
console.log(`assert-run-produced: ${paths.length} artifact(s) produced by this run.`);
