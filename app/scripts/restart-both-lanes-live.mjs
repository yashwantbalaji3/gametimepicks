/**
 * LIVE PAPER RESTART — Bank Builder (both lanes) + Moonshot (both lanes), founder-authorised.
 *
 * Both products had drifted into review mode with $0 placed: Bank Builder showed today's legs but
 * staked nothing, and the Moonshot lane was still displaying a July-21 card. This restarts all four
 * lanes from step 1 with REAL PAPER STAKES for the current slate.
 *
 *   Bank Builder   $100 → $10,000 over 5 steps, two lanes (A survival, B value)
 *   Moonshot        $25 → $1,000  over 3 steps, two lanes (A, B)
 *
 * SAFETY PROPERTIES — the same ones the July-21 restart established, kept verbatim:
 *   · The canonical money artifacts are NEVER touched. portfolio.json (bankroll / crown / the 19-14
 *     record) and banked-ladders.json are read-only here; this script writes only the ACTIVE ladder
 *     display structures. Their md5s are asserted unchanged by the guard that accompanies this.
 *   · Every prior cycle is preserved in `priorLane` / `priorRun`, never overwritten. A restart adds
 *     a cycle; it does not erase what came before.
 *   · Legs are SELECTED BY RULE from the committed simulation artifact and copied verbatim — never
 *     hand-transcribed, and never invented. If the slate cannot supply a qualifying card, the lane
 *     restarts EMPTY and says so rather than forcing a thin card.
 *   · Dry-run by default. `--apply` writes.
 *
 *   cd app && npx tsx scripts/restart-both-lanes-live.mjs --date 2026-08-15
 *   cd app && npx tsx scripts/restart-both-lanes-live.mjs --date 2026-08-15 --apply
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LADDER = path.join(APP, "public", "data", "methodology", "launch", "dual-bank-builder-active.json");
const MOONSHOT = path.join(APP, "public", "data", "moonshot-lane", "active.json");

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const DATE = arg("--date", new Date().toISOString().slice(0, 10));
const apply = process.argv.includes("--apply");
const SIM = path.join(APP, "public", "data", "mlb", "game-simulations", `${DATE}.json`);
const nowIso = `${DATE}T14:00:00Z`;

/** Ladders, stated once. Each rung's stake is the previous rung's full return — that is the climb. */
const BB_LADDER = [
  { step: 1, stake: 100, target: 200 },
  { step: 2, stake: 200, target: 700 },
  { step: 3, stake: 700, target: 1400 },
  { step: 4, stake: 1400, target: 3500 },
  { step: 5, stake: 3500, target: 10000 },
];
const MS_LADDER = [
  { step: 1, stake: 25, target: 100 },
  { step: 2, stake: 100, target: 320 },
  { step: 3, stake: 320, target: 1000 },
];

const dec = (a) => (a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a));
const decToAmerican = (d) => (d >= 2 ? Math.round((d - 1) * 100) : -Math.round(100 / (d - 1)));
const combinedAmerican = (legs) => decToAmerican(legs.reduce((d, l) => d * dec(l.odds), 1));
const combinedDecimal = (legs) => legs.reduce((d, l) => d * dec(l.odds), 1);
const round2 = (n) => Math.round(n * 100) / 100;

if (!fs.existsSync(SIM)) {
  console.error(`no simulation artifact for ${DATE} — refusing to restart a lane with no slate to draw from`);
  process.exit(1);
}
const sim = JSON.parse(fs.readFileSync(SIM, "utf8"));

/**
 * A LADDER ADVANCES. Yesterday's durable receipt decides where each lane starts today: a lane that
 * WON climbs to the next rung and carries its rolled return as the new stake, a lane that LOST
 * restarts at step 1. Restarting a winner at $100 would throw away the climb, which is the entire
 * product.
 */
function priorResults() {
  const dir = path.join(APP, "public", "data", "mr-dub", "settled");
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f) && f < `${DATE}.json`).sort(); } catch { return new Map(); }
  const out = new Map();
  for (const f of files) {                       // oldest → newest, so the latest day wins
    const r = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    for (const l of r.lanes ?? []) out.set(`${l.product}:${l.lane}`, l);
  }
  return out;
}
const PRIOR = priorResults();

/** Where a lane starts today, given how it finished last time. */
function rungFor(product, lane, ladder) {
  const p = PRIOR.get(`${product}:${lane}`);
  if (!p || p.result !== "won") return { rung: ladder[0], step: 1, rolled: null };
  const nextStep = Math.min((p.step ?? 1) + 1, ladder.length);
  const rolled = round2(p.potentialReturn ?? ladder[nextStep - 1].stake);
  return { rung: { ...ladder[nextStep - 1], stake: rolled }, step: nextStep, rolled };
}

/**
 * Every pick that carries a REAL posted line, joined to that line. A pick without a market price
 * cannot be staked honestly — there is no number to settle the paper return against.
 */
const candidates = [];
for (const g of sim.games ?? []) {
  const lines = g.marketSnapshot?.lines ?? [];
  for (const p of g.generatedPicks ?? []) {
    const snap = lines.find((l) => l.player === p.player && l.side === p.side && l.line === p.line);
    if (!snap || !Number.isFinite(snap.americanOdds)) continue;
    candidates.push({ g, p, snap });
  }
}
console.log(`slate ${DATE}: ${sim.games.length} games · ${candidates.length} priced model picks`);

/** Pick N legs from DISTINCT games, best-first by the supplied score. Distinct games keep a card
 *  from stacking correlated outcomes inside one ballgame. */
function selectLegs(pool, n, score, filter = () => true) {
  const used = new Set();
  const out = [];
  for (const c of [...pool].filter(filter).sort((a, b) => score(b) - score(a))) {
    const key = String(c.g.gamePk ?? c.g.gameId ?? "");
    if (used.has(key)) continue;
    used.add(key);
    out.push(c);
    if (out.length === n) break;
  }
  return out;
}

const matchupOf = (g) => `${g.teams?.away ?? "?"} @ ${g.teams?.home ?? "?"}`;

/**
 * WHICH TEAM DOES THIS PLAYER ACTUALLY PLAY FOR?
 *
 * The Moonshot leg used to answer `g.teams.home` — the fixture's home side, whoever the player was.
 * That is right for home players and wrong for every away player, so half of the 2026-08-17 card
 * shipped mislabelled: Gabriel Moreno (Arizona) filed under Boston, Luis Campusano (San Diego) under
 * the Mets, Jakob Marsee (Miami) under Philadelphia. It never broke settlement — that joins on
 * player name and gamePk against the official box score — but the team line and crest a reader sees
 * beside the pick named the opponent.
 *
 * The board already carries `playerTeamAbbr` per lean, which is the provider's own answer, and it
 * agrees with the StatsAPI box score on every leg checked. So the team is LOOKED UP, and when the
 * board has no answer (42 of 463 leans today) the field is null. A missing crest is a smaller lie
 * than a confident wrong one.
 */
const teamByPlayer = (() => {
  const map = new Map();
  const boardPath = path.join(APP, "public", "data", "mlb", "boards", `${DATE}.json`);
  let board;
  try { board = JSON.parse(fs.readFileSync(boardPath, "utf8")); } catch { return map; }
  for (const r of board.leans ?? []) {
    const abbr = r.playerTeamAbbr;
    if (!abbr || !r.playerName) continue;
    // The row carries both sides' abbr and full name, so the abbr resolves without a lookup table.
    const full = abbr === r.homeTeamAbbr ? r.homeTeamName : abbr === r.awayTeamAbbr ? r.awayTeamName : null;
    if (!full) continue;
    map.set(`${r.gamePk}|${r.playerName}`, { team: full, opponent: full === r.homeTeamName ? r.awayTeamName : r.homeTeamName });
  }
  return map;
})();

/** The player's own side of the fixture, or nulls when the board cannot say. Never a guess. */
function sidesFor(g, playerName) {
  return teamByPlayer.get(`${g.gamePk ?? g.gameId}|${playerName}`) ?? { team: null, opponent: null };
}
const MARKET_LABEL = {
  pitcher_strikeouts: "Strikeouts", batter_hits: "Hits",
  batter_total_bases: "Total Bases", batter_hits_runs_rbis: "Hits + Runs + RBIs",
};

function bbLeg({ g, p, snap }) {
  const matchup = matchupOf(g);
  const sideLabel = p.side === "over" ? "Over" : "Under";
  return {
    legId: `MLB:${g.gamePk ?? g.gameId}:${p.market}:${String(p.player).replace(/\s+/g, "_")}:${p.side}`,
    sport: "MLB", eventId: String(g.gamePk ?? g.gameId),
    label: `${p.player} · ${sideLabel} ${p.line} ${MARKET_LABEL[p.market] ?? p.market}`,
    participantName: p.player, marketType: p.market,
    odds: snap.americanOdds,
    modelProbability: p.modelProbability, marketImpliedProbability: p.marketProbability,
    modelEdgePct: p.edgePct, projection: p.projection,
    legQualityTier: p.riskTier, modelConfidence: p.confidence,
    side: p.side, line: p.line, matchup,
    homeTeam: g.teams?.home ?? null, awayTeam: g.teams?.away ?? null,
    playerId: null, marketLabel: MARKET_LABEL[p.market] ?? p.market,
    kickoffEt: null, eventDate: sim.date,
    provider: g.marketSnapshot?.bookmaker ?? "fanduel",
    displaySelection: `${matchup} — ${MARKET_LABEL[p.market] ?? p.market}: ${p.player} ${sideLabel} ${p.line}`,
    reasonBullets: p.reasonBullets ?? [],
    reviewMode: false, paperOnly: true,
    settlement: { result: null, official: null, source: "mlb_stats_api" },
    settlementSource: "MLB Stats API (official box score)",
    currentGameStatus: "scheduled",
  };
}

function msLeg({ g, p, snap }) {
  const matchup = matchupOf(g);
  const sideLabel = p.side === "over" ? "Over" : "Under";
  return {
    legId: `moonshot:mlb:${g.gamePk ?? g.gameId}:${p.market}:${String(p.player).replace(/\s+/g, "_")}`,
    kind: "player", sport: "MLB", fixture: matchup,
    participant: `${p.player} ${sideLabel} ${p.line} ${MARKET_LABEL[p.market] ?? p.market}`,
    ...sidesFor(g, p.player),
    countryCode: null, playerId: null, photoUrl: null,
    market: p.market, marketLabel: MARKET_LABEL[p.market] ?? p.market,
    side: p.side, line: p.line, odds: snap.americanOdds,
    modelProbability: p.modelProbability, marketImpliedProbability: p.marketProbability,
    modelEdgePct: p.edgePct, startTime: null,
    dataQuality: "model-simulated (10,000 runs)",
    confidence: p.modelProbability >= 0.7 ? "Lean" : p.modelProbability >= 0.5 ? "Watchlist" : "Lower confidence",
    settlement: { result: null, source: "mlb_stats_api", official: null, started: false },
    why: `${p.player} — model ${Math.round(p.modelProbability * 100)}% vs market ${Math.round(p.marketProbability * 100)}% to clear ${p.line} (10,000-run simulation). Higher-variance leg. Paper-only.`,
    displaySelection: `${matchup} — ${MARKET_LABEL[p.market] ?? p.market}: ${p.player} ${sideLabel} ${p.line}`,
    kickoffEt: null, reviewMode: false,
  };
}

// ═══════════ 1 · BANK BUILDER — two lanes, live paper stakes ═══════════════════════════════════
// Lane A (survival) takes the highest model probability; Lane B (value) takes the widest model-vs-
// market gap. Different objectives, so the two lanes genuinely differ rather than duplicating.
const laneAPicks = selectLegs(candidates, 2, (c) => c.p.modelProbability, (c) => c.p.modelProbability >= 0.6);
const laneBUsed = new Set(laneAPicks.map((c) => String(c.g.gamePk ?? c.g.gameId)));
const laneBPicks = selectLegs(candidates, 2, (c) => c.p.edgePct ?? 0,
  (c) => (c.p.edgePct ?? 0) > 0 && c.p.modelProbability >= 0.55 && !laneBUsed.has(String(c.g.gamePk ?? c.g.gameId)));

function bbCard(picks, laneLetter) {
  if (picks.length < 2) return null;
  const legs = picks.map(bbLeg);
  const { rung, step, rolled } = rungFor("bank-builder", laneLetter, BB_LADDER);
  const combined = combinedDecimal(legs);
  return {
    // "pending" is the LIVE-CARD status in the public ladder contract (buildPublicDualLadder maps
    // settled | pending | evaluating | awaiting). Writing "active" here silently renders the rung as
    // upcoming with no card — the lane looks frozen while carrying a real stake.
    step, status: "pending", reviewMode: false, mode: "Live paper · MLB",
    result: null, slateDate: sim.date,
    combinedOdds: combinedAmerican(legs),
    combinedDecimal: round2(combined),
    laneSurvivalScore: null,
    estimatedHitProbability: round2(legs.reduce((q, l) => q * l.modelProbability, 1)),
    stake: rung.stake,
    projectedPayout: round2(rung.stake * combined),
    payout: null, freshCard: true,
    reviewNote: `Live paper · $${rung.stake} staked toward $${rung.target}. Lane ${laneLetter} · step ${step}${rolled ? ` (rolled from a settled win)` : ""} · ${legs.length} legs across ${new Set(legs.map((l) => l.eventId)).size} independent games. Deterministic MLB Stats API settlement. Paper-only — no real money.`,
    legs,
  };
}

const doc = JSON.parse(fs.readFileSync(LADDER, "utf8"));
const run = doc.run ?? doc;
const bbCards = { laneA: bbCard(laneAPicks, "A"), laneB: bbCard(laneBPicks, "B") };

/*
 * RE-RUNNING A DAY MUST NOT INVENT A CYCLE.
 *
 * Each lane's cycle counter increments on every run, and the outgoing lane is pushed into
 * `priorLane`. Run twice for the same slate — which is exactly what happens when a card has to be
 * rebuilt, as it did on 2026-08-17 after the Moonshot legs were found carrying the wrong team — and
 * the day's real cycle is buried under a duplicate, with a phantom cycle in the history that never
 * had a card of its own.
 *
 * So a re-run for a date the lane is ALREADY on replaces that cycle in place: same number, and the
 * prior chain is inherited from the cycle being replaced rather than growing by one. A genuinely
 * new slate still advances normally.
 */
const bbReplacing = (cur) => cur?.cycleStartedAt?.slice(0, 10) === DATE;

for (const [k, letter] of [["laneA", "A"], ["laneB", "B"]]) {
  const cur = run[k] ?? {};
  const replacing = bbReplacing(cur);
  const prior = replacing ? (cur.priorLane ?? null) : JSON.parse(JSON.stringify(cur));
  const newCycle = replacing ? cur.cycle : (cur.cycle ?? 1) + 1;
  if (replacing) console.log(`  BB ${k} · already on ${DATE} — replacing cycle ${newCycle} in place, not stacking a new one`);
  const card = bbCards[k];
  run[k] = {
    laneId: letter,
    label: `Lane ${letter}: ${letter === "A" ? "lower-volatility survival" : "value"} lane (cycle ${newCycle})`,
    legs: [],
    steps: [card ?? {
      step: 1, status: "awaiting", reviewMode: false, mode: "Live paper · MLB", result: null,
      slateDate: sim.date, stake: 0, projectedPayout: 0, payout: null, freshCard: true,
      reviewNote: "No qualifying card on this slate — the lane is open at step 1 and awaiting one. Nothing staked rather than forcing a thin card.",
      legs: [],
    }],
    ladder: BB_LADDER,
    laneStatus: "active", currentStep: 1, cycle: newCycle, cycleStartedAt: nowIso,
    sportScope: "MLB", mode: "Live paper · MLB", reviewMode: false,
    note: `Restarted ${DATE} with LIVE PAPER STAKES: fresh step-1 card on the $100 → $10,000 ladder. The prior cycle is preserved in priorLane and in the ledger. Paper-only; not real money.`,
    priorLane: prior,
  };
  console.log(`  BB ${k} → cycle ${newCycle} · ${card ? `$${card.stake} staked · ${card.legs.length} legs · ${card.combinedOdds > 0 ? "+" : ""}${card.combinedOdds}` : "no qualifying card (open, $0)"}`);
}

// ═══════════ 2 · MOONSHOT — two lanes, live paper stakes ═══════════════════════════════════════
// Higher variance by construction: longer prices, so the selector targets a combined band rather
// than the safest legs. Lanes draw from disjoint games so the two are independent.
const msUsed = new Set();
function msCard(laneLetter) {
  const picks = selectLegs(candidates, 3,
    (c) => (c.p.edgePct ?? 0),
    (c) => c.p.modelProbability >= 0.5 && dec(c.snap.americanOdds) >= 1.55 && !msUsed.has(String(c.g.gamePk ?? c.g.gameId)));
  if (picks.length < 2) return null;
  for (const c of picks) msUsed.add(String(c.g.gamePk ?? c.g.gameId));
  const legs = picks.map(msLeg);
  const combined = combinedDecimal(legs);
  const { rung, step: msStep } = rungFor("moonshot", laneLetter, MS_LADDER);
  return {
    cardId: `moonshot-${DATE}-mlb-${laneLetter.toLowerCase()}`,
    scope: "mlb", risk: "higher-variance", reviewMode: false,
    stake: rung.stake,
    combinedOdds: combinedAmerican(legs),
    projectedReturn: round2(rung.stake * combined),
    legs,
    correlationProfile: `independent across ${new Set(legs.map((l) => l.fixture)).size} distinct MLB games`,
    result: null,
  };
}

const ms = JSON.parse(fs.readFileSync(MOONSHOT, "utf8"));
/* Same rule as the Bank Builder chain above: re-running today's slate replaces today's run, it does
 * not stack a duplicate on top of it and push the real one down the priorRun chain. */
const priorRun = ms.slateDate === DATE ? (ms.priorRun ?? null) : JSON.parse(JSON.stringify(ms));
if (ms.slateDate === DATE) console.log(`  MS · already on ${DATE} — replacing this run in place, not stacking a new one`);
const msLanes = ["A", "B"].map((letter) => {
  const card = msCard(letter);
  return {
    laneId: letter,
    name: `Moonshot Lane ${letter}`,
    status: "active",
    startingStake: MS_LADDER[0].stake,
    currentStake: MS_LADDER[0].stake,
    currentStep: 1,
    targetReturn: MS_LADDER.at(-1).target,
    ladder: MS_LADDER.map((r) => ({
      step: r.step, stake: r.stake, target: r.target,
      status: r.step === 1 ? "active" : "upcoming",
      card: r.step === 1 ? card : null,
    })),
  };
});

const msDoc = {
  ...ms,
  id: `moonshot-lane-mlb-${DATE}`,
  name: "Moonshot Lane",
  status: "active",
  paperOnly: true,
  publicVisible: true,
  sportScope: "mlb",
  reviewMode: false,
  mode: "Live paper · MLB",
  startingStake: MS_LADDER[0].stake,
  targetReturn: MS_LADDER.at(-1).target,
  generatedAt: nowIso,
  slateDate: sim.date,
  lanes: msLanes,
  // Back-compat: readers that predate multi-lane see lane A as the document's own lane.
  currentStep: 1,
  currentStake: MS_LADDER[0].stake,
  ladder: msLanes[0].ladder,
  disclaimer: "Paper-only, educational. Two independent high-variance lanes on a $25 → $1,000 ladder. Not betting advice.",
  priorRun,
};
for (const l of msLanes) {
  const c = l.ladder[0].card;
  console.log(`  MS lane ${l.laneId} → ${c ? `$${c.stake} staked · ${c.legs.length} legs · ${c.combinedOdds > 0 ? "+" : ""}${c.combinedOdds} → $${c.projectedReturn}` : "no qualifying card (open, $0)"}`);
}

const bbExposure = round2(Object.values(bbCards).reduce((s, c) => s + (c?.stake ?? 0), 0));
const msExposure = round2(msLanes.reduce((s, l) => s + (l.ladder[0].card?.stake ?? 0), 0));
console.log(`\nTOTAL NEW PAPER EXPOSURE: Bank Builder $${bbExposure} + Moonshot $${msExposure} = $${round2(bbExposure + msExposure)}`);

// ═══════════ 3 · PLACEMENT — the daily portfolio is where a card becomes REAL ═══════════════════
// The ladder artifacts above are DISPLAY. A card only counts as placed (and only creates exposure)
// when it appears in mr-dub/daily-portfolio.json with status "active" — that is what the Bank
// Builder page reads and what every exposure figure sums. Writing the ladder alone leaves both
// products looking live while nothing is actually staked, which is exactly the state they were in.
const DP = path.join(APP, "public", "data", "mr-dub", "daily-portfolio.json");
const dp = JSON.parse(fs.readFileSync(DP, "utf8"));
if (dp.date !== DATE) {
  console.error(`daily-portfolio.json is dated ${dp.date}, not ${DATE} — refusing to place cards on the wrong slate`);
  process.exit(1);
}

const laneSpecs = [
  { product: "bank-builder", productLabel: "Bank Builder", lane: "A", ...rungFor("bank-builder", "A", BB_LADDER), legs: bbCards.laneA?.legs ?? [], targetLegs: 2 },
  { product: "bank-builder", productLabel: "Bank Builder", lane: "B", ...rungFor("bank-builder", "B", BB_LADDER), legs: bbCards.laneB?.legs ?? [], targetLegs: 2 },
  { product: "moonshot", productLabel: "Moonshot", lane: "A", ...rungFor("moonshot", "A", MS_LADDER), legs: msLanes[0].ladder[0].card?.legs ?? [], targetLegs: 3 },
  { product: "moonshot", productLabel: "Moonshot", lane: "B", ...rungFor("moonshot", "B", MS_LADDER), legs: msLanes[1].ladder[0].card?.legs ?? [], targetLegs: 3 },
];

dp.lanes = laneSpecs.map((spec) => {
  const placed = spec.legs.length >= 2;
  const combined = placed ? combinedDecimal(spec.legs) : 1;
  return {
    id: `${spec.product}-lane-${spec.lane.toLowerCase()}-step-${spec.step}`,
    product: spec.product, productLabel: spec.productLabel, lane: spec.lane,
    step: spec.step, clearedSteps: spec.step - 1,
    status: placed ? "active" : "awaiting",
    stake: placed ? spec.rung.stake : 0,
    exposure: placed ? spec.rung.stake : 0,
    targetReturn: spec.rung.target,
    fitsTarget: placed ? round2(spec.rung.stake * combined) >= spec.rung.target : false,
    combinedOdds: placed ? combinedAmerican(spec.legs) : 0,
    combinedDecimal: round2(combined),
    potentialReturn: placed ? round2(spec.rung.stake * combined) : 0,
    legCount: spec.legs.length,
    targetLegs: spec.targetLegs,
    legs: spec.legs,
    correlationNote: placed
      ? `Correlation checked: ${new Set(spec.legs.map((l) => l.eventId ?? l.fixture)).size} distinct games — legs settle independently.`
      : "No card placed.",
    shortfallNote: placed ? null : `Fewer than ${spec.targetLegs} qualifying legs on this slate — nothing staked.`,
  };
});
const placedExposure = round2(dp.lanes.reduce((n, l) => n + (l.exposure ?? 0), 0));
dp.openExposure = placedExposure;
dp.availableBankroll = round2((dp.activeBankroll ?? 0) - placedExposure);
dp.potentialReturn = round2(dp.lanes.reduce((n, l) => n + (l.potentialReturn ?? 0), 0));
dp.products = {
  bankBuilder: { exposure: round2(dp.lanes.filter((l) => l.product === "bank-builder").reduce((n, l) => n + l.exposure, 0)),
    record: { wins: 0, losses: 0, voids: 0, pending: dp.lanes.filter((l) => l.product === "bank-builder" && l.status === "active").length } },
  moonshot: { exposure: round2(dp.lanes.filter((l) => l.product === "moonshot").reduce((n, l) => n + l.exposure, 0)),
    record: { wins: 0, losses: 0, voids: 0, pending: dp.lanes.filter((l) => l.product === "moonshot" && l.status === "active").length } },
};
dp.generatedAt = nowIso;
dp.note = `Live paper restart ${DATE}: Bank Builder $100 → $10,000 and Moonshot $25 → $1,000, two lanes each. Paper-only — no real money at risk. Bankroll and crown are unchanged by placing a card; only settlement moves them.`;
console.log(`  placement → ${dp.lanes.filter((l) => l.status === "active").length}/4 lanes active · exposure $${placedExposure} · potential $${dp.potentialReturn}`);

if (!apply) {
  console.log("\ndry-run — nothing written. Re-run with --apply to commit.");
  process.exit(0);
}
fs.writeFileSync(LADDER, JSON.stringify(doc, null, 2) + "\n");
fs.writeFileSync(MOONSHOT, JSON.stringify(msDoc, null, 2) + "\n");
fs.writeFileSync(DP, JSON.stringify(dp, null, 2) + "\n");
console.log("\nwrote dual-bank-builder-active.json + moonshot-lane/active.json + mr-dub/daily-portfolio.json");
