/**
 * CHALLENGE LANES · CROSS-SPORT STEP SEARCH (founder brief for Nov 5 step 2, via the PD). PURE.
 *
 * Builds each product's next card from the surviving lane's actual bankroll and step under bbm-rules@2:
 *   - strict ±10% gross band around the step target (research-band@2), from the settled bankroll;
 *   - at most 2 legs, from different games; two legs of one game only with a book-quoted same-game price (none captured);
 *   - required legs: at least `requireSport` legs from `requireGames` (e.g. ≥ 1 NFL leg from JAX@BAL);
 *   - evidence first: LEVEL_A only where a validated probability exists (EV with uncertainty: the interval's lower bound
 *     × decimal must exceed 1); otherwise LEVEL_B research (hit-rate windows, no probability, no EV claim);
 *   - singles preferred when well supported; never a riskier card for payout fit;
 *   - the two products must differ (diversity: no shared selection, no opposing sides); the same event is allowed.
 * Combined price = the mathematical product of separately observed prices, never a quoted parlay.
 *
 * Inputs are normalised so any capture can feed it:
 *   candidates: [{ sport, gameId, eventLabel, startUtc, family, player?{playerId,name,team}, team?, side, line?,
 *                  evidence: { level: "A"|"B", probability?, interval95?, windows?[{window,hits,n}], shrunk? },
 *                  injury?{status}, role?{stable, minutesCv?}, flags?[] }]
 *   quotes: [{ key: selectionIdentity(candidate), book, american, line?, fetchedAt, quotedAt? }]
 */
import { canonical, sha256 } from "./chain.mjs";
import { priceRatio, payoutCents, decimalToAmerican } from "./payout.mjs";
import { stepPosition, RULES_VERSION } from "./rules-v2.mjs";
import { selectionIdentity, propositionIdentity } from "./card-fields.mjs";
import { ELIGIBLE_OPERATOR_KEYS } from "../sports/odds/eligible-operators.mjs";

export const COMBINED_PRODUCT_LABEL = "mathematical product of separately observed prices, not a quoted parlay";
export const STEP_SEARCH_DEFAULTS = Object.freeze({
  band: Object.freeze([0.90, 1.10]), // research-band@2, founder-approved 2026-11-04 ~20:45Z
  maxLegs: 2,
  minLongestN: 20, minShrunkRate: 0.60, allowedInjury: Object.freeze(["ACTIVE", "PROBABLE"]),
  legDecimalRange: Object.freeze([1.25, 4.0]), maxQuoteAgeMs: 90 * 60 * 1000, rateBucket: 0.05,
});
const D = (k, p) => p?.[k] ?? STEP_SEARCH_DEFAULTS[k];
const dec = (r) => Number(r.n) / Number(r.d);
const bucketOf = (x, b) => Math.floor(x / b + 1e-9);

/** One leg: its quote at the fixed-order first book quoting the exact line, its gates and its evidence strength. */
function legView(c, quotesByKey, { now, params, bookmakers }) {
  const key = selectionIdentity(c);
  const reasons = []; const flags = [...(c.flags ?? [])];
  const qs = (quotesByKey.get(key) ?? []).filter((q) => (c.line == null ? true : q.line === c.line));
  const q = bookmakers.map((b) => qs.filter((x) => x.book === b).sort((a, b2) => String(b2.fetchedAt).localeCompare(String(a.fetchedAt)))[0]).find(Boolean) ?? null;
  if (!q) reasons.push(`E_NO_QUOTE_AT_EXACT_LINE ${key}`);
  const r = q ? priceRatio("american", q.american) : null;
  if (q && !r) reasons.push(`E_BAD_ODDS ${key}`);
  const d = r ? dec(r) : null;
  const [lo, hi] = D("legDecimalRange", params);
  if (d != null && (d < lo || d > hi)) reasons.push(`E_PRICE_BOUNDS ${key}: ${d.toFixed(4)}`);
  if (q && !(Date.parse(now) - Date.parse(q.fetchedAt) <= D("maxQuoteAgeMs", params))) reasons.push(`E_STALE_QUOTE ${key}: fetched ${q.fetchedAt}`);
  if (!(Date.parse(c.startUtc) > Date.parse(now))) reasons.push(`STARTED ${key}`);
  if (c.injury && !D("allowedInjury", params).includes(c.injury.status)) reasons.push(`C_AVAILABILITY ${key}: ${c.injury.status}`);
  if (c.role && c.role.stable === false) flags.push(`B_ROLE_UNSTABLE ${key}`);
  const ev = c.evidence ?? {};
  let level = null; let strength = null; let evLow = null;
  if (ev.level === "A" && typeof ev.probability === "number" && Array.isArray(ev.interval95)) {
    /* validated probability: EV with uncertainty must be positive at the interval's lower bound */
    evLow = d != null ? ev.interval95[0] * d - 1 : null;
    level = evLow != null && evLow > 0 ? "LEVEL_A" : "LEVEL_B";
    if (level === "LEVEL_B") flags.push(`A_EV_NOT_ROBUST ${key}: lower bound × price ≤ 1`);
    strength = ev.interval95[0];
  } else {
    level = "LEVEL_B";
    const longest = Math.max(0, ...(ev.windows ?? []).map((w) => w.n));
    if (!(ev.windows ?? []).length) reasons.push(`A_NO_EVIDENCE ${key}`);
    else if (longest < D("minLongestN", params)) reasons.push(`A_SMALL_SAMPLE ${key}: longest n ${longest}`);
    const rate = ev.shrunk?.rate ?? null;
    if (rate == null) reasons.push(`A_NO_SHRUNK_RATE ${key}`);
    else if (rate < D("minShrunkRate", params) - 1e-9) reasons.push(`A_WEAK_EVIDENCE ${key}: shrunk ${rate}`);
    strength = rate;
  }
  const w = (n) => (ev.windows ?? []).find((x) => x.window === n);
  return {
    /* legId = the selection identity (line-free, book-free; unique per leg) */
    legId: key, key, proposition: propositionIdentity(c), sport: c.sport, gameId: String(c.gameId), eventLabel: c.eventLabel, startUtc: c.startUtc,
    family: c.family, player: c.player ?? null, team: c.team ?? null, side: c.side, line: c.line ?? null,
    book: q?.book ?? null, american: q?.american ?? null, decimal: d, ratio: r, fetchedAt: q?.fetchedAt ?? null, quotedAt: q?.quotedAt ?? null,
    injury: c.injury ?? null, last5: w("last5") ? `${w("last5").hits}/${w("last5").n}` : null, last10: w("last10") ? `${w("last10").hits}/${w("last10").n}` : null,
    level, strength, evLow, probability: level === "LEVEL_A" ? ev.probability : null, reasons, flags,
  };
}

/** Every 1- and 2-leg card for one product position, audited and ranked (evidence first). */
export function searchStep({ candidates, quotes, product, step, bankrollCents, now, requireSport = null, requireGames = null, requireCount = 1, params = null, bookmakers = ELIGIBLE_OPERATOR_KEYS }) {
  const pos = stepPosition({ product, step, bankrollCents });
  if (!pos.ok) return { ok: false, refusal: pos.refusal, cards: [], ranked: [] };
  const [bl, bh] = D("band", params);
  const band = { loCents: Math.ceil(pos.targetCents * bl - 1e-9), hiCents: Math.floor(pos.targetCents * bh + 1e-9) };
  const byKey = new Map(); for (const q of quotes ?? []) { if (!byKey.has(q.key)) byKey.set(q.key, []); byKey.get(q.key).push(q); }
  const legs = candidates.map((c) => legView(c, byKey, { now, params, bookmakers }));
  const sets = legs.map((l) => [l]); for (let i = 0; i < legs.length; i++) for (let j = i + 1; j < legs.length; j++) sets.push([legs[i], legs[j]]);
  const required = (set) => set.filter((l) => (!requireSport || l.sport === requireSport) && (!requireGames || requireGames.includes(l.gameId))).length >= requireCount;
  const cards = sets.map((set) => {
    const reasons = set.flatMap((l) => l.reasons); const flags = set.flatMap((l) => l.flags);
    if (set.length > D("maxLegs", params)) reasons.push("LEG_COUNT_EXCEEDED");
    if (new Set(set.map((l) => l.gameId)).size !== set.length) reasons.push("CORRELATED_SAME_GAME: no book-quoted same-game price");
    if (new Set(set.map((l) => l.proposition)).size !== set.length) reasons.push("CORRELATED_SAME_PROPOSITION");
    if (!required(set)) reasons.push(`REQUIRED_LEG_MISSING: needs ${requireCount} ${requireSport ?? ""} leg(s) from ${requireGames?.join(", ") ?? "any game"}`);
    const books = [...new Set(set.map((l) => l.book).filter(Boolean))];
    if (books.length > 1) flags.push(`MULTI_BOOK_PRODUCT: legs quoted at ${books.join(" + ")} (separately observed prices)`);
    const priced = set.every((l) => l.ratio);
    const ratio = priced ? set.reduce((a, l) => ({ n: a.n * BigInt(l.ratio.n), d: a.d * BigInt(l.ratio.d) }), { n: 1n, d: 1n }) : null;
    const money = ratio ? { stakeCents: bankrollCents, ...payoutCents(bankrollCents, ratio) } : null;
    if (money && (money.grossPayoutCents < band.loCents || money.grossPayoutCents > band.hiCents)) reasons.push(`OUT_OF_BAND: gross ${money.grossPayoutCents} outside [${band.loCents}, ${band.hiCents}]`);
    const classification = reasons.length ? "HOLD" : set.every((l) => l.level === "LEVEL_A") ? "LEVEL_A" : "LEVEL_B";
    const decimal = ratio ? dec(ratio) : null;
    const candidateId = `v2s-${sha256(`${RULES_VERSION}|${product}|${step}|${set.map((l) => l.key).sort().join("+")}`).slice(0, 16)}`;
    return {
      candidateId, product, step, classification, reasons, flags, legCount: set.length,
      legs: set.map(({ ratio: _r, ...l }) => l),
      combined: decimal == null ? null : { decimal, american: decimalToAmerican(decimal), label: set.length > 1 ? COMBINED_PRODUCT_LABEL : "selection odds" },
      money, targetCents: pos.targetCents, band, pctFromTarget: money ? Math.round((money.grossPayoutCents / pos.targetCents - 1) * 1000) / 10 : null,
      rankKeys: { weakest: Math.min(...set.map((l) => l.strength ?? 0)), levelA: set.every((l) => l.level === "LEVEL_A"), legCount: set.length, flagCount: flags.length },
    };
  });
  const b = D("rateBucket", params);
  const ranked = cards.filter((c) => c.classification !== "HOLD").sort((x, y) =>
    Number(y.rankKeys.levelA) - Number(x.rankKeys.levelA)
    || bucketOf(y.rankKeys.weakest, b) - bucketOf(x.rankKeys.weakest, b)
    || x.legCount - y.legCount // singles preferred when equally supported
    || x.rankKeys.flagCount - y.rankKeys.flagCount
    || Math.abs(x.pctFromTarget) - Math.abs(y.pctFromTarget)
    || x.candidateId.localeCompare(y.candidateId));
  ranked.forEach((c, i) => { c.rank = i + 1; });
  const closest = cards.filter((c) => c.classification === "HOLD" && c.money).sort((x, y) => x.reasons.length - y.reasons.length || Math.abs(x.pctFromTarget) - Math.abs(y.pctFromTarget)).slice(0, 5)
    .map((c) => ({ candidateId: c.candidateId, legs: c.legs.map((l) => l.key), gross: c.money.grossPayoutCents, pctFromTarget: c.pctFromTarget, blockers: c.reasons }));
  return { ok: true, rulesVersion: RULES_VERSION, product, step, bankrollCents, targetCents: pos.targetCents, band, cards, ranked, closest };
}

/** The product pair: each product's best card such that the two share no selection and take no opposing sides. */
export function pairProducts(bb, ms) {
  const clash = (a, b) => a.legs.some((x) => b.legs.some((y) => x.key === y.key || (x.proposition === y.proposition && x.side !== y.side)));
  const pairs = [];
  for (const a of bb.ranked) for (const c of ms.ranked) if (!clash(a, c)) pairs.push({ bb: a, ms: c, score: [Math.min(a.rank, c.rank), a.rank + c.rank] });
  pairs.sort((x, y) => x.score[1] - y.score[1] || x.score[0] - y.score[0]);
  const top = pairs[0] ?? null;
  return {
    proposed: top && { bankBuilder: top.bb.candidateId, moonshot: top.ms.candidateId },
    alternates: { bankBuilder: bb.ranked.filter((c) => c !== top?.bb).slice(0, 2).map((c) => c.candidateId), moonshot: ms.ranked.filter((c) => c !== top?.ms).slice(0, 2).map((c) => c.candidateId) },
    sameEventAcrossProducts: top ? top.bb.legs.some((x) => top.ms.legs.some((y) => x.gameId === y.gameId)) : false,
  };
}

export const searchDigest = (r) => sha256(canonical(r.ranked.map((c) => [c.rank, c.candidateId, c.money.grossPayoutCents])));
