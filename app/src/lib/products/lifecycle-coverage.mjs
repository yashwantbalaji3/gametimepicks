/**
 * WHICH SIGNATURE PRODUCTS ARE ACTUALLY GOVERNED BY A LIFECYCLE?
 *
 * Program 228 · Release F0. A closed daily state machine exists and has since P211 — but it names
 * exactly two products, `bank-builder` and `moonshot`. Every other registered signature product runs
 * on its own bespoke path: its own producer, its own idea of "no card today", its own settlement
 * owner, and no shared contract saying an illegal transition is illegal.
 *
 * That is not a criticism of the machine; it is the inventory nobody had written down. The failure
 * it permits is specific and this repository has already lived it twice: Moonshot published cards no
 * settler could reach and called them pending, and Homer Nukes reported a structurally impossible
 * record for weeks. Both were products whose lifecycle nothing was checking.
 *
 * WHAT THIS IS. A derivation over the repository itself — for each registered product, does a
 * producer exist, a public route, a scheduled workflow, a ledger, a settlement owner, and lifecycle
 * governance? Every field is EVIDENCE (a path that exists, a workflow that names the script), never
 * a hand-kept status. A product whose producer is deleted must show up here as ungoverned the same
 * day, without anyone remembering to update a table.
 *
 * WHAT THIS IS NOT. It does not govern anything by itself and it never invents coverage. Reporting
 * a gap is the whole job; closing one is a separate, per-product piece of engineering.
 *
 * Pure: the repository facts are passed in.
 */

/** The coverage dimensions, in the order a product acquires them. */
export const COVERAGE_DIMENSIONS = Object.freeze([
  "producer",     // something generates this product's card
  "publicRoute",  // a customer can see it
  "automation",   // a workflow runs the producer on a cadence
  "ledger",       // its record lives somewhere of its own
  "settlement",   // an official-result path can grade it
  "lifecycle",    // the shared state machine governs its transitions
]);

/** Per-product verdicts. UNGOVERNED is not an insult — it is the absence of a contract. */
export const COVERAGE_VERDICTS = Object.freeze(["GOVERNED", "PARTIAL", "UNGOVERNED", "PAUSED_FOUNDER", "RETIRED"]);

/**
 * @param {object} p
 * @param {Array<{id: string, label: string, evidence: Record<string, boolean>, note?: string|null,
 *                founderGate?: string|null, retired?: boolean}>} p.products
 */
export function buildCoverage({ products }) {
  const rows = (products ?? []).map((prod) => {
    const missing = COVERAGE_DIMENSIONS.filter((d) => prod.evidence?.[d] !== true);
    const present = COVERAGE_DIMENSIONS.filter((d) => prod.evidence?.[d] === true);

    /*
     * A founder-gated product is reported as gated rather than as a coverage failure. Its engineering
     * may be complete and simply waiting on a decision — counting that as a defect would make the
     * gap list unreadable and pressure someone into "fixing" a product that is paused on purpose.
     */
    const verdict = prod.retired
      ? "RETIRED"
      : prod.founderGate
        ? "PAUSED_FOUNDER"
        : missing.length === 0
          ? "GOVERNED"
          : present.length === 0
            ? "UNGOVERNED"
            : "PARTIAL";

    return {
      id: prod.id,
      label: prod.label,
      verdict,
      present,
      missing,
      founderGate: prod.founderGate ?? null,
      note: prod.note ?? null,
    };
  });

  const counts = {};
  for (const v of COVERAGE_VERDICTS) counts[v] = rows.filter((r) => r.verdict === v).length;

  /*
   * The headline is the number of products with an OPEN coverage gap. Founder-gated and retired
   * products are excluded from it deliberately: neither is executable engineering, and folding them
   * in produces a number that can never reach zero and therefore stops being read.
   */
  const openGaps = rows.filter((r) => r.verdict === "PARTIAL" || r.verdict === "UNGOVERNED");

  return {
    rows,
    counts,
    openGaps: openGaps.map((r) => ({ id: r.id, missing: r.missing })),
    state: openGaps.length === 0 ? "ALL_GOVERNED" : "GAPS",
  };
}

/**
 * The one dimension worth singling out: a product that can PUBLISH but cannot SETTLE.
 *
 * That exact pair is how Moonshot came to hold two cards nobody could ever grade, presented as
 * pending. A product missing settlement while having a producer is not one gap among six — it is the
 * shape that produces an unfalsifiable public record.
 */
export function publishesWithoutSettling(coverage) {
  return (coverage?.rows ?? [])
    .filter((r) => r.present.includes("producer") && r.missing.includes("settlement"))
    .map((r) => r.id);
}
