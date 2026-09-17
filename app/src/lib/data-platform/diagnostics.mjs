/**
 * Structured diagnostics — adapters REPORT, they never console.warn-and-continue.
 *
 * Counts are exact; samples are capped so a systemic source defect cannot produce a multi-megabyte
 * receipt. Severity decides what the build does: ERROR fails the build (no data is written), the rest are
 * receipted and fail closed for the affected row only.
 */

export const DIAGNOSTIC_CODES = Object.freeze({
  MISSING_EVENT_ID: "ROW_DROPPED",
  MALFORMED_ROW: "ROW_DROPPED",
  UNRESOLVED_TEAM: "FIELD_NULLED_OR_ROW_DROPPED",
  UNRESOLVED_PLAYER: "ROW_DROPPED",
  AMBIGUOUS_ALIAS: "ROW_DROPPED",
  UNRESOLVED_GAME: "ROW_DROPPED",
  EXCLUDED_BY_SCOPE: "ROW_EXCLUDED",
  DUPLICATE_SOURCE_OCCURRENCE: "INFO",
  SOURCE_CONFLICT: "PRECEDENCE_APPLIED",
  STAT_CONFLICT: "ROW_DROPPED",
  NAME_VARIANT: "INFO",
  INVALID_STAT: "ROW_DROPPED",
  SIDE_MISMATCH: "ROW_DROPPED",
  CONTRACT_VIOLATION: "ERROR",
});

const SAMPLE_CAP = 8;

export function createDiagnostics() {
  /** @type {Map<string, {code:string, sportId:string, source:string, count:number, samples:unknown[]}>} */
  const buckets = new Map();
  return {
    /** @param {keyof typeof DIAGNOSTIC_CODES} code @param {string} sportId @param {string} source @param {unknown} [sample] */
    add(code, sportId, source, sample) {
      if (!Object.hasOwn(DIAGNOSTIC_CODES, code)) throw new Error(`unknown diagnostic code ${code}`);
      const k = `${sportId}|${source}|${code}`;
      const b = buckets.get(k) ?? { code, sportId, source, count: 0, samples: [] };
      b.count += 1;
      if (sample !== undefined && b.samples.length < SAMPLE_CAP) b.samples.push(sample);
      buckets.set(k, b);
    },
    count(code, sportId) {
      let n = 0;
      for (const b of buckets.values()) if (b.code === code && (!sportId || b.sportId === sportId)) n += b.count;
      return n;
    },
    errors() {
      return [...buckets.values()].filter((b) => DIAGNOSTIC_CODES[b.code] === "ERROR");
    },
    /** Deterministic list: sorted by sport, source, code. */
    list() {
      return [...buckets.values()]
        .map((b) => ({ ...b, effect: DIAGNOSTIC_CODES[b.code] }))
        .sort((a, b) => (a.sportId + a.source + a.code < b.sportId + b.source + b.code ? -1 : 1));
    },
  };
}
