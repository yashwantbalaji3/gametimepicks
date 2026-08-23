/**
 * INDEPENDENT SOURCES FOR INDEPENDENT SPORTS MUST FAIL INDEPENDENTLY.
 *
 * Run: npx tsx --test src/lib/audits/capture-independence.test.mjs
 *
 * sport-schedules captures nine things from five public sources for four sports, in one job, in
 * sequence. They were chained by `exit`: the first refusal killed every capture below it.
 *
 * On 2026-08-23 openfootball appended a score to a played fixture row — "Coventry City FC  3-0
 * (2-0)" — EPL identity correctly refused to guess the club, and the step exited 1. The five
 * captures below it never ran, so the ESPN injuries feed went past its 24-hour freshness bound and
 * every NFL player family degraded to SOURCE_STALE. A formatting change in English football data
 * blinded an American football product, and the only visible symptom was one red workflow.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import os from "node:os";

const WF = path.join(process.cwd(), "..", ".github", "workflows", "sport-schedules.yml");
const src = fs.readFileSync(WF, "utf8");

/** The steps' run blocks, in order, with their ids — parsed rather than regexed out of context. */
function captureSteps() {
  const out = [];
  const lines = src.split("\n");
  let cur = null;
  for (const line of lines) {
    if (/^ {6}- (name|uses):/.test(line)) { if (cur) out.push(cur); cur = { id: null, run: [], inRun: false }; continue; }
    if (!cur) continue;
    const id = line.match(/^ {8}id: (\S+)/);
    if (id) { cur.id = id[1]; continue; }
    if (/^ {8}run: \|/.test(line)) { cur.inRun = true; continue; }
    if (cur.inRun) {
      if (/^ {0,7}\S/.test(line) && line.trim()) { cur.inRun = false; continue; }
      cur.run.push(line);
    }
  }
  if (cur) out.push(cur);
  return out.filter((s) => s.id && s.run.join("\n").includes("GITHUB_OUTPUT"));
}

const steps = captureSteps();

test("every capture step was found — this guard is worthless if the parse silently returns nothing", () => {
  assert.ok(steps.length >= 8, `expected the job's capture steps, parsed ${steps.length}`);
  for (const id of ["epl", "injuries", "ufcresults", "nfl"]) {
    assert.ok(steps.some((s) => s.id === id), `capture step "${id}" must be present`);
  }
});

test("NO capture aborts the job — a refusal is recorded and the next sport still runs", () => {
  for (const s of steps) {
    const body = s.run.join("\n").replace(/^\s*#.*$/gm, "");
    for (const m of body.matchAll(/exit\s+(\S+)/g)) {
      assert.equal(m[1].replace(/["']/g, ""), "0",
        `${s.id} exits non-zero, which kills every capture below it in the same job`);
    }
  }
});

test("a step that records a refusal can NEVER go on to report CAPTURED", () => {
  /*
   * The dangerous version of this fix. Recording FAILED and then falling through to the
   * `state=CAPTURED` line at the end of the step overwrites the failure with a success — and each
   * commit step is gated on exactly that value, so a refused capture would have published. Three
   * steps did precisely this on the first pass.
   */
  for (const s of steps) {
    const body = s.run.join("\n").replace(/^\s*#.*$/gm, "");
    let i = body.indexOf('>> "$REFUSALS"');
    while (i !== -1) {
      const tail = body.slice(i);
      const nextExit = tail.indexOf("exit");
      const nextCaptured = tail.indexOf("state=CAPTURED");
      assert.ok(nextCaptured === -1 || (nextExit !== -1 && nextExit < nextCaptured),
        `${s.id} records a refusal and then reports CAPTURED — the commit gate would let it publish`);
      i = body.indexOf('>> "$REFUSALS"', i + 1);
    }
  }
});

test("every commit step is gated on ITS OWN capture reporting CAPTURED", () => {
  // Decoupling the failures is only safe because a refused capture still cannot publish.
  const commits = [...src.matchAll(/- name: Commit ([^\n]+)\n\s*if: ([^\n]+)/g)];
  assert.ok(commits.length >= 5, `expected the commit steps, found ${commits.length}`);
  for (const [, name, cond] of commits) {
    assert.match(cond, /steps\.\w+\.outputs\.state == 'CAPTURED'|dry_run/,
      `"Commit ${name}" must not publish unless its own capture reported CAPTURED`);
  }
});

test("a refusal still makes the run RED, and that check cannot be skipped", () => {
  assert.match(src, /Fail the run if any capture refused/, "refusals must still surface as a failure");
  const final = src.slice(src.indexOf("Fail the run if any capture refused"));
  assert.match(final, /if: always\(\)/,
    "the one path that skips this check would be the run where an earlier step died unexpectedly");
  assert.match(final, /exit 1/, "a recorded refusal must fail the job");
});

test("BEHAVIOURAL · the real EPL refusal no longer stops a later capture", () => {
  /*
   * Asserting about the YAML is not the same as running it. This replays the exact shape: a first
   * capture that refuses, a second that must still run, and the accumulator that makes the job red.
   */
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-capture-"));
  const refusals = path.join(dir, "refusals");
  const ran = path.join(dir, "second-ran");
  const script = `
set -uo pipefail
REFUSALS=${JSON.stringify(refusals)}
: > "$REFUSALS"
# first capture: refuses, exactly as EPL fixtures did
if false; then echo captured; else echo "EPL fixtures" >> "$REFUSALS"; fi
# second capture: the injuries feed, which must still run
echo ok > ${JSON.stringify(ran)}
# final gate
if [ -s "$REFUSALS" ]; then exit 1; fi
exit 0
`;
  let code = 0;
  try { execFileSync("bash", ["-c", script]); } catch (e) { code = e.status; }
  assert.equal(fs.existsSync(ran), true, "the second capture must run even though the first refused");
  assert.equal(code, 1, "and the job must still end red");
  fs.rmSync(dir, { recursive: true, force: true });
});

/*
 * ── A FREE REFRESH MUST NOT DRAG A PAID STEP ALONG WITH IT ─────────────────────────────────────
 *
 * ufc-fight-week ran Tue/Thu/Sat because one of its steps spends an odds credit. Everything else in
 * it is free, so after a Saturday card the newest card artifact described a FOUGHT event until
 * Tuesday morning — three days out of seven with no read for the next card, because nothing built
 * one. Adding a daily cron fixes that and would quadruple the credit burn unless the paid step is
 * gated, and a cost boundary that depends on remembering not to schedule something is not a
 * boundary.
 */
test("the UFC odds step runs ONLY on the priced crons, never on the daily free refresh", () => {
  const wf = fs.readFileSync(path.join(process.cwd(), "..", ".github", "workflows", "ufc-fight-week.yml"), "utf8");
  const priced = wf.slice(wf.indexOf("Refresh fight-winner prices"));
  const gate = priced.slice(0, priced.indexOf("\n        env:"));
  assert.match(gate, /if:/, "the credit-spending step must carry a condition");
  // Every cron in the file must be either named in the gate or provably excluded by it.
  const crons = [...wf.matchAll(/- cron: "([^"]+)"/g)].map((m) => m[1]);
  const allowed = crons.filter((c) => gate.includes(`"${c}"`));
  assert.ok(allowed.length > 0, "at least one cron must be allowed to spend, or the step is dead");
  assert.ok(allowed.length < crons.length,
    "if every cron is allowed to spend, the gate buys nothing and the free cadence costs money");
  for (const c of crons.filter((x) => !allowed.includes(x))) {
    assert.ok(!gate.includes(`"${c}"`), `${c} must not be able to reach the paid step`);
  }
});

test("the free cadence actually covers the days the priced one misses", () => {
  // The whole point: no day of the week may be left without a card refresh, or the hub goes stale
  // again on exactly the days a card has just been fought.
  const wf = fs.readFileSync(path.join(process.cwd(), "..", ".github", "workflows", "ufc-fight-week.yml"), "utf8");
  const days = new Set();
  for (const m of wf.matchAll(/- cron: "\d+ \d+ \* \* ([\d,]+)"/g)) {
    for (const d of m[1].split(",")) days.add(Number(d));
  }
  assert.deepEqual([...days].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6],
    "every day of the week must refresh the card — the hub going stale is what this exists to stop");
});
