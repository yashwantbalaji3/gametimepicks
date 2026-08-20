/**
 * THE UFC ODDS SNAPSHOT ADAPTER — the missing join between a paid capture and the shadow run.
 *
 * WHY THIS EXISTS. The fight-week capture succeeded (12 bouts priced, 1 credit, `oddsReady: true`)
 * and still produced no probabilities anywhere, because nothing could read it:
 *
 *   · the published artifact carries `generatedAt` + `bouts[].sides[]` with a MEDIAN consensus price;
 *   · `runUfcShadow` reads `capturedAt` + `rows[]` of PER-BOOKMAKER h2h markets;
 *   · the only caller that ever passed `oddsSnapshot` was a unit test.
 *
 * So the de-vig code was written, tested, and wired to nothing. `oddsReady: true` meant "prices
 * joined to bouts", never "implied probabilities exist".
 *
 * WHY PER-BOOK, NOT THE CONSENSUS. De-vigging the published median would be arithmetically fine and
 * epistemically wrong: `runUfcShadow` records an `impliedSum` per bookmaker and QUARANTINES books
 * whose two-way market does not de-vig. Feeding it one synthetic row would invent a bookmaker that
 * never posted a price and would silently drop that quarantine channel — a source we cannot name is
 * not a source. The provider already returns per-book markets; the capture simply collapsed them to
 * a median before writing. This keeps both: the median stays the public read, the per-book rows go
 * to the private research path for the model.
 */

/** Bumped when the row shape changes; the consumer refuses a version it does not know. */
export const UFC_ODDS_SNAPSHOT_VERSION = 1;

/**
 * Build the snapshot `runUfcShadow` consumes from the capture's per-book markets.
 *
 * @param {object} p
 * @param {string} p.capturedAt            ISO time the PAID call returned — never "now"
 * @param {Array<{boutId: string|number, books: Array<{book: string, outcomes: Array<{name: string, price: number}>}>}>} p.bouts
 * @returns {{version: number, capturedAt: string, rows: Array<object>}}
 */
export function buildUfcOddsSnapshot({ capturedAt, bouts }) {
  if (typeof capturedAt !== "string" || !Number.isFinite(Date.parse(capturedAt))) {
    throw new Error("buildUfcOddsSnapshot: capturedAt must be the ISO time the paid call returned");
  }
  const rows = [];
  for (const b of bouts ?? []) {
    // A bout with no id cannot be joined back to the card, and a row that cannot be joined is worse
    // than no row — it would price a bout we cannot name.
    if (b?.boutId == null) continue;
    for (const bk of b.books ?? []) {
      if (!bk?.book || !Array.isArray(bk.outcomes)) continue;
      rows.push({
        marketType: "h2h",
        providerBoutId: String(b.boutId),
        bookmaker: bk.book,
        // Prices pass through untouched. noVigTwoWay reads {name, price} and refuses anything it
        // cannot parse, so normalising here would only hide a malformed feed from its own guard.
        outcomes: bk.outcomes.map((o) => ({ name: o?.name ?? null, price: typeof o?.price === "number" ? o.price : null })),
        sourceAsOf: capturedAt,
      });
    }
  }
  return { version: UFC_ODDS_SNAPSHOT_VERSION, capturedAt, rows };
}

/**
 * Present a card bout to `runUfcShadow`, which keys on `providerBoutId` while the card carries
 * `boutId`. Kept here, next to the row builder, so both sides of the join move together.
 */
export function withProviderBoutId(bout) {
  return { ...bout, providerBoutId: bout?.providerBoutId ?? (bout?.boutId == null ? null : String(bout.boutId)) };
}
