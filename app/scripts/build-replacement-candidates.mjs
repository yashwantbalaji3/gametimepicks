#!/usr/bin/env -S npx tsx
/**
 * Pre-generate internal REPLACEMENT CANDIDATES for each active dual-lane Step, so a failed leg can be
 * swapped immediately (before the partner starts) instead of waiting. For a lane's pending step, finds
 * not-started, odds-backed, leakage-safe World Cup team legs from OTHER matches (not the lane's own and
 * not the surviving lane's) as candidates to replace the soccer leg while keeping the MLB partner.
 * Each candidate carries combined odds, projected return, survival, and validUntil = the partner's
 * start time (after which replacement is no longer allowed → the lane must restart instead).
 *
 * Writes ONLY the non-protected active artifact (lane.replacementCandidates). No fabrication; reads the
 * canonical engine eligible pool. If the partner has started, NO candidates are written (restart only).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractPredictionsForDate, resolveSports } from "../src/lib/methodology/sources.ts";
import { buildLegPool, eligibleLegs } from "../src/lib/parlays/eligible-leg.ts";
import { survivalScore, laneLeg } from "../src/lib/parlays/dual-bank-builder.ts";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(APP, "public", "data");
const ACTIVE = path.join(DATA, "methodology", "launch", "dual-bank-builder-active.json");
const TEAM_MARKETS = ["moneyline_90", "draw_no_bet", "double_chance"];
const decOf = (o) => (o == null ? 1 : o >= 0 ? 1 + o / 100 : 1 + 100 / -o);
const amer = (dec) => (dec >= 2 ? Math.round((dec - 1) * 100) : Math.round(-100 / (dec - 1)));

function parseArgs(argv) {
  const a = { date: "2026-06-18", now: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--date") a.date = argv[++i];
    else if (argv[i] === "--now") a.now = argv[++i];
    else if (argv[i] === "--dry-run") a.dryRun = true;
  }
  return a;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const nowIso = args.now ?? new Date().toISOString();
  const nowMs = Date.parse(nowIso);
  const doc = JSON.parse(fs.readFileSync(ACTIVE, "utf8"));
  const run = doc.run;

  const ex = extractPredictionsForDate(args.date, resolveSports("all"), DATA, { marketAware: true });
  const elig = eligibleLegs(buildLegPool(ex.bySport, nowIso, true));
  const wcTeam = elig.filter((l) => l.sport === "WORLD_CUP" && l.odds != null && TEAM_MARKETS.includes(l.marketType) && l.odds >= -360 && survivalScore(l) >= 65);

  // Games already in use across lanes (avoid duplicate exposure with the surviving lane).
  const usedEvents = new Set();
  for (const lk of ["laneA", "laneB"]) for (const s of run[lk]?.steps ?? []) for (const l of s.legs ?? []) usedEvents.add(String(l.eventId));

  let total = 0;
  for (const lk of ["laneA", "laneB"]) {
    const lane = run[lk]; if (!lane) continue;
    const step = (lane.steps ?? []).find((s) => s.status === "pending");
    if (!step) { lane.replacementCandidates = []; continue; }
    const soccer = step.legs.find((l) => l.sport === "WORLD_CUP");
    const mlb = step.legs.find((l) => l.sport !== "WORLD_CUP");
    if (!soccer || !mlb) { lane.replacementCandidates = []; continue; }

    // Replacement is only valid while BOTH the leg-to-replace (soccer) AND the partner are pre-event.
    const soccerStarted = soccer.startTime && Date.parse(soccer.startTime) <= nowMs;
    const mlbStarted = mlb.startTime && Date.parse(mlb.startTime) <= nowMs;
    if (soccerStarted || mlbStarted) {
      lane.replacementCandidates = []; // a started leg can't be pre-replaced → restart only if it fails
      continue;
    }
    const mlbDec = decOf(mlb.odds);
    const cands = wcTeam
      .filter((l) => l.eventId !== soccer.eventId && !usedEvents.has(String(l.eventId)) && l.startTime && Date.parse(l.startTime) > nowMs)
      .map((l) => {
        const ll = laneLeg(l);
        const dec = decOf(ll.odds) * mlbDec;
        return {
          candidateId: `replacement-${lk === "laneA" ? "lane-a" : "lane-b"}-step${step.step}-${ll.legId.replace(/[^a-z0-9]+/gi, "-").slice(0, 24)}`,
          replaceLegId: soccer.legId, keepLegId: mlb.legId, newLeg: ll,
          combinedOdds: amer(dec), projectedReturn: Math.round(step.stake * dec * 100) / 100,
          survival: Math.round((survivalScore(l) + (mlb.legQualityScore ?? 80)) / 2),
          reason: "Pre-event replacement candidate if the soccer leg fails before the partner starts.",
          validUntil: mlb.startTime, status: "candidate",
        };
      })
      .sort((a, b) => b.survival - a.survival)
      .slice(0, 3);
    lane.replacementCandidates = cands;
    total += cands.length;
    if (cands.length === 0 && lane.laneStatus === "stopped") {
      lane.replacementCandidates = [{ candidateId: `restart-${lk}`, status: "restart_queued", reason: "No replacement allowed (lane stopped / partner started). A fresh $100 lane restarts.", stake: 100 }];
    }
  }

  run.replacementCandidatesAt = nowIso;
  if (!args.dryRun) fs.writeFileSync(ACTIVE, JSON.stringify(doc, null, 2) + "\n");
  console.log(`Replacement candidates generated: ${total} (now=${nowIso})${args.dryRun ? " [dry-run]" : ""}`);
  for (const lk of ["laneA", "laneB"]) {
    const cs = run[lk]?.replacementCandidates ?? [];
    console.log(`  ${lk}: ${cs.length} candidate(s)` + (cs[0]?.newLeg ? ` · top: ${cs[0].newLeg.label} (${cs[0].combinedOdds}, $${run[lk].steps.find((s)=>s.status==="pending")?.stake} → $${cs[0].projectedReturn})` : cs[0]?.status ? ` · ${cs[0].status}` : ""));
  }
}

main();
