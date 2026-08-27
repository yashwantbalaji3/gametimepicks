/**
 * PUBLIC-CONTENT CONTRACT (P213 · Release G) — the editorial decisions of the page-by-page walk,
 * versioned as data. Each walked route records its purpose, first action, state owner and the
 * copy decisions taken (with measured before/after). The /launch UX Assurance panel renders THIS;
 * the boilerplate ratchet enforces the ceilings declared HERE — one source, no hand-edited tile.
 *
 * Decisions use the closed vocabulary: KEEP · SHORTEN · MOVE_TO_HELP · MERGE · REMOVE · REDESIGN.
 * A route not yet walked is listed as PENDING with nothing invented for it.
 */

export const CONTENT_CONTRACT_VERSION = 1;

/** The one global owner set for the educational/legal identity. */
export const LEGAL_OWNERS = Object.freeze({
  aboveFold: "global top strip (DisclaimerBanner — compliance copy, kept verbatim; removal is a FOUNDER decision)",
  footer: "footer legal sentence + brand line (the approved sentence)",
  detail: "/about + /methodology + /responsible-use",
});

/** Per-route 'paper-only' ceilings the ratchet enforces (measured 2026-08-27 + 2 live-state headroom). */
/* P214 R-H: re-measured after the shared header strip left four routes and the R-A trims landed —
   every ceiling ratchets DOWN to measured+2 (2026-08-27 build; live-state headroom kept). */
export const PAPER_ONLY_CEILINGS = Object.freeze({
  "index.html": 6,
  "today/index.html": 7,
  "simulate/index.html": 6,
  "markets/index.html": 4,
  "build/index.html": 5,
  "results/index.html": 5,
  "mlb/index.html": 4,
  "nfl/index.html": 5,
  "epl/index.html": 7,
  "ufc/index.html": 7,
  "bank-builder/index.html": 9,
  "moonshot/index.html": 5,
  "mr-dub/index.html": 9,
  "learn/index.html": 7,
  "sports/index.html": 4,
});

/**
 * The walked routes. `before`/`after` are measured rendered words for the touched surface (route
 * totals where stated); PENDING rows carry only their planned scope.
 */
export const WALKED_ROUTES = Object.freeze([
  {
    route: "/",
    purpose: "launchpad — today's games, picks and results in one viewport",
    firstAction: "Simulate Today's Games",
    stateOwner: "derived live-status row (product-day owners + portfolio + settled dates)",
    decisions: [
      { block: "badge stack (3 chips)", decision: "REMOVE", note: "founder screenshot; concepts already at /about + /methodology" },
      { block: "manifesto paragraph", decision: "REMOVE", note: "pure duplicate of /about" },
      { block: "headline", decision: "SHORTEN", note: "9 words → 5 (charter budget ≤8)" },
      { block: "availability line", decision: "REDESIGN", note: "one derived live-status row; figures from owners only" },
      { block: "footer About paragraph (site-wide)", decision: "MOVE_TO_HELP", note: "→ /about; stale coverage claim removed; brand line + legal sentence kept" },
      { block: "section paper-only tags (12 across home/nav)", decision: "MERGE", note: "→ chrome owners; ratchet frozen" },
    ],
    measured: { routeWordsBefore: 1507, routeWordsAfter: 1432, note: "live-state variance to 1501 measured; ceiling 1600" },
  },
  {
    route: "/today",
    purpose: "slate control surface — the day's events, picks and product states",
    firstAction: "Simulate Today's Games",
    stateOwner: "daily brief + availability contract",
    decisions: [
      { block: "paper-only trio (3 spots)", decision: "MERGE", note: "slate header keeps it once" },
    ],
    measured: { routeWordsBefore: 2493, routeWordsAfter: 2484 },
  },
  {
    route: "/markets",
    purpose: "ranked picks beside sportsbook prices",
    firstAction: "inspect a market / add a leg",
    stateOwner: "snapshot stamp + started chips per game",
    decisions: [
      { block: "header explainer (3 sentences)", decision: "SHORTEN", note: "one provenance line; taxonomy lives in the reading key" },
      { block: "worked example + caution", decision: "SHORTEN", note: "P185 open-example contract intact; both pinned phrases kept" },
    ],
    measured: { routeWordsBefore: 10661, routeWordsAfter: 10599 },
  },
  {
    route: "/epl",
    purpose: "matchweek forecasts — win/draw/win first",
    firstAction: "open a fixture / full schedule",
    stateOwner: "validation-status label (graded-record line, dynamic)",
    decisions: [
      { block: "validation paragraph", decision: "SHORTEN", note: "limitation still leads; explainer behind a disclosure" },
      { block: "player preamble", decision: "SHORTEN", note: "one line per lineup state; caveat kept" },
      { block: "validation receipt + limitations", decision: "MOVE_TO_HELP", note: "one disclosure beside the table; summary carries the claim" },
      { block: "rail sublabel", decision: "SHORTEN", note: "note keeps 'not validated' (P185 nav contract)" },
    ],
    measured: { routeWordsBefore: 1834, routeWordsAfter: null, note: "post-walk measurement at next build stamp" },
  },
  {
    route: "/bank-builder",
    purpose: "the ladder — today's lifecycle state first",
    firstAction: "review today's card / no-play",
    stateOwner: "P140 product state + P211 lifecycle receipts",
    decisions: [
      { block: "top essay (3 blocks)", decision: "SHORTEN", note: "purpose line + sample-size truth; mechanics behind a disclosure; ladder now in first viewport" },
    ],
    measured: { routeWordsBefore: 1248, routeWordsAfter: null },
  },
  {
    route: "/mlb",
    purpose: "daily MLB workflow — board, sims, props",
    firstAction: "open the board / a game report",
    stateOwner: "board freshness + availability contract",
    decisions: [
      { block: "section paper-only suffixes (4)", decision: "MERGE", note: "chrome owners" },
      { block: "'model edge pending' chip", decision: "REDESIGN", note: "implied a coming edge; now 'a market read, not a model claim'" },
    ],
    measured: { routeWordsBefore: 3819, routeWordsAfter: null },
  },
  {
    route: "/ufc",
    purpose: "next card — bout order, winner/method/round",
    firstAction: "open the card / a bout read",
    stateOwner: "card-latest state + refusal disclosure",
    decisions: [
      { block: "reason fallback ('close to a coin flip' at any %)", decision: "REDESIGN", note: "generator fixed — coin-flip language only within 45–55%; artifact refreshes on the owning workflow's next run" },
    ],
    measured: { routeWordsBefore: 3954, routeWordsAfter: null },
  },
  {
    route: "/results",
    purpose: "trust center — record, settlement status, receipts on demand",
    firstAction: "view settled cards",
    stateOwner: "canonical accounting (P052/P053)",
    decisions: [
      { block: "header second sentence", decision: "REMOVE", note: "repeated its own three chips verbatim" },
    ],
    measured: { routeWordsBefore: 18629, routeWordsAfter: null },
  },
  { route: "/simulate", purpose: "date + sport selector — one action per event state", firstAction: "view/generate a simulation", stateOwner: "P209 day-view machine", decisions: [{ block: "whole route", decision: "KEEP", note: "already one-line states, honest empties" }], measured: { routeWordsBefore: 4238, routeWordsAfter: 4238 } },
  { route: "/build", purpose: "Parlay Center — suggested + custom in one surface", firstAction: "seed/edit a card", stateOwner: "engine slate + slip store", decisions: [], measured: null, pending: "walk pending — filters/conflict copy" },
  { route: "/nfl", purpose: "preseason wording stays while preseason owns the window", firstAction: null, stateOwner: "model-status (PUBLIC_EXPERIMENTAL)", decisions: [{ block: "preseason framing", decision: "KEEP", note: "accurate until the regular-season window; revisit at RS cutover" }], measured: null },
  { route: "/moonshot", purpose: "longshot lane — smallest route, honest 0-7 record", firstAction: "view today's structured card", stateOwner: "signature product state", decisions: [{ block: "whole route", decision: "KEEP" }], measured: null },
]);
