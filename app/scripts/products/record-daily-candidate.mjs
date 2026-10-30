#!/usr/bin/env node
/**
 * DAILY BANK BUILDER / MOONSHOT CANDIDATE · pregame receipt writer (P0-E).
 *
 *   cd app && npx tsx scripts/products/record-daily-candidate.mjs --out <private dir> [--product bank-builder|moonshot|both]
 *       [--as-of <ISO>] [--status published]
 *
 * Runs the same evaluation the pages render (lib/products/daily-candidates/load.mjs dailyCandidateForPage), freezes it
 * as a write-once receipt (receipt.mjs) and, with --status, appends that status to the receipts' status log. A CANDIDATE
 * receipt holds sportsbook prices, which provider terms forbid publishing, so --out must be outside every git repository
 * (the repository is public). The as-of defaults to the build stamp; the writer's own clock is used only for the
 * pregame check. Reads no key itself (prices are readable only when the build environment carries the display key).
 * Not wired into any workflow: scheduling it is a founder decision.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertPrivateOutDir } from "../social/nba-line-graphics-io.mjs";
import { dailyCandidateForPage, loadDailyCandidateInputs } from "../../src/lib/products/daily-candidates/load.mjs";
import { makeDailyCandidateReceipt, writeReceiptOnce, appendStatusEvent } from "../../src/lib/products/daily-candidates/receipt.mjs";

export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith("--")) throw new Error(`unexpected argument ${argv[i]}`);
    out[argv[i].slice(2)] = argv[i + 1];
  }
  return out;
}

export function recordDailyCandidates(args, { nowIso = new Date().toISOString(), env = process.env } = {}) {
  if (!args.out) throw new Error("--out <dir outside every git repository> is required");
  const dir = assertPrivateOutDir(args.out);
  const products = !args.product || args.product === "both" ? ["bank-builder", "moonshot"] : [args.product];
  const out = [];
  for (const product of products) {
    const result = dailyCandidateForPage(product, { ...(args["as-of"] ? { asOf: args["as-of"] } : {}), env });
    const { inputs } = loadDailyCandidateInputs({ appRoot: process.cwd(), productDay: result.productDay, asOf: result.asOf, env });
    const receipt = makeDailyCandidateReceipt(result);
    const w = writeReceiptOnce(dir, receipt, { inputs, nowIso });
    const status = args.status ? appendStatusEvent(dir, receipt, { status: args.status, at: nowIso }) : null;
    out.push({ product, kind: receipt.kind, receiptId: receipt.receiptId, file: w.file, written: w.written, status: status?.status ?? "draft" });
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(recordDailyCandidates(parseArgs(process.argv.slice(2))), null, 2)}\n`); }
  catch (e) { process.stderr.write(`record-daily-candidate: ${e.message}\n`); process.exit(1); }
}
