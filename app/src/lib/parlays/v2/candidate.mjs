/**
 * PARLAY LAB V2 · ONE CANDIDATE SHAPE FOR EVERY SPORT (`gtp.parlay.candidate@1`). Pure: inputs and the clock are
 * arguments; no fs.
 *
 * WHAT A CANDIDATE IS
 *   One priced selection a card could be built from, in the same fields whatever the league:
 *     { schema, league, eventId, eventLabel, gameStart, eventLockAt, player?, team?, market, marketLabel, side, line,
 *       selection, book, americanOdds, capturedAt, model, modelVersion, probability?, uncertainty?, forecastClass,
 *       participantStatus, marketStatus, priceMismatch, provenance, receipts, eligibility: { state, reasons[] } }
 *   `eventLockAt` is the instant the candidate stops being offered: game start minus the 30-minute activation
 *   cutoff (LEG_BOUNDS.activationCutoffMs) — the same cutoff every suggested card uses.
 *   `model` / `modelVersion` / `probability` come from the leg's own model stamp (UFC: `modelId`
 *   "ufc-fight-model@<sha>" + `modelProbability`). A market-priced leg carries null for all three — never an
 *   implied probability dressed up as a model output. `uncertainty` is null everywhere today: no published leg
 *   carries an interval.
 *
 * WHERE THEY COME FROM
 *   candidatesFromPublished adapts the EXISTING normalisers in ./candidates.mjs (MLB ladder joined to its props board;
 *   EPL / UFC / NFL ladders as-is). Nothing here reads a new artifact or re-prices anything.
 *
 * WHO MAY ENTER (evaluateCandidate — every refusal is a code from CANDIDATE_REASONS with its sentence)
 *   league      canEnterPredictionProducts(league) (FULL_MODEL only — MLB today). Injectable for tests. NBA is checked
 *               against the REAL registry regardless of injection: an NBA leg enters only once the registry itself
 *               says canEnterPredictionProducts("nba") — it is HISTORICAL_ONLY today, and this keeps it out. (Tests may
 *               pass `nbaRegistry`; it admits FIXTURE-provenance NBA candidates only — see evaluateCandidate.)
 *   mapping     event id, market, selection, and a line wherever the market has one
 *   time        start known; not locked (now < eventLockAt)
 *   price       present, inside LEG_BOUNDS, capture time known, ≤ 12 h old, captured before start, matches its board
 *   market      not suspended / closed; not a demoted market-context family (coverage required — fails closed)
 *   participant not out / questionable / doubtful / injured / inactive / scratched
 *   book        a verified operator (./operators.mjs — fails closed until PR #1130; injectable)
 *
 * WHICH MAY COMBINE (checkCombination)
 *   every leg eligible · ≥ 2 legs · no two legs from one event (D5) · no contradictory sides (the same subject on
 *   both sides of one market, or two winners of one event) · no duplicate player + market · and, ONLY when
 *   explicitly enabled, the PROPOSED cross-sport correlation caps below.
 *
 * FIXTURES ARE LABELLED AT THE SOURCE. A candidate built from __fixtures__ carries provenance FIXTURE, and any
 * combination containing one carries FIXTURE_LABEL. Published artifacts always yield PUBLISHED_ARTIFACT.
 */
import { LEG_BOUNDS } from "../../products/eligible-leg/contract.mjs";
import { canEnterPredictionProducts } from "../../sport-capability-registry.ts";
import { legIsMarketContext, marketContextFamilies } from "../card-leg-eligibility.mjs";
import { isVerifiedOperator as seamPredicate } from "./operators.mjs";
import { candidatesFromMlbLadder, candidatesFromSportLadder } from "./candidates.mjs";
import { PARTICIPANT_STATUS_FLAG, LINELESS_MARKET } from "./recommend.mjs";

export const CANDIDATE_SCHEMA = "gtp.parlay.candidate@1";
export const ELIGIBILITY = Object.freeze({ ELIGIBLE: "ELIGIBLE", INELIGIBLE: "INELIGIBLE" });
export const PROVENANCE = Object.freeze({ PUBLISHED: "PUBLISHED_ARTIFACT", FIXTURE: "FIXTURE" });
export const FIXTURE_LABEL = "FIXTURE — not real picks, not real prices";
export const POOL_STATE = Object.freeze({ QUALIFIED: "QUALIFIED_CANDIDATES", NONE: "NO_QUALIFIED_CANDIDATES" });

export const CANDIDATE_REASONS = Object.freeze({
  INVALID_MAPPING: "The selection is missing its game, market, selection or line.",
  LEAGUE_NOT_ELIGIBLE: "This league is not cleared for suggested cards (only fully modelled sports are).",
  START_UNKNOWN: "The game's start time is unknown.",
  LOCKED: "The game starts within 30 minutes or has started, so the selection is locked.",
  PRICE_MISSING: "No price is recorded.",
  PRICE_OUT_OF_RANGE: "The price is outside the −650 to +400 range suggested cards use.",
  PRICE_TIME_UNKNOWN: "The price has no capture time.",
  PRICE_STALE: "The price is more than 12 hours old.",
  PRICE_AFTER_START: "The price was captured after the game started.",
  PRICE_MISMATCH: "The price on the card does not match the recorded board.",
  MARKET_SUSPENDED: "The market is suspended or closed.",
  MARKET_CONTEXT_FAMILY: "This kind of market was demoted to market context.",
  COVERAGE_UNAVAILABLE: "The market-coverage list could not be read, so no selection can be cleared.",
  PARTICIPANT_UNAVAILABLE: "The player or team is listed as out, questionable or otherwise not available.",
  BOOK_INELIGIBLE: "The price is not from a verified sportsbook.",
});

export const COMBINATION_REASONS = Object.freeze({
  TOO_FEW_LEGS: "A parlay needs at least two legs.",
  INELIGIBLE_LEG: "A leg did not pass the candidate gates.",
  SAME_EVENT: "Two legs come from the same game (D5): same-game legs move together and no validated same-game price exists.",
  CONTRADICTORY_SIDES: "Two legs take opposite sides of the same market, or name two winners of one event.",
  DUPLICATE_PLAYER_MARKET: "The same player appears twice in the same market.",
  CORRELATION_CAP: "The legs exceed a proposed cross-sport correlation cap.",
});

/*
 * ── CROSS-SPORT CORRELATION CAPS — PROPOSED, DISABLED BY DEFAULT ─────────────────────────────────────────────────
 *
 * Distinct-event legs (D5) are still not independent in every way: two legs in one league share a news cycle and a
 * slate, two "winner" legs share a favourite-longshot bias, two legs on one team (across a doubleheader or a
 * cup + league week) share that team's form. These caps would bound that stacking. They are NOT approved: no
 * validated correlation model exists in this codebase to set them, so they are off unless a caller passes
 * `applyProposedCaps: true`, and turning them on by default is a founder decision (docs/PARLAY_LAB_V2.md).
 */
export const CROSS_SPORT_CORRELATION_CAPS_ENABLED = false;
export const PROPOSED_CROSS_SPORT_CORRELATION_CAPS = Object.freeze({
  status: "PROPOSED",
  maxLegsPerLeague: 3,
  maxLegsPerMarketFamily: 2,
  maxLegsPerTeam: 1,
});

const str = (v) => (v == null || v === "" ? null : String(v));
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const norm = (v) => String(v ?? "").trim().toLowerCase();
const SUSPENDED = /^(suspended|closed|off|unavailable|halted)\b/i;
/** Lineless winner-type markets, where two different selections in one event cannot both win. */
const WINNER_MARKET = /moneyline|h2h|match_result|winner|fight|to_win/i;
/** A coarse market family for the proposed caps: every "who wins" market is one family across sports. */
export const marketFamily = (market) => (WINNER_MARKET.test(String(market ?? "")) ? "winner" : norm(market));

/** "ufc-fight-model@e657fc40b64d" → { model: "ufc-fight-model", modelVersion: "e657fc40b64d" }. */
function parseModelId(id) {
  const s = str(id);
  if (!s) return { model: null, modelVersion: null };
  const at = s.lastIndexOf("@");
  return at > 0 ? { model: s.slice(0, at), modelVersion: s.slice(at + 1) || null } : { model: s, modelVersion: null };
}

/** Identity of a candidate (league | event | market | subject | side | line | book). */
export const candidateKey = (c) => [norm(c.league), norm(c.eventId), norm(c.market), norm(c.player ?? c.team), norm(c.side), c.line == null ? "" : String(c.line), norm(c.book)].join("|");

/**
 * Adapt one normalised V2 leg (./candidates.mjs shape) into the unified candidate. Eligibility starts empty; call
 * evaluateCandidate to fill it.
 * @param {any} leg
 * @param {{ provenance?: string }} [opts]
 */
export function toCandidate(leg, { provenance = PROVENANCE.PUBLISHED } = {}) {
  const startMs = Date.parse(leg?.startUtc ?? "");
  const { model, modelVersion } = parseModelId(leg?.modelId);
  return {
    schema: CANDIDATE_SCHEMA,
    league: norm(leg?.sport),
    eventId: str(leg?.eventId),
    eventLabel: str(leg?.eventLabel),
    gameStart: Number.isFinite(startMs) ? new Date(startMs).toISOString() : null,
    eventLockAt: Number.isFinite(startMs) ? new Date(startMs - LEG_BOUNDS.activationCutoffMs).toISOString() : null,
    player: str(leg?.participant),
    team: str(leg?.team),
    market: str(leg?.market),
    marketLabel: str(leg?.marketLabel),
    side: str(leg?.side),
    line: num(leg?.line),
    selection: str(leg?.selection),
    book: str(leg?.book),
    americanOdds: num(leg?.price),
    capturedAt: str(leg?.capturedAt),
    model,
    modelVersion,
    probability: model ? num(leg?.modelProbability) : null,
    uncertainty: num(leg?.uncertainty),
    forecastClass: str(leg?.forecastClass),
    participantStatus: str(leg?.participantStatus),
    marketStatus: str(leg?.marketStatus),
    priceMismatch: !!leg?.priceMismatch,
    provenance,
    receipts: [...(leg?.receipts ?? [])],
    eligibility: { state: null, reasons: [] },
  };
}

/**
 * Every leg of every published card, as unified candidates, de-duplicated (a leg reused across tiers is one
 * candidate). Uses the existing normalisers only.
 * @param {{ mlb?: { ladder: any, board: any } | null, ladders?: Record<string, any> }} input
 *   `ladders` maps a league ("epl" | "ufc" | "nfl" | …) to its parsed risk-ladder-<league> document.
 */
export function candidatesFromPublished({ mlb = null, ladders = {} } = {}) {
  const cards = [
    ...(mlb ? candidatesFromMlbLadder(mlb.ladder, mlb.board) : []),
    ...Object.entries(ladders ?? {}).flatMap(([league, doc]) => candidatesFromSportLadder(doc, league)),
  ];
  const seen = new Map();
  for (const c of cards) for (const l of c.legs ?? []) {
    const cand = toCandidate(l, { provenance: PROVENANCE.PUBLISHED });
    const k = candidateKey(cand);
    if (!seen.has(k)) seen.set(k, cand);
  }
  return [...seen.values()];
}

/**
 * @typedef {object} CandidateCtx
 * @property {string} now                                        ISO instant
 * @property {object|null} coverage                              committed coverage projection (null ⇒ fail closed)
 * @property {(label: unknown) => boolean} [isVerifiedOperator]  defaults to the seam (closed until #1130)
 * @property {(league: string) => boolean} [canEnterLeague]      defaults to canEnterPredictionProducts
 */

/**
 * The candidate gates. Returns a copy with `eligibility` filled.
 *
 * NBA: the real registry decides, whatever `canEnterLeague` says. The ONE exception is a TEST FIXTURE world: a caller
 * may pass `nbaRegistry` (the same injected registry object the NBA leg adapter took, products/nba/nba-leg.mjs), and
 * then only a candidate whose provenance is FIXTURE may enter — a published NBA candidate still needs the real
 * registry. So an injected registry can exercise the path but never admit a real NBA leg.
 */
export function evaluateCandidate(c, { now, coverage, isVerifiedOperator = seamPredicate, canEnterLeague = canEnterPredictionProducts, nbaRegistry = null }) {
  const nowMs = Date.parse(now ?? "");
  if (!Number.isFinite(nowMs)) throw new TypeError("evaluateCandidate: `now` must be an ISO instant");
  const r = [];
  const lineRequired = !LINELESS_MARKET.test(String(c?.market ?? ""));
  if (!c?.eventId || !c?.market || !c?.selection || (lineRequired && !Number.isFinite(c?.line))) r.push("INVALID_MAPPING");

  let injectedNbaOk = false;
  try { injectedNbaOk = nbaRegistry != null && c?.provenance === PROVENANCE.FIXTURE && nbaRegistry.canEnterPredictionProducts("nba") === true; } catch { injectedNbaOk = false; }
  const leagueOk = c?.league === "nba" ? (canEnterPredictionProducts("nba") || injectedNbaOk) && canEnterLeague("nba") : canEnterLeague(c?.league);
  if (!leagueOk) r.push("LEAGUE_NOT_ELIGIBLE");

  const start = Date.parse(c?.gameStart ?? "");
  const lock = Date.parse(c?.eventLockAt ?? "");
  if (!Number.isFinite(start)) r.push("START_UNKNOWN");
  else if (!Number.isFinite(lock) || nowMs >= lock) r.push("LOCKED");

  if (!Number.isFinite(c?.americanOdds) || c.americanOdds === 0) r.push("PRICE_MISSING");
  else if (c.americanOdds < LEG_BOUNDS.oddsMin || c.americanOdds > LEG_BOUNDS.oddsMax) r.push("PRICE_OUT_OF_RANGE");
  const cap = Date.parse(c?.capturedAt ?? "");
  if (!Number.isFinite(cap)) r.push("PRICE_TIME_UNKNOWN");
  else {
    if (nowMs - cap > LEG_BOUNDS.maxPriceAgeMs) r.push("PRICE_STALE");
    if (Number.isFinite(start) && cap >= start) r.push("PRICE_AFTER_START");
  }
  if (c?.priceMismatch) r.push("PRICE_MISMATCH");

  if (typeof c?.marketStatus === "string" && SUSPENDED.test(c.marketStatus.trim())) r.push("MARKET_SUSPENDED");
  if (!coverage) r.push("COVERAGE_UNAVAILABLE");
  else if (legIsMarketContext({ sport: c?.league, market: c?.market }, marketContextFamilies(coverage))) r.push("MARKET_CONTEXT_FAMILY");

  if (typeof c?.participantStatus === "string" && PARTICIPANT_STATUS_FLAG.test(c.participantStatus.trim())) r.push("PARTICIPANT_UNAVAILABLE");
  if (!isVerifiedOperator(c?.book)) r.push("BOOK_INELIGIBLE");

  const reasons = [...new Set(r)].sort().map((code) => ({ code, text: CANDIDATE_REASONS[code] }));
  return { ...c, eligibility: { state: reasons.length ? ELIGIBILITY.INELIGIBLE : ELIGIBILITY.ELIGIBLE, reasons } };
}

/**
 * Evaluate a pool. `state` is QUALIFIED_CANDIDATES when at least one candidate is eligible, else
 * NO_QUALIFIED_CANDIDATES (with every rejection and its reasons).
 */
export function evaluatePool(candidates, ctx) {
  const evaluated = (candidates ?? []).map((c) => evaluateCandidate(c, ctx));
  const eligible = evaluated.filter((c) => c.eligibility.state === ELIGIBILITY.ELIGIBLE);
  const rejected = evaluated.filter((c) => c.eligibility.state !== ELIGIBILITY.ELIGIBLE);
  const fixture = evaluated.some((c) => c.provenance === PROVENANCE.FIXTURE);
  return {
    state: eligible.length ? POOL_STATE.QUALIFIED : POOL_STATE.NONE,
    eligible,
    rejected: rejected.map((c) => ({ key: candidateKey(c), league: c.league, reasons: c.eligibility.reasons.map((x) => x.code) })),
    leagues: [...new Set(eligible.map((c) => c.league))].sort(),
    provenance: fixture ? PROVENANCE.FIXTURE : PROVENANCE.PUBLISHED,
    label: fixture ? FIXTURE_LABEL : null,
  };
}

const eventKey = (c) => (c?.eventId ? `${norm(c.league)}:${norm(c.eventId)}` : null);

/**
 * May these (already evaluated) candidates form one card? Reasons name the leg indexes involved.
 * @param {ReadonlyArray<any>} legs  candidates with `eligibility` filled
 * @param {{ applyProposedCaps?: boolean, caps?: typeof PROPOSED_CROSS_SPORT_CORRELATION_CAPS }} [opts]
 */
export function checkCombination(legs, { applyProposedCaps = CROSS_SPORT_CORRELATION_CAPS_ENABLED, caps = PROPOSED_CROSS_SPORT_CORRELATION_CAPS } = {}) {
  const list = legs ?? [];
  const reasons = [];
  const add = (code, idx, detail = null) => reasons.push({ code, text: COMBINATION_REASONS[code], legs: idx, ...(detail ? { detail } : {}) });

  if (list.length < 2) add("TOO_FEW_LEGS", []);
  list.forEach((c, i) => { if (c?.eligibility?.state !== ELIGIBILITY.ELIGIBLE) add("INELIGIBLE_LEG", [i]); });

  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const a = list[i], b = list[j];
      const ea = eventKey(a), eb = eventKey(b);
      if (ea == null || eb == null || ea === eb) add("SAME_EVENT", [i, j]);
      const sameMarket = norm(a.market) !== "" && norm(a.market) === norm(b.market);
      if (ea != null && ea === eb && sameMarket) {
        const sameSubject = norm(a.player ?? a.team) === norm(b.player ?? b.team);
        const oppositeSides = norm(a.side) !== norm(b.side);
        const twoWinners = WINNER_MARKET.test(String(a.market)) && norm(a.selection) !== norm(b.selection);
        if ((sameSubject && oppositeSides) || twoWinners) add("CONTRADICTORY_SIDES", [i, j]);
      }
      if (a.player && b.player && norm(a.player) === norm(b.player) && sameMarket) add("DUPLICATE_PLAYER_MARKET", [i, j]);
    }
  }

  if (applyProposedCaps) {
    const count = (fn) => { const m = new Map(); list.forEach((c, i) => { const k = fn(c); if (k) m.set(k, [...(m.get(k) ?? []), i]); }); return m; };
    for (const [k, idx] of count((c) => norm(c.league))) if (idx.length > caps.maxLegsPerLeague) add("CORRELATION_CAP", idx, `league ${k}: ${idx.length} > ${caps.maxLegsPerLeague}`);
    for (const [k, idx] of count((c) => marketFamily(c.market))) if (idx.length > caps.maxLegsPerMarketFamily) add("CORRELATION_CAP", idx, `market family ${k}: ${idx.length} > ${caps.maxLegsPerMarketFamily}`);
    for (const [k, idx] of count((c) => (c.team ? `${norm(c.league)}:${norm(c.team)}` : null))) if (idx.length > caps.maxLegsPerTeam) add("CORRELATION_CAP", idx, `team ${k}: ${idx.length} > ${caps.maxLegsPerTeam}`);
  }

  const fixture = list.some((c) => c?.provenance === PROVENANCE.FIXTURE);
  return {
    ok: reasons.length === 0,
    reasons,
    leagues: [...new Set(list.map((c) => norm(c?.league)))].sort(),
    crossSport: new Set(list.map((c) => norm(c?.league))).size > 1,
    capsApplied: !!applyProposedCaps,
    provenance: fixture ? PROVENANCE.FIXTURE : PROVENANCE.PUBLISHED,
    label: fixture ? FIXTURE_LABEL : null,
  };
}
