/**
 * PLAYER-PROP MODEL-VERSUS-LINE VIEW — sport-agnostic (founder P0 product standard 2026-10-29, cross-sport).
 * Pure, import-free, server-safe. Nothing here decides WHETHER a line may be shown (each sport's display switch does —
 * NBA: NBA_LINE_DISPLAY in lib/sports/nba/line-board.mjs) and nothing here compares numbers: the sport adapter's
 * `compare` (NBA: compareToLine, lib/sports/nba/line-comparison.mjs) owns matching, freshness and the direction. This
 * module only turns ONE adapter input + that comparison into the reader-facing fields every surface prints:
 *
 *   PRIMARY    player · market · model (official projection) · book line · direction · difference
 *   SECONDARY  sportsbook · Over price · Under price · quoted at (ET)
 *
 * Direction is OVER (green ▲) / UNDER (red ▼) / NEUTRAL (grey =, projection equals line), or the row is in one of the
 * STATES below, which carry plain public wording and NO direction. OVER / UNDER / NEUTRAL describe where the model's
 * projection sits against one sportsbook line; they are NOT a probability, a recommendation or a claim that either side
 * will win (the legend says so). A missing price prints "—", never 0; only a valid comparison is coloured.
 *
 * ── DISPLAY ROUNDING POLICY (founder 2026-10-29) — DISPLAY_ROUNDING_POLICY below is the machine-readable copy ─────────
 *   1. The evaluator keeps FULL precision: compareToLine returns `differenceExact` (projection − line, unrounded).
 *   2. The direction comes from that full-precision difference, never from a rounded one.
 *   3. Display rounds the model projection and the difference to ONE decimal, half away from zero (symmetric, so +x and
 *      −x print the same magnitude).
 *   4. A non-zero full-precision difference that rounds to 0.0 prints "+0.0" (OVER) or "−0.0" (UNDER) — the sign is the
 *      true direction. Rounding never flips a direction and never turns OVER/UNDER into NEUTRAL. "0.0" (unsigned) is
 *      printed only when the projection EQUALS the line (NEUTRAL).
 *   5. Lines print as the sportsbook provided them (half-points: 29.5; a whole line gets one decimal, 30 → 30.0; a line
 *      with more decimals is never rounded).
 *   6. Prices print American with an explicit sign (+120 / −110); anything that is not a legitimate American price is "—".
 *
 * ── ADAPTER CONTRACT (how a sport plugs in) ─────────────────────────────────────────────────────────────────────────
 * A sport supplies an adapter object:
 *   {
 *     sport:        "nba" | "nfl" | "mlb" | "ufc" | "soccer" | …,
 *     maxAgeHours:  number,                       // the sport's freshness rule, quoted in the legend and stale copy
 *     marketLabel:  (marketKey) => string|null,   // null = the model does not project this market (UNSUPPORTED)
 *     bookLabel:    (bookKey) => string,          // display name of the book ("draftkings" → "DraftKings")
 *     stateOfReason: Record<reason, STATE>,       // every refusal reason → one of the STATES (unlisted → UNAVAILABLE)
 *     compare:      (input) => Comparison,        // the sport's ONE comparison rule
 *   }
 * and inputs of the shape
 *   { key, player: { id, name, team }, marketKey, projection: number|null,
 *     offer: null | { line, book, overPrice, underPrice, capturedAt, …sport identity fields }, asOf, tip }
 * `compare` returns { direction: ABOVE|BELOW|EQUAL|UNAVAILABLE, reason?, line?, difference?, differenceExact?, book?,
 * overPrice?, underPrice?, capturedAt?, side? } — the nba-line-comparison@1 result shape. Engineering reason codes stay in
 * `reason` (rendered only as a data attribute); readers see the state's sentence.
 *
 * Two optional input fields (prop-line-view@3, added for NFL; NBA never sets them, so NBA rows are unchanged):
 *   projectionFormat: "probability"  the projection is a 0–1 probability (a yes/no market such as anytime touchdown) and
 *                                    prints as a percentage ("54.9%"), never as a median;
 *   offer.price                      the ONE price of a one-sided (yes/no) market. Such a market is NEVER an over/under:
 *                                    the adapter returns reason YES_NO_MARKET and the row is in state YES_NO — the book's
 *                                    "Yes" price and quote time are printed, no line, no direction, no difference, and no
 *                                    model-versus-implied-probability comparison (not in scope for display).
 * A family whose model figure is NOT an official forecast (NFL: an ESTIMATE / WITHHELD family) is state NOT_PUBLISHED:
 * the adapter passes projection null (the unofficial figure is never printed) and no direction is ever produced.
 *
 * ── DIRECTION GATE (prop-line-view@4, founder 2026-10-29) — FAIL CLOSED ─────────────────────────────────────────────
 * A captured line does not make a direction publishable. The builders take `opts.directions = { scope, shows(family) }`:
 * a row the adapter would compare is COMPARED (with its direction) only when `shows(marketKey)` is true; otherwise it is
 * state DIRECTION_WITHHELD ("Comparison not shown"): projection, line, book, prices and quote time are printed; side,
 * glyph, colour and difference are NOT (not even in the spoken text or a data attribute).
 *   omitted                 DIRECTIONS_WITHHELD — nothing shows a direction (the default; a forgotten gate never leaks one)
 *   public pages            publicDirectionGate(sport) from lib/odds/display-authorization.mjs (site authorized AND the
 *                           family's directionQualified entry is qualified: every family is unqualified today)
 *   private diagnostics     PRIVATE_DIRECTIONS — every direction (evidence renders, coverage reports; never a page)
 */

export const PROP_LINE_VIEW_RULE = "prop-line-view@4";

/** Direction gates (see the header). The default is DIRECTIONS_WITHHELD. */
export const DIRECTIONS_WITHHELD = Object.freeze({ scope: "withheld", shows: () => false });
export const PRIVATE_DIRECTIONS = Object.freeze({ scope: "private", shows: () => true });
const gateOf = (d) => (d && typeof d.shows === "function" ? d : DIRECTIONS_WITHHELD);

/** Reader-facing direction words. Internal comparators may say ABOVE/BELOW/EQUAL; readers never see those. */
export const SIDE = Object.freeze({ OVER: "OVER", UNDER: "UNDER", NEUTRAL: "NEUTRAL" });
export const SIDE_BY_DIRECTION = Object.freeze({ ABOVE: SIDE.OVER, BELOW: SIDE.UNDER, EQUAL: SIDE.NEUTRAL });
export const sideOf = (direction) => SIDE_BY_DIRECTION[direction] ?? null;
/** The shape that travels with the word and the colour (colour is never the only signal). */
export const SIDE_GLYPH = Object.freeze({ OVER: "▲", UNDER: "▼", NEUTRAL: "=" });

/**
 * Row states. COMPARED is the only one with a direction. Section-level states (no rows at all) are separate:
 * PROVIDER_UNAVAILABLE (switch on, no verified line source for this slate) and NOT_AUTHORIZED (switch off — the
 * section renders nothing, so the page is the projection-only page exactly as before).
 */
export const PROP_LINE_STATE = Object.freeze({
  COMPARED: "COMPARED",
  STALE: "STALE", // a matched line, too old at the comparison instant
  AFTER_CUTOFF: "AFTER_CUTOFF", // a matched line captured at or after the start
  MISMATCH: "MISMATCH", // a line that could not be matched to this player and game (or slate)
  UNAVAILABLE: "UNAVAILABLE", // no line for this player and market
  UNSUPPORTED: "UNSUPPORTED", // the market measures something the model does not project
  SUSPENDED: "SUSPENDED", // the market was suspended, or the line is not eligible for comparison
  NOT_PUBLISHED: "NOT_PUBLISHED", // the model's figure for this market is not an official forecast (withheld family)
  YES_NO: "YES_NO", // a one-sided yes/no market (anytime touchdown): price carried, never an over/under comparison
  DIRECTION_WITHHELD: "DIRECTION_WITHHELD", // comparable, but this family's direction is not qualified for public display
});
export const SECTION_STATE = Object.freeze({ PROVIDER_UNAVAILABLE: "PROVIDER_UNAVAILABLE", NOT_AUTHORIZED: "NOT_AUTHORIZED" });

/** Site design tokens (globals.css) — never a literal colour, never a fallback inside var(). */
export const SIDE_TOKEN = Object.freeze({ OVER: "var(--vault-success)", UNDER: "var(--vault-danger)", NEUTRAL: "var(--vault-text-mute)", MUTED: "var(--vault-text-mute)" });

/** The founder's wording (2026-10-29) for a comparable row whose family is not direction-qualified. */
export const DIRECTION_WITHHELD_TEXT = "Model and sportsbook line shown; a direction is not shown for this statistic yet because its forecast has not met our calibration standard.";

/** Public wording per state: a short label (the status chip) and one plain sentence. No reason codes, no jargon. */
export function stateCopy(maxAgeHours) {
  return Object.freeze({
    STALE: Object.freeze({ label: "Line stale", text: `This sportsbook line is more than ${maxAgeHours} hours old, so it is not compared.` }),
    AFTER_CUTOFF: Object.freeze({ label: "Captured after cutoff", text: "This line was captured after the game started, so it is not compared." }),
    MISMATCH: Object.freeze({ label: "Line not matched", text: "Line could not be matched to this player and game." }),
    UNAVAILABLE: Object.freeze({ label: "Line unavailable", text: "No sportsbook line was found for this player and market." }),
    UNSUPPORTED: Object.freeze({ label: "Market not supported", text: "This sportsbook market measures something our model does not project." }),
    SUSPENDED: Object.freeze({ label: "Market suspended", text: "The sportsbook suspended this market, or its line is not eligible for comparison." }),
    NOT_PUBLISHED: Object.freeze({ label: "Official projection not published", text: "Our model's figure for this statistic is not an official forecast, so it is not compared." }),
    YES_NO: Object.freeze({ label: "Not an over/under market", text: "This is a yes/no market with one price, not an over/under line, so it is not compared." }),
    DIRECTION_WITHHELD: Object.freeze({ label: "Comparison not shown", text: DIRECTION_WITHHELD_TEXT }),
  });
}
/** Section-level wording (no rows). NOT_AUTHORIZED is never printed: the section renders nothing. */
export const SECTION_COPY = Object.freeze({
  PROVIDER_UNAVAILABLE: "Sportsbook lines: Unavailable. No verified sportsbook line is published for these projections right now.",
});
/** States whose (matched) quote is still printed, muted and marked "not compared". The others never show a line. */
const SHOWS_QUOTE = new Set([PROP_LINE_STATE.STALE, PROP_LINE_STATE.AFTER_CUTOFF]);
/** A yes/no market's single price: printed (book, "Yes" price, quote time), never a line or a direction. */
const SHOWS_YES_PRICE = new Set([PROP_LINE_STATE.YES_NO]);

/** The legend every surface prints beside these rows. `maxAgeHours` is the sport adapter's freshness rule. */
export function propLineLegend(maxAgeHours) {
  return Object.freeze({
    over: "OVER means our model's projection is above the sportsbook's line.",
    under: "UNDER means our model's projection is below the sportsbook's line.",
    neutral: "NEUTRAL means our model's projection is the same as the sportsbook's line.",
    difference: "Difference is our projection minus the line: 36.0 against 29.5 is +6.5. A gap smaller than 0.05 shows as +0.0 or −0.0 and keeps its direction.",
    states: `A line older than ${maxAgeHours} hours, taken after the game started, not matched to the player and game, suspended, or for a statistic we do not project is shown with the reason and is not compared.`,
    prices: "Over and Under prices are the sportsbook's American odds. A dash means the sportsbook did not post that price; it is never a zero.",
    withheld: "Comparison not shown means the model and the sportsbook line are both shown without a direction, because that statistic's forecast has not yet met our calibration standard.",
    caveat: "It is a comparison, not a bet recommendation or a probability, and it guarantees nothing.",
  });
}

/* ── formatting (the rounding policy) ───────────────────────────────────────────────────────────────────────────────── */
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const MINUS = "−";
export const DISPLAY_ROUNDING_POLICY = Object.freeze({
  evaluator: "full precision (differenceExact); direction from full precision",
  model: "1 decimal, half away from zero",
  difference: "1 decimal, half away from zero; a non-zero difference that rounds to 0.0 prints +0.0 / −0.0 with its true direction",
  line: "as provided (half-points); whole lines get one decimal; never rounded",
  price: "American with sign; illegitimate → —",
});
/** |v| rounded to one decimal, half away from zero (the epsilon absorbs binary noise such as 2.3000000000000007). */
const mag1 = (v) => Math.round(Math.abs(v) * 10 + 1e-9) / 10;
/** One decimal, as the projections print (half away from zero). */
export const fmt1 = (v) => (isNum(v) ? `${v < 0 && mag1(v) !== 0 ? MINUS : ""}${mag1(v).toFixed(1)}` : "—");
/** A 0–1 probability as a percentage with one decimal ("54.9%"), as the NFL board prints it; anything else is "—". */
export const pct1 = (v) => (isNum(v) && v >= 0 && v <= 1 ? `${mag1(v * 100).toFixed(1)}%` : "—");
/** A line exactly as the sportsbook provided it: 29.5 → "29.5", 30 → "30.0", 29.25 → "29.25" (never rounded). */
export function lineText(v) {
  if (!isNum(v)) return "—";
  return Number.isInteger(v * 10) || Number.isInteger(v) ? v.toFixed(1) : String(v);
}
/**
 * Signed one-decimal difference from the FULL-precision value: +6.5, −2.3, 0.0 only when exactly zero, and +0.0 / −0.0
 * when the true difference is non-zero but smaller than 0.05 (the sign is the true direction).
 */
export function signedDifference(v) {
  if (!isNum(v)) return { text: "—", spoken: "difference unavailable", value: null };
  if (v === 0) return { text: "0.0", spoken: "difference 0.0", value: 0 };
  const m = mag1(v).toFixed(1);
  return v > 0 ? { text: `+${m}`, spoken: `plus ${m}`, value: Number(m) } : { text: `${MINUS}${m}`, spoken: `minus ${m}`, value: -Number(m) };
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
 * @param {{ directions?: { scope?: string, shows: (family: string) => boolean } }} [opts] the direction gate (default:
 *   DIRECTIONS_WITHHELD — fail closed)
 */
export function buildPropLineView(input, adapter, opts = {}) {
  const gate = gateOf(opts.directions);
  const copy = stateCopy(adapter.maxAgeHours);
  const marketLabel = adapter.marketLabel(input.marketKey);
  const base = {
    rule: PROP_LINE_VIEW_RULE, sport: adapter.sport, key: input.key ?? null,
    player: { id: input.player?.id ?? null, name: input.player?.name ?? "—", team: input.player?.team ?? null },
    market: { key: input.marketKey, label: marketLabel ?? String(input.marketKey ?? "—") },
    projection: { value: isNum(input.projection) ? input.projection : null, text: input.projectionFormat === "probability" ? pct1(input.projection) : fmt1(input.projection) },
  };
  const who = `${base.player.name}, ${base.market.label}`;
  const muted = (state, reason, offer) => {
    const showLine = SHOWS_QUOTE.has(state) && offer && isNum(offer.line);
    const showYes = SHOWS_YES_PRICE.has(state) && offer && americanPrice(offer.price).value != null;
    const showOffer = showLine || showYes;
    const book = showOffer ? adapter.bookLabel(offer.book) : null;
    const line = showLine ? { value: offer.line, text: lineText(offer.line) } : null;
    const yes = showYes ? americanPrice(offer.price) : null;
    const c = copy[state];
    return {
      ...base, state, side: null, glyph: null, tone: "MUTED", color: SIDE_TOKEN.MUTED, reason: reason ?? null,
      statusText: c.label, reasonText: c.text,
      line, difference: null,
      book: showOffer ? { key: offer.book, label: book } : null,
      overPrice: showLine ? americanPrice(offer.overPrice) : null, underPrice: showLine ? americanPrice(offer.underPrice) : null,
      ...(showYes ? { yesPrice: yes } : {}),
      quotedAt: showOffer ? { iso: offer.capturedAt ?? null, text: quoteTimeEt(offer.capturedAt) } : null,
      spoken: `${who}. ${c.label}: ${c.text} Model ${base.projection.text}.${showLine ? ` ${book} line ${line.text}, quoted ${quoteTimeEt(offer.capturedAt)}, not compared.` : ""}${showYes ? ` ${book} Yes ${yes.spoken}, quoted ${quoteTimeEt(offer.capturedAt)}, not compared.` : ""}`,
    };
  };
  if (marketLabel == null) return muted(PROP_LINE_STATE.UNSUPPORTED, "UNSUPPORTED_MARKET", null);
  const c = adapter.compare(input);
  if (!c || c.direction === "UNAVAILABLE" || !sideOf(c.direction)) {
    const reason = c?.reason ?? "NO_LINE";
    const state = adapter.stateOfReason?.[reason] ?? PROP_LINE_STATE.UNAVAILABLE;
    return muted(PROP_LINE_STATE[state] ? state : PROP_LINE_STATE.UNAVAILABLE, reason, input.offer);
  }
  const book = adapter.bookLabel(c.book);
  const quoted = quoteTimeEt(c.capturedAt);
  if (gate.shows(input.marketKey) !== true) {
    // Comparable, but the family's direction is not qualified for this surface: model + line (+ book, prices, time), and
    // NOTHING that reveals the side — no side, glyph, colour, difference, nor a spoken or attribute hint of either.
    const w = copy.DIRECTION_WITHHELD;
    const o = americanPrice(c.overPrice), u = americanPrice(c.underPrice);
    return {
      ...base, state: PROP_LINE_STATE.DIRECTION_WITHHELD, side: null, glyph: null, tone: "MUTED", color: SIDE_TOKEN.MUTED, reason: "DIRECTION_NOT_QUALIFIED",
      statusText: w.label, reasonText: w.text,
      line: { value: c.line, text: lineText(c.line) }, difference: null,
      book: { key: c.book, label: book }, overPrice: o, underPrice: u,
      quotedAt: { iso: c.capturedAt, text: quoted },
      spoken: `${who}. ${w.label}: ${w.text} Model ${base.projection.text}, ${book} line ${lineText(c.line)}: Over ${o.spoken}, Under ${u.spoken}. Quoted ${quoted}.`,
    };
  }
  const side = c.side ?? sideOf(c.direction);
  // Rounding policy: the full-precision difference when the rule supplies it; the sign always agrees with `side`.
  const exact = isNum(c.differenceExact) ? c.differenceExact : c.difference;
  const diff = signedDifference(exact);
  const over = americanPrice(c.overPrice), under = americanPrice(c.underPrice);
  const sideWord = side === SIDE.OVER ? "Over" : side === SIDE.UNDER ? "Under" : "Neutral";
  return {
    ...base, state: PROP_LINE_STATE.COMPARED, side, glyph: SIDE_GLYPH[side], tone: side, color: SIDE_TOKEN[side], reason: null,
    statusText: side, reasonText: null,
    line: { value: c.line, text: lineText(c.line) },
    difference: { value: diff.value, exact: isNum(exact) ? exact : null, text: diff.text },
    book: { key: c.book, label: book },
    overPrice: over, underPrice: under,
    quotedAt: { iso: c.capturedAt, text: quoted },
    spoken: `${who}. ${sideWord}, model ${base.projection.text} vs line ${lineText(c.line)}, ${diff.spoken}. ${book}: Over ${over.spoken}, Under ${under.spoken}. Quoted ${quoted}.`,
  };
}

/** "N of M projections have a qualified sportsbook line" — M is the TRUE denominator (every published projection). */
export function coverageText(qualified, projections) {
  if (!Number.isInteger(projections) || projections < 0) return null;
  return `${qualified} of ${projections} projection${projections === 1 ? "" : "s"} ${qualified === 1 ? "has" : "have"} a qualified sportsbook line`;
}

/**
 * Rows + counts for one surface. Rows keep the input order (the adapter's order), never re-ranked by difference.
 * @param {any[]} inputs
 * @param {any} adapter
 * @param {{ projections?: number, directions?: { scope?: string, shows: (family: string) => boolean } }} [opts]
 *   `projections`: how many official projections the surface covers (the coverage denominator). Omitted → no coverage
 *   sentence (never a guessed denominator). `directions`: the direction gate (default DIRECTIONS_WITHHELD; see header).
 */
export function buildPropLineViews(inputs, adapter, opts = {}) {
  const gate = gateOf(opts.directions);
  const rows = (inputs ?? []).map((i) => buildPropLineView(i, adapter, { directions: gate }));
  const count = (s) => rows.filter((r) => r.state === s).length;
  const counts = {
    compared: count(PROP_LINE_STATE.COMPARED), stale: count(PROP_LINE_STATE.STALE), afterCutoff: count(PROP_LINE_STATE.AFTER_CUTOFF),
    mismatch: count(PROP_LINE_STATE.MISMATCH), unavailable: count(PROP_LINE_STATE.UNAVAILABLE), unsupported: count(PROP_LINE_STATE.UNSUPPORTED),
    suspended: count(PROP_LINE_STATE.SUSPENDED), notPublished: count(PROP_LINE_STATE.NOT_PUBLISHED), yesNo: count(PROP_LINE_STATE.YES_NO),
    directionWithheld: count(PROP_LINE_STATE.DIRECTION_WITHHELD),
  };
  // A withheld-direction row still has a QUALIFIED line (matched, fresh, eligible): it counts toward coverage.
  const qualified = counts.compared + counts.directionWithheld;
  const sides = { OVER: rows.filter((r) => r.side === SIDE.OVER).length, UNDER: rows.filter((r) => r.side === SIDE.UNDER).length, NEUTRAL: rows.filter((r) => r.side === SIDE.NEUTRAL).length };
  const projections = Number.isInteger(opts.projections) ? opts.projections : null;
  return {
    rule: PROP_LINE_VIEW_RULE, sport: adapter.sport, maxAgeHours: adapter.maxAgeHours, directionScope: gate.scope ?? null, legend: propLineLegend(adapter.maxAgeHours), rows, counts, sides,
    coverage: projections == null ? null : { qualified, projections, text: coverageText(qualified, projections) },
  };
}
