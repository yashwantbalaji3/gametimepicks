/**
 * CROSS-PRODUCT PREDICTION CONSISTENCY · THE OFFICIAL REPRESENTATIVE SIMULATION.
 *
 * The Simulation Theater's DEFAULT run is the "Official Representative Simulation": one REAL, coherent stored run —
 * never an averaged or invented game — chosen as the run CLOSEST TO THE OFFICIAL SNAPSHOT'S PROJECTIONS (not to the
 * simulator's own percentiles), shown beside the official expectations. Every other run is a What-If: real, labelled
 * "Hypothetical", and never fed to a product, a board or a recommendation.
 *
 * SELECTION RULE (`REPRESENTATIVE_RULE`).
 *   distance(run) = sqrt( Σ wₖ·zₖ² / Σ wₖ ),  zₖ = (run valueₖ − official expectationₖ) / official scaleₖ
 *   Team terms (weight 1 each): home score, away score, home margin, total. Expectations are the official snapshot's
 *     expected values (fractional means); scales are the official sds (NFL: margin σ and total σ of the joint normal,
 *     team σ = √(σ_T² + σ_M²)/2; NBA: each simulated sd). Margin and total are linear in the two scores; they are kept
 *     as their own terms on purpose — the reader compares a run to the projected margin and total, not only scores.
 *   Player terms (only when the runs carry player lines and the snapshot has that player/family): one term per
 *     (official player, family) with scale = that family's sd (or (p90 − p10)/2.5631 when no sd is stored), sharing a
 *     TOTAL weight of `playerWeight` (default 1, i.e. all players together weigh as much as one team term).
 *   Ties → lowest runIndex. Deterministic: same runs + same snapshot ⇒ same pick.
 *   `withinTolerance` = distance ≤ `tolerance` (default 0.5 normalised units). A pool of stored representatives is
 *   small (NFL sim-v2 stores 5, NBA v1 stores 5); a pick outside tolerance is reported, never hidden.
 *
 * RECONCILIATION (fractional expectation vs whole-number result). An official expectation is a mean over thousands
 * of simulated games (e.g. 29.69 points); one game's box score is whole numbers (29). The Theater shows both, side by
 * side, never one rounded into the other: the run's integers are "this simulated game"; the official numbers are
 * "the forecast". `reconciliation[]` lists, per term, the expectation, the run value and the signed difference, and
 * the rule text the page prints. Totals of a box score are never adjusted to hit an expectation.
 *
 * Pure. No fs, no clock.
 */

export const REPRESENTATIVE_RULE = Object.freeze({
  id: "official-representative@1",
  teamTerms: Object.freeze(["home", "away", "margin", "total"]),
  playerWeight: 1,
  tolerance: 0.5,
  tieBreak: "lowest runIndex",
});

export const RUN_ROLE = Object.freeze({ OFFICIAL_REPRESENTATIVE: "OFFICIAL_REPRESENTATIVE", WHAT_IF: "WHAT_IF" });
export const OFFICIAL_LABEL = "Official Representative Simulation";
export const WHAT_IF_LABEL = "Hypothetical";

export const RECONCILIATION_RULE =
  "Official numbers are averages over every simulated game and can be fractional; this simulated game is one real run, so its box score is whole numbers. The run shown is the stored run closest to the official projections; its numbers are never rounded into, or substituted for, the forecast.";

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const Z80 = 2.5631031310892; // p90 − p10 of a standard normal

/** Official expectations + scales for the team terms and every player/family the snapshot holds. */
export function officialTargets(snapshot) {
  const g = snapshot?.game ?? {};
  const sdOf = (e) => (isNum(e?.sd) ? e.sd : isNum(e?.distribution?.sd) ? e.distribution.sd : isNum(e?.p90) && isNum(e?.p10) ? (e.p90 - e.p10) / Z80 : null);
  const team = {};
  for (const k of REPRESENTATIVE_RULE.teamTerms) {
    const e = g[k];
    if (e && isNum(e.expected)) team[k] = { expected: e.expected, scale: sdOf(e) };
  }
  const players = {};
  for (const p of snapshot?.players ?? []) {
    for (const [fam, e] of Object.entries(p.families ?? {})) {
      if (!isNum(e.expected) || e.distribution?.kind === "bernoulli") continue;
      const pts = e.distribution?.points ?? [];
      const q = (qq) => pts.find((x) => x.q === qq)?.v;
      const scale = isNum(e.sd) ? e.sd : isNum(q(0.9)) && isNum(q(0.1)) ? (q(0.9) - q(0.1)) / Z80 : null;
      if (!isNum(scale) || scale <= 0) continue;
      (players[p.playerId] ??= {})[fam] = { expected: e.expected, scale };
    }
  }
  return { snapshotId: snapshot?.snapshotId ?? null, team, players };
}

/**
 * NFL sim-v2 receipt → normalised runs (team-only: the receipt stores final, quarters and drives per run).
 */
export function runsFromNflSimReceipt(receipt) {
  return (receipt?.representativeRuns ?? []).map((r) => ({
    runIndex: r.runIndex,
    sourceKind: r.kind ?? null,
    home: r.final?.home, away: r.final?.away, overtime: r.final?.overtime ?? null,
    periods: r.quarters ? { home: r.quarters.home, away: r.quarters.away } : null,
    drives: r.drives ?? null,
    players: null,
    raw: r,
  }));
}

/** NBA v1 game → normalised runs (team + player lines keyed by providerAthleteId). */
export function runsFromNbaSamples(game) {
  const samples = game?.forecast?.representativeSamples ?? game?.representativeSamples ?? [];
  return samples.map((s) => ({
    runIndex: s.runIndex,
    sourceKind: s.label ?? null,
    home: s.final?.home, away: s.final?.away, overtime: (s.overtimePeriods ?? 0) > 0,
    periods: Array.isArray(s.periods) ? { home: s.periods.map((p) => p.home), away: s.periods.map((p) => p.away) } : null,
    players: [...(s.players?.home ?? []), ...(s.players?.away ?? [])].map((p) => ({ playerId: p.providerAthleteId == null ? null : String(p.providerAthleteId), stats: p })),
    raw: s,
  }));
}

function runValue(run, k) {
  if (k === "home") return run.home;
  if (k === "away") return run.away;
  if (k === "margin") return isNum(run.home) && isNum(run.away) ? run.home - run.away : null;
  if (k === "total") return isNum(run.home) && isNum(run.away) ? run.home + run.away : null;
  return null;
}

/** Distance of one run from the official targets, with its per-term components. */
export function runDistance(run, targets, { playerWeight = REPRESENTATIVE_RULE.playerWeight } = {}) {
  const terms = [];
  for (const [k, t] of Object.entries(targets.team ?? {})) {
    const v = runValue(run, k);
    if (!isNum(v) || !isNum(t.scale) || t.scale <= 0) continue;
    terms.push({ key: k, value: v, expected: t.expected, scale: t.scale, weight: 1, z: (v - t.expected) / t.scale });
  }
  const pterms = [];
  for (const p of run.players ?? []) {
    if (!p.playerId) continue; // never matched by name
    const fams = targets.players?.[p.playerId];
    if (!fams) continue;
    for (const [fam, t] of Object.entries(fams)) {
      const v = p.stats?.[fam];
      if (!isNum(v)) continue;
      pterms.push({ key: `${p.playerId}:${fam}`, value: v, expected: t.expected, scale: t.scale, z: (v - t.expected) / t.scale });
    }
  }
  for (const t of pterms) terms.push({ ...t, weight: playerWeight / pterms.length });
  const W = terms.reduce((s, t) => s + t.weight, 0);
  const distance = W > 0 ? Math.sqrt(terms.reduce((s, t) => s + t.weight * t.z * t.z, 0) / W) : Infinity;
  return { distance, terms };
}

/**
 * @param {Array<object>} runs normalised runs (runsFromNflSimReceipt / runsFromNbaSamples)
 * @param {object} targets officialTargets(snapshot)
 * @returns {{ rule, snapshotId, official: {run, role, label, hypothetical:false, feedsProducts:false} | null,
 *             distance, withinTolerance, components, whatIf: Array<{run, role, kind, label, hypothetical:true, feedsProducts:false, distance}>,
 *             reconciliation: Array<object>, reconciliationRule: string }}
 */
export function selectOfficialRepresentative(runs, targets, opts = {}) {
  const tolerance = opts.tolerance ?? REPRESENTATIVE_RULE.tolerance;
  const scored = (runs ?? [])
    .filter((r) => Number.isInteger(r?.runIndex) && isNum(r.home) && isNum(r.away))
    .map((run) => ({ run, ...runDistance(run, targets, opts) }))
    .sort((a, b) => a.distance - b.distance || a.run.runIndex - b.run.runIndex);
  const best = scored[0] ?? null;
  const official = best && Number.isFinite(best.distance)
    ? { run: best.run, role: RUN_ROLE.OFFICIAL_REPRESENTATIVE, label: OFFICIAL_LABEL, hypothetical: false, feedsProducts: false }
    : null;
  const whatIf = scored
    .filter((s) => s !== best || !official)
    .sort((a, b) => a.run.runIndex - b.run.runIndex)
    .map((s) => ({ run: s.run, role: RUN_ROLE.WHAT_IF, kind: s.run.sourceKind ?? "ALTERNATE", label: WHAT_IF_LABEL, hypothetical: true, feedsProducts: false, distance: s.distance }));
  const reconciliation = official
    ? best.terms.filter((t) => !t.key.includes(":")).map((t) => ({
      term: t.key, officialExpectation: t.expected, simulatedGame: t.value, difference: t.value - t.expected,
      note: Number.isInteger(t.expected) ? "whole-number expectation" : "fractional expectation vs whole-number result",
    }))
    : [];
  return {
    rule: REPRESENTATIVE_RULE.id,
    snapshotId: targets?.snapshotId ?? null,
    official,
    distance: official ? best.distance : null,
    withinTolerance: official ? best.distance <= tolerance : false,
    components: official ? best.terms : [],
    whatIf,
    reconciliation,
    reconciliationRule: RECONCILIATION_RULE,
  };
}
