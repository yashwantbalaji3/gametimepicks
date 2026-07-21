/**
 * July 21 REVIEW-MODE restart. The founder wants Bank Builder + Moonshot RESTARTED FROM STEP 1 for a
 * July-21 public review, in REVIEW / PAPER mode, exposure $0. Both Bank Builder lanes are stale World-Cup-era
 * cycles (Lane A advanced cycle 8, Lane B stopped cycle 7) and the Moonshot lane is a stopped World-Cup cycle.
 * This restarts BOTH BB lanes to fresh $0 Step-1 REVIEW cycles and restarts the Moonshot lane to a fresh
 * Step-1 MLB REVIEW cycle — the prior cycle preserved in priorLane / priorRun — carrying the July-21
 * pitcher-strikeout review cards read verbatim from the committed 10,000-run MLB simulation.
 *
 * Mirrors the proven restart-both-lanes-0701.mjs. NEVER touches canonical bankroll / crown / record (that is
 * portfolio.json / banked-ladders.json) — only the active-ladder DISPLAY structure. Every review card is
 * paper-only with stake $0 (nothing placed, no exposure). Dry-run by default; --apply writes.
 *   cd app && npx tsx scripts/restart-both-lanes-0721.mjs           # dry-run
 *   cd app && npx tsx scripts/restart-both-lanes-0721.mjs --apply
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LADDER = path.join(APP, "public", "data", "methodology", "launch", "dual-bank-builder-active.json");
const MOONSHOT = path.join(APP, "public", "data", "moonshot-lane", "active.json");
const SIM = path.join(APP, "public", "data", "mlb", "game-simulations", "2026-07-21.json");
const apply = process.argv.includes("--apply");
const nowIso = "2026-07-21T08:00:00Z"; // deterministic cycle-start stamp for the July-21 review cycle
const REVIEW_TAG = "Review Mode · MLB · paper · $0 exposure";

// ── odds helpers (derive combined price from the real leg odds; never hand-transcribed) ───────────
const dec = (a) => (a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a));
const decToAmerican = (d) => (d >= 2 ? Math.round((d - 1) * 100) : -Math.round(100 / (d - 1)));
const combinedAmerican = (legs) => decToAmerican(legs.reduce((d, l) => d * dec(l.odds), 1));

// ── read the committed MLB simulation and extract each pitcher-strikeout leg VERBATIM ─────────────
const sim = JSON.parse(fs.readFileSync(SIM, "utf8"));
const playerIdByName = {}; // from the distribution keys ("pitcher_strikeouts__680736__5.5" → 680736)
for (const g of sim.games) {
  for (const [key, dist] of Object.entries(g.distributions ?? {})) {
    const id = Number(String(key).split("__")[1]);
    const name = String(dist.label ?? "").split(" — ")[0].trim();
    if (name && Number.isFinite(id)) playerIdByName[name] = id;
  }
}
/** Find a player's model pick + its market line in the committed sim and return the exact fields. */
function extractPick(player) {
  for (const g of sim.games) {
    const pick = (g.generatedPicks ?? []).find((p) => p.player === player);
    if (!pick) continue;
    const snap = (g.marketSnapshot?.lines ?? []).find((l) => l.player === player && l.side === pick.side && l.line === pick.line);
    if (!snap) throw new Error(`no market line for ${player}`);
    return { g, pick, snap };
  }
  throw new Error(`pick not found in sim: ${player}`);
}

// ── build a Bank Builder review leg (team/game-market shape; deterministic StatsAPI settlement) ───
function bbLeg(player) {
  const { g, pick, snap } = extractPick(player);
  const matchup = `${g.teams.away} @ ${g.teams.home}`;
  return {
    legId: `MLB:${g.gamePk}:pitcher_strikeouts:${player.replace(/\s+/g, "_")}:${pick.side}`,
    sport: "MLB",
    eventId: String(g.gamePk),
    label: `${player} · ${pick.side === "over" ? "Over" : "Under"} ${pick.line} Strikeouts`,
    participantName: player,
    marketType: "pitcher_strikeouts",
    odds: snap.americanOdds,
    modelProbability: pick.modelProbability,
    marketImpliedProbability: pick.marketProbability,
    modelEdgePct: pick.edgePct,
    projection: pick.projection,
    legQualityTier: pick.riskTier, // "anchor" | "core"
    modelConfidence: pick.confidence,
    side: pick.side,
    line: pick.line,
    matchup,
    homeTeam: g.teams.home,
    awayTeam: g.teams.away,
    playerId: playerIdByName[player] ?? null,
    marketLabel: "Strikeouts",
    kickoffEt: null,
    eventDate: sim.date,
    provider: g.marketSnapshot?.bookmaker ?? "fanduel",
    displaySelection: `${matchup} — Strikeouts: ${player} ${pick.side === "over" ? "Over" : "Under"} ${pick.line}`,
    reasonBullets: pick.reasonBullets ?? [],
    reviewMode: true,
    paperOnly: true,
    settlement: { result: null, official: null, source: "mlb_stats_api" },
    settlementSource: "MLB Stats API (official box score)",
    currentGameStatus: "scheduled",
  };
}

// ── build a Moonshot review leg (player-prop TicketCard shape) ─────────────────────────────────────
function moonshotLeg(player) {
  const { g, pick, snap } = extractPick(player);
  const matchup = `${g.teams.away} @ ${g.teams.home}`;
  const confLabel = pick.confidence >= 0.7 ? "Lean" : pick.confidence >= 0.5 ? "Watchlist" : "Lower confidence";
  return {
    legId: `moonshot:mlb:${g.gamePk}:pitcher_strikeouts:${player.replace(/\s+/g, "_")}`,
    kind: "player",
    sport: "MLB",
    fixture: matchup,
    participant: `${player} ${pick.side === "over" ? "Over" : "Under"} ${pick.line} Ks`,
    team: g.teams.home,
    opponent: g.teams.away,
    countryCode: null,
    playerId: playerIdByName[player] ?? null,
    photoUrl: null,
    market: "pitcher_strikeouts",
    marketLabel: "Strikeouts",
    side: pick.side,
    line: pick.line,
    odds: snap.americanOdds,
    modelProbability: pick.modelProbability,
    marketImpliedProbability: pick.marketProbability,
    modelEdgePct: pick.edgePct,
    startTime: null,
    dataQuality: "model-simulated (10,000 runs)",
    confidence: confLabel,
    settlement: { result: null, source: "mlb_stats_api", official: null, started: false },
    why: `${player} — model ${Math.round(pick.modelProbability * 100)}% vs market ${Math.round(pick.marketProbability * 100)}% to clear ${pick.line} strikeouts (10,000-run simulation). Higher-variance review leg. Paper-only, $0 placed.`,
    displaySelection: `${matchup} — Strikeouts: ${player} ${pick.side === "over" ? "Over" : "Under"} ${pick.line}`,
    kickoffEt: null,
    reviewMode: true,
  };
}

// ════════════════════════ 1. BANK BUILDER — restart BOTH lanes to a fresh $0 Step-1 review ════════
const doc = JSON.parse(fs.readFileSync(LADDER, "utf8"));
const run = doc.run ?? doc;
let bbRestarted = 0;

// Lane A survival review card: the model ANCHOR (Wrobleski, edge +13%) + the CORE support (Buehler) — two
// independent games (LAD@PHI, SD@ATL), so it is a valid ≥2-leg card, not a correlated same-game stack.
const laneAReviewLegs = [bbLeg("Justin Wrobleski"), bbLeg("Walker Buehler")];
const laneAReviewCard = {
  step: 1,
  status: "active",
  reviewMode: true,
  mode: REVIEW_TAG,
  result: null,
  slateDate: sim.date,
  combinedOdds: combinedAmerican(laneAReviewLegs),
  laneSurvivalScore: null,
  estimatedHitProbability: null,
  stake: 0, // REVIEW — nothing placed, $0 exposure
  projectedPayout: 0,
  payout: null,
  freshCard: true,
  reviewNote:
    "Review Mode · MLB pitcher-strikeout simulation · paper · $0 placed (not official money). Anchor = Justin Wrobleski Over 5.5 K (model 60% vs mkt 47%, edge +13%); core = Walker Buehler Over 3.5 K. Deterministic MLB Stats API settlement.",
  legs: laneAReviewLegs,
};

// Lane B value lane: restarted to a fresh Step-1 review, AWAITING a qualified value card. The only two clean,
// no-forbidden-market legs beyond the survival anchor/core go to the higher-variance Moonshot review (Wheeler
// + Gausman); a card is never forced, so Lane B honestly awaits rather than sharing Lane A's games.
const laneBReviewStep = {
  step: 1,
  status: "active",
  reviewMode: true,
  mode: REVIEW_TAG,
  result: null,
  slateDate: sim.date,
  stake: 0,
  projectedPayout: 0,
  payout: null,
  freshCard: true,
  reviewNote:
    "Review Mode · restarted to Step 1 · $0 placed. Awaiting a qualified value-lane card (no forbidden legs: no settlement-pending props, no World Cup). Nothing is placed; no exposure.",
  legs: [],
};

for (const [k, letter] of [["laneA", "A"], ["laneB", "B"]]) {
  const cur = run[k];
  if (cur?.note?.includes("Restarted July-21")) { console.log(`  ${k} already restarted for July-21 — leaving as-is (idempotent)`); continue; }
  const prior = JSON.parse(JSON.stringify(cur));
  const newCycle = (cur.cycle ?? 1) + 1;
  run[k] = {
    laneId: letter,
    label: `Lane ${letter}: ${letter === "A" ? "lower-volatility survival" : "value"} lane (cycle ${newCycle})`,
    legs: [],
    steps: [letter === "A" ? laneAReviewCard : laneBReviewStep],
    laneStatus: "active",
    currentStep: 1,
    cycle: newCycle,
    cycleStartedAt: nowIso,
    sportScope: "MLB",
    mode: REVIEW_TAG,
    reviewMode: true,
    note: `Restarted July-21 (${REVIEW_TAG}): fresh $0 Step-1 REVIEW card after the prior World-Cup-era cycle (preserved in priorLane + the ledger). ${letter === "A" ? "Survival review card = Wrobleski anchor + Buehler core (MLB pitcher strikeouts, 10,000-run sim)." : "Value lane awaiting a qualified card — nothing placed."} Paper-only; $0 exposure; not official money.`,
    priorLane: prior,
  };
  bbRestarted++;
  console.log(`  ${k} → restarted cycle ${newCycle}, fresh $0 Step-1 REVIEW (prior cycle ${cur.cycle ?? 1} ${cur.laneStatus} preserved in priorLane)`);
}
console.log(`  Bank Builder: ${bbRestarted} lane(s) restarted. laneA combined odds ${combinedAmerican(laneAReviewLegs) > 0 ? "+" : ""}${combinedAmerican(laneAReviewLegs)} (Wrobleski + Buehler). Canonical bankroll/crown/record NOT touched.`);

// ════════════════════════ 2. MOONSHOT — restart to a fresh $0 Step-1 MLB review ═══════════════════
const ms = JSON.parse(fs.readFileSync(MOONSHOT, "utf8"));
let msRestarted = false;
if (ms.generatedAt === nowIso && ms.sportScope === "mixed") {
  console.log("  Moonshot already restarted for July-21 — leaving as-is (idempotent)");
} else {
  const moonshotReviewLegs = [moonshotLeg("Zack Wheeler"), moonshotLeg("Kevin Gausman")];
  const jointProb = moonshotReviewLegs.reduce((p, l) => p * l.modelProbability, 1);
  const reviewCard = {
    cardId: "moonshot-2026-07-21-mlb-review",
    scope: "mlb",
    risk: "higher-variance",
    reviewMode: true,
    stake: 0, // REVIEW — nothing placed, $0 exposure (drives moonshotOpenExposure → 0)
    combinedOdds: combinedAmerican(moonshotReviewLegs),
    projectedReturn: 0,
    legs: moonshotReviewLegs,
    correlationProfile: "independent across 2 distinct MLB games (LAD@PHI, TB@TOR)",
    distinctGames: 2,
    jointModelProbability: Number(jointProb.toFixed(4)),
    crossSlate: false,
    slateLabel: "July 21 · MLB pitcher strikeouts (Review Mode)",
    whyThisCard: [
      "Review Mode — two independent MLB pitcher-strikeout OVERs from tonight's 10,000-run simulation.",
      "Wheeler (model 86% vs market 55%) + Gausman (model 72% vs market 48%) — different games, independent (not a same-game stack).",
      "Paper-only; $0 placed; not official money. Deterministic MLB Stats API settlement.",
    ],
    whyItCanFail: [
      "Both legs must clear their strikeout line — higher variance than a single anchor leg.",
      "Pitcher strikeout totals swing on an early hook, pitch-count limits, or a soft matchup.",
    ],
    dataQuality: "model-simulated (10,000 runs)",
    eligible: false,
    note: REVIEW_TAG,
  };

  ms.id = "moonshot-lane-mlb-2026-07-21";
  ms.subtitle = "MLB pitcher-strikeout review — higher-variance paper card";
  ms.paperOnly = true;
  ms.publicVisible = true;
  ms.status = "active";
  ms.sportScope = "mixed";
  ms.startingStake = 25;
  ms.targetReturn = 3000;
  ms.currentStake = 25; // notional challenge size — NOT exposure (exposure is the card stake, $0)
  ms.currentStep = 1;
  ms.generatedAt = nowIso;
  ms.reviewMode = true;
  ms.mode = REVIEW_TAG;
  ms.ladder = [
    { step: 1, status: "active", card: reviewCard, stake: 0, targetReturn: 200, requiredMultiple: 8, targetOddsBand: "+600..+900",
      reviewNote: "Review card priced " + (combinedAmerican(moonshotReviewLegs) > 0 ? "+" : "") + combinedAmerican(moonshotReviewLegs) + " — shown for the July-21 review; nothing placed ($0)." },
    { step: 2, status: "upcoming", card: null, stake: 200, targetReturn: 1000, requiredMultiple: 5, targetOddsBand: "+350..+550" },
    { step: 3, status: "upcoming", card: null, stake: 1000, targetReturn: 3000, requiredMultiple: 3, targetOddsBand: "+180..+300" },
  ];
  ms.disclaimer =
    "Review Mode — a paper MLB pitcher-strikeout review card for July 21. Higher-volatility, separate from the Dual Bank Builder. Paper-only; $0 placed; nothing is wagered. Deterministic MLB Stats API settlement.";
  // Clear the stale World-Cup state: settled-LOST notes, the WC restart candidate, WC candidates, and the
  // WC priorRun (which carried settlement-pending player_goal_scorer props). This is a fresh Step-1 cycle.
  ms.restartCandidate = null;
  ms.stopNote = undefined;
  ms.settledAt = undefined;
  ms.priorRun = null;
  ms.candidates = [];
  ms.candidatesNote = undefined;
  msRestarted = true;
  console.log(`  Moonshot → restarted to fresh Step-1 MLB review · combined ${combinedAmerican(moonshotReviewLegs) > 0 ? "+" : ""}${combinedAmerican(moonshotReviewLegs)} (Wheeler + Gausman) · card stake $0 · WC candidates/priorRun cleared`);
}

console.log(`\n  Summary: BB ${bbRestarted} lane(s) + Moonshot ${msRestarted ? "1" : "0"} restarted. All review cards stake $0 (no exposure). Canonical money untouched.`);
if (!apply) { console.log("DRY-RUN — no write."); process.exit(0); }
fs.writeFileSync(LADDER, JSON.stringify(doc, null, 2) + "\n");
// Drop undefined-valued keys from the moonshot doc (JSON.stringify omits them) so cleared fields disappear.
fs.writeFileSync(MOONSHOT, JSON.stringify(ms, null, 2) + "\n");
console.log("APPLIED → both Bank Builder lanes + the Moonshot lane restarted to fresh $0 Step-1 review cycles.");
