/**
 * EVERY WORKFLOW STEP'S SHELL MUST PARSE.
 *
 * nightly-settle — the single settlement writer — failed twice overnight on
 * `line 12: syntax error: unexpected end of file`. A `fi` had drifted out of its own step and into
 * the NEXT step's run block, which left one step with an unterminated `if` and turned the following
 * step's command into `node … || true fi`. The second half is the worse half: `|| true fi` still
 * exits 0, so that step reported success while running nothing of the sort.
 *
 * Nothing caught it. YAML was valid — the file parses fine, because a broken shell script is a
 * perfectly good YAML string. The suite does not run workflows. The failure surfaced only when the
 * cron fired at 05:30 UTC and again at 07:30, against a settlement job that moves money artifacts.
 *
 * `bash -n` parses without executing, so this is exactly the check that was missing: it reads every
 * `run:` block in every workflow and refuses one that could not run.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const REPO = path.resolve(process.cwd(), "..");
const DIR = path.join(REPO, ".github", "workflows");

/**
 * Extract each step's `run:` block by indentation.
 *
 * Deliberately NOT a YAML parse. The failure being guarded is one where the YAML is valid and the
 * SHELL is not, and a YAML library happily returns the broken string — so reading the raw text and
 * checking the script is the whole point. It also means no dependency on a yaml package here.
 */
function runBlocks(src) {
  const lines = src.split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    /*
     * YAML has TWO block scalar styles and they mean different things to the shell:
     *   `|`  literal — newlines are preserved, so the script is multi-line
     *   `>`  folded  — newlines become SPACES, so the whole block is ONE command
     * Chomping indicators (-, +) may follow either. Treating a folded block as literal reports a
     * perfectly good `npx tsx --test a.mjs b.mjs` spread over five lines as a syntax error, which
     * is exactly what the first version of this guard did.
     */
    const m = /^(\s*)(?:-\s+)?run:\s*([|>])([-+]?)\s*$/.exec(lines[i]);
    if (m) {
      const indent = m[1].length;
      const folded = m[2] === ">";
      const body = [];
      let j = i + 1;
      for (; j < lines.length; j++) {
        const l = lines[j];
        if (l.trim() === "") { body.push(""); continue; }
        const ind = l.length - l.trimStart().length;
        if (ind <= indent) break;
        body.push(folded ? l.trim() : l);
      }
      if (body.length) out.push({ line: i + 1, script: body.join(folded ? " " : "\n") });
      i = j - 1;
      continue;
    }
    // Single-line form: `run: node foo.mjs`
    const one = /^\s*(?:-\s+)?run:\s+(\S.*)$/.exec(lines[i]);
    if (one) out.push({ line: i + 1, script: one[1] });
  }
  return out;
}

/** GitHub expressions are not shell; substitute a literal so `bash -n` sees valid syntax. */
const neutralize = (s) => s.replace(/\$\{\{[^}]*\}\}/g, "GH_EXPR");

test("every workflow step's shell parses", () => {
  if (!fs.existsSync(DIR)) return;
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));
  assert.ok(files.length > 0, "no workflows found — this guard would pass vacuously");

  const failures = [];
  let checked = 0;
  for (const f of files) {
    const src = fs.readFileSync(path.join(DIR, f), "utf8");
    for (const b of runBlocks(src)) {
      checked++;
      const r = spawnSync("bash", ["-n", "-"], { input: neutralize(b.script), encoding: "utf8" });
      if (r.status !== 0) failures.push(`${f}:${b.line} — ${String(r.stderr).trim().split("\n")[0]}`);
    }
  }
  assert.ok(checked > 40, `only ${checked} run blocks found — the extractor is probably broken, not the workflows`);
  assert.deepEqual(failures, [], `workflow step(s) whose shell cannot run:\n  ${failures.join("\n  ")}`);
});

test("no step silently swallows a failure with a trailing token after || true", () => {
  /*
   * The second half of the same defect, and the one that would have gone on lying. `node x || true`
   * is a deliberate "this step may fail" idiom used across these workflows. `node x || true fi` is
   * that idiom with a stray word attached — it still exits 0, so the step reports success, and
   * `bash -n` sees nothing wrong because it is syntactically fine.
   */
  if (!fs.existsSync(DIR)) return;
  const offenders = [];
  for (const f of fs.readdirSync(DIR).filter((n) => n.endsWith(".yml") || n.endsWith(".yaml"))) {
    const src = fs.readFileSync(path.join(DIR, f), "utf8");
    src.split("\n").forEach((l, i) => {
      // `|| true` followed by a bare word that is not a shell operator or a comment.
      const m = /\|\|\s+true\s+([A-Za-z_][\w-]*)\s*$/.exec(l);
      if (m && ["fi", "done", "esac", "then", "else"].includes(m[1])) {
        offenders.push(`${f}:${i + 1} — "|| true ${m[1]}" exits 0 and runs nothing`);
      }
    });
  }
  assert.deepEqual(offenders, [], `a shell keyword drifted onto a || true line:\n  ${offenders.join("\n  ")}`);
});

test("every npm step runs where the lockfile actually is", async () => {
  /*
   * ufc-fight-week failed on its FIRST scheduled run — 24 minutes after the cron, one minute in —
   * on `npm ci can only install with an existing package-lock.json`. The lockfile lives in app/, not
   * at the repo root, and that step had no working-directory.
   *
   * The shell-syntax guard above could not see it: `npm ci` parses perfectly. This is the adjacent
   * class — a step that is valid shell and still cannot run in the directory it was given. Every
   * other workflow in the repo already gets this right, so the invariant is real and only the new
   * one broke it.
   */
  if (!fs.existsSync(DIR)) return;
  const { default: yaml } = await import("js-yaml").catch(() => ({ default: null }));

  const offenders = [];
  let checked = 0;
  for (const f of fs.readdirSync(DIR).filter((n) => n.endsWith(".yml") || n.endsWith(".yaml"))) {
    const src = fs.readFileSync(path.join(DIR, f), "utf8");
    if (!/npm (ci|install)/.test(src)) continue;

    /*
     * Parsed by hand rather than with a YAML dependency, so this guard has no install to depend on.
     * For each `npm ci`/`npm install` occurrence, look for app/ context: the step's own
     * working-directory, a job-level default, or a `cd app` in the same run block.
     */
    const lines = src.split("\n");
    const jobDefaultsApp = /defaults:\s*\n\s*run:\s*\n\s*working-directory:\s*\.?\/?app/.test(src);
    lines.forEach((l, i) => {
      if (!/npm (ci|install)/.test(l)) return;
      if (/^\s*#/.test(l)) return;                       // a comment mentioning npm ci is not a step
      checked++;
      if (jobDefaultsApp) return;
      // Look back for the step's working-directory and forward a couple of lines for a trailing one.
      const window = lines.slice(Math.max(0, i - 12), i + 3).join("\n");
      if (/working-directory:\s*\.?\/?app/.test(window)) return;
      if (/cd app|app &&/.test(window)) return;
      offenders.push(`${f}:${i + 1} — ${l.trim().slice(0, 70)}`);
    });
  }
  assert.ok(checked > 5, `only ${checked} npm steps found — the scan is probably broken, not the workflows`);
  assert.deepEqual(offenders, [],
    `npm step(s) that would run outside app/, where there is no lockfile:\n  ${offenders.join("\n  ")}`);
});

test("a script is never invoked from a directory it cannot run in", () => {
  /*
   * The third failure of the same shape in two days, and the one that got furthest: `npm ci` fixed,
   * the schedule capture succeeded, and then the card builder died on a path one directory too
   * high. It read `process.cwd()` while the workflow ran it as `node app/scripts/...` from the repo
   * ROOT — and the capture script beside it, which resolves from its own location, was fine.
   *
   * The invariant is about the PAIRING, not the script. Anchoring on cwd is perfectly safe when the
   * step sets `working-directory: app`, which is how a dozen long-running MLB jobs invoke these
   * scripts every day. It is only a defect when the step runs from somewhere else. Flagging the
   * script alone would condemn working code and teach everyone to ignore this guard.
   */
  if (!fs.existsSync(DIR)) return;

  /*
   * A BARE cwd anchor, not merely a mention of cwd.
   *
   * Several long-running MLB scripts use a deliberately cwd-TOLERANT idiom:
   *   const APP = process.cwd().endsWith("/app") ? process.cwd() : path.join(process.cwd(), "app");
   * That resolves correctly from either directory and is not a defect. The first version of this
   * check matched `const APP = process.cwd()` as a PREFIX of exactly that line and condemned three
   * jobs that have been running green for months — which is how a guard gets ignored.
   *
   * So the anchor statement is read whole, and only one with no tolerance in it counts.
   */
  const cwdAnchored = (rel) => {
    const full = path.join(REPO, rel);
    if (!fs.existsSync(full)) return false;
    const body = fs.readFileSync(full, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const m of body.matchAll(/const\s+(?:APP|ROOT|BASE|REPO|OUT|RAW|DIR)\s*=\s*([^;\n]*)/g)) {
      const rhs = m[1];
      if (!rhs.includes("process.cwd()")) continue;
      if (/endsWith|dirname\(process\.cwd/.test(rhs)) continue;   // tolerant of either directory
      return true;
    }
    return false;
  };

  const offenders = [];
  let pairs = 0;
  for (const f of fs.readdirSync(DIR).filter((n) => n.endsWith(".yml") || n.endsWith(".yaml"))) {
    const src = fs.readFileSync(path.join(DIR, f), "utf8");
    const lines = src.split("\n");
    const jobDefaultsApp = /defaults:\s*\n\s*run:\s*\n\s*working-directory:\s*\.?\/?app/.test(src);

    lines.forEach((l, i) => {
      const m = /\b(?:node|npx tsx)\s+(app\/scripts\/[\w./-]+\.mjs)/.exec(l);
      if (!m || /^\s*#/.test(l)) return;
      pairs++;
      // Invoked with the `app/` prefix, so cwd is the repo root UNLESS the step says otherwise.
      const window = lines.slice(Math.max(0, i - 14), i + 3).join("\n");
      const runsInApp = jobDefaultsApp || /working-directory:\s*\.?\/?app/.test(window) || /cd app/.test(window);
      if (runsInApp) return;                       // cwd is app/, so a cwd anchor resolves correctly
      if (!cwdAnchored(m[1])) return;              // script resolves from its own location — fine
      offenders.push(`${f}:${i + 1} — runs ${m[1]} from the repo root, but that script anchors on process.cwd()`);
    });
  }
  assert.ok(pairs > 0, "no path-invoked scripts found — the scan is probably broken");
  assert.deepEqual(offenders, [], `script(s) invoked from a directory they cannot run in:\n  ${offenders.join("\n  ")}`);
});

test("no workflow pushes to main without being able to rebase", () => {
  /*
   * auto-refresh's latest scheduled run failed on "! [rejected] (fetch first)". It had built the
   * artifact correctly and committed it — then lost the entire run because something else had
   * pushed to main in the meantime. That is not an edge case here: several bots and every human
   * commit land on the same branch, so a bare `git push` is a coin flip that gets worse the busier
   * the day is.
   *
   * A push must therefore be able to recover: either it retries around a fetch/rebase, or a rebase
   * precedes it. The retry-loop form most of these workflows already use satisfies both.
   */
  if (!fs.existsSync(DIR)) return;
  const offenders = [];
  let pushes = 0;
  for (const f of fs.readdirSync(DIR).filter((n) => n.endsWith(".yml") || n.endsWith(".yaml"))) {
    const lines = fs.readFileSync(path.join(DIR, f), "utf8").split("\n");
    lines.forEach((l, i) => {
      if (!/\bgit push\b/.test(l) || /^\s*#/.test(l.trim())) return;
      pushes++;
      // Recovery may sit just before the push (rebase-then-push) or just after it inside a retry
      // loop (push-then-fetch-then-retry), so look both ways.
      const window = lines.slice(Math.max(0, i - 12), i + 8).join("\n");
      if (/git pull --rebase|git fetch/.test(window)) return;
      offenders.push(`${f}:${i + 1} — ${l.trim().slice(0, 66)}`);
    });
  }
  assert.ok(pushes > 5, `only ${pushes} pushes found — the scan is probably broken, not the workflows`);
  assert.deepEqual(offenders, [],
    `push(es) to main with no way to recover from a concurrent push:\n  ${offenders.join("\n  ")}`);
});
