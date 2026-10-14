#!/usr/bin/env node
/**
 * vercel-ignore-build.sh helper (COST-001 Stage B, 2026-10-14): did the publication-SLO fields a PUBLIC page
 * reads change between two commits?
 *
 * app/public/data/ops/ is excluded from the build trigger (it is pruned from the export), but
 * lib/ops/read-publication-slo.ts reads ops/publication-slo.json at BUILD time and Home/MLB render its
 * deadline. Its `checkedAt` moves on every run, so a path rule would build constantly; this compares only
 * the public projection (lib/ops/stamp-only-gate.mjs PUBLICATION_SLO_PUBLIC_FIELDS).
 *
 *   exit 0  the public fields are identical — the deploy trigger may keep skipping
 *   exit 1  they changed — build
 *   exit 2  could not compare (missing file at either commit, unreadable JSON, git error) — build
 *
 *   node app/scripts/ops/publication-slo-public-changed.mjs <base-sha> <head-sha>
 */
import { execFileSync } from "node:child_process";
import { publicSloKey, PUBLICATION_SLO_PATH } from "../../src/lib/ops/stamp-only-gate.mjs";

const [base, head] = process.argv.slice(2);
const at = (rev) => execFileSync("git", ["show", `${rev}:${PUBLICATION_SLO_PATH}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
let code = 2;
try {
  const a = publicSloKey(at(base));
  const b = publicSloKey(at(head));
  code = a != null && b != null ? (a === b ? 0 : 1) : 2;
} catch { code = 2; }
process.exit(code);
