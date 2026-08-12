/**
 * NFL model v1 — win probability + margin/total distributions (Program 167 · Release E). PRIVATE.
 *
 * WHAT IT IS, exactly: the proven cutoff-versioned Elo strength state (strength-state.mjs,
 * P166-E — params identical to the P151 baseline) as the WIN head, plus two ANALYTICAL
 * distribution heads fitted on the training window:
 *
 *   margin: Normal(a·d, σ_m) where d = elo(home)+HA−elo(away); the slope `a` and residual σ_m
 *           are least-squares fits on training-window walk-forward predictions (never the
 *           evaluation window — cutoffs are declared before evaluation, docs/model card).
 *   total:  Normal(μ_t, σ_t) where μ_t/σ_t are the training window's mean/std of final totals.
 *           Elo carries no scoring-environment signal, so v1's total head is HONESTLY a league
 *           climatology — stated as a limitation, not dressed up as team knowledge.
 *
 * ANALYTICAL, NOT MONTE CARLO: distributions are closed-form normals — no RNG exists in this
 * module, so determinism and no-per-user-rerolls hold by construction (the convergence question
 * Monte Carlo would raise cannot arise). Quantiles are exact normal quantiles.
 *
 * INDEPENDENCE: no odds input exists anywhere in fit or predict. Market data may QUALIFY a
 * shadow run's freshness and provide a no-vig comparison next to this output; it can never leak
 * into the forecast (there is no parameter through which it could).
 *
 * PRESEASON POLICY (the model card's rule, enforced in code): phase-1 games are outside the fit
 * (inherited from the baseline) AND outside prediction coverage — starter participation, roster
 * churn and depth-chart uncertainty make the regular-season fit unfounded there. v1 ABSTAINS on
 * preseason events with a named reason; a preseason prediction from this version is a defect.
 */
import { strengthStateAt, ELO_PARAMS } from "./strength-state.mjs";

export const NFL_MODEL_VERSION = 1;
export const NFL_MODEL_ID = "nfl-model-v1-elo-analytic";

/** Exact standard-normal quantiles for the published bands. */
const Z = Object.freeze({ p10: -1.2815515655446004, p25: -0.6744897501960817, p50: 0, p75: 0.6744897501960817, p90: 1.2815515655446004 });

const isFinal = (r) => /^STATUS_FINAL/.test(r?.statusRaw ?? "");
const teamName = (t) => (typeof t === "string" ? t : t?.abbr ?? t?.name ?? null);

/**
 * Walk-forward over chronological rows: for each eligible game, record the PRE-GAME prediction
 * inputs (elo diff at that moment), then fold the game in. Returns the observation list the
 * distribution heads are fitted on. Preseason rows neither predict nor fit (baseline rule).
 */
export function walkForwardObservations(rows) {
  const { K, HOME_ADVANTAGE, MEAN, SEASON_REGRESSION } = ELO_PARAMS;
  const elo = new Map();
  const get = (t) => elo.get(t) ?? MEAN;
  const obs = [];
  const eligible = (rows ?? [])
    .filter((r) => isFinal(r) && Number.isInteger(r.ftHome) && Number.isInteger(r.ftAway))
    .filter((r) => (r.seasonType ?? r.phase) !== 1)
    .sort((a, b) => String(a.dateUtc).localeCompare(String(b.dateUtc)));
  let lastSeason = null;
  for (const g of eligible) {
    const season = g.season ?? new Date(Date.parse(g.dateUtc)).getUTCFullYear();
    if (lastSeason !== null && season !== lastSeason) {
      for (const [t, r] of elo) elo.set(t, r + (MEAN - r) * SEASON_REGRESSION);
    }
    lastSeason = season;
    const home = teamName(g.home);
    const away = teamName(g.away);
    if (!home || !away) continue;
    const d = get(home) + HOME_ADVANTAGE - get(away);
    const pHome = 1 / (1 + 10 ** (-d / 400));
    obs.push({
      eventKey: g.providerEventId ?? `${away}@${home}:${g.dateUtc}`,
      dateUtc: g.dateUtc,
      season,
      phase: g.seasonType ?? g.phase ?? null,
      eloDiff: d,
      pHome,
      margin: g.ftHome - g.ftAway,
      total: g.ftHome + g.ftAway,
      tie: g.ftHome === g.ftAway,
    });
    if (g.ftHome !== g.ftAway) {
      const score = g.ftHome > g.ftAway ? 1 : 0;
      elo.set(home, get(home) + K * (score - pHome));
      elo.set(away, get(away) + K * ((1 - score) - (1 - pHome)));
    }
  }
  return obs;
}

/**
 * Fit the v1 distribution heads on training rows (STRICTLY the training window — the caller
 * declares the cutoff; this function never sees dates beyond what it is given).
 */
export function fitNflV1(trainingRows) {
  const obs = walkForwardObservations(trainingRows);
  if (obs.length < 100) throw new Error(`fitNflV1: ${obs.length} training observations — below the floor (100) for stable σ estimates`);
  // margin slope through the origin (home advantage already lives inside eloDiff via HA):
  const sxy = obs.reduce((s, o) => s + o.eloDiff * o.margin, 0);
  const sxx = obs.reduce((s, o) => s + o.eloDiff * o.eloDiff, 0);
  const a = sxy / sxx;
  const residuals = obs.map((o) => o.margin - a * o.eloDiff);
  const sigmaMargin = Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / (residuals.length - 1));
  const totals = obs.map((o) => o.total);
  const muTotal = totals.reduce((s, t) => s + t, 0) / totals.length;
  const sigmaTotal = Math.sqrt(totals.reduce((s, t) => s + (t - muTotal) ** 2, 0) / (totals.length - 1));
  const homeWinRate = obs.filter((o) => o.margin > 0).length / obs.length;
  return {
    modelId: NFL_MODEL_ID,
    version: NFL_MODEL_VERSION,
    method: "ANALYTICAL_NORMAL_HEADS_OVER_CUTOFF_ELO",
    params: {
      elo: ELO_PARAMS,
      marginSlope: Number(a.toFixed(6)),
      sigmaMargin: Number(sigmaMargin.toFixed(4)),
      muTotal: Number(muTotal.toFixed(4)),
      sigmaTotal: Number(sigmaTotal.toFixed(4)),
    },
    trainObservations: obs.length,
    trainHomeWinRate: Number(homeWinRate.toFixed(4)),
  };
}

const quantiles = (mean, sigma) =>
  Object.fromEntries(Object.entries(Z).map(([k, z]) => [k, Number((mean + z * sigma).toFixed(2))]));

/**
 * Predict ONE event from a strength state + fitted heads. Pure; refuses preseason with a named
 * abstention (the caller renders the refusal — it is an answer, not an error).
 */
export function predictNflV1({ fit, strengthState, event }) {
  const phase = event?.seasonType ?? event?.phase ?? null;
  if (phase === 1) {
    return {
      state: "ABSTAIN",
      reason: "preseason: v1's fit excludes phase-1 games (starter participation, roster churn, depth-chart uncertainty) — a regular-season fit has no standing here; abstention is the model card's stated policy",
      eventKey: event?.providerEventId ?? null,
    };
  }
  const home = teamName(event?.home);
  const away = teamName(event?.away);
  if (!home || !away) return { state: "ABSTAIN", reason: "participants unresolved — identity is never guessed", eventKey: event?.providerEventId ?? null };
  const d = strengthState.ratingFor(home) + ELO_PARAMS.HOME_ADVANTAGE - strengthState.ratingFor(away);
  const pHome = 1 / (1 + 10 ** (-d / 400));
  const marginMean = fit.params.marginSlope * d;
  return {
    state: "PREDICTED",
    eventKey: event?.providerEventId ?? null,
    modelId: fit.modelId,
    modelVersion: fit.version,
    method: fit.method,
    features: { eloHome: strengthState.ratingFor(home), eloAway: strengthState.ratingFor(away), eloDiffEffective: Number(d.toFixed(2)), strengthCutoffIso: strengthState.cutoffIso },
    probs: { home: Number(pHome.toFixed(6)), away: Number((1 - pHome).toFixed(6)) },
    margin: { mean: Number(marginMean.toFixed(2)), sigma: fit.params.sigmaMargin, quantiles: quantiles(marginMean, fit.params.sigmaMargin) },
    total: { mean: fit.params.muTotal, sigma: fit.params.sigmaTotal, quantiles: quantiles(fit.params.muTotal, fit.params.sigmaTotal), basis: "league climatology over the training window — v1 carries no team-level scoring signal (model-card limitation)" },
  };
}

export { strengthStateAt };
