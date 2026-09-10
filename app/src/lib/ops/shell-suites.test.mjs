/**
 * THE SHELL SUITES ACTUALLY RUN NOW.
 *
 * P253 found three of them — the cron-fallback decision, and pipefail coverage for the projections
 * and settlement orchestrators — sitting in scripts/ as first-class proofs of load-bearing logic,
 * wired into nothing. Not the gate, not quality-gate, not any workflow. All three pass today, which
 * is the only reason this was a latent gap rather than an active one: nothing had drifted yet, and
 * nothing would have told us when it did.
 *
 * That is the same shape as the defect this program exists to fix, one level down. cron-watchdog
 * built a correct report for three weeks and could not publish it; these build correct verdicts and
 * nobody asks for them. A proof nobody runs is a comment.
 *
 * Wrapping them here rather than adding a CI step is deliberate. `npm run suite` discovers
 * `*.test.mjs` by glob, so a proof that lives behind this file runs in the gate, in CI, and on a
 * developer's machine, with no third place to remember to register it. The scripts stay the source
 * of truth for their own logic; this file only guarantees somebody calls them.
 *
 * Every script below is read-only: it runs a decision with injected env, or greps an orchestrator's
 * source. None spends a credit, writes an artifact, or touches the network — which is why they are
 * safe to put on the unit phase.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

/** Each entry names what the script proves, so a failure here reads as the property that broke. */
const SUITES = [
  {
    script: "scripts/cron_watchdog_test.sh",
    proves: "the cron fallback cannot double-dispatch or duplicate paid ingestion, and fires only on a genuine miss",
  },
  {
    script: "scripts/automation_projections_pipefail_test.sh",
    proves: "pipefail covers every piped step in the projections orchestrator (the 2026-07-29 defect)",
  },
  {
    script: "scripts/automation_settle_pipefail_test.sh",
    proves: "pipefail is set before the first piped step in the settlement orchestrator",
  },
  {
    script: "scripts/ops_alert_test.sh",
    proves: "the ops alert carries its contract and redacts paths, keys and hashes before leaving the repo",
  },
];

/**
 * Claimed but NOT run here, with the reason stated.
 *
 * The anti-drift check below compares against run ∪ excluded, so a suite can be left out of the
 * unit phase only by being named and justified. Silently narrowing the list would rebuild the exact
 * hole this file closes — the difference between "we decided not to run this, here is why" and
 * "nobody noticed it existed" is the whole point.
 */
const EXCLUDED = [
  {
    script: "scripts/smoke_test.sh",
    because:
      "it executes the Python pipeline (python3 -m pipeline.generate_daily_board) into a temp dir. " +
      "That needs pipeline/requirements.txt installed, which the JS unit phase does not guarantee, " +
      "so wiring it here would fail the gate on any machine without the Python environment. It is " +
      "an environment check rather than a logic proof, and belongs on a job that installs those deps.",
  },
];

for (const { script, proves } of SUITES) {
  test(`shell suite · ${path.basename(script)} — ${proves}`, () => {
    const abs = path.join(REPO, script);
    assert.ok(fs.existsSync(abs), `${script} is missing — a suite this file names must exist`);

    let out = "";
    try {
      out = execFileSync("bash", [abs], { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    } catch (err) {
      // The scripts print their own failure lines; surface them instead of a bare exit code.
      const detail = `${err.stdout ?? ""}${err.stderr ?? ""}`.trim();
      assert.fail(`${script} failed:\n${detail || err.message}`);
    }
    // These scripts print "ok — ..." on success. Exit 0 alone is not proof: a suite whose asserts
    // all no-opped would also exit 0, and this repo has shipped vacuous guards before.
    assert.match(out, /\bok\b/, `${script} exited 0 without printing a verdict — did its checks run?`);
  });
}

test("every *_test.sh in scripts/ is claimed by this file", () => {
  /*
   * The anti-drift half. Wiring three suites in is worth little if the fourth one written next
   * month lands in the same silence — which is exactly how these three got here. A new shell suite
   * must either be listed above or make this fail.
   */
  const found = fs
    .readdirSync(path.join(REPO, "scripts"))
    .filter((f) => f.endsWith("_test.sh"))
    .sort();
  const claimed = [...SUITES, ...EXCLUDED].map((s) => path.basename(s.script)).sort();
  assert.deepEqual(
    found,
    claimed,
    "a shell suite exists that nothing claims — add it to SUITES (with what it proves), or to EXCLUDED (with why not)",
  );
  for (const e of EXCLUDED) {
    assert.ok(e.because.length > 40, `${e.script}: an exclusion needs a real reason, not a shrug`);
    assert.ok(fs.existsSync(path.join(REPO, e.script)), `${e.script}: excluded but missing`);
  }
});
