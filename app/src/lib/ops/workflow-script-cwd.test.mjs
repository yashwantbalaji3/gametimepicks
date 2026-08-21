/**
 * A SCRIPT THAT USES "@/" MUST RUN FROM app/.
 *
 * epl-settle graded nothing on its first real run. Not because the join broke — because the step
 * said `npx tsx app/scripts/epl/grade-epl-forecasts.mjs` from the repository root, and that script
 * reaches lib/soccer/epl-identity.ts, which imports "@/lib/identity/event-identity". The "@/" alias
 * is declared in app/tsconfig.json, so tsx resolves it only when app/ is the working directory. From
 * the root it is MODULE_NOT_FOUND.
 *
 * It passed every local check because a developer runs these from app/ without thinking about it,
 * and it passed review because the line looks correct. It failed the first time a runner executed
 * it — and it would have failed silently in the sense that mattered: the run committed its capture,
 * reported a grading refusal, and looked exactly like a broken identity join rather than a missing
 * working directory.
 *
 * So the rule is checked mechanically. Any workflow step invoking a script whose import graph
 * reaches an aliased import must declare `working-directory: app`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const WF_DIR = path.join(REPO, ".github", "workflows");

/**
 * Split a workflow into job blocks so a job-level default can be scoped to its own job.
 *
 * A workflow may set the directory once for every step via `defaults: run: working-directory:`.
 * quality-gate does exactly that, and a guard blind to it condemns the whole job. Scoping matters
 * because a second job in the same file need not share the default.
 */
function jobs(src) {
  const lines = src.split("\n");
  const start = lines.findIndex((l) => /^jobs:\s*$/.test(l));
  if (start < 0) return [{ defaultCwd: null, text: src }];
  const out = [];
  let cur = null;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^  [\w-]+:\s*$/.test(lines[i])) {
      if (cur) out.push(cur);
      cur = { lines: [] };
      continue;
    }
    if (cur) cur.lines.push(lines[i]);
  }
  if (cur) out.push(cur);
  return out.map((j) => {
    const text = j.lines.join("\n");
    // `defaults:` → `run:` → `working-directory:`, matched as a block so an unrelated
    // step-level key cannot be mistaken for the job default.
    const d = /^\s*defaults:\s*\n\s*run:\s*\n\s*working-directory:\s*(\S+)\s*$/m.exec(text);
    return { defaultCwd: d?.[1] ?? null, text };
  });
}

/** Steps as (name, working-directory, run-body) triples. Raw text on purpose — see workflow-shell-syntax. */
function steps(src, defaultCwd = null) {
  const lines = src.split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)-\s+name:\s*(.+)$/.exec(lines[i]);
    if (!m) continue;
    const indent = m[1].length;
    const body = [];
    let j = i + 1;
    for (; j < lines.length; j++) {
      const l = lines[j];
      if (l.trim() === "") { body.push(""); continue; }
      const ind = l.length - l.trimStart().length;
      if (ind <= indent) break;
      body.push(l);
    }
    const text = body.join("\n");
    out.push({ name: m[2].trim(), cwd: /^\s*working-directory:\s*(\S+)\s*$/m.exec(text)?.[1] ?? defaultCwd, text });
    i = j - 1;
  }
  return out;
}

/**
 * Resolve a relative specifier the way the loader would: the FIRST candidate that exists wins.
 *
 * The first version of this recursed into every possible spelling at once. Where both `foo.mjs` and
 * `foo.ts` existed it walked both, so it found aliases down paths the runtime never takes and
 * reported six healthy workflows as broken — including the MLB daily job that has run seventy-one
 * times without incident. A guard that cries on working jobs gets deleted, which is worse than not
 * having one.
 */
function resolveSpecifier(fromFile, spec) {
  const base = path.resolve(path.dirname(fromFile), spec);
  const candidates = [base];
  // tsx maps a ".mjs" specifier onto a ".ts" file ONLY when the literal file is absent — that is the
  // fallback, never a parallel branch.
  if (/\.mjs$/.test(base)) candidates.push(base.replace(/\.mjs$/, ".ts"));
  if (/\.js$/.test(base)) candidates.push(base.replace(/\.js$/, ".ts"));
  if (!/\.[cm]?[jt]sx?$/.test(base)) candidates.push(`${base}.ts`, `${base}.tsx`, `${base}.mjs`, `${base}.js`, path.join(base, "index.ts"));
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

/**
 * A TYPE-ONLY IMPORT IS NOT AN IMPORT AT RUNTIME.
 *
 * `import type { X } from "@/..."` is erased when the file is transpiled, so tsx never asks the
 * resolver about it and the missing alias never bites. `import { deriveEventId } from "@/..."`
 * pulls a value and must resolve. That single distinction is the whole difference between the MLB
 * predictions job, which imports a type from "@/lib/mlb/full-game/types" and has run from the
 * repository root seventy-one times, and the EPL grader, which imports a function from
 * "@/lib/identity/event-identity" and died on its first run.
 *
 * Miss this and the guard condemns a working daily job.
 */
const TYPE_ONLY = /^\s*import\s+type\b/;

/** Value-bearing `from "..."` specifiers only — type-only lines are skipped on both edges. */
function valueImports(src, pattern) {
  const out = [];
  for (const line of src.split("\n")) {
    if (TYPE_ONLY.test(line)) continue;
    const m = pattern.exec(line);
    if (m) out.push(m[1]);
    pattern.lastIndex = 0;
  }
  return out;
}

/**
 * Does this file, or anything it relatively imports, use an aliased "@/" import FOR A VALUE?
 *
 * Multi-line import statements are handled by stripping type-only lines first and then matching the
 * `from` clause: a `} from "@/..."` closing line carries no `import type`, and its own statement's
 * opening line is what would have declared the import type-only.
 */
function reachesAlias(file, seen = new Set()) {
  const abs = path.resolve(file);
  if (seen.has(abs) || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) return false;
  seen.add(abs);
  const src = fs.readFileSync(abs, "utf8");
  // A multi-line `import type {\n ... \n} from "@/x"` must not count. Collapse statements first so
  // the type marker and the specifier are judged together rather than on separate lines.
  const collapsed = src.replace(/import\s+type\s*\{[^}]*\}\s*from\s*["'][^"']+["'];?/g, "");
  if (valueImports(collapsed, /\bfrom\s+["'](@\/[^"']+)["']/).length) return true;
  if (/\bimport\(\s*["']@\//.test(collapsed) || /\brequire\(\s*["']@\//.test(collapsed)) return true;
  for (const spec of valueImports(collapsed, /\bfrom\s+["'](\.[^"']+)["']/)) {
    const next = resolveSpecifier(abs, spec);
    if (next && reachesAlias(next, seen)) return true;
  }
  return false;
}

/**
 * Does this file's VALUE-import graph reach a TypeScript file?
 *
 * Plain `node` cannot load `.ts` at all — it throws ERR_UNKNOWN_FILE_EXTENSION. Fixing the working
 * directory on the EPL fixture capture only moved it from one crash to the next, because the step
 * also said `node` where it needed `npx tsx`. Both halves are the same mistake wearing two errors,
 * so both are checked here rather than leaving the second to be found the same way as the first.
 */
function reachesTypeScript(file, seen = new Set()) {
  const abs = path.resolve(file);
  if (seen.has(abs) || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) return false;
  if (/\.tsx?$/.test(abs)) return true;
  seen.add(abs);
  const collapsed = fs.readFileSync(abs, "utf8").replace(/import\s+type\s*\{[^}]*\}\s*from\s*["'][^"']+["'];?/g, "");
  for (const spec of valueImports(collapsed, /\bfrom\s+["'](\.[^"']+)["']/)) {
    const next = resolveSpecifier(abs, spec);
    if (next && reachesTypeScript(next, seen)) return true;
  }
  return false;
}

test("every workflow step running an alias-using script declares working-directory: app", () => {
  const offenders = [];
  for (const wf of fs.readdirSync(WF_DIR).filter((f) => /\.ya?ml$/.test(f))) {
    const src = fs.readFileSync(path.join(WF_DIR, wf), "utf8");
    for (const job of jobs(src)) for (const st of steps(job.text, job.defaultCwd)) {
      /*
       * Track `cd app` as the shell would: it changes the directory for EVERYTHING that follows in
       * the block, not just its own line. Checking only the current line reported five healthy steps
       * as broken — nightly-settle sets its directory with a bare `cd app` on a line of its own,
       * several commands before the invocation.
       */
      let cdApp = false;
      for (const line of st.text.split("\n")) {
        if (/(^|[;&|(]|\bthen\b|\bdo\b)\s*cd\s+app\b/.test(line)) cdApp = true;
        const m = /\b(?:npx\s+tsx|node)\s+((?:app\/)?scripts\/[\w./-]+\.mjs)\b/.exec(line);
        if (!m) continue;
        const spec = m[1];
        const inlineCd = cdApp;
        const from = st.cwd === "app" || inlineCd ? APP : REPO;
        const abs = path.resolve(from, spec);
        if (!fs.existsSync(abs)) {
          offenders.push(`${wf} · "${st.name}" · ${spec} does not exist from ${st.cwd ?? (inlineCd ? "app" : "repo root")}`);
          continue;
        }
        if (reachesAlias(abs) && !(st.cwd === "app" || inlineCd)) {
          offenders.push(`${wf} · "${st.name}" · ${spec} reaches an "@/" import but runs from the repo root`);
        }
        // The other half of the same mistake: a graph that reaches TypeScript cannot be loaded by
        // plain node, whatever the working directory is.
        if (/\bnode\s/.test(line) && !/npx\s+tsx/.test(line) && reachesTypeScript(abs)) {
          offenders.push(`${wf} · "${st.name}" · ${spec} imports TypeScript but is run with plain node`);
        }
      }
    }
  }
  assert.deepEqual(offenders, [], `steps that will fail MODULE_NOT_FOUND on a runner:\n  ${offenders.join("\n  ")}`);
});

test("the detector actually detects — the exact script that failed reaches an alias", () => {
  // A guard that silently found nothing would pass forever. This pins the real case: the grader
  // imports lib/soccer/epl-identity.ts, which imports "@/lib/identity/event-identity".
  assert.equal(reachesAlias(path.join(APP, "scripts/epl/grade-epl-forecasts.mjs")), true);
  // And a script with no aliased import in its graph must NOT be flagged, or the rule is vacuous.
  assert.equal(reachesAlias(path.join(APP, "scripts/ops/cron-slot-watchdog.mjs")), false);
  // CALIBRATED AGAINST BOTH REAL OUTCOMES, not just the failing one. This script is invoked from the
  // repository root by mlb-daily-production and works — verified by running it — so a detector that
  // flags it is wrong no matter how sound its reasoning looks.
  assert.equal(reachesAlias(path.join(APP, "scripts/generate-mlb-predictions.mjs")), false);
  // The tsx half, calibrated the same way: the MLB script does import TypeScript (and its step
  // correctly uses npx tsx), while the watchdog does not (and its step correctly uses node).
  assert.equal(reachesTypeScript(path.join(APP, "scripts/generate-mlb-predictions.mjs")), true);
  assert.equal(reachesTypeScript(path.join(APP, "scripts/ops/cron-slot-watchdog.mjs")), false);
});
