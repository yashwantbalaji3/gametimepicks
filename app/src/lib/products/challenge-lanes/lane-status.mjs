/**
 * BANK BUILDER / MOONSHOT — LANE STATUS (site slice, 2026-11-09). The website's reading of the canonical lane
 * projections (public/data/challenge-lanes/<lane>.json, written by the engine's single writer and verified by its
 * public reader). Presentation only: every number is the projection's own. No price, no stake, no new card.
 *
 *   - the CURRENT run is doc.current.runId; any earlier run is listed with its own terminal status and is never shown
 *     active (a retired / superseded run cannot read as the lane's state);
 *   - bankroll is shown only when the projection publishes it; a price-derived bankroll the projection withholds
 *     (trackedBankrollWithheld) reads "not in the public record", never a guess;
 *   - settled step history is the current run's days: W / L from stepOutcome; a day without one is not settled;
 *   - next card: in play → "card in play"; a lost or retired lane → its state; otherwise "no card frozen";
 *   - the chain head sha the projection carries rides into the page data, so the page can be checked against the
 *     engine and the graphics (one head everywhere).
 * Pure.
 */
const usd = (c) => (typeof c === "number" && Number.isFinite(c) ? `$${(c / 100).toLocaleString("en-US", c % 100 ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { maximumFractionDigits: 0 })}` : null);
const OUTCOME = Object.freeze({ WIN: "W", LOSS: "L" });
const TERMINAL = new Set(["LOST", "RETIRED", "COMPLETED", "FINISHED SHORT"]);
/* Reader words for the projection's public status (the code itself stays in the page data, not the visible text). */
const STATUS_TEXT = Object.freeze({ ACTIVE: "In play", WON: "Step won", LOST: "Lost", HELD: "Held", RETIRED: "Retired", COMPLETED: "Completed", "FINISHED SHORT": "Finished short", AWAITING: "Awaiting a card" });
/* "bbm-rules@2" → "Rules v2": a versioned internal id is not reader text. */
export const rulesText = (v) => (typeof v === "string" && /@(\d+)$/.test(v) ? `Rules v${v.match(/@(\d+)$/)[1]}` : null);

/** @param {any} doc a verified projection (gtp.challenge-lane.public@1) */
export function laneStatusView(doc) {
  const cur = doc.current ?? {};
  const run = (doc.runs ?? []).find((r) => r.runId === cur.runId) ?? null;
  if (!run) throw new Error(`laneStatusView: ${doc.laneId} has no run ${cur.runId}`);
  const status = cur.publicStatus ?? run.publicStatus ?? null;
  const bankroll = typeof cur.trackedBankrollCents === "number" ? usd(cur.trackedBankrollCents) : null;
  const history = (run.days ?? []).map((d) => ({ date: d.date, step: d.step, result: OUTCOME[d.stepOutcome] ?? null }));
  return {
    laneId: doc.laneId, product: doc.product, slot: doc.slot, laneTypeLabel: doc.laneTypeLabel ?? null,
    runId: cur.runId, ruleVersion: cur.ruleVersion ?? run.ruleVersion ?? null,
    status, statusText: STATUS_TEXT[status] ?? (status ? String(status).toLowerCase() : null), statusReason: cur.statusReason ?? null,
    rulesText: rulesText(cur.ruleVersion ?? run.ruleVersion ?? null),
    step: cur.step ?? null, steps: doc.steps, stepText: cur.stepText ?? null, stepsWon: run.stepsWon ?? 0,
    base: usd(doc.baseCents), target: usd(doc.targetCents),
    bankroll, bankrollNote: bankroll ? null : cur.trackedBankrollWithheld ? "not in the public record (price-derived)" : "not published",
    history,
    settled: history.filter((h) => h.result).length,
    nextCard: cur.inPlay ? "Card in play" : status === "LOST" ? "Lane lost — no card; a new run needs approval" : TERMINAL.has(status) ? `Lane ${String(status).toLowerCase()} — no card` : "No card frozen",
    earlierRuns: (doc.runs ?? []).filter((r) => r.runId !== cur.runId).map((r) => ({ runId: r.runId, status: r.publicStatus ?? r.status, statusText: STATUS_TEXT[r.publicStatus] ?? String(r.publicStatus ?? r.status).toLowerCase(), reason: r.statusReason ?? null })),
    headSha256: doc.chainHeadSha256 ?? cur.headSha256 ?? null,
    contentSha256: doc.contentSha256 ?? null,
    label: doc.label ?? null,
  };
}
