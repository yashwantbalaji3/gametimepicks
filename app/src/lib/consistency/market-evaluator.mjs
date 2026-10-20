/**
 * CROSS-PRODUCT PREDICTION CONSISTENCY · THE ONE OVER/UNDER EVALUATOR.
 *
 * One evaluation per (snapshot, subject, family, book, line, capture). Every product that shows a lean, a probability,
 * an edge or an EV for an NFL / NBA prop or game market must call `evaluateMarket` on the OFFICIAL snapshot
 * (official-snapshot.mjs) and show what it returns. Products may add qualification (a higher minimum, a payout or
 * correlation cap, diversification) — they may never re-derive a lean, and never reverse one for identical inputs.
 *
 * FORMULAS (exact numbers internally — nothing is rounded here; rounding is a presentation concern).
 *   Distribution → P(over) / P(under) / P(push) at line ℓ.
 *     bernoulli {p}         X ∈ {0,1}. Exact.
 *     empirical {support}   exact mass sums: Σ P(v > ℓ), Σ P(v < ℓ), Σ P(v = ℓ), normalised by Σ P (a truncated
 *                           histogram stays honest — the massWhere rule of markets/game-intelligence.ts).
 *     normal {mean, sd}     F(x) = Φ((x − mean)/sd).
 *     quantiles {points}    F is piecewise-linear through the stored (value, quantile) points; outside them an
 *                           exponential tail whose density matches the adjacent segment (F(x) = q₁·e^{−(v₁−x)f₁/q₁}
 *                           below, 1 − (1−qₙ)·e^{−(x−vₙ)fₙ/(1−qₙ)} above), truncated at `lowerBound` (0 for counts and
 *                           yards). Approximate by construction — a stored quantile summary is not the full law.
 *   CONTINUITY RULE (integer-support families: yards, receptions, points, rebounds, assists, threes, team scores,
 *   margins, totals). Every graded stat is a whole number, so a continuous F is read as the law of an integer:
 *     P(X = k) = F(k + ½) − F(k − ½);  P(over ℓ) = 1 − F(⌊ℓ⌋ + ½);  P(under ℓ) = F(⌈ℓ⌉ − ½).
 *   On a half line (63.5) this is 1 − F(63.5) / F(63.5) and push = 0; on a whole line (63) push = F(63.5) − F(62.5).
 *   Families marked `support: "continuous"` use 1 − F(ℓ) / F(ℓ) with push 0.
 *
 *   Price. raw implied = americanToImpliedRaw (projection-framework.ts); no-vig = proportional two-way
 *   (projection-framework noVigTwoWay), refused when the raw pair sums outside (1, 1.25] (the odds snapshot
 *   contract's sanity band, sports/odds/snapshot-contract.mjs).
 *   Edge (probability, ×100 = points) = model decisive probability − no-vig, where the model decisive probability is
 *   P(over) / (P(over) + P(under)) — a two-way price refunds pushes, so the comparable quantity excludes them.
 *   EV per 1 unit staked at the offered price = P(side)·(decimal − 1) − P(other side); a push returns the stake (0).
 *
 * LEAN (`LEAN_RULE`). Decided ONLY by price: a side leans when its EV ≥ minEv AND its edge ≥ minEdge; if both sides
 * pass (only on an arbitrage pair) the larger EV wins and an exact tie is NONE. A projection below the line is never,
 * by itself, an UNDER. Any blocking withheld reason (no / one-sided / implausible / stale / future / post-lock price,
 * no line, no distribution) forces NONE. Qualification reasons (family not published, participation not cleared,
 * private snapshot, sport not product-eligible) leave the lean visible but make the evaluation unqualified.
 *
 * Deterministic: the clock is the `now` argument; the same inputs give a byte-identical result.
 */
import { americanToImpliedRaw, noVigTwoWay as proportionalNoVig } from "../projection-framework.ts";
import { normCdf } from "../v2-candidate-gates.ts";
import { noVigTwoWay as sanityNoVig } from "../sports/odds/snapshot-contract.mjs";
import { LEG_BOUNDS } from "../products/eligible-leg/contract.mjs";
import { CLEARED as NFL_CLEARED } from "../sports/nfl/forecast-view.mjs";
import { DISTRIBUTION_KIND, PUBLICATION, playerOf } from "./official-snapshot.mjs";

export const EVALUATOR_VERSION = "gtp.consistency.market-evaluator@1";

export const LEAN = Object.freeze({ OVER: "OVER", UNDER: "UNDER", NONE: "NONE" });

export const LEAN_RULE = Object.freeze({
  id: "price-aware-ev@1",
  minEv: 0.03, // ≥ 3% expected return per unit at the offered price
  minEdge: 0.02, // ≥ 2 probability points over the no-vig price
  maxPriceAgeMs: LEG_BOUNDS.maxPriceAgeMs, // the product contract's own staleness bound (12 h)
});

/** Every withheld reason. BLOCKING ones force lean NONE; the rest only make the evaluation unqualified. */
export const WITHHELD = Object.freeze({
  NO_SNAPSHOT: "NO_SNAPSHOT",
  SUBJECT_NOT_IN_SNAPSHOT: "SUBJECT_NOT_IN_SNAPSHOT",
  FAMILY_NOT_IN_SNAPSHOT: "FAMILY_NOT_IN_SNAPSHOT",
  NO_DISTRIBUTION: "NO_DISTRIBUTION",
  NO_LINE: "NO_LINE",
  NO_PRICE: "NO_PRICE",
  ONE_SIDED_PRICE: "ONE_SIDED_PRICE",
  PRICE_IMPLAUSIBLE: "PRICE_IMPLAUSIBLE",
  NO_CAPTURE_TIME: "NO_CAPTURE_TIME",
  NO_EVALUATION_TIME: "NO_EVALUATION_TIME",
  PRICE_STALE: "PRICE_STALE",
  PRICE_FROM_FUTURE: "PRICE_FROM_FUTURE",
  PRICE_AFTER_LOCK: "PRICE_AFTER_LOCK",
  EVALUATED_AFTER_LOCK: "EVALUATED_AFTER_LOCK",
  SNAPSHOT_AFTER_EVALUATION: "SNAPSHOT_AFTER_EVALUATION",
  // qualification (non-blocking)
  FAMILY_NOT_PUBLISHED: "FAMILY_NOT_PUBLISHED",
  PARTICIPATION_NOT_CLEARED: "PARTICIPATION_NOT_CLEARED",
  PUBLICATION_PRIVATE: "PUBLICATION_PRIVATE",
  SPORT_NOT_PRODUCT_ELIGIBLE: "SPORT_NOT_PRODUCT_ELIGIBLE",
  BELOW_LEAN_THRESHOLD: "BELOW_LEAN_THRESHOLD",
});
const QUALIFICATION = new Set([
  WITHHELD.FAMILY_NOT_PUBLISHED, WITHHELD.PARTICIPATION_NOT_CLEARED, WITHHELD.PUBLICATION_PRIVATE,
  WITHHELD.SPORT_NOT_PRODUCT_ELIGIBLE, WITHHELD.BELOW_LEAN_THRESHOLD,
]);
export const isBlocking = (reason) => !QUALIFICATION.has(reason);

/** Participation states that clear a player for a ranked / priced surface. */
export const CLEARED_PARTICIPATION = Object.freeze({ NFL: NFL_CLEARED, NBA: Object.freeze(["active"]) });
/** Family publication states that may be a qualified pick. */
export const PUBLISHED_FAMILY_STATES = Object.freeze(["PUBLISHED"]);

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/* ─────────────────────────────── distributions ─────────────────────────────── */

function quantileCdf(points, lowerBound = -Infinity) {
  const pts = points.filter((p) => isNum(p.q) && isNum(p.v)).slice().sort((a, b) => a.q - b.q || a.v - b.v);
  const n = pts.length;
  const slopeAt = (from, dir) => {
    for (let i = from; dir > 0 ? i < n - 1 : i > 0; i += dir) {
      const a = pts[dir > 0 ? i : i - 1]; const b = pts[dir > 0 ? i + 1 : i];
      if (b.v > a.v) return (b.q - a.q) / (b.v - a.v);
    }
    return 0;
  };
  const fLow = slopeAt(0, +1);
  const fHigh = slopeAt(n - 1, -1);
  return (x) => {
    if (!n) return NaN;
    if (x < lowerBound) return 0;
    if (x < pts[0].v) {
      const q1 = pts[0].q;
      return fLow > 0 && q1 > 0 ? q1 * Math.exp(-(pts[0].v - x) * fLow / q1) : 0;
    }
    let j = -1;
    for (let i = 0; i < n; i++) if (pts[i].v <= x) j = i;
    if (j === n - 1) {
      const qn = pts[n - 1].q;
      if (x === pts[n - 1].v) return qn;
      return fHigh > 0 && qn < 1 ? 1 - (1 - qn) * Math.exp(-(x - pts[n - 1].v) * fHigh / (1 - qn)) : 1;
    }
    const a = pts[j]; const b = pts[j + 1];
    return a.q + (b.q - a.q) * (x - a.v) / (b.v - a.v);
  };
}

/** The CDF of a continuous-kind distribution (normal / quantiles), or null. */
export function cdfOf(distribution) {
  if (!distribution) return null;
  if (distribution.kind === DISTRIBUTION_KIND.NORMAL) {
    const { mean, sd } = distribution;
    if (!isNum(mean) || !isNum(sd) || sd <= 0) return null;
    return (x) => normCdf((x - mean) / sd);
  }
  if (distribution.kind === DISTRIBUTION_KIND.QUANTILES) {
    if (!Array.isArray(distribution.points) || !distribution.points.length) return null;
    return quantileCdf(distribution.points, isNum(distribution.lowerBound) ? distribution.lowerBound : -Infinity);
  }
  return null;
}

/**
 * P(over), P(under), P(push) of `distribution` at `line`, under the module's continuity rule.
 * @returns {{pOver:number, pUnder:number, pPush:number, method:string} | null}
 */
export function lineProbabilities(distribution, line, { support = "integer" } = {}) {
  if (!distribution || !isNum(line)) return null;
  if (distribution.kind === DISTRIBUTION_KIND.BERNOULLI) {
    const p = distribution.p;
    if (!isNum(p) || p < 0 || p > 1) return null;
    const mass = [{ value: 0, probability: 1 - p }, { value: 1, probability: p }];
    return { ...exactMass(mass, line), method: "bernoulli-exact" };
  }
  if (distribution.kind === DISTRIBUTION_KIND.EMPIRICAL) {
    const r = exactMass(distribution.support ?? [], line);
    return r ? { ...r, method: "empirical-exact" } : null;
  }
  const F = cdfOf(distribution);
  if (!F) return null;
  if (support === "continuous") {
    const u = F(line);
    return { pOver: 1 - u, pUnder: u, pPush: 0, method: `${distribution.kind}-continuous` };
  }
  const pOver = 1 - F(Math.floor(line) + 0.5);
  const pUnder = F(Math.ceil(line) - 0.5);
  return { pOver, pUnder, pPush: Math.max(0, 1 - pOver - pUnder), method: `${distribution.kind}-integer-continuity` };
}

function exactMass(support, line) {
  let total = 0; let over = 0; let under = 0; let push = 0;
  for (const b of support) {
    const p = isNum(b.probability) ? b.probability : isNum(b.count) ? b.count : null;
    if (p == null || !isNum(b.value)) continue;
    total += p;
    if (b.value > line) over += p; else if (b.value < line) under += p; else push += p;
  }
  if (!(total > 0)) return null;
  return { pOver: over / total, pUnder: under / total, pPush: push / total };
}

/** The distribution of −X (an away margin from a home margin). */
export function negateDistribution(d) {
  if (!d) return null;
  if (d.kind === DISTRIBUTION_KIND.NORMAL) return { ...d, mean: -d.mean };
  if (d.kind === DISTRIBUTION_KIND.EMPIRICAL) return { ...d, support: d.support.map((b) => ({ ...b, value: -b.value })) };
  if (d.kind === DISTRIBUTION_KIND.QUANTILES) return { ...d, points: d.points.map((p) => ({ q: 1 - p.q, v: -p.v })).sort((a, b) => a.q - b.q), mean: isNum(d.mean) ? -d.mean : null, lowerBound: undefined };
  return null;
}

/* ─────────────────────────────── prices ─────────────────────────────── */

export const decimalFromAmerican = (a) => (isNum(a) && a !== 0 && Math.abs(a) >= 100 ? (a > 0 ? 1 + a / 100 : 1 + 100 / -a) : null);

/* ─────────────────────────────── subjects ─────────────────────────────── */

const GAME_FAMILIES = Object.freeze(["game_total", "team_total", "spread"]);

function teamSide(snapshot, team) {
  const t = String(team ?? "");
  if (t === "home" || t === snapshot.home?.abbr) return "home";
  if (t === "away" || t === snapshot.away?.abbr) return "away";
  return null;
}

/** Resolve the subject + family to {subjectType, subjectId, entry} — ids only, never names. */
function resolve(snapshot, { playerId, team, family }) {
  if (GAME_FAMILIES.includes(family)) {
    const g = snapshot.game ?? {};
    if (family === "game_total") return { subjectType: "GAME", subjectId: snapshot.eventId, entry: g.total ? { ...g.total, state: "PUBLISHED" } : null };
    const side = teamSide(snapshot, team);
    if (!side) return { subjectType: "TEAM", subjectId: team ?? null, entry: null, missing: WITHHELD.SUBJECT_NOT_IN_SNAPSHOT };
    if (family === "team_total") return { subjectType: "TEAM", subjectId: snapshot[side].abbr, entry: g[side] ? { ...g[side], state: "PUBLISHED" } : null };
    // spread: the team covers line L when its margin + L > 0 ⇒ "over" of the team margin at −L.
    const m = g.margin;
    if (!m) return { subjectType: "TEAM", subjectId: snapshot[side].abbr, entry: null };
    const dist = side === "home" ? m.distribution : negateDistribution(m.distribution);
    return { subjectType: "TEAM", subjectId: snapshot[side].abbr, entry: { ...m, distribution: dist, expected: isNum(m.expected) ? (side === "home" ? m.expected : -m.expected) : null, median: isNum(m.median) ? (side === "home" ? m.median : -m.median) : null, state: "PUBLISHED" }, spread: true };
  }
  const p = playerOf(snapshot, playerId);
  if (!p) return { subjectType: "PLAYER", subjectId: playerId == null ? null : String(playerId), entry: null, missing: WITHHELD.SUBJECT_NOT_IN_SNAPSHOT };
  return { subjectType: "PLAYER", subjectId: p.playerId, player: p, entry: p.families?.[family] ?? null };
}

/* ─────────────────────────────── the evaluator ─────────────────────────────── */

/**
 * @param {{ snapshot: object, playerId?: string, team?: string, family: string, line: number, book?: string|null,
 *           overAmerican?: number|null, underAmerican?: number|null, capturedAt?: string|null, now: string,
 *           rule?: object }} input
 */
export function evaluateMarket(input) {
  const { snapshot, playerId = null, team = null, family, line, book = null, overAmerican = null, underAmerican = null, capturedAt = null, now, rule = LEAN_RULE } = input ?? {};
  const reasons = [];
  const add = (r) => { if (!reasons.includes(r)) reasons.push(r); };
  const out = (body) => {
    const blocking = reasons.filter(isBlocking);
    const lean = blocking.length ? LEAN.NONE : body.lean ?? LEAN.NONE;
    return {
      version: EVALUATOR_VERSION,
      rule: rule.id,
      ...body,
      lean,
      withheldReasons: reasons.slice(),
      eligibility: {
        qualified: lean !== LEAN.NONE && reasons.length === 0,
        publication: snapshot?.publication ?? null,
        blocking,
        qualification: reasons.filter((r) => !isBlocking(r)),
      },
    };
  };

  if (!snapshot?.snapshotId) { add(WITHHELD.NO_SNAPSHOT); return out({ identity: null, projection: null, pOver: null, pUnder: null, pPush: null, implied: null, edge: null, ev: null }); }
  const res = resolve(snapshot, { playerId, team, family });
  const identity = {
    snapshotId: snapshot.snapshotId, sport: snapshot.sport, eventId: snapshot.eventId,
    subjectType: res.subjectType, subjectId: res.subjectId, family, book: book ?? null,
    line: isNum(line) ? line : null, capturedAt: capturedAt ?? null,
  };
  identity.key = [identity.sport, identity.eventId, identity.subjectType, identity.subjectId, family, identity.book ?? "-", identity.line ?? "-", identity.capturedAt ?? "-", identity.snapshotId].join("|");
  const modelVersion = res.entry?.modelVersion ?? (res.subjectType === "PLAYER" ? snapshot.modelVersions?.players?.[family] ?? null : snapshot.modelVersions?.game ?? null);
  const stamp = { modelVersion, snapshotGeneratedAt: snapshot.generatedAt, evaluatedAt: now ?? null };

  if (res.missing) add(res.missing);
  else if (!res.entry) add(WITHHELD.FAMILY_NOT_IN_SNAPSHOT);
  const entry = res.entry;
  const projection = entry ? { expected: entry.expected ?? null, median: entry.median ?? null } : null;

  // qualification
  if (entry && entry.state != null && !PUBLISHED_FAMILY_STATES.includes(entry.state)) add(WITHHELD.FAMILY_NOT_PUBLISHED);
  if (res.player) {
    const cleared = CLEARED_PARTICIPATION[snapshot.sport] ?? [];
    if (!cleared.includes(res.player.participation)) add(WITHHELD.PARTICIPATION_NOT_CLEARED);
  }
  if (snapshot.publication === PUBLICATION.PRIVATE) add(WITHHELD.PUBLICATION_PRIVATE);
  if (snapshot.capability && snapshot.capability.canEnterPredictionProducts === false) add(WITHHELD.SPORT_NOT_PRODUCT_ELIGIBLE);

  // clock
  const nowMs = Date.parse(now ?? "");
  const lockMs = Date.parse(snapshot.lockAt ?? "");
  if (!Number.isFinite(nowMs)) add(WITHHELD.NO_EVALUATION_TIME);
  else {
    if (Number.isFinite(lockMs) && nowMs >= lockMs) add(WITHHELD.EVALUATED_AFTER_LOCK);
    if (Date.parse(snapshot.generatedAt ?? "") > nowMs) add(WITHHELD.SNAPSHOT_AFTER_EVALUATION);
  }

  if (!isNum(line)) add(WITHHELD.NO_LINE);
  // A spread line L is the team's handicap: it covers when its margin + L > 0, i.e. "over" of its margin at −L.
  const evalLine = isNum(line) && res.spread ? -line : line;
  const probs = entry && isNum(line) ? lineProbabilities(entry.distribution, evalLine, { support: entry.support ?? "integer" }) : null;
  if (entry && isNum(line) && !probs) add(WITHHELD.NO_DISTRIBUTION);

  // price
  const rawOver = americanToImpliedRaw(overAmerican);
  const rawUnder = americanToImpliedRaw(underAmerican);
  if (rawOver == null && rawUnder == null) add(WITHHELD.NO_PRICE);
  else if (rawOver == null || rawUnder == null) add(WITHHELD.ONE_SIDED_PRICE);
  let noVig = null;
  if (rawOver != null && rawUnder != null) {
    const sane = sanityNoVig([{ name: "over", price: overAmerican }, { name: "under", price: underAmerican }]);
    if (!sane.ok) add(WITHHELD.PRICE_IMPLAUSIBLE);
    const nv = proportionalNoVig(overAmerican, underAmerican);
    noVig = nv ? { over: nv.side, under: nv.other } : null;
  }
  if (rawOver != null || rawUnder != null) {
    const capMs = Date.parse(capturedAt ?? "");
    if (!Number.isFinite(capMs)) add(WITHHELD.NO_CAPTURE_TIME);
    else {
      if (Number.isFinite(nowMs) && capMs > nowMs) add(WITHHELD.PRICE_FROM_FUTURE);
      if (Number.isFinite(nowMs) && nowMs - capMs > rule.maxPriceAgeMs) add(WITHHELD.PRICE_STALE);
      if (Number.isFinite(lockMs) && capMs >= lockMs) add(WITHHELD.PRICE_AFTER_LOCK);
    }
  }

  const pOver = probs?.pOver ?? null; const pUnder = probs?.pUnder ?? null; const pPush = probs?.pPush ?? null;
  const decisive = probs && pOver + pUnder > 0 ? { over: pOver / (pOver + pUnder), under: pUnder / (pOver + pUnder) } : null;
  const edge = decisive && noVig ? { over: decisive.over - noVig.over, under: decisive.under - noVig.under } : null;
  const dOver = decimalFromAmerican(overAmerican); const dUnder = decimalFromAmerican(underAmerican);
  const ev = probs ? {
    over: dOver != null ? pOver * (dOver - 1) - pUnder : null,
    under: dUnder != null ? pUnder * (dUnder - 1) - pOver : null,
  } : null;

  let lean = LEAN.NONE;
  if (edge && ev && ev.over != null && ev.under != null) {
    const okOver = ev.over >= rule.minEv && edge.over >= rule.minEdge;
    const okUnder = ev.under >= rule.minEv && edge.under >= rule.minEdge;
    if (okOver && !okUnder) lean = LEAN.OVER;
    else if (okUnder && !okOver) lean = LEAN.UNDER;
    else if (okOver && okUnder) lean = ev.over > ev.under ? LEAN.OVER : ev.under > ev.over ? LEAN.UNDER : LEAN.NONE;
    if (lean === LEAN.NONE && !reasons.some(isBlocking)) add(WITHHELD.BELOW_LEAN_THRESHOLD);
  }

  return out({
    identity,
    ...stamp,
    projection,
    pOver, pUnder, pPush,
    probabilityMethod: probs?.method ?? null,
    decisive,
    implied: rawOver != null || rawUnder != null ? { rawOver, rawUnder, noVigOver: noVig?.over ?? null, noVigUnder: noVig?.under ?? null } : null,
    edge,
    edgePoints: edge ? { over: edge.over * 100, under: edge.under * 100 } : null,
    ev,
    lean,
    spread: res.spread ? { team: res.subjectId, coverIsOver: true } : null,
  });
}
