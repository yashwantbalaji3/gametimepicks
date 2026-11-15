/**
 * NFL QB PROPS · ELIGIBILITY AT FREEZE — the record the grader's confirmatory filter reads
 * (lib/sports/nfl/qb-props-eligibility.mjs explains why it exists and what "at freeze" means).
 *
 *   node scripts/nfl/build-qb-props-eligibility.mjs [--write] [--history]
 *
 * For every shadow receipt frozen before its kickoff (from FROM_DATE), each projected QB is resolved under eligibility@1
 * against the injuries + roster captures the receipt pins. Sources, in order:
 *   injuries  data/internal/research/injuries/nfl/latest.json when its generatedAt is the pinned stamp; with --history,
 *             the committed version of that file whose generatedAt is the pinned stamp (git log; for backfill — the
 *             workflow runs right after the receipts are written, when latest.json is the pinned capture)
 *   roster    app/public/data/nfl/rosters/capture-*.json (or latest.json) whose generatedAt is the pinned stamp
 * A pinned capture that is not found is reported and skipped (the row stays PENDING). Reads no outcome. Append-only.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readShadowReceipts } from "../../src/lib/sports/nfl/sim-v2/public-receipt.mjs";
import { FROM_DATE } from "../../src/lib/sports/nfl/qb-props-grade.mjs";
import { ELIGIBILITY_AT_FREEZE_REL, loadEligibilityRecord, mergeRecord, pinnedAvailability, resolveReceiptQbs } from "../../src/lib/sports/nfl/qb-props-eligibility.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.join(APP, "..");
const INJ_REL = "data/internal/research/injuries/nfl/latest.json";
const ROSTER_DIR = path.join(APP, "public/data/nfl/rosters");
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const ms = (iso) => { const t = Date.parse(String(iso ?? "").replace(/T(\d\d):(\d\d)Z$/, "T$1:$2:00Z")); return Number.isFinite(t) ? t : null; };

const useHistory = process.argv.includes("--history");
const latestInj = readJson(path.join(ROOT, INJ_REL));
let histIndex = null; // generatedAt → commit
const git = (args) => spawnSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
function injuriesAt(stamp) {
  if (latestInj?.generatedAt === stamp) return latestInj;
  if (!useHistory) return null;
  if (!histIndex) {
    histIndex = new Map();
    const log = git(["log", "--format=%H", "--", INJ_REL]);
    for (const h of log.stdout.split("\n").filter(Boolean)) {
      const r = git(["show", `${h}:${INJ_REL}`]);
      if (r.status !== 0) continue;
      const m = /"generatedAt"\s*:\s*"([^"]+)"/.exec(r.stdout.slice(0, 2000));
      if (m && !histIndex.has(m[1])) histIndex.set(m[1], h);
    }
  }
  const h = histIndex.get(stamp);
  if (!h) return null;
  try { return JSON.parse(git(["show", `${h}:${INJ_REL}`]).stdout); } catch { return null; }
}
const rosterCache = new Map();
function rosterAt(stamp) {
  if (rosterCache.has(stamp)) return rosterCache.get(stamp);
  const t = ms(stamp);
  const iso = t == null ? null : new Date(t).toISOString();
  const name = iso ? `capture-${iso.slice(0, 13)}${iso.slice(14, 16)}.json` : null;
  let r = name ? readJson(path.join(ROSTER_DIR, name)) : null;
  if (r?.generatedAt !== stamp) { const l = readJson(path.join(ROSTER_DIR, "latest.json")); r = l?.generatedAt === stamp ? l : null; }
  rosterCache.set(stamp, r);
  return r;
}

const additions = [];
const missing = {};
let receipts = 0;
for (const { receipt } of readShadowReceipts(ROOT)) {
  if (String(receipt?.generatedAt ?? "").slice(0, 10) < FROM_DATE) continue;
  if (!(ms(receipt.generatedAt) < ms(receipt.eventStart))) continue;
  if (!pinnedAvailability(receipt)) { missing.RECEIPT_PINS_NO_AVAILABILITY = (missing.RECEIPT_PINS_NO_AVAILABILITY ?? 0) + 1; continue; }
  receipts += 1;
  const r = resolveReceiptQbs({ receipt, injuriesAt, rosterAt });
  if (r.missing) { const k = r.missing.split(" ")[0]; missing[k] = (missing[k] ?? 0) + 1; continue; }
  additions.push(...r.entries);
}
const previous = loadEligibilityRecord(ROOT);
const { record, added, conflicts } = mergeRecord(previous, additions);
const states = {};
for (const v of Object.values(record.entries)) states[v.state] = (states[v.state] ?? 0) + 1;
console.log(JSON.stringify({ receiptsConsidered: receipts, resolvedNow: additions.length, added, conflicts: conflicts.length, missing, recordStates: states }));
if (conflicts.length) console.error(`NOTE: ${conflicts.length} existing key(s) re-resolved differently; kept as recorded (append-only): ${conflicts.slice(0, 5).join(", ")}`);
if (process.argv.includes("--write")) {
  const out = path.join(ROOT, ELIGIBILITY_AT_FREEZE_REL);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(record, null, 1)}\n`);
  console.log(`wrote ${ELIGIBILITY_AT_FREEZE_REL}`);
}
