/**
 * Shadow audit — proposed quality gates vs today, on ALREADY-SETTLED slates.
 *
 * Read-only, offline, no live wiring. For each settled public-era slate it
 * re-evaluates the slips the optimizer ALREADY published against:
 *   (a) today's effective gate/caps (Aggressive leg gate, no same-market cap)
 *   (b) the PROPOSED per-section leg-quality ladder + decorrelation caps
 * and reports old-vs-new volume + hit rate.
 *
 * HONEST LIMITATION: this FILTERS the published slips — it does not re-run
 * the optimizer's search, so it answers "of what we published, which would
 * the gates keep, and how did those perform?" not "what would a re-run
 * build instead?". It uses only pregame leg structure + the slip's own
 * graded result; it never uses another slate's result to judge a slip, so
 * there is no same-slate leakage. May 25/26 are excluded.
 *
 * Run: cd app && npx tsx scripts/shadow-audit-quality-gates.mjs
 */
import { readFileSync } from "node:fs";
import {
  evaluateLegQualityGate,
  PUBLIC_SECTION_LEG_GATE_TODAY,
  PROPOSED_SECTION_LEG_GATES,
} from "../src/lib/leg-quality-gates.ts";
import {
  evaluateSlipDecorrelation,
  PUBLIC_SECTION_DECORRELATION_CAPS_TODAY,
  PROPOSED_SECTION_DECORRELATION_CAPS,
} from "../src/lib/parlay-decorrelation.ts";

const DATES = ["2026-05-27", "2026-05-28", "2026-05-29", "2026-05-30", "2026-06-01"]; // public era, NO 05-25/26

const amerToDec = (a) => (a >= 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a));
const decToAmer = (d) => (d >= 2 ? Math.round((d - 1) * 100) : Math.round(-100 / (d - 1)));
function combinedAmer(legs) {
  let d = 1;
  for (const l of legs) {
    if (l.oddsForSide == null) return null;
    d *= amerToDec(l.oddsForSide);
  }
  return decToAmer(d);
}
function sectionOf(camer) {
  if (camer == null) return null;
  if (camer < 300) return "low";
  if (camer < 600) return "medium";
  if (camer < 1000) return "high";
  return "longshot";
}
const legInput = (l) => ({
  sport: l.sport,
  side: l.side ?? null,
  confidence: l.confidence ?? null,
  edgePct: l.edgePct ?? null,
  recent10Count: l.recent10Count ?? 0,
  recentSeries: l.recentSeries ?? null,
  playerId: l.playerId ?? null,
  isAnomaly: l.isAnomaly ?? null,
  starTier: l.starTier ?? null,
  market: l.market ?? null,
});

function pct(w, n) {
  return n ? `${((w / n) * 100).toFixed(0)}%` : "—";
}

const agg = {
  todaySlips: 0, todayWins: 0, todayLegs: 0, todayLegW: 0,
  newSlips: 0, newWins: 0, newLegs: 0, newLegW: 0,
  legConsAll: 0, legConsW: 0, legConsPass: 0, legConsPassW: 0,
};

console.log("Shadow audit — proposed quality gates vs today (settled slates, public era)\n");
console.log("date        published   newKept   pub-slip%  new-slip%   pub-leg%  consGate-leg%");
for (const date of DATES) {
  let raw;
  try { raw = JSON.parse(readFileSync(`public/data/parlays/optimizer-graded/${date}.json`, "utf8")); }
  catch { console.log(`${date}  (no file)`); continue; }
  const slips = raw.uniqueSlips ?? [];

  let pubSlips = 0, pubWins = 0, pubLegs = 0, pubLegW = 0;
  let newSlips = 0, newWins = 0, newLegs = 0, newLegW = 0;
  // leg-gate evidence: hit rate of ALL slip legs vs legs that ALSO pass the proposed Low (conservative) gate
  let cAll = 0, cAllW = 0, cPass = 0, cPassW = 0;

  for (const s of slips) {
    const sec = sectionOf(combinedAmer(s.legs));
    if (!sec) continue;
    const win = s.status === "win";
    pubSlips++; if (win) pubWins++;
    for (const l of s.legs) {
      const r = l.result;
      if (r !== "win" && r !== "loss") continue;
      const lw = r === "win" ? 1 : 0;
      pubLegs++; pubLegW += lw;
      // conservative-gate leg evidence (only meaningful for legs that exist today)
      cAll++; cAllW += lw;
      const cons = evaluateLegQualityGate(legInput(l), PROPOSED_SECTION_LEG_GATES.low);
      if (cons.passes) { cPass++; cPassW += lw; }
    }
    // "new" set: slip survives iff EVERY leg passes the proposed gate for its section
    //   AND the slip passes the proposed decorrelation caps for its section.
    const legGate = PROPOSED_SECTION_LEG_GATES[sec];
    const allLegsPass = s.legs.every((l) => evaluateLegQualityGate(legInput(l), legGate).passes);
    const decor = evaluateSlipDecorrelation(s.legs, PROPOSED_SECTION_DECORRELATION_CAPS[sec]);
    if (allLegsPass && decor.passes) {
      newSlips++; if (win) newWins++;
      for (const l of s.legs) {
        const r = l.result;
        if (r !== "win" && r !== "loss") continue;
        newLegs++; newLegW += r === "win" ? 1 : 0;
      }
    }
  }

  console.log(
    `${date}  ${String(pubSlips).padStart(9)}  ${String(newSlips).padStart(7)}   ` +
    `${pct(pubWins, pubSlips).padStart(8)}  ${pct(newWins, newSlips).padStart(8)}   ` +
    `${pct(pubLegW, pubLegs).padStart(7)}  ${pct(cPassW, cPass).padStart(11)} (n=${cPass}/${cAll})`,
  );

  agg.todaySlips += pubSlips; agg.todayWins += pubWins; agg.todayLegs += pubLegs; agg.todayLegW += pubLegW;
  agg.newSlips += newSlips; agg.newWins += newWins; agg.newLegs += newLegs; agg.newLegW += newLegW;
  agg.legConsAll += cAll; agg.legConsW += cAllW; agg.legConsPass += cPass; agg.legConsPassW += cPassW;
}

console.log("\n=== AGGREGATE (5 settled days) ===");
console.log(`Published today : ${agg.todaySlips} slips, slip-hit ${pct(agg.todayWins, agg.todaySlips)}, leg-hit ${pct(agg.todayLegW, agg.todayLegs)}`);
console.log(`Proposed kept   : ${agg.newSlips} slips (${pct(agg.newSlips, agg.todaySlips)} of today), slip-hit ${pct(agg.newWins, agg.newSlips)}, leg-hit ${pct(agg.newLegW, agg.newLegs)}`);
console.log(`Leg quality gate: all slip-legs hit ${pct(agg.legConsW, agg.legConsAll)} (n=${agg.legConsAll}); legs ALSO passing the conservative (Low) gate hit ${pct(agg.legConsPassW, agg.legConsPass)} (n=${agg.legConsPass})`);
console.log("\nNote: filter-based (does not re-run optimizer search). No same-slate leakage. Informational evidence for the wiring decision.");
