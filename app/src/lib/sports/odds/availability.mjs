/**
 * Odds-lane availability states (Program 167 · Release C) — what /launch renders per sport.
 *
 * One fail-closed classifier from committed evidence to exactly one of the states the handoff
 * names. The precedence is severity-first and every state is an ANSWER (never absence):
 *
 *   SOURCE_ERROR             a capture attempt recorded a provider failure; last-known-good stands
 *   QUARANTINED              a snapshot exists but fails the contract validator
 *   STALE                    a valid snapshot exists but its capture age exceeds the freshness bound
 *   CAPTURED                 a valid, fresh snapshot exists (pre-start where an event is supplied)
 *   AUTHORIZATION_REQUIRED   no snapshot; capture costs credits and NO founder authorization
 *                            receipt exists in repository truth (dry-run readiness reported beside)
 *   DRY_RUN_READY            no snapshot; a credit-free dry run is possible right now (key present)
 *   DISCOVERABLE_ZERO_QUOTA  no snapshot; only the officially-zero-quota discovery surface is
 *                            proven available (requires a committed proof receipt, never assumed)
 *
 * The authorization receipt is a REPOSITORY fact (a committed file path), never a prompt claim —
 * Program 167's own charter says its prompt is not quota authorization.
 */

export const ODDS_AVAILABILITY_VERSION = 1;

export const ODDS_LANE_STATES = Object.freeze([
  "SOURCE_ERROR",
  "QUARANTINED",
  "STALE",
  "CAPTURED",
  "AUTHORIZATION_REQUIRED",
  "DRY_RUN_READY",
  "DISCOVERABLE_ZERO_QUOTA",
]);

/** The exact line to surface when a credit-bearing capture is the blocker. */
export const AUTHORIZATION_REQUIRED_LINE =
  "AUTHORIZATION_REQUIRED: one NFL and one UFC canary, maximum 10 credits total, preserve at least 19,950 of 20,000 monthly credits";

/**
 * @param {{
 *   sport: string,
 *   nowIso: string,
 *   snapshot?: { capturedAt?: string, valid?: boolean, errors?: string[], sourceError?: string|null } | null,
 *   eventStartUtc?: string | null,
 *   freshnessHours?: number,
 *   secretState?: "PRESENT" | "BLOCKED_EXTERNAL" | "CONFIG_INVALID",
 *   authorizationReceiptPath?: string | null,
 *   zeroQuotaDiscoveryProofPath?: string | null,
 * }} input
 */
export function deriveOddsAvailability({
  sport,
  nowIso,
  snapshot = null,
  eventStartUtc = null,
  freshnessHours = 6,
  secretState = "BLOCKED_EXTERNAL",
  authorizationReceiptPath = null,
  zeroQuotaDiscoveryProofPath = null,
}) {
  const now = Date.parse(nowIso ?? "");
  if (!sport || !Number.isFinite(now)) throw new Error("deriveOddsAvailability: sport and nowIso required");

  const detail = { sport, nowIso, freshnessHours };

  if (snapshot) {
    if (snapshot.sourceError) {
      return { state: "SOURCE_ERROR", reason: `capture recorded a provider failure: ${snapshot.sourceError} — last-known-good stands, an outage never becomes an empty market`, ...detail };
    }
    if (snapshot.valid === false) {
      return { state: "QUARANTINED", reason: `snapshot fails the contract validator: ${(snapshot.errors ?? []).slice(0, 3).join("; ") || "unspecified"}`, ...detail };
    }
    const capAt = Date.parse(snapshot.capturedAt ?? "");
    if (!Number.isFinite(capAt)) {
      return { state: "QUARANTINED", reason: "snapshot has no parseable capturedAt — an undated price is not evidence", ...detail };
    }
    const ageHours = (now - capAt) / 3_600_000;
    const start = eventStartUtc ? Date.parse(eventStartUtc) : null;
    if (start != null && capAt > start) {
      return { state: "QUARANTINED", reason: "capturedAt is AFTER event start — post-start capture can never qualify a pre-event artifact", ...detail };
    }
    if (ageHours > freshnessHours) {
      return { state: "STALE", reason: `snapshot age ${ageHours.toFixed(1)}h exceeds the ${freshnessHours}h freshness bound — usable as history, not as a current market`, ageHours: Number(ageHours.toFixed(1)), ...detail };
    }
    return { state: "CAPTURED", reason: `valid snapshot ${ageHours.toFixed(1)}h old${start ? " and pre-start" : ""}`, ageHours: Number(ageHours.toFixed(1)), ...detail };
  }

  if (authorizationReceiptPath) {
    // Authorized but not yet captured: the actionable state is a ready dry-run/capture, keyed on the secret.
    if (secretState === "PRESENT") return { state: "DRY_RUN_READY", reason: `authorization receipt on file (${authorizationReceiptPath}); key present — the guarded canary may run its bounded capture`, ...detail };
    return { state: "AUTHORIZATION_REQUIRED", reason: `authorization receipt on file (${authorizationReceiptPath}) but the key is ${secretState} in this environment — the capture runs where the key lives (CI)`, ...detail };
  }

  if (secretState === "PRESENT") {
    return { state: "AUTHORIZATION_REQUIRED", reason: `${AUTHORIZATION_REQUIRED_LINE} — key present, dry-run available now; the credit-bearing call waits for the receipt`, dryRunReady: true, ...detail };
  }
  if (zeroQuotaDiscoveryProofPath) {
    return { state: "DISCOVERABLE_ZERO_QUOTA", reason: `no key in this environment; the zero-quota discovery surface is proven by ${zeroQuotaDiscoveryProofPath}`, ...detail };
  }
  return { state: "AUTHORIZATION_REQUIRED", reason: `${AUTHORIZATION_REQUIRED_LINE} — no key in this environment (dry-run runs where the key lives) and no committed zero-quota proof`, dryRunReady: false, ...detail };
}
