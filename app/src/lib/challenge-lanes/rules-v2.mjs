/**
 * BANK BUILDER & MOONSHOT · LEG CONSTRUCTION, `bbm-rules@2` (founder directive 2026-11-04 ~18:10Z). PURE.
 *
 * v1 (`lanes.mjs selectLaneCards`) took the frozen file's tier card and stayed the record of every run-1 event. v2 builds
 * each lane's card from the lane's own position instead: the tracked bankroll, the step, that step's target payout and
 * the multiplier it needs (target ÷ bankroll). It searches singles, then 2-leg combos from different games, and keeps
 * only candidates whose gross payout lands in the target band and that pass every gate. It ranks by calibrated EV, never
 * by payout or leg count. No qualified candidate → the lane is HELD (NO_QUALIFIED_CARD), with every candidate's reasons.
 *
 * Legs are the frozen suggested-cards file's own NBA game-winner legs (official side, frozen probability). Nothing is
 * re-forecast, no probability is derived from a median, props stay excluded (0ce4b94208 gate failed).
 *
 * Prices come from a private `gtp.bbm.price-snapshot@1`; ONE book prices every leg of a candidate, the first eligible
 * operator in the allowlist's fixed order (never shopped). Combined price = the calculated leg product (no book-quoted
 * parlay exists for cross-game h2h in the snapshot), with the independence assumption stated on the candidate.
 *
 * Every number marked PROPOSED in RULES_V2.parameters is a founder-approval parameter: it is never widened by code.
 */
import { canonical, sha256 } from "./chain.mjs";
import { priceRatio, payoutCents, decimalToAmerican } from "./payout.mjs";
import { priceForCard } from "./odds.mjs";
import { RULE_A_FOR_PRODUCT, LANES, STATUS, laneState, append } from "./lanes.mjs";
import { chainEvent } from "./chain.mjs";
import { laneTypeOf } from "./card-fields.mjs";
import { ELIGIBLE_OPERATOR_KEYS } from "../sports/odds/eligible-operators.mjs";

export const RULES_VERSION = "bbm-rules@2";

export const RULES_V2 = Object.freeze({
  version: RULES_VERSION,
  products: Object.freeze({
    /* $100 → $200 → $500 → $1,250 → $3,125 → $10,000 */
    "bank-builder": Object.freeze({ baseCents: 10000, targetCents: 1000000, steps: 5, maxLegs: 2, stepTargetsCents: Object.freeze([20000, 50000, 125000, 312500, 1000000]) }),
    /* $25 → $50 → $100 → $200 → $400 → $1,000 */
    moonshot: Object.freeze({ baseCents: 2500, targetCents: 100000, steps: 5, maxLegs: 2, stepTargetsCents: Object.freeze([5000, 10000, 20000, 40000, 100000]) }),
  }),
  parameters: Object.freeze({
    bandPct: Object.freeze({ value: 0.10, state: "PROPOSED", note: "gross payout within ±10% of the step target; never auto-widened" }),
    minCalibrationSample: Object.freeze({ value: 200, state: "PROPOSED", note: "graded games behind the calibration evidence for the leg's model" }),
    evGate: Object.freeze({ value: "LOWER_BOUND_POSITIVE", state: "PROPOSED", note: "EV at each leg's calibration lower bound must be > 0; a positive point EV alone does not qualify" }),
    maxModelMarketGap: Object.freeze({ value: 0.15, state: "PROPOSED", note: "|model p − the book's no-vig p| above this is a data-quality refusal, not an edge" }),
    legDecimalRange: Object.freeze({ value: Object.freeze([1.05, 6.0]), state: "PROPOSED", note: "per-leg decimal price bounds (−2000 … +500)" }),
    minBooksQuoting: Object.freeze({ value: 3, state: "PROPOSED", note: "eligible books quoting the side (market depth)" }),
    maxPriceAgeMs: Object.freeze({ value: 90 * 60 * 1000, state: "PROPOSED", note: "snapshot age at evaluation; v1 PRICE_WINDOW_MS" }),
    evRankBucket: Object.freeze({ value: 0.01, state: "PROPOSED", note: "EV lower bounds within one bucket tie; later keys break the tie" }),
    probabilitySource: Object.freeze({ value: "MODEL", state: "PROPOSED", note: "MODEL: the frozen leg chance with calibration evidence and its half-width. NO_VIG_CONSENSUS (nba-engine-eval P-EV-1): p = the median over eligible books of each book's multiplicative de-vig, p_lo = the lowest; the model only picks the side" }),
    diversification: Object.freeze({ value: "GAME_DISJOINT", state: "PROPOSED", note: "lane B shares no game with lane A; B passes the same gates or is HELD" }),
  }),
});
const P = (k, over) => over?.[k] ?? RULES_V2.parameters[k].value;

/** Step position of a lane under v2: target, required multiplier and payout band. Carry-forward: the bankroll is the actual settled gross. */
export function stepPosition({ product, step, bankrollCents, params = null }) {
  const R = RULES_V2.products[product];
  if (!R) throw new Error(`unknown product ${product}`);
  if (!(Number.isInteger(step) && step >= 1 && step <= R.steps)) return { ok: false, refusal: `STEP_OUT_OF_RANGE: ${step}` };
  if (!(Number.isInteger(bankrollCents) && bankrollCents > 0)) return { ok: false, refusal: "BANKROLL_INVALID" };
  const targetCents = R.stepTargetsCents[step - 1];
  if (bankrollCents >= targetCents) return { ok: false, refusal: `TARGET_ALREADY_MET: bankroll ${bankrollCents} ≥ step ${step} target ${targetCents}` };
  const pct = P("bandPct", params);
  return { ok: true, product, step, steps: R.steps, bankrollCents, targetCents, requiredMultiplier: targetCents / bankrollCents, band: { pct, loCents: Math.ceil(targetCents * (1 - pct)), hiCents: Math.floor(targetCents * (1 + pct)) } };
}

const legGame = (l) => String(l.eventId);
const ratioMul = (a, b) => ({ n: BigInt(a.n) * BigInt(b.n), d: BigInt(a.d) * BigInt(b.d) });
const dec = (r) => Number(r.n) / Number(r.d);

/** Per-leg gates that do not depend on the price. */
function legRefusals(l, { product, calibration, params, injuryOverrides }) {
  const out = [];
  if (l.sport !== "nba" || l.market !== "winner") out.push(`SPORT_POLICY ${l.legId}: NBA game winners only (props excluded)`);
  if (!(typeof l.probability === "number" && l.probability > 0 && l.probability < 1) || !l.forecast?.receiptSha256) out.push(`FORECAST_INVALID ${l.legId}`);
  if (!["pass", "review"].includes(l.guard?.state)) out.push(`FORECAST_GUARD ${l.legId}: guard ${l.guard?.state ?? "missing"}`);
  for (const f of l.guard?.flags ?? []) if (RULE_A_FOR_PRODUCT[product].includes(f)) out.push(`INJURY_STATUS ${l.legId}: ${f}`);
  const live = injuryOverrides?.[l.legId];
  if (live) out.push(`INJURY_STATUS ${l.legId}: ${live}`);
  const c = calibration?.[l.forecast?.modelId];
  if (P("probabilitySource", params) === "NO_VIG_CONSENSUS") return out; // the chance is the market's, not the model's
  if (!c) out.push(`CALIBRATION_MISSING ${l.legId}: no evidence for ${l.forecast?.modelId ?? "unknown model"}`);
  else if (c.status !== "QUALIFIED") out.push(`UNCALIBRATED ${l.legId}: ${l.forecast.modelId} ${c.status}`);
  else if (!(c.sampleSize >= P("minCalibrationSample", params))) out.push(`SAMPLE_TOO_SMALL ${l.legId}: ${c.sampleSize ?? 0} < ${P("minCalibrationSample", params)}`);
  return out;
}

/** The audit row of one leg set (1 leg, 2 legs, or a v1 card's legs) at one lane position. */
export function evaluateSet(set, { snapshot, position, now, calibration = null, injuryOverrides = null, params = null, excludeGames = [], bookmakers = ELIGIBLE_OPERATOR_KEYS }) {
  const { product } = position;
  const nowMs = Date.parse(now);
  const [minDec, maxDec] = P("legDecimalRange", params);
  const sorted = [...set].sort((a, b) => String(a.startUtc).localeCompare(String(b.startUtc)) || a.legId.localeCompare(b.legId));
  const reasons = [];
  const ctx = { product, calibration, params, injuryOverrides };
  for (const l of sorted) reasons.push(...legRefusals(l, ctx));
  if (sorted.length > RULES_V2.products[product].maxLegs) reasons.push("LEG_COUNT_EXCEEDED");
  if (new Set(sorted.map(legGame)).size !== sorted.length) reasons.push("CORRELATED_SAME_GAME: no provider-quoted same-game price");
  for (const l of sorted) if (excludeGames.includes(legGame(l))) reasons.push(`DIVERSIFICATION ${l.legId}: game held by the other lane`);
  for (const l of sorted) if (!(Date.parse(l.startUtc) > nowMs)) reasons.push(`STARTED ${l.legId}`);
  const candidateId = `v2-${sha256(`${RULES_VERSION}|${product}|${position.step}|${sorted.map((l) => `${l.legId}#${l.selection?.code}`).join("+")}`).slice(0, 16)}`;
  const base = { candidateId, legCount: sorted.length, legs: sorted.map((l) => ({ legId: l.legId, gameId: legGame(l), eventLabel: l.eventLabel, selectionCode: l.selection?.code, team: l.selection?.teamAbbr ?? null, startUtc: l.startUtc, modelP: l.probability, modelId: l.forecast?.modelId ?? null, forecastSha256: l.forecast?.receiptSha256 ?? null, guard: l.guard?.state ?? null, flags: l.guard?.flags ?? [] })) };

  /* Price: one book, fixed order. */
  const pseudo = { legs: sorted.map((l) => ({ legId: l.legId, gameId: legGame(l), eventLabel: l.eventLabel, market: l.market, selection: l.selection })) };
  const pr = priceForCard(pseudo, snapshot, { bookmakers });
  if (!pr.ok) return { ...base, qualified: false, reasons: [...reasons, ...pr.refusals.map((r) => `PRICE_UNAVAILABLE ${r}`)], price: null };
  const book = pr.price.legs[0].book;
  const fetchedMs = Date.parse(snapshot.fetchedAt);
  if (!(nowMs - fetchedMs <= P("maxPriceAgeMs", params)) || fetchedMs > nowMs) reasons.push(`MARKET_STALE: snapshot ${snapshot.fetchedAt} vs ${now}`);
  let ratio = { n: 1n, d: 1n }; let bad = false;
  const legPrices = pr.price.legs.map((pl, i) => {
    const l = sorted[i]; const g = snapshot.games[legGame(l)];
    const side = l.selection.code; const other = side === "home" ? "away" : "home";
    const r = priceRatio("american", pl.price); const ro = priceRatio("american", g.books[book]?.[other]?.price);
    if (!r || !ro) { bad = true; reasons.push(`BAD_ODDS ${l.legId}: unparseable price`); return { legId: l.legId, american: pl.price }; }
    const d = dec(r); const imp = 1 / d; const impo = 1 / dec(ro); const overround = imp + impo;
    if (overround < 1) reasons.push(`BAD_ODDS ${l.legId}: two-way implied ${overround.toFixed(4)} < 1 (stale or erroneous quote)`);
    if (d < minDec || d > maxDec) reasons.push(`MARKET_THRESHOLD ${l.legId}: decimal ${d.toFixed(4)} outside [${minDec}, ${maxDec}]`);
    const books = Object.values(g.books).filter((b) => Number.isInteger(b?.[side]?.price)).length;
    if (books < P("minBooksQuoting", params)) reasons.push(`MARKET_THRESHOLD ${l.legId}: ${books} books < ${P("minBooksQuoting", params)}`);
    const noVig = imp / overround;
    if (Math.abs(l.probability - noVig) > P("maxModelMarketGap", params)) reasons.push(`MODEL_MARKET_GAP ${l.legId}: model ${l.probability.toFixed(4)} vs no-vig ${noVig.toFixed(4)}`);
    ratio = ratioMul(ratio, r);
    /* Each book's own multiplicative de-vig of this side (P-EV-1): its median and its minimum across eligible books. */
    const devig = Object.values(g.books).map((b) => { const a = priceRatio("american", b?.[side]?.price); const o = priceRatio("american", b?.[other]?.price); if (!a || !o) return null; const x = 1 / dec(a); const y = 1 / dec(o); return x + y >= 1 ? x / (x + y) : null; }).filter((x) => x != null).sort((x, y) => x - y);
    const mid = devig.length ? (devig.length % 2 ? devig[(devig.length - 1) / 2] : (devig[devig.length / 2 - 1] + devig[devig.length / 2]) / 2) : null;
    return { legId: l.legId, book, american: pl.price, decimal: d, impliedP: imp, noVigP: noVig, booksQuoting: books, consensusNoVigP: mid, minNoVigP: devig[0] ?? null, booksDevigged: devig.length, fetchedAt: pl.fetchedAt };
  });
  if (bad) return { ...base, qualified: false, reasons, price: { book, legs: legPrices } };
  const D = dec(ratio);
  const { grossPayoutCents, profitCents } = payoutCents(position.bankrollCents, ratio);
  const market = P("probabilitySource", params) === "NO_VIG_CONSENSUS";
  if (market) for (const lp of legPrices) if (!(lp.booksDevigged >= 2)) reasons.push(`MARKET_THRESHOLD ${lp.legId}: ${lp.booksDevigged} books to de-vig < 2`);
  const pJoint = market ? legPrices.reduce((p, lp) => p * (lp.consensusNoVigP ?? 0), 1) : sorted.reduce((p, l) => p * l.probability, 1);
  const hw = (l) => calibration?.[l.forecast?.modelId]?.probabilityHalfWidth;
  const hasHw = sorted.every((l) => typeof hw(l) === "number");
  const pLow = market ? legPrices.reduce((p, lp) => p * (lp.minNoVigP ?? 0), 1) : hasHw ? sorted.reduce((p, l) => p * Math.max(0, l.probability - hw(l)), 1) : null;
  const ev = pJoint * D - 1; const evLow = pLow == null ? null : pLow * D - 1;
  if (!(ev > 0)) reasons.push(`NEGATIVE_EV: ${market ? "no-vig consensus" : "model"} ${pJoint.toFixed(4)} vs break-even ${(1 / D).toFixed(4)}`);
  if (P("evGate", params) === "LOWER_BOUND_POSITIVE" && !(evLow != null && evLow > 0)) reasons.push(evLow == null ? "EV_UNCERTAINTY_UNKNOWN: no calibration half-width" : `EV_NOT_ROBUST: EV at the ${market ? "lowest book de-vig" : "calibration lower bound"} ${evLow.toFixed(4)} ≤ 0`);
  const dev = grossPayoutCents / position.targetCents - 1;
  if (grossPayoutCents < position.band.loCents || grossPayoutCents > position.band.hiCents) reasons.push(`OUT_OF_BAND: gross ${grossPayoutCents} outside [${position.band.loCents}, ${position.band.hiCents}]`);
  return {
    ...base, qualified: reasons.length === 0, reasons,
    price: { book, capturedAt: snapshot.fetchedAt, priceSnapshotSha256: snapshot.snapshotSha256, legs: legPrices, combined: { method: "CALCULATED_LEG_PRODUCT", decimal: D, american: decimalToAmerican(D), ratio: { n: String(ratio.n), d: String(ratio.d) } } },
    probability: { source: market ? "NO_VIG_CONSENSUS" : "MODEL", joint: pJoint, jointLow: pLow, assumption: sorted.length > 1 ? "INDEPENDENT: legs from different games; the joint chance is the product of the leg chances (no dependence modelled)" : "SINGLE", breakEven: 1 / D },
    money: { stakeCents: position.bankrollCents, grossPayoutCents, profitCents }, ev, evLow, targetDeviation: dev,
  };
}

/**
 * Every 1- and 2-leg candidate for one lane position, with its audit row; qualified ones ranked.
 * @param {object} p
 * @param {object[]} p.legs           the frozen file's legs
 * @param {object} p.snapshot         private price snapshot
 * @param {object} p.position         stepPosition(...) result (ok)
 * @param {string} p.now              evaluation instant (ISO)
 * @param {object} [p.calibration]    { [modelId]: { status, sampleSize, probabilityHalfWidth, source, sha256 } }
 * @param {object} [p.injuryOverrides] { [legId]: "OUT ..." } a status read after freeze
 * @param {object} [p.params]         founder-approved overrides of RULES_V2.parameters values
 * @param {string[]} [p.excludeGames] games another lane already holds (A/B diversification)
 */
export function evaluateCandidates({ legs, snapshot, position, now, calibration = null, injuryOverrides = null, params = null, excludeGames = [], bookmakers = ELIGIBLE_OPERATOR_KEYS }) {
  const { product } = position;
  const pool = legs.filter((l) => l.sport === "nba");
  const sets = [...pool.map((l) => [l])];
  for (let i = 0; i < pool.length; i++) for (let j = i + 1; j < pool.length; j++) sets.push([pool[i], pool[j]]);
  const rows = sets.map((set) => evaluateSet(set, { snapshot, position, now, calibration, injuryOverrides, params, excludeGames, bookmakers }));
  const bucket = P("evRankBucket", params);
  const qualified = rows.filter((r) => r.qualified).sort((a, b) =>
    Math.floor(b.evLow / bucket + 1e-9) - Math.floor(a.evLow / bucket + 1e-9) // calibrated EV (lower bound)
    || a.legCount - b.legCount // forecast reliability: fewer modelled outcomes, no independence assumption
    || Math.abs(a.targetDeviation) - Math.abs(b.targetDeviation) // closeness to target
    || Date.parse(b.price.capturedAt) - Date.parse(a.price.capturedAt) // freshness
    || a.candidateId.localeCompare(b.candidateId));
  qualified.forEach((r, i) => { r.rank = i + 1; });
  const inBand = rows.filter((r) => r.money && r.money.grossPayoutCents >= position.band.loCents && r.money.grossPayoutCents <= position.band.hiCents);
  return { rulesVersion: RULES_VERSION, position, now, candidates: rows, ranked: qualified, counts: { total: rows.length, priced: rows.filter((r) => r.price?.combined).length, inBand: inBand.length, qualified: qualified.length } };
}

/** One lane's decision: the top ranked candidate, or HELD / NO_QUALIFIED_CARD with the reasons. */
export function decideLane(ev) {
  const top = ev.ranked[0];
  if (top) return { status: "READY", candidateId: top.candidateId, candidate: top };
  const why = {};
  for (const c of ev.candidates) for (const r of c.reasons) { const k = r.split(/[ :]/)[0]; why[k] = (why[k] ?? 0) + 1; }
  return { status: "HELD", code: "NO_QUALIFIED_CARD", reasonCounts: why, inBand: ev.counts.inBand };
}

/** Lanes A and B of one product, each from its own position; B excludes A's games and passes the same gates, or is HELD. */
export function constructLanePair({ legs, snapshot, now, product, laneA, laneB, calibration, injuryOverrides, params }) {
  const common = { legs, snapshot, now, calibration, injuryOverrides, params };
  const posA = stepPosition({ product, ...laneA, params });
  const evA = posA.ok ? evaluateCandidates({ ...common, position: posA }) : null;
  const A = posA.ok ? decideLane(evA) : { status: "HELD", code: posA.refusal };
  const exclude = A.status === "READY" ? A.candidate.legs.map((l) => l.gameId) : [];
  const posB = stepPosition({ product, ...laneB, params });
  const evB = posB.ok ? evaluateCandidates({ ...common, position: posB, excludeGames: exclude }) : null;
  const B = posB.ok ? decideLane(evB) : { status: "HELD", code: posB.refusal };
  return { rulesVersion: RULES_VERSION, product, A, B, evaluation: { A: evA, B: evB } };
}

/** A reproducible digest of a ranking: same inputs → same sha. */
export const rankingDigest = (ev) => sha256(canonical(ev.ranked.map((r) => [r.rank, r.candidateId, r.evLow, r.money.grossPayoutCents])));

/* ───────────────────────────── migration v1 → v2 (PROPOSED: nothing here is applied without the founder's own approval) ───────────────────────────── */

/**
 * Withdraw today's unposted v1 card and retire the run. Appends exactly two events and rewrites nothing:
 *   STATUS WITHDRAWN_RULES_CHANGED (date, step, the card/payout shas it withdraws, the approval reference)
 *   STATUS RETIRED_SUPERSEDED      (no date; names the run that replaces it)
 * Refused when the card was posted, any leg has settled, or the first leg has started (no hindsight withdrawal).
 */
export function withdrawAndRetire(events, { date, at, approvalRef, nextRunId }) {
  if (!approvalRef) throw new Error("withdrawAndRetire: needs the founder's approval reference");
  const s = laneState(events);
  if (s.open?.date !== date) throw new Error(`withdrawAndRetire: no open card on ${date}`);
  if (events.some((e) => e.type === "POSTED" && e.date === date)) throw new Error("withdrawAndRetire: the card was posted; a posted record is never withdrawn");
  if (events.some((e) => e.type === "LEG_SETTLED" && e.date === date)) throw new Error("withdrawAndRetire: a leg already settled");
  const firstStart = Math.min(...s.open.cardEvent.card.legs.map((l) => Date.parse(l.startUtc)));
  if (!(Date.parse(at) < firstStart)) throw new Error("withdrawAndRetire: the first leg has started");
  const base = { date, step: s.step, at, source: "lanes-migrate-v2" };
  let ev = append(events, { ...base, type: "STATUS", status: STATUS.WITHDRAWN_RULES_CHANGED, reason: `Rules changed to ${RULES_VERSION} before publication; the card was never posted. No step consumed.`, cardEventSha256: s.open.cardEvent.sha256, payoutEventSha256: s.open.payoutEvent?.sha256 ?? null, rulesFrom: "bbm-rules@1", rulesTo: RULES_VERSION, approvalRef });
  ev = append(ev, { date: null, step: s.step, at, source: "lanes-migrate-v2", type: "STATUS", status: STATUS.RETIRED_SUPERSEDED, reason: `Superseded by ${nextRunId} under ${RULES_VERSION}.`, nextRunId, approvalRef });
  return ev;
}

/** RUN_STARTED for a v2 run: carries the rules version and the run it supersedes (head sha), so history links both ways. */
export function runStartedV2({ laneId, runId, startedAt, approvedBy, supersedes = null, laneType = null }) {
  const L = LANES[laneId];
  if (!L) throw new Error(`unknown lane ${laneId}`);
  if (!approvedBy) throw new Error("a run starts only with a founder approval reference (approvedBy)");
  const R = RULES_V2.products[L.product];
  return chainEvent([], { type: "RUN_STARTED", laneId, runId, product: L.product, slot: L.slot, baseCents: R.baseCents, targetCents: R.targetCents, steps: R.steps, maxLegs: R.maxLegs, stepTargetsCents: [...R.stepTargetsCents], rulesVersion: RULES_VERSION, supersedes, ...(laneType ? { laneType: laneTypeOf(laneType) ?? (() => { throw new Error(`unknown laneType ${laneType}`); })() } : {}), startedAt, approvedBy, at: startedAt, source: "lanes-prepare" });
}

/** The v2 position of a lane from its log: carry-forward bankroll, step, target, required multiplier, band. */
export function positionOf(events, params = null) {
  const s = laneState(events);
  if (events[0].rulesVersion !== RULES_VERSION) return { ok: false, refusal: `RULES_VERSION: run ${s.runId} is ${events[0].rulesVersion ?? "bbm-rules@1"}` };
  if ([STATUS.BUSTED, STATUS.AWAITING_RESTART_APPROVAL].includes(s.status)) return { ok: false, refusal: "LOST: a restart needs founder approval" };
  if ([STATUS.COMPLETE, STATUS.FINISHED_SHORT, STATUS.RETIRED_SUPERSEDED].includes(s.status)) return { ok: false, refusal: s.status };
  if (s.open) return { ok: false, refusal: `IN_PLAY: step ${s.step} card ${s.open.date} not settled` };
  return stepPosition({ product: s.product, step: s.step, bankrollCents: s.bankrollCents, params });
}
