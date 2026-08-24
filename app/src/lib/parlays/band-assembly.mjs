/**
 * BAND ASSEMBLY — the one card-per-price-band engine every price-selected ladder shares
 * (Program 201 · Release B).
 *
 * Extracted verbatim from the EPL ladder so the NFL ladder does not become a second copy of it —
 * "no copied implementation" is the charter's rule, and two copies of an assembly loop is how two
 * lanes drift into different products wearing one name. The mechanics are unchanged and the EPL
 * regeneration was diffed against its pre-extraction artifact to prove it:
 *
 *   · each fixture offers candidates sorted shortest-first; a card takes one leg per fixture
 *     (`used` keys on eventId — one match twice is one match, correlated at that);
 *   · a band is reached by upgrading, one leg at a time, the fixture whose next candidate is the
 *     smallest step up — assembling at a target price, never expressing a view;
 *   · the band is named by the CANONICAL bucket function and never widened: a band the day's
 *     prices cannot reach is reported skipped with the prices actually reached.
 */
import { getRiskBucketForCombinedOdds } from "./risk-odds-bands.mjs";
import { RISK_ORDER } from "../prefs/bettor-tiers.mjs";
import { BAND_MAX_LEGS } from "./multi-sport.mjs";

export const combinedOf = (pick) => {
  const d = pick.reduce((p, l) => p * l.decimal, 1);
  return { decimal: d, american: d >= 2 ? Math.round((d - 1) * 100) : Math.round(-100 / (d - 1)) };
};

export function buildForBand(band, n, available) {
  const chosen = available.slice(0, n).map((f) => ({ fixture: f, idx: 0 }));
  if (chosen.length < n) return null;
  const reached = [];
  const maxSteps = chosen.reduce((t, c) => t + c.fixture.candidates.length, 0);   // always terminates
  for (let step = 0; step <= maxSteps; step += 1) {
    const pick = chosen.map((c) => c.fixture.candidates[c.idx]);
    const { american, decimal } = combinedOf(pick);
    const bucket = getRiskBucketForCombinedOdds(american);
    reached.push(`${american > 0 ? "+" : ""}${american} (${bucket ?? "shorter than the low floor"})`);
    if (bucket === band) return { legs: pick, american, decimal: Number(decimal.toFixed(3)), reached };
    let best = -1, bestRatio = Infinity;
    for (let i = 0; i < chosen.length; i += 1) {
      const next = chosen[i].fixture.candidates[chosen[i].idx + 1];
      if (!next) continue;
      const ratio = next.decimal / chosen[i].fixture.candidates[chosen[i].idx].decimal;
      if (ratio < bestRatio) { bestRatio = ratio; best = i; }
    }
    if (best < 0) break;
    chosen[best].idx += 1;
  }
  return { legs: null, reached };
}

/**
 * Assemble one card per band from per-fixture candidate lists.
 * `byFixture`: [{eventId, kickoffIso, candidates: [{decimal, ...leg}]}] — candidates shortest-first.
 * Returns {cards: [{tier, legs, american, decimal}], skipped: [{tier, reason}]}.
 */
export function assembleBands(byFixture) {
  const cards = [], skipped = [], used = new Set();
  for (const band of RISK_ORDER) {
    const cap = BAND_MAX_LEGS[band] ?? 5;
    let built = null; const tried = [];
    for (let n = 2; n <= cap; n++) {
      const available = byFixture.filter((f) => !used.has(f.eventId));
      if (available.length < n) break;
      const attempt = buildForBand(band, n, available);
      if (!attempt) break;
      tried.push(`${n} legs → ${attempt.reached[0]}${attempt.reached.length > 1 ? ` … ${attempt.reached.at(-1)}` : ""}`);
      if (attempt.legs) { built = attempt; break; }
    }
    if (!built) {
      skipped.push({ tier: band, reason: tried.length ? `no combination of today's prices lands in this band — ${tried.join("; ")}` : "not enough eligible priced fixtures to build a card" });
      continue;
    }
    for (const l of built.legs) used.add(l.eventId);
    cards.push({ tier: band, legs: built.legs, american: built.american, decimal: built.decimal });
  }
  return { cards, skipped };
}
