/**
 * CHALLENGE LANES · card@2 FIELD SPLIT. PURE, dependency-free (safe for the projection and the site build).
 * The repo is public and a book line is price data: a classified (Level A/B) card's line, book, price, quote times and
 * line-dependent hit rates live only in the encrypted price display; the public projection keeps identity, side,
 * model projection and evidence class.
 */

/** Verbatim public text for the site and graphics (the site never derives one). */
export const EVIDENCE_LABEL = Object.freeze({ LEVEL_A: "Model-validated value", LEVEL_B: "Historical hit-rate research (experimental)" });

/* ───────────────────────────── public / private split (the repo is public; a book line is price data) ───────────────────────────── */

/** Book-derived or line-dependent leg fields: never in a plain public file, only in the encrypted display. */
export const PRIVATE_LEG_FIELDS = Object.freeze(["line", "book", "price", "quotedAt", "fetchedAt", "hitRate", "quote"]);
/** The public view of a card@2 leg: identity, side, model projection and class; no line, price, book or hit rate. */
export const publicLeg = (l) => Object.fromEntries(Object.entries(l).filter(([k]) => !PRIVATE_LEG_FIELDS.includes(k)));
/** The private (encrypted-display) view of a card@2 leg: everything computed against the line. Hit rates as {window, k, n}. */
export const privateLeg = (l, { maxQuoteAgeMs = 90 * 60 * 1000 } = {}) => ({
  legId: l.legId, line: l.line ?? null, side: l.side, book: l.book ?? null, american: l.price ?? null, quotedAt: l.quotedAt ?? null, fetchedAt: l.fetchedAt ?? null,
  staleAfter: l.fetchedAt ? new Date(Date.parse(l.fetchedAt) + maxQuoteAgeMs).toISOString() : null,
  hitRates: (l.hitRate?.windows ?? []).map((w) => ({ window: w.window, k: w.hits, n: w.n })), lineBasis: l.hitRate?.lineBasis ?? null,
});
