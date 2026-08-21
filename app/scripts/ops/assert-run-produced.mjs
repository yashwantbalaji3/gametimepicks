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
 *   --since <ISO>       the run's start; an artifact older than this was not produced by this run
 *   --allow-missing     report and exit 0 rather than failing (for a genuinely optional product)
 *   --max-age-min <N>   tolerate an artifact OLDER than the run start, provided it is younger than N
 *                       minutes overall. For producers that DEDUPLICATE: the EPL odds capture refuses
 *                       a duplicate request inside a 60-minute window, so "not rewritten by this run"
 *                       is its correct behaviour, not a failure — while "not written for three days"
 *                       still is. Without this the two are indistinguishable and the job goes red on
 *                       a non-event, which is how a real alert stops being read. Use it ONLY for a
 *                       deduplicating producer, and never for an artifact the run must always write.
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
const MAX_AGE_MIN = flag("--max-age-min") ? Number(flag("--max-age-min")) : null;
if (MAX_AGE_MIN != null && !(Number.isFinite(MAX_AGE_MIN) && MAX_AGE_MIN > 0)) {
  console.error(`assert-run-produced: --max-age-min "${flag("--max-age-min")}" must be a positive number of minutes.`);
  process.exit(2);
}
const paths = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--since" && argv[i - 1] !== "--max-age-min");

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
    const ageMin = (Date.now() - w.at) / 60000;
    /*
     * A deduplicating producer legitimately leaves its artifact untouched. Tolerated ONLY when the
     * artifact is still recent in absolute terms, so "skipped because it was fresh" passes and
     * "nothing has written this in days" still fails.
     */
    if (MAX_AGE_MIN != null && ageMin <= MAX_AGE_MIN) {
      console.log(`  ok ${rel} — not rewritten by this run, but ${ageMin.toFixed(1)} min old (within the ${MAX_AGE_MIN} min dedup window)`);
      continue;
    }
    const beforeMin = ((sinceMs - w.at) / 60000).toFixed(1);
    const why = MAX_AGE_MIN != null
      ? `${ageMin.toFixed(1)} min old, past the ${MAX_AGE_MIN} min window — the producer is not running, not merely deduplicating`
      : `this run produced nothing`;
    failures.push(`${rel} — last written ${beforeMin} min BEFORE this run started (${w.source}); ${why}`);
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
