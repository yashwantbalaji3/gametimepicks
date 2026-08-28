/**
 * THE TEN-ROW WORKSTREAM REGISTER (Program 217).
 *
 * The control plane for the program's own scope. Committed data, not narration: each row carries a
 * disposition, its dependencies, the evidence it started from, the executable test that would close
 * it, and — once shipped — the commit that did.
 *
 * WHY IT IS DATA. A program that reports its own progress in prose can always find a sentence that
 * sounds finished. Five dispositions, one acceptance test each, and a guard that refuses a SHIPPED
 * row without a commit is what makes "ten closed" a claim the repository can check rather than one
 * the author can assert.
 *
 * DISPOSITIONS
 *   SHIPPED           — closed in this program, with a commit and production receipt.
 *   ALREADY_PROVEN    — closed before this program, re-verified here with current evidence.
 *   REALITY_GATED     — blocked on an event that has not happened; the event is named exactly.
 *   FOUNDER_GATED     — blocked on a decision only the founder can make; the token is named.
 *   PARTIAL           — real, production-proven progress that does NOT meet the row's acceptance.
 *                       Counts as open for classification: a partial row is an unfinished row, and
 *                       the only reason it exists as its own state is that "open" would throw away
 *                       the evidence of what is already live.
 *   ENGINEERING_OPEN  — executable now, not yet done. The honest default.
 *
 * A row may not sit in REALITY_GATED or FOUNDER_GATED because a DIFFERENT row is blocked. Gates are
 * per-row facts about that row's own acceptance event.
 */

export const DISPOSITIONS = ["SHIPPED", "ALREADY_PROVEN", "PARTIAL", "REALITY_GATED", "FOUNDER_GATED", "ENGINEERING_OPEN"];

/** @type {ReadonlyArray<{id:number,name:string,dependsOn:number[],disposition:string,startedFrom:string,acceptance:string,commit:string|null,note:string|null}>} */
export const WORKSTREAMS = Object.freeze([
  {
    id: 1,
    name: "Shared date/sport controls",
    dependsOn: [],
    disposition: "PARTIAL",
    commitEvidence: "34f8d3f88",
    startedFrom:
      "P216 R-A1 shipped the URL owner (lib/nav/date-sport-route) and migrated six hand-built date links to it. The CONTROLS over that owner do not exist: /simulate has its own inline prev/next/picker, and Today, Picks, Parlay Center and the sport hubs have no date control at all.",
    acceptance:
      "One shared control family renders over surfaceHref() on every surface the registry marks date- or sport-capable; a guard proves no surface builds its own; selected date and sport survive refresh, direct entry and back/forward.",
    commit: null,
    note:
      "PARTIAL. The family exists (components/nav/date-sport-controls) and both DATE-CAPABLE surfaces are migrated: /simulate (P217 R-A, SSR parity proven) and /results/date/[date] (P218 R-A, which also gained an 81-option picker it never had — prev/next alone meant reaching a date three weeks back took three weeks of clicks). NOT closed: the today-only surfaces (Today, Picks, Parlay Center) carry no sport control yet, and /today's TopReadsFilter already writes the same `?sport=` key from a panel-scoped filter, so adopting there needs that conflict resolved rather than a second writer added. /projections remains a registered shrink-only exception — it keeps date AND sport in the query string, so closing it needs a `query` date mode on the owner plus re-verification of its four-step interactive experience.",
  },
  {
    id: 2,
    name: "Cross-surface truth reconciliation",
    dependsOn: [1],
    disposition: "ENGINEERING_OPEN",
    startedFrom:
      "P214's cross-surface-reconciliation.test.mjs covers the homepage hero against the /simulate day view and the product-day owner — three assertions over two surfaces. Picks, Parlay Center, Results and the four sport hubs are not compared to anything.",
    acceptance:
      "A pure reconciliation artifact keyed by date and sport compares canonical id, start, state, revision and readiness per event and scheduled/priced/modelled/ready/missing/started/settled in aggregate, across every named surface; synthetic corruption proves each detector fires.",
    commit: null,
    note: null,
  },
  {
    id: 3,
    name: "Bank Builder + Moonshot daily lifecycle",
    dependsOn: [7],
    disposition: "ENGINEERING_OPEN",
    startedFrom:
      "Both products have committed ledgers that reconcile (P216 R-C: 46 Bank Builder entries, 7 Moonshot results, zero contradictions). The seven-stage lifecycle — settle, transition, inventory, select, freeze, publish, monitor — is not one owner and has no typed failure state per stage.",
    acceptance:
      "One idempotent daily lifecycle per product with a typed failure at every stage; every day resolves to ACTIVE, NO_PLAY/NO_INVENTORY, PENDING_RESULT or INCIDENT; fixtures prove win-advance, loss-reset, push, no-play, correction and missed-run recovery.",
    commit: null,
    note: null,
  },
  {
    id: 4,
    name: "Shared UI shells and content cleanup",
    dependsOn: [1],
    disposition: "ENGINEERING_OPEN",
    startedFrom:
      "P214 identified the eight component families (PageHeader, CurrentState, PrimaryActions, DateSportControls, EmptyState, Disclosure, NextStep, DataCard) and migrated none. Two raw-image exceptions remain against the shrink-only identity ratchet.",
    acceptance:
      "Families migrated one at a time with rendered parity proven before the old implementation is removed; duplication and raw-image ratchets shrink-only and guard-pinned; no page carries contradictory or repeated public labels.",
    commit: null,
    note: null,
  },
  {
    id: 5,
    name: "Stateful interaction inventory",
    dependsOn: [1, 4],
    disposition: "ENGINEERING_OPEN",
    startedFrom:
      "Static href integrity is guarded (P214 built-link-integrity: zero dead internal destinations across 290 exported pages). No inventory records what a control DOES — destination, resulting state, accessible name, per browser.",
    acceptance:
      "A deterministic machine-readable inventory of every stateful control that reconciles to the route/component tree; every high-value journey passes on three engines; zero P0/P1 findings remain.",
    commit: null,
    note: null,
  },
  {
    id: 6,
    name: "Responsive, a11y and performance matrix",
    dependsOn: [4, 5],
    disposition: "ENGINEERING_OPEN",
    startedFrom:
      "A two-layer a11y gate runs in CI over nine launch-critical routes, and P214 R-CD proved a sport×state scene matrix on three engines. The six-width × three-engine × named-state matrix over the full route set has never been run.",
    acceptance:
      "390/430/768/1024/1280/1440 on Chromium, Firefox and WebKit across the named states and routes, with route budgets for JS, images, layout shift and interaction, tied to the deployed SHA.",
    commit: null,
    note: null,
  },
  {
    id: 7,
    name: "Forecast-of-record and product eligibility",
    dependsOn: [],
    disposition: "PARTIAL",
    commitEvidence: "34f8d3f88",
    note:
      "PARTIAL. P217 R-A closed one class at one producer: build-risk-ladder now refuses a leg it cannot identify BEFORE scoring, and today's ladder carries zero legs without a settlement identity (production-proven at e9eab1411). NOT closed: the seven-evidence-group leg contract does not exist, and the other producers — optimizer, suggested cards, mixed cards, Bank Builder, Moonshot, custom-builder seeding — have not been traced to one eligibility owner.",
    startedFrom:
      "Per-sport eligibility exists in scattered owners (lab-eligibility.mjs, nfl product-eligibility, the MLB pre-event boundary from P215 R-A1). There is no single leg contract binding identity, forecast revision, price, freshness, lock and settlement key together, and no corruption suite over it.",
    acceptance:
      "One pure selector for the latest valid pre-start forecast; every eligible leg carries all seven evidence groups; post-start, stale-price, unsupported-family, missing-revision, duplicate-settlement-key and research-leak each fail closed with a stated reason.",
    commit: null,
    note: null,
  },
  {
    id: 8,
    name: "Four risk tiers and mixed-sport cards",
    dependsOn: [7],
    disposition: "ENGINEERING_OPEN",
    startedFrom:
      "The four-tier grid exists as a policy (P-parlay tier grid) and the lab ledger carries byTier records for MLB/UFC/EPL plus a multi stream. Tier assignment is not a versioned policy over confidence/leg-count/variance/freshness/conflict, and NO_QUALIFIED_CARD is not uniformly typed.",
    acceptance:
      "Versioned tier policy; at most one canonical card per sport/tier/date with deterministic tie-breaking and preserved rejection reasons; generated + refused reconciles to the expected matrix; corruption proves no weak, started, stale or duplicate leg can force a tier.",
    commit: null,
    note: null,
  },
  {
    id: 9,
    name: "Sport-horizon operation",
    dependsOn: [1, 2, 7],
    disposition: "ENGINEERING_OPEN",
    startedFrom:
      "P215 recovered all four horizons and P216 closed the UFC acquisition/transform split. Each sport's scheduled = modelled + typed non-modelled identity is asserted in its own place (MLB board coverage, UFC card coverage, publication SLO per sport) but never as one contract across the four.",
    acceptance:
      "For each sport, scheduled = modelled + typed non-modelled/quarantined with priced and frozen reconciling independently; the natural horizon is navigable and agrees across surfaces; two cadence receipts where reality permits, else the exact next run recorded.",
    commit: null,
    note: null,
  },
  {
    id: 10,
    name: "Protected admin command center",
    dependsOn: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    disposition: "ENGINEERING_OPEN",
    startedFrom:
      "/launch already renders executive health, the daily-product ops panel, forward coverage, the publication SLO's inputs, closure packets, runbooks and — from P216 R-C — five-ledger health. The sport × stage matrix demanded here (schedule through settlement, every cell with state, freshness, owner, blocker, evidence) does not exist as one table.",
    acceptance:
      "One MLB/NFL/EPL/UFC × stage matrix where missing source is UNKNOWN and never green; SLO panels for publication and daily products; tasks, sprints and roadmap derived from this register; public export proven free of the console and its data.",
    commit: null,
    note: null,
  },
]);

/** Rows whose acceptance is executable right now — nothing else is blocking them. */
export function executableNow(rows = WORKSTREAMS) {
  const closed = new Set(rows.filter((r) => r.disposition === "SHIPPED" || r.disposition === "ALREADY_PROVEN").map((r) => r.id));
  return rows.filter(
    (r) => (r.disposition === "ENGINEERING_OPEN" || r.disposition === "PARTIAL") && r.dependsOn.every((d) => closed.has(d)),
  );
}

/** The program's classification, derived rather than declared. */
export function programClassification(rows = WORKSTREAMS) {
  // PARTIAL counts as open. It records evidence, it does not confer completion.
  const open = rows.filter((r) => r.disposition === "ENGINEERING_OPEN" || r.disposition === "PARTIAL");
  return open.length ? "MATERIAL_PROGRESS" : "PROGRAM_217_COMPLETE";
}

/** Counts for the console, by disposition. */
export function dispositionCounts(rows = WORKSTREAMS) {
  const out = Object.fromEntries(DISPOSITIONS.map((d) => [d, 0]));
  for (const r of rows) out[r.disposition] = (out[r.disposition] ?? 0) + 1;
  return out;
}
