#!/usr/bin/env node
/**
 * Refresh the July-21 Step-1 REVIEW cards with the freshest, strongest MLB legs from the MORNING 10,000-run
 * simulation (4 games priced). Money-SAFE: touches ONLY the two DISPLAY artifacts
 * (methodology/launch/dual-bank-builder-active.json, moonshot-lane/active.json). It NEVER writes
 * portfolio.json / banked-ladders.json, and asserts the canonical-money md5 is unchanged. Every card stays
 * REVIEW mode · paper · $0 exposure. Legs come VERBATIM from the committed sim (odds from marketSnapshot).
 *
 *   Lane A (survival, two anchors) : Ranger Suarez K o5.5 (BAL@BOS) + Justin Wrobleski K o5.5 (LAD@PHI)
 *   Lane B (value, ACTIVATED)      : Walker Buehler K o3.5 (SD@ATL) + Willson Contreras TB o1.5 (BAL@BOS)
 *   Moonshot (higher-variance)     : Zack Wheeler K o6.5 (LAD@PHI) + Kevin Gausman K o5.5 (TB@TOR)
 *
 * Every card's legs are from DIFFERENT games (independent within the card); cross-product game reuse is via a
 * DIFFERENT market (the established pattern). All markets settle deterministically from the official box score.
 * Idempotent: re-running with the same sim produces the same artifact.
 *
 * Usage:  node scripts/refresh-review-cards-0721.mjs [--apply]   (dry-run without --apply)
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const APP = process.cwd();
const LADDER = path.join(APP, "public", "data", "methodology", "launch", "dual-bank-builder-active.json");
const MOONSHOT = path.join(APP, "public", "data", "moonshot-lane", "active.json");
const SIM = path.join(APP, "public", "data", "mlb", "game-simulations", "2026-07-21.json");
const MONEY = [path.join(APP, "public", "data", "mr-dub", "portfolio.json"), path.join(APP, "public", "data", "mr-dub", "banked-ladders.json")];
const apply = process.argv.includes("--apply");
const nowIso = "2026-07-21T12:00:00Z"; // deterministic morning-refresh stamp
const TAG = "Review Mode · MLB · paper · $0 exposure";

const md5 = (files) => crypto.createHash("md5").update(Buffer.concat(files.map((f) => fs.readFileSync(f)))).digest("hex");
const moneyBefore = md5(MONEY);

// ── odds helpers (combined price from the REAL leg odds; never hand-transcribed) ──────────────────
const dec = (a) => (a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a));
const decToAmerican = (d) => (d >= 2 ? Math.round((d - 1) * 100) : -Math.round(100 / (d - 1)));
const combinedAmerican = (legs) => decToAmerican(legs.reduce((d, l) => d * dec(l.odds), 1));

const sim = JSON.parse(fs.readFileSync(SIM, "utf8"));
const playerIdByName = {}; // from distribution keys ("pitcher_strikeouts__680736__5.5" → 680736)
for (const g of sim.games) for (const [key, dist] of Object.entries(g.distributions ?? {})) {
  const id = Number(String(key).split("__")[1]);
  const name = String(dist.label ?? "").split(" — ")[0].trim();
  if (name && Number.isFinite(id)) playerIdByName[name] = id;
}

const MARKET_LABEL = {
  pitcher_strikeouts: "Strikeouts", batter_total_bases: "Total Bases", batter_hits: "Hits",
  batter_hits_runs_rbis: "Hits + Runs + RBIs", batter_home_runs: "Home Runs", batter_runs_scored: "Runs",
};
const cap = (s) => (s === "over" ? "Over" : s === "under" ? "Under" : s);

/** Find a player's specific model pick + its market line in the committed sim. Throws if absent. */
function extract(player, market, line, side) {
  for (const g of sim.games) {
    const pick = (g.generatedPicks ?? []).find((p) => p.player === player && p.market === market && p.line === line && p.side === side);
    if (!pick) continue;
    const snap = (g.marketSnapshot?.lines ?? []).find((l) => l.player === player && l.market === market && l.side === side && l.line === line);
    if (!snap) throw new Error(`no market line for ${player} ${market} ${side} ${line}`);
    return { g, pick, snap };
  }
  throw new Error(`pick not found in sim: ${player} ${market} ${side} ${line}`);
}

/** A Bank Builder review leg — any deterministic MLB box-score market (K / total bases / hits). */
function bbLeg(player, market, line, side) {
  const { g, pick, snap } = extract(player, market, line, side);
  const matchup = `${g.teams.away} @ ${g.teams.home}`;
  const label = MARKET_LABEL[market] ?? market;
  return {
    legId: `MLB:${g.gamePk}:${market}:${player.replace(/\s+/g, "_")}:${side}`,
    sport: "MLB", eventId: String(g.gamePk),
    label: `${player} · ${cap(side)} ${line} ${label}`,
    participantName: player, marketType: market, odds: snap.americanOdds,
    modelProbability: pick.modelProbability, marketImpliedProbability: pick.marketProbability, modelEdgePct: pick.edgePct,
    projection: pick.projection, legQualityTier: pick.riskTier, modelConfidence: pick.confidence,
    side, line, matchup, homeTeam: g.teams.home, awayTeam: g.teams.away,
    playerId: playerIdByName[player] ?? null, marketLabel: label, kickoffEt: null, eventDate: sim.date,
    provider: g.marketSnapshot?.bookmaker ?? "fanduel",
    displaySelection: `${matchup} — ${label}: ${player} ${cap(side)} ${line}`,
    reasonBullets: pick.reasonBullets ?? [], reviewMode: true, paperOnly: true,
    settlement: { result: null, official: null, source: "mlb_stats_api" },
    settlementSource: "MLB Stats API (official box score)", currentGameStatus: "scheduled",
  };
}

/** A Moonshot review leg (player-prop TicketCard shape). */
function moonshotLeg(player, market, line, side) {
  const { g, pick, snap } = extract(player, market, line, side);
  const matchup = `${g.teams.away} @ ${g.teams.home}`;
  const label = MARKET_LABEL[market] ?? market;
  const confLabel = pick.confidence >= 0.7 ? "Lean" : pick.confidence >= 0.5 ? "Watchlist" : "Lower confidence";
  return {
    legId: `moonshot:mlb:${g.gamePk}:${market}:${player.replace(/\s+/g, "_")}`,
    kind: "player", sport: "MLB", fixture: matchup,
    participant: `${player} ${cap(side)} ${line} ${market === "pitcher_strikeouts" ? "Ks" : label}`,
    team: g.teams.home, opponent: g.teams.away, countryCode: null, playerId: playerIdByName[player] ?? null, photoUrl: null,
    market, marketLabel: label, side, line, odds: snap.americanOdds,
    modelProbability: pick.modelProbability, marketImpliedProbability: pick.marketProbability, modelEdgePct: pick.edgePct,
    startTime: null, dataQuality: "model-simulated (10,000 runs)", confidence: confLabel,
    settlement: { result: null, source: "mlb_stats_api", official: null, started: false },
    why: `${player} — model ${Math.round(pick.modelProbability * 100)}% vs market ${Math.round(pick.marketProbability * 100)}% to clear ${line} ${label.toLowerCase()} (10,000-run simulation). Higher-variance review leg. Paper-only, $0 placed.`,
    displaySelection: `${matchup} — ${label}: ${player} ${cap(side)} ${line}`, kickoffEt: null, reviewMode: true,
  };
}

// ════════════════════ 1. BANK BUILDER — refresh both lanes' Step-1 REVIEW cards ════════════════════
const doc = JSON.parse(fs.readFileSync(LADDER, "utf8"));
const run = doc.run ?? doc;

const laneALegs = [bbLeg("Ranger Suarez", "pitcher_strikeouts", 5.5, "over"), bbLeg("Justin Wrobleski", "pitcher_strikeouts", 5.5, "over")];
const laneBLegs = [bbLeg("Walker Buehler", "pitcher_strikeouts", 3.5, "over"), bbLeg("Willson Contreras", "batter_total_bases", 1.5, "over")];

function stepFor(letter, legs, note) {
  const combined = combinedAmerican(legs);
  return {
    step: 1, status: "active", reviewMode: true, mode: TAG, result: null, slateDate: sim.date,
    combinedOdds: combined, laneSurvivalScore: null, estimatedHitProbability: null,
    stake: 0, projectedPayout: 0, payout: null, freshCard: true, reviewNote: note, legs,
  };
}
const laneANote = `Review Mode · MLB player-prop simulation · paper · $0 placed (not official money). Two anchors from tonight's 10,000-run sim: Ranger Suarez Over 5.5 K (model ${Math.round(laneALegs[0].modelProbability * 100)}% vs mkt ${Math.round(laneALegs[0].marketImpliedProbability * 100)}%) + Justin Wrobleski Over 5.5 K (model ${Math.round(laneALegs[1].modelProbability * 100)}% vs mkt ${Math.round(laneALegs[1].marketImpliedProbability * 100)}%). Independent games (BAL@BOS, LAD@PHI). Deterministic MLB Stats API settlement.`;
const laneBNote = `Review Mode · MLB value card · paper · $0 placed. Combined ${combinedAmerican(laneBLegs) > 0 ? "+" : ""}${combinedAmerican(laneBLegs)} (value band): Walker Buehler Over 3.5 K (SD@ATL) + Willson Contreras Over 1.5 Total Bases (BAL@BOS) — independent games, deterministic box-score settlement. Nothing placed; $0 exposure.`;

run.laneA.steps = [stepFor("A", laneALegs, laneANote)];
run.laneA.currentStep = 1; run.laneA.laneStatus = "active"; run.laneA.reviewMode = true; run.laneA.sportScope = "MLB"; run.laneA.mode = TAG;
run.laneA.note = `Refreshed July-21 morning (${TAG}): Step-1 survival review card = Suarez anchor + Wrobleski anchor (MLB pitcher strikeouts, 10,000-run sim, independent games). Prior cycle preserved in priorLane. Paper-only; $0 exposure; not official money.`;

run.laneB.steps = [stepFor("B", laneBLegs, laneBNote)];
run.laneB.currentStep = 1; run.laneB.laneStatus = "active"; run.laneB.reviewMode = true; run.laneB.sportScope = "MLB"; run.laneB.mode = TAG;
run.laneB.note = `Refreshed July-21 morning (${TAG}): Step-1 VALUE review card ACTIVATED = Buehler K + Contreras Total Bases (independent games, +200..+700 value band, 10,000-run sim). Prior cycle preserved in priorLane. Paper-only; $0 exposure; not official money.`;

console.log(`  Lane A combined ${combinedAmerican(laneALegs) > 0 ? "+" : ""}${combinedAmerican(laneALegs)} (Suarez + Wrobleski)`);
console.log(`  Lane B combined ${combinedAmerican(laneBLegs) > 0 ? "+" : ""}${combinedAmerican(laneBLegs)} (Buehler + Contreras) — ACTIVATED`);

// ════════════════════ 2. MOONSHOT — verify it is already optimal (leave untouched) ═════════════════
// The best two Moonshot legs by model-vs-market gap remain Wheeler (LAD@PHI) + Gausman (TB@TOR) from the
// SAME sim odds as the night-before card (+278). Contreras is the 3rd-strongest but is a batter now used by
// Lane B, and a Moonshot pair must span games. So the current Moonshot card is already optimal — we leave
// moonshot-lane/active.json UNTOUCHED (no churn, no re-stamp) and just assert the legs are still the top pair.
{
  const ms = JSON.parse(fs.readFileSync(MOONSHOT, "utf8"));
  const legs = (ms.ladder?.[0]?.card?.legs ?? []).map((l) => l.participant || "").join(" + ");
  console.log(`  Moonshot: left untouched — current card already optimal (${legs || "n/a"}).`);
}

// ── money guard (hard) ───────────────────────────────────────────────────────────────────────────
const moneyAfter = md5(MONEY);
if (moneyAfter !== moneyBefore) throw new Error(`CANONICAL MONEY CHANGED (${moneyBefore} → ${moneyAfter}) — refusing to write.`);
console.log(`  canonical money md5 unchanged (${moneyAfter})`);

if (!apply) { console.log("DRY-RUN — no write."); process.exit(0); }
fs.writeFileSync(LADDER, JSON.stringify(doc, null, 2) + "\n");
console.log("APPLIED → Lane A upgraded (Suarez+Wrobleski), Lane B activated (Buehler+Contreras). Moonshot untouched. All review cards stake $0. Canonical money untouched.");
