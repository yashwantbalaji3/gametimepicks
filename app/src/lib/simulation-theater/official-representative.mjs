/**
 * SIMULATION THEATER · OFFICIAL REPRESENTATIVE SELECTION WIRING (both sports). Pure: parsed documents in, JSON out.
 *
 * Founder rule (Cross-Product Prediction Consistency, 2026-10-20). The Theater's default run is the OFFICIAL
 * REPRESENTATIVE SIMULATION: among the runs the receipt actually STORES (NFL sim-v2: 5 representativeRuns; NBA v1:
 * 5 representativeSamples), the real run closest to the OFFICIAL forecast — never to the simulator's own percentiles.
 * The shared selector is lib/consistency/representative.mjs (byte-identical to the consistency branch; not forked here):
 *
 *   official targets   officialTargets(snapshot), where the snapshot is lib/consistency/official-snapshot.mjs
 *                        NFL  nflOfficialSnapshot: the forecast of record (latest receipt strictly before kickoff, the
 *                             model the game page publishes) — margin/total joint normal, team = (T ± M)/2.
 *                        NBA  nbaOfficialSnapshot: the committed v1 receipt (refused unless receiptIntegrity is OK) —
 *                             sim home/away/margin/total means and sds + per-player family means.
 *   selection          selectOfficialRepresentative(runs, targets) over the stored runs that VALIDATED in the Theater
 *                      (a run the Theater cannot play can never be the default). Runs are de-duplicated by runIndex
 *                      first: a run stored under two kinds (e.g. UPSET = OVERTIME) is one run with one role.
 *
 * The block is attached to the adapted manifest as `manifest.representative` (plain JSON, carried by theater-pack@1
 * verbatim). When the official snapshot is refused (no forecast of record, broken receipt, ...) the block says
 * NO_OFFICIAL with the typed refusal, and EVERY run is a hypothetical what-if: no stored run is ever promoted to
 * "official" without an official forecast to measure it against.
 */
import { REPRESENTATIVE_RULE, RECONCILIATION_RULE, RUN_ROLE, officialTargets, runDistance, runsFromNbaSamples, runsFromNflSimReceipt, selectOfficialRepresentative } from "../consistency/representative.mjs";
import { SnapshotRefusal, nbaOfficialSnapshot, nflOfficialSnapshot } from "../consistency/official-snapshot.mjs";

export const THEATER_REPRESENTATIVE_VERSION = "theater-representative@1";
export const REP_STATE = Object.freeze({ SELECTED: "SELECTED", NO_OFFICIAL: "NO_OFFICIAL", NO_ELIGIBLE_RUN: "NO_ELIGIBLE_RUN" });

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const num = (v) => (isNum(v) ? v : null);

/** Build a snapshot, turning a typed SnapshotRefusal into data (any other error is a bug and propagates). */
export function snapshotOrRefusal(build) {
  try {
    return { snapshot: build(), refusal: null };
  } catch (e) {
    if (e instanceof SnapshotRefusal) return { snapshot: null, refusal: { code: e.code, message: e.message } };
    throw e;
  }
}

/** NFL: official snapshot from the forecast receipts + player board (see loader.mjs readNflOfficialInputs). */
export const nflOfficial = (eventId, inputs) => snapshotOrRefusal(() => nflOfficialSnapshot(eventId, inputs ?? {}));
/** NBA: official snapshot from the committed v1 artifact (receiptIntegrity enforced by the snapshot). */
export const nbaOfficial = (eventId, artifact, ref = {}) => snapshotOrRefusal(() => nbaOfficialSnapshot(eventId, artifact, ref));

/** One entry per runIndex, first occurrence wins; `kinds` lists every kind the run was stored under. */
export function dedupeRuns(runs) {
  const out = new Map();
  for (const r of runs ?? []) {
    if (!Number.isInteger(r?.runIndex)) continue;
    const prev = out.get(r.runIndex);
    if (prev) { if (r.sourceKind && !prev.kinds.includes(r.sourceKind)) prev.kinds.push(r.sourceKind); continue; }
    out.set(r.runIndex, { ...r, kinds: r.sourceKind ? [r.sourceKind] : [] });
  }
  return [...out.values()];
}

const teamTerm = (e) => (e ? { expected: num(e.expected), median: num(e.median), p10: num(e.p10), p90: num(e.p90), published: num(e.published) } : null);

/** The official numbers the Theater prints (exact as stored; nothing rounded). */
export function officialSummary(snapshot) {
  const g = snapshot.game ?? {};
  return {
    sport: snapshot.sport,
    snapshotId: snapshot.snapshotId,
    publication: snapshot.publication,
    modelVersion: snapshot.modelVersions?.game ?? null,
    generatedAt: snapshot.generatedAt ?? null,
    lockAt: snapshot.lockAt ?? null,
    source: snapshot.sources?.[0]?.path ?? null,
    pHome: num(g.pHome),
    pAway: num(g.pAway),
    pTie: num(g.pTie),
    pHomePublished: num(g.pHomePublished),
    winnerSide: g.winner?.side ?? null,
    projectedScore: { home: num(g.projectedScore?.home), away: num(g.projectedScore?.away), convention: g.projectedScore?.convention ?? null },
    team: { home: teamTerm(g.home), away: teamTerm(g.away), margin: teamTerm(g.margin), total: teamTerm(g.total) },
  };
}

/** NBA per-player official expectations, keyed by providerAthleteId (owner id only). */
function playerExpectations(snapshot) {
  if (snapshot.sport !== "NBA") return null;
  const out = {};
  for (const p of snapshot.players ?? []) {
    const fams = {};
    let playRate = null;
    let conditioning = null;
    for (const [fam, e] of Object.entries(p.families ?? {})) {
      fams[fam] = { expected: num(e.expected), median: num(e.median) };
      playRate = playRate ?? num(e.playRate);
      conditioning = conditioning ?? e.conditioning ?? null;
    }
    out[p.playerId] = { families: fams, playRate, conditioning };
  }
  return out;
}

/**
 * @param {{ sport: "NFL"|"NBA", snapshot: object|null, refusal: object|null, runs: object[], eligible: Iterable<number> }} o
 *   runs      normalised runs (runsFromNflSimReceipt / runsFromNbaSamples), all of them
 *   eligible  runIndexes the Theater validated (only these may be selected)
 */
export function representativeBlock({ sport, snapshot, refusal = null, runs, eligible }) {
  const all = dedupeRuns(runs);
  const ok = new Set(eligible ?? []);
  const base = {
    version: THEATER_REPRESENTATIVE_VERSION,
    sport,
    rule: REPRESENTATIVE_RULE.id,
    tolerance: REPRESENTATIVE_RULE.tolerance,
    reconciliationRule: RECONCILIATION_RULE,
  };
  const whatIfAll = (distanceOf = () => null) => all.map((r) => ({ runIndex: r.runIndex, kinds: r.kinds, role: RUN_ROLE.WHAT_IF, hypothetical: true, distance: distanceOf(r) }));
  if (!snapshot) {
    return { ...base, state: REP_STATE.NO_OFFICIAL, refusal: refusal ?? { code: "NO_OFFICIAL", message: "no official snapshot" }, snapshotId: null, official: null, officialRunIndex: null, distance: null, withinTolerance: false, runs: whatIfAll(), reconciliation: [], players: null };
  }
  const targets = officialTargets(snapshot);
  const dist = (r) => { const d = runDistance(r, targets).distance; return Number.isFinite(d) ? d : null; };
  const sel = selectOfficialRepresentative(all.filter((r) => ok.has(r.runIndex)), targets);
  const official = officialSummary(snapshot);
  const players = playerExpectations(snapshot);
  if (!sel.official) {
    return { ...base, state: REP_STATE.NO_ELIGIBLE_RUN, refusal: { code: "NO_ELIGIBLE_RUN", message: "no validated stored run could be measured against the official forecast" }, snapshotId: snapshot.snapshotId, official, officialRunIndex: null, distance: null, withinTolerance: false, runs: whatIfAll(dist), reconciliation: [], players };
  }
  const offIdx = sel.official.run.runIndex;
  return {
    ...base,
    state: REP_STATE.SELECTED,
    refusal: null,
    snapshotId: sel.snapshotId,
    official,
    officialRunIndex: offIdx,
    distance: sel.distance,
    withinTolerance: sel.withinTolerance,
    runs: all.map((r) => (r.runIndex === offIdx
      ? { runIndex: r.runIndex, kinds: r.kinds, role: RUN_ROLE.OFFICIAL_REPRESENTATIVE, hypothetical: false, distance: sel.distance }
      : { runIndex: r.runIndex, kinds: r.kinds, role: RUN_ROLE.WHAT_IF, hypothetical: true, distance: dist(r) })),
    reconciliation: sel.reconciliation,
    players,
  };
}

/** NFL: attach the block to an adapted sim-v2 manifest. `official` = nflOfficial(...) output. */
export function withNflRepresentative(manifest, receipt, official) {
  if (!manifest) return manifest;
  const eligible = (manifest.chips ?? []).filter((c) => c.available).map((c) => c.runIndex);
  const representative = representativeBlock({ sport: "NFL", snapshot: official?.snapshot ?? null, refusal: official?.refusal ?? null, runs: runsFromNflSimReceipt(receipt), eligible });
  return { ...manifest, representative };
}

/** NBA: attach the block to an adapted v1 manifest. `official` = nbaOfficial(...) output; `game` the artifact's game. */
export function withNbaRepresentative(manifest, game, official) {
  if (!manifest) return manifest;
  const eligible = (manifest.samples ?? []).filter((s) => s.validation?.ok).map((s) => s.runIndex);
  const representative = representativeBlock({ sport: "NBA", snapshot: official?.snapshot ?? null, refusal: official?.refusal ?? null, runs: runsFromNbaSamples(game), eligible });
  return { ...manifest, representative };
}
