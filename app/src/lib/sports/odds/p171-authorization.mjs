/**
 * Program 171 odds authorization + cumulative credit ledger (Release D). PRIVATE RESEARCH.
 *
 * The committed founder receipt (docs/receipts/ODDS_AUTHORIZATION_P171.md) is the ONLY thing
 * that can raise the legacy canary defaults: NFL-only scope, a 3,000-credit cumulative ceiling,
 * and NO remaining-balance floor. This module parses that receipt FAIL-CLOSED (a missing or
 * ambiguous term refuses — authorization is never inferred), and keeps the private cumulative
 * ledger every paid call must consult BEFORE spending and append to AFTER the provider answers.
 *
 * Discipline encoded here, enforced at call sites:
 *   - stop BEFORE any call whose worst case would cross the cumulative ceiling;
 *   - a failed-but-charged call still counts (the ledger records what the provider reports);
 *   - provider-verified usage comes from response headers, never from screenshots;
 *   - the ledger never stores the key, the account, or a raw payload.
 */

export const P171_AUTHORIZATION_VERSION = 1;
export const P171_LEDGER_RELPATH = "data/internal/research/odds/nfl/p171-ledger.json";

/** Parse the committed receipt. Fail-closed: every operative term must be present and exact. */
export function parseAuthorizationReceipt(markdown) {
  const errors = [];
  // blockquote markers are markdown formatting, not content — a term split across quoted lines
  // must still be found ("do not retry\n> blindly" is the founder's sentence, verbatim)
  const text = String(markdown ?? "").replace(/^>\s?/gm, "");
  if (!/NFL[- ]only/i.test(text) || !text.includes("`americanfootball_nfl`")) errors.push("scope: NFL-only + americanfootball_nfl key not found");
  const ceilingMatch = text.match(/(?:Cumulative ceiling|cumulative maximum)[^0-9]*?([\d,]+)\s*credits/i);
  const ceiling = ceilingMatch ? Number(ceilingMatch[1].replace(/,/g, "")) : null;
  if (!(ceiling > 0)) errors.push("ceiling: no cumulative credit ceiling found");
  if (!/floor[^|]*\|\s*\*\*NONE/i.test(text) && !/There is no minimum remaining-balance floor/i.test(text)) {
    errors.push("floor: the no-floor term not found — the legacy floor stays in force");
  }
  if (!/do not retry\s+blindly/i.test(text.replace(/\n/g, " "))) errors.push("discipline: no-blind-retry term not found");
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    program: "P171",
    sport: "nfl",
    sportKey: "americanfootball_nfl",
    ceiling,
    floor: 0,
    terms: "NFL-only; preflight, discovery, team ML/spread/total, supported props, anytime TD, evidence-driven pre-start refreshes; no blind retries; stop before the ceiling",
  };
}

/** A fresh ledger (first authorized run creates it). */
export function emptyLedger(receiptPath) {
  return {
    schemaVersion: 1,
    artifact: "nfl-odds-p171-ledger",
    dataClass: "PRIVATE_RESEARCH",
    program: "P171",
    receiptPath,
    openingBalance: null,
    requests: [],
    cumulativeCredits: 0,
  };
}

/** Refuse-before-spend: the one arithmetic every paid call must clear. */
export function assertCallAllowed({ authorization, ledger, worstCaseCredits, purpose }) {
  const errors = [];
  if (!authorization?.ok) errors.push("no valid authorization — the receipt did not parse");
  if (!(worstCaseCredits >= 0)) errors.push("worst-case cost must be computed before the call, never after");
  const cumulative = ledger?.cumulativeCredits ?? 0;
  if (authorization?.ok && cumulative + worstCaseCredits > authorization.ceiling) {
    errors.push(`REFUSED: cumulative ${cumulative} + worst-case ${worstCaseCredits} would cross the ${authorization.ceiling}-credit Program 171 ceiling (${purpose ?? "unlabelled"})`);
  }
  return { ok: errors.length === 0, errors, cumulative, remaining: authorization?.ok ? authorization.ceiling - cumulative : null };
}

/**
 * Append one provider response to the ledger. `headers` is a plain object of the usage headers
 * (x-requests-last / x-requests-used / x-requests-remaining) — parsed here, defaulting a paid
 * call with unreadable headers to cost 1 (never 0: unaccounted spend is the failure mode).
 */
export function recordRequest(ledger, { at, purpose, endpoint, events = null, markets = null, regions = null, status, headers = {}, charged = true }) {
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
  const lastCost = num(headers["x-requests-last"]);
  const creditsUsed = charged ? (lastCost ?? 1) : (lastCost ?? 0);
  const entry = {
    at,
    purpose,
    endpoint: String(endpoint ?? "").replace(/apiKey=[^&]*/i, "apiKey=REDACTED"),
    events,
    markets,
    regions,
    status,
    creditsUsed,
    providerRequestsUsed: num(headers["x-requests-used"]),
    providerRequestsRemaining: num(headers["x-requests-remaining"]),
  };
  return {
    ...ledger,
    requests: [...(ledger.requests ?? []), entry],
    cumulativeCredits: (ledger.cumulativeCredits ?? 0) + creditsUsed,
  };
}

/** Self-scan any artifact string for secret leakage before it is written. */
export function assertNoSecretLeak(payload, secrets) {
  for (const s of secrets ?? []) {
    if (s && s.length >= 8 && payload.includes(s)) return { ok: false, reason: "artifact would contain a secret — write refused" };
  }
  if (/apiKey=(?!REDACTED)[A-Za-z0-9]/.test(payload)) return { ok: false, reason: "artifact contains an unredacted apiKey parameter — write refused" };
  return { ok: true };
}
