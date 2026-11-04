/**
 * bbm-rules@2 leg construction (rules-v2.mjs) on SYNTHETIC legs and a SYNTHETIC snapshot: no real price, no network.
 *   npx tsx --test src/lib/challenge-lanes/rules-v2.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { canonical, sha256, verifyChain, serializeEvents } from "./chain.mjs";
import { runStarted, laneState, append, isTerminal, STATUS } from "./lanes.mjs";
import { RULES_V2, RULES_VERSION, stepPosition, evaluateSet, evaluateCandidates, decideLane, constructLanePair, rankingDigest, withdrawAndRetire, runStartedV2, positionOf } from "./rules-v2.mjs";

const NOW = "2026-11-04T18:00:00Z";
const FETCHED = "2026-11-04T17:00:16Z";
const MODEL = "test-model";
const CAL = { [MODEL]: { status: "QUALIFIED", sampleSize: 500, probabilityHalfWidth: 0.02, source: "test" } };
const TEAMS = { DET: "Detroit Pistons", PHI: "Philadelphia 76ers", SA: "San Antonio Spurs", DAL: "Dallas Mavericks", BKN: "Brooklyn Nets", CHA: "Charlotte Hornets", SAC: "Sacramento Kings", LAL: "Los Angeles Lakers", PHX: "Phoenix Suns", POR: "Portland Trail Blazers", BOS: "Boston Celtics", MIL: "Milwaukee Bucks", NY: "New York Knicks", CHI: "Chicago Bulls" };

/* game: [id, away, home, side, model p, sidePrice, otherPrice, flags] */
function world(games, { books = ["draftkings", "fanduel", "betmgm"], fetchedAt = FETCHED } = {}) {
  const legs = games.map(([id, away, home, side, p, , , flags = []]) => ({
    legId: `nba:${id}:winner`, sport: "nba", eventId: id, eventLabel: `${away} @ ${home}`, startUtc: `2026-11-05T0${Number(id) % 4}:00Z`, market: "winner",
    selection: { code: side, teamAbbr: side === "home" ? home : away }, probability: p, forecast: { modelId: MODEL, receiptSha256: sha256(`f${id}`) },
    guard: { state: flags.length ? "review" : "pass", flags },
  }));
  const g = {};
  for (const [id, away, home, side, , sp, op] of games) {
    const q = side === "home" ? { home: sp, away: op } : { home: op, away: sp };
    g[id] = { oddsEventId: `o${id}`, homeTeam: TEAMS[home], awayTeam: TEAMS[away], commenceTime: null, books: Object.fromEntries(books.map((b) => [b, { home: { name: TEAMS[home], price: q.home }, away: { name: TEAMS[away], price: q.away }, lastUpdate: fetchedAt }])) };
  }
  const doc = { schema: "gtp.bbm.price-snapshot@1", dataClass: "PRIVATE_PRICES", provider: "the-odds-api", market: "h2h", fetchedAt, games: g };
  return { legs, snapshot: { ...doc, snapshotSha256: sha256(canonical(doc)) } };
}
const BB1 = stepPosition({ product: "bank-builder", step: 1, bankrollCents: 10000 });
const MS1 = stepPosition({ product: "moonshot", step: 1, bankrollCents: 2500 });
const ctx = (snapshot, position, extra = {}) => ({ snapshot, position, now: NOW, calibration: CAL, ...extra });

test("step targets, required multiplier and the ±10% band (founder-approval parameter)", () => {
  assert.deepEqual(RULES_V2.products["bank-builder"].stepTargetsCents, [20000, 50000, 125000, 312500, 1000000]);
  assert.deepEqual(RULES_V2.products.moonshot.stepTargetsCents, [5000, 10000, 20000, 40000, 100000]);
  assert.deepEqual([BB1.targetCents, BB1.requiredMultiplier, BB1.band.loCents, BB1.band.hiCents], [20000, 2, 18000, 22000]);
  assert.deepEqual([MS1.targetCents, MS1.band.loCents, MS1.band.hiCents], [5000, 4500, 5500]);
  assert.equal(RULES_V2.parameters.bandPct.state, "PROPOSED");
  assert.equal(stepPosition({ product: "moonshot", step: 2, bankrollCents: 10000 }).ok, false, "a bankroll already at the target is refused, never re-staked");
  assert.match(stepPosition({ product: "moonshot", step: 6, bankrollCents: 100 }).refusal, /STEP_OUT_OF_RANGE/);
});

test("a ~2× single qualifies; the old 5-leg Moonshot card fails (LEG_COUNT_EXCEEDED)", () => {
  const w = world([["1", "PHI", "DET", "home", 0.6, 100, -120], ["2", "DAL", "SA", "home", 0.9, -600, 450], ["3", "CHA", "BKN", "away", 0.9, -500, 400], ["4", "MIL", "BOS", "home", 0.9, -550, 420], ["5", "CHI", "NY", "home", 0.9, -590, 440]]);
  const single = evaluateSet([w.legs[0]], ctx(w.snapshot, MS1));
  assert.equal(single.qualified, true, single.reasons.join("; "));
  assert.deepEqual([single.legCount, single.money.grossPayoutCents, single.price.combined.american], [1, 5000, 100]);
  const five = evaluateSet(w.legs, ctx(w.snapshot, MS1));
  assert.equal(five.qualified, false);
  assert.ok(five.reasons.includes("LEG_COUNT_EXCEEDED"));
  assert.ok(evaluateCandidates({ legs: w.legs, ...ctx(w.snapshot, MS1) }).candidates.every((c) => c.legCount <= 2), "never more than 2 legs");
});

test("a two-leg card near 2× qualifies, with the independence assumption stated", () => {
  const w = world([["1", "PHI", "DET", "home", 0.65, -140, 120], ["2", "DAL", "SA", "home", 0.9, -600, 450]]);
  const two = evaluateSet(w.legs, ctx(w.snapshot, BB1));
  assert.equal(two.qualified, true, two.reasons.join("; "));
  assert.equal(two.price.combined.method, "CALCULATED_LEG_PRODUCT");
  assert.match(two.probability.assumption, /^INDEPENDENT/);
  assert.equal(two.money.grossPayoutCents, 20000); // 10000 × (240/140)(700/600) = exactly 2.0
});

test("band enforcement: outside ±10% is refused and the band is never widened by code; a founder override is explicit", () => {
  const w = world([["1", "POR", "PHX", "home", 0.52, 130, -155]]);
  const r = evaluateSet(w.legs, ctx(w.snapshot, BB1));
  assert.ok(r.reasons.some((x) => x.startsWith("OUT_OF_BAND")), "+130 → $230 > $220");
  const wide = stepPosition({ product: "bank-builder", step: 1, bankrollCents: 10000, params: { bandPct: 0.2 } });
  assert.equal(evaluateSet(w.legs, ctx(w.snapshot, wide, { params: { bandPct: 0.2 } })).qualified, true);
});

test("none in band → HELD / NO_QUALIFIED_CARD with reasons", () => {
  const w = world([["1", "PHI", "DET", "home", 0.95, -1000, 700], ["2", "DAL", "SA", "home", 0.95, -1000, 700]]);
  const ev = evaluateCandidates({ legs: w.legs, ...ctx(w.snapshot, BB1) });
  assert.equal(ev.counts.inBand, 0);
  const d = decideLane(ev);
  assert.deepEqual([d.status, d.code, d.inBand], ["HELD", "NO_QUALIFIED_CARD", 0]);
  assert.ok(d.reasonCounts.OUT_OF_BAND >= 3);
});

test("no +EV: the bb-b case (model 45.7% vs a break-even near 54%) is refused", () => {
  const w = world([["1", "CHA", "BKN", "away", 0.6862, -170, 145], ["2", "LAL", "SAC", "away", 0.6653, -600, 450]]);
  const r = evaluateSet(w.legs, ctx(w.snapshot, BB1, { params: { maxModelMarketGap: 1 } }));
  assert.equal(r.qualified, false);
  assert.ok(r.reasons.some((x) => x.startsWith("NEGATIVE_EV")), r.reasons.join("; "));
  assert.equal(Math.round(r.probability.joint * 1000), 457);
  assert.equal(Math.round(r.probability.breakEven * 1000), 540);
});

test("EV with uncertainty: a positive point EV that turns negative at the calibration lower bound is refused", () => {
  const w = world([["1", "PHI", "DET", "home", 0.52, 100, -120]]);
  const r = evaluateSet(w.legs, ctx(w.snapshot, MS1, { calibration: { [MODEL]: { ...CAL[MODEL], probabilityHalfWidth: 0.05 } } }));
  assert.ok(r.ev > 0);
  assert.ok(r.reasons.some((x) => x.startsWith("EV_NOT_ROBUST")));
});

test("bad odds: an unparseable price and a two-way quote below 100% implied are refused", () => {
  const w = world([["1", "PHI", "DET", "home", 0.6, 100, 50]]);
  assert.ok(evaluateSet(w.legs, ctx(w.snapshot, MS1)).reasons.some((x) => x.startsWith("BAD_ODDS")));
  const arb = world([["1", "PHI", "DET", "home", 0.6, 100, 110]]);
  assert.ok(evaluateSet(arb.legs, ctx(arb.snapshot, MS1)).reasons.some((x) => /BAD_ODDS .*< 1/.test(x)));
});

test("correlated legs: two legs from one game are refused (no provider-quoted same-game price)", () => {
  const w = world([["1", "PHI", "DET", "home", 0.6, 100, -120]]);
  const other = { ...w.legs[0], legId: "nba:1:winner:away", selection: { code: "away", teamAbbr: "PHI" } };
  assert.ok(evaluateSet([w.legs[0], other], ctx(w.snapshot, MS1)).reasons.some((x) => x.startsWith("CORRELATED_SAME_GAME")));
});

test("injury/status: OUT everywhere, R1 refused in Bank Builder only, and a post-freeze status override refuses", () => {
  const w = world([["1", "PHI", "DET", "home", 0.6, 100, -120, ["FAVOURED_ROTATION_R1"]], ["2", "DAL", "SA", "home", 0.6, 100, -120, ["FAVOURED_ROTATION_OUT"]], ["3", "CHA", "BKN", "away", 0.6, 100, -120]]);
  const BB = (l) => evaluateSet([l], ctx(w.snapshot, BB1));
  const MSr = (l, o) => evaluateSet([l], ctx(w.snapshot, MS1, { injuryOverrides: o }));
  assert.ok(BB(w.legs[0]).reasons.some((x) => x.startsWith("INJURY_STATUS")), "R1 in BB");
  assert.equal(evaluateSet([w.legs[0]], ctx(w.snapshot, MS1)).qualified, true, "R1 shown in Moonshot");
  assert.ok(MSr(w.legs[1]).reasons.some((x) => x.startsWith("INJURY_STATUS")), "OUT in MS");
  assert.ok(MSr(w.legs[2], { [w.legs[2].legId]: "OUT LaMelo Ball" }).reasons.some((x) => x.startsWith("INJURY_STATUS")));
});

test("uncalibrated: no evidence, a not-qualified model, or too small a sample refuses", () => {
  const w = world([["1", "PHI", "DET", "home", 0.6, 100, -120]]);
  const why = (calibration) => evaluateSet(w.legs, ctx(w.snapshot, MS1, { calibration })).reasons.join("; ");
  assert.match(why(null), /CALIBRATION_MISSING/);
  assert.match(why({ [MODEL]: { status: "NOT_QUALIFIED" } }), /UNCALIBRATED/);
  assert.match(why({ [MODEL]: { status: "QUALIFIED", sampleSize: 40, probabilityHalfWidth: 0.02 } }), /SAMPLE_TOO_SMALL/);
});

test("market gates: stale snapshot, model–market gap, leg price bounds, market depth", () => {
  const stale = world([["1", "PHI", "DET", "home", 0.6, 100, -120]], { fetchedAt: "2026-11-04T15:00:00Z" });
  assert.ok(evaluateSet(stale.legs, ctx(stale.snapshot, MS1)).reasons.some((x) => x.startsWith("MARKET_STALE")));
  const gap = world([["1", "MIA", "LAL", "home", 0.63, 175, -210]].map((g) => ["1", "PHI", "DET", ...g.slice(3)]));
  assert.ok(evaluateSet(gap.legs, ctx(gap.snapshot, MS1)).reasons.some((x) => x.startsWith("MODEL_MARKET_GAP")));
  const thin = world([["1", "PHI", "DET", "home", 0.6, 100, -120]], { books: ["draftkings"] });
  assert.ok(evaluateSet(thin.legs, ctx(thin.snapshot, MS1)).reasons.some((x) => /MARKET_THRESHOLD .*books/.test(x)));
  const long = world([["1", "PHI", "DET", "home", 0.3, 600, -900]]);
  assert.ok(evaluateSet(long.legs, ctx(long.snapshot, MS1)).reasons.some((x) => /MARKET_THRESHOLD .*decimal/.test(x)));
});

test("payout arithmetic: exact ratio, floored to the cent, carried stakes", () => {
  const w = world([["1", "PHI", "DET", "home", 0.6, -110, -110]]);
  const p = stepPosition({ product: "moonshot", step: 2, bankrollCents: 5240 });
  const r = evaluateSet(w.legs, ctx(w.snapshot, p, { params: { bandPct: 0.5 } }));
  assert.deepEqual([r.money.stakeCents, r.money.grossPayoutCents, r.money.profitCents], [5240, 10003, 4763]); // 5240 × 210/110 = 10003.6…
  assert.deepEqual(r.price.combined.ratio, { n: "210", d: "110" });
});

test("ranking: by calibrated EV, then fewer legs, then closeness to target — never by payout; reproducible", () => {
  const w = world([["1", "PHI", "DET", "home", 0.6, 100, -120], ["2", "DAL", "SA", "home", 0.6, 105, -125], ["3", "CHA", "BKN", "away", 0.9, -500, 400], ["4", "MIL", "BOS", "home", 0.92, -550, 420]]);
  const ev = evaluateCandidates({ legs: w.legs, ...ctx(w.snapshot, MS1) });
  assert.ok(ev.ranked.length >= 2);
  for (let i = 1; i < ev.ranked.length; i++) assert.ok(Math.floor(ev.ranked[i - 1].evLow / 0.01) >= Math.floor(ev.ranked[i].evLow / 0.01), "EV order");
  const top = ev.ranked[0];
  assert.equal(top.legs[0].team, "SA", "highest calibrated EV first, not the highest payout");
  const again = evaluateCandidates({ legs: [...w.legs].reverse(), ...ctx(w.snapshot, MS1) });
  assert.equal(rankingDigest(again), rankingDigest(ev), "same inputs in any order → same ranking");
});

test("A/B: B is game-disjoint from A, passes the same gates, and is HELD rather than weaker", () => {
  const w = world([["1", "PHI", "DET", "home", 0.6, 105, -125], ["2", "DAL", "SA", "home", 0.6, 100, -120], ["3", "CHA", "BKN", "away", 0.52, 100, -120]]);
  const r = constructLanePair({ legs: w.legs, snapshot: w.snapshot, now: NOW, product: "moonshot", laneA: { step: 1, bankrollCents: 2500 }, laneB: { step: 1, bankrollCents: 2500 }, calibration: CAL });
  assert.equal(r.A.status, "READY");
  assert.equal(r.B.status, "READY");
  const ga = new Set(r.A.candidate.legs.map((l) => l.gameId));
  assert.ok(r.B.candidate.legs.every((l) => !ga.has(l.gameId)));
  const only = world([["1", "PHI", "DET", "home", 0.6, 105, -125], ["3", "CHA", "BKN", "away", 0.4, 100, -120]]);
  const h = constructLanePair({ legs: only.legs, snapshot: only.snapshot, now: NOW, product: "moonshot", laneA: { step: 1, bankrollCents: 2500 }, laneB: { step: 1, bankrollCents: 2500 }, calibration: CAL });
  assert.deepEqual([h.A.status, h.B.status, h.B.code], ["READY", "HELD", "NO_QUALIFIED_CARD"], "the only other card is −EV: B is held, not filled");
  const indep = constructLanePair({ legs: w.legs, snapshot: w.snapshot, now: NOW, product: "moonshot", laneA: { step: 1, bankrollCents: 2500 }, laneB: { step: 2, bankrollCents: 5240 }, calibration: CAL, params: { bandPct: 0.1 } });
  assert.equal(indep.evaluation.B.position.targetCents, 10000, "B sizes from its own bankroll and step");
});

/* ── lane lifecycle under v2 ── */
const card = (date) => ({ cardId: `c-${date}`, legs: [{ legId: "nba:1:winner", gameId: "1", startUtc: "2026-11-05T00:00Z" }] });
function v2Run(steps) {
  let ev = [runStartedV2({ laneId: "ms-a", runId: "run-2", startedAt: "2026-11-04T18:30:00Z", approvedBy: "TEST approval" })];
  for (const [date, outcome, after] of steps) {
    ev = append(ev, { type: "CARD_FROZEN", date, step: laneState(ev).step, at: `${date}T12:00:00Z`, source: "t", card: card(date) });
    ev = append(ev, { type: "PAYOUT_COMPUTED", date, step: laneState(ev).step, at: `${date}T17:00:00Z`, source: "t", result: "VERIFIED", inputs: {} });
    if (outcome) ev = append(ev, { type: "STEP_SETTLED", date, step: laneState(ev).step, at: `${date}T23:59:00Z`, source: "t", outcome, bankrollAfterCents: after });
  }
  return ev;
}

test("carry-forward: win carries the actual payout and recomputes the multiplier; loss stays lost; hold keeps the step", () => {
  const win = positionOf(v2Run([["2026-11-05", "WIN", 5240]]));
  assert.deepEqual([win.step, win.bankrollCents, win.targetCents], [2, 5240, 10000]);
  assert.equal(Math.round(win.requiredMultiplier * 1e4), 19084);
  const win2 = positionOf(v2Run([["2026-11-05", "WIN", 4760]]));
  assert.equal(Math.round(win2.requiredMultiplier * 1e4), 21008);
  assert.match(positionOf(v2Run([["2026-11-05", "LOSS", 0]])).refusal, /^LOST/);
  assert.match(positionOf(v2Run([["2026-11-05", null]])).refusal, /^IN_PLAY/, "settled-only advance");
  let held = v2Run([]);
  held = append(held, { type: "STATUS", date: "2026-11-05", step: 1, at: "2026-11-05T17:00:00Z", source: "t", status: STATUS.NO_ELIGIBLE_CARD, reason: "NO_QUALIFIED_CARD" });
  assert.deepEqual([positionOf(held).step, positionOf(held).bankrollCents], [1, 2500]);
  let done = v2Run([["2026-11-05", "WIN", 5000], ["2026-11-06", "WIN", 10000], ["2026-11-07", "WIN", 20000], ["2026-11-08", "WIN", 40000], ["2026-11-09", "WIN", 100000]]);
  done = append(done, { type: "STATUS", date: "2026-11-09", step: 6, at: "2026-11-09T23:59:30Z", source: "t", status: STATUS.COMPLETE, reason: "target" });
  assert.equal(positionOf(done).refusal, "COMPLETE");
  assert.match(positionOf([runStarted({ laneId: "ms-a", runId: "run-1", startedAt: NOW, approvedBy: "x" })]).refusal, /^RULES_VERSION/, "a v1 run is never priced under v2");
});

test("old-record preservation: withdrawing an unposted v1 card appends two events and rewrites nothing", () => {
  let v1 = [runStarted({ laneId: "ms-a", runId: "run-1", startedAt: "2026-11-04T05:00:00Z", approvedBy: "x" })];
  v1 = append(v1, { type: "CARD_FROZEN", date: "2026-11-04", step: 1, at: "2026-11-04T13:30:00Z", source: "t", card: { cardId: "old", legs: [{ legId: "a", gameId: "1", startUtc: "2026-11-05T00:00Z" }] } });
  v1 = append(v1, { type: "PAYOUT_COMPUTED", date: "2026-11-04", step: 1, at: "2026-11-04T17:00:00Z", source: "t", result: "VERIFIED", inputs: {} });
  const before = serializeEvents(v1);
  assert.throws(() => withdrawAndRetire(v1, { date: "2026-11-04", at: "2026-11-04T19:00:00Z", nextRunId: "run-2" }), /approval/);
  assert.throws(() => withdrawAndRetire(v1, { date: "2026-11-04", at: "2026-11-05T00:00:00Z", approvalRef: "A", nextRunId: "run-2" }), /started/);
  const posted = append(v1, { type: "POSTED", date: "2026-11-04", step: 1, at: "2026-11-04T18:00:00Z", source: "t" });
  assert.throws(() => withdrawAndRetire(posted, { date: "2026-11-04", at: "2026-11-04T19:00:00Z", approvalRef: "A", nextRunId: "run-2" }), /posted/);
  const out = withdrawAndRetire(v1, { date: "2026-11-04", at: "2026-11-04T19:00:00Z", approvalRef: "FOUNDER receipt", nextRunId: "run-2" });
  assert.equal(out.length, v1.length + 2);
  assert.ok(serializeEvents(out).startsWith(before), "every earlier byte unchanged");
  assert.equal(verifyChain(out).ok, true);
  const s = laneState(out);
  assert.deepEqual([s.status, s.step, s.bankrollCents, s.open, s.days[0].staked, s.days[0].withdrawn, isTerminal(s)], [STATUS.RETIRED_SUPERSEDED, 1, 2500, null, false, true, true]);
  assert.ok(out.some((e) => e.type === "PAYOUT_COMPUTED" && e.result === "VERIFIED"), "the priced record stays");
  const v2 = runStartedV2({ laneId: "ms-a", runId: "run-2", startedAt: "2026-11-04T19:00:00Z", approvedBy: "FOUNDER receipt", supersedes: { runId: "run-1", headSha256: out.at(-1).sha256 } });
  assert.deepEqual([v2.rulesVersion, v2.maxLegs, v2.supersedes.headSha256, v2.baseCents], [RULES_VERSION, 2, out.at(-1).sha256, 2500]);
});
