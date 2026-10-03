#!/usr/bin/env node
/**
 * NBA FORECAST RECEIPTS — the commit-time guard (Session 10 · G7). Plain node, no dependencies.
 *
 *   node app/scripts/nba/verify-nba-forecast-receipts.mjs [--against <git ref>]
 *
 * For every forecast date file of every family:
 *   · each game that carries a receipt must still match it (payloadSha256, event id, written before tip);
 *   · with --against <ref> (the workflows pass HEAD, i.e. what is already committed), every game present at
 *     that ref must be present and byte-identical (canonically) in the working tree — a forecast, once
 *     committed, is never rewritten or removed, by this writer or any other.
 * Games written before receipts existed (LEGACY_NO_RECEIPT) are counted, never re-stamped.
 *
 * Exit 0 intact · 1 a frozen game was rewritten/removed or a receipt is broken · 2 usage.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { FAMILIES } from "../../src/lib/sports/nba/experimental-forecast.mjs";
import { receiptIntegrity, frozenGameViolations } from "../../src/lib/sports/nba/forecast-receipt.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const arg = (n) => { const i = process.argv.indexOf(n); return i === -1 ? null : process.argv[i + 1] ?? null; };
const AGAINST = arg("--against");
if (process.argv.includes("--against") && !AGAINST) { console.error("usage: --against <git ref>"); process.exit(2); }

const problems = [];
let files = 0, games = 0, legacy = 0, checkedAgainstRef = 0;
for (const fam of Object.values(FAMILIES)) {
  const rel = path.join("data", "internal", "research", "nba", fam.dir, "forecasts");
  const dir = path.join(REPO, rel);
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x)).sort()) {
    files += 1;
    const relFile = path.join(rel, f);
    let doc;
    try { doc = JSON.parse(fs.readFileSync(path.join(REPO, relFile), "utf8")); } catch (e) { problems.push(`${relFile}: unreadable (${e.message})`); continue; }
    for (const g of doc.games ?? []) {
      games += 1;
      const r = receiptIntegrity(g);
      if (r.state === "LEGACY_NO_RECEIPT") legacy += 1;
      else if (r.state !== "OK") problems.push(`${relFile} ${g.providerEventId}: ${r.problems.join("; ")}`);
    }
    if (AGAINST) {
      let before = null;
      try { before = JSON.parse(execFileSync("git", ["-C", REPO, "show", `${AGAINST}:${relFile.split(path.sep).join("/")}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 })); }
      catch { before = null; } // not committed at that ref yet: nothing frozen to compare
      if (before) {
        checkedAgainstRef += 1;
        for (const v of frozenGameViolations({ before, after: doc })) problems.push(`${relFile}: ${v} (vs ${AGAINST})`);
      }
    }
  }
}
console.log(`nba forecast receipts: ${files} date file(s) · ${games} game(s) · ${legacy} legacy (pre-receipt) · ${AGAINST ? `${checkedAgainstRef} compared with ${AGAINST}` : "no ref comparison"}`);
if (problems.length) { for (const p of problems) console.error(`VIOLATION: ${p}`); process.exit(1); }
console.log("intact");
