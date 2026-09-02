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
 *   product: string,
 *   date: string,
 *   entry: { state: string, reason?: string|null, card?: any[]|null },
 *   settledDay?: { settledAt?: string, source?: string, lanes?: any[] }|null,
 *   settlement?: { ref: string, stamp?: string, results: string[], stepAtSettle?: number }|null,
 *   portfolioLane?: { status?: string, currentStep?: number }|null,
 *   progressionFresh?: boolean,
 *   boardHash?: string|null,
 *   lockAt?: string|null,
 *   policyVersion: string,
 * }} input
 */
/**
 * Reduce the SHARED dated lanes artifact to the general settlement shape.
 *
 * Only lanes belonging to this product and carrying at least one leg count: a lane with no legs is
 * a placeholder row, and grading a product on another product's lane is the cross-ledger identity
 * failure the ledger invariants forbid.
 */
function settlementFromLanes(settledDay, product, date) {
  const lanes = (settledDay?.lanes ?? []).filter((l) => l.product === product && (l.legs?.length ?? 0) > 0);
  if (!lanes.length) return null;
  return {
    ref: `settled/${date}.json@${settledDay.settledAt ?? "unstamped"}`,
    stamp: settledDay.settledAt ?? "lanes",
    results: lanes.map((l) => l.result ?? "pending"),
    stepAtSettle: Math.max(...lanes.map((l) => l.step ?? 0)),
  };
}

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
  /*
   * EACH PRODUCT BRINGS ITS OWN ADAPTER (P230 · F1). Bank Builder and Moonshot are settled by the
   * shared dated lanes artifact; End Zone Vault, Homer Nukes and the sport card ladders are settled
   * by their own records and never appear in those lanes. Reading only `settledDay.lanes` here
   * meant a product outside it could never leave ACTIVE — it would have sat "live" forever while
   * its real settler graded it elsewhere, which is the unfalsifiable-record shape one step removed.
   *
   * `settlement` is the general form: what graded it, and the per-selection results. The lanes
   * shape is reduced to it so the two products already on this path keep byte-identical receipts.
   */
  const settlement = input.settlement ?? settlementFromLanes(settledDay, product, date);
  if (!settlement || !settlement.results.length) return r; // card live, settler has nothing real for it yet
  const results = settlement.results.map((x) => String(x ?? "pending").toLowerCase());
  const settlementRef = settlement.ref;
  const settledStamp = settlement.stamp ?? "unstamped";

  if (results.every((x) => x === "pending")) {
    return advanceProduct(r, "AWAITING_RESULT", { runId: `await:${date}:${settledStamp}`, cardRef });
  }
  r = advanceProduct(r, "AWAITING_RESULT", { runId: `await:${date}:${settledStamp}`, cardRef });
  if (results.some((x) => x === "void")) {
    return advanceProduct(r, "VOIDED", { runId: `settle:${date}:${settledStamp}`, settlementRef });
  }
  /*
   * A CALIBRATION board records its day; it does not win or lose it (P230 · F1). Homer Nukes'
   * ledger holds gradedPicks, predicted, actual and Brier and no stake at all, so choosing one of
   * the two money verdicts would mint an outcome the product never computes — and that verdict
   * would then be summable with the money products' records.
   */
  if (results.includes("recorded")) {
    return advanceProduct(r, "SETTLED_RECORDED", {
      runId: `settle:${date}:${settledStamp}`,
      settlementRef,
      graded: settlement.graded ?? null,
    });
  }
  const lost = results.some((x) => x === "loss" || x === "lost");
  r = advanceProduct(r, lost ? "SETTLED_LOSS" : "SETTLED_WIN", { runId: `settle:${date}:${settledStamp}`, settlementRef });

  // ---- progression: only the ledger owner's CURRENT portfolio, and only while it is fresh -----
  if (!progressionFresh || !portfolioLane) return r; // stale progression evidence stays unclaimed — SETTLED_* is the honest stop
  const progRunId = `prog:${date}:${portfolioLane.currentStep ?? "?"}:${portfolioLane.status ?? "?"}`;
  if (lost) {
    if (portfolioLane.status === "stopped") return advanceProduct(r, "STOPPED", { runId: progRunId, progressionRef: `portfolio:${product}:stopped` });
    if (portfolioLane.currentStep === 1) return advanceProduct(r, "RESTARTED", { runId: progRunId, progressionRef: `portfolio:${product}:restart→step1` });
    return r;
  }
  const laneStepAtSettle = settlement.stepAtSettle ?? 0;
  if ((portfolioLane.currentStep ?? 0) > laneStepAtSettle) {
    return advanceProduct(r, "ADVANCED", { runId: progRunId, progressionRef: `portfolio:${product}:step${laneStepAtSettle}→${portfolioLane.currentStep}` });
  }
  return r;
}
