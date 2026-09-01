/**
 * CROSS-SPORT EVENT IDENTITY AUDIT.
 *
 * Program 224 · Release B. Two identity defects were found by tripping over a single row, and both
 * turned out to be classes rather than incidents:
 *
 *   • A doubleheader shares team-pair + date, so the public slug collided. The route had always
 *     disambiguated by gamePk; the simulation adapter had not, so the sim artifact, the predictions
 *     artifact derived from it, and every href built off those named a slug that is not a built page
 *     on exactly the days it collides. 2026-08-29: seventeen prediction rows over fifteen slugs.
 *
 *   • The live-slate classifier read a completeness vocabulary the engine does not emit, so 300 of
 *     474 sims were one unclaimed row away from being called PARTIAL_PRESENTED_AS_COMPLETE.
 *
 * Neither was visible until one specific row landed in the gap. So this runs the detectors across
 * ALL committed data for every sport and publishes the reconciled counts, rather than asserting a
 * single row is fine.
 *
 * WHAT IT CHECKS, per sport and per date:
 *   DUPLICATE_IDENTITY   two rows claim the same canonical id — one of them is unreachable
 *   SLUG_COLLISION       two rows share a public slug — the URL cannot serve both
 *   UNJOINED_DERIVED     a derived row's identity is absent upstream — it describes nothing
 *   MISSING_IDENTITY     a row carries no canonical id at all — it cannot be settled or corrected
 *
 * WHAT IT DOES NOT DO. It never repairs an artifact and never decides an identity. It reports what
 * the committed bytes say, including "this sport has no events right now", which is a finding about
 * the window and not about identity. A quiet sport reads NO_EVENTS, never OK — an empty set
 * satisfies every check vacuously, and calling that a pass is how a detector goes quiet at exactly
 * the wrong moment.
 *
 * Pure: every artifact is passed in.
 */

export const IDENTITY_FINDINGS = Object.freeze([
  "DUPLICATE_IDENTITY",
  "SLUG_COLLISION",
  "UNJOINED_DERIVED",
  "MISSING_IDENTITY",
]);

/** Per-sport verdicts. UNKNOWN and NO_EVENTS are never reported as OK. */
export const SPORT_VERDICTS = Object.freeze(["OK", "NO_EVENTS", "FINDINGS", "UNKNOWN"]);

const dupes = (values) => {
  const seen = new Map();
  for (const v of values) seen.set(v, (seen.get(v) ?? 0) + 1);
  return [...seen.entries()].filter(([, n]) => n > 1);
};

/**
 * Audit one population of rows.
 *
 * @param {object} p
 * @param {string} p.sport
 * @param {string} p.scope              what this population is ("boards/2026-08-29", "card-latest")
 * @param {Array<object>} p.rows        the rows to audit
 * @param {(row) => string|number|null} p.identityOf   the canonical id
 * @param {(row) => string|null} [p.slugOf]            the public slug, when the population has one
 * @param {Set<string>|null} [p.upstream]              canonical ids this population must join to
 */
export function auditPopulation({ sport, scope, rows, identityOf, slugOf = null, upstream = null }) {
  const findings = [];
  const list = Array.isArray(rows) ? rows : [];

  const ids = list.map((r) => {
    const v = identityOf(r);
    return v == null || v === "" ? null : String(v);
  });

  for (const [i, id] of ids.entries()) {
    if (id == null) {
      findings.push({ kind: "MISSING_IDENTITY", sport, scope, detail: `row ${i} carries no canonical id` });
    }
  }

  for (const [id, n] of dupes(ids.filter((v) => v != null))) {
    findings.push({ kind: "DUPLICATE_IDENTITY", sport, scope, detail: `${n} rows claim id ${id}` });
  }

  if (slugOf) {
    const slugs = list.map((r) => slugOf(r)).filter((s) => s != null && s !== "");
    for (const [slug, n] of dupes(slugs)) {
      findings.push({
        kind: "SLUG_COLLISION",
        sport,
        scope,
        detail: `${n} rows share the public slug ${slug} — the URL cannot serve both`,
      });
    }
  }

  if (upstream) {
    for (const [i, id] of ids.entries()) {
      if (id != null && !upstream.has(id)) {
        findings.push({ kind: "UNJOINED_DERIVED", sport, scope, detail: `row ${i} (id ${id}) is absent upstream` });
      }
    }
  }

  return { sport, scope, rows: list.length, identified: ids.filter((v) => v != null).length, findings };
}

/**
 * Roll several populations into one sport verdict.
 *
 * `readable` is the caller's statement that it could open what it went looking for. A sport whose
 * artifacts could not be read is UNKNOWN — not OK, and not NO_EVENTS: "nothing scheduled" and "we
 * could not tell" justify opposite conclusions and must never share a colour.
 */
export function rollUpSport(sport, populations, { readable = true } = {}) {
  if (!readable) {
    return { sport, verdict: "UNKNOWN", rows: 0, populations: [], findings: [], note: "artifacts unreadable" };
  }
  const rows = populations.reduce((n, p) => n + p.rows, 0);
  const findings = populations.flatMap((p) => p.findings);
  const verdict = findings.length > 0 ? "FINDINGS" : rows === 0 ? "NO_EVENTS" : "OK";
  return {
    sport,
    verdict,
    rows,
    populations: populations.map((p) => ({ scope: p.scope, rows: p.rows, identified: p.identified, findings: p.findings.length })),
    findings,
    note:
      verdict === "NO_EVENTS"
        ? "no committed events in this window — identity checks are vacuous here, which is a statement about the window"
        : null,
  };
}

/** Worst-of across sports. UNKNOWN outranks FINDINGS: not knowing is worse than a known defect. */
export function worstVerdict(verdicts) {
  const order = ["OK", "NO_EVENTS", "FINDINGS", "UNKNOWN"];
  return verdicts.reduce((worst, v) => (order.indexOf(v) > order.indexOf(worst) ? v : worst), "OK");
}
