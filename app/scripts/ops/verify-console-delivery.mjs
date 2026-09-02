#!/usr/bin/env node
/**
 * PROTECTED-CONSOLE DELIVERY VERIFIER — three questions that are not the same question.
 *
 *   node app/scripts/ops/verify-console-delivery.mjs [--json] [--strict]
 *
 * Program 232 · Release B. `verify-admin-access.mjs` proves the security boundary: an
 * unauthenticated request is denied before content bytes, and the public domain still 404s. It has
 * passed every time it has been run, and it is not the whole question.
 *
 * The console's newest deployment was TWENTY DAYS OLD. Every panel built since — the derived
 * incident register, the founder decision packets, four programs of evidence sections — existed in
 * the repository, passed its guards, and had never reached the person the console is for. The
 * boundary verifier said PASS the entire time, correctly, because "is it protected" and "is it
 * current" are different questions and only one of them was being asked.
 *
 * So this reports THREE dimensions separately and refuses to collapse them:
 *
 *   APPLICATION_READY   the internal build contains /launch and the public build prunes it
 *   HOST_CONFIGURED     an unauthenticated request is denied at the edge (delegated, not re-proven)
 *   CONTENT_CURRENT     the deployed build is the commit the repository is on
 *
 * NO SECRET VALUES. It reads no credential, and it prints no deployment URL — the ADR keeps that out
 * of this repository, and a verifier that leaks the address it verifies has failed differently.
 *
 * CONTENT_CURRENT is UNKNOWN without an authenticated session, and UNKNOWN is reported as UNKNOWN.
 * `--strict` treats it as failure, because "we could not tell" is what twenty days of staleness
 * looked like from outside.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.join(APP, "..");
const argv = process.argv.slice(2);
const asJson = argv.includes("--json");
const strict = argv.includes("--strict");

/** The internal routes the console is made of. */
const INTERNAL = ["launch", "ops", "preview"];

function applicationReady() {
  /* Read from source, not from a build: this dimension is about whether the app CAN be delivered
     protected, which is true or false regardless of what happens to be in out/ right now. */
  const prune = path.join(APP, "scripts", "prune-internal-routes.mjs");
  if (!fs.existsSync(prune)) return { state: "FAIL", detail: "no prune script — the public build has nothing removing internal routes" };
  const src = fs.readFileSync(prune, "utf8");
  const missing = INTERNAL.filter((r) => !new RegExp(`"${r}"`).test(src));
  if (missing.length) return { state: "FAIL", detail: `prune script does not name ${missing.join(", ")}` };
  if (!/NEXT_PUBLIC_INTERNAL_ROUTES/.test(src)) {
    return { state: "FAIL", detail: "no internal-build escape hatch — the console could never be built for delivery" };
  }
  const page = path.join(APP, "src", "app", "launch", "page.tsx");
  if (!fs.existsSync(page)) return { state: "FAIL", detail: "no /launch page exists" };
  return { state: "PASS", detail: `internal routes (${INTERNAL.join(", ")}) are pruned from the public build and kept under NEXT_PUBLIC_INTERNAL_ROUTES=1` };
}

function hostConfigured() {
  /* Delegated on purpose. Re-proving the deny boundary here would be a second opinion about the one
     thing that already has an owner, and two verifiers disagreeing about security is worse than one. */
  const verifier = path.join(APP, "scripts", "ops", "verify-admin-access.mjs");
  return fs.existsSync(verifier)
    ? { state: "DELEGATED", detail: "run scripts/ops/verify-admin-access.mjs --url <private host> — it owns the deny-boundary proof" }
    : { state: "FAIL", detail: "the deny-boundary verifier is missing" };
}

/** Local HEAD — what the console WOULD serve if it were redeployed now. */
function headCommit() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  } catch { return null; }
}

/**
 * Is the deployed console the commit this repository is on?
 *
 * Answerable only with an authenticated Vercel session. Absent one this is UNKNOWN — never PASS.
 * The whole failure being prevented is a green report over a stale deployment.
 */
function contentCurrent() {
  /* The ADR keeps the link at `app/.vercel/`, gitignored; check the repo root too rather than
     reporting UNKNOWN because the link sat one directory over. */
  const link = [path.join(APP, ".vercel", "project.json"), path.join(ROOT, ".vercel", "project.json")]
    .find((p) => fs.existsSync(p));
  if (!link) {
    return { state: "UNKNOWN", detail: "no Vercel project link in this checkout — deployment age cannot be read here" };
  }
  let project = null;
  try { project = JSON.parse(fs.readFileSync(link, "utf8")).projectName ?? null; } catch { /* unreadable link */ }
  /* The CLI prints its TABLE to stderr and only the bare URLs to stdout, so reading stdout alone
     found no ages and reported UNKNOWN over a listing that was right there. Both streams. */
  const run = spawnSync("npx", ["vercel", "ls", project ?? "", "--yes"], {
    cwd: path.dirname(path.dirname(link)), encoding: "utf8", timeout: 240_000,
  });
  const listing = `${run.stdout ?? ""}\n${run.stderr ?? ""}`;
  if (run.status !== 0 || !/Deployments for/i.test(listing)) {
    return { state: "UNKNOWN", detail: `no authenticated Vercel session — deployment age for ${project ?? "the linked project"} cannot be read` };
  }
  /* Ages only. The URLs in this listing are the private host and must not be printed. */
  const ages = [...listing.matchAll(/^\s{2,}(\d+[smhdw])\s{2,}\S/gm)].map((m) => m[1]);
  if (!ages.length) return { state: "UNKNOWN", detail: "no production deployment found for the linked project" };
  const newest = ages[0];
  const days = /^(\d+)d$/.test(newest) ? Number(newest.slice(0, -1)) : 0;
  return days >= 1
    ? { state: days >= 7 ? "STALE" : "AGEING", detail: `newest protected deployment is ${newest} old; the runbook in docs/ADMIN_DEPLOYMENT_GTP_OPS.md redeploys it` }
    : { state: "CURRENT", detail: `newest protected deployment is ${newest} old` };
}

const report = {
  artifact: "protected-console-delivery",
  head: headCommit(),
  applicationReady: applicationReady(),
  hostConfigured: hostConfigured(),
  contentCurrent: contentCurrent(),
};

const bad = report.applicationReady.state === "FAIL" || report.hostConfigured.state === "FAIL";
const unknownOrStale = ["UNKNOWN", "STALE", "AGEING"].includes(report.contentCurrent.state);
report.verdict = bad ? "REFUSED" : unknownOrStale ? "PARTIAL" : "PASS";

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log("PROTECTED CONSOLE DELIVERY");
  for (const k of ["applicationReady", "hostConfigured", "contentCurrent"]) {
    console.log(`  ${report[k].state.padEnd(10)} ${k} — ${report[k].detail}`);
  }
  console.log(`\n  verdict: ${report.verdict}`);
  if (report.verdict !== "PASS") {
    console.log("  (PARTIAL means the app and the boundary are fine and the DEPLOYED CONTENT is not proven current.)");
  }
}

process.exit(bad || (strict && report.verdict !== "PASS") ? 1 : 0);
