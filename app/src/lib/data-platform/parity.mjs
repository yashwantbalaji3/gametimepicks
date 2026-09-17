/**
 * Shadow parity — does the platform reconstruct what current owners rely on?
 *
 * Every check is quantified (rows compared, mismatches) and every mismatch gets a disposition from a CLOSED
 * vocabulary. Nothing here edits a source or an owner to make them agree.
 */

export const DISPOSITIONS = Object.freeze({
  MATCH: "MATCH",
  STALE_PLATFORM: "STALE_PLATFORM", // the owner's artifact changed after the platform was built from it
  OWNER_NEWER_THAN_PLATFORM_SOURCE: "OWNER_NEWER_THAN_PLATFORM_SOURCE", // owner holds events past the platform's source cutoff
  DECLARED_GAP: "DECLARED_GAP", // a coverage slice the platform declares unsupported/unresolved
  PLATFORM_DEFECT: "PLATFORM_DEFECT",
  OWNER_DEFECT: "OWNER_DEFECT",
  SEMANTIC_MISMATCH: "SEMANTIC_MISMATCH",
  UNEXPLAINED: "UNEXPLAINED",
});

/**
 * @param {string} id check id, e.g. "P-MLB-4"
 * @param {{ owner: string, platform: string, compared: number, mismatches: Array<{key:string, owner?:unknown, platform?:unknown, disposition:string, note?:string}> }} r
 */
export function parityRow(id, r) {
  const byDisposition = {};
  for (const m of r.mismatches) byDisposition[m.disposition] = (byDisposition[m.disposition] ?? 0) + 1;
  const unexplained = (byDisposition.UNEXPLAINED ?? 0) + (byDisposition.PLATFORM_DEFECT ?? 0);
  return {
    id,
    owner: r.owner,
    platform: r.platform,
    compared: r.compared,
    mismatches: r.mismatches.length,
    byDisposition: Object.fromEntries(Object.entries(byDisposition).sort()),
    verdict: r.mismatches.length === 0 ? "MATCH" : unexplained === 0 ? "EXPLAINED" : "UNEXPLAINED",
    samples: [...r.mismatches].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)).slice(0, 15),
  };
}

/** Membership parity: every owner id must be a platform id. `classify` explains each miss. */
export function containment(ownerIds, platformHas, classify) {
  const mismatches = [];
  const uniq = [...new Set(ownerIds)].sort();
  for (const id of uniq) if (!platformHas(id)) mismatches.push({ key: id, disposition: classify ? classify(id) : DISPOSITIONS.UNEXPLAINED });
  return { compared: uniq.length, mismatches };
}

/** Value parity over keyed pairs. */
export function values(pairs, classify) {
  const mismatches = [];
  for (const { key, owner, platform } of pairs) {
    if (JSON.stringify(owner) !== JSON.stringify(platform)) mismatches.push({ key, owner, platform, disposition: classify ? classify({ key, owner, platform }) : DISPOSITIONS.UNEXPLAINED });
  }
  return { compared: pairs.length, mismatches };
}
