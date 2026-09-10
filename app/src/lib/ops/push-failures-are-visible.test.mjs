/**
 * A STEP THAT DETECTS ITS OWN DISCARD MUST NOT BE WRAPPED IN SOMETHING THAT IGNORES IT.
 *
 * On 2026-09-10 mlb-daily-production generated the full day's MLB slate — team markets, player
 * props, predictions, game and full-game simulations, 17 files including paid Odds API data —
 * committed it, hit a deterministic add/add rebase conflict against a tier-grid file another
 * workflow had just created, exhausted five retries, printed
 *
 *     ::error::slate generated and committed locally but never pushed after 5 attempts —
 *             the work was discarded
 *
 * and exited 1. The step concluded SUCCESS. The job concluded SUCCESS. The only visible symptom
 * appeared three workflows downstream, when daily-products refused to build product cards with
 * INPUT_MISSING on a file that had in fact been generated correctly forty minutes earlier.
 *
 * The `exit 1` and the `::error::` were both added deliberately, by Sprint 035, whose own comment
 * reads "a discarded slate must be visible". A single `continue-on-error: true` on the same step
 * had been quietly cancelling that intent ever since.
 *
 * This is the second instance found the same morning — cron-watchdog had been discarding its
 * coverage report on a 403 for three weeks under the same swallow — which is why the rule is a
 * guard and not a code review note.
 *
 * THE RULE IS NARROW ON PURPOSE. `continue-on-error` is legitimate: an observer bolted onto a
 * recovery job must never be why recovery fails, and a genuinely optional persistence step can
 * choose to be best-effort. What is never legitimate is a step that goes to the trouble of
 * detecting a failed push and exiting non-zero, wrapped in a flag that discards that exit. Those
 * two decisions contradict each other, and the swallow always wins silently.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const WF_DIR = path.join(REPO, ".github/workflows");

/**
 * Every step in every workflow, flattened.
 *
 * Text-split rather than YAML-parsed, matching workflow-script-cwd.test.mjs beside it: this repo
 * has no YAML dependency in the app package, and adding one for a guard would be a strange trade.
 * A step begins at a `- name:` line and runs until the next line at the same indent — enough to
 * recover the three things this file asks about (the name, the continue-on-error flag, and the
 * run body), and nothing more.
 */
function* everyStep() {
  for (const file of fs.readdirSync(WF_DIR).filter((f) => f.endsWith(".yml"))) {
    const lines = fs.readFileSync(path.join(WF_DIR, file), "utf8").split("\n");
    let cur = null;
    const flush = function* () {
      if (!cur) return;
      const body = cur.body.join("\n");
      yield {
        file,
        name: cur.name,
        // The flag belongs to THIS step: same indent as the `- name:` key, i.e. indent + 2.
        continueOnError: new RegExp(`^ {${cur.indent + 2}}continue-on-error:\\s*true\\s*$`, "m").test(body),
        run: body,
      };
      cur = null;
    };
    for (const line of lines) {
      const m = /^(\s*)- name:\s*(.*)$/.exec(line);
      if (m) {
        yield* flush();
        cur = { indent: m[1].length, name: m[2].trim().replace(/^["']|["']$/g, ""), body: [] };
        continue;
      }
      if (cur) {
        // A line at or left of the step's own indent that starts a new list item ends this step.
        const indent = line.search(/\S/);
        if (indent >= 0 && indent <= cur.indent && /^\s*-\s/.test(line)) {
          yield* flush();
          continue;
        }
        if (indent >= 0 && indent < cur.indent) {
          yield* flush();
          continue;
        }
        cur.body.push(line);
      }
    }
    yield* flush();
  }
}

test("no step both fails on a discarded push and swallows that failure", () => {
  const contradictions = [];
  for (const { file, name, run, continueOnError } of everyStep()) {
    if (!run.includes("git push")) continue;
    if (!continueOnError) continue;
    // Does the step itself treat a failed push as an error?
    const detects = /\bexit\s+1\b/.test(run) || /::error/.test(run);
    if (detects) contradictions.push(`${file} · ${name}`);
  }
  assert.deepEqual(
    contradictions,
    [],
    "these steps exit non-zero on a failed push AND carry continue-on-error, so the failure is " +
      "invisible and committed work is discarded against a green run — remove the flag, or remove " +
      "the exit and accept the step is genuinely best-effort",
  );
});

test("no step SUPPRESSES a failed push", () => {
  /*
   * The general form of the same rule.
   *
   * A first cut of this test asked whether a pushing step prints something when it fails, and
   * flagged eight steps across daily-products, epl-settle, epl-matchweek, nfl-event-window,
   * nfl-odds-capture and mlb-lineup-refresh. Every one of those was a false positive: they run
   * under `set -euo pipefail` with a bare `git push origin HEAD:main` as the last command, so a
   * failed push already fails the step and reddens the job. They say nothing because they do not
   * need to — the shell says it for them. Demanding a retry-then-error from all eight would have
   * been eight unnecessary edits to working automation.
   *
   * What actually loses work is SUPPRESSION: `continue-on-error`, `|| true` hung on the push
   * itself, or an `exit 0` that runs whether or not it landed. Those turn a failed push into a
   * green run, which is how a full day's paid MLB slate disappeared on 2026-09-10.
   */
  const suppressed = [];
  for (const { file, name, run, continueOnError } of everyStep()) {
    const pushLines = run.split("\n").filter((l) => l.includes("git push"));
    if (!pushLines.length) continue;

    // `|| true` (or `|| echo`, `|| :`) directly on the push line swallows its exit code.
    const swallowedInline = pushLines.some((l) => /git push[^\n]*\|\|\s*(true|:|echo)\b/.test(l));
    // A retry loop legitimately tolerates individual attempts; it is only safe if the loop then
    // reports. Those steps carry an explicit exit 1 / ::error, which is what distinguishes them.
    const reportsAfterRetry = /\bexit\s+1\b/.test(run) || /::error/.test(run);

    if (continueOnError && reportsAfterRetry) continue; // already covered by the test above
    if (continueOnError) suppressed.push(`${file} · ${name} (continue-on-error)`);
    else if (swallowedInline && !reportsAfterRetry) suppressed.push(`${file} · ${name} (|| true on the push)`);
  }

  const KNOWN = new Set([
    // Pregame archive METADATA only, recaptured every two hours, nothing downstream gates on it,
    // and it carries no paid market data. Best-effort here is a real choice, not an oversight.
    "mlb-pregame-capture.yml · Durable in-repo persistence (OPT-IN — path-scoped + size-guarded + rebase-safe, never blocks) (continue-on-error)",
  ]);
  assert.deepEqual(
    suppressed.filter((x) => !KNOWN.has(x)),
    [],
    "a failed push here is turned into a green run — remove the suppression, or add it to KNOWN " +
      "with the reason losing that artifact is harmless",
  );
});

test("the two steps this was written for are actually fixed", () => {
  // Pinned so a future edit cannot quietly reintroduce the exact swallow that lost a day's slate.
  for (const file of ["mlb-daily-production.yml", "auto-refresh.yml"]) {
    const pushing = [...everyStep()].filter((s) => s.file === file && s.run.includes("git push"));
    assert.ok(pushing.length > 0, `${file}: expected a pushing step`);
    for (const s of pushing) {
      assert.equal(s.continueOnError, false, `${file} · ${s.name}: the swallow is back`);
    }
  }
});
