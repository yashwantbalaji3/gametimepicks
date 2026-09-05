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

/** Each authorized sport keeps its OWN cumulative ledger — one ceiling must never fund another. */
export const LEDGER_RELPATH = {
  nfl: P171_LEDGER_RELPATH,
  ufc: "data/internal/research/odds/ufc/authorization-ledger.json",
  epl: "data/internal/research/odds/epl/authorization-ledger.json",
};

/**
 * The sports a committed receipt can authorize, and what its scope terms must literally say.
 *
 * A receipt is only ever read against ONE of these. That is the point: a UFC receipt cannot widen
 * the NFL allowance and an NFL receipt cannot buy a fight card, because the parser is told which
 * sport it is validating and refuses a receipt whose scope names a different one.
 */
export const AUTHORIZED_SPORTS = {
  nfl: { sportKey: "americanfootball_nfl", scopeRe: /NFL[- ]only/i },
  ufc: { sportKey: "mma_mixed_martial_arts", scopeRe: /UFC[- /]?(?:\/\s*MMA[- ])?only|MMA[- ]only/i },
  epl: { sportKey: "soccer_epl", scopeRe: /Premier League only|EPL[- ]only/i },
};

/**
 * Parse a committed receipt for ONE named sport. Fail-closed in both directions.
 *
 * "Fail-closed in both directions" is the load-bearing part. A missing term refuses, as before —
 * but so does a receipt whose scope names a sport OTHER than the one being asked about. Without
 * that second check a second receipt on disk would silently satisfy the first sport's gate, and the
 * whole guarantee ("this ceiling funds this sport") would be worth nothing.
 *
 * @param {string} markdown the receipt as committed
 * @param {string} sport    which allowance is being validated — must be a key of AUTHORIZED_SPORTS
 */
export function parseSportAuthorizationReceipt(markdown, sport) {
  const spec = AUTHORIZED_SPORTS[sport];
  if (!spec) return { ok: false, errors: [`no authorization is defined for "${sport}"`] };

  const errors = [];
  // blockquote markers are markdown formatting, not content
  const text = String(markdown ?? "").replace(/^>\s?/gm, "");

  if (!spec.scopeRe.test(text) || !text.includes(`\`${spec.sportKey}\``)) {
    errors.push(`scope: this receipt does not restrict itself to ${sport} + \`${spec.sportKey}\``);
  }
  // A receipt naming ANOTHER authorized sport key cannot be read as covering this one.
  for (const [other, o] of Object.entries(AUTHORIZED_SPORTS)) {
    if (other !== sport && text.includes(`\`${o.sportKey}\``)) {
      errors.push(`scope: this receipt also names \`${o.sportKey}\` — one receipt authorizes one sport`);
    }
  }
  const ceilingMatch = text.match(/(?:Cumulative ceiling|cumulative maximum)[^0-9]*?([\d,]+)\s*credits/i);
  const ceiling = ceilingMatch ? Number(ceilingMatch[1].replace(/,/g, "")) : null;
  if (!(ceiling > 0)) errors.push("ceiling: no cumulative credit ceiling found");
  if (!/do not retry\s+blindly/i.test(text.replace(/\n/g, " "))) errors.push("discipline: no-blind-retry term not found");

  /*
   * THE EXPIRY TERM WAS READ BY NOBODY.
   *
   * Scope and ceiling were both enforced; the expiry row was parsed by nothing. The NFL receipt says
   * "Program 171 close OR the 3,000-credit cumulative ceiling, whichever first" — two conditions, of
   * which only the numeric one was ever checked. Program 171 closed long ago, and a scheduled
   * credit-bearing job has gone on citing that receipt since, most recently spending three credits
   * on 2026-08-29. The ceiling was never in danger (69 of 3,000); the OTHER half of the founder's
   * own sentence simply had no code behind it.
   *
   * A program-scoped expiry cannot be evaluated from the receipt alone — nothing in the text says
   * whether that program is still open, and inferring it from a session's own name would be the
   * script deciding its own authorization. So it fails closed and names the decision, which is what
   * an expiry the holder cannot verify should do.
   */
  const expiry = expiryTerm(text);
  if (expiry.kind === "PROGRAM_SCOPED") {
    errors.push(
      `expiry: this receipt expires at ${expiry.programCloseCondition} and nothing here can confirm that program is still open — a renewal is required before another paid call (${expiry.raw})`,
    );
  } else if (expiry.kind === "UNKNOWN") {
    errors.push("expiry: no expiry term found — a receipt without one cannot be shown to be current");
  }

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    sport,
    sportKey: spec.sportKey,
    ceiling,
    floor: 0,
    expiry,
    ledgerRelPath: LEDGER_RELPATH[sport] ?? null,
  };
}

/**
 * Classify a receipt's expiry term.
 *
 * CEILING_ONLY   the allowance runs until its own credit ceiling — self-evaluating, and current for
 *                as long as the ledger says so. UFC and EPL are both written this way.
 * PROGRAM_SCOPED it also expires when a named program closes. That is a fact about the world, not
 *                about this file, so the receipt cannot establish it and the parser refuses.
 * UNKNOWN        no expiry row at all.
 */
export function expiryTerm(receiptText) {
  const text = String(receiptText ?? "").replace(/^>\s?/gm, "");
  const row = text.match(/^\|\s*Expiry\s*\|(.+?)\|\s*$/mi);
  if (!row) return { kind: "UNKNOWN", raw: null };
  const raw = row[1].trim();
  const program = raw.match(/\b(Program\s+\d+)\s+close\b/i);
  if (program) return { kind: "PROGRAM_SCOPED", programCloseCondition: program[1], raw };
  if (/ceiling/i.test(raw)) return { kind: "CEILING_ONLY", raw };
  return { kind: "UNKNOWN", raw };
}

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

  /*
   * THE SAME EXPIRY TERM, ENFORCED HERE TOO.
   *
   * The comment below records that ONE allowance covered Programs 171 and 172 under a single
   * receipt. It is now Program 235, and the receipt's own expiry row — "Program 171 close OR the
   * 3,000-credit cumulative ceiling, whichever first" — has never had code behind its first half.
   * The allowance stayed inside its ceiling throughout (69 of 3,000), so nothing overspent; the
   * founder's stated end condition was simply unread.
   *
   * Whether that program is still open is a fact this file cannot establish, so it refuses and names
   * the renewal. Enforcing only the half that is convenient to check is how a circuit breaker
   * becomes a formality.
   */
  const expiry = expiryTerm(text);
  if (expiry.kind === "PROGRAM_SCOPED") {
    errors.push(
      `expiry: this receipt expires at ${expiry.programCloseCondition} close and nothing here can confirm that program is still open — a renewal is required before another paid call`,
    );
  } else if (expiry.kind === "UNKNOWN") {
    errors.push("expiry: no expiry term found — a receipt without one cannot be shown to be current");
  }

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    expiry,
    // ONE allowance, not one per program: Program 172 continues under the SAME committed receipt,
    // so the ledger's cumulative total spans 171 and 172 and the ceiling is never re-issued.
    program: "P171-172",
    coveredPrograms: ["P171", "P172"],
    sport: "nfl",
    sportKey: "americanfootball_nfl",
    ceiling,
    floor: 0,
    terms: "NFL-only; preflight, discovery, team ML/spread/total, supported props, anytime TD, evidence-driven pre-start refreshes; no blind retries; stop before the cumulative ceiling",
  };
}

/**
 * Result classes for a provider response (Program 172 · Release D). These must never collapse
 * into one "failed" bucket: each implies a different next action, and treating a NO_MARKET as an
 * outage (or a 429 as an auth problem) is how a lane either spins or gives up wrongly.
 */
export function classifyProviderResult({ status, body }) {
  if (status === 401 || status === 403) return { class: "AUTHORIZATION_FAILED", retryable: false, action: "credential/config problem — stop and report; never retry blindly" };
  if (status === 429) return { class: "RATE_OR_CREDIT_LIMITED", retryable: false, action: "provider is throttling or the plan is exhausted — stop, re-read usage headers, do not spend again this window" };
  if (status >= 500) return { class: "PROVIDER_INCIDENT", retryable: false, action: "provider-side incident — preserve last-known-good as STALE, never overwrite with an empty slate" };
  if (status === 200 && Array.isArray(body) && body.length === 0) return { class: "NO_MARKET", retryable: false, action: "the provider genuinely offers nothing here — absence is evidence, not a retry target" };
  if (status === 200 && body == null) return { class: "QUARANTINED", retryable: false, action: "a 200 whose body will not parse is a contradiction — quarantine, never guess" };
  if (status === 200) return { class: "OK", retryable: false, action: "consume" };
  return { class: "QUARANTINED", retryable: false, action: `unmodelled status ${status} — quarantine rather than assume` };
}

/**
 * Duplicate-request circuit breaker: the same fingerprint inside its freshness window is refused,
 * so a re-run of the chain cannot re-buy prices it already holds.
 */
export function isDuplicateRequest(ledger, { fingerprint, nowIso, freshnessMinutes = 30 }) {
  const now = Date.parse(nowIso);
  for (const r of ledger?.requests ?? []) {
    if (r.fingerprint !== fingerprint) continue;
    if (!r.creditsUsed) continue; // a free call is not a purchase worth blocking
    const age = (now - Date.parse(r.at)) / 60000;
    if (age >= 0 && age < freshnessMinutes) {
      return { duplicate: true, reason: `identical request bought ${age.toFixed(1)}m ago (< ${freshnessMinutes}m freshness window) — refusing to re-buy`, priorAt: r.at };
    }
  }
  return { duplicate: false };
}

/** A fresh ledger (first authorized run creates it). */
export function emptyLedger(receiptPath, { sport = "nfl", program = "P171" } = {}) {
  return {
    schemaVersion: 1,
    // Named for the sport it funds. A ledger labelled "nfl" holding UFC spend would make the one
    // guarantee this file exists to give — this ceiling funds this sport — unreadable after the fact.
    artifact: `${sport}-odds-authorization-ledger`,
    dataClass: "PRIVATE_RESEARCH",
    sport,
    program,
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
export function recordRequest(ledger, { at, purpose, endpoint, events = null, markets = null, regions = null, status, headers = {}, charged = true, fingerprint = null, resultClass = null }) {
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
    resultClass,
    fingerprint,
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
