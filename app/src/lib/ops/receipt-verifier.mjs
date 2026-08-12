/**
 * Scheduled-cadence receipt verifier — pure evaluator (Program 163 · Release C).
 *
 * Evaluates ONE completed sport-schedules run per sport and per artifact class, from inputs only:
 * run metadata + prior/current artifact manifests + expectations. NO network, NO filesystem, NO
 * clock — the invocation script gathers inputs; this module only judges. A green workflow headline
 * can never substitute for artifact proof, and one sport's failure never erases another sport's
 * valid receipt (per-sport isolation is the whole design).
 *
 * Verdict vocabulary (closed):
 *   QUALIFYING_CHANGE   semantic content advanced with coherent stamps and arithmetic
 *   NO_CHANGE_PROVEN    acquisition succeeded (stamps advanced) and semantic equality held
 *   RETAINED_LKG        nothing was written — valid ONLY when the expectation allows source
 *                       failure/discard (last-known-good stands, an outage never looks empty)
 *   FAILED_GREEN_NO_ARTIFACT  the run claims success but a mandatory class never advanced
 *   FAILED_EMPTY_OVERWRITE    counts collapsed to zero from nonzero without an explaining state
 *   FAILED_MASS_DELETION      counts dropped sharply without an explaining state change
 *   FAILED_RECONCILIATION     a results class whose population arithmetic is not exact
 *   FAILED_EXPECTATION        the class contradicts tomorrow's stated expectation
 *   NOT_EVALUATED             the run itself was not a qualifying scheduled run
 */

export const RECEIPT_VERIFIER_VERSION = 1;

/** Artifact classes tomorrow's run owns, with the sport each belongs to. */
export const ARTIFACT_CLASSES = Object.freeze([
  { id: "nfl-schedule", sport: "nfl", mandatory: true },
  { id: "nba-schedule", sport: "nba", mandatory: true },
  { id: "ufc-schedule", sport: "ufc", mandatory: true },
  { id: "epl-fixtures", sport: "epl", mandatory: false }, // unchanged snapshots are DISCARDED by design
  { id: "nfl-results", sport: "nfl", mandatory: true },
  { id: "nba-results", sport: "nba", mandatory: true },
  { id: "ufc-results", sport: "ufc", mandatory: true },
  { id: "epl-results", sport: "epl", mandatory: true },
  { id: "injuries-nfl", sport: "nfl", mandatory: true },
  { id: "injuries-nba", sport: "nba", mandatory: true },
]);

/** A run qualifies only as itself: scheduled trigger, the right workflow, terminal success. */
export function classifyRun(run) {
  if (!run) return { qualifying: false, reason: "no run metadata supplied" };
  if (run.event !== "schedule") return { qualifying: false, reason: `trigger ${run.event} — a manual dispatch is never a cadence receipt` };
  if (!/sport-schedules/.test(run.workflowName ?? "")) return { qualifying: false, reason: `workflow ${run.workflowName} is not the cadence` };
  if (run.conclusion !== "success") return { qualifying: false, reason: `conclusion ${run.conclusion} — evaluate artifacts for retention, not for receipts` };
  return { qualifying: true, reason: `scheduled run ${run.id} concluded success` };
}

/**
 * Evaluate one artifact class. `prior`/`current` manifests: { generatedAt, sourceAsOf,
 * semanticHash, counts, state, reconciliationExact } — semanticHash is stamp-stripped upstream.
 * `expectation`: { state?, allowRetention?, minCount?, note? } — tomorrow's committed truth.
 */
export function evaluateClass(cls, { prior, current, expectation = {} }) {
  const r = (verdict, evidence) => ({ class: cls.id, sport: cls.sport, verdict, evidence });

  if (!current && !prior) return r(cls.mandatory ? "FAILED_GREEN_NO_ARTIFACT" : "RETAINED_LKG", "no manifest supplied for this class (non-mandatory classes may be covered by their own lineage guards)");
  if (!current || !prior) return r("QUALIFYING_CHANGE", `artifact ${!prior ? "created" : "removed — inspect manually"}`);

  const stampsAdvanced = Date.parse(current.generatedAt ?? 0) > Date.parse(prior.generatedAt ?? 0);
  const semanticEqual = prior.semanticHash === current.semanticHash;

  // Reconciliation is a property of results classes and must be exact whenever rows exist.
  if (/results/.test(cls.id) && current.reconciliationExact === false) {
    return r("FAILED_RECONCILIATION", "population arithmetic is not exact — joined + quarantined + nonFinal must equal source rows");
  }

  // Expectation contradiction beats everything else: tomorrow's committed truth is the bar.
  if (expectation.state && current.state && expectation.state !== current.state) {
    return r("FAILED_EXPECTATION", `state ${current.state} contradicts the committed expectation ${expectation.state}${expectation.note ? ` (${expectation.note})` : ""}`);
  }

  const total = (m) => Object.values(m?.counts ?? {}).reduce((a, b) => a + (Number(b) || 0), 0);
  const before = total(prior), after = total(current);
  if (!semanticEqual && before > 0 && after === 0 && prior.state === current.state) {
    return r("FAILED_EMPTY_OVERWRITE", `${before} → 0 with no state change — an empty overwrite is never a receipt`);
  }
  if (!semanticEqual && after < before * 0.5 && before >= 10 && prior.state === current.state) {
    return r("FAILED_MASS_DELETION", `${before} → ${after} without a state change — unexplained mass deletion`);
  }

  if (!stampsAdvanced) {
    return expectation.allowRetention
      ? r("RETAINED_LKG", "nothing written — last-known-good stands (source failure or discarded snapshot, allowed for this class)")
      : r(cls.mandatory ? "FAILED_GREEN_NO_ARTIFACT" : "RETAINED_LKG", "stamps did not advance on a mandatory class — a green headline is not an artifact receipt");
  }
  if (semanticEqual) return r("NO_CHANGE_PROVEN", "acquisition succeeded (stamps advanced) and semantic equality held after stamp stripping");
  if (typeof expectation.minCount === "number" && after < expectation.minCount) {
    return r("FAILED_EXPECTATION", `count ${after} below the committed minimum ${expectation.minCount}`);
  }
  return r("QUALIFYING_CHANGE", `semantic content advanced (${before} → ${after})`);
}

/** The full evaluation: run classification + per-class receipts + per-sport rollup. */
export function verifyCadenceReceipts({ run, manifests, expectations = {} }) {
  const runVerdict = classifyRun(run);
  const receipts = ARTIFACT_CLASSES.map((cls) =>
    runVerdict.qualifying
      ? evaluateClass(cls, { prior: manifests?.[cls.id]?.prior ?? null, current: manifests?.[cls.id]?.current ?? null, expectation: expectations[cls.id] ?? {} })
      : { class: cls.id, sport: cls.sport, verdict: "NOT_EVALUATED", evidence: runVerdict.reason },
  );
  const bySport = {};
  for (const rec of receipts) {
    bySport[rec.sport] ??= { receipts: [], allClean: true };
    bySport[rec.sport].receipts.push(rec);
    if (/^FAILED/.test(rec.verdict)) bySport[rec.sport].allClean = false;
  }
  return {
    version: RECEIPT_VERIFIER_VERSION,
    run: { id: run?.id ?? null, ...runVerdict },
    receipts,
    bySport,
    failures: receipts.filter((x) => /^FAILED/.test(x.verdict)),
  };
}
