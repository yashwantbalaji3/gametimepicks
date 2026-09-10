/**
 * OUTBOUND REDACTION — one owner for the only free-form field that leaves this repository.
 *
 * WHY THIS EXISTS. scripts/ops_alert.sh has carried these rules since Program 069, with a proof
 * beside it (scripts/ops_alert_test.sh) asserting that an alert redacts paths, key-shaped tokens
 * and hashes before it is POSTed. That proof also asserted that no workflow hand-rolls its own
 * alert payload — and P253 found it had been FAILING, unnoticed, because nothing ran it: the shell
 * suites in scripts/ were wired into no gate, no CI job and no workflow.
 *
 * The failure was half false positive and half real. The check looked for workflows naming
 * `ops_alert.sh`, and auto-refresh and publication-watchdog reach their alert through a composite
 * action instead — so the heuristic was wrong. But that action calls a SECOND sender,
 * app/scripts/ops-notify.mjs, which POSTs its `--message` to the webhook verbatim with no
 * redaction of any kind. Two senders, one contract, one of them enforcing it.
 *
 * Neither message observed today carries a secret; both are built from artifact fields. That is not
 * the property worth relying on. The contract exists because an outbound free-form string is one
 * refactor away from carrying anything, and the whole point of Program 069 was that what an alert
 * must NOT contain matters as much as what it must.
 *
 * So the rules move here, both senders use them, and the guard is rebased from "which script is
 * named" to the invariant it was always about: every path that can POST to OPS_WEBHOOK_URL redacts
 * first.
 *
 * THE RULES ARE DELIBERATELY BLUNT. `<redacted>` on a 24-character token will sometimes eat a long
 * legitimate identifier, and that is the correct trade: an over-redacted alert is annoying, an
 * under-redacted one is a leak, and the run URL in the same payload is where an operator goes for
 * detail anyway.
 */

/** Hard cap on the free-form field. A stack trace is not an alert. */
export const OUTBOUND_MAX_CHARS = 200;

/**
 * Redact one free-form line for external delivery.
 *
 * Order matters: paths are stripped before token-shaped matching, so a path segment cannot survive
 * as a "token" and a redacted path cannot then be re-matched into something unreadable.
 */
export function redactOutbound(input) {
  const first = String(input ?? "").trim().split(/\r?\n/)[0] ?? "";
  const redacted = first
    // local filesystem paths
    .replace(/\/(?:Users|home|root)\/[^\s"]*/g, "<path>")
    // CI checkout paths (matched after the general rule for the same reason ops_alert.sh does)
    .replace(/\/home\/runner\/work\/[^\s"]*/g, "<path>")
    // key-shaped tokens
    .replace(/\b[A-Za-z0-9_-]{24,}\b/g, "<redacted>")
    // hashes, including the protected md5s this repo guards
    .replace(/\b[0-9a-f]{32,}\b/g, "<redacted>")
    // explicit secret-bearing parameters
    .replace(/(apiKey|api_key|token|secret|password)=\S+/gi, "$1=<redacted>");
  return redacted.slice(0, OUTBOUND_MAX_CHARS);
}
