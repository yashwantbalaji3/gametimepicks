/**
 * NFL role/opportunity shares (Program 171 · Release A). PRIVATE RESEARCH.
 *
 * Derives per-player shares of team opportunities (pass attempts, rush attempts, targets,
 * scorer touchdowns) from the committed P170 player-event corpus, with EFFECTIVE-DATED
 * membership: a share only accumulates inside one player↔team stint; a team change resets
 * evidence to zero (the new team's usage is unknown until observed). Season boundaries decay
 * evidence by a walk-forward-selected factor — never a taste constant.
 *
 * ESTIMATOR: exponentially decayed per-game shares shrunk toward ZERO by a pseudo-weight k:
 *   share = Σ w_i·s_i / (Σ w_i + k),  w_i = boundaryDecay^(seasonsCrossed) · 0.5^(gamesAgo/halfLife)
 * Shrinking toward zero (not a league mean) sends uncertain mass to the OTHER/UNALLOCATED
 * residual — the visible list is never forced to 100% (participation.mjs's allocation rule).
 *
 * HYPERPARAMETERS are selected by walk-forward on 2023–24 only and applied ONCE to 2025
 * (the held-out season). The metric is total-variation distance between the predicted
 * allocation vector (known players + OTHER) and the realized one: the fraction of team
 * opportunities misallocated. Baselines: last-game share, rolling-4 mean, season-to-date
 * mean, uniform over previously seen players.
 *
 * PRESEASON: seasonType 1 games neither fit nor evaluate role shares (coach scripts, not
 * roles). Preseason usage is reported as a separate diagnostic slice only.
 */

export const NFL_ROLE_SHARES_VERSION = 1;
export const NFL_ROLE_SHARES_ID = "nfl-role-shares-v1-decayed-stint";

export const SHARE_FAMILIES = Object.freeze(["passAttempts", "rushAttempts", "targets", "scorerTd"]);

/** Per-player numerators for each share family, absent-safe (missing stat groups are typed absent). */
export function familyNumerator(row, family) {
  if (family === "passAttempts") return row.passAtt ?? 0;
  if (family === "rushAttempts") return row.rushAtt ?? 0;
  if (family === "targets") return row.targets ?? 0;
  if (family === "scorerTd") return (row.rushTd ?? 0) + (row.recTd ?? 0);
  throw new Error(`unknown share family ${family} — the family set is closed`);
}

/** One team's opportunity totals for one corpus game (both-team games list, filtered by abbr). */
export function teamGameTotals(game, teamAbbr) {
  const rows = (game.players ?? []).filter((p) => p.teamAbbr === teamAbbr);
  const totals = {};
  for (const fam of SHARE_FAMILIES) totals[fam] = rows.reduce((s, r) => s + familyNumerator(r, fam), 0);
  return { totals, rows };
}

/**
 * Segment one player's chronological game list into team stints. A stint is a maximal run of
 * games with one teamAbbr; membership is effective-dated by the games themselves.
 */
export function segmentStints(games) {
  const stints = [];
  for (const g of games) {
    const last = stints[stints.length - 1];
    if (last && last.teamAbbr === g.teamAbbr) last.games.push(g);
    else stints.push({ teamAbbr: g.teamAbbr, games: [g] });
  }
  return stints;
}

/**
 * Decayed shrunk share from chronological observations [{share, season}] with the newest LAST.
 * `seasonOf` the game being predicted supplies the boundary count for each observation.
 */
export function decayedShare({ observations, predictSeason, halfLifeGames, shrinkK, boundaryDecay }) {
  let num = 0;
  let wsum = 0;
  const n = observations.length;
  for (let i = 0; i < n; i += 1) {
    const gamesAgo = n - 1 - i;
    const seasonsCrossed = Math.max(0, predictSeason - observations[i].season);
    const w = (halfLifeGames === Infinity ? 1 : 0.5 ** (gamesAgo / halfLifeGames)) * boundaryDecay ** seasonsCrossed;
    num += w * observations[i].share;
    wsum += w;
  }
  return { share: wsum + shrinkK > 0 ? num / (wsum + shrinkK) : 0, nEff: wsum, games: n };
}

/** Total-variation distance between two allocation maps over the union of keys (incl. OTHER). */
export function tvDistance(predicted, actual) {
  const keys = new Set([...Object.keys(predicted), ...Object.keys(actual)]);
  let d = 0;
  for (const k of keys) d += Math.abs((predicted[k] ?? 0) - (actual[k] ?? 0));
  return d / 2;
}

/**
 * Walk-forward share prediction for one team-game: for every player with prior observations in
 * the SAME stint (this team, games strictly before this one), estimate a share; the remainder is
 * OTHER. Returns { shares: {playerId → share}, other } with Σ shares + other === 1 (±float).
 */
export function predictAllocation({ history, predictSeason, params }) {
  const shares = {};
  let sum = 0;
  for (const [playerId, observations] of history) {
    if (!observations.length) continue;
    const est = decayedShare({ observations, predictSeason, ...params });
    if (est.share > 0) {
      shares[playerId] = est.share;
      sum += est.share;
    }
  }
  // Shares are per-player fractions of team opportunities; the estimator shrinks toward zero so
  // Σ ≤ 1 in expectation, but a roster of hot hands can exceed 1 — renormalize ONLY then.
  if (sum > 1) {
    for (const k of Object.keys(shares)) shares[k] /= sum;
    sum = 1;
  }
  return { shares, other: Math.max(0, 1 - sum) };
}

/** Realized allocation for one team-game over the same universe: unseen players fold into OTHER. */
export function realizedAllocation({ rows, family, knownPlayerIds }) {
  const total = rows.reduce((s, r) => s + familyNumerator(r, family), 0);
  const out = {};
  let known = 0;
  if (total <= 0) return { empty: true, shares: {}, other: 1 };
  for (const r of rows) {
    const v = familyNumerator(r, family);
    if (v <= 0) continue;
    if (knownPlayerIds.has(r.playerId)) {
      out[r.playerId] = (out[r.playerId] ?? 0) + v / total;
      known += v / total;
    }
  }
  return { empty: false, shares: out, other: Math.max(0, 1 - known) };
}

/**
 * Validate a role-share family block the way participation.mjs's allocation rule will see it:
 * every share in [0,1], residual present, and Σ shares + residual === 1 within 1e-6.
 */
export function validateShareBlock(block) {
  const errors = [];
  if (!block || !Array.isArray(block.players)) return { ok: false, errors: ["players[] missing"] };
  let sum = 0;
  for (const p of block.players) {
    if (!(p.share >= 0) || p.share > 1) errors.push(`${p.playerId}: share out of [0,1]`);
    if (!p.shareBasis) errors.push(`${p.playerId}: no source-backed shareBasis`);
    sum += p.share;
  }
  if (typeof block.residual?.share !== "number") errors.push("residual share missing — the visible list is never forced to 100%");
  else if (Math.abs(sum + block.residual.share - 1) > 1e-6) errors.push(`shares+residual = ${(sum + block.residual.share).toFixed(8)} ≠ 1`);
  return { ok: errors.length === 0, errors };
}
