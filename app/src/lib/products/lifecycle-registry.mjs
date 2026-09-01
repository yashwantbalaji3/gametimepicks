/**
 * WHO IS GOVERNED, AND WHAT THAT COSTS — the membership owner for the daily lifecycle.
 *
 * Program 230 · F1. `GOVERNED_PRODUCTS` was a frozen array of two strings, and the coverage builder
 * decided whether a product was governed by testing whether its id appeared **anywhere in the state
 * machine's source**:
 *
 *     const governedByMachine = (id) => new RegExp(`["'\`]${id}["'\`]`).test(machineSource);
 *
 * So the difference between "this product has a lifecycle" and "somebody typed its name" was a pair
 * of quotes. Four products sat PARTIAL, each missing only `lifecycle`, and every one of them could
 * have been closed by adding a string to a list — no receipt, no settlement, no ledger, nothing that
 * would make the claim true. That is the label-only closure the charter forbids, and the registry
 * that permits it is the thing to fix first: otherwise F1's own acceptance test is a formality.
 *
 * MEMBERSHIP IS NOW EARNED. A product enters by declaring an owner for every mechanic the lifecycle
 * depends on, and `registerProducts` refuses the entry otherwise. The refusals are as load-bearing
 * as the registrations:
 *
 *   - a missing owner throws, naming the field — a product cannot be half-registered;
 *   - two products sharing a ledger throws, because one ledger holding two records is how a
 *     product's performance quietly becomes another's;
 *   - a duplicate id throws, so a second registration cannot silently replace the first.
 *
 * WHY A PRODUCT SHOULD NOT BE ADDED EARLY. The watchdog reports `MISSING_DAILY_EVALUATION` for every
 * governed product with no receipt for the day. Registering a product nobody has wired makes it
 * alarm every day forever, and a watchdog that cries wolf gets switched off — taking the real alarms
 * with it. Register a product on the day its receipt becomes real, not the day its name is known.
 */

/** Every mechanic a governed product day depends on. Absence of any one is a refusal, not a warning. */
export const LIFECYCLE_OWNERSHIP = Object.freeze([
  "producer",          // what generates the card
  "selectionGate",     // what decides a leg may enter it
  "freeze",            // the boundary past which the card of record cannot change
  "settlementAdapter", // what joins an official result to it
  "ledger",            // its OWN record, shared with nothing
  "receiptOwner",      // what emits its daily receipt
]);

/**
 * Build the registry. Pure and total: same entries in, same frozen registry out, or a throw naming
 * exactly what is missing.
 *
 * @param {Array<{id: string, label: string, policyVersion: string} & Record<string, string>>} entries
 */
export function registerProducts(entries) {
  const byId = new Map();
  const ledgers = new Map();
  for (const e of entries) {
    if (!e?.id) throw new Error("lifecycle-registry: every product declares an id");
    if (byId.has(e.id)) {
      throw new Error(`lifecycle-registry: ${e.id} is registered twice — a second entry would silently replace the first`);
    }
    if (!e.label || !e.policyVersion) {
      throw new Error(`lifecycle-registry: ${e.id} must declare a label and a policyVersion`);
    }
    const missing = LIFECYCLE_OWNERSHIP.filter((k) => !e[k]);
    if (missing.length) {
      throw new Error(
        `lifecycle-registry: ${e.id} cannot be governed — no owner for ${missing.join(", ")}. ` +
          `Registering it anyway is a label, not a lifecycle.`,
      );
    }
    /* One ledger per product. Two products writing one record is how a losing lane borrows a
       winning one's history, and it reads as a single healthy product from the outside. */
    const shared = ledgers.get(e.ledger);
    if (shared) {
      throw new Error(
        `lifecycle-registry: ${e.id} and ${shared} both claim the ledger ${e.ledger} — each product owns exactly one`,
      );
    }
    ledgers.set(e.ledger, e.id);
    byId.set(e.id, Object.freeze({ ...e }));
  }
  return Object.freeze({
    byId,
    ids: Object.freeze([...byId.keys()]),
    /** @param {string} id */
    get: (id) => byId.get(id) ?? null,
    /** @param {string} id */
    isGoverned: (id) => byId.has(id),
  });
}

/**
 * THE REGISTRY OF RECORD.
 *
 * Each entry names the module or artifact that actually owns that mechanic today, so a reader can
 * follow "who freezes Bank Builder's card?" to a path rather than to a convention.
 */
export const PRODUCT_REGISTRY = registerProducts([
  {
    id: "bank-builder",
    label: "Bank Builder",
    policyVersion: "bank-builder@1",
    producer: "app/scripts/activate-daily-portfolio.mjs",
    selectionGate: "app/src/lib/products/selection-policy.mjs",
    freeze: "app/scripts/promote-bank-builder-proposal.mjs",
    settlementAdapter: "scripts/automation_settle.sh",
    ledger: "app/public/data/mr-dub/portfolio.json",
    receiptOwner: "app/scripts/products/build-daily-product-receipts.mjs",
  },
  {
    id: "moonshot",
    label: "Moonshot",
    policyVersion: "moonshot@1",
    producer: "app/src/lib/moonshot/moonshot-lane.ts",
    selectionGate: "app/src/lib/products/selection-policy.mjs",
    freeze: "app/scripts/promote-bank-builder-proposal.mjs",
    settlementAdapter: "scripts/automation_settle.sh",
    ledger: "app/public/data/product-ledger/moonshot.json",
    receiptOwner: "app/scripts/products/build-daily-product-receipts.mjs",
  },
  /*
   * END ZONE VAULT joins on the day its receipt became real (P230 · F1).
   *
   * It was PARTIAL missing only `lifecycle`, and it already had all five other mechanics — a
   * producer, a public route, a schedule, its own append-only ledger and a settler. What it did not
   * have was a receipt on its quiet days: the builder ran inside a step gated on
   * `events != '0'`, so in exactly the windows where "no upcoming event" IS the evaluation, it never
   * ran and the ledger went silent. nfl-event-window succeeded nine times between 08-30 and 09-01
   * and the Vault gained no entry on any of them. The gate is fixed in the workflow; the product now
   * speaks every window, which is what its own contract always claimed.
   */
  {
    id: "end-zone-vault",
    label: "End Zone Vault",
    policyVersion: "end-zone-vault@1",
    producer: "app/scripts/nfl/build-end-zone-vault.mjs",
    selectionGate: "app/src/lib/sports/nfl/end-zone-vault.mjs",
    /* Its freeze is the append-only ledger discipline: `validateVaultLedgerAppend` refuses a second
       entry for a date, so the day's card of record cannot be rewritten after the fact. */
    freeze: "app/src/lib/sports/nfl/end-zone-vault.mjs",
    settlementAdapter: "app/scripts/nfl/settle-nfl-experimental.mjs",
    ledger: "data/internal/nfl/end-zone-vault/ledger.json",
    receiptOwner: "app/scripts/products/build-daily-product-receipts.mjs",
  },
]);

/**
 * The products the daily state machine governs — DERIVED from the registry, never typed beside it.
 *
 * This is the whole point: adding a name here is now impossible without also naming who produces,
 * gates, freezes, settles, records and receipts it.
 */
export const GOVERNED_PRODUCTS = Object.freeze(PRODUCT_REGISTRY.ids);
