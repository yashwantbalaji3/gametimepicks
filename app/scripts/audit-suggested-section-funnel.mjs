/**
 * Suggested-Parlays section funnel — OFFLINE, READ-ONLY.
 *
 * Explains WHY High/Longshot Suggested sections can be empty while Low/Medium
 * have cards, by tracing the per-section slip count through each stage:
 *
 *   raw (publicRiskSections "all" union, incl. mixed)
 *     → official-only  (PR #247: filterOfficialSuggestedSlips drops mixed)
 *     → after #241 volume discipline (applyVolumeDiscipline caps)
 *
 * Reads committed optimizer snapshots only. Writes nothing, changes nothing.
 *
 * Run: cd app && npx tsx scripts/audit-suggested-section-funnel.mjs [date ...]
 *   defaults to an MLB-only slate (2026-06-01) + a mixed slate (2026-05-30).
 */
import { readFileSync } from "node:fs";
import { filterOfficialSuggestedSlips, isMixedSportSlip } from "../src/lib/sport-capabilities.ts";
import { optimizerSlipToParlaySlip } from "../src/lib/parlay-optimizer.ts";
import { applyVolumeDiscipline, PUBLIC_VOLUME_CAPS } from "../src/lib/parlay-volume-discipline.ts";

const SECTIONS = ["low", "medium", "high", "longshot"];
const dates = process.argv.slice(2);
const TARGETS = dates.length ? dates : ["2026-06-01", "2026-05-30"];

function load(d) {
  try { return JSON.parse(readFileSync(`public/data/parlays/optimizer/${d}.json`, "utf8")); }
  catch { return null; }
}

console.log("════════════════════════════════════════════════════════════════════");
console.log(" SUGGESTED section funnel  —  offline, read-only (why sections empty?)");
console.log("════════════════════════════════════════════════════════════════════");

for (const date of TARGETS) {
  const g = load(date);
  if (!g || !g.publicRiskSections) { console.log(`\n${date}: no optimizer/publicRiskSections on disk — skipped`); continue; }
  const psr = g.publicRiskSections;

  // Build the "official-only" per-section map (drop mixed/unsupported).
  const rawBySection = {};
  const officialBySection = {};
  let mixedRemoved = 0;
  for (const sec of SECTIONS) {
    const allBucket = (psr[sec]?.all ?? []).map((s) => optimizerSlipToParlaySlip(s, date));
    rawBySection[sec] = allBucket;
    const official = filterOfficialSuggestedSlips(allBucket);
    officialBySection[sec] = official;
    mixedRemoved += allBucket.filter(isMixedSportSlip).length;
  }
  const afterVolume = applyVolumeDiscipline(officialBySection, PUBLIC_VOLUME_CAPS).sections;

  const sportsIncluded = new Set();
  for (const sec of SECTIONS) for (const s of rawBySection[sec]) for (const l of (s.legs ?? [])) if (l.sport) sportsIncluded.add(l.sport);

  console.log(`\n${date}  (sports on slate: ${[...sportsIncluded].join("+") || "none"}; total generated slips: ${g.totalSlips ?? "?"})`);
  console.log(`  ${"section".padEnd(9)} ${"raw(all)".padStart(8)} ${"official".padStart(9)} ${"afterCaps".padStart(10)}   note`);
  for (const sec of SECTIONS) {
    const raw = rawBySection[sec].length;
    const off = officialBySection[sec].length;
    const cap = (afterVolume[sec] ?? []).length;
    let note = "";
    if (raw === 0) note = "no slips generated in this odds/leg band";
    else if (off === 0) note = "all slips here were mixed-sport (removed by PR #247)";
    else if (cap === 0) note = "emptied by volume caps / exposure limits";
    else if (cap < off) note = `volume caps trimmed ${off - cap}`;
    console.log(`  ${sec.padEnd(9)} ${String(raw).padStart(8)} ${String(off).padStart(9)} ${String(cap).padStart(10)}   ${note}`);
  }
  console.log(`  mixed slips present in raw 'all' buckets (blocked from official Suggested): ${mixedRemoved}`);
}

console.log(`\n── READ ── Empty High/Longshot are HONEST: the slate simply did not produce`);
console.log(`  qualifying slips in those odds/leg bands (or they were mixed-sport, or`);
console.log(`  trimmed by #241 volume caps). No padding, no fabricated cards. The UX fix`);
console.log(`  is to make emptiness feel intentional (summary + collapse + 'why empty?'),`);
console.log(`  NOT to loosen bands or invent cards.`);
console.log("════════════════════════════════════════════════════════════════════");
