/**
 * NFL PROP SETTLEMENT SUPPORT — derived from the settlement LEDGER, never from a workflow file (Session 9 · B10).
 *
 * ⚠ THE OLD DERIVATION WAS VACUOUS. `nfl-boards.mjs` called a family SCHEDULED_UNPROVEN whenever any workflow
 * file *mentioned* the ledger script — and the only files that did were a disabled workflow and a
 * dispatch-only one. "Scheduled" was false, and PROVEN was unreachable: it was keyed on graded-picks.json
 * labels the prop ledger never emits.
 *
 *   PROVEN              the canonical ledger (data/internal/nfl/prop-settlement/) holds at least one row of
 *                       this family that is CANONICAL (its reconciliation window closed), OBSERVED (a real
 *                       final stat), GRADED against the frozen pregame market (a line result exists), and
 *                       ADMITTED BY A CI RUN (`admittedBy.runId`) — i.e. the automated owner path settled
 *                       it end to end. A local run admits rows with `admittedBy: null` and proves nothing.
 *   SCHEDULED_UNPROVEN  no such row yet, but a workflow with a `schedule:` trigger runs BOTH the post-final
 *                       sweep (`capture-live-props.mjs --post-final`) and the ledger fold
 *                       (`settle-nfl-live-props.mjs --write`).
 *   UNSUPPORTED         neither.
 *
 * Workflow existence is never proof: only ledger evidence reaches PROVEN.
 */
import fs from "node:fs";
import path from "node:path";

export const SUPPORT = Object.freeze({ PROVEN: "PROVEN", SCHEDULED_UNPROVEN: "SCHEDULED_UNPROVEN", UNSUPPORTED: "UNSUPPORTED" });
const GRADED = new Set(["OVER", "UNDER", "PUSH", "YES", "NO"]);

/** Does this ledger row prove its family's settlement path? */
export function provesSettlement(row) {
  return row?.finality === "CANONICAL"
    && row?.measurementState === "OBSERVED"
    && GRADED.has(row?.lineResult)
    && row?.frozen != null
    && Boolean(row?.admittedBy?.runId);
}

/** Is the post-final settlement actually SCHEDULED (not merely mentioned) in this workflow text? */
export function schedulesPostFinalSettlement(workflowText) {
  const t = String(workflowText ?? "");
  // Line-anchored, so a commented-out `# schedule:` or a cron inside a comment cannot count.
  const scheduled = /^on:\s*$/m.test(t) && /^ {2}schedule:\s*$/m.test(t) && /^ +- cron: *"/m.test(t);
  const sweep = /capture-live-props\.mjs[^\n]*--post-final/.test(t);
  const fold = /settle-nfl-live-props\.mjs[^\n]*--write/.test(t);
  return scheduled && sweep && fold;
}

/**
 * @param {{ ledgerRows: object[], workflowTexts: string[] }} o
 * @returns {{ supportFor: (family: string) => string, provenFamilies: string[], scheduled: boolean, evidence: Record<string, object> }}
 */
export function deriveSettlementSupport({ ledgerRows = [], workflowTexts = [] } = {}) {
  const evidence = {};
  for (const r of ledgerRows) {
    if (!provesSettlement(r)) continue;
    const e = (evidence[r.family] ??= { rows: 0, firstSettlementId: r.settlementId, runId: r.admittedBy.runId });
    e.rows += 1;
  }
  const scheduled = workflowTexts.some(schedulesPostFinalSettlement);
  return {
    supportFor: (family) => (evidence[family] ? SUPPORT.PROVEN : scheduled ? SUPPORT.SCHEDULED_UNPROVEN : SUPPORT.UNSUPPORTED),
    provenFamilies: Object.keys(evidence).sort(),
    scheduled,
    evidence,
  };
}

/** Read the committed ledger rows and workflow texts. */
export function readSettlementSupport({ ledgerDir, workflowsDir }) {
  const ledgerRows = [];
  if (ledgerDir && fs.existsSync(ledgerDir)) {
    for (const f of fs.readdirSync(ledgerDir).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x)).sort()) {
      try { ledgerRows.push(...(JSON.parse(fs.readFileSync(path.join(ledgerDir, f), "utf8")).rows ?? [])); } catch { /* unreadable: proves nothing */ }
    }
  }
  const workflowTexts = workflowsDir && fs.existsSync(workflowsDir)
    ? fs.readdirSync(workflowsDir).filter((f) => /\.ya?ml$/.test(f)).map((f) => fs.readFileSync(path.join(workflowsDir, f), "utf8"))
    : [];
  return deriveSettlementSupport({ ledgerRows, workflowTexts });
}
