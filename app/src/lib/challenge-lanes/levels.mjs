/**
 * BANK BUILDER & MOONSHOT · RECOMMENDATION CLASSES under `bbm-rules@2` (founder directive 2026-11-04 ~19:00Z). PURE.
 *
 *   LEVEL_A  MODEL-VALIDATED VALUE    a validated probability with EV under uncertainty (rules-v2.mjs). None today.
 *   LEVEL_B  HISTORICAL HIT-RATE RESEARCH   hit-rate evidence, role, availability, data quality and price checks pass.
 *            NO EV CLAIM and no probability: a hit rate is shown only as hits of n, never as a percentage chance.
 *            Appears only in an explicitly labelled research challenge, and only if the founder approves that mode.
 *   HOLD     anything else, with every reason.
 *
 * Six signals are separate inputs and are reported separately; they are never added up into a "probability":
 *   A evidence strength (hit-rate windows with denominators, the evaluator's shrunk rate)
 *   B role / minutes stability          C availability / injury          D data quality
 *   E market (exact line at one book, depth, bounds, freshness)          F model validation (Level A only)
 * A card is LEVEL_B only when every leg is; Level B cards are ranked by an explicit rules-based order (below), labelled
 * as such. Props (pts/reb/ast) and moneylines are candidates alike; prop prices come from the private props capture.
 */
import { canonical, sha256 } from "./chain.mjs";
import { priceRatio, payoutCents, decimalToAmerican } from "./payout.mjs";
import { stepPosition, RULES_VERSION } from "./rules-v2.mjs";
import { ELIGIBLE_OPERATOR_KEYS } from "../sports/odds/eligible-operators.mjs";
import { EVIDENCE_LABEL } from "./card-fields.mjs";
export { EVIDENCE_LABEL, PRIVATE_LEG_FIELDS, publicLeg, privateLeg } from "./card-fields.mjs";

export const SHORTLIST_SCHEMA = "gtp.bbm.level-b-shortlist@1";
export const LEVEL = Object.freeze({ A: "LEVEL_A", B: "LEVEL_B", HOLD: "HOLD" });
export const LEVEL_LABEL = Object.freeze({ LEVEL_A: "MODEL-VALIDATED VALUE", LEVEL_B: "HISTORICAL HIT-RATE RESEARCH — no EV claim", HOLD: "HOLD" });
export const RANKING_LABEL = "RULES-BASED RANKING — an ordering of evidence, not a probability; no EV claim";
export const PROP_FAMILIES = Object.freeze({ pts: "player_points", reb: "player_rebounds", ast: "player_assists" });

export const LEVEL_B_PARAMS = Object.freeze({
  minLongestWindowN: Object.freeze({ value: 20, state: "PROPOSED" }),
  minShrunkRate: Object.freeze({ value: 0.60, state: "PROPOSED" }),
  minGamesPlayed: Object.freeze({ value: 3, state: "PROPOSED" }),
  maxMinutesCv: Object.freeze({ value: 0.25, state: "PROPOSED" }),
  allowedInjury: Object.freeze({ value: Object.freeze(["ACTIVE", "PROBABLE"]), state: "PROPOSED" }),
  /* Founder 2026-11-04 ~19:25Z: an evening prop needs its role under tonight's lineup, not static morning evidence. */
  requireLineup: Object.freeze({ value: true, state: "PROPOSED" }),
  legDecimalRange: Object.freeze({ value: Object.freeze([1.25, 4.0]), state: "PROPOSED" }),
  minBooksAtLine: Object.freeze({ value: 2, state: "PROPOSED" }),
  maxQuoteAgeMs: Object.freeze({ value: 90 * 60 * 1000, state: "PROPOSED" }),
  bandPct: Object.freeze({ value: 0.10, state: "PROPOSED" }),
  rateBucket: Object.freeze({ value: 0.05, state: "PROPOSED" }),
});
const P = (k, over) => over?.[k] ?? LEVEL_B_PARAMS[k].value;
/* Bucket index with a tolerance: 0.60 / 0.05 is 11.999… in binary floating point, and 0.60 must sit in bucket 12. */
const bucketOf = (x, bucket) => Math.floor(x / bucket + 1e-9);

/** "hits of n" text: the ONLY way a hit rate is displayed. 5 of 5 is "5 of 5", never "100%". */
export const hitRateText = (w) => `${w.hits} of ${w.n} (${w.window})`;

/** Refuse a malformed shortlist whole. */
export function verifyShortlist(doc) {
  const errs = [];
  if (doc?.schema !== SHORTLIST_SCHEMA) errs.push(`schema must be ${SHORTLIST_SCHEMA}`);
  for (const [i, c] of (doc?.candidates ?? []).entries()) {
    const at = `candidates[${i}]`;
    if (!c.eventId || !c.startUtc || !c.eventLabel) errs.push(`${at}: eventId/eventLabel/startUtc`);
    if (![...Object.keys(PROP_FAMILIES), "winner"].includes(c.family)) errs.push(`${at}: family ${c.family}`);
    if (c.family !== "winner" && !(c.player?.playerId && typeof c.line === "number" && ["over", "under"].includes(c.side))) errs.push(`${at}: a prop needs player.playerId, an exact line and side over/under`);
    if (c.family === "winner" && !["home", "away"].includes(c.side)) errs.push(`${at}: winner side`);
    for (const w of c.hitRate?.windows ?? []) if (!(Number.isInteger(w.hits) && Number.isInteger(w.n) && w.n > 0 && w.hits >= 0 && w.hits <= w.n)) errs.push(`${at}: window ${w.window} needs integer hits ≤ n`);
  }
  return errs.length ? { ok: false, errors: errs } : { ok: true };
}

/** The leg schema (founder contract), from one shortlist row. Probability and EV are null: Level B never carries them. */
export function legFromShortlist(c) {
  /* The leg id never contains the line: ids are public, the line is price data. */
  const id = c.family === "winner" ? `nba:${c.eventId}:winner:${c.side}` : `nba:${c.eventId}:${c.family}:${c.player.playerId}:${c.side}`;
  return {
    legId: id, sport: "nba", gameId: String(c.eventId), eventLabel: c.eventLabel, startUtc: c.startUtc,
    market: c.family === "winner" ? "h2h" : PROP_FAMILIES[c.family], family: c.family,
    player: c.player ?? null, team: c.family === "winner" ? c.teamAbbr ?? null : c.player?.team ?? null, side: c.side, line: c.line ?? null,
    forecastVersion: c.forecastVersion ?? null, evidenceSha256: c.evidenceSha256 ?? null,
    projection: c.projection ? { value: c.projection.value ?? null, label: "MODEL PROJECTION", snapshotId: c.projection.snapshotId ?? null } : null,
    hitRate: c.hitRate ? { windows: (c.hitRate.windows ?? []).map((w) => ({ window: w.window, hits: w.hits, n: w.n, text: hitRateText(w) })), shrunk: c.hitRate.shrunk ?? null, lineBasis: c.hitRate.lineBasis ?? null } : null,
    role: c.role ?? null, injury: c.injury ?? null, dataQuality: c.dataQuality ?? null, lineup: c.lineup ?? null,
    probability: null, uncertainty: null, ev: null,
  };
}

/** Prop quotes indexed for exact matching: (event, player, family, line, book) → latest record. */
export function indexPropCapture(capture) {
  const ix = new Map();
  for (const r of capture?.records ?? []) {
    if (r.schema !== "gtp.nba.prop-price@1" || typeof r.line !== "number") continue;
    const k = `${r.eventId}|${r.providerAthleteId}|${r.family}|${r.line}|${r.book}`;
    const prev = ix.get(k);
    if (!prev || String(r.fetchedAt) > String(prev.fetchedAt)) ix.set(k, r);
  }
  return ix;
}

/** One leg's quote at one book: exact line (props) or the h2h side, or null. */
function quoteAt(leg, book, { propIx, h2h }) {
  if (leg.family === "winner") {
    const o = h2h?.games?.[leg.gameId]?.books?.[book]?.[leg.side];
    const other = h2h?.games?.[leg.gameId]?.books?.[book]?.[leg.side === "home" ? "away" : "home"];
    return Number.isInteger(o?.price) ? { book, american: o.price, otherAmerican: other?.price ?? null, quotedAt: h2h.games[leg.gameId].books[book].lastUpdate ?? null, fetchedAt: h2h.fetchedAt, line: null } : null;
  }
  const r = propIx?.get(`${leg.gameId}|${leg.player.playerId}|${leg.family}|${leg.line}|${book}`);
  if (!r) return null;
  const american = leg.side === "over" ? r.overAmerican : r.underAmerican;
  const otherAmerican = leg.side === "over" ? r.underAmerican : r.overAmerican;
  return Number.isInteger(american) ? { book, american, otherAmerican: otherAmerican ?? null, quotedAt: r.capturedAt ?? null, fetchedAt: r.fetchedAt ?? null, line: r.line, recordId: r.recordId ?? null } : null;
}
const booksQuoting = (leg, books, q) => books.filter((b) => quoteAt(leg, b, q)).length;

/** Per-leg Level B signals A–E (F, model validation, is Level A only and is "not validated" today). */
export function legSignals(leg, { params = null, now } = {}) {
  const r = [];
  const w = leg.hitRate?.windows ?? [];
  const longest = w.reduce((m, x) => Math.max(m, x.n), 0);
  const A = { longestN: longest, windows: w.map((x) => x.text), shrunkRate: leg.hitRate?.shrunk?.rate ?? null, nEffective: leg.hitRate?.shrunk?.nEffective ?? null };
  if (!w.length) r.push(`A_NO_EVIDENCE ${leg.legId}: no hit-rate windows`);
  else if (longest < P("minLongestWindowN", params)) r.push(`A_SMALL_SAMPLE ${leg.legId}: longest window n ${longest} < ${P("minLongestWindowN", params)}`);
  if (!(typeof A.shrunkRate === "number")) r.push(`A_NO_SHRUNK_RATE ${leg.legId}`);
  else if (A.shrunkRate < P("minShrunkRate", params)) r.push(`A_WEAK_EVIDENCE ${leg.legId}: shrunk ${A.shrunkRate.toFixed(3)} < ${P("minShrunkRate", params)}`);
  const ro = leg.role;
  const cv = ro && ro.minutesAvg > 0 && typeof ro.minutesSd === "number" ? ro.minutesSd / ro.minutesAvg : null;
  const B = { stable: ro?.stable ?? null, gamesPlayed: ro?.gamesPlayed ?? null, minutesCv: cv };
  if (leg.family !== "winner") {
    if (!ro) r.push(`B_NO_ROLE ${leg.legId}`);
    else {
      if (ro.stable !== true) r.push(`B_ROLE_UNSTABLE ${leg.legId}${ro.note ? `: ${ro.note}` : ""}`);
      if (!(ro.gamesPlayed >= P("minGamesPlayed", params))) r.push(`B_FEW_GAMES ${leg.legId}: ${ro.gamesPlayed ?? 0} < ${P("minGamesPlayed", params)}`);
      if (cv == null || cv > P("maxMinutesCv", params)) r.push(`B_MINUTES_VOLATILE ${leg.legId}: minutes CV ${cv == null ? "unknown" : cv.toFixed(3)}`);
    }
  }
  const C = { status: leg.injury?.status ?? null, fetchedAt: leg.injury?.fetchedAt ?? null };
  if (leg.family !== "winner" && !P("allowedInjury", params).includes(C.status)) r.push(`C_AVAILABILITY ${leg.legId}: ${C.status ?? "unknown"}`);
  /* Lineup sensitivity: the evaluator's teammate-scenario splits (k/n at this line per scenario) decide whether the base
     sample represents tonight. Unknown → HOLD; sensitive or unrepresentative → HOLD. */
  const lu = leg.lineup;
  C.lineup = lu ? { tonightScenario: lu.tonightScenario ?? null, sensitive: lu.sensitive ?? null, baseRepresentative: lu.baseRepresentative ?? null, scenarios: (lu.scenarios ?? []).map((x) => `${x.label}: ${x.hits}/${x.games}${x.minutesAvg != null ? ` · ${x.minutesAvg} min` : ""}`), keyTeammates: (lu.keyTeammates ?? []).map((t) => `${t.name} ${t.statusNow}`) } : null;
  if (leg.family !== "winner" && P("requireLineup", params)) {
    if (!lu) r.push(`C_LINEUP_UNKNOWN ${leg.legId}: no teammate-scenario evidence`);
    else if (lu.sensitive !== false || lu.baseRepresentative !== true) r.push(`C_LINEUP_SENSITIVE ${leg.legId}: ${lu.sensitive !== false ? "role shifts across plausible teammate scenarios" : "base sample does not represent tonight's lineup"}${lu.note ? ` (${lu.note})` : ""}`);
  }
  const D = { ok: leg.dataQuality?.ok ?? null, issues: leg.dataQuality?.issues ?? [] };
  if (D.ok !== true) r.push(`D_DATA_QUALITY ${leg.legId}: ${D.issues.join(", ") || "not confirmed"}`);
  if (!(Date.parse(leg.startUtc) > Date.parse(now))) r.push(`STARTED ${leg.legId}`);
  return { signals: { A, B, C, D, F: { validated: false, note: "no leg model is validated for EV today (Level A unavailable)" } }, reasons: r };
}

/**
 * One candidate (1 or 2 legs) at one lane position. Classification: LEVEL_B only with zero reasons; else HOLD.
 * @param {object[]} set   legs from legFromShortlist
 * @param {{ position, now, propCapture?, propIx?, propCaptureSha256?, h2h?, params?, excludeGames?, bookmakers? }} ctx
 */
export function evaluateLevelSet(set, { position, now, propIx, propCaptureSha256 = null, h2h = null, params = null, excludeGames = [], bookmakers = ELIGIBLE_OPERATOR_KEYS }) {
  const legs = [...set].sort((a, b) => String(a.startUtc).localeCompare(String(b.startUtc)) || a.legId.localeCompare(b.legId));
  const reasons = [];
  const perLeg = legs.map((l) => { const s = legSignals(l, { params, now }); reasons.push(...s.reasons); return s.signals; });
  if (legs.length > 2) reasons.push("LEG_COUNT_EXCEEDED");
  const players = legs.filter((l) => l.player).map((l) => l.player.playerId);
  if (new Set(players).size !== players.length) reasons.push("CORRELATED_SAME_PLAYER: no dependence model for two lines of one player");
  if (new Set(legs.map((l) => l.gameId)).size !== legs.length) reasons.push("CORRELATED_SAME_GAME: no dependence model and no provider-quoted same-game price");
  for (const l of legs) if (excludeGames.includes(l.gameId)) reasons.push(`DIVERSIFICATION ${l.legId}: game held by the other lane`);
  const candidateId = `v2b-${sha256(`${RULES_VERSION}|B|${position.product}|${position.step}|${legs.map((l) => l.legId).join("+")}`).slice(0, 16)}`;
  const base = { candidateId, legCount: legs.length, rulesVersion: RULES_VERSION, rankingLabel: RANKING_LABEL, probability: null, ev: null, evClaim: false };
  const legView = (q) => legs.map((l, i) => ({ ...l, quote: q?.[i] ?? null, signals: perLeg[i] }));

  /* E: one book prices every leg at its exact line; the first eligible operator in fixed order (never shopped). */
  const q = { propIx, h2h };
  const book = bookmakers.find((b) => legs.every((l) => quoteAt(l, b, q)));
  if (!book) return { ...base, classification: LEVEL.HOLD, reasons: [...reasons, "E_NO_SINGLE_BOOK_AT_EXACT_LINE"], legs: legView(null), price: null, money: null };
  const quotes = legs.map((l) => quoteAt(l, book, q));
  const [minDec, maxDec] = P("legDecimalRange", params);
  let ratio = { n: 1n, d: 1n };
  quotes.forEach((x, i) => {
    const l = legs[i]; const r = priceRatio("american", x.american); const ro = x.otherAmerican == null ? null : priceRatio("american", x.otherAmerican);
    if (!r) { reasons.push(`E_BAD_ODDS ${l.legId}`); return; }
    const d = Number(r.n) / Number(r.d);
    x.decimal = d;
    if (ro && 1 / d + Number(ro.d) / Number(ro.n) < 1) reasons.push(`E_BAD_ODDS ${l.legId}: two-way implied below 1`);
    if (d < minDec || d > maxDec) reasons.push(`E_PRICE_BOUNDS ${l.legId}: decimal ${d.toFixed(4)} outside [${minDec}, ${maxDec}]`);
    const depth = booksQuoting(l, bookmakers, q); x.booksAtLine = depth;
    if (depth < P("minBooksAtLine", params)) reasons.push(`E_THIN_MARKET ${l.legId}: ${depth} books at this exact line`);
    const age = Date.parse(now) - Date.parse(x.fetchedAt);
    if (!(age >= 0 && age <= P("maxQuoteAgeMs", params))) reasons.push(`E_STALE_QUOTE ${l.legId}: fetched ${x.fetchedAt}`);
    ratio = { n: ratio.n * BigInt(r.n), d: ratio.d * BigInt(r.d) };
  });
  const D = Number(ratio.n) / Number(ratio.d);
  const money = { stakeCents: position.bankrollCents, ...payoutCents(position.bankrollCents, ratio) };
  if (money.grossPayoutCents < position.band.loCents || money.grossPayoutCents > position.band.hiCents) reasons.push(`OUT_OF_BAND: gross ${money.grossPayoutCents} outside [${position.band.loCents}, ${position.band.hiCents}]`);
  const minShrunk = Math.min(...perLeg.map((s) => s.A.shrunkRate ?? 0));
  const minN = Math.min(...perLeg.map((s) => s.A.longestN ?? 0));
  const maxCv = Math.max(...perLeg.map((s) => s.B.minutesCv ?? 0));
  const freshest = Math.min(...quotes.map((x) => Date.parse(now) - Date.parse(x.fetchedAt)));
  return {
    ...base, classification: reasons.length ? LEVEL.HOLD : LEVEL.B, classificationLabel: LEVEL_LABEL[reasons.length ? LEVEL.HOLD : LEVEL.B], reasons,
    legs: legView(quotes),
    price: { book, method: "CALCULATED_LEG_PRODUCT", label: "calculated leg product", decimal: D, american: decimalToAmerican(D), ratio: { n: String(ratio.n), d: String(ratio.d) }, propCaptureSha256, h2hSnapshotSha256: h2h?.snapshotSha256 ?? null },
    money, targetDeviation: money.grossPayoutCents / position.targetCents - 1,
    rankKeys: { weakestShrunkRate: minShrunk, smallestLongestN: minN, worstMinutesCv: maxCv, legCount: legs.length, freshestQuoteAgeMs: freshest },
  };
}

/** All 1- and 2-leg Level B candidates at one position, ranked by the rules-based order. */
export function evaluateLevelCandidates({ legs, position, now, propCapture = null, propCaptureSha256 = null, h2h = null, params = null, excludeGames = [], bookmakers = ELIGIBLE_OPERATOR_KEYS }) {
  const propIx = indexPropCapture(propCapture);
  const ctx = { position, now, propIx, propCaptureSha256, h2h, params, excludeGames, bookmakers };
  const sets = legs.map((l) => [l]);
  for (let i = 0; i < legs.length; i++) for (let j = i + 1; j < legs.length; j++) sets.push([legs[i], legs[j]]);
  const rows = sets.map((s) => evaluateLevelSet(s, ctx));
  const bucket = P("rateBucket", params);
  /* RULES-BASED ORDER (labelled, not a probability): weakest leg's shrunk rate (bucketed), then fewer legs, then the
     smallest evidence denominator, then minutes stability, then closeness to the step target, then freshness, then id. */
  const ranked = rows.filter((r) => r.classification === LEVEL.B).sort((a, b) =>
    bucketOf(b.rankKeys.weakestShrunkRate, bucket) - bucketOf(a.rankKeys.weakestShrunkRate, bucket)
    || a.rankKeys.legCount - b.rankKeys.legCount
    || b.rankKeys.smallestLongestN - a.rankKeys.smallestLongestN
    || a.rankKeys.worstMinutesCv - b.rankKeys.worstMinutesCv
    || Math.abs(a.targetDeviation) - Math.abs(b.targetDeviation)
    || a.rankKeys.freshestQuoteAgeMs - b.rankKeys.freshestQuoteAgeMs
    || a.candidateId.localeCompare(b.candidateId));
  ranked.forEach((r, i) => { r.rank = i + 1; });
  const inBand = rows.filter((r) => r.money && r.money.grossPayoutCents >= position.band.loCents && r.money.grossPayoutCents <= position.band.hiCents).length;
  return { rulesVersion: RULES_VERSION, rankingLabel: RANKING_LABEL, position, now, candidates: rows, ranked, counts: { total: rows.length, priced: rows.filter((r) => r.money).length, inBand, levelB: ranked.length } };
}

const heldOf = (ev) => {
  const why = {};
  for (const c of ev.candidates) for (const r of c.reasons) { const k = r.split(/[ :]/)[0]; why[k] = (why[k] ?? 0) + 1; }
  return { classification: LEVEL.HOLD, code: "NO_QUALIFIED_CARD", reasonCounts: why, inBand: ev.counts.inBand };
};

/** Lanes A and B: independent positions; B game-disjoint from A and Level B on its own merits, or HOLD. */
export function constructLevelPair({ legs, now, product, laneA, laneB, propCapture, propCaptureSha256, h2h, params }) {
  const pos = (l) => stepPosition({ product, ...l, params: params?.bandPct != null ? { bandPct: params.bandPct } : null });
  const pA = pos(laneA); const pB = pos(laneB);
  const common = { legs, now, propCapture, propCaptureSha256, h2h, params };
  const evA = pA.ok ? evaluateLevelCandidates({ ...common, position: pA }) : null;
  const A = evA?.ranked[0] ? { classification: LEVEL.B, candidate: evA.ranked[0] } : evA ? heldOf(evA) : { classification: LEVEL.HOLD, code: pA.refusal };
  const exclude = A.candidate ? A.candidate.legs.map((l) => l.gameId) : [];
  const evB = pB.ok ? evaluateLevelCandidates({ ...common, position: pB, excludeGames: exclude }) : null;
  const B = evB?.ranked[0] ? { classification: LEVEL.B, candidate: evB.ranked[0] } : evB ? heldOf(evB) : { classification: LEVEL.HOLD, code: pB.refusal };
  return { rulesVersion: RULES_VERSION, product, mode: "LEVEL_B_RESEARCH (founder approval required)", A, B, evaluation: { A: evA, B: evB } };
}

/** The card record (founder contract): classification plus the approval and publication receipts, all pending. */
export function levelCardRecord(candidate, { laneId, date }) {
  return {
    schema: "gtp.bbm.card@2", rulesVersion: RULES_VERSION, laneId, date, candidateId: candidate.candidateId,
    classification: candidate.classification, classificationLabel: LEVEL_LABEL[candidate.classification], evidenceLabel: EVIDENCE_LABEL[candidate.classification] ?? null, evClaim: false, probability: null,
    legs: candidate.legs.map((l) => ({ legId: l.legId, sport: l.sport, gameId: l.gameId, eventLabel: l.eventLabel, startUtc: l.startUtc, player: l.player, team: l.team, market: l.market, family: l.family, projection: l.projection ?? null, line: l.line, side: l.side, book: l.quote?.book ?? null, price: l.quote?.american ?? null, quotedAt: l.quote?.quotedAt ?? null, fetchedAt: l.quote?.fetchedAt ?? null, forecastVersion: l.forecastVersion, hitRate: l.hitRate, role: l.role, injury: l.injury, classification: candidate.classification, evidenceClass: candidate.classification === LEVEL.HOLD ? null : candidate.classification, evidenceLabel: EVIDENCE_LABEL[candidate.classification] ?? null, probability: null, uncertainty: null, ev: null })),
    combined: candidate.price && { method: candidate.price.method, label: candidate.price.label, decimal: candidate.price.decimal, american: candidate.price.american },
    money: candidate.money, reasons: candidate.reasons,
    /* Parity gate fields (engine → site → graphic → caption → console); filled by each stage, never by the engine. */
    injuryStatus: candidate.legs.map((l) => ({ legId: l.legId, status: l.injury?.status ?? null, checkedAt: l.injury?.fetchedAt ?? null, lineup: l.lineup ? { tonightScenario: l.lineup.tonightScenario ?? null, sensitive: l.lineup.sensitive ?? null } : null })),
    approvalStatus: "PENDING_FOUNDER", priceEventSha256: null, graphicVersion: null, captionText: null, captionSha256: null, siteRecordVersion: null, xReceipt: null,
    recordSha256: null,
  };
}
export const sealCardRecord = (r) => ({ ...r, recordSha256: sha256(canonical({ ...r, recordSha256: null })) });


/* ───────────────────────────── four-lane joint assignment (founder ~19:25Z) ───────────────────────────── */

const LANE_IDS4 = Object.freeze({ "bank-builder": ["bb-a", "bb-b"], moonshot: ["ms-a", "ms-b"] });
const legSetKey = (c) => c.legs.map((l) => l.legId).sort().join("+");
/** A candidate's quality tier for "never weaker": the first two rules-based ranking keys. */
const tierOf = (c, bucket) => [bucketOf(c.rankKeys.weakestShrunkRate, bucket), -c.rankKeys.legCount];
const notWeaker = (x, y, bucket) => { const a = tierOf(x, bucket); const b = tierOf(y, bucket); return a[0] > b[0] || (a[0] === b[0] && a[1] >= b[1]); };

/**
 * Build both products' ranked pools, then assign bb-a, bb-b, ms-a, ms-b jointly:
 *   - each lane takes its best Level B candidate that shares no game with its product partner (A before B);
 *   - across products, a card identical to one already assigned is replaced only by a candidate that is NOT weaker
 *     (same evidence tier, no more legs); otherwise the identical card stands and the trade-off is recorded;
 *   - no qualifying candidate → HELD.
 * Returns per lane: the assignment, the top 3 options under the lane's constraints, and the trade-offs.
 */
export function assignFourLanes({ legs, now, propCapture, propCaptureSha256 = null, h2h = null, params = null, bankrolls = { "bb-a": 10000, "bb-b": 10000, "ms-a": 2500, "ms-b": 2500 }, steps = { "bb-a": 1, "bb-b": 1, "ms-a": 1, "ms-b": 1 } }) {
  const bucket = P("rateBucket", params);
  const bandParams = params?.bandPct != null ? { bandPct: params.bandPct } : null;
  const out = {}; const assigned = []; const tradeOffs = [];
  for (const product of ["bank-builder", "moonshot"]) {
    const [a, b] = LANE_IDS4[product];
    for (const laneId of [a, b]) {
      const pos = stepPosition({ product, step: steps[laneId], bankrollCents: bankrolls[laneId], params: bandParams });
      if (!pos.ok) { out[laneId] = { laneId, status: "HELD", code: pos.refusal, options: [] }; continue; }
      const partner = laneId === b ? out[a]?.card : null;
      const ev = evaluateLevelCandidates({ legs, position: pos, now, propCapture, propCaptureSha256, h2h, params, excludeGames: partner ? partner.legs.map((l) => l.gameId) : [] });
      const eligible = ev.ranked;
      const identical = (c) => assigned.find((x) => x.product !== product && legSetKey(x.card) === legSetKey(c));
      let pick = eligible[0] ?? null; let note = null;
      if (pick && identical(pick)) {
        const alt = eligible.find((c) => !identical(c) && notWeaker(c, pick, bucket));
        const twin = identical(pick).laneId;
        if (alt) { note = `diversified: ${legSetKey(pick)} is already ${twin}; took ${alt.candidateId} (same evidence tier, not weaker)`; pick = alt; }
        else { note = `IDENTICAL to ${twin}: every non-identical alternative is weaker (or none exists), so the identical card stands (founder may HOLD instead)`; }
        tradeOffs.push({ laneId, note });
      }
      const options = eligible.slice(0, 3).map((c) => ({ rank: c.rank, candidateId: c.candidateId, identicalTo: identical(c)?.laneId ?? null, legs: c.legs.map((l) => ({ legId: l.legId, player: l.player?.name ?? null, team: l.team, family: l.family, side: l.side, line: l.line, eventLabel: l.eventLabel, book: l.quote?.book ?? null, american: l.quote?.american ?? null, quotedAt: l.quote?.quotedAt ?? null })), american: c.price.american, grossPayoutCents: c.money.grossPayoutCents, targetDeviation: c.targetDeviation, rankKeys: c.rankKeys }));
      const why = {}; for (const c of ev.candidates) for (const x of c.reasons) { const k = x.split(/[ :]/)[0]; why[k] = (why[k] ?? 0) + 1; }
      out[laneId] = pick
        ? { laneId, product, status: "READY_FOR_APPROVAL", classification: LEVEL.B, card: pick, note, options, position: pos, counts: ev.counts, reasonCounts: why }
        : { laneId, product, status: "HELD", code: "NO_QUALIFIED_CARD", options, position: pos, counts: ev.counts, reasonCounts: why };
      if (pick) assigned.push({ laneId, product, card: pick });
    }
  }
  return { rulesVersion: RULES_VERSION, mode: "LEVEL_B_RESEARCH (founder approval required)", rankingLabel: RANKING_LABEL, lanes: out, tradeOffs };
}
