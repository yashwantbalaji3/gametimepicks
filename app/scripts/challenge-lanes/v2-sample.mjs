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
import { sha256, canonical } from "../../src/lib/challenge-lanes/chain.mjs";
import { legFromShortlist, evaluateLevelSet, evaluateLevelCandidates, indexPropCapture, levelCardRecord, sealCardRecord, LEVEL, EVIDENCE_LABEL } from "../../src/lib/challenge-lanes/levels.mjs";
import { researchDocs, researchDisplay } from "../../src/lib/challenge-lanes/research.mjs";

const SAMPLE = "SYNTHETIC SAMPLE — not a forecast, price or lane record";
const leg = (id, away, home, side, p, start) => ({ legId: `nba:${id}:winner`, gameId: id, eventLabel: `${away} @ ${home}`, startUtc: start, market: "winner", selection: { code: side, label: `${side === "home" ? home : away} (official side)`, teamAbbr: side === "home" ? home : away }, probability: p, probabilityShown: `${Math.round(p * 100)}%`, projection: { owner: SAMPLE, modelId: "synthetic", snapshotId: null, stampedAt: null, contentSha256: null }, guard: { state: "pass", flags: [], flagText: [] }, settlement: null });

/** One priced day: CARD_FROZEN → PRICE_VERIFIED → PAYOUT_COMPUTED (VERIFIED), with v2 inputs. prices: American per leg. */
function pricedDay(ev, { date, legs, prices, laneId, card: card2 = null }) {
  const s = laneState(ev);
  const pos = stepPosition({ product: s.product, step: s.step, bankrollCents: s.bankrollCents });
  const card = card2 ?? { cardId: `sample-${laneId}-${date}`, slot: s.laneId.endsWith("a") ? "A" : "B", product: s.product, scope: "nba", method: `${RULES_VERSION} (synthetic sample)`, candidateId: `v2-sample-${date}`, legs };
  const base = { date, step: s.step, source: "v2-sample" };
  ev = append(ev, { ...base, type: "CARD_FROZEN", at: `${date}T13:30:00Z`, packageId: `${s.product === "bank-builder" ? "bb" : "ms"}-${date}`, mediaIndex: card.slot === "A" ? 0 : 1, suggestedCards: null, card });
  const cardEv = ev.at(-1);
  const fetchedAt = `${date}T17:00:00Z`;
  const snapSha = sha256(`SYNTHETIC snapshot ${laneId} ${date}`); // a stand-in identity; no snapshot exists
  ev = append(ev, { ...base, type: "PRICE_VERIFIED", at: fetchedAt, cardEventSha256: cardEv.sha256, price: { legs: legs.map((l, i) => ({ legId: l.legId, selectionCode: l.selection?.code ?? l.side, provider: "synthetic", book: "synthetic-book", market: l.market === "winner" ? "h2h" : l.market, oddsFormat: "american", price: prices[i], line: l.line ?? null, fetchedAt })), parlay: { method: "LEG_PRODUCT", provider: "synthetic", book: "synthetic-book", fetchedAt }, priceSnapshotSha256: snapSha } });
  const priceEv = ev.at(-1);
  const r = prices.map((p) => priceRatio("american", p)).reduce((a, x) => ({ n: a.n * BigInt(x.n), d: a.d * BigInt(x.d) }), { n: 1n, d: 1n });
  const money = payoutCents(s.bankrollCents, r);
  ev = append(ev, { ...base, type: "PAYOUT_COMPUTED", at: fetchedAt, result: "VERIFIED", refusals: null, ...money, inputs: { estimate: false, label: null, book: "synthetic-book", cardEventSha256: cardEv.sha256, priceEventSha256: priceEv.sha256, priceSnapshotSha256: snapSha, stakeCents: s.bankrollCents, bankrollCents: s.bankrollCents, decimalPrice: Number(r.n) / Number(r.d), method: "LEG_PRODUCT", pace: pos.requiredMultiplier, belowPace: money.grossPayoutCents < pos.targetCents, strictPace: false, ruleVersion: RULES_VERSION, targetPayoutCents: pos.targetCents, requiredMultiplier: pos.requiredMultiplier, band: pos.band, candidateId: card.candidateId } });
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

/* ── evidence classes: synthetic shortlist rows, prop quotes and h2h quotes (all made up) ── */
const NOWL = "2030-01-01T17:00:00Z";
const srow = (o) => ({ eventLabel: "AAA @ BBB", startUtc: "2030-01-02T00:00Z", family: "pts", side: "over", hitRate: { windows: [{ window: "last10", hits: 7, n: 10 }, { window: "last20", hits: 13, n: 20 }, { window: "2025-26", hits: 48, n: 72 }], shrunk: { rate: 0.64, nEffective: 84, method: SAMPLE }, lineBasis: "evaluated at this exact line" }, role: { minutesAvg: 33, minutesSd: 3, gamesPlayed: 8, stable: true }, injury: { status: "ACTIVE", source: SAMPLE, fetchedAt: NOWL }, dataQuality: { ok: true, issues: [] }, forecastVersion: SAMPLE, projection: { value: 21.4, snapshotId: "synthetic" }, ...o });
const PBOOKS = ["synthetic-book", "synthetic-book-2"];
const propCap = (rows) => ({ records: rows.flatMap(([eventId, pid, family, line, over, under]) => PBOOKS.map((book) => ({ schema: "gtp.nba.prop-price@1", eventId, providerAthleteId: pid, family, line, book, overAmerican: over, underAmerican: under, capturedAt: NOWL, fetchedAt: NOWL, recordId: `s-${eventId}-${pid}-${book}` }))) });
function levelCard(rows, cap, { laneId, date, product, bankrollCents, step, h2h = null, forceClass = null }) {
  const position = stepPosition({ product, step, bankrollCents });
  const c = evaluateLevelSet(rows.map(legFromShortlist), { position, now: NOWL, propIx: indexPropCapture(cap), h2h, bookmakers: PBOOKS });
  if (forceClass) { c.classification = forceClass; c.classificationLabel = forceClass; c.reasons = []; }
  if (c.classification === LEVEL.HOLD) throw new Error(`sample card held: ${c.reasons.join("; ")}`);
  return { card: { ...sealCardRecord(levelCardRecord(c, { laneId, date })), ...(forceClass ? { evidenceLabel: EVIDENCE_LABEL[forceClass], sampleNote: "SYNTHETIC: no NBA model is validated for Level A today" } : {}) }, prices: c.legs.map((l) => l.quote.american), legs: c.legs };
}

/** bb-b: day 1 a LEVEL_A moneyline single (SYNTHETIC — none exists today) wins; day 2 a LEVEL_B prop double is in play. */
export function sampleBbB() {
  let r = [runStartedV2({ laneId: "bb-b", runId: "run-1", startedAt: "2030-01-01T12:00:00Z", approvedBy: SAMPLE })];
  const hdoc = { schema: "gtp.bbm.price-snapshot@1", fetchedAt: NOWL, games: { 961: { books: Object.fromEntries(PBOOKS.map((b) => [b, { home: { price: 100 }, away: { price: -120 }, lastUpdate: NOWL }])) } } };
  const h2h = { ...hdoc, snapshotSha256: sha256(canonical(hdoc)) };
  const a = levelCard([srow({ eventId: "961", eventLabel: "SSS @ TTT", family: "winner", player: null, teamAbbr: "TTT", side: "home", line: null, role: null, projection: null })], { records: [] }, { laneId: "bb-b", date: "2030-01-01", product: "bank-builder", bankrollCents: 10000, step: 1, h2h, forceClass: LEVEL.A });
  const p1 = pricedDay(r, { date: "2030-01-01", laneId: "bb-b", legs: a.card.legs, prices: a.prices, card: a.card });
  r = settle(p1.ev, { date: "2030-01-01", legs: a.card.legs, outcomes: ["WIN"], payout: p1.payout, money: p1.money });
  const bank = laneState(r).bankrollCents;
  const rows = [srow({ eventId: "971", eventLabel: "UUU @ VVV", startUtc: "2030-01-03T00:00Z", player: { playerId: "s1", name: "Sample Player One", team: "VVV" }, line: 18.5 }), srow({ eventId: "972", eventLabel: "WWW @ XXX", startUtc: "2030-01-03T01:00Z", family: "reb", side: "under", player: { playerId: "s2", name: "Sample Player Two", team: "WWW" }, line: 9.5, projection: { value: 8.1, snapshotId: "synthetic" } })];
  const b = levelCard(rows, propCap([["971", "s1", "pts", 18.5, -190, 155], ["972", "s2", "reb", 9.5, 145, -175]]), { laneId: "bb-b", date: "2030-01-02", product: "bank-builder", bankrollCents: bank, step: 2 });
  r = pricedDay(r, { date: "2030-01-02", laneId: "bb-b", legs: b.card.legs, prices: b.prices, card: b.card }).ev;
  return { laneId: "bb-b", runs: [r] };
}
/** ms-b: day 1 HELD (NO_QUALIFIED_CARD), with the day's research section for the product. */
export function sampleMsBHeldWithResearch() {
  let r = [runStartedV2({ laneId: "ms-b", runId: "run-1", startedAt: "2030-01-01T12:00:00Z", approvedBy: SAMPLE })];
  const reason = "No candidate passed every gate: in-band candidates had weak hit-rate evidence.";
  r = append(r, { date: "2030-01-01", step: 1, at: "2030-01-01T17:05:00Z", source: "v2-sample", type: "STATUS", status: STATUS.NO_ELIGIBLE_CARD, code: "NO_QUALIFIED_CARD", reason });
  const rows = [
    srow({ eventId: "981", player: { playerId: "s3", name: "Sample Player Three", team: "BBB" }, line: 20.5 }),
    srow({ eventId: "982", eventLabel: "CCC @ DDD", family: "ast", player: { playerId: "s4", name: "Sample Player Four", team: "DDD" }, line: 6.5, hitRate: { windows: [{ window: "last10", hits: 5, n: 10 }, { window: "2025-26", hits: 38, n: 70 }], shrunk: { rate: 0.55, nEffective: 80, method: SAMPLE }, lineBasis: "evaluated at this exact line" } }),
  ];
  const ev = evaluateLevelCandidates({ legs: rows.map(legFromShortlist), position: stepPosition({ product: "moonshot", step: 1, bankrollCents: 2500 }), now: NOWL, propCapture: propCap([["981", "s3", "pts", 20.5, 100, -120], ["982", "s4", "ast", 6.5, -105, -115]]), bookmakers: PBOOKS });
  const research = researchDocs({ product: "moonshot", date: "2030-01-01", evaluation: ev, held: { "ms-b": { heldCode: "NO_QUALIFIED_CARD", reason } } });
  return { laneId: "ms-b", runs: [r], research };
}

export function sampleOutputs() {
  return [sampleMsA(), sampleBbA(), sampleBbB(), sampleMsBHeldWithResearch()].map(({ laneId, runs, research }) => {
    const pub = laneProjection(laneId, runs);
    const prices = lanePriceDisplay(laneId, runs);
    return { laneId, pub, prices, display: laneDisplay(pub), priced: pricedLaneDisplay(pub, prices), ...(research ? { research, researchView: researchDisplay(research.public, research.prices), researchPublicView: researchDisplay(research.public) } : {}) };
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
    if (o.research) {
      fs.writeFileSync(path.join(out, `research-moonshot-2030-01-01.public.json`), `${JSON.stringify(o.research.public, null, 1)}\n`);
      fs.writeFileSync(path.join(out, `research-moonshot-2030-01-01.prices.json`), `${JSON.stringify(o.research.prices, null, 1)}\n`);
      fs.writeFileSync(path.join(out, `research-moonshot-2030-01-01.display.json`), `${JSON.stringify(o.researchView, null, 1)}\n`);
    }
    console.log(o.laneId, o.display.ruleVersion, o.display.status, `step ${o.display.step}`, o.priced.trackedBankrollCents);
  }
}
