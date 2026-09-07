/**
 * DID THIS RUN CAPTURE PRICES — OR PROVE WHY IT DIDN'T?
 *
 * assert-run-produced answers "was the artifact written during this run". For an odds capture with
 * a kickoff window that is the WRONG question during a fixture gap: the EPL capture is REQUIRED to
 * buy nothing when no kickoff falls within its 30-hour window, and between matchweeks that is the
 * correct outcome for days at a time. On 2026-09-06 the unconditional freshness assert failed
 * epl-matchweek three times in one day on exactly that legitimate skip — next kickoff 135 hours
 * away, nothing purchasable — which is the noisy-detector failure mode: a check that goes red on a
 * non-event teaches its readers to ignore red (P233: never assert a state the producer legitimately
 * never emits).
 *
 * The exemption is NOT taken on faith. The capture writes a dated decision artifact when — and only
 * when — it read the fixture list and answered "no kickoff coming" (capture-decision.json,
 * decision: skipped-no-kickoff-in-window). A refusal (unreadable fixtures, bad receipt, auth
 * failure) writes nothing; a crash writes nothing; a capture that stopped running writes nothing.
 * All of those still land in the freshness assert below and still go red. So this passes on exactly
 * two states, both evidenced by an artifact written during this run:
 *
 *   1. prices were captured (odds latest.json fresh, with the dedup tolerance), or
 *   2. the capture executed, read the fixtures, and decided the window was empty (fresh decision).
 *
 * Usage (from a workflow, after the capture step):
 *   node app/scripts/ops/assert-odds-fresh-or-skipped.mjs --since "$RUN_STARTED" --max-age-min 90 \
 *        --odds app/public/data/soccer/epl/odds/latest.json \
 *        --decision app/public/data/soccer/epl/odds/capture-decision.json
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i > -1 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : null;
};

const SINCE = flag("--since");
const MAX_AGE_MIN = flag("--max-age-min");
const ODDS = flag("--odds");
const DECISION = flag("--decision");

if (!SINCE || !ODDS || !DECISION) {
  console.error("assert-odds-fresh-or-skipped: --since, --odds and --decision are all required — with any missing this guard could pass vacuously.");
  process.exit(2);
}
const sinceMs = Date.parse(SINCE);
if (!Number.isFinite(sinceMs)) {
  console.error(`assert-odds-fresh-or-skipped: --since "${SINCE}" is not a parseable ISO timestamp.`);
  process.exit(2);
}

// ── The evidenced exemption: a skip DECIDED during this run ─────────────────────────────────────
const decision = (() => {
  try { return JSON.parse(fs.readFileSync(DECISION, "utf8")); } catch { return null; }
})();
if (decision && decision.decision === "skipped-no-kickoff-in-window") {
  const decidedMs = Date.parse(decision.decidedAt ?? "");
  if (Number.isFinite(decidedMs) && decidedMs >= sinceMs) {
    const next = decision.nextKickoffIso ? ` — next kickoff ${decision.nextKickoffIso} (${decision.hoursAway}h away)` : " — no fixtures remain";
    console.log(`odds freshness: EXEMPT this run. The capture executed, read the fixtures and decided no kickoff falls within its ${decision.windowHours}h window${next}. Decision written ${decision.decidedAt}; nothing was bought.`);
    process.exit(0);
  }
  // A stale skip decision is from an EARLIER run and proves nothing about this one: fall through.
}

// ── Everything else answers to the freshness assert, unchanged ──────────────────────────────────
const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = [path.join(HERE, "assert-run-produced.mjs"), "--since", SINCE];
if (MAX_AGE_MIN) args.push("--max-age-min", MAX_AGE_MIN);
args.push(ODDS);
const r = spawnSync(process.execPath, args, { stdio: "inherit" });
process.exit(r.status ?? 1);
