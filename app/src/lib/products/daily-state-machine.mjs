/**
 * DAILY SIGNATURE-PRODUCT STATE MACHINE (P211 · Release A) — ONE lifecycle contract for Bank
 * Builder and Moonshot. Policies, bankrolls and ledgers stay separate per product; only the
 * mechanics are shared. Pure module: same prior state + same immutable inputs + same clock ⇒ the
 * same output bytes. Illegal transitions THROW; legal-but-unearned states fail closed with a
 * stated reason. Nothing here touches protected money — the machine types the day's truth and the
 * authorised settlement owner remains the only writer of records.
 */

/** The closed state vocabulary, verbatim from the operating contract. */
export const LIFECYCLE_STATES = Object.freeze([
  "EVALUATING",
  "ACTIVE",
  "AWAITING_RESULT",
  "SETTLED_WIN",
  "SETTLED_LOSS",
  "ADVANCED",
  "RESTARTED",
  "NO_PLAY",
  "OFF_SEASON",
  "INCIDENT",
]);

/** Allowed next states. Absence = refusal. Day rollover re-enters EVALUATING from any settled/typed terminal. */
export const LIFECYCLE_TRANSITIONS = Object.freeze({
  EVALUATING: ["ACTIVE", "NO_PLAY", "OFF_SEASON", "INCIDENT"],
  ACTIVE: ["AWAITING_RESULT", "VOIDED", "INCIDENT"],
  AWAITING_RESULT: ["SETTLED_WIN", "SETTLED_LOSS", "VOIDED", "INCIDENT"],
  SETTLED_WIN: ["ADVANCED", "EVALUATING"],
  SETTLED_LOSS: ["RESTARTED", "STOPPED", "EVALUATING"],
  ADVANCED: ["EVALUATING"],
  RESTARTED: ["EVALUATING"],
  NO_PLAY: ["EVALUATING"],
  OFF_SEASON: ["EVALUATING"],
  INCIDENT: ["EVALUATING"],
  /* VOIDED and STOPPED are terminal markers inside a cycle; the next product day re-enters
     EVALUATING through the daily rollover, which is a NEW receipt, not a transition edge. */
  VOIDED: ["EVALUATING"],
  STOPPED: ["EVALUATING"],
});

/** Evidence each state must carry to be entered at all — a state without its receipt fails closed. */
const REQUIRED_EVIDENCE = Object.freeze({
  ACTIVE: ["cardRef", "lockAt"],
  AWAITING_RESULT: ["cardRef"],
  SETTLED_WIN: ["settlementRef"],
  SETTLED_LOSS: ["settlementRef"],
  VOIDED: ["settlementRef"],
  ADVANCED: ["progressionRef", "policyVersion"],
  RESTARTED: ["progressionRef", "policyVersion"],
  NO_PLAY: ["reason"],
  OFF_SEASON: ["reason"],
  INCIDENT: ["incidentRef"],
  STOPPED: ["progressionRef"],
});

/**
 * A fresh daily receipt: the product day opens EVALUATING.
 * @param {{ product: "bank-builder"|"moonshot", productDate: string, priorState?: string|null, runId: string, policyVersion: string }} init
 */
export function openProductDay({ product, productDate, priorState, runId, policyVersion }) {
  if (!product || !productDate || !runId || !policyVersion) {
    throw new Error("state-machine: product, productDate, runId and policyVersion are required");
  }
  return Object.freeze({
    product,
    productDate,
    state: "EVALUATING",
    prior: priorState ?? null,
    runId,
    policyVersion,
    /* The day's policy version is evidence from the start — ADVANCED/RESTARTED require it, and the
       receipt opened under it. */
    evidence: { policyVersion },
    transitions: [{ to: "EVALUATING", runId }],
  });
}

/**
 * Advance the product. Illegal transitions throw; missing evidence fails closed to INCIDENT with
 * a stated reason (an unearned state must never present as healthy). Duplicate runIds are
 * idempotent no-ops: re-running a completed step returns the same receipt, never a second card or
 * a doubled exposure.
 * @param {any} receipt @param {string} next @param {{ runId: string } & Record<string, any>} patch
 */
export function advanceProduct(receipt, next, patch) {
  if (!patch?.runId) throw new Error("state-machine: every transition carries its runId");
  if (receipt.transitions.some((t) => t.runId === patch.runId)) {
    return receipt; // idempotent: this run already applied
  }
  const allowed = LIFECYCLE_TRANSITIONS[receipt.state] ?? [];
  if (!allowed.includes(next)) {
    throw new Error(`state-machine: illegal transition ${receipt.state} → ${next} (${receipt.product} ${receipt.productDate})`);
  }
  const { runId, ...evidence } = patch;
  const merged = { ...receipt.evidence, ...evidence };
  const missing = (REQUIRED_EVIDENCE[next] ?? []).filter((k) => merged[k] == null);
  if (missing.length) {
    return Object.freeze({
      ...receipt,
      state: "INCIDENT",
      evidence: { ...merged, incidentRef: `unearned:${next}:missing:${missing.join(",")}` },
      transitions: [...receipt.transitions, { to: "INCIDENT", runId, reason: `unearned ${next}` }],
    });
  }
  return Object.freeze({
    ...receipt,
    state: next,
    evidence: merged,
    transitions: [...receipt.transitions, { to: next, runId }],
  });
}

/**
 * The single-writer lease. A run may mutate the product day only while it holds the lock; a stale
 * lease expires ONLY past its stated ttl. Deterministic: pass the clock in.
 * @param {{ owner: string|null, acquiredAtMs: number|null, ttlMs: number }} lock
 */
export function acquireLease(lock, owner, nowMs) {
  if (lock.owner && lock.acquiredAtMs != null && nowMs - lock.acquiredAtMs < lock.ttlMs) {
    return lock.owner === owner
      ? { ...lock, acquiredAtMs: nowMs } // re-entrant renewal for the same owner
      : null; // held by another writer — refuse, never race
  }
  return { owner, acquiredAtMs: nowMs, ttlMs: lock.ttlMs };
}

/**
 * Watchdog over a day's receipts. Pure: alerts derive from receipts + the injected clock only.
 * @param {any[]} receipts @param {number} nowMs
 */
export function productWatchdog(receipts, nowMs, opts = {}) {
  const staleActiveMs = opts.staleActiveMs ?? 12 * 3600_000;
  const awaitingMs = opts.awaitingMs ?? 24 * 3600_000;
  const alerts = [];
  const byProduct = new Map(receipts.map((r) => [r.product, r]));
  for (const product of ["bank-builder", "moonshot"]) {
    const r = byProduct.get(product);
    if (!r) { alerts.push({ product, kind: "MISSING_DAILY_EVALUATION", detail: "no receipt for the product day" }); continue; }
    if (r.state === "ACTIVE" && r.evidence.lockAt && nowMs - Date.parse(r.evidence.lockAt) > staleActiveMs) {
      alerts.push({ product, kind: "STALE_ACTIVE_CARD", detail: `locked ${r.evidence.lockAt}, still ACTIVE` });
    }
    if (r.state === "AWAITING_RESULT" && r.evidence.lockAt && nowMs - Date.parse(r.evidence.lockAt) > awaitingMs) {
      alerts.push({ product, kind: "RESULT_BEYOND_WINDOW", detail: `awaiting since ${r.evidence.lockAt}` });
    }
    if (r.state === "INCIDENT") {
      alerts.push({ product, kind: "INCIDENT_OPEN", detail: String(r.evidence.incidentRef ?? "unspecified") });
    }
  }
  return alerts;
}
