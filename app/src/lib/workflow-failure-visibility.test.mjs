/**
 * Sprint 035 — workflow failure visibility guards.
 *
 * Two workflows carried JOB-level `continue-on-error: true`. With it set, the run reported success no
 * matter what happened inside — including the case where a slate was generated, committed locally, and
 * then silently discarded because the push failed. Capture-window health has already recorded a day
 * scoring 0 (15 games, zero captures) that nobody was told about.
 *
 * STEP-level `continue-on-error` is legitimate and stays: individual optional steps should not sink a
 * run. What must never return is the job-level flag, which makes the green badge meaningless.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const REPO = path.resolve(process.cwd(), "..");
const WF = path.join(REPO, ".github", "workflows");
const read = (f) => fs.readFileSync(path.join(WF, f), "utf8");

/** Workflows that do the daily production work and must be able to fail. */
const MUST_FAIL_LOUDLY = [
  "mlb-daily-production.yml",
  "mlb-pregame-capture.yml",
  "nightly-settle.yml",
  "morning-projections.yml",
];

/**
 * A job-level flag sits at 4-space indentation (directly under the job key); step-level flags sit at
 * 8+ spaces inside a `- name:` block. Matching on indentation distinguishes them without a YAML parser.
 */
const JOB_LEVEL_CONTINUE = /^ {4}continue-on-error:\s*true/m;

test("no daily-production workflow carries a JOB-level continue-on-error", () => {
  for (const f of MUST_FAIL_LOUDLY) {
    const yml = read(f);
    assert.doesNotMatch(
      yml,
      JOB_LEVEL_CONTINUE,
      `${f}: a job-level continue-on-error makes every run report success regardless of outcome`,
    );
  }
});

test("step-level continue-on-error is still permitted", () => {
  // Asserted so a future cleanup does not over-correct and make every optional step fatal.
  const yml = read("mlb-pregame-capture.yml");
  assert.match(
    yml,
    /^ {8,}continue-on-error:\s*true/m,
    "optional steps should still be allowed to fail without sinking the run",
  );
});

test("every one of these workflows notifies on failure", () => {
  for (const f of MUST_FAIL_LOUDLY) {
    const yml = read(f);
    assert.match(yml, /if:\s*failure\(\)/, `${f}: needs a failure-triggered step`);
    assert.match(yml, /OPS_WEBHOOK_URL/, `${f}: must pass the webhook secret`);
    assert.match(yml, /::error::/, `${f}: must surface the failure in the run log`);
  }
});

test("the failure notifier degrades honestly when the secret is unset", () => {
  for (const f of MUST_FAIL_LOUDLY) {
    const yml = read(f);
    // Alerting is additive; a missing secret must not become a new source of red.
    assert.match(
      yml,
      /OPS_WEBHOOK_URL unset[\s\S]{0,200}?exit 0/,
      `${f}: an unset webhook must log an honest skip and exit 0`,
    );
  }
});

test("a generated slate can no longer be committed locally and silently discarded", () => {
  const yml = read("mlb-daily-production.yml");
  assert.match(yml, /never pushed after 5 attempts/, "an unpushed slate must be reported");
  assert.match(yml, /never pushed[\s\S]{0,120}?exit 1/, "and must fail the run");
  // The old shape: push failure swallowed by an echo.
  assert.doesNotMatch(
    yml,
    /git push[^\n]*\|\|\s*echo "push skipped/,
    "push failure must not be swallowed by an echo",
  );
});

test("the workflows still parse as YAML after editing", () => {
  // Cheap structural check without a YAML dependency: no tabs, and every `- name:` step is indented
  // consistently under a steps list.
  for (const f of MUST_FAIL_LOUDLY) {
    const yml = read(f);
    assert.ok(!yml.includes("\t"), `${f}: tabs are invalid in YAML`);
    assert.match(yml, /^jobs:/m, `${f}: must still declare jobs`);
    assert.ok(yml.endsWith("\n"), `${f}: should end with a newline`);
  }
});
