/**
 * A JOB THAT GRADES MUST REGENERATE THE REPORT THAT QUOTES ITS COUNT — Program 235 · Release F.
 *
 * Run: npx tsx --test src/lib/sports/epl/learning-report-freshness.test.mjs
 *
 * Twice in two programs the control plane refused to build: the learning artifact said 23 graded /
 * 18 paired, then 24 / 19, while the ledger recounted one more each time. That refusal is correct
 * and load-bearing — a stale count must not be quotable as current — but it kept firing because two
 * jobs write to the same ledger and only one of them regenerated the report.
 *
 * `epl-settle.yml` grades and then reports, in that order. `epl-matchweek.yml` graded on eighteen
 * crons and did not report at all, so every grade it wrote left the artifact stale until settle next
 * ran on its single cron.
 *
 * The rule this pins: any workflow that runs the grader must also regenerate the report AND commit
 * it. The last clause matters as much as the first — this repository has a documented history of
 * artifacts that were regenerated and then dropped because nobody added them to the allowlist, which
 * is a run that looks green and changes nothing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const WORKFLOWS = path.join(process.cwd(), "..", ".github", "workflows");
const GRADER = "grade-epl-forecasts.mjs";
const REPORTER = "report-epl-learning.mjs";
const LEARNING_PATH = "data/internal/research/epl/learning";

const files = (() => {
  try { return fs.readdirSync(WORKFLOWS).filter((f) => f.endsWith(".yml")); } catch { return []; }
})();
const read = (f) => fs.readFileSync(path.join(WORKFLOWS, f), "utf8");

/** Workflows that actually run the EPL grader. */
const graders = files.filter((f) => read(f).includes(GRADER));

test("at least one workflow grades — otherwise this guard proves nothing", () => {
  assert.ok(graders.length > 0, "no workflow runs the EPL grader");
});

test("EVERY GRADING WORKFLOW ALSO REGENERATES THE LEARNING REPORT", () => {
  for (const f of graders) {
    assert.ok(
      read(f).includes(REPORTER),
      `${f} grades EPL forecasts and never regenerates the learning report — every grade it writes leaves the artifact stale until another job happens to run`,
    );
  }
});

test("AND COMMITS IT — regenerated and dropped is a green run that changed nothing", () => {
  for (const f of graders) {
    const text = read(f);
    if (!text.includes("git add")) continue;   // a job that commits nothing cannot strand an artifact
    assert.ok(
      text.includes(LEARNING_PATH),
      `${f} regenerates the learning report and does not allowlist ${LEARNING_PATH} for commit`,
    );
  }
});

test("THE REPORT RUNS AFTER THE GRADER, not before it", () => {
  /*
   * Ordering is read from the file's own byte offsets rather than a YAML parse. That is sound here
   * and only here: both of these workflows are single-job, and a job's steps run in the order they
   * are written. It also costs no dependency — adding one to a repository for a step-order check
   * would be a heavier change than the thing being checked.
   */
  for (const f of graders) {
    const text = read(f);
    const g = text.indexOf(GRADER);
    const r = text.indexOf(REPORTER);
    if (g === -1 || r === -1) continue;
    assert.ok(r > g, `${f}: the learning report runs before the grader — it would quote the count from before this run`);
    const commit = text.indexOf("git commit");
    if (commit !== -1) {
      assert.ok(r < commit, `${f}: the report is regenerated after the commit, so the fresh artifact is never committed`);
    }
    /* Single-job, or the offset argument above does not hold. */
    const jobCount = (text.match(/^\s{2}[a-z0-9_-]+:\n\s{4}(runs-on|name|if):/gmi) ?? []).length;
    assert.ok(jobCount <= 1, `${f} has ${jobCount} jobs — step order can no longer be read from file order`);
  }
});

test("the refusal that caught this twice is still in place", () => {
  /* The soft `|| echo "::warning::"` on the report step is deliberate — the report legitimately
     refuses when the ledger is unreadable, and that must not lose the grades the run produced. It
     is safe precisely because a stale artifact is not silent: the control plane refuses to build. */
  const cp = fs.readFileSync(path.join(process.cwd(), "src/lib/launch/closure-packets.mjs"), "utf8");
  assert.match(cp, /STALE_CALIBRATION_COUNT/, "the stale-count contradiction has been removed — the soft failure above is no longer backstopped");
});
