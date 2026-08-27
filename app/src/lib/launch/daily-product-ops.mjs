/**
 * DAILY PRODUCT OPERATIONS + FORWARD COVERAGE (P211 · Release F) — the /launch panels' pure
 * builders. Both render the newest dated artifact their ONE writer produced, verbatim: no state is
 * computed here, no tile can be hand-set, and a missing artifact is typed as the finding rather
 * than rendered as an empty green.
 *
 *   daily receipt      scripts/products/build-daily-product-receipts.mjs (lifecycle + watchdog)
 *   forward coverage   scripts/products/build-forward-coverage.mjs
 */
import fs from "node:fs";
import path from "node:path";

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const newestDated = (dir) => {
  try {
    const f = fs.readdirSync(dir).filter((n) => /^\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort().at(-1);
    return f ? readJson(path.join(dir, f)) : null;
  } catch { return null; }
};

/** The Bank Builder / Moonshot operations table, from the newest daily receipt. */
export function buildDailyProductOps({ appDir }) {
  const receipt = newestDated(path.join(appDir, "..", "data/internal/products/receipts"));
  if (!receipt) {
    return { present: false, finding: "no daily product receipt exists — MISSING_DAILY_EVALUATION for every signature product" };
  }
  const products = (receipt.products ?? [])
    .filter((p) => p.lifecycle)
    .map((p) => {
      const lastTransition = p.lifecycle.transitions?.at(-1) ?? null;
      return {
        product: p.product,
        label: p.label,
        state: p.lifecycle.state,
        policyVersion: p.lifecycle.policyVersion,
        evaluated: p.candidatesEvaluated ?? 0,
        rejected: (p.rejections ?? []).length,
        reason: p.reason ?? null,
        exposure: (p.card ?? []).reduce((s, c) => s + (Number(c.exposure) || 0), 0),
        lockAt: p.lifecycle.evidence?.lockAt ?? null,
        lastTransition: lastTransition ? `${lastTransition.to} (${lastTransition.runId})` : null,
        incident: p.lifecycle.evidence?.incidentRef ?? null,
      };
    });
  return {
    present: true,
    date: receipt.date,
    generatedAt: receipt.generatedAt,
    products,
    watchdog: receipt.watchdog ?? [],
    lifecycleStates: receipt.lifecycleStates ?? [],
  };
}

/** The per-sport forward-coverage table, from the newest coverage artifact. */
export function buildForwardCoveragePanel({ appDir }) {
  const cov = newestDated(path.join(appDir, "..", "data/internal/products/forward-coverage"));
  if (!cov) {
    return { present: false, finding: "no forward-coverage artifact exists — run the daily-products workflow (or its dry-run form) to derive one" };
  }
  return {
    present: true,
    date: cov.date,
    generatedAt: cov.generatedAt,
    sports: (cov.sports ?? []).map((s) => ({
      sport: s.sport,
      state: s.state,
      counts: s.counts,
      findings: s.findings ?? [],
      reason: s.reason ?? null,
    })),
  };
}
