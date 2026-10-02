/**
 * COMBINED-ODDS BANDS — the boundaries themselves, readable from both TypeScript and node scripts.
 *
 * These lived only in risk-odds-bands.ts, which the cross-sport ladder cannot import: that builder
 * is plain .mjs run by node. The consequence was not a missing import but a SILENT DIVERGENCE — the
 * multi-sport lane labelled its cards by LEG COUNT instead of price, and published a +203 card as
 * "Low risk" when low ends at +100. Three of its four cards were mislabelled and every one of them
 * understated the risk, with the worst case landing on bronze: the smallest bankroll, shown exactly
 * one card, chosen because it is meant to be the calmest.
 *
 * So the numbers live here and risk-odds-bands.ts re-exports them with types. A band moves in one
 * place or it does not move.
 */

/** Non-overlapping combined-odds bands. Low includes its endpoints; the rest are (prev, max]. */
export const PARLAY_ODDS_BANDS = {
  low: { label: "Low Risk", minAmerican: -200, maxAmerican: 100 },
  medium: { label: "Medium Risk", minAmerican: 100, maxAmerican: 300 },
  high: { label: "High Risk", minAmerican: 300, maxAmerican: 600 },
  longshot: { label: "Longshot", minAmerican: 600, maxAmerican: null },
};

/*
 * FOUNDER DECISION D2 (Session 5) — ONE public risk taxonomy. The four labels below, on these price bands, are the
 * only public tier names: /build, Results, Ask, the Lab, history and every product surface read them from here.
 * Internal sections (the optimizer's own price spec) and reader styles are never shown with these names.
 */
export const PUBLIC_RISK_TIERS = Object.freeze(["low", "medium", "high", "longshot"]);
export const PUBLIC_RISK_LABELS = Object.freeze(Object.fromEntries(PUBLIC_RISK_TIERS.map((t) => [t, PARLAY_ODDS_BANDS[t].label])));
const signedAmerican = (n) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)}`;
/** The band as a reader sees it: "−200 to +100" · "+100 to +300" · "+300 to +600" · "> +600". */
export const PUBLIC_RISK_BAND_TEXT = Object.freeze(Object.fromEntries(PUBLIC_RISK_TIERS.map((t) => {
  const b = PARLAY_ODDS_BANDS[t];
  return [t, b.maxAmerican == null ? `> ${signedAmerican(b.minAmerican)}` : `${signedAmerican(b.minAmerican)} to ${signedAmerican(b.maxAmerican)}`];
})));
/** The canonical public label for a tier id, or null for anything that is not one of the four. */
export function publicRiskLabel(tier) {
  return PUBLIC_RISK_LABELS[String(tier ?? "").toLowerCase()] ?? null;
}

/*
 * READER STYLES — a bankroll-and-tolerance POLICY over the risk levels (build-risk-ladder BETTOR_TIERS). A style is
 * not a risk level: "balanced" holds Low Risk AND Medium Risk cards, so calling it "Medium" was a second, competing
 * definition of Medium (D2). Styles carry their own names and describe themselves in the canonical labels.
 */
export const READER_STYLE_LABELS = Object.freeze({ steady: "Steady", balanced: "Balanced", adventurous: "Adventurous", longshot: "Longshot" });
/** "Low Risk and Medium Risk cards, two a day." — derived from the style's bands, so it can never drift from them. */
export function readerStyleBlurb(bands, cardsPerDay) {
  const names = (bands ?? []).map((b) => publicRiskLabel(b)).filter(Boolean);
  const n = Number(cardsPerDay);
  const per = n === 1 ? "one a day" : n === 2 ? "two a day" : `${n} a day`;
  return `${names.join(" and ")} cards, ${per}.`;
}

/** Individual-leg sanity guards (defaults; the longshot underdog ceiling lifts only for Longshot). */
export const INDIVIDUAL_LEG_ODDS_GUARDS = { minFavoriteAmerican: -500, maxUnderdogAmerican: 1200 };

/**
 * The risk bucket a combined American price belongs to, or null if it is shorter than the Low floor
 * (-200) — too short to be a sensible parlay. Non-overlapping:
 *   Low: -200 <= odds <= +100 · Medium: +100 < odds <= +300 · High: +300 < odds <= +600 · Longshot: > +600
 */
export function getRiskBucketForCombinedOdds(americanOdds) {
  if (!Number.isFinite(americanOdds)) return null;
  if (americanOdds < -200) return null;
  if (americanOdds <= 100) return "low";
  if (americanOdds <= 300) return "medium";
  if (americanOdds <= 600) return "high";
  return "longshot";
}

/** Whether a combined price fits the given bucket exactly (non-overlapping). */
export function isCombinedOddsInRiskBucket(americanOdds, risk) {
  return getRiskBucketForCombinedOdds(americanOdds) === risk;
}
