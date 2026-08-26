/**
 * DAILY LIFECYCLE DERIVATION (P211 · Release A) — the pure bridge from the canonical authorities
 * to the closed lifecycle vocabulary. It re-implements NO policy: the evaluation entry arrives
 * verbatim from the live activation authority (the P172 receipt writer's own productEntry), the
 * settlement day arrives verbatim from the official settler's dated artifact, progression arrives
 * from the ledger owner's published portfolio. This module only TYPES what those authorities
 * already decided, through the state machine — so an unearned state cannot be minted here either.
 *
 * Three vocabularies now exist on purpose, each owning a different question:
 *   product-state.mjs (P140)            is THIS ARTIFACT fresh enough to present?   (freshness)
 *   build-daily-product-receipts (P172) what did TODAY'S EVALUATION decide?         (operational)
 *   daily-state-machine (P211)          where is the PRODUCT DAY in its lifecycle?  (lifecycle)
 *
 * Determinism: every runId derives from the input artifacts' own stamps/hashes, so replaying the
 * same day over the same artifacts lands on identical receipt bytes (the machine's missed-run
 * fixture is the contract). No wall clock is read here — stamps come from the artifacts.
 */
import { openProductDay, advanceProduct } from "./daily-state-machine.mjs";

/**
 * @param {{
 *   product: "bank-builder"|"moonshot",
 *   date: string,
 *   entry: { state: string, reason?: string|null, card?: any[]|null },
 *   settledDay?: { settledAt?: string, source?: string, lanes?: any[] }|null,
 *   portfolioLane?: { status?: string, currentStep?: number }|null,
 *   progressionFresh?: boolean,
 *   boardHash?: string|null,
 *   lockAt?: string|null,
 *   policyVersion: string,
 * }} input
 */
export function deriveLifecycle(input) {
  const { product, date, entry, settledDay, portfolioLane, progressionFresh, boardHash, lockAt, policyVersion } = input;
  let r = openProductDay({ product, productDate: date, priorState: input.priorState ?? null, runId: `open:${product}:${date}`, policyVersion });

  // ---- the evaluation authority's verdict, verbatim -------------------------------------------
  if (entry.state === "NO_PLAY") {
    return advanceProduct(r, "NO_PLAY", { runId: `eval:${date}:${boardHash ?? "no-board"}`, reason: entry.reason ?? "no reason recorded" });
  }
  if (entry.state === "OFF_SEASON") {
    return advanceProduct(r, "OFF_SEASON", { runId: `eval:${date}:off-season`, reason: entry.reason ?? "off-season by the league's own schedule" });
  }
  if (entry.state !== "ACTIVE") {
    // INPUTS_MISSING / NOT_RUN / STALE / INCIDENT — operational gaps, never product decisions.
    return advanceProduct(r, "INCIDENT", { runId: `eval:${date}:${entry.state}`, incidentRef: `${entry.state}: ${entry.reason ?? "no reason recorded"}` });
  }

  // ---- ACTIVE: a card qualified under the live policy -----------------------------------------
  const cardRef = (entry.card ?? []).map((c) => c.id ?? c.cardId ?? "card").join("+") || `card:${date}`;
  r = advanceProduct(r, "ACTIVE", { runId: `gen:${date}:${boardHash ?? "board"}`, cardRef, lockAt: lockAt ?? null });
  if (r.state === "INCIDENT") return r; // no lock stamp = an unearned ACTIVE; the machine already failed it closed

  // ---- the settlement authority: only its dated artifact moves the day past ACTIVE ------------
  const settledLanes = (settledDay?.lanes ?? []).filter((l) => l.product === product && (l.legs?.length ?? 0) > 0);
  if (!settledLanes.length) return r; // card live, settler has nothing real for it yet
  const results = settledLanes.map((l) => String(l.result ?? "pending").toLowerCase());
  const settlementRef = `settled/${date}.json@${settledDay.settledAt ?? "unstamped"}`;

  if (results.every((x) => x === "pending")) {
    return advanceProduct(r, "AWAITING_RESULT", { runId: `await:${date}:${settledDay.settledAt ?? "lanes"}`, cardRef });
  }
  r = advanceProduct(r, "AWAITING_RESULT", { runId: `await:${date}:${settledDay.settledAt ?? "lanes"}`, cardRef });
  if (results.some((x) => x === "void")) {
    return advanceProduct(r, "VOIDED", { runId: `settle:${date}:${settledDay.settledAt}`, settlementRef });
  }
  const lost = results.some((x) => x === "loss" || x === "lost");
  r = advanceProduct(r, lost ? "SETTLED_LOSS" : "SETTLED_WIN", { runId: `settle:${date}:${settledDay.settledAt}`, settlementRef });

  // ---- progression: only the ledger owner's CURRENT portfolio, and only while it is fresh -----
  if (!progressionFresh || !portfolioLane) return r; // stale progression evidence stays unclaimed — SETTLED_* is the honest stop
  const progRunId = `prog:${date}:${portfolioLane.currentStep ?? "?"}:${portfolioLane.status ?? "?"}`;
  if (lost) {
    if (portfolioLane.status === "stopped") return advanceProduct(r, "STOPPED", { runId: progRunId, progressionRef: `portfolio:${product}:stopped` });
    if (portfolioLane.currentStep === 1) return advanceProduct(r, "RESTARTED", { runId: progRunId, progressionRef: `portfolio:${product}:restart→step1` });
    return r;
  }
  const laneStepAtSettle = Math.max(...settledLanes.map((l) => l.step ?? 0));
  if ((portfolioLane.currentStep ?? 0) > laneStepAtSettle) {
    return advanceProduct(r, "ADVANCED", { runId: progRunId, progressionRef: `portfolio:${product}:step${laneStepAtSettle}→${portfolioLane.currentStep}` });
  }
  return r;
}
