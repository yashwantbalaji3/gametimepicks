/**
 * NFL · A PUBLIC PAGE STANDS ON THE RECORD, NEVER ON AN EXCLUDED COPY (2026-10-26, #1253).
 *
 * frozen-latest.json / latest.json are written by the event windows and are never rewritten for a past game. A public
 * copy of an EXCLUDED revision (record-exclusions.mjs — e.g. PIT @ NO 401873011-rev-1329Z, a pre-kickoff label on
 * post-kickoff inputs) therefore stays in them. Every reader resolves such a copy to the exclusion's `recordInstead`
 * receipt, read from the committed receipts tree (a BUILD_INPUT; archived-forecast.ts reads it the same way) and published
 * exactly as the producer publishes a receipt. If that receipt is unreadable, another event, or not itself eligible, the
 * resolver returns null and the caller keeps the copy while the official snapshot refuses it (fails closed).
 *
 * Server / build-time only (reads the filesystem).
 */
import fs from "node:fs";
import path from "node:path";

import { exclusionFor } from "./record-exclusions.mjs";
import { isRecordEligible } from "./record-eligibility.mjs";

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

/**
 * @param {object} forecast a public forecast entry
 * @param {string} repoRoot the repository root
 * @returns {object|null} the forecast to show (itself when not excluded), or null when its record cannot be read
 */
export function publicRecordOf(forecast, repoRoot) {
  const ex = exclusionFor(forecast);
  if (!ex) return forecast;
  const r = readJson(path.join(repoRoot, ex.recordInstead));
  if (!r || String(r.providerEventId) !== String(forecast.providerEventId) || !isRecordEligible(r)) return null;
  const f = { ...r };
  delete f.revisionOf; delete f.priorInputHash; delete f.inputs;
  return f;
}

/** A `resolve` for unionFrozenForecasts: repoRoot defaults to the app's parent (pages build with cwd = app/). */
export const nflPublicRecordResolver = (repoRoot = path.resolve(process.cwd(), "..")) => (f) => publicRecordOf(f, repoRoot) ?? f;
