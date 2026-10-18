/**
 * WHICH SPORTSBOOKS' PRICES MAY BE SHOWN TO A READER (eligible-operator allowlist, policy v1).
 *
 * ⚠ THE PROVIDER'S `us` REGION IS NOT "US-LICENSED". The Odds API `regions=us` returns eleven books,
 * five of which are offshore operators that hold no US state sportsbook licence and have drawn
 * cease-and-desist letters or fines from US regulators (bovada, betonlineag, mybookieag, betus,
 * lowvig). Until 2026-10-18 the MLB props board picked the bettor-best price across all eleven, so
 * Production named BetOnline.ag beside "Elite" chips. Evidence and sources:
 * docs/research/SMART_BETSLIP_PREP_AND_OPERATOR_POLICY_2026-10-18.md (research branch).
 *
 * FAIL-CLOSED: a key not listed here is NOT eligible. A new book the provider starts returning
 * stays off the page until someone adds it here with a citation, rather than appearing by default.
 *
 * SCOPE — DISPLAY SELECTION ONLY. This governs which book's price a reader is shown. It does NOT
 * change the no-vig consensus that model benchmarks read (a separate founder decision, because it
 * changes outputs), and it NEVER rewrites a price already captured or frozen: historical artifacts
 * stay byte-identical.
 */
export const ELIGIBLE_OPERATORS_POLICY = "eligible-operators@1";

/** Provider keys of operators licensed for online sports wagering in at least one US jurisdiction
 *  (each is on Pennsylvania's licensed online sportsbook list, checked 2026-10-18). */
export const ELIGIBLE_OPERATOR_KEYS = Object.freeze([
  "draftkings",
  "fanduel",
  "betmgm",
  "williamhill_us", // Caesars Sportsbook
  "caesars",
  "betrivers",
  "fanatics",
  "espnbet",
  "betparx",
]);

/** Keys known to be offshore / unlicensed in the US. Listed so a guard can name them; eligibility
 *  never depends on this list (anything absent from ELIGIBLE_OPERATOR_KEYS is already excluded). */
export const KNOWN_OFFSHORE_KEYS = Object.freeze(["bovada", "betonlineag", "mybookieag", "betus", "lowvig", "betanysports"]);

const ELIGIBLE = new Set(ELIGIBLE_OPERATOR_KEYS);

/** True only for a listed operator key. Unknown, empty or non-string keys are not eligible. */
export function isEligibleOperator(key) {
  return typeof key === "string" && ELIGIBLE.has(key.trim().toLowerCase());
}

/**
 * The provider's display titles for eligible books. Some artifacts store the bookmaker TITLE ("BetMGM",
 * "BetOnline.ag") rather than its key — the MLB props board does (`provider: bk.title ?? bk.key`) — so a
 * render-time check has to resolve either. A title not listed here is not eligible (fail-closed).
 */
const ELIGIBLE_TITLES = new Set(["draftkings", "fanduel", "betmgm", "caesars", "betrivers", "fanatics", "espn bet", "betparx"]);

/** True when `label` is an eligible operator's provider key OR display title. Null/unknown → false. */
export function isEligibleProvider(label) {
  if (typeof label !== "string") return false;
  const v = label.trim().toLowerCase();
  return ELIGIBLE.has(v) || ELIGIBLE_TITLES.has(v);
}
