#!/usr/bin/env node
/**
 * PRICE-ONLY REFRESH of one approved NFL game post. BUILT, NOT ACTIVATED: no schedule or daily command calls it.
 *   cd app && npx tsx scripts/social/price-refresh.mjs --package <pkg.json> --capture <capture.json> --as-of <ISO> [--out <dir>] [--no-png]
 * Reads one package, its approval and a newer saved capture; no key, no network. The post is rebuilt from the same
 * sources, and refused (src/lib/social/price-refresh.mjs) unless only quote fields moved. A refresh goes to its own
 * folder, never over the package, and its new contentSha256 needs its own approval. Every attempt is appended to the
 * audit log. Exit: 0 refreshed or nothing to change; 1 refused.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assertPrivateOutDir, DEFAULT_PRIVATE_ROOT } from "./nba-line-graphics-io.mjs";
import { loadNflCaptures } from "./nfl-line-capture.mjs";
import { parseArgs, prepareNflGamePosts, withApprovedCaption, writePackages } from "./render-social-pack.mjs";
import { captureProblems, isApproved, priceRefreshProblems, quoteChanges } from "../../src/lib/social/price-refresh.mjs";

export const AUDIT_LOG = () => path.join(DEFAULT_PRIVATE_ROOT, "reports", "price-refresh-audit.jsonl");
const APPROVALS = () => path.join(DEFAULT_PRIVATE_ROOT, "approvals", "approved-for-clean-export.json");
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");

function defaultRebuild(pkg, { asOf }) {
  const { posts } = prepareNflGamePosts({ week: pkg.content.week, asOf, captures: loadNflCaptures() });
  const post = posts.find((p) => p.variant === pkg.variant);
  if (!post) return null;
  return [post, withApprovedCaption(post)].find((p) => p.caption === pkg.caption) ?? post;
}

/** The whole refresh with its effects injected. Always returns the audit entry it wrote. */
export async function refreshPrice({ pkg, ledger, capture, asOf, rebuild = defaultRebuild, write = writePackages, outRoot, audit = AUDIT_LOG(), png = true }) {
  const entry = { asOf, dedupeId: pkg.dedupeId, fromContentSha256: pkg.contentSha256, capture: { ref: capture.ref, sha256: capture.sha256, capturedAt: capture.capturedAt } };
  const finish = (status, o = {}) => {
    const row = { ...entry, status, ...o };
    fs.mkdirSync(path.dirname(audit), { recursive: true });
    fs.appendFileSync(audit, `${JSON.stringify(row)}\n`);
    return row;
  };
  if (!isApproved(pkg, ledger)) return finish("REFUSED", { problems: ["NOT_APPROVED"] });
  const late = captureProblems(pkg, { capturedAt: capture.capturedAt, asOf });
  if (late.length) return finish("REFUSED", { problems: late });
  const post = rebuild(pkg, { asOf });
  if (!post) return finish("REFUSED", { problems: ["POST_NOT_REBUILT"] });
  const problems = priceRefreshProblems(pkg, post);
  if (problems.length) return finish("REFUSED", { problems });
  const changes = quoteChanges(pkg, post);
  if (!changes.length) return finish("NO_CHANGE");
  const [{ file, pkg: next }] = await write([post], { outRoot, png });
  return finish("REFRESHED", { toContentSha256: next.contentSha256, file, changes, needsApproval: true });
}

async function main(argv) {
  const a = parseArgs(argv);
  for (const k of ["package", "capture", "as-of"]) if (!a[k]) throw new Error(`--${k} is required`);
  const bytes = fs.readFileSync(path.resolve(a.capture));
  const root = `${path.join(os.homedir(), "gtp-private")}${path.sep}`;
  if (!path.resolve(a.capture).startsWith(root)) throw new Error("--capture must name a capture under ~/gtp-private");
  const doc = JSON.parse(bytes.toString("utf8"));
  if (doc.artifact !== "nfl-odds-capture") throw new Error("--capture is not an NFL capture");
  const pkg = JSON.parse(fs.readFileSync(path.resolve(a.package), "utf8"));
  const stamp = a["as-of"].replace(/[:]/g, "");
  const outRoot = assertPrivateOutDir(a.out ?? path.join(DEFAULT_PRIVATE_ROOT, "price-refresh", stamp));
  if (path.resolve(outRoot) === path.join(DEFAULT_PRIVATE_ROOT, "packages")) throw new Error("a refresh never writes over the packages folder");
  const ledger = fs.existsSync(APPROVALS()) ? JSON.parse(fs.readFileSync(APPROVALS(), "utf8")) : null;
  const row = await refreshPrice({ pkg, ledger, capture: { ref: `gtp-private/${path.relative(root, path.resolve(a.capture))}`, sha256: sha(bytes), capturedAt: doc.capturedAt }, asOf: a["as-of"], outRoot, png: !a["no-png"] });
  console.log(JSON.stringify(row));
  return row.status === "REFUSED" ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).then((c) => process.exit(c), (e) => { console.error(`REFUSED: ${e.message}`); process.exit(1); });
