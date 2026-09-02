/**
 * "PROTECTED" AND "CURRENT" ARE DIFFERENT QUESTIONS — Program 232 · Release B.
 *
 * Run: npx tsx --test src/lib/launch/console-delivery.test.mjs
 *
 * `verify-admin-access.mjs` proves the security boundary and has passed every time it has been run.
 * It was passing while the protected console served a build TWENTY DAYS OLD — four programs of
 * panels, the derived incident register and both founder decision packets existed in the repository,
 * passed their guards, and had never reached the person the console is for.
 *
 * Nothing was broken. Nothing was measuring delivery. A green boundary report over a stale
 * deployment is the exact shape of "green but broken" this repository keeps rediscovering, and the
 * only reason it went unnoticed for twenty days is that no question was being asked.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const APP = process.cwd();
const SCRIPT = path.join(APP, "scripts/ops/verify-console-delivery.mjs");

function run(args = []) {
  const r = spawnSync("node", [SCRIPT, ...args], { encoding: "utf8", timeout: 300_000 });
  return { out: `${r.stdout ?? ""}${r.stderr ?? ""}`, status: r.status };
}

test("the three dimensions are reported SEPARATELY and never collapsed", () => {
  const { out } = run();
  for (const dim of ["applicationReady", "hostConfigured", "contentCurrent"]) {
    assert.match(out, new RegExp(dim), `${dim} must be reported in its own right`);
  }
  /*
   * The claim that matters: a passing boundary cannot produce an overall PASS on its own. That
   * conflation is what twenty days of staleness looked like from outside.
   */
  const currentLine = out.split("\n").find((l) => l.includes("contentCurrent")) ?? "";
  if (/UNKNOWN|STALE|AGEING/.test(currentLine)) {
    assert.match(out, /verdict: PARTIAL/, "unproven currency may not report PASS");
  }
});

test("IT PRINTS NO DEPLOYMENT URL — a verifier that leaks its target has failed differently", () => {
  /*
   * The ADR deliberately keeps the private host out of this repository. The listing this script
   * reads is full of that host; it must extract ages and nothing else.
   */
  const { out } = run();
  assert.ok(!/https?:\/\/[^\s]*vercel\.app/.test(out), "a private deployment host appeared in the output");
  assert.ok(!/\bprj_[A-Za-z0-9]/.test(out) && !/\bteam_[A-Za-z0-9]/.test(out), "no project or team id may be printed");
});

test("no secret is read, and nothing is deployed", () => {
  const src = fs.readFileSync(SCRIPT, "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/\/\/.*$/gm, "");
  for (const forbidden of ["process.env.VERCEL_TOKEN", "--token", "writeFileSync", "vercel deploy", "vercel build"]) {
    assert.ok(!code.includes(forbidden), `a delivery VERIFIER must not ${forbidden}`);
  }
  /* Read-only against the CLI: listing only. */
  assert.match(code, /"vercel", "ls"/, "it lists; it does not act");
});

test("UNKNOWN is reported as UNKNOWN, never as PASS", () => {
  /*
   * Currency cannot be proven without an authenticated session. "We could not tell" and "it is
   * current" are different answers, and only one of them is true when nobody has deployed in weeks.
   */
  const src = fs.readFileSync(SCRIPT, "utf8");
  assert.match(src, /state: "UNKNOWN"/, "an unprovable dimension has an UNKNOWN state");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  assert.match(code, /unknownOrStale/, "and UNKNOWN participates in the verdict rather than being ignored");
});

test("the runbook it points at actually exists", () => {
  /* A verifier whose remediation is a dead path tells an operator to do nothing. */
  const doc = path.join(APP, "..", "docs", "ADMIN_DEPLOYMENT_GTP_OPS.md");
  assert.ok(fs.existsSync(doc), "the redeploy runbook named in the STALE message must exist");
  const text = fs.readFileSync(doc, "utf8");
  assert.match(text, /vercel deploy --prebuilt --prod/, "and must contain the redeploy command");
});
