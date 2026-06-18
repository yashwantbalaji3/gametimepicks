#!/usr/bin/env -S npx tsx
/**
 * Surgically replace ONLY the Lane B Step-2 soccer leg of the active Dual Bank Builder ladder with a
 * stronger, not-started, odds-backed World Cup TEAM-market leg (moneyline / DNB / double-chance — never
 * an ultra-short price, never BTTS). Lane A (which may already have started) and Step 1 are preserved
 * verbatim; the Lane B non-soccer (MLB) leg is preserved if still pre-event. Writes ONLY the
 * non-protected engine artifact. Refuses if the current Lane B soccer leg has already kicked off.
 *
 * Usage: cd app && npx tsx scripts/replace-lane-b-soccer.mjs --date 2026-06-18 --now ISO [--dry-run]
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
const TEAM_MARKETS = ["moneyline_90", "draw_no_bet", "double_chance"];
const MIN_ODDS = -360;          // never ultra-short (e.g. -1000/-5000)
const TARGET_LO = 600, TARGET_HI = 720; // keep Lane B payout in band

function parseArgs(argv) {
  const a = { date: null, now: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === "--date") a.date = argv[++i] ?? null;
    else if (t === "--now") a.now = argv[++i] ?? null;
    else if (t === "--dry-run") a.dryRun = true;
  }
  return a;
}
const decimalOf = (o) => (o == null ? 1 : o >= 0 ? 1 + o / 100 : 1 + 100 / -o);
function combinedAmerican(oddsList) {
  const dec = oddsList.reduce((p, o) => p * decimalOf(o), 1);
  return dec >= 2 ? Math.round((dec - 1) * 100) : Math.round(-100 / (dec - 1));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const date = args.date;
  const nowIso = args.now ?? new Date().toISOString();
  const nowMs = Date.parse(nowIso);
  if (!date) { console.error("  --date required"); process.exit(2); }

  const doc = JSON.parse(fs.readFileSync(ACTIVE, "utf8"));
  const laneB = doc.run.laneB;
  const step2 = laneB.steps.find((s) => s.step === 2);
  if (!step2 || step2.status !== "pending") { console.error("  Lane B has no pending Step 2 to modify."); process.exit(2); }

  const oldSoccer = step2.legs.find((l) => l.sport === "WORLD_CUP");
  const mlbLeg = step2.legs.find((l) => l.sport !== "WORLD_CUP");
  if (!oldSoccer || !mlbLeg) { console.error("  Lane B Step 2 is not a soccer+MLB pair — aborting."); process.exit(2); }

  // Replacement window: refuse if the current Lane B soccer leg has kicked off.
  const koMs = Date.parse(oldSoccer.startTime);
  if (Number.isFinite(koMs) && koMs <= nowMs) {
    console.error(`  REPLACEMENT WINDOW CLOSED: Lane B soccer leg kicked off at ${oldSoccer.startTime} (now ${nowIso}). Not modifying the active artifact.`);
    process.exit(3);
  }

  // Eligible, NOT-started team-market WC legs (the not-started gate uses real now).
  const ex = extractPredictionsForDate(date, resolveSports("all"), DATA, { marketAware: true });
  const elig = eligibleLegs(buildLegPool(ex.bySport, nowIso, true));
  const mlbDec = decimalOf(mlbLeg.odds);
  const cands = elig
    .filter((l) => l.sport === "WORLD_CUP" && l.odds != null && TEAM_MARKETS.includes(l.marketType) && l.odds >= MIN_ODDS)
    .filter((l) => l.eventId !== doc.run.laneA?.steps?.find((s) => s.step === 2)?.legs?.find((x) => x.sport === "WORLD_CUP")?.eventId) // different match than Lane A
    .map((l) => {
      const proj = Math.round(step2.stake * decimalOf(l.odds) * mlbDec * 100) / 100;
      const inBand = proj >= TARGET_LO && proj <= TARGET_HI;
      return { l, proj, inBand, surv: Math.round(survivalScore(l)) };
    })
    .sort((a, b) => (Number(b.inBand) - Number(a.inBand)) || (b.surv - a.surv));

  console.log("\n  Lane B soccer replacement candidates (not-started team markets):");
  for (const c of cands.slice(0, 6)) console.log(`    ${c.inBand ? "★" : " "} surv ${c.surv} | ${c.l.odds} | ${c.l.marketType} | ${c.l.participantName} | +MLB → $${c.proj}`);

  const pick = cands.find((c) => c.inBand) ?? cands[0];
  if (!pick) { console.error("\n  No qualified not-started soccer team-market replacement — keeping current Lane B leg."); process.exit(0); }

  const newSoccer = laneLeg(pick.l);
  const newLegs = [newSoccer, mlbLeg];
  const combined = combinedAmerican(newLegs.map((l) => l.odds));
  const projected = Math.round(step2.stake * decimalOf(newSoccer.odds) * mlbDec * 100) / 100;
  const surv = Math.round((survivalScore(pick.l) + (mlbLeg.legQualityScore ?? pick.surv)) / 2);

  console.log(`\n  REPLACE Lane B soccer: "${oldSoccer.label}" (${oldSoccer.odds}) → "${newSoccer.label}" (${newSoccer.odds})`);
  console.log(`  Lane B combined ${step2.combinedOdds} → ${combined} · $${step2.stake} → $${step2.projectedPayout} → $${projected}`);

  if (args.dryRun) { console.log("\n  --dry-run: nothing written."); return; }

  step2.legs = newLegs;
  step2.combinedOdds = combined;
  step2.projectedPayout = projected;
  step2.laneSurvivalScore = surv;
  laneB.legs = newLegs;
  laneB.combinedOdds = combined;
  laneB.laneSurvivalScore = surv;
  doc.meta.laneBSoccerReplacedAt = nowIso;
  doc.meta.laneBSoccerReplacedFrom = oldSoccer.label;
  fs.writeFileSync(ACTIVE, JSON.stringify(doc, null, 2) + "\n");
  console.log(`\n  Wrote ${path.relative(APP_ROOT, ACTIVE)} (Lane A + Step 1 untouched; protected history untouched).`);
}

main();
