/**
 * Input-mutation tests for the Vercel Ignored Build Step (build-cost audit, 2026-10-19 —
 * docs/cost/BUILD_COST_AUDIT_2026-10-19.md §5).
 *
 * vercel-ignore-build.behavior.test.mjs pins the script's control flow (base selection, hatch, duplicate guard).
 * This file mutates ONE input at a time from a fixed deployed base and pins the verdict, so a cost lever that
 * edits the path rules cannot silently move a real reader input to "skip" or a non-input to "build":
 *   (a) a change to a genuine public data input (a file a real page reads)       ⇒ BUILD (exit 1)
 *   (b) docs-only / repo-root scripts / .github-only                             ⇒ SKIP  (exit 0)
 *   (c) a stamp-only change in every path the script currently treats as non-input ⇒ SKIP
 *       — and the converse: a stamp-only change to a build INPUT still BUILDS (the script is path-based, not
 *         content-aware; stamp suppression has to live writer-side, e.g. #1088's gate)
 *   (d) unknown / missing / malformed previous SHA                              ⇒ BUILD (fail open)
 * Same harness as the behavior test: a throwaway git repo, the real script, cwd = <repo>/app.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ROOT = path.resolve(APP, "..");
const SCRIPT = path.join(APP, "scripts", "vercel-ignore-build.sh");
const SCRIPT_TEXT = fs.readFileSync(SCRIPT, "utf8");

/** The script's own arrays, parsed between its marker lines (the same markers the coverage tests parse). */
function scriptArray(name) {
  const m = new RegExp(`\\n${name}=\\(([\\s\\S]*?)\\n\\)`).exec(SCRIPT_TEXT);
  assert.ok(m, `${name} array not found in vercel-ignore-build.sh`);
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}
const NON_BUILD_INPUTS = scriptArray("NON_BUILD_INPUTS");
const NON_BUILD_GLOBS = scriptArray("NON_BUILD_GLOBS");

/** (a) Real public reader inputs: [repo path, a source file that reads it at build time, the string it reads by]. */
const PUBLIC_READER_INPUTS = [
  ["app/public/data/nfl/schedule/latest.json", "app/src/app/nfl/page.tsx", "nfl/schedule/latest.json"],
  ["app/public/data/nba/schedule/latest.json", "app/src/lib/sport-hub/nba-hub.ts", "nba/schedule/latest.json"],
  ["app/public/data/admin/model-health.json", "app/src/lib/top-reads.ts", "public/data/admin/model-health.json"],
];

/** One concrete, real-looking file for every NON_BUILD_INPUTS prefix and NON_BUILD_GLOBS glob the script lists. */
function representativeNonInput(entry) {
  if (entry.endsWith("/")) return `${entry}heartbeat.json`;
  if (entry.includes("*")) {
    return entry
      .replace("app/**/*.test.mjs", "app/src/lib/some-guard.test.mjs")
      .replace("app/e2e/**", "app/e2e/freshness.spec.ts")
      .replace("app/scripts/ci/**", "app/scripts/ci/run-suite.mjs");
  }
  return entry;
}
const NON_INPUT_FILES = [...NON_BUILD_INPUTS, ...NON_BUILD_GLOBS].map(representativeNonInput);

const stamped = (at, extra = {}) => JSON.stringify({ generatedAt: at, checkedAt: at, rows: [{ id: 1, value: 0.5 }], ...extra }, null, 2);
const T0 = "2026-10-19T12:00:00.000Z";
const T1 = "2026-10-19T12:05:00.000Z";
const SLO = (over = {}) => JSON.stringify({ kind: "publication-slo", date: "2026-10-19", platformState: "PUBLISHING", checkedAt: T0, ...over }, null, 2);

let repo;
let baseSha;
const shas = {};

function git(args) {
  const r = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
  assert.equal(r.status, 0, `git ${args.join(" ")} failed: ${r.stderr}`);
  return r.stdout.trim();
}

function write(rel, content) {
  const p = path.join(repo, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

/** A single-commit scenario on top of the deployed base (every verdict below uses PREVIOUS_SHA = base). */
function scenario(label, files) {
  git(["checkout", "-q", baseSha]);
  for (const [rel, content] of Object.entries(files)) write(rel, content);
  git(["add", "-A"]);
  git(["commit", "-q", "-m", label, "--no-gpg-sign"]);
  shas[label] = git(["rev-parse", "HEAD"]);
}

function verdict(label, env = {}) {
  git(["checkout", "-q", shas[label]]);
  const r = spawnSync("bash", [SCRIPT], {
    cwd: path.join(repo, "app"),
    encoding: "utf8",
    env: { ...process.env, VERCEL_PROJECT_PRODUCTION_URL: "", VERCEL_FORCE_BUILD: "", VERCEL_GIT_PREVIOUS_SHA: baseSha, ...env },
  });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

before(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-ignore-mutation-"));
  git(["init", "-q"]);
  git(["config", "user.email", "test@test.invalid"]);
  git(["config", "user.name", "fixture"]);
  // Base = a deployed tree holding every file the scenarios touch, so each scenario is a MODIFY (the stamp-only shape).
  write("app/src/page.tsx", "v1");
  write("docs/NOTES.md", "v1");
  write("scripts/ops-tool.mjs", "v1");
  write(".github/workflows/writer.yml", "on: push\n");
  write("data/internal/mlb/pregame-archive/freezes/2026-10-19/1.json", stamped(T0));
  write("app/public/data/ops/publication-slo.json", SLO());
  for (const [rel] of PUBLIC_READER_INPUTS) write(rel, stamped(T0));
  for (const rel of NON_INPUT_FILES) write(rel, rel.endsWith(".json") ? stamped(T0) : "// v1\n");
  // The SLO clause shells out to the real helper; copy it and its only import so the fixture runs the real comparison.
  for (const rel of ["app/scripts/ops/publication-slo-public-changed.mjs", "app/src/lib/ops/stamp-only-gate.mjs"]) {
    write(rel, fs.readFileSync(path.join(ROOT, rel), "utf8"));
  }
  git(["add", "-A"]);
  git(["commit", "-q", "-m", "deployed-base", "--no-gpg-sign"]);
  baseSha = git(["rev-parse", "HEAD"]);

  for (const [rel] of PUBLIC_READER_INPUTS) {
    scenario(`content:${rel}`, { [rel]: stamped(T0, { rows: [{ id: 1, value: 0.61 }] }) });
    scenario(`stamp:${rel}`, { [rel]: stamped(T1) });
  }
  scenario("docs-only", { "docs/NOTES.md": "v2", "docs/cost/NEW.md": "new" });
  scenario("root-scripts-only", { "scripts/ops-tool.mjs": "v2" });
  scenario("github-only", { ".github/workflows/writer.yml": "on: [push, workflow_dispatch]\n" });
  scenario("docs+scripts+github", { "docs/NOTES.md": "v3", "scripts/ops-tool.mjs": "v3", ".github/workflows/writer.yml": "on: {}\n" });
  scenario("internal-unread-stamp", { "data/internal/mlb/pregame-archive/freezes/2026-10-19/1.json": stamped(T1) });
  for (const rel of NON_INPUT_FILES) scenario(`non-input-stamp:${rel}`, { [rel]: rel.endsWith(".json") ? stamped(T1) : "// v2\n" });
  scenario("all-non-inputs-stamp", Object.fromEntries(NON_INPUT_FILES.map((rel) => [rel, rel.endsWith(".json") ? stamped(T1) : "// v3\n"])));
  scenario("slo-checkedAt-only", { "app/public/data/ops/publication-slo.json": SLO({ checkedAt: T1 }) });
  scenario("slo-public-field", { "app/public/data/ops/publication-slo.json": SLO({ platformState: "PUBLISHED", checkedAt: T1 }) });
  scenario("docs+one-reader-input", { "docs/NOTES.md": "v4", [PUBLIC_READER_INPUTS[0][0]]: stamped(T0, { rows: [] }) });
});

after(() => fs.rmSync(repo, { recursive: true, force: true }));

// ── (a) genuine public data inputs ⇒ BUILD ───────────────────────────────────────────────────────

test("(a) the public reader paths used here are real: each file exists and its reader names it", () => {
  for (const [rel, reader, needle] of PUBLIC_READER_INPUTS) {
    assert.ok(fs.existsSync(path.join(ROOT, rel)), `${rel} must exist in the repo — otherwise this mutation is vacuous`);
    assert.ok(fs.readFileSync(path.join(ROOT, reader), "utf8").includes(needle), `${reader} no longer reads ${needle}; pick a current reader`);
  }
});

test("(a) a content change to a file a public page reads ⇒ BUILD", () => {
  for (const [rel] of PUBLIC_READER_INPUTS) {
    const r = verdict(`content:${rel}`);
    assert.equal(r.status, 1, `${rel} is read by a public page — a content change must BUILD: ${r.out}`);
    assert.match(r.out, /build inputs changed/);
  }
});

test("(a) a docs commit in the same push cannot hide a reader-input change ⇒ BUILD", () => {
  assert.equal(verdict("docs+one-reader-input").status, 1);
});

test("(a/c converse) a STAMP-ONLY change to a reader input still BUILDS — the script never inspects content", () => {
  // This is why stamp-only suppression (#1088) lives in the writer, not here: the ignore step is a path rule.
  for (const [rel] of PUBLIC_READER_INPUTS) assert.equal(verdict(`stamp:${rel}`).status, 1, `${rel}: stamp-only change to an input must BUILD`);
});

// ── (b) docs-only / repo-root scripts / .github-only ⇒ SKIP ────────────────────────────────────────

test("(b) docs-only, repo-root scripts/-only, .github/-only, and all three together ⇒ SKIP", () => {
  for (const label of ["docs-only", "root-scripts-only", "github-only", "docs+scripts+github"]) {
    const r = verdict(label);
    assert.equal(r.status, 0, `${label} touches nothing the build reads — must SKIP: ${r.out}`);
    assert.match(r.out, /skipping build/);
  }
});

// ── (c) stamp-only change in every path the script treats as non-input ⇒ SKIP ─────────────────────

test("(c) every NON_BUILD_INPUTS / NON_BUILD_GLOBS entry is exercised (parsed from the script)", () => {
  assert.ok(NON_BUILD_INPUTS.length >= 2 && NON_BUILD_GLOBS.length >= 3, "the script's non-input arrays were not parsed");
  assert.equal(NON_INPUT_FILES.length, NON_BUILD_INPUTS.length + NON_BUILD_GLOBS.length);
  for (const f of NON_INPUT_FILES) assert.ok(f.startsWith("app/") && !f.includes("*"), `no representative file for ${f}`);
});

test("(c) a stamp-only change to each non-input path ⇒ SKIP, one at a time and all at once", () => {
  for (const rel of NON_INPUT_FILES) {
    const r = verdict(`non-input-stamp:${rel}`);
    assert.equal(r.status, 0, `${rel} is a declared non-input — a stamp-only change must SKIP: ${r.out}`);
  }
  assert.equal(verdict("all-non-inputs-stamp").status, 0);
});

test("(c) stamp-only churn in an unlisted data/internal path ⇒ SKIP", () => {
  assert.equal(verdict("internal-unread-stamp").status, 0);
});

test("(c) publication-slo.json: a checkedAt-only change ⇒ SKIP; a public field change ⇒ BUILD", () => {
  const stampOnly = verdict("slo-checkedAt-only");
  assert.equal(stampOnly.status, 0, `checkedAt is not a public field — must SKIP: ${stampOnly.out}`);
  const publicField = verdict("slo-public-field");
  assert.equal(publicField.status, 1, `platformState is read by Home/MLB — must BUILD: ${publicField.out}`);
  assert.match(publicField.out, /publication-SLO/);
});

test("(c) the SLO comparison fails toward BUILDING when its helper is missing", () => {
  git(["checkout", "-q", shas["slo-checkedAt-only"]]);
  const helper = path.join(repo, "app/scripts/ops/publication-slo-public-changed.mjs");
  const saved = fs.readFileSync(helper, "utf8");
  fs.rmSync(helper);
  try {
    const r = verdict("slo-checkedAt-only");
    assert.equal(r.status, 1, `an uncomparable SLO change must BUILD: ${r.out}`);
  } finally {
    fs.writeFileSync(helper, saved);
  }
});

// ── (d) unknown previous SHA ⇒ BUILD ─────────────────────────────────────────────────────────────

test("(d) unknown, missing or malformed previous SHA ⇒ BUILD even for a docs-only push", () => {
  for (const prev of ["", "0000000000000000000000000000000000000000", "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef", "not-a-sha"]) {
    const r = verdict("docs-only", { VERCEL_GIT_PREVIOUS_SHA: prev });
    assert.equal(r.status, 1, `PREVIOUS_SHA=${JSON.stringify(prev)} must BUILD: ${r.out}`);
  }
  const unset = spawnSync("bash", [SCRIPT], {
    cwd: path.join(repo, "app"),
    encoding: "utf8",
    env: Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("VERCEL_"))),
  });
  assert.equal(unset.status, 1, "VERCEL_GIT_PREVIOUS_SHA unset must BUILD");
});
