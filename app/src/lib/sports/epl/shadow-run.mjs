/**
 * EPL shadow-run workflow (Program 167 · Release G) — per-fixture ladder from the committed
 * 2026-27 fixture capture to a private CURRENT_PRE_EVENT artifact or a first-class refusal.
 *
 * LADDER (first hit wins):
 *   REFUSED_POST_START   run clock at/after kickoff
 *   ABSTAIN(IDENTITY)    a club resolves neither to corpus history NOR to the committed
 *                        promoted-club list — an unknown name is drift, never a cold start
 *   READY_EXCEPT_ODDS    model would predict; no fresh authorized THREE-WAY market exists —
 *                        no probabilities are emitted on this rung
 *   CURRENT_PRE_EVENT    all inputs qualify pre-start → validateShadowRun-clean artifact
 *
 * LINEUP POLICY (the model card's rule): team-level v1 deliberately excludes lineups —
 * `lineups: NOT_REQUIRED_FOR_TEAM_V1` is RECORDED on every run, and this module contains no
 * lineup parameter through which one could leak. The claim is team-level forecasting only.
 *
 * PROMOTED CLUBS 2026-27 (verified against corpus overlap, Release G): Coventry City and Hull
 * City have no corpus history — they enter at league-average multipliers by the committed
 * cold-start rule. Any OTHER unknown club name is an identity defect and abstains.
 */
import { fitEplStrength, scoreMatrix, normalizeClubName } from "./strength-state.mjs";
import { validateShadowRun } from "../research/shadow-contract.mjs";
import { noVigThreeWay } from "../odds/market-scope.mjs";

export const EPL_SHADOW_VERSION = 1;

/** Committed, verified list — a new season's promotions change this ONLY with a fresh overlap receipt. */
export const PROMOTED_CLUBS_2026_27 = Object.freeze(["coventry city", "hull city"]);

export function runEplShadow({ fixture, nowIso, strengthState, oddsSnapshot = null, oddsFreshnessHours = 6, promotedClubs = PROMOTED_CLUBS_2026_27 }) {
  const kickoff = Date.parse(fixture?.kickoffIso ?? "");
  const now = Date.parse(nowIso ?? "");
  if (!Number.isFinite(now)) throw new Error("runEplShadow: nowIso required");
  const base = { version: EPL_SHADOW_VERSION, eventId: fixture?.eventId ?? null, matchup: fixture ? `${fixture.homeClub} v ${fixture.awayClub}` : null, kickoffUtc: fixture?.kickoffIso ?? null, ranAt: nowIso, lineupPolicy: "NOT_REQUIRED_FOR_TEAM_V1 — team-level model by design; no lineup parameter exists (model-card limitation)" };

  if (!Number.isFinite(kickoff) || now >= kickoff) {
    return { ...base, state: "REFUSED_POST_START", reason: "run clock at/after kickoff (or kickoff unparseable) — post-start generation is refused" };
  }

  for (const side of ["homeClub", "awayClub"]) {
    const nm = normalizeClubName(fixture[side]);
    if (!strengthState.knownClubs.has(nm) && !promotedClubs.includes(nm)) {
      return { ...base, state: "ABSTAIN", rule: "IDENTITY", reason: `"${fixture[side]}" is neither corpus-known nor on the verified promoted-club list — an unrecognized name is naming drift, never a silent cold start`, publicActivation: "OFF" };
    }
  }

  const matrix = scoreMatrix(strengthState, fixture.homeClub, fixture.awayClub);

  const capAt = Date.parse(oddsSnapshot?.capturedAt ?? "");
  const oddsFresh = Number.isFinite(capAt) && capAt < kickoff && capAt <= now && (now - capAt) / 3_600_000 <= oddsFreshnessHours;
  /*
   * THE CAPTURE AND THIS CONSUMER SPOKE DIFFERENT SHAPES, so no EPL fixture could ever price.
   *
   * capture-epl-odds.mjs publishes ONE row per fixture carrying `matchResult` — a median across
   * books, already de-vigged. This filter required `marketType`/`market`, which those rows do not
   * have, so `threeWay` was always empty and every fixture reported READY_EXCEPT_ODDS. Proven by
   * running the shadow against odds ONE HOUR old: still refused, so it was never staleness.
   * Identical in kind to the UFC de-vig path being reachable from nothing.
   *
   * Both shapes are accepted now. The per-book form stays first-class; the consensus form is
   * adapted below and LABELLED as what it is, never dressed up as a bookmaker that posted a price.
   */
  const rowsFor = (oddsSnapshot?.rows ?? []).filter((r) => r.eventId === fixture.eventId || r.providerEventId === fixture.eventId);
  const threeWay = rowsFor.filter((r) => r.marketType === "h2h" || r.market === "MATCH_RESULT_1X2" || Array.isArray(r.matchResult));
  if (!oddsFresh || threeWay.length === 0) {
    return {
      ...base,
      state: "READY_EXCEPT_ODDS",
      reason: oddsSnapshot ? "odds snapshot stale/post-start or carries no three-way rows for this fixture — probabilities withheld" : "no authorized odds snapshot — the pre-authorization end state; probabilities withheld, not approximated",
      coldStart: matrix.coldStart,
      publicActivation: "OFF",
    };
  }

  const market = { bookmakers: [], quarantined: [] };
  for (const row of threeWay) {
    /*
     * `matchResult` carries the RAW median american price per outcome alongside the capture's own
     * noVig figure. We feed the RAW price to noVigThreeWay and let this layer do its own de-vig —
     * taking the pre-de-vigged number would de-vig it twice and quietly shrink the favourite.
     */
    const outcomes = row.outcomes
      ?? (Array.isArray(row.matchResult)
        ? row.matchResult.map((o) => ({ name: o.outcome, price: o.american }))
        : row.prices ? [
          { name: "HOME", price: row.prices.HOME }, { name: "DRAW", price: row.prices.DRAW }, { name: "AWAY", price: row.prices.AWAY },
        ] : []);
    const nv = noVigThreeWay(outcomes);
    // A consensus row is not a bookmaker. Name it for what it is, with the book count it came from,
    // so nothing downstream can read a median as a single book's posted price.
    const books = Array.isArray(row.matchResult) ? (row.matchResult[0]?.books ?? null) : null;
    const source = row.bookmaker ?? row.book ?? (books ? `consensus(median of ${books} books)` : "consensus(median)");
    if (nv.ok) market.bookmakers.push({ bookmaker: source, impliedSum: nv.impliedSum, noVig: nv.noVig, sourceAsOf: row.sourceAsOf ?? row.capturedAt ?? oddsSnapshot.capturedAt });
    else market.quarantined.push({ bookmaker: source, reason: nv.reason });
  }
  if (market.bookmakers.length === 0) {
    return { ...base, state: "READY_EXCEPT_ODDS", reason: `every three-way row refused de-vig (${market.quarantined.map((q) => q.reason).join("; ")}) — a market without its draw or with corrupt prices never qualifies`, publicActivation: "OFF" };
  }

  const artifact = {
    schemaVersion: 1,
    artifact: "epl-shadow-run",
    sport: "epl",
    mode: "CURRENT_PRE_EVENT",
    generatedAt: nowIso,
    deterministicId: `${fixture.eventId}:${strengthState.modelId}:${nowIso}`,
    event: { canonicalEventId: fixture.eventId, scheduledStartUtc: fixture.kickoffIso, matchup: `${fixture.homeClub} v ${fixture.awayClub}`, matchweek: fixture.matchweek ?? null },
    evidence: [
      { source: "fixture capture (committed row)", asOfIso: fixture.capturedAt },
      { source: `strength state (${strengthState.matchesFitted} matches < ${strengthState.cutoffIso})`, asOfIso: strengthState.cutoffIso },
      { source: "odds snapshot (authorized, three-way)", asOfIso: oddsSnapshot.capturedAt },
    ],
    /*
     * The whole matrix, not a summary of it. This carried probs/totals/topScorelines/lambdas and
     * dropped the rest, so every derived market the grid already answered — both teams to score,
     * clean sheets, the line ladder, each side's own goal distribution, the margin — was computed
     * and discarded one layer before the artifact. Passing the block through costs nothing: these
     * are the same grid sums, so they cannot disagree with `probs`.
     */
    model: {
      state: "PREDICTED",
      modelId: strengthState.modelId,
      probs: matrix.oneXTwo,
      totals: matrix.totals,
      teamGoals: matrix.teamGoals,
      btts: matrix.btts,
      cleanSheet: matrix.cleanSheet,
      doubleChance: matrix.doubleChance,
      margin: matrix.margin,
      topScorelines: matrix.topScorelines,
      topScorelinesMass: matrix.topScorelinesMass,
      lambdas: matrix.lambdas,
      coldStart: matrix.coldStart,
    },
    market,
    qualification: { lineupPolicy: base.lineupPolicy, oddsFresh: true, freshnessBoundHours: oddsFreshnessHours },
    publicActivation: "OFF",
    settlementLinkage: "PENDING_OFFICIAL_RESULT",
    evaluationEligible: false,
    provenance: `epl shadow-run v${EPL_SHADOW_VERSION}: ${strengthState.modelId} over ${strengthState.matchesFitted} matches; market from authorized snapshot ${oddsSnapshot.capturedAt} (${market.bookmakers.length} bookmaker(s), ${market.quarantined.length} refused)`,
  };
  const check = validateShadowRun(artifact);
  if (!check.ok) return { ...base, state: "ABSTAIN", rule: "VALIDATION", reason: `shadow validation refused: ${check.errors.join("; ")}`, publicActivation: "OFF" };
  return { ...base, state: "CURRENT_PRE_EVENT", artifact };
}
