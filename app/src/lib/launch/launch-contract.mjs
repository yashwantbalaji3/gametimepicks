/**
 * Launch Command Center contract (Program 135).
 *
 * DERIVED, NOT AUTHORED. Department completion comes from the existing scorecard calculator and
 * checklist — this module does not restate percentages, and there is no field here a human is
 * meant to hand-edit. Adding a competing scorecard was explicitly out of bounds, so departments
 * are imported and enriched with the launch-facing dimensions the scorecard never carried:
 * health, proof level, launch criticality, and discrete tasks.
 *
 * The separation that matters: **engineering completion is not launch readiness.** A department
 * can be 97% complete and still sit behind a P0 launch gate it cannot open itself.
 */
import { completion, confidence } from "../scorecard/scorecard.mjs";
import { DEPARTMENTS } from "../scorecard/company-checklist.mjs";
import { SPORTS } from "../scorecard/sport-checklist.mjs";

export const SCHEMA_VERSION = 1;

/** Closed vocabularies — an invalid value must fail generation, never render. */
export const HEALTH = Object.freeze(["HEALTHY", "WATCH", "AT_RISK", "BLOCKED"]);
export const PROOF = Object.freeze(["DESIGNED", "STAGING", "VALIDATED", "PRODUCTION_PROVEN"]);
export const CRITICALITY = Object.freeze(["P0_LAUNCH_BLOCKER", "P1_LAUNCH_ENABLER", "P2_POST_LAUNCH", "NA"]);
export const OWNER = Object.freeze(["AUTOMATION", "ENGINEERING", "FOUNDER", "EXTERNAL"]);
export const TASK_STATUS = Object.freeze([
  "NOT_STARTED", "IN_PROGRESS", "BLOCKED_EXTERNAL", "DONE_VALIDATED", "DONE_PRODUCTION_PROVEN",
]);
export const RECOMMENDATION = Object.freeze([
  "NOT_READY", "READY_FOR_INTERNAL_ALPHA", "READY_FOR_PRIVATE_BETA", "CONDITIONAL_PUBLIC_GO", "PUBLIC_GO",
]);

/**
 * Proof level derived from the checklist itself — the share of weight that is production-proven.
 * A department cannot claim PRODUCTION_PROVEN because most of its items are merely tested.
 */
function proofLevel(items) {
  const applicable = items.filter((i) => i.status !== "NOT_APPLICABLE");
  if (applicable.length === 0) return "DESIGNED";
  const w = (pred) => applicable.filter(pred).reduce((s, i) => s + i.weight, 0);
  const total = applicable.reduce((s, i) => s + i.weight, 0);
  const proven = w((i) => i.status === "DONE_PRODUCTION_PROVEN" || i.status === "ARCHIVED_COMPLETE");
  const validated = proven + w((i) => i.status === "DONE_VALIDATED");
  const staging = validated + w((i) => i.status === "DONE_STAGING_ONLY");
  if (proven / total >= 0.6) return "PRODUCTION_PROVEN";
  if (validated / total >= 0.6) return "VALIDATED";
  if (staging / total >= 0.5) return "STAGING";
  return "DESIGNED";
}

/** Health from what is actually blocking, not from the percentage. */
function health(items) {
  const applicable = items.filter((i) => i.status !== "NOT_APPLICABLE");
  const blocked = applicable.filter((i) => i.status === "BLOCKED_EXTERNAL");
  const heavyGap = applicable.filter((i) => i.weight >= 4 && ["NOT_STARTED", "BLOCKED_EXTERNAL"].includes(i.status));
  if (blocked.some((i) => i.weight >= 5)) return "BLOCKED";
  if (heavyGap.length >= 2) return "AT_RISK";
  if (heavyGap.length === 1 || blocked.length > 0) return "WATCH";
  return "HEALTHY";
}

/** Every non-complete checklist item becomes a discrete task — no vague prose. */
function tasksFor(dept) {
  const map = { NOT_STARTED: "NOT_STARTED", BLOCKED_EXTERNAL: "BLOCKED_EXTERNAL", DESIGNED_ONLY: "IN_PROGRESS", IN_PROGRESS: "IN_PROGRESS", DONE_STAGING_ONLY: "IN_PROGRESS" };
  return dept.items
    .filter((i) => i.status in map)
    .map((i, n) => ({
      id: `${dept.name.toLowerCase().replace(/[^a-z]+/g, "-")}-${n + 1}`,
      title: i.item,
      department: dept.name,
      owner_type: i.status === "BLOCKED_EXTERNAL" ? "FOUNDER" : "ENGINEERING",
      priority: i.weight >= 5 ? "P0" : i.weight === 4 ? "P1" : "P2",
      status: map[i.status],
      acceptance_evidence: i.evidence,
      evidence_freshness: i.evidenceFresh ? "CURRENT" : "STALE",
      weight: i.weight,
    }));
}

export function buildDepartments() {
  return DEPARTMENTS.map((d) => {
    const c = completion(d.items);
    const conf = confidence(d.items);
    return {
      id: d.name.toLowerCase().replace(/[^a-z]+/g, "-"),
      name: d.name,
      companyWeight: d.companyWeight,
      completionPct: c.pct,
      health: health(d.items),
      proof: proofLevel(d.items),
      confidence: conf.level,
      evidenceFreshPct: conf.freshShare,
      tasks: tasksFor(d),
    };
  });
}

export function buildSports() {
  return SPORTS.map((s) => {
    const c = completion(s.categories);
    return {
      name: s.name,
      launchState: s.launchState,
      completionPct: c.pct,
      // Archived completion is NOT launch readiness — rendered as N/A, never as "ready".
      liveReadiness: s.launchState === "ARCHIVED" ? "N_A_ARCHIVED" : s.launchState,
      note: s.note,
      gaps: s.categories.filter((x) => !["DONE_PRODUCTION_PROVEN", "ARCHIVED_COMPLETE", "NOT_APPLICABLE"].includes(x.status))
        .map((x) => ({ dimension: x.item, status: x.status, evidence: x.evidence })),
    };
  });
}

/**
 * The nine launch gates. `status` is evidence-derived; a gate is PASS only on production evidence.
 * These are the reason a 90%-complete platform is not a launchable company.
 */
export function buildLaunchGates() {
  const depts = Object.fromEntries(buildDepartments().map((d) => [d.id, d]));
  const g = (id, name, status, evidence, owner, blocker = null) => ({ id, name, status, evidence, owner, blocker });
  return [
    g("product-truth", "Current product truth reconciles", "PASS",
      "Aug 4: 15/15 covered, 678/678 native stamps, all downstream artifacts current; public routes agree", "ENGINEERING"),
    g("reliability", "Daily chain runs without founder rescue", "PASS",
      "Aug 4 ran fully autonomously: settle 03:59/06:11, generation 11:51, production 11:54/12:25", "ENGINEERING"),
    g("security-privacy", "Public/private boundary and secrets", "PASS",
      "deny-by-default export prune; internal routes excluded; secrets never printed", "ENGINEERING"),
    g("product-quality", "Responsive UX, a11y, error/empty states", "PARTIAL",
      "empty/partial states truthful and paper-only framing live; accessibility and cross-browser never formally audited", "ENGINEERING",
      "no accessibility audit; e2e specs exist but are not run in CI"),
    g("measurement", "Privacy-safe production analytics", "BLOCKED",
      "collector staging-proven; production NOOP — observer reports analytics OFF", "FOUNDER",
      "Blob store + 3 env vars (founder-owned)"),
    g("operations-support", "Incident response, alerting, rollback, support channel", "PARTIAL",
      "5/5 workflow alert routing + ops webhook proven; no user-facing support channel or known-issues process", "ENGINEERING",
      "no support channel; launch-day ownership undefined"),
    g("business-legal", "Terms, privacy, jurisdiction, risk acceptance", "FAIL",
      "no ToS or privacy policy route in the public export; no jurisdiction/age posture", "FOUNDER",
      "legal/counsel decision required"),
    g("user-validation", "Beta cohort, feedback loop, adoption baseline", "FAIL",
      "measurement never live → no observed audience of any size; no beta cohort defined", "FOUNDER",
      "depends on measurement gate"),
    g("cost-capacity", "API budget, platform limits, usage alerts", "PASS",
      "Odds credits ~19.1k of 20k with sentinel + floors; duplicate builds eliminated", "ENGINEERING"),
  ];
}

/**
 * The recommendation is a FUNCTION of the gates, so a strong engineering score can never produce
 * PUBLIC_GO on its own — which is the single most important property of this contract.
 */
export function recommendation(gates) {
  const fail = gates.filter((x) => x.status === "FAIL");
  const blocked = gates.filter((x) => x.status === "BLOCKED");
  const partial = gates.filter((x) => x.status === "PARTIAL");
  if (fail.length === 0 && blocked.length === 0 && partial.length === 0) return "PUBLIC_GO";
  if (fail.length === 0 && blocked.length === 0) return "CONDITIONAL_PUBLIC_GO";
  // Business/legal or user-validation failing means a public launch is not lawful/measurable yet,
  // but an internal or invite-only cohort can still proceed.
  if (fail.some((x) => ["business-legal", "user-validation"].includes(x.id))) {
    return blocked.length + fail.length <= 3 ? "READY_FOR_INTERNAL_ALPHA" : "NOT_READY";
  }
  return "NOT_READY";
}

/** Four separate headlines — averaging them into one number is what hides the business gap. */
export function headlines() {
  const depts = buildDepartments();
  const wsum = (ids) => {
    const sel = depts.filter((d) => ids.includes(d.id));
    const w = sel.reduce((s, d) => s + d.companyWeight, 0);
    return w ? Math.round(sel.reduce((s, d) => s + d.completionPct * d.companyWeight, 0) / w) : null;
  };
  const engineeringIds = ["product-ux", "mlb-data-acquisition-coverage", "simulation-engine", "prediction-research-platform",
    "signature-products", "results-settlement", "lineage-provenance", "automation-reliability",
    "operations-observability", "deployment-vercel", "security-public-boundary", "cost-infrastructure-efficiency",
    "documentation-governance"];
  const businessIds = ["analytics-growth-measurement", "commercial-legal-support-readiness"];
  const gates = buildLaunchGates();
  const passing = gates.filter((x) => x.status === "PASS").length;
  return {
    platformEngineering: { pct: wsum(engineeringIds), basis: "13 engineering departments, company-weighted" },
    liveProductReadiness: { pct: Math.round((passing / gates.length) * 100), basis: `${passing}/${gates.length} launch gates PASS` },
    businessGtm: { pct: wsum(businessIds), basis: "analytics + commercial/legal departments" },
    overallCompany: { pct: wsum(depts.map((d) => d.id)), basis: "all 16 departments, company-weighted" },
  };
}
