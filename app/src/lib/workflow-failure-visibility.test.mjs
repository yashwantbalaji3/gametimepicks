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
    // The `::error::` annotation and the payload now come from scripts/ops_alert.sh. Each workflow
    // used to carry its own copy of that shell, which is how four notifiers drifted into four
    // slightly different messages, none of them naming the slate. Asserting the shared caller keeps
    // them from drifting apart again; the message contract itself is pinned by ops_alert_test.sh.
    assert.match(yml, /bash scripts\/ops_alert\.sh/, `${f}: must route its alert through the shared alerter`);
  }
});

test("the failure notifier degrades honestly when the secret is unset", () => {
  // Alerting is additive; a missing secret must not become a new source of red. That behaviour lives
  // in the shared script now, so it is asserted once, where it is implemented, rather than by
  // pattern-matching the same shell in four YAML files.
  const alerter = fs.readFileSync(path.join(REPO, "scripts/ops_alert.sh"), "utf8");
  assert.match(
    alerter,
    /OPS_WEBHOOK_URL unset/,
    "an unset webhook must log an honest skip rather than failing silently",
  );
  assert.match(
    alerter,
    /^exit 0$/m,
    "the alerter must always exit 0 so delivery can never mask the run failure",
  );
});

test("every workflow that writes generated public data shares ONE concurrency queue", () => {
  // Per-workflow concurrency groups serialize a workflow against itself and nothing else. On
  // 2026-07-30 morning-projections and daily-refresh ran concurrently, both committed generated
  // JSON, and a valid board was discarded when the loser's rebase conflicted. A shared group with
  // cancel-in-progress:false makes writers QUEUE — a generated artifact can be late, never lost.
  const writers = [
    "morning-projections.yml", "daily-refresh.yml", "mlb-daily-production.yml",
    "auto-refresh.yml", "daily-rebuild.yml", "daily-lifecycle.yml",
  ];
  for (const f of writers) {
    const yml = read(f);
    assert.match(yml, /group: gtp-generated-artifacts/, `${f}: must join the shared writer queue`);
    assert.match(yml, /cancel-in-progress: false/, `${f}: a writer must be queued, never cancelled mid-write`);
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
