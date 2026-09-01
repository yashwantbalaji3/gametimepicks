/**
 * END ZONE VAULT UNDER THE SHARED LIFECYCLE — Program 230 · F1, first migration.
 *
 * Run: npx tsx --test src/lib/products/end-zone-vault-lifecycle.test.mjs
 *
 * The Vault was PARTIAL missing only `lifecycle`, and it already had the other five mechanics. What
 * it lacked was a receipt on its quiet days. `build-end-zone-vault.mjs` lived inside a workflow step
 * gated on `events != '0'`, so in exactly the windows where "no upcoming NFL event" IS the
 * evaluation, it never ran — and the ledger went silent rather than recording the refusal.
 *
 * nfl-event-window reported SUCCESS nine times between 2026-08-30 and 2026-09-01. The Vault ledger
 * gained an entry on none of them. No failed run object exists to find, which is what makes this
 * class hard: the absence of a receipt was the only evidence, and nothing was looking for it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { deriveLifecycle } from "./daily-lifecycle-derive.mjs";
import { productWatchdog } from "./daily-state-machine.mjs";
import { PRODUCT_REGISTRY } from "./lifecycle-registry.mjs";

const DATE = "2026-09-01";
const base = { product: "end-zone-vault", date: DATE, policyVersion: "end-zone-vault@1" };

/** The receipt writer's own adapter, reproduced from the Vault's ledger entry shape. */
const vaultSettlement = (entry) => {
  if (!entry?.settlement || entry.settlement === "NOT_APPLICABLE") return null;
  return {
    ref: `end-zone-vault/ledger.json@${entry.date}`,
    stamp: entry.date,
    results: entry.settlement === "PENDING_OFFICIAL_RESULT" ? ["pending"] : [String(entry.settlement).toLowerCase()],
    stepAtSettle: 0,
  };
};

test("the Vault is a registered member with its own ledger", () => {
  const p = PRODUCT_REGISTRY.get("end-zone-vault");
  assert.ok(p, "registered");
  assert.equal(p.ledger, "data/internal/nfl/end-zone-vault/ledger.json");

  /* Its own record, shared with nothing — the registry refuses two products on one ledger, and this
     is the assertion that the Vault is not quietly recorded inside Bank Builder's. */
  const others = PRODUCT_REGISTRY.ids.filter((id) => id !== "end-zone-vault").map((id) => PRODUCT_REGISTRY.get(id).ledger);
  assert.ok(!others.includes(p.ledger));
});

test("A QUIET DAY IS A REFUSAL, NOT AN OUTAGE — and the watchdog stays quiet for it", () => {
  /*
   * The state the workflow gate was preventing the Vault from reaching. "No upcoming NFL event in
   * this window" is a product decision with a named reason; it must be recorded, not skipped.
   */
  const entry = { date: DATE, state: "NO_PLAY", legs: [], settlement: "NOT_APPLICABLE",
    reasons: ["no upcoming NFL event in this window to evaluate"] };
  const lc = deriveLifecycle({
    ...base,
    entry: { state: "NO_PLAY", reason: entry.reasons.join(" · ") },
    settlement: vaultSettlement(entry),
  });
  assert.equal(lc.state, "NO_PLAY");
  assert.match(lc.evidence.reason, /no upcoming NFL event/);
  assert.deepEqual(productWatchdog([lc], Date.parse(`${DATE}T23:00:00Z`), { products: ["end-zone-vault"] }), []);
});

test("A MISSING RECEIPT IS AN INCIDENT — the failure that produced no failed run object", () => {
  /*
   * The nine successful runs. With no ledger entry the receipt writer reports NOT_RUN, and the
   * lifecycle must refuse to call that a product decision: an operational gap and a considered hold
   * both leave the page empty, and before this they were indistinguishable.
   */
  const lc = deriveLifecycle({
    ...base,
    entry: { state: "NOT_RUN", reason: `the Vault ledger holds no entry for ${DATE}` },
    settlement: null,
  });
  assert.equal(lc.state, "INCIDENT");
  assert.match(lc.evidence.incidentRef, /NOT_RUN/);

  const alerts = productWatchdog([lc], Date.parse(`${DATE}T23:00:00Z`), { products: ["end-zone-vault"] });
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].kind, "INCIDENT_OPEN");
});

test("and a slot that produced NOTHING AT ALL still alarms", () => {
  /* Not merely a receipt saying NOT_RUN — no receipt whatsoever, which is what a skipped workflow
     step actually leaves behind. The watchdog must not need a row to notice a missing row. */
  const alerts = productWatchdog([], 0, { products: ["end-zone-vault"] });
  assert.deepEqual(alerts.map((a) => a.kind), ["MISSING_DAILY_EVALUATION"]);
});

test("the Vault is graded by ITS OWN ledger, never by the shared lanes artifact", () => {
  /*
   * Cross-ledger contamination, refused at the adapter. The Vault never appears in the Bank
   * Builder/Moonshot lanes; had it been left reading them it would have sat ACTIVE forever while its
   * real settler graded elsewhere — a published card with no reachable result.
   */
  const foreignLanes = { settledAt: `${DATE}T06:00:00Z`, lanes: [
    { product: "bank-builder", step: 3, result: "win", legs: [{ id: "x" }] },
  ] };
  const lc = deriveLifecycle({
    ...base,
    entry: { state: "ACTIVE", card: [{ id: "vault-card" }] },
    lockAt: `${DATE}T17:00:00Z`,
    settledDay: foreignLanes,
    settlement: vaultSettlement({ date: DATE, settlement: "PENDING_OFFICIAL_RESULT" }),
  });
  assert.equal(lc.state, "AWAITING_RESULT", "another product's win must not settle this one");
  /* And no settlement reference is minted yet: `settlementRef` is recorded only when a real result
     lands, so an unsettled day carries none rather than borrowing the foreign lane's. */
  assert.equal(lc.evidence.settlementRef, undefined);

  /* When the Vault's OWN settler does resolve the day, the reference points at its ledger. */
  const settled = deriveLifecycle({
    ...base,
    entry: { state: "ACTIVE", card: [{ id: "vault-card" }] },
    lockAt: `${DATE}T17:00:00Z`,
    settledDay: foreignLanes,
    settlement: vaultSettlement({ date: DATE, settlement: "WON" }),
  });
  assert.equal(settled.state, "SETTLED_WIN");
  assert.match(settled.evidence.settlementRef, /end-zone-vault\/ledger\.json/);
});

test("REFUSAL · an ACTIVE day with no freeze stamp fails closed rather than presenting as live", () => {
  const lc = deriveLifecycle({
    ...base,
    entry: { state: "ACTIVE", card: [{ id: "vault-card" }] },
    lockAt: null, // the producer never stamped a freeze boundary
    settlement: null,
  });
  assert.equal(lc.state, "INCIDENT");
  assert.match(lc.evidence.incidentRef, /unearned:ACTIVE/);
});
