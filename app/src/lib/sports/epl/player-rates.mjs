/**
 * EPL PLAYER SCORING RATES — the pure fit/predict pair for the anytime-goalscorer model.
 *
 * Deterministic and closed-form: no clocks, no randomness, no fs. The caller owns chronology, which
 * is what makes the leakage boundary checkable — the backtest hands this only matches dated strictly
 * before the one being scored, and a guard asserts that a deeper cutoff cannot see more.
 *
 * THE MODEL, in one line: a player's goals per appearance in a participation state, shrunk toward the
 * league rate for his position in that same state, converted to P(scores at least once).
 *
 * WHY SHRINKAGE IS THE WHOLE DESIGN. Most players in a season have a handful of appearances. Their
 * raw rate is either 0 or an implausible spike, and a model that trusts three appearances will
 * publish 40% next to a defender's name. k pseudo-appearances at the positional rate is the smallest
 * honest correction: a player is believed in proportion to how much he has actually been observed.
 * The preregistration makes the raw rate a BASELINE precisely so this has to earn its place.
 *
 * PARTICIPATION IS A STATE, NOT A MINUTE COUNT. ESPN carries started/subbedIn but no minutes, so a
 * substitute is not modelled as "a starter times 0.25" — he gets his own rate, fitted from
 * substitutes. That is coarser than minutes and it is also honest about what the source contains.
 */

export const EPL_PLAYER_RATES_VERSION = 1;

/**
 * Position groups from ESPN's soccer abbreviations.
 *
 * THE FIRST VERSION OF THIS FUNCTION WAS BADLY WRONG, in a way no metric would have surfaced.
 *
 *   · "SUB" is ESPN's position for a substitute — and it is the single most common value in the
 *     corpus, 13,486 of 30,377 rows. The old test `p.includes("B")` matched it, so every substitute
 *     in the league was classified a DEFENDER.
 *   · "CD-L"/"CD-R" (centre-backs) and "CF-L"/"CF-R" (centre-forwards) both fell through to UNK,
 *     blending the lowest- and highest-scoring outfield positions into a single prior — 15.6% of
 *     rows, and the two groups whose rates differ most.
 *
 * The consequence was not a crash or a visible error. It was a WEAKER POSITIONAL BASELINE, which is
 * the thing the player model is measured against, so the defect flattered the model.
 *
 * Ordering matters here: SUB is checked FIRST because it describes a role, not a position, and the
 * substring tests below would otherwise capture it. Prefix/suffix qualifiers (-L, -R) are stripped
 * before matching rather than guessed at.
 */
export function positionGroup(pos) {
  const raw = String(pos ?? "").toUpperCase().trim();
  if (!raw) return "UNK";
  /* A substitute's listed "position" is his ROLE. It carries no positional information at all. */
  if (raw === "SUB" || raw === "SUBSTITUTE") return "SUB";
  const p = raw.replace(/[-_](L|R|C)$/, "");                // CD-L → CD, AM-R → AM
  if (p === "G" || p === "GK") return "G";
  if (["F", "ST", "CF", "SS", "LW", "RW", "W", "LF", "RF"].includes(p)) return "F";
  if (["M", "AM", "DM", "CM", "LM", "RM", "MF", "WM"].includes(p)) return "M";
  if (["D", "CD", "CB", "LB", "RB", "LWB", "RWB", "WB", "SW", "DF"].includes(p)) return "D";
  return "UNK";
}

/** A player's participation in one match, or null when he did not appear. */
export function participationState(row) {
  if (row.started) return "START";
  if (row.subbedIn) return "SUB";
  return null;
}

/**
 * Fold appearances into per-player and per-position tallies.
 * @param {Array<object>} rows player-match rows; the CALLER must pass only pre-cutoff matches.
 */
export function fitPlayerRates(rows) {
  const byPlayer = new Map();   // playerId → state → { app, goals }
  const byPosition = new Map(); // group|state → { app, goals }
  const positionOf = new Map(); // playerId → group (most recent wins)

  for (const r of rows ?? []) {
    const state = participationState(r);
    if (!state) continue;                                   // a non-appearance carries no scoring rate
    const g = positionGroup(r.position);
    positionOf.set(String(r.playerId), g);

    const pk = String(r.playerId);
    if (!byPlayer.has(pk)) byPlayer.set(pk, {});
    const ps = byPlayer.get(pk);
    ps[state] = ps[state] ?? { app: 0, goals: 0 };
    ps[state].app += 1;
    ps[state].goals += Number(r.goals ?? 0);

    const ok = `${g}|${state}`;
    if (!byPosition.has(ok)) byPosition.set(ok, { app: 0, goals: 0 });
    const os = byPosition.get(ok);
    os.app += 1;
    os.goals += Number(r.goals ?? 0);
  }

  let allApp = 0, allGoals = 0;
  for (const v of byPosition.values()) { allApp += v.app; allGoals += v.goals; }

  return {
    version: EPL_PLAYER_RATES_VERSION,
    byPlayer,
    byPosition,
    positionOf,
    leagueRate: allApp ? allGoals / allApp : 0.1,
    appearancesFitted: allApp,
  };
}

/** The positional rate for a group+state, falling back to the league rate when the cell is thin. */
export function positionalRate(fit, group, state) {
  const cell = fit.byPosition.get(`${group}|${state}`);
  if (cell && cell.app >= 20) return cell.goals / cell.app;
  return fit.leagueRate;
}

/**
 * Expected goals for one player in one match, and the resulting P(scores at least once).
 *
 * `teamContext` scales lambda by how many goals this player's team is expected to score relative to
 * the league average. Off by default: it is a hyperparameter the preregistration says is decided on
 * DEVELOPMENT only, never assumed.
 */
export function predictPlayer(fit, { playerId, position, state, teamContext = 1 }, { k = 8 } = {}) {
  if (!state) return null;                                  // no appearance ⇒ no claim
  const group = positionGroup(position) !== "UNK" ? positionGroup(position) : (fit.positionOf.get(String(playerId)) ?? "UNK");
  const prior = positionalRate(fit, group, state);
  const own = fit.byPlayer.get(String(playerId))?.[state] ?? { app: 0, goals: 0 };

  /*
   * Bayesian shrinkage: k pseudo-appearances at the positional rate. k = 0 is the raw rate, and the
   * preregistration scores that separately as a baseline so the correction has to be worth its cost.
   */
  const rate = (own.goals + k * prior) / (own.app + k);
  const lambda = Math.max(0, rate * teamContext);
  return {
    lambda,
    probability: 1 - Math.exp(-lambda),
    appearances: own.app,
    group,
    prior,
  };
}

/** The raw (unshrunk) baseline: the player's own rate, positional when he has never appeared. */
export function predictRaw(fit, { playerId, position, state }) {
  if (!state) return null;
  const group = positionGroup(position) !== "UNK" ? positionGroup(position) : (fit.positionOf.get(String(playerId)) ?? "UNK");
  const own = fit.byPlayer.get(String(playerId))?.[state] ?? { app: 0, goals: 0 };
  const rate = own.app > 0 ? own.goals / own.app : positionalRate(fit, group, state);
  return { lambda: rate, probability: 1 - Math.exp(-rate), appearances: own.app, group };
}

/** The positional baseline: the league rate for this position and participation state. */
export function predictPositional(fit, { playerId, position, state }) {
  if (!state) return null;
  const group = positionGroup(position) !== "UNK" ? positionGroup(position) : (fit.positionOf.get(String(playerId)) ?? "UNK");
  const rate = positionalRate(fit, group, state);
  return { lambda: rate, probability: 1 - Math.exp(-rate), group };
}

/* ── COUNT MARKETS (shots, shots on goal) ───────────────────────────────────────────────────────
 *
 * Goals are effectively binary at the player level — almost nobody scores twice — so the goalscorer
 * model converts a rate straight to P(at least one) under a Poisson assumption and that is close
 * enough to be invisible. Shots are NOT: the design data puts variance over mean at 1.79 for shots
 * and 1.33 for shots on goal, where Poisson requires exactly 1.0.
 *
 * That overdispersion has a direction. A Poisson fitted to an overdispersed count UNDERSTATES the
 * chance of zero and overstates the middle, so it would quietly push every "one or more shots"
 * probability upward — a calibration failure that a log-loss-only view can easily survive.
 *
 * So the distribution is a parameter here, and the negative binomial is available with its
 * dispersion estimated from the same pool the rates come from. Nothing selects between them at
 * runtime; the preregistration says that choice is made on development data and locked.
 */

/** Fold a COUNT field into per-player and per-position tallies, plus the dispersion of the pool. */
export function fitCountRates(rows, field) {
  const byPlayer = new Map();
  const byPosition = new Map();
  const positionOf = new Map();
  let all = 0, allSum = 0, allSq = 0;

  for (const r of rows ?? []) {
    const state = participationState(r);
    if (!state) continue;
    const v = Number(r[field] ?? 0);
    const g = positionGroup(r.position);
    positionOf.set(String(r.playerId), g);

    const pk = String(r.playerId);
    if (!byPlayer.has(pk)) byPlayer.set(pk, {});
    const ps = byPlayer.get(pk);
    ps[state] = ps[state] ?? { app: 0, sum: 0 };
    ps[state].app += 1; ps[state].sum += v;

    const ok = `${g}|${state}`;
    if (!byPosition.has(ok)) byPosition.set(ok, { app: 0, sum: 0 });
    const os = byPosition.get(ok);
    os.app += 1; os.sum += v;

    all += 1; allSum += v; allSq += v * v;
  }

  const mean = all ? allSum / all : 0;
  const variance = all > 1 ? (allSq - all * mean * mean) / (all - 1) : mean;
  /*
   * Method-of-moments dispersion for the negative binomial: var = mu + mu^2 / r. When the pool is
   * NOT overdispersed the formula has no positive solution, and the honest answer there is Poisson —
   * so `null` is returned rather than a huge r standing in for one.
   */
  const dispersion = variance > mean && mean > 0 ? (mean * mean) / (variance - mean) : null;

  return { byPlayer, byPosition, positionOf, leagueRate: mean, appearancesFitted: all, mean, variance, dispersion };
}

/** The positional rate for a count field, falling back to the league mean on a thin cell. */
export function positionalCountRate(fit, group, state) {
  const cell = fit.byPosition.get(`${group}|${state}`);
  if (cell && cell.app >= 20) return cell.sum / cell.app;
  return fit.leagueRate;
}

/**
 * P(count >= 1) for a rate, under the chosen distribution.
 *
 * Poisson:  1 - exp(-lambda)
 * NegBin:   1 - (r / (r + lambda))^r   — heavier at zero, which is exactly the correction an
 *           overdispersed count needs and the reason this option exists.
 */
export function probAtLeastOne(lambda, { distribution = "poisson", dispersion = null } = {}) {
  if (lambda <= 0) return 0;
  if (distribution === "negbin" && dispersion != null && dispersion > 0) {
    return 1 - Math.pow(dispersion / (dispersion + lambda), dispersion);
  }
  return 1 - Math.exp(-lambda);
}

/** Shrunk count projection for one player in one state. */
export function predictCount(fit, { playerId, position, state }, { k = 8, distribution = "poisson" } = {}) {
  if (!state) return null;
  const group = positionGroup(position) !== "UNK" ? positionGroup(position) : (fit.positionOf.get(String(playerId)) ?? "UNK");
  const prior = positionalCountRate(fit, group, state);
  const own = fit.byPlayer.get(String(playerId))?.[state] ?? { app: 0, sum: 0 };
  const lambda = (own.sum + k * prior) / (own.app + k);
  return {
    lambda,
    probability: probAtLeastOne(lambda, { distribution, dispersion: fit.dispersion }),
    appearances: own.app,
    group,
    prior,
  };
}

/** Raw (unshrunk) count baseline. */
export function predictCountRaw(fit, { playerId, position, state }, { distribution = "poisson" } = {}) {
  if (!state) return null;
  const group = positionGroup(position) !== "UNK" ? positionGroup(position) : (fit.positionOf.get(String(playerId)) ?? "UNK");
  const own = fit.byPlayer.get(String(playerId))?.[state] ?? { app: 0, sum: 0 };
  const lambda = own.app > 0 ? own.sum / own.app : positionalCountRate(fit, group, state);
  return { lambda, probability: probAtLeastOne(lambda, { distribution, dispersion: fit.dispersion }), appearances: own.app, group };
}

/** Positional count baseline. */
export function predictCountPositional(fit, { playerId, position, state }, { distribution = "poisson" } = {}) {
  if (!state) return null;
  const group = positionGroup(position) !== "UNK" ? positionGroup(position) : (fit.positionOf.get(String(playerId)) ?? "UNK");
  const lambda = positionalCountRate(fit, group, state);
  return { lambda, probability: probAtLeastOne(lambda, { distribution, dispersion: fit.dispersion }), group };
}
