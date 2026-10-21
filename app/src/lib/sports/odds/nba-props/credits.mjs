/**
 * NBA PROP PRICES · ODDS-CREDIT ACCOUNTING. Pure: plans, worst cases and a ledger shape. Spends nothing.
 *
 * DOCUMENTED COSTING (The Odds API v4 guide, https://the-odds-api.com/liveapi/guides/v4/, read 2026-10-21):
 *   GET /v4/sports/{sport}/events                  "does not count against the usage quota"          → 0
 *   GET /v4/sports/{sport}/events/{eventId}/odds   "[number of unique markets returned] x [number of regions specified]";
 *                                                  "Responses with empty data do not count towards the usage quota."
 *   GET /v4/sports/{sport}/odds                    "[number of markets specified] x [number of regions specified]";
 *                                                  "Every group of 10 bookmakers is the equivalent of 1 region";
 *                                                  when both are given "`bookmakers` takes priority".
 *   Headers  x-requests-remaining · x-requests-used · x-requests-last ("The usage cost of the last API call").
 *
 *   ⚠ The guide states the 10-bookmakers-per-region rule on /odds and says event-odds takes the same parameters, but
 *   does not restate the rule for event-odds. The worst case below therefore uses the LARGER of the two readings
 *   (regions listed, or ceil(bookmakers / 10)) — never the cheaper one. The provider's own x-requests-last header is
 *   the only spend figure the ledger trusts after a call.
 *
 * COMMITTED EVIDENCE that matches the formula: app/public/data/nba/market-probe-latest.json (2026-06-10) — each
 * single-market event-odds probe on one region moved `used` by exactly 1, and the empty `player_turnovers` probe
 * moved it by 0.
 *
 * Player props are event-scoped ("Player props can be accessed one event at a time using the /events/{eventId}/odds
 * endpoint" — https://the-odds-api.com/sports-odds-data/betting-markets.html), so an NBA prop slate costs, at worst,
 * events × markets × region-units.
 */
import { PROVIDER, PROVIDER_SPORT_KEY, POINTS_FIRST_SCOPE, FAMILY_BY_MARKET_KEY } from "./contract.mjs";

export const CREDIT_LEDGER_SCHEMA = "gtp.odds.credit-ledger@1";
export const COSTING_SOURCE = "https://the-odds-api.com/liveapi/guides/v4/#usage-quota-costs";

/** Region-units a request is charged for: regions listed, or one per started group of 10 bookmakers — the larger. */
export function regionUnits({ regions = [], bookmakers = [] } = {}) {
  const byRegions = (regions ?? []).length;
  const byBooks = (bookmakers ?? []).length ? Math.ceil(bookmakers.length / 10) : 0;
  return Math.max(byRegions, byBooks);
}

/** Worst-case cost of ONE event-odds call: every requested market comes back non-empty. */
export const eventOddsWorstCase = ({ markets = [], regions = [], bookmakers = [] } = {}) => new Set(markets).size * regionUnits({ regions, bookmakers });

/** Documented cost of ONE event-odds call AFTER the fact: unique markets actually returned × region-units; empty → 0. */
export function eventOddsCostFromResponse(body, { regions = [], bookmakers = [] } = {}) {
  const returned = new Set();
  for (const bk of body?.bookmakers ?? []) for (const mk of bk?.markets ?? []) if ((mk?.outcomes ?? []).length) returned.add(mk.key);
  return { uniqueMarketsReturned: returned.size, regionUnits: regionUnits({ regions, bookmakers }), credits: returned.size * regionUnits({ regions, bookmakers }) };
}

/**
 * A capture plan: free events call, then one event-odds call per event in window. Points first: the default scope is
 * player_points only; a wider scope must be a prefix-respecting list of known NBA prop keys.
 */
export function planNbaPropCapture({ eventIds = [], markets = POINTS_FIRST_SCOPE, regions = [], bookmakers = [] } = {}) {
  const unknown = markets.filter((m) => !FAMILY_BY_MARKET_KEY[m]);
  if (unknown.length) return { ok: false, reason: `unknown NBA prop market key(s): ${unknown.join(", ")}` };
  if (!regions.length && !bookmakers.length) return { ok: false, reason: "a plan names regions or bookmakers — the provider charges by one of them" };
  const perEvent = eventOddsWorstCase({ markets, regions, bookmakers });
  const calls = [
    { endpoint: `/v4/sports/${PROVIDER_SPORT_KEY}/events`, eventId: null, markets: [], worstCaseCredits: 0 },
    ...eventIds.map((id) => ({ endpoint: `/v4/sports/${PROVIDER_SPORT_KEY}/events/{eventId}/odds`, eventId: String(id), markets: [...markets], worstCaseCredits: perEvent })),
  ];
  return {
    ok: true,
    provider: PROVIDER,
    sportKey: PROVIDER_SPORT_KEY,
    markets: [...markets],
    regions: [...regions],
    bookmakers: [...bookmakers],
    regionUnits: regionUnits({ regions, bookmakers }),
    calls,
    worstCaseCredits: calls.reduce((a, c) => a + c.worstCaseCredits, 0),
    costingSource: COSTING_SOURCE,
  };
}

/** An empty ledger for one sport + receipt. Never holds the key, the account, or a payload. */
export function emptyCreditLedger({ receiptPath = null, ceiling = 0 } = {}) {
  return { schema: CREDIT_LEDGER_SCHEMA, provider: PROVIDER, sportKey: PROVIDER_SPORT_KEY, receiptPath, ceiling, entries: [], cumulativeCredits: 0 };
}

/** May a call with this worst case be made? Stops BEFORE a call that could cross the ceiling. */
export function assertWithinCeiling(ledger, worstCaseCredits) {
  if (!(ledger?.ceiling > 0)) return { allowed: false, reason: "no authorized ceiling — zero credits may be spent" };
  const after = (ledger.cumulativeCredits ?? 0) + worstCaseCredits;
  return after > ledger.ceiling
    ? { allowed: false, reason: `worst case ${worstCaseCredits} would take the ledger to ${after} > ceiling ${ledger.ceiling}` }
    : { allowed: true, reason: null };
}

/**
 * Append one call. The charged figure is the provider's x-requests-last header when present (a failed-but-charged
 * call still counts); the documented formula is recorded beside it so a disagreement is visible, never reconciled
 * silently.
 */
export function recordCall(ledger, { at, endpoint, eventId = null, markets = [], regionUnits: ru, status, headers = {}, documentedCredits = null }) {
  const last = Number(headers["x-requests-last"]);
  const charged = Number.isFinite(last) ? last : documentedCredits ?? 0;
  const entry = {
    at, endpoint, eventId, markets: [...markets], regionUnits: ru ?? null, status,
    documentedCredits, providerLast: Number.isFinite(last) ? last : null,
    providerUsed: Number.isFinite(Number(headers["x-requests-used"])) ? Number(headers["x-requests-used"]) : null,
    providerRemaining: Number.isFinite(Number(headers["x-requests-remaining"])) ? Number(headers["x-requests-remaining"]) : null,
    charged,
    disagreement: Number.isFinite(last) && documentedCredits != null && last !== documentedCredits,
  };
  return { ...ledger, entries: [...ledger.entries, entry], cumulativeCredits: (ledger.cumulativeCredits ?? 0) + charged };
}

/**
 * Parse an NBA player-prop authorization receipt. FAIL-CLOSED: every term must be present, or nothing is authorized.
 * Required: "NBA player props only" scope, the `basketball_nba` key, the prop market keys named in backticks, an
 * "Effective cumulative ceiling: N credits" line, a ceiling-only expiry, "do not retry blindly", and an
 * "Approved by: <founder>" line with an ISO date. No such receipt exists in the repository today.
 */
export function parseNbaPropsReceipt(markdown) {
  const text = String(markdown ?? "").replace(/^>\s?/gm, "");
  const errors = [];
  if (!/NBA player props only/i.test(text) || !text.includes("`basketball_nba`")) errors.push("scope: must say 'NBA player props only' and name `basketball_nba`");
  for (const other of ["americanfootball_nfl", "soccer_epl", "mma_mixed_martial_arts", "baseball_mlb"]) if (text.includes(`\`${other}\``)) errors.push(`scope: names \`${other}\` — one receipt authorizes one sport`);
  const markets = [...text.matchAll(/`(player_[a-z_]+)`/g)].map((m) => m[1]).filter((k) => FAMILY_BY_MARKET_KEY[k]);
  if (!markets.length) errors.push("markets: no NBA prop market key named");
  const c = text.match(/Effective cumulative ceiling[^0-9]*?([\d,]+)\s*credits/i);
  const ceiling = c ? Number(c[1].replace(/,/g, "")) : null;
  if (!(ceiling > 0)) errors.push("ceiling: no 'Effective cumulative ceiling: N credits' line");
  const expiry = text.match(/^\|\s*Expiry\s*\|(.+?)\|\s*$/mi);
  if (!expiry) errors.push("expiry: no Expiry row");
  else if (/\bProgram\s+\d+\s+close\b/i.test(expiry[1])) errors.push("expiry: program-scoped expiry cannot be verified from the receipt");
  if (!/do not retry\s+blindly/i.test(text.replace(/\n/g, " "))) errors.push("discipline: no 'do not retry blindly' term");
  if (!/Approved by:\s*\S+.*\b\d{4}-\d{2}-\d{2}\b/i.test(text)) errors.push("approval: no 'Approved by: <name> <YYYY-MM-DD>' line");
  return errors.length ? { ok: false, errors } : { ok: true, ceiling, markets: [...new Set(markets)] };
}
