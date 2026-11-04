#!/usr/bin/env node
/**
 * Build the day's suggested cards (Bank Builder, Moonshot, parlay tiers Low / Medium / High / Longshot; NBA-only and
 * cross-sport) from the leg pool. NETWORK-FREE, no credits, no price. See src/lib/products/leg-pool/.
 *
 *   npx tsx scripts/products/build-suggested-cards.mjs --date YYYY-MM-DD --now <ISO> [--write] [--out DIR]
 *
 * `--now` is the evaluation instant (time-lock): events at or inside 30 min of it are refused, and box scores captured
 * after it are not read. It is required, so the file is a pure function of (committed inputs, --now): re-running with
 * the same arguments writes identical bytes.
 * Writes <out>/<date>.json (default app/public/data/suggested-cards/), WRITE-ONCE: an existing file is never rewritten,
 * so the first generation is the day's record. Never writes latest.json.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildLegPool } from "../../src/lib/products/leg-pool/leg-pool.mjs";
import { dailySuggestedCards } from "../../src/lib/products/leg-pool/daily-cards.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO = path.resolve(APP, "..");
const arg = (k, d = null) => { const i = process.argv.indexOf(k); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(2); }
const DATE = arg("--date", new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(NOW)));
const OUT = path.resolve(arg("--out", path.join(APP, "public", "data", "suggested-cards")));

const doc = dailySuggestedCards(buildLegPool({ repoRoot: REPO, date: DATE, evaluatedAt: NOW }));
const s = (x) => `${x.state}${x.card ? ` ${x.card.tier} ${x.card.legs.length}L ${x.card.jointShown}` : ""}`;
console.log(`suggested cards ${DATE} @ ${NOW}`);
for (const [k, v] of Object.entries(doc.sports)) console.log(`  ${k.padEnd(8)} ${v.state.padEnd(9)} legs ${v.legPool.eligible} (tierable ${v.legPool.tierable}, review ${v.legPool.review}) refused ${v.legPool.refused}${v.playerProjections ? ` · players pass ${v.playerProjections.pass} review ${v.playerProjections.review} blocked ${v.playerProjections.blocked}` : ""}`);
console.log(`  bank-builder nba: ${s(doc.bankBuilder.nba)} · cross: ${s(doc.bankBuilder.cross)}`);
console.log(`  moonshot     nba: ${s(doc.moonshot.nba)} · cross: ${s(doc.moonshot.cross)}`);
for (const scope of ["nba", "cross"]) console.log(`  parlays ${scope.padEnd(5)} ${doc.parlays[scope].map((t) => `${t.tier}: ${s(t)}`).join(" · ")}`);
/* Never lock in an empty day (the v1.7 roll-time lesson): if the NBA schedule lists games for the date but the official
   lane is not there yet, or no sport has a single eligible leg, nothing is written and a later run can still publish. */
const scheduled = (() => {
  try {
    const et = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" });
    return JSON.parse(fs.readFileSync(path.join(APP, "public", "data", "nba", "schedule", "latest.json"), "utf8")).rows.filter((r) => et.format(new Date(r.dateUtc)) === DATE).length;
  } catch { return 0; }
})();
const anyActive = Object.values(doc.sports).some((v) => v.state === "active");
const holdReason = scheduled > 0 && doc.sports.nba?.state !== "active" ? `NBA lists ${scheduled} games for ${DATE} but its official input is ${doc.sports.nba?.state}` : !anyActive ? "no sport has an eligible leg" : null;
if (process.argv.includes("--write") && holdReason) console.log(`not written: ${holdReason} (a later run may publish)`);
else if (process.argv.includes("--write")) {
  fs.mkdirSync(OUT, { recursive: true });
  const f = path.join(OUT, `${DATE}.json`);
  const body = `${JSON.stringify(doc)}\n`;
  // WRITE-ONCE: the first generation for a date is the record. A later run never replaces it (pages, results and
  // social read the same frozen file), and says so instead of failing the job.
  if (fs.existsSync(f)) console.log(`kept ${path.relative(REPO, f)} (write-once; ${fs.readFileSync(f, "utf8") === body ? "identical" : "a later run differs and is not written"})`);
  else { fs.writeFileSync(f, body); console.log(`wrote ${path.relative(REPO, f)}`); }
} else console.log("(dry run — pass --write to persist)");
