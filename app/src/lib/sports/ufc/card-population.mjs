/**
 * UFC CARD POPULATION RECONCILIATION — the population-exact proof (Program 197 · Release A1).
 *
 * The August 22 card taught the lesson twice in one week: ESPN's default page size served 7 of 13
 * bouts with every returned row marked FINAL, and the UTC-rollover join made the main card
 * unjoinable — in both cases the pipeline LOOKED complete and was not, and nothing counted the
 * gap. This module counts the gap. Given the authoritative event (the provider's own card, fetched
 * fresh with limit=1000), the published card artifact, the pre-fight snapshot and the odds join,
 * it reconciles four populations and refuses to call them equal when they are not:
 *
 *   expected   — every bout the provider lists on the parent event
 *   captured   — every bout the published card artifact carries (read or explicitly unmodelled)
 *   priced     — bouts joined to a captured price in the pre-fight snapshot
 *   missing    — in the authority, absent from the card: the defect class this file exists for
 *   phantom    — in the card, absent from the authority: worse — an invented bout
 *
 * Every bout also gets a typed INPUT MATRIX row (Program 197 A1): model history, price, and the
 * inputs this sport does not license — absence is typed, never zero. Pure: no fs, no network.
 */

export const CARD_POPULATION_VERSION = 1;

/** Input states, closed vocabulary. UNSUPPORTED = we do not license/ingest this input at all. */
export const INPUT_STATES = Object.freeze(["AVAILABLE", "SPARSE", "MISSING", "STALE", "UNSUPPORTED", "BLOCKED_EXTERNAL"]);

const foldPair = (a, b) => [String(a ?? "").toLowerCase().trim(), String(b ?? "").toLowerCase().trim()].sort().join("|");

/**
 * @param {object} args
 * @param {{providerEventId: string, name?: string, bouts: Array<{providerBoutId: string, red?: string|null, blue?: string|null}>}} args.authoritative
 * @param {{event?: object, bouts?: Array<object>, skippedForCoverage?: Array<object>}} args.card
 * @param {{rows?: Array<{providerBoutId?: string|null, boutId?: string}>}} [args.snapshot]  pre-fight model-vs-market rows (priced+read bouts)
 */
export function reconcileCardPopulation({ authoritative, card, snapshot = { rows: [] } }) {
  if (!authoritative?.providerEventId) throw new Error("card-population: no authoritative event supplied");
  if (String(card?.event?.providerEventId ?? "") !== String(authoritative.providerEventId)) {
    throw new Error(`card-population: card describes event ${card?.event?.providerEventId}, authority is ${authoritative.providerEventId} — refusing a cross-event comparison`);
  }

  const expected = new Map((authoritative.bouts ?? []).map((b) => [String(b.providerBoutId), b]));
  const cardBouts = card?.bouts ?? [];

  /*
   * The card's bouts carry a synthetic boutId (date + fighter pair). The join back to provider ids
   * runs through the fighter pair, order-insensitive — the provider flips red/blue freely between
   * captures, and a name-order join would report half the card missing.
   */
  const expectedByPair = new Map();
  for (const [id, b] of expected) expectedByPair.set(foldPair(b.red, b.blue), id);

  const matched = new Set();
  const phantom = [];
  for (const b of cardBouts) {
    const pair = foldPair(b.red?.name, b.blue?.name);
    const providerId = expectedByPair.get(pair) ?? null;
    if (providerId) matched.add(providerId);
    else phantom.push({ boutId: b.boutId ?? pair, reason: "bout on the published card is absent from the provider's own event" });
  }

  const missing = [...expected.entries()]
    .filter(([id]) => !matched.has(id))
    .map(([id, b]) => ({ providerBoutId: id, pair: `${b.red ?? "?"} v ${b.blue ?? "?"}`, reason: "bout on the provider's event is absent from the published card" }));

  const pricedIds = new Set((snapshot.rows ?? []).map((r) => String(r.providerBoutId ?? "")).filter(Boolean));

  /* Per-bout input matrix. Read state comes from the card's own prediction/unmodelledReason. */
  const inputMatrix = cardBouts.map((b) => {
    const pair = foldPair(b.red?.name, b.blue?.name);
    const providerId = expectedByPair.get(pair) ?? null;
    return {
      boutId: b.boutId ?? pair,
      providerBoutId: providerId,
      inputs: {
        fighterHistory: b.prediction ? "AVAILABLE" : /sparse/i.test(b.unmodelledReason ?? "") ? "SPARSE" : b.unmodelledReason ? "MISSING" : "AVAILABLE",
        marketPrice: providerId && pricedIds.has(providerId) ? "AVAILABLE" : "MISSING",
        weighIns: "UNSUPPORTED",           // no licensed weigh-in source; typed, never guessed
        injuriesOrReplacements: "UNSUPPORTED",
        reachStance: "UNSUPPORTED",        // physicals exist in the research corpus, not per-card
      },
      read: b.prediction ? "READ" : "UNMODELLED",
      unmodelledReason: b.unmodelledReason ?? null,
    };
  });

  const counts = {
    expected: expected.size,
    captured: cardBouts.length,
    read: cardBouts.filter((b) => b.prediction).length,
    unmodelled: cardBouts.filter((b) => !b.prediction).length,
    priced: inputMatrix.filter((r) => r.inputs.marketPrice === "AVAILABLE").length,
    missing: missing.length,
    phantom: phantom.length,
  };

  return {
    version: CARD_POPULATION_VERSION,
    event: { providerEventId: String(authoritative.providerEventId), name: authoritative.name ?? card?.event?.name ?? null },
    counts,
    missing,
    phantom,
    inputMatrix,
    populationExact: counts.missing === 0 && counts.phantom === 0,
  };
}
