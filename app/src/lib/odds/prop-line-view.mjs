/**
 * PLAYER-PROP MODEL-VERSUS-LINE VIEW — sport-agnostic (founder P0 product standard 2026-10-29, cross-sport).
 * Pure, import-free, server-safe. Nothing here decides WHETHER a line may be shown (each sport's display switch does —
 * NBA: NBA_LINE_DISPLAY in lib/sports/nba/line-board.mjs) and nothing here compares numbers: the sport adapter's
 * `compare` (NBA: compareToLine, lib/sports/nba/line-comparison.mjs) owns matching, freshness and the difference. This
 * module only turns ONE adapter input + that comparison into the reader-facing fields every surface prints:
 *
 *   player + stat market · official projection · verified line · sportsbook · Over price · Under price ·
 *   OVER (green) / UNDER (red) / NEUTRAL (grey, projection equals line) · difference (projection − line, signed) ·
 *   quote time (ET) · or one of the states STALE / UNAVAILABLE / UNSUPPORTED, each with its reason in words.
 *
 * OVER / UNDER / NEUTRAL describe where the model's projection sits against one sportsbook line. They are NOT a
 * probability, a recommendation or a claim that either side will win; the legend says so. A missing price prints "—"
 * (screen readers: "price unavailable"), never 0; no state other than a valid comparison is coloured.
 *
 * ── ADAPTER CONTRACT (how a sport plugs in) ─────────────────────────────────────────────────────────────────────────
 * A sport supplies an adapter object:
 *   {
 *     sport:        "nba" | "nfl" | "mlb" | "ufc" | "soccer" | …,
 *     maxAgeHours:  number,                       // the sport's freshness rule, quoted in the legend
 *     marketLabel:  (marketKey) => string|null,   // null = the model does not project this market (UNSUPPORTED)
 *     bookLabel:    (bookKey) => string,          // display name of the book ("draftkings" → "DraftKings")
 *     reasonText:   Record<reason, string>,       // the sport's unavailable reasons in words
 *     staleReasons: string[],                     // reasons that mean "a line exists but is too old / after start"
 *     unsupportedReasons: string[],               // reasons that mean "different market definition"
 *     compare:      (input) => Comparison,        // the sport's ONE comparison rule
 *   }
 * and inputs of the shape
 *   { key, player: { id, name, team }, marketKey, projection: number|null,
 *     offer: null | { line, book, overPrice, underPrice, capturedAt, …sport identity fields }, asOf, tip }
 * `compare` returns { direction: ABOVE|BELOW|EQUAL|UNAVAILABLE, reason?, line?, difference?, book?, overPrice?,
 * underPrice?, capturedAt?, side? } — the nba-line-comparison@1 result shape. NFL, MLB, UFC and soccer adapters are
 * written against this contract (their price records live in lib/sports/odds/*); none is wired yet.
 */

export const PROP_LINE_VIEW_RULE = "prop-line-view@1";

/** Reader-facing direction words. Internal comparators may say ABOVE/BELOW/EQUAL; readers never see those. */
export const SIDE = Object.freeze({ OVER: "OVER", UNDER: "UNDER", NEUTRAL: "NEUTRAL" });
export const SIDE_BY_DIRECTION = Object.freeze({ ABOVE: SIDE.OVER, BELOW: SIDE.UNDER, EQUAL: SIDE.NEUTRAL });
export const sideOf = (direction) => SIDE_BY_DIRECTION[direction] ?? null;

export const PROP_LINE_STATE = Object.freeze({ COMPARED: "COMPARED", STALE: "STALE", UNAVAILABLE: "UNAVAILABLE", UNSUPPORTED: "UNSUPPORTED" });

/** Site design tokens (globals.css) — never a literal colour, never a fallback inside var(). */
export const SIDE_TOKEN = Object.freeze({ OVER: "var(--vault-success)", UNDER: "var(--vault-danger)", NEUTRAL: "var(--vault-text-mute)", MUTED: "var(--vault-text-mute)" });

export const STATE_LABEL = Object.freeze({ STALE: "Line stale", UNAVAILABLE: "Line unavailable", UNSUPPORTED: "Unsupported market" });

/** The legend every surface prints beside these rows. `maxAgeHours` is the sport adapter's freshness rule. */
export function propLineLegend(maxAgeHours) {
  return Object.freeze({
    over: "OVER (green): the model's projection is above this sportsbook line.",
    under: "UNDER (red): the model's projection is below this sportsbook line.",
    neutral: "NEUTRAL (grey): the model's projection equals this sportsbook line.",
    difference: "Difference: the model's projection minus the line (for example, 36.0 vs 29.5 is +6.5).",
    stale: `Line stale: the quote is more than ${maxAgeHours} hours old, or was taken after the start, so it is not compared.`,
    unavailable: "Line unavailable: no verified sportsbook line was matched to this player, game and market.",
    unsupported: "Unsupported market: the sportsbook market measures something the model does not project.",
    prices: "A dash means the sportsbook did not post that price; it is never a zero.",
    caveat: "OVER, UNDER and NEUTRAL only compare the model's projection with one sportsbook line. They are not a probability, a pick or a betting recommendation, and they guarantee nothing.",
  });
}

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const MINUS = "−";
/** One decimal, as the projections print. */
export const fmt1 = (v) => (isNum(v) ? (Math.round(v * 10) / 10).toFixed(1) : "—");
/** Signed one-decimal difference: +6.5, −2.0, 0.0 (and the words a screen reader hears). */
export function signedDifference(v) {
  if (!isNum(v)) return { text: "—", spoken: "difference unavailable" };
  const r = Math.round(v * 10) / 10;
  if (r === 0) return { text: "0.0", spoken: "difference 0.0" };
  return r > 0 ? { text: `+${r.toFixed(1)}`, spoken: `plus ${r.toFixed(1)}` } : { text: `${MINUS}${Math.abs(r).toFixed(1)}`, spoken: `minus ${Math.abs(r).toFixed(1)}` };
}
/** American price: +110 / −120. Anything that is not a legitimate American price (null, 0, |p| < 100) is unavailable. */
export function americanPrice(v) {
  if (!isNum(v) || Math.abs(v) < 100 || !Number.isInteger(v)) return { value: null, text: "—", spoken: "price unavailable" };
  return v > 0 ? { value: v, text: `+${v}`, spoken: `plus ${v}` } : { value: v, text: `${MINUS}${Math.abs(v)}`, spoken: `minus ${Math.abs(v)}` };
}
/** Quote time in Eastern Time ("Oct 28, 4:00 PM ET"); an unreadable instant is "—", never a guessed time. */
export function quoteTimeEt(iso) {
  const t = Date.parse(String(iso ?? ""));
  if (!Number.isFinite(t)) return "—";
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(t)) + " ET";
}

/**
 * One reader-facing row.
 * @param {any} input   the adapter-shaped input (see the contract above)
 * @param {any} adapter the sport adapter
 */
export function buildPropLineView(input, adapter) {
  const marketLabel = adapter.marketLabel(input.marketKey);
  const base = {
    rule: PROP_LINE_VIEW_RULE, sport: adapter.sport, key: input.key ?? null,
    player: { id: input.player?.id ?? null, name: input.player?.name ?? "—", team: input.player?.team ?? null },
    market: { key: input.marketKey, label: marketLabel ?? String(input.marketKey ?? "—") },
    projection: { value: isNum(input.projection) ? input.projection : null, text: fmt1(input.projection) },
  };
  const who = `${base.player.name}, ${base.market.label}`;
  const muted = (state, reason, offer) => {
    const book = offer ? adapter.bookLabel(offer.book) : null;
    const line = offer && isNum(offer.line) ? { value: offer.line, text: fmt1(offer.line) } : null;
    const reasonText = adapter.reasonText?.[reason] ?? null;
    const showOffer = state === PROP_LINE_STATE.STALE && line;
    return {
      ...base, state, side: null, tone: "MUTED", color: SIDE_TOKEN.MUTED, reason: reason ?? null,
      statusText: STATE_LABEL[state], reasonText,
      line: showOffer ? line : null, difference: null,
      book: showOffer ? { key: offer.book, label: book } : null,
      overPrice: showOffer ? americanPrice(offer.overPrice) : null, underPrice: showOffer ? americanPrice(offer.underPrice) : null,
      quotedAt: showOffer ? { iso: offer.capturedAt ?? null, text: quoteTimeEt(offer.capturedAt) } : null,
      spoken: `${who}. ${STATE_LABEL[state]}${reasonText ? `: ${reasonText}` : "."} Model ${base.projection.text}.${showOffer ? ` ${book} line ${line.text}, quoted ${quoteTimeEt(offer.capturedAt)}, not compared.` : ""}`,
    };
  };
  if (marketLabel == null) return muted(PROP_LINE_STATE.UNSUPPORTED, "UNSUPPORTED_MARKET", null);
  const c = adapter.compare(input);
  if (!c || c.direction === "UNAVAILABLE" || !sideOf(c.direction)) {
    const reason = c?.reason ?? "NO_LINE";
    if ((adapter.unsupportedReasons ?? []).includes(reason)) return muted(PROP_LINE_STATE.UNSUPPORTED, reason, null);
    if ((adapter.staleReasons ?? []).includes(reason)) return muted(PROP_LINE_STATE.STALE, reason, input.offer);
    return muted(PROP_LINE_STATE.UNAVAILABLE, reason, null);
  }
  const side = c.side ?? sideOf(c.direction);
  const diff = signedDifference(c.difference);
  const over = americanPrice(c.overPrice), under = americanPrice(c.underPrice);
  const book = adapter.bookLabel(c.book);
  const quoted = quoteTimeEt(c.capturedAt);
  const sideWord = side === SIDE.OVER ? "Over" : side === SIDE.UNDER ? "Under" : "Neutral";
  return {
    ...base, state: PROP_LINE_STATE.COMPARED, side, tone: side, color: SIDE_TOKEN[side], reason: null,
    statusText: side, reasonText: null,
    line: { value: c.line, text: fmt1(c.line) },
    difference: { value: Math.round(c.difference * 10) / 10, text: diff.text },
    book: { key: c.book, label: book },
    overPrice: over, underPrice: under,
    quotedAt: { iso: c.capturedAt, text: quoted },
    spoken: `${who}. ${sideWord}, model ${base.projection.text} vs line ${fmt1(c.line)}, ${diff.spoken}. ${book}: Over ${over.spoken}, Under ${under.spoken}. Quoted ${quoted}.`,
  };
}

/** Rows + counts for one surface. Rows keep the input order (the adapter's order), never re-ranked by difference. */
export function buildPropLineViews(inputs, adapter) {
  const rows = (inputs ?? []).map((i) => buildPropLineView(i, adapter));
  const count = (s) => rows.filter((r) => r.state === s).length;
  return {
    rule: PROP_LINE_VIEW_RULE, sport: adapter.sport, maxAgeHours: adapter.maxAgeHours, legend: propLineLegend(adapter.maxAgeHours), rows,
    counts: { compared: count(PROP_LINE_STATE.COMPARED), stale: count(PROP_LINE_STATE.STALE), unavailable: count(PROP_LINE_STATE.UNAVAILABLE), unsupported: count(PROP_LINE_STATE.UNSUPPORTED) },
  };
}
