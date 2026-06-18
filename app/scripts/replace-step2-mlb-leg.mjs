#!/usr/bin/env -S npx tsx
/**
 * Surgically replace a lane's Step-2 MLB leg with a stronger, not-started, eligible MLB leg (chosen
 * after a last-5/last-10 + survival/risk audit). Keeps the lane's soccer leg, the other lane, and
 * Step 1 untouched. Refuses if the MLB leg being replaced has already started. Writes ONLY the
 * non-protected engine artifact. Re-run pipeline.attach_bank_builder_last5 afterward to refresh last5.
 *
 * Usage: cd app && npx tsx scripts/replace-step2-mlb-leg.mjs --lane A --player "Josh Bell" --market hrr --side over --line 1.5 --now ISO [--dry-run]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractPredictionsForDate, resolveSports } from "../src/lib/methodology/sources.ts";
import { buildLegPool, eligibleLegs } from "../src/lib/parlays/eligible-leg.ts";
import { survivalScore, laneLeg } from "../src/lib/parlays/dual-bank-builder.ts";

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(APP_ROOT, "public", "data");
const ACTIVE = path.join(DATA, "methodology", "launch", "dual-bank-builder-active.json");
const MARKET = { hrr: "Hits + Runs + RBIs", strikeouts: "Strikeouts" };

function parseArgs(argv) {
  const a = { lane: null, player: null, market: "hrr", side: null, line: null, now: null, dryRun: false, date: "2026-06-18" };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === "--lane") a.lane = argv[++i];
    else if (t === "--player") a.player = argv[++i];
    else if (t === "--market") a.market = argv[++i];
    else if (t === "--side") a.side = argv[++i];
    else if (t === "--line") a.line = Number(argv[++i]);
    else if (t === "--now") a.now = argv[++i];
    else if (t === "--date") a.date = argv[++i];
    else if (t === "--dry-run") a.dryRun = true;
  }
  return a;
}
const decimalOf = (o) => (o == null ? 1 : o >= 0 ? 1 + o / 100 : 1 + 100 / -o);
function combinedAmerican(list) {
  const dec = list.reduce((p, o) => p * decimalOf(o), 1);
  return dec >= 2 ? Math.round((dec - 1) * 100) : Math.round(-100 / (dec - 1));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const nowIso = args.now ?? new Date().toISOString();
  const nowMs = Date.parse(nowIso);
  const laneKey = args.lane === "A" ? "laneA" : args.lane === "B" ? "laneB" : null;
  if (!laneKey || !args.player) { console.error("  --lane A|B and --player are required"); process.exit(2); }

  const doc = JSON.parse(fs.readFileSync(ACTIVE, "utf8"));
  const lane = doc.run[laneKey];
  const step2 = lane.steps.find((s) => s.step === 2);
  const oldMlb = step2.legs.find((l) => l.sport !== "WORLD_CUP");
  const soccer = step2.legs.find((l) => l.sport === "WORLD_CUP");
  if (!oldMlb || !soccer) { console.error("  Lane Step 2 is not a soccer+MLB pair."); process.exit(2); }

  const koMs = Date.parse(oldMlb.startTime);
  if (Number.isFinite(koMs) && koMs <= nowMs) {
    console.error(`  REPLACEMENT WINDOW CLOSED: ${laneKey} MLB leg started at ${oldMlb.startTime} (now ${nowIso}). Not modifying.`);
    process.exit(3);
  }

  const ex = extractPredictionsForDate(args.date, resolveSports("all"), DATA, { marketAware: true });
  const elig = eligibleLegs(buildLegPool(ex.bySport, nowIso, true));
  const want = MARKET[args.market] ?? args.market;
  const match = elig.find((l) =>
    l.sport === "MLB" && l.participantName === args.player &&
    (l.marketType || "").includes(want) &&
    (args.side ? (l.side || "").toLowerCase() === args.side.toLowerCase() : true) &&
    (args.line != null ? Number(l.line) === args.line : true));
  if (!match) { console.error(`  No eligible not-started leg found: ${args.player} ${want} ${args.side ?? ""} ${args.line ?? ""}`); process.exit(2); }
  // Game-disjoint from the OTHER lane's MLB game.
  const otherKey = laneKey === "laneA" ? "laneB" : "laneA";
  const otherMlb = doc.run[otherKey].steps.find((s) => s.step === 2)?.legs?.find((l) => l.sport !== "WORLD_CUP");
  if (otherMlb && match.eventId === otherMlb.eventId) { console.error("  Replacement shares a game with the other lane's MLB leg — aborting."); process.exit(2); }

  const newMlb = laneLeg(match);
  const newLegs = [soccer, newMlb];
  const combined = combinedAmerican(newLegs.map((l) => l.odds));
  const projected = Math.round(step2.stake * decimalOf(soccer.odds) * decimalOf(newMlb.odds) * 100) / 100;
  // Lane survival = avg(soccerSurv, mlbSurv). Back out the soccer contribution from the existing lane
  // value using the OLD MLB leg's survival (still in the not-started pool), so the only change is the
  // MLB leg's survival — never a spurious drift from re-deriving the (possibly started) soccer leg.
  const oldMlbElig = elig.find((l) => l.sport === "MLB" && l.participantName === oldMlb.participantName && (l.marketType || "") === (oldMlb.marketType || ""));
  const soccerSurvBackedOut = oldMlbElig ? (2 * step2.laneSurvivalScore - Math.round(survivalScore(oldMlbElig))) : soccerSurv(soccer);
  const surv = Math.round((survivalScore(match) + soccerSurvBackedOut) / 2);

  console.log(`\n  ${laneKey} Step 2 MLB: "${oldMlb.label}" (${oldMlb.odds}) → "${newMlb.label}" (${newMlb.odds})`);
  console.log(`  combined ${step2.combinedOdds} → ${combined} · $${step2.stake} → $${step2.projectedPayout} → $${projected} · survival ${step2.laneSurvivalScore} → ${surv}`);
  if (args.dryRun) { console.log("  --dry-run: nothing written."); return; }

  step2.legs = newLegs; step2.combinedOdds = combined; step2.projectedPayout = projected; step2.laneSurvivalScore = surv;
  lane.legs = newLegs; lane.combinedOdds = combined; lane.laneSurvivalScore = surv;
  doc.meta[`${laneKey}MlbReplacedAt`] = nowIso;
  doc.meta[`${laneKey}MlbReplacedFrom`] = oldMlb.label;
  fs.writeFileSync(ACTIVE, JSON.stringify(doc, null, 2) + "\n");
  console.log(`  Wrote ${path.relative(APP_ROOT, ACTIVE)} (soccer + other lane + Step 1 + protected history untouched).`);
}

// Soccer leg survival isn't on the committed leg; approximate from its legQualityScore (kept on the leg).
function soccerSurv(soccerLeg) {
  return typeof soccerLeg.legQualityScore === "number" ? Math.max(60, Math.min(90, soccerLeg.legQualityScore)) : 75;
}

main();
