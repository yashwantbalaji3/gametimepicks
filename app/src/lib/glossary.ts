/**
 * GLOSSARY — the single source of truth for every term the site shows a user (model %, market %, edge,
 * EV, confidence, reliability, paper-only, no-play, pending, void, settlement, market-implied,
 * simulation, shadow calibration). Pure data — no io, no components. The `<HowToRead>` legend and the
 * Market Guide page both render from this, so a definition is written once and reused everywhere.
 *
 * Honesty is baked in: the definitions say plainly that everything is PAPER-ONLY / educational, that a
 * "simulation" is market-anchored (not an independent edge), and that pending is never a loss.
 */
export type GlossaryCategory = "probability" | "value" | "confidence" | "status" | "method" | "product";

export interface GlossaryTerm {
  id: string;
  term: string;
  category: GlossaryCategory;
  /** One-line plain-English definition (shown by default). */
  short: string;
  /** Expanded detail (shown when the legend is opened). */
  long: string;
}

export const GLOSSARY_TERMS: GlossaryTerm[] = [
  {
    id: "model-probability", term: "Model %", category: "probability",
    short: "Our model's estimated chance the outcome happens.",
    long: "The probability our model assigns to a result (e.g. a batter getting a hit). It comes from the model's inputs, not from the sportsbook. Shown only where a real model artifact backs it — never invented.",
  },
  {
    id: "market-probability", term: "Market %", category: "probability",
    short: "The sportsbook's implied chance, with the vig removed (\"de-vigged\").",
    long: "The probability implied by the betting line after removing the bookmaker's margin. It is the market's honest read of the outcome and is our baseline. When we have no model, the market % is all we show.",
  },
  {
    id: "edge", term: "Edge", category: "value",
    short: "Model % minus Market % — how much our model disagrees with the market.",
    long: "Edge = model probability − market probability, in percentage points. Positive edge means the model likes it more than the market does. ⚠️ On our settled MLB data, large claimed edges have historically UNDER-performed — treat a big edge as a caution flag, not a green light.",
  },
  {
    id: "ev", term: "EV (Expected Value)", category: "value",
    short: "The average paper return per unit if you made this pick many times.",
    long: "Expected value combines the model probability with the payout odds: EV = (model % × profit) − (loss % × stake). Positive EV means a theoretical long-run paper edge. All EV here is paper-only and educational — never a betting recommendation.",
  },
  {
    id: "confidence", term: "Confidence", category: "confidence",
    short: "Which band the model-vs-market difference fell into. Descriptive, not predictive.",
    long: "Category A / B / C record how far the model's number sat from the sportsbook's (>=5pp, 2.5-5pp, under 2.5pp). ⚠️ On 21,192 settled outcomes the categories are ANTI-PREDICTIVE and run in the opposite order to their old names: A settled 49.3%, B 50.6%, C 51.7%. As of Sprint 035 the category is shown for transparency only — it does not up-weight a pick, does not gate eligibility, and does not affect the order anything appears in.",
  },
  {
    id: "reliability", term: "Reliability", category: "confidence",
    short: "How trustworthy a given market has been historically.",
    long: "A per-market weight from settled history (e.g. batter hits ~54% vs total bases ~44%). Low-reliability markets are down-weighted or excluded from products. Reliability needs a real sample (≥100 graded) before it means anything.",
  },
  {
    id: "market-implied", term: "Market-implied", category: "method",
    short: "A read taken straight from the de-vigged betting line — not a simulation.",
    long: "For soccer and full-game markets we show the market's own probability (vig removed). It is labelled 'market-implied' precisely because it is NOT an independent model or a run-count simulation.",
  },
  {
    id: "simulation", term: "Simulation", category: "method",
    short: "A seeded Monte-Carlo run over the published inputs (e.g. 10,000 runs).",
    long: "For MLB player props we sample the published projections thousands of times to get a distribution. The run count is read from the artifact, never hardcoded. Our internal FULL-GAME sim is market-anchored (its point estimates equal the market by construction) — it is not an independent edge over the line.",
  },
  {
    id: "calibration", term: "Calibration", category: "method",
    short: "Research-only re-weighting from settled history — never drives live picks.",
    long: "We re-check the model against graded results in the background to see where it is over- or under-confident. This runs on the side (research-only) and requires a proven backtest + founder approval before it changes anything live.",
  },
  {
    id: "paper-only", term: "Paper-only", category: "product",
    short: "Everything here is educational tracking with $0 real money at stake.",
    long: "GameTime Picks places no real bets. Products, cards, and the bankroll are paper: results are tracked transparently to test the model. Nothing on the site is a wager or betting advice.",
  },
  {
    id: "no-play", term: "No-play", category: "status",
    short: "The model doesn't like anything enough today — and that's a good outcome.",
    long: "When no leg clears our quality bar, the product returns 'no-play' instead of forcing a pick. Discipline (skipping weak spots) is a feature, not a failure.",
  },
  {
    id: "pending", term: "Pending", category: "status",
    short: "Not graded yet — the game/leg isn't final. Never counts as a loss.",
    long: "A leg stays pending until official final data exists. Pending is never scored as a loss, and a card with a pending leg is not settled unless a different leg has already lost.",
  },
  {
    id: "void", term: "Void / Unavailable", category: "status",
    short: "A leg that can't be graded (e.g. player didn't play) — dropped, not a loss.",
    long: "If a leg has no gradeable outcome (DNP, postponed), it is voided/unavailable and removed from the card. It is never counted as a loss.",
  },
  {
    id: "settlement", term: "Settlement", category: "status",
    short: "Grading a leg from official final data (box score / final score).",
    long: "We settle only from committed official sources (StatsAPI box scores, committed final scores). No result is ever fabricated; if the official data isn't in yet, the leg stays pending.",
  },
];

export const CATEGORY_LABELS: Record<GlossaryCategory, string> = {
  probability: "Probabilities",
  value: "Value",
  confidence: "Confidence & reliability",
  method: "How reads are made",
  status: "Statuses",
  product: "What this is",
};

/** Look up one term by id (e.g. for an inline tooltip). */
export function glossaryTerm(id: string): GlossaryTerm | undefined {
  return GLOSSARY_TERMS.find((t) => t.id === id);
}

/** Terms grouped by category, in a stable display order. */
export function glossaryByCategory(): Array<{ category: GlossaryCategory; label: string; terms: GlossaryTerm[] }> {
  const order: GlossaryCategory[] = ["product", "probability", "value", "confidence", "method", "status"];
  return order.map((category) => ({ category, label: CATEGORY_LABELS[category], terms: GLOSSARY_TERMS.filter((t) => t.category === category) }));
}

/** A compact preset of the terms most worth showing on a given surface. */
export const LEGEND_PRESETS: Record<string, string[]> = {
  picks: ["model-probability", "market-probability", "edge", "ev", "confidence", "paper-only", "no-play"],
  results: ["settlement", "pending", "void", "paper-only"],
  simulate: ["market-implied", "simulation", "model-probability", "paper-only"],
  product: ["paper-only", "no-play", "pending", "reliability"],
};

export function legendPreset(name: keyof typeof LEGEND_PRESETS): GlossaryTerm[] {
  return (LEGEND_PRESETS[name] ?? []).map(glossaryTerm).filter((t): t is GlossaryTerm => !!t);
}
