/**
 * build-info — stamp every build with the clock it was frozen at.
 *
 * WHY THIS EXISTS
 * The site is `output: "export"`, so `currentEtDate()` and every date-gated section is
 * frozen at BUILD time. That is a known, documented tradeoff (see daily-rebuild.yml). The
 * problem Sprint 032 found is narrower and worse: **nothing recorded when the build ran**,
 * so the age of the deployed clock was unknowable — to the founder, to /ops, and to the app
 * itself. "Is production's clock today?" could only be answered by archaeology across the
 * commit log, and the answer was a guess.
 *
 * This script makes that a measurement. Every build writes a marker carrying the build
 * timestamp, the frozen ET clock date, and the commit it was built from. Once deployed,
 * `verify-deployment.mjs` can fetch it from production and state — not infer — when prod
 * last built and from which SHA.
 *
 * TWO MODES (one source of truth, no drift):
 *   --emit    (pre-build)  compute once → app/.build-info.json (gitignored)
 *   --publish (post-build) copy that same file → out/data/build-info.json
 * next.config.mjs reads the emitted file to inject NEXT_PUBLIC_BUILD_* into the bundle, so
 * the timestamp in the JS bundle and the timestamp in the JSON are the same instant.
 *
 * NEVER touches source, public/data, money artifacts, or settlement. It writes exactly two
 * paths: app/.build-info.json (ignored) and out/data/build-info.json (build output).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

export const BUILD_INFO_FILE = ".build-info.json";
export const BUILD_INFO_SCHEMA = 1;

/** Best-effort git lookup. Returns null rather than throwing — a missing git dir is not a build failure. */
function git(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || null;
  } catch {
    return null;
  }
}

/**
 * Resolve the commit this build came from.
 *
 * On Vercel the checkout is often a detached/shallow clone, so prefer the platform's own
 * env vars and fall back to git. Returns nulls (never fabricated values) when unknown.
 */
function resolveCommit() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || git(["rev-parse", "HEAD"]);
  const message =
    process.env.VERCEL_GIT_COMMIT_MESSAGE || git(["log", "-1", "--format=%s"]) || null;
  const committedAt = git(["log", "-1", "--format=%cI"]);
  return {
    sha: sha || null,
    shortSha: sha ? sha.slice(0, 8) : null,
    // First line only. A full commit body carries newlines that wreck any single-line readout —
    // verify-deployment printed an entire message into its summary table on the first real deploy.
    message: message ? message.split("\n")[0].slice(0, 200) : null,
    committedAt: committedAt || null,
  };
}

/** The ET calendar date a build freezes into its HTML. Same derivation as `currentEtDate()`. */
function etDate(d) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function computeBuildInfo(now = new Date()) {
  const commit = resolveCommit();
  return {
    _note:
      "Build marker: when this static export was generated and from which commit. Written by scripts/build-info.mjs. Read-only; never a source of truth for money or slates.",
    schema: BUILD_INFO_SCHEMA,
    builtAt: now.toISOString(),
    // The frozen clock. Every server-rendered "today" in this build resolved to this date.
    buildEtDate: etDate(now),
    commit,
    // Which CI/host produced it, when that is knowable. Null locally.
    environment: process.env.VERCEL ? "vercel" : process.env.GITHUB_ACTIONS ? "github-actions" : "local",
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main() {
  const mode = process.argv[2];
  const cwd = process.cwd();
  const emitPath = path.join(cwd, BUILD_INFO_FILE);

  if (mode === "--emit") {
    const info = computeBuildInfo();
    fs.writeFileSync(emitPath, `${JSON.stringify(info, null, 2)}\n`);
    console.log(
      `[build-info] stamped ${info.buildEtDate} (${info.builtAt}) @ ${info.commit.shortSha ?? "unknown-sha"} [${info.environment}]`,
    );
    return;
  }

  if (mode === "--publish") {
    if (!fs.existsSync(emitPath)) {
      // Fail loudly: a published build with no marker is exactly the blind spot we are closing.
      console.error(`[build-info] ERROR: ${BUILD_INFO_FILE} missing — run \`--emit\` before \`next build\`.`);
      process.exit(1);
    }
    const outDir = path.join(cwd, "out");
    if (!fs.existsSync(outDir)) {
      console.log("[build-info] no out/ dir — nothing to publish");
      return;
    }
    const dest = path.join(outDir, "data", "build-info.json");
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(emitPath, dest);
    console.log("[build-info] published out/data/build-info.json");
    return;
  }

  console.error("usage: build-info.mjs --emit | --publish");
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
