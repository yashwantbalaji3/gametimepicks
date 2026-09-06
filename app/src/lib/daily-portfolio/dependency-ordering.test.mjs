import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

/*
 * NO YAML PARSER. `js-yaml` is not a dependency of this app, so these assertions read the workflow
 * as text and use byte offsets for ordering — the same approach P235 settled on for this reason.
 * daily-products.yml has a single job, which is what makes step ordering by offset sound.
 */
const WF = path.join(process.cwd(), "..", ".github", "workflows");
const read = (f) => fs.readFileSync(path.join(WF, f), "utf8");
const SRC = read("daily-products.yml");
const stepAt = (namePattern) => SRC.search(new RegExp(`^      - name: .*${namePattern}`, "mi"));
/** The body of one `run: |` block, dedented. */
function runBodyAfter(offset) {
  const i = SRC.indexOf("run: |", offset);
  if (i === -1) return "";
  const lines = SRC.slice(i).split("\n").slice(1);
  const out = [];
  for (const l of lines) {
    if (l.trim() === "") { out.push(""); continue; }
    if (!l.startsWith("          ")) break;
    out.push(l.slice(10));
  }
  return out.join("\n");
}

test("exactly one job, so ordering by byte offset is sound", () => {
  const jobs = [...SRC.matchAll(/^  [a-z0-9_-]+:\n    runs-on:/gmi)];
  assert.equal(jobs.length, 1, `byte-offset ordering assumes one job, found ${jobs.length}`);
});

test("generation depends on the PRODUCER, not on a clock", () => {
  /*
   * THE RACE THIS CLOSES. mlb-daily-production writes mlb/team-markets/<date>.json; daily-products
   * reads it. Both were driven only by their own timers — 14:15 and 15:30 UTC — and the producer's
   * real write times were 16:50 (2026-09-05) and 17:05 (2026-09-06), both AFTER the consumer's hour.
   * Cards appeared only because the consumer was late too, by 39 and 34 minutes. Two timers drifting
   * the same way twice is not an ordering guarantee.
   */
  assert.match(SRC, /^\s*workflow_run:/m, "daily-products has no workflow_run dependency — it is back on a timer");
  assert.match(SRC, /workflows:\s*\["mlb-daily-production"\]/, "it must depend on the pool's producer");
  const producers = fs.readdirSync(WF).filter((f) => f.endsWith(".yml"))
    .filter((f) => /^name:\s*mlb-daily-production\s*$/m.test(read(f)));
  assert.equal(producers.length, 1, "the named producer must resolve to exactly one workflow");
});

test("a FAILED producer run cannot trigger a successful generation", () => {
  // `types: [completed]` fires for failure and cancellation too. Without the conclusion check a
  // producer that wrote nothing would still start the consumer.
  assert.match(SRC, /workflow_run\.conclusion\s*==\s*'success'/,
    "the producer's conclusion is not checked — a failed run would trigger generation");
});

test("the cron survives as a bounded recovery and cannot duplicate a generation", () => {
  assert.match(SRC, /^\s*- cron:/m, "the recovery cron was removed — a producer that never runs leaves no path");
  const guard = stepAt("Skip a recovery");
  assert.ok(guard !== -1, "no recovery guard — a cron run could generate a second card for a date already done");
  const block = SRC.slice(guard, guard + 900);
  assert.match(block, /if: github\.event_name == 'schedule'/, "the guard must apply to the cron path");
  assert.match(block, /receipts/, "the guard must consult the dated receipt before regenerating");
});

test("the input gate runs BEFORE generation, and generation respects the guard", () => {
  const gate = stepAt("input must actually be usable");
  const gen = stepAt("Generate daily products");
  assert.ok(gate !== -1, "no input gate");
  assert.ok(gen !== -1, "no generation step");
  assert.ok(gate < gen, "the gate must precede generation, or it gates nothing");
  assert.match(runBodyAfter(gate), /check-pool-ready/, "the gate must call the validator");
  assert.match(SRC.slice(gen, gen + 300), /already-generated/, "generation must respect the recovery guard");
});

test("every run block in this workflow is valid shell", () => {
  // Valid YAML has held broken shell here before; a workflow can parse and still do nothing.
  let checked = 0;
  for (const m of SRC.matchAll(/run: \|/g)) {
    const body = runBodyAfter(m.index);
    if (!body.trim()) continue;
    checked += 1;
    try { execFileSync("bash", ["-n"], { input: body }); }
    catch (e) { assert.fail(`a run block is not valid shell: ${e.stderr}\n---\n${body.slice(0, 300)}`); }
  }
  assert.ok(checked >= 5, `only ${checked} run blocks parsed — the extractor is not finding them`);
});
