/**
 * NFL anytime-touchdown scorer engine (Program 169 · Release F). PRIVATE, ANYTIME_TOUCHDOWN only.
 *
 * ARCHITECTURE: team scoring first, players second. The engine consumes the game-sim's team
 * score distribution, converts points to an offensive-TD count distribution through a fitted
 * points→TD mapping (fit from corpus finals: see evaluate script; until that receipt exists the
 * mapping refuses), then allocates scorer probability across an ELIGIBLE pool via role shares
 * with a MANDATORY residual (defense/ST/unlisted players) — the visible list is never forced to
 * 100%. One team TD is ONE scoring event: the passer never double-counts with the receiver here
 * (passing-TD credit is a settlement distinction, not a second team touchdown).
 *
 * PUBLICATION GATES (every one must pass; a player can be modelled yet unpublishable):
 *   participation  ACTIVE_PROJECTED or ACTIVE_CONFIRMED (ROLE_UNCERTAIN/QUESTIONABLE abstain)
 *   roleShare      a source-backed share (snap scenario share or corpus-derived role) — never a
 *                  depth-chart guess
 *   scorerPrice    a fresh authorized market price for THIS player (AUTH_REQUIRED today)
 *   calibration    a committed calibration receipt for the mapping version (evaluate script)
 * V1 keeps FIRST_TD / LAST_TD / 2+ / defensive scorer markets DISABLED — separate models.
 */
import { validateAllocation } from "./participation.mjs";

export const NFL_TD_ENGINE_VERSION = 1;
export const NFL_TD_ENGINE_ID = "nfl-td-engine-v1-team-first";

/** Poisson pmf helper for the TD-count layer. */
const pois = (lam, k) => Math.exp(-lam) * lam ** k / [1, 1, 2, 6, 24, 120, 720, 5040, 40320, 362880, 3628800][k];

/**
 * Team offensive-TD distribution from expected points. The λ mapping (tdPerPoint + intercept)
 * must come from a COMMITTED calibration receipt; absent one, this refuses — points cannot be
 * turned into touchdowns by vibes.
 */
export function teamTdDistribution({ expectedPoints, mapping }) {
  if (!mapping?.receipt || typeof mapping?.lambdaPerPoint !== "number" || typeof mapping?.lambdaIntercept !== "number") {
    return { state: "REFUSED", reason: "no committed points→TD calibration receipt — the mapping is fit evidence, never a constant chosen by taste" };
  }
  if (!(expectedPoints >= 0)) return { state: "REFUSED", reason: "expected points missing" };
  const lambda = Math.max(0.05, mapping.lambdaIntercept + mapping.lambdaPerPoint * expectedPoints);
  const dist = Array.from({ length: 9 }, (_, k) => pois(lambda, k));
  const z = dist.reduce((s, p) => s + p, 0);
  return { state: "OK", lambda: Number(lambda.toFixed(4)), distribution: dist.map((p) => Number((p / z).toFixed(6))), receipt: mapping.receipt };
}

/**
 * Anytime-TD probability for one eligible player given the team TD distribution and the player's
 * per-TD probability share: P(anytime) = 1 − Σ_k P(K=k)·(1−share)^k.
 */
export function anytimeTdProbability({ teamTd, perTdShare }) {
  if (teamTd?.state !== "OK") return { state: "REFUSED", reason: teamTd?.reason ?? "team TD distribution unavailable" };
  if (!(perTdShare >= 0) || perTdShare > 1) return { state: "REFUSED", reason: "per-TD share must be in [0,1]" };
  let miss = 0;
  teamTd.distribution.forEach((p, k) => { miss += p * (1 - perTdShare) ** k; });
  // clamp: the stored distribution is rounded to 6dp, so 1−Σ can land at ±1e−6 around the edges
  return { state: "OK", probability: Number(Math.min(1, Math.max(0, 1 - miss)).toFixed(6)) };
}

/**
 * Build the scorer board for one team. Every player gets a typed state; publishable rows demand
 * every gate. Shares must reconcile (validateAllocation's TD rule) before anything is computed.
 */
export function buildScorerBoard({ event, teamAbbr, teamSim, mapping, pool, roleShares, scorerPrices = null, calibrationReceipt = null, nowIso }) {
  const base = { version: NFL_TD_ENGINE_VERSION, engineId: NFL_TD_ENGINE_ID, providerEventId: event?.providerEventId ?? null, teamAbbr, ranAt: nowIso, market: "ANYTIME_TOUCHDOWN" };
  if (teamSim?.state !== "SIMULATED") return { ...base, state: "REFUSED", reason: "no team simulation — players are allocated from team scoring, never modelled free-floating" };

  const side = teamAbbr === event?.home?.abbr ? "home" : teamAbbr === event?.away?.abbr ? "away" : null;
  if (!side) return { ...base, state: "REFUSED", reason: `teamAbbr ${teamAbbr} belongs to neither side of ${event?.providerEventId ?? "the event"} — a board is never built for a spectator team (P171-C guard)` };
  const expectedPoints = teamSim.scores[side]?.mean;
  const teamTd = teamTdDistribution({ expectedPoints, mapping });
  if (teamTd.state !== "OK") return { ...base, state: "REFUSED", reason: teamTd.reason };

  const shares = roleShares?.players ?? [];
  const coherence = validateAllocation({
    teamPassAttempts: roleShares?.teamPassAttempts ?? 0,
    teamRushAttempts: roleShares?.teamRushAttempts ?? 0,
    teamOffensiveTds: 0,
    players: shares.map((s) => ({ playerId: s.playerId, tdProbabilityShare: s.perTdShare })),
    residual: { label: roleShares?.residualLabel ?? "defense/ST/unlisted", tdProbabilityShare: roleShares?.residualShare },
  });
  if (!coherence.ok) return { ...base, state: "REFUSED", reason: `share incoherence: ${coherence.errors.join("; ")}` };

  const poolByPlayer = new Map((pool?.players ?? []).map((p) => [p.playerId, p]));
  const rows = shares.map((s) => {
    const part = poolByPlayer.get(s.playerId);
    const gates = {
      participation: part?.state === "ACTIVE_PROJECTED" || part?.state === "ACTIVE_CONFIRMED" ? "PASS" : `FAIL(${part?.state ?? "NOT_IN_POOL"})`,
      roleShare: s.shareBasis ? "PASS" : "FAIL(no source-backed basis)",
      scorerPrice: scorerPrices?.[s.playerId] != null ? "PASS" : "FAIL(AUTH_REQUIRED — no authorized current price)",
      calibration: calibrationReceipt ? "PASS" : "FAIL(no committed calibration receipt)",
    };
    const publishable = Object.values(gates).every((g) => g === "PASS");
    const prob = anytimeTdProbability({ teamTd, perTdShare: s.perTdShare });
    return {
      playerId: s.playerId,
      name: s.name ?? null,
      participation: part?.state ?? "NOT_IN_POOL",
      perTdShare: s.perTdShare,
      shareBasis: s.shareBasis ?? null,
      modelProbability: prob.state === "OK" ? prob.probability : null,
      gates,
      state: publishable ? "PUBLISHABLE" : "MODELLED_NOT_PUBLISHABLE",
    };
  });
  return {
    ...base,
    state: "BOARD",
    teamTd: { lambda: teamTd.lambda, receipt: teamTd.receipt },
    residual: { label: roleShares?.residualLabel ?? "defense/ST/unlisted", share: roleShares?.residualShare, note: "one team TD is ONE scoring event — passer/receiver credit is a settlement distinction, never a second touchdown" },
    rows,
    counts: { publishable: rows.filter((r) => r.state === "PUBLISHABLE").length, modelled: rows.length },
    publicActivation: "OFF",
  };
}

/** Anytime-TD settlement rules (winner credit = the SCORING player; passer credit never settles this market). */
export function settleAnytimeTd({ playerId, officialScorers, playerStatus }) {
  if (playerStatus === "POSTPONED") return { outcome: "VOID", reason: "event postponed — void per market rules" };
  if (playerStatus === "INACTIVE" || playerStatus === "DNP") return { outcome: "VOID", reason: `${playerStatus} — did not play voids anytime-TD` };
  if (!Array.isArray(officialScorers)) return { outcome: "PENDING", reason: "no official scorer record yet — pending is never a loss" };
  const scored = officialScorers.some((s) => s.playerId === playerId && ["RUSH", "RECEIVE", "RETURN", "RECOVERY"].includes(s.creditType));
  const threwOnly = officialScorers.some((s) => s.playerId === playerId && s.creditType === "PASS") && !scored;
  if (scored) return { outcome: "WIN", reason: "official record credits this player as the scorer" };
  if (threwOnly) return { outcome: "LOSS", reason: "passing-TD credit only — the passer is not the scoring player for anytime-TD" };
  return { outcome: "LOSS", reason: "no official scoring credit" };
}

/**
 * Pool flattening (Program 171 · Release C): blend each eligible-pool share toward the pool
 * mean, s' = (1−β)s + β·S/n. Σ shares is preserved EXACTLY (so the residual and
 * validateAllocation's reconciliation are untouched) — the calibration receipt selected β on
 * train because raw decayed TD shares over-concentrate on stars.
 */
export function flattenPoolShares(shares, beta) {
  if (!Array.isArray(shares) || !shares.length) return [];
  if (!(beta > 0)) return shares.slice();
  const mean = shares.reduce((a, s) => a + s, 0) / shares.length;
  return shares.map((s) => (1 - beta) * s + beta * mean);
}

/**
 * Load the committed anytime-TD calibration receipt (Program 171 · Release C). Supplies the
 * `calibration` gate evidence plus the pool-flattening β consumers must apply. Null keeps the
 * engine's refusal path intact.
 */
export function loadTdCalibrationReceipt({ fs, path, cwd }) {
  try {
    const p = path.join(cwd, "..", "data/internal/research/nfl/reports/anytime-td-v1-calibration.json");
    const r = JSON.parse(fs.readFileSync(p, "utf8"));
    if (typeof r?.heldOut2025?.ece !== "number" || typeof r?.shareParams?.poolFlattenBeta !== "number") return null;
    return {
      receipt: `${r.artifact}@${r.generatedAt}`,
      ece: r.heldOut2025.ece,
      logLoss: r.heldOut2025.model.logLoss,
      brier: r.heldOut2025.model.brier,
      n: r.heldOut2025.n,
      poolFlattenBeta: r.shareParams.poolFlattenBeta,
      shareParams: r.shareParams,
    };
  } catch { return null; }
}

/**
 * Load the committed points→TD calibration receipt (Program 170 · Release B). Returns the
 * mapping teamTdDistribution() requires, or null when no receipt exists — the engine's refusal
 * path stays intact; this loader can only ever supply a REAL committed fit.
 */
export function loadScoringBridgeMapping({ fs, path, cwd }) {
  try {
    const p = path.join(cwd, "..", "data/internal/research/nfl/reports/scoring-bridge-v1.json");
    const r = JSON.parse(fs.readFileSync(p, "utf8"));
    if (typeof r?.mapping?.lambdaPerPoint !== "number" || typeof r?.mapping?.lambdaIntercept !== "number" || !r?.mapping?.receipt) return null;
    return { lambdaPerPoint: r.mapping.lambdaPerPoint, lambdaIntercept: r.mapping.lambdaIntercept, receipt: r.mapping.receipt, trainPassShare: r.mapping.trainPassShare ?? null };
  } catch { return null; }
}
