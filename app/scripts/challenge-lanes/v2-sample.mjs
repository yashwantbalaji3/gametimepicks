/**
 * SYNTHETIC bbm-rules@2 lane sample for site / graphics / console fixtures. Every team, date, chance and price below is
 * MADE UP: it is not a forecast, not a market price and not a lane record. Nothing here reads or writes a real lane log.
 *
 *   npx tsx scripts/challenge-lanes/v2-sample.mjs <outDir>
 *
 * Writes, per sample lane: <laneId>.public.json (gtp.challenge-lane.public@1 with the v2 fields), <laneId>.prices.json
 * (the decrypted gtp.challenge-lane.prices@1 doc; plain only because it is synthetic), <laneId>.display.json
 * (laneDisplay) and <laneId>.priced-display.json (pricedLaneDisplay).
 */
import fs from "node:fs";
import path from "node:path";
import { runStarted, append, laneState, STATUS } from "../../src/lib/challenge-lanes/lanes.mjs";
import { runStartedV2, withdrawAndRetire, stepPosition, RULES_VERSION } from "../../src/lib/challenge-lanes/rules-v2.mjs";
import { laneProjection, serializeProjection } from "../../src/lib/challenge-lanes/projection.mjs";
import { lanePriceDisplay } from "../../src/lib/challenge-lanes/price-display.mjs";
import { laneDisplay, pricedLaneDisplay } from "../../src/lib/challenge-lanes/display.mjs";
import { priceRatio, payoutCents } from "../../src/lib/challenge-lanes/payout.mjs";

const SAMPLE = "SYNTHETIC SAMPLE — not a forecast, price or lane record";
const leg = (id, away, home, side, p, start) => ({ legId: `nba:${id}:winner`, gameId: id, eventLabel: `${away} @ ${home}`, startUtc: start, market: "winner", selection: { code: side, label: `${side === "home" ? home : away} (official side)`, teamAbbr: side === "home" ? home : away }, probability: p, probabilityShown: `${Math.round(p * 100)}%`, projection: { owner: SAMPLE, modelId: "synthetic", snapshotId: null, stampedAt: null, contentSha256: null }, guard: { state: "pass", flags: [], flagText: [] }, settlement: null });

/** One priced day: CARD_FROZEN → PRICE_VERIFIED → PAYOUT_COMPUTED (VERIFIED), with v2 inputs. prices: American per leg. */
function pricedDay(ev, { date, legs, prices, laneId }) {
  const s = laneState(ev);
  const pos = stepPosition({ product: s.product, step: s.step, bankrollCents: s.bankrollCents });
  const card = { cardId: `sample-${laneId}-${date}`, slot: s.laneId.endsWith("a") ? "A" : "B", product: s.product, scope: "nba", method: `${RULES_VERSION} (synthetic sample)`, candidateId: `v2-sample-${date}`, legs };
  const base = { date, step: s.step, source: "v2-sample" };
  ev = append(ev, { ...base, type: "CARD_FROZEN", at: `${date}T13:30:00Z`, packageId: `${s.product === "bank-builder" ? "bb" : "ms"}-${date}`, mediaIndex: card.slot === "A" ? 0 : 1, suggestedCards: null, card });
  const cardEv = ev.at(-1);
  const fetchedAt = `${date}T17:00:00Z`;
  ev = append(ev, { ...base, type: "PRICE_VERIFIED", at: fetchedAt, cardEventSha256: cardEv.sha256, price: { legs: legs.map((l, i) => ({ legId: l.legId, selectionCode: l.selection.code, provider: "synthetic", book: "synthetic-book", market: "h2h", oddsFormat: "american", price: prices[i], line: null, fetchedAt })), parlay: { method: "LEG_PRODUCT", provider: "synthetic", book: "synthetic-book", fetchedAt }, priceSnapshotSha256: null } });
  const priceEv = ev.at(-1);
  const r = prices.map((p) => priceRatio("american", p)).reduce((a, x) => ({ n: a.n * BigInt(x.n), d: a.d * BigInt(x.d) }), { n: 1n, d: 1n });
  const money = payoutCents(s.bankrollCents, r);
  ev = append(ev, { ...base, type: "PAYOUT_COMPUTED", at: fetchedAt, result: "VERIFIED", refusals: null, ...money, inputs: { estimate: false, label: null, book: "synthetic-book", cardEventSha256: cardEv.sha256, priceEventSha256: priceEv.sha256, priceSnapshotSha256: null, stakeCents: s.bankrollCents, bankrollCents: s.bankrollCents, decimalPrice: Number(r.n) / Number(r.d), method: "LEG_PRODUCT", pace: pos.requiredMultiplier, belowPace: money.grossPayoutCents < pos.targetCents, strictPace: false, ruleVersion: RULES_VERSION, targetPayoutCents: pos.targetCents, requiredMultiplier: pos.requiredMultiplier, band: pos.band, candidateId: card.candidateId } });
  return { ev, payout: ev.at(-1), money };
}
function settle(ev, { date, legs, outcomes, payout, money }) {
  const s = laneState(ev);
  legs.forEach((l, i) => { ev = append(ev, { date, step: s.step, at: `${date}T23:59:00Z`, source: "v2-sample", type: "LEG_SETTLED", legId: l.legId, gameId: l.gameId, outcome: outcomes[i], final: { synthetic: true } }); });
  const lost = outcomes.includes("LOSS");
  return append(ev, { date, step: s.step, at: `${date}T23:59:30Z`, source: "v2-sample", type: "STEP_SETTLED", outcome: lost ? "LOSS" : "WIN", payoutEventSha256: payout.sha256, bankrollBeforeCents: s.bankrollCents, bankrollAfterCents: lost ? 0 : money.grossPayoutCents });
}

/** ms-a: an unposted v1 card withdrawn and run-1 retired; run-2 wins step 1 ($25 → $52.40), is HELD on day 2, in play on day 3. */
export function sampleMsA() {
  let r1 = [runStarted({ laneId: "ms-a", runId: "run-1", startedAt: "2030-01-01T05:00:00Z", approvedBy: SAMPLE })];
  r1 = pricedDay(r1, { date: "2030-01-01", laneId: "ms-a", legs: [leg("901", "AAA", "BBB", "home", 0.7, "2030-01-02T00:00Z"), leg("902", "CCC", "DDD", "home", 0.7, "2030-01-02T00:30Z"), leg("903", "EEE", "FFF", "home", 0.7, "2030-01-02T01:00Z"), leg("904", "GGG", "HHH", "home", 0.7, "2030-01-02T01:30Z"), leg("905", "III", "JJJ", "away", 0.5, "2030-01-02T02:00Z")], prices: [-150, -400, -200, -250, 150] }).ev;
  r1 = withdrawAndRetire(r1, { date: "2030-01-01", at: "2030-01-01T18:30:00Z", approvalRef: SAMPLE, nextRunId: "run-2" });
  let r2 = [runStartedV2({ laneId: "ms-a", runId: "run-2", startedAt: "2030-01-01T18:40:00Z", approvedBy: SAMPLE, supersedes: { runId: "run-1", headSha256: r1.at(-1).sha256 } })];
  const d1 = [leg("911", "AAA", "BBB", "home", 0.66, "2030-01-02T00:00Z"), leg("912", "CCC", "DDD", "away", 0.8, "2030-01-02T01:00Z")];
  const p1 = pricedDay(r2, { date: "2030-01-01", laneId: "ms-a", legs: d1, prices: [-125, -608] });
  r2 = settle(p1.ev, { date: "2030-01-01", legs: d1, outcomes: ["WIN", "WIN"], payout: p1.payout, money: p1.money });
  r2 = append(r2, { date: "2030-01-02", step: laneState(r2).step, at: "2030-01-02T17:05:00Z", source: "v2-sample", type: "STATUS", status: STATUS.NO_ELIGIBLE_CARD, code: "NO_QUALIFIED_CARD", reason: "No candidate passed every gate: 0 of 18 in-band candidates had positive EV at the lower bound." });
  const d3 = [leg("931", "KKK", "LLL", "home", 0.55, "2030-01-04T00:00Z")];
  r2 = pricedDay(r2, { date: "2030-01-03", laneId: "ms-a", legs: d3, prices: [-110] }).ev;
  return { laneId: "ms-a", runs: [r1, r2] };
}
/** bb-a: a fresh v2 run (no v1 history) that wins step 1 with a single and loses step 2 with a double. */
export function sampleBbA() {
  let r = [runStartedV2({ laneId: "bb-a", runId: "run-1", startedAt: "2030-01-01T18:40:00Z", approvedBy: SAMPLE })];
  const d1 = [leg("941", "MMM", "NNN", "away", 0.55, "2030-01-02T00:00Z")];
  const p1 = pricedDay(r, { date: "2030-01-01", laneId: "bb-a", legs: d1, prices: [-105] });
  r = settle(p1.ev, { date: "2030-01-01", legs: d1, outcomes: ["WIN"], payout: p1.payout, money: p1.money });
  const d2 = [leg("951", "OOO", "PPP", "home", 0.7, "2030-01-03T00:00Z"), leg("952", "QQQ", "RRR", "home", 0.75, "2030-01-03T01:00Z")];
  const p2 = pricedDay(r, { date: "2030-01-02", laneId: "bb-a", legs: d2, prices: [-167, -167] });
  r = settle(p2.ev, { date: "2030-01-02", legs: d2, outcomes: ["WIN", "LOSS"], payout: p2.payout, money: p2.money });
  return { laneId: "bb-a", runs: [r] };
}

export function sampleOutputs() {
  return [sampleMsA(), sampleBbA()].map(({ laneId, runs }) => {
    const pub = laneProjection(laneId, runs);
    const prices = lanePriceDisplay(laneId, runs);
    return { laneId, pub, prices, display: laneDisplay(pub), priced: pricedLaneDisplay(pub, prices) };
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const out = process.argv[2];
  if (!out) { console.error("usage: v2-sample.mjs <outDir>"); process.exit(2); }
  fs.mkdirSync(out, { recursive: true });
  for (const o of sampleOutputs()) {
    fs.writeFileSync(path.join(out, `${o.laneId}.public.json`), serializeProjection(o.pub));
    fs.writeFileSync(path.join(out, `${o.laneId}.prices.json`), `${JSON.stringify(o.prices, null, 1)}\n`);
    fs.writeFileSync(path.join(out, `${o.laneId}.display.json`), `${JSON.stringify(o.display, null, 1)}\n`);
    fs.writeFileSync(path.join(out, `${o.laneId}.priced-display.json`), `${JSON.stringify(o.priced, null, 1)}\n`);
    console.log(o.laneId, o.display.ruleVersion, o.display.status, `step ${o.display.step}`, o.priced.trackedBankrollCents);
  }
}
