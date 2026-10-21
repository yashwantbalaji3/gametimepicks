/**
 * PARLAY LAB V2 · THE NBA CANDIDATE SOURCE (gated). Pure: inputs and the clock are arguments; no fs, no fetch.
 *
 * WHAT FLOWS
 *   products/nba/nba-leg.mjs legs (the official snapshot + the shared evaluator's lean + a verified, authorized price)
 *     → products/nba/cross-sport.mjs (duplicate-market collapse, field mapping to the candidate@1 input)
 *     → ./candidate.mjs gtp.parlay.candidate@1 (+ evaluatePool: lock, staleness, book, participant, market gates)
 *     → composeCards (below): distinct-event, one-exposure-per-player cards, each priced from verified two-way legs
 *     → ./recommend.mjs evaluateCard / recommendTiers (the SAME gates the published cards pass) → the four tiers.
 *
 * WHAT IT NEVER DOES
 *   · decide or move a lean. A leg's side is the evaluator's lean; its probability is the evaluator's pOver / pUnder,
 *     copied (Object.is-equal — the consistency test pins it). The same player-market-snapshot shows the same side
 *     and the same number on every tier and every card it appears on.
 *   · price a same-game set. SAME_GAME_POLICY is REFUSE: two legs from one NBA game never share a card (D5), because
 *     no validated joint model exists — independence is never assumed for legs that are known to move together.
 *   · invent a price. The only prices are the verified two-way quotes nba-leg.mjs checked against the evaluator's
 *     implied pair. With no authorized NBA price feed (today) there are no NBA legs, so NBA contributes ZERO
 *     candidates and nbaSourceStatus says why in reader words.
 *   · call a card safe or guaranteed. Tier words come from risk-odds-bands.mjs; any leg can lose.
 *
 * PRICE CONTRACT CONSUMED (owned by the odds lane — this module reads it, never builds one): the verification object
 * nba-leg.mjs takes — { sport:"nba", eventId, providerAthleteId, family, line, book, operatorName, capturedAt,
 * overAmerican, underAmerican, operatorVerified, verifier, authorizationReceiptRef, priceReceiptRef } — with no link
 * field of any kind.
 *
 * GATES ARE REAL BY DEFAULT. Tests inject a TEST FIXTURE registry (nbaRegistry), sport gate (canEnterSport),
 * operator allowlist and NBA settlement path; every leg produced that way is provenance FIXTURE and every card holding
 * one carries the FIXTURE label. Under the real registry nba-leg.mjs refuses every leg before this module sees one.
 */
import { NBA_FAMILY_MARKET_KEY, checkCrossSportCard, dedupeMarkets, toParlayCandidateInput } from "../../products/nba/cross-sport.mjs";
import { PROVENANCE as NBA_LEG_PROVENANCE } from "../../products/nba/nba-leg.mjs";
import { canEnterPredictionProducts, capabilityState } from "../../sport-capability-registry.ts";
import { PUBLIC_RISK_TIERS, getRiskBucketForCombinedOdds } from "../risk-odds-bands.mjs";
import { BAND_MAX_LEGS } from "../multi-sport.mjs";
import { ELIGIBILITY, PROVENANCE, candidateKey, checkCombination, evaluatePool, toCandidate } from "./candidate.mjs";
import { combinedPrice } from "./pricing.mjs";
import { evaluateCard, nbaContractSettles, recommendCtx, recommendTiers } from "./recommend.mjs";

export const NBA_SOURCE_VERSION = "parlay-lab-v2-nba-source@0";

/** Same-game NBA legs: refused. A correlated pricing method would have to be validated and named here first. */
export const SAME_GAME_POLICY = Object.freeze({
  mode: "REFUSE",
  correlatedMethod: null,
  note: "Two legs from one NBA game never share a card: same-game legs move together and no validated same-game price or joint model exists, so treating them as independent would overstate the card's chance.",
});

/** Reader-facing family names (presentation only). */
export const NBA_FAMILY_LABEL = Object.freeze({ pts: "Points", reb: "Rebounds", ast: "Assists", threePm: "Threes made", pra: "Points + rebounds + assists", ptsReb: "Points + rebounds", ptsAst: "Points + assists" });

export const COMPOSE_REFUSAL = Object.freeze({
  SAME_GAME: "SAME_GAME",
  DUPLICATE_PLAYER_EXPOSURE: "DUPLICATE_PLAYER_EXPOSURE",
  NO_TWO_WAY_PRICE: "NO_TWO_WAY_PRICE",
  MISSING_PROVENANCE: "MISSING_PROVENANCE",
  COMBINATION: "COMBINATION",
  CROSS_SPORT_WINDOW: "CROSS_SPORT_WINDOW",
  NO_BAND: "NO_BAND",
  TOO_MANY_LEGS_FOR_BAND: "TOO_MANY_LEGS_FOR_BAND",
  CARD_GATES: "CARD_GATES",
});

export const NBA_SOURCE_STATE = Object.freeze({
  CANDIDATES: "NBA_CANDIDATES",
  PRICE_NOT_AUTHORIZED: "NBA_PRICE_NOT_AUTHORIZED",
  NO_ELIGIBLE_LEGS: "NBA_NO_ELIGIBLE_LEGS",
});

const norm = (v) => String(v ?? "").trim().toLowerCase();
const ms = (iso) => { const t = Date.parse(iso ?? ""); return Number.isFinite(t) ? t : null; };

/**
 * Produced NBA legs → candidate@1 INPUT objects (the field set ./candidate.mjs toCandidate reads) plus the evidence a
 * card shows. Display names come from the snapshot the leg names (presentation only; identity stays ids).
 * @param {{ results: Array<{ok: boolean, leg?: object}>, snapshots?: object[], statusFeed?: Record<string, string> }} input
 *   `statusFeed` maps providerAthleteId → a NEWER participant status (e.g. "Out") than the snapshot carried.
 */
export function nbaCandidateInputs({ results = [], snapshots = [], statusFeed = {} } = {}) {
  const legs = results.filter((r) => r?.ok && r.leg).map((r) => r.leg);
  const refusedLegs = results.filter((r) => r && !r.ok).map((r) => ({ reasons: [...(r.refusal?.reasons ?? [])], identity: r.refusal?.identity ?? null }));
  const { kept, refused, alternates } = dedupeMarkets(legs);
  const snapById = new Map(snapshots.map((s) => [s.snapshotId, s]));
  const inputs = kept.map((leg) => {
    const base = toParlayCandidateInput(leg);
    const s = snapById.get(leg.snapshotId) ?? null;
    const p = s?.players?.find((x) => x.playerId === leg.providerAthleteId) ?? null;
    const name = p?.displayName ?? `Player ${leg.providerAthleteId}`;
    const marketLabel = NBA_FAMILY_LABEL[leg.family] ?? leg.family;
    const over = leg.side === "OVER";
    return {
      ...base,
      eventLabel: s?.matchup ?? null,
      marketLabel,
      selection: `${name} — ${marketLabel} ${over ? "Over" : "Under"}`,
      participantStatus: statusFeed[leg.providerAthleteId] ?? p?.injuryStatus ?? (p && p.participation !== "active" ? p.participation : null),
      participantName: name,
      playerId: leg.providerAthleteId,
      family: leg.family,
      lean: leg.side,
      provenance: leg.provenance,
      evidence: {
        snapshotId: leg.snapshotId,
        modelVersion: leg.modelVersion,
        frozenAt: leg.frozenAt,
        capturedAt: leg.capturedAt,
        evaluatorKey: leg.evaluator.identityKey,
        evaluatorVersion: leg.evaluator.version,
        projection: { pOver: leg.pOver, pUnder: leg.pUnder, pPush: leg.pPush },
        authorizationReceiptRef: leg.verification.authorizationReceiptRef,
        priceReceiptRef: leg.verification.priceReceiptRef,
      },
      twoWay: { verified: true, sideAmerican: leg.price.sideAmerican, otherAmerican: over ? leg.price.underAmerican : leg.price.overAmerican },
    };
  });
  return { inputs, refusedLegs, duplicateMarkets: { refused: refused.map((x) => ({ marketKey: x.marketKey, reason: x.reason })), alternates } };
}

/** A candidate@1 from an input, with the extension fields toCandidate does not carry. Fixture legs stay FIXTURE. */
export function toNbaAwareCandidate(input) {
  const fixture = input.provenance === NBA_LEG_PROVENANCE.TEST_FIXTURE || input.provenance === PROVENANCE.FIXTURE || input.forecastClass === "TEST_FIXTURE";
  const c = toCandidate(input, { provenance: fixture ? PROVENANCE.FIXTURE : PROVENANCE.PUBLISHED });
  return { ...c, participantName: input.participantName ?? null, playerId: input.playerId ?? null, family: input.family ?? null, lean: input.lean ?? null, evidence: input.evidence ?? null, twoWay: input.twoWay ?? null };
}

/** candidate@1 → the leg shape ./recommend.mjs evaluates (plus evidence / two-way / provenance, carried verbatim). */
export function toV2Leg(c) {
  return {
    sport: c.league, eventId: c.eventId, eventLabel: c.eventLabel, startUtc: c.gameStart, market: c.market, marketLabel: c.marketLabel,
    selection: c.selection, side: c.side, line: c.line, participant: c.player, team: c.team, book: c.book, price: c.americanOdds,
    playerId: c.playerId ?? null, family: c.family ?? null,
    capturedAt: c.capturedAt, participantStatus: c.participantStatus, forecastClass: c.forecastClass, priceMismatch: c.priceMismatch,
    modelProbability: c.probability, evidence: c.evidence, twoWay: c.twoWay, provenance: c.provenance, receipts: [...(c.receipts ?? [])],
  };
}

/** FNV-1a, 32-bit, hex — a short deterministic card id from the leg keys. */
function fnv(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}

function* combos(n, k, start = 0, acc = []) {
  if (acc.length === k) { yield acc.slice(); return; }
  for (let i = start; i <= n - (k - acc.length); i += 1) { acc.push(i); yield* combos(n, k, i + 1, acc); acc.pop(); }
}

/**
 * Compose distinct-event cards from EVALUATED candidates (any leagues). A card is kept only when recommend.mjs
 * evaluateCard passes it with the same context recommendTiers will use; per (tier, composition) the best `perGroup`
 * are kept by an order that never reads payout: fewer legs, then the freshest oldest price, then card id.
 *
 * @param {object} input
 * @param {object[]} input.candidates   candidate@1 objects with `eligibility` filled
 * @param {string} input.now
 * @param {object} input.ctx            recommendCtx(...) — the card gates
 * @param {(legs: object[]) => boolean} [input.requireComposition]  e.g. at least one NBA leg (default)
 * @param {number} [input.perGroup]
 * @param {number} [input.maxCombos]
 */
export function composeCards({ candidates, now, ctx, requireComposition = (legs) => legs.some((l) => l.league === "nba"), perGroup = 1, maxCombos = 50_000 }) {
  const refusals = Object.fromEntries(Object.values(COMPOSE_REFUSAL).map((k) => [k, 0]));
  const pool = [];
  for (const c of (candidates ?? []).filter((x) => x?.eligibility?.state === ELIGIBILITY.ELIGIBLE)) {
    if (!c.evidence?.snapshotId || !c.evidence?.modelVersion || !c.capturedAt) { refusals.MISSING_PROVENANCE += 1; continue; }
    if (c.twoWay?.verified !== true || !Number.isFinite(c.twoWay?.otherAmerican) || c.twoWay.sideAmerican !== c.americanOdds) { refusals.NO_TWO_WAY_PRICE += 1; continue; }
    pool.push(c);
  }
  pool.sort((a, b) => (candidateKey(a) < candidateKey(b) ? -1 : candidateKey(a) > candidateKey(b) ? 1 : 0));
  const groups = new Map();
  let seen = 0;
  const maxLegs = Math.max(...PUBLIC_RISK_TIERS.map((t) => BAND_MAX_LEGS[t] ?? 2));
  for (let k = 2; k <= Math.min(maxLegs, pool.length); k += 1) {
    for (const idx of combos(pool.length, k)) {
      if (++seen > maxCombos) break;
      const legs = idx.map((i) => pool[i]);
      if (!requireComposition(legs)) continue;
      const events = new Set(legs.map((l) => `${l.league}:${norm(l.eventId)}`));
      if (events.size !== legs.length) { refusals.SAME_GAME += 1; continue; }
      const players = legs.filter((l) => l.player).map((l) => `${l.league}:${norm(l.player)}`);
      if (new Set(players).size !== players.length) { refusals.DUPLICATE_PLAYER_EXPOSURE += 1; continue; }
      if (!checkCombination(legs).ok) { refusals.COMBINATION += 1; continue; }
      const windowCheck = checkCrossSportCard(legs.map((l) => ({ sport: l.league, eventId: l.eventId, providerAthleteId: l.player, team: l.team, market: l.market, line: l.line, lockAt: l.gameStart, capturedAt: l.capturedAt, side: l.side, book: l.book })), { now });
      if (!windowCheck.ok) { refusals.CROSS_SPORT_WINDOW += 1; continue; }
      const v2 = legs.map(toV2Leg);
      const price = combinedPrice(v2);
      const tier = price.available ? getRiskBucketForCombinedOdds(price.american) : null;
      if (!tier) { refusals.NO_BAND += 1; continue; }
      if (k > (BAND_MAX_LEGS[tier] ?? 2)) { refusals.TOO_MANY_LEGS_FOR_BAND += 1; continue; }
      const composition = [...new Set(legs.map((l) => l.league))].sort();
      const keys = legs.map(candidateKey).sort();
      const card = {
        cardId: `nba-${tier}-${composition.join("+")}-${fnv(keys.join("#"))}`,
        tier,
        sport: composition.length === 1 ? composition[0] : "multi",
        composition,
        source: { artifact: NBA_SOURCE_VERSION, generatedAt: new Date(ms(now)).toISOString() },
        notes: [SAME_GAME_POLICY.note],
        legs: v2,
      };
      const verdict = evaluateCard(card, ctx);
      if (!verdict.ok) { refusals.CARD_GATES += 1; continue; }
      const g = `${tier}|${composition.join("+")}`;
      const oldest = Math.min(...legs.map((l) => ms(l.capturedAt)));
      const list = groups.get(g) ?? [];
      list.push({ card, k, oldest });
      groups.set(g, list);
    }
  }
  const cards = [];
  for (const [, list] of [...groups.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    list.sort((a, b) => a.k - b.k || b.oldest - a.oldest || (a.card.cardId < b.card.cardId ? -1 : 1));
    cards.push(...list.slice(0, perGroup).map((x) => x.card));
  }
  return { cards, refusals, poolSize: pool.length, combosChecked: Math.min(seen, maxCombos) };
}

/**
 * What the board says about NBA. Under the real registry with no authorized price feed this is the accurate state:
 * "NBA legs need an authorized NBA price" — never an empty, unexplained card.
 * @param {{ candidates?: number, priceFeedAuthorized?: boolean, registryOpen?: boolean }} [s]
 */
export function nbaSourceStatus({ candidates = 0, priceFeedAuthorized = false, registryOpen = canEnterPredictionProducts("nba") } = {}) {
  const gates = [
    { gate: "registry", open: registryOpen, detail: `NBA capability state ${capabilityState("nba")}` },
    { gate: "price authorization", open: priceFeedAuthorized, detail: priceFeedAuthorized ? "an authorized NBA price feed is connected" : "no NBA price feed is authorized" },
    { gate: "player-prop settlement", open: nbaContractSettles({ market: NBA_FAMILY_MARKET_KEY.pts }), detail: "the NBA settlement contract grades moneyline, point spread and total points only" },
  ];
  if (candidates > 0) return { sport: "nba", state: NBA_SOURCE_STATE.CANDIDATES, text: `${candidates} NBA legs passed every gate.`, gates };
  if (!priceFeedAuthorized || !registryOpen) {
    return {
      sport: "nba", state: NBA_SOURCE_STATE.PRICE_NOT_AUTHORIZED, gates,
      text: "NBA legs need an authorized NBA price. No NBA price is authorized today and NBA is not yet cleared for suggested cards, so no NBA leg is offered. NBA projections stay on the NBA page.",
    };
  }
  return { sport: "nba", state: NBA_SOURCE_STATE.NO_ELIGIBLE_LEGS, gates, text: "No NBA leg passed every gate today." };
}

/**
 * The whole NBA path into the four tiers.
 * @param {object} input
 * @param {Array<{ok: boolean, leg?: object, refusal?: object}>} [input.results]  nbaLegFromEvaluation outputs
 * @param {object[]} [input.snapshots]       the official snapshots those legs name (display names only)
 * @param {object[]} [input.otherInputs]     candidate@1 inputs from other sports (NFL / UFC / EPL) for cross-sport cards
 * @param {string} input.now
 * @param {object|null} input.coverage
 * @param {object|null} [input.nbaRegistry]  TEST FIXTURE registry object, or null for the real one
 * @param {((s: string) => boolean)|null} [input.canEnterSport]  TESTS ONLY
 * @param {((l: object) => boolean)|null} [input.settlesNba]     TESTS ONLY
 * @param {(label: unknown) => boolean} [input.isVerifiedOperator]
 * @param {Record<string,string>} [input.statusFeed]
 * @param {boolean} [input.priceFeedAuthorized]
 */
export function nbaParlayLab({ results = [], snapshots = [], otherInputs = [], now, coverage = null, nbaRegistry = null, canEnterSport = null, settlesNba = null, isVerifiedOperator, statusFeed = {}, priceFeedAuthorized = false, perGroup = 1 }) {
  const nowMs = ms(now);
  if (nowMs == null) throw new TypeError("nbaParlayLab: `now` must be an ISO instant");
  const nba = nbaCandidateInputs({ results, snapshots, statusFeed });
  const candidates = [...nba.inputs, ...otherInputs].map(toNbaAwareCandidate);
  const leagueGate = canEnterSport ?? canEnterPredictionProducts;
  const pool = evaluatePool(candidates, { now, coverage, ...(isVerifiedOperator ? { isVerifiedOperator } : {}), canEnterLeague: leagueGate, nbaRegistry });
  const ctx = recommendCtx({ nowMs, coverage, ...(isVerifiedOperator ? { isVerifiedOperator } : {}), canEnterSport, settlesNba });
  const composed = composeCards({ candidates: pool.eligible, now, ctx, perGroup });
  const nbaEligible = pool.eligible.filter((c) => c.league === "nba").length;
  const status = nbaSourceStatus({ candidates: nbaEligible, priceFeedAuthorized: priceFeedAuthorized || nbaRegistry != null, registryOpen: canEnterPredictionProducts("nba") || nbaRegistry != null });
  const recommendation = recommendTiers({
    candidates: composed.cards, now, coverage, ...(isVerifiedOperator ? { isVerifiedOperator } : {}), canEnterSport, settlesNba,
    maxCardsPerTier: Math.max(3, perGroup * 4), sportNotes: [status],
  });
  return { version: NBA_SOURCE_VERSION, status, pool: { eligible: pool.eligible.length, nbaEligible, rejected: pool.rejected }, nbaInputs: nba, composed: { refusals: composed.refusals, poolSize: composed.poolSize, combosChecked: composed.combosChecked, cards: composed.cards.length }, recommendation };
}
