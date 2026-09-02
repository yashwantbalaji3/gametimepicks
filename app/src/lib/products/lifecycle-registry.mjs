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
/** The subset of ownership fields that name a file. `ledgerKind` is a classification, not a path. */
export const OWNERSHIP_PATHS = Object.freeze([
  "producer", "selectionGate", "freeze", "settlementAdapter", "ledger", "receiptOwner",
]);

export const LIFECYCLE_OWNERSHIP = Object.freeze([
  "producer",          // what generates the card
  "selectionGate",     // what decides a leg may enter it
  "freeze",            // the boundary past which the card of record cannot change
  "settlementAdapter", // what joins an official result to it
  "ledger",            // its OWN record, shared with nothing
  "receiptOwner",      // what emits its daily receipt
  "ledgerKind",        // what its record MEASURES — see LEDGER_KINDS
]);

/**
 * WHAT A PRODUCT'S RECORD ACTUALLY MEASURES.
 *
 * `money` — a bankroll moves on the result. A card wins or loses; the day settles SETTLED_WIN or
 *   SETTLED_LOSS and may then ADVANCE, RESTART or STOP.
 * `calibration` — the record carries gradedPicks, predicted, actual and Brier, and no stake at all.
 *   A board of ~25% picks is SUPPOSED to miss most of them, so a day where one of five lands is
 *   neither a win nor a loss. It settles SETTLED_RECORDED and progresses nowhere.
 *
 * The distinction is load-bearing, not descriptive. Without it the only way to settle a calibration
 * board is to choose one of the two money verdicts and mint an outcome the product never computed —
 * and that fabricated verdict would then be summable with the money products' records, which is
 * exactly the combined-total failure the ledger invariants exist to prevent.
 */
export const LEDGER_KINDS = Object.freeze(["money", "calibration"]);

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
    if (e.ledgerKind && !LEDGER_KINDS.includes(e.ledgerKind)) {
      throw new Error(`lifecycle-registry: ${e.id} declares ledgerKind ${e.ledgerKind}, outside ${LEDGER_KINDS.join("/")}`);
    }
    const missing = LIFECYCLE_OWNERSHIP.filter((k) => !e[k]);
    if (missing.length) {
      throw new Error(
        `lifecycle-registry: ${e.id} cannot be governed — no owner for ${missing.join(", ")}. ` +
          `Registering it anyway is a label, not a lifecycle.`,
      );
    }
    /*
     * ONE RECORD PER PRODUCT — enforced on ledger IDENTITY, not on the filename.
     *
     * The first version of this rule compared paths alone, which is too crude for how this
     * repository actually stores records: `parlays/lab-ledger.json` is a single artifact holding
     * five independent streams (mlb, nfl, ufc, epl, multi), each with its own wins, losses, stake
     * and return. Those records ARE separate; they simply share a file.
     *
     * So the identity is the path plus the stream key. Two products may live in one artifact while
     * owning different streams; two products claiming the SAME stream is the real failure — that is
     * how a losing lane borrows a winning one's history and reads as one healthy product.
     */
    const identity = e.ledgerStream ? `${e.ledger}#${e.ledgerStream}` : e.ledger;
    const shared = ledgers.get(identity);
    if (shared) {
      throw new Error(
        `lifecycle-registry: ${e.id} and ${shared} both claim the record ${identity} — each product owns exactly one`,
      );
    }
    ledgers.set(identity, e.id);
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
    ledgerKind: "money",
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
    ledgerKind: "money",
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
    ledgerKind: "money",
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
  /*
   * HOMER NUKES is the first CALIBRATION product to join (P230 · F1).
   *
   * Its record holds gradedPicks, predicted, actual and Brier — no stake, no payout, no bankroll.
   * Settling it as SETTLED_WIN or SETTLED_LOSS would have required choosing a money verdict for a
   * product that never computes one, so it settles SETTLED_RECORDED instead.
   */
  {
    id: "homer-nukes",
    label: "Homer Nukes",
    policyVersion: "homer-nukes@1",
    ledgerKind: "calibration",
    producer: "app/scripts/mlb/build-homer-nukes.mjs",
    selectionGate: "app/src/lib/mlb/homer-nukes-board.ts",
    /* Its freeze is the dated board artifact: `homer-nukes/<date>.json` is written for the slate and
       the settler reads that file, so the picks of record cannot change after the fact. */
    freeze: "app/public/data/mlb/homer-nukes",
    settlementAdapter: "app/scripts/mlb/settle-homer-nukes.mjs",
    ledger: "app/public/data/mlb/homer-nukes/record.json",
    receiptOwner: "app/scripts/products/build-daily-product-receipts.mjs",
  },
  /*
   * THE SPORT CARD LADDERS (P230 · F1).
   *
   * The coverage inventory had been checking `ufc/graded-picks.json` as these products' ledger. That
   * artifact is the model's FIGHT-WINNER pick record — a calibration ledger for a different product
   * — so the inventory was reporting "the UFC cards have a record" on the strength of something
   * else's. The cards' actual record is the Parlay Lab ledger, which carries wins, losses, stake and
   * return per stream: paper money, kept strictly out of the Bank Builder / Moonshot bankroll.
   *
   * Both live in one artifact and own different streams, which the identity rule above permits and
   * the same-stream case still refuses.
   */
  {
    id: "ufc-cards",
    label: "UFC paper cards",
    policyVersion: "ufc-cards@1",
    ledgerKind: "money",
    producer: "app/scripts/parlays/build-risk-ladder.mjs",
    selectionGate: "app/scripts/parlays/lab-eligibility.mjs",
    freeze: "app/public/data/parlays/risk-ladder-ufc",
    settlementAdapter: "app/scripts/parlays/settle-lab-cards.mjs",
    ledger: "app/public/data/parlays/lab-ledger.json",
    ledgerStream: "ufc",
    receiptOwner: "app/scripts/products/build-daily-product-receipts.mjs",
  },
  {
    id: "epl-cards",
    label: "EPL paper cards",
    policyVersion: "epl-cards@1",
    ledgerKind: "money",
    producer: "app/scripts/parlays/build-risk-ladder.mjs",
    selectionGate: "app/scripts/parlays/lab-eligibility.mjs",
    freeze: "app/public/data/parlays/risk-ladder-epl",
    settlementAdapter: "app/scripts/parlays/settle-lab-cards.mjs",
    ledger: "app/public/data/parlays/lab-ledger.json",
    ledgerStream: "epl",
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
