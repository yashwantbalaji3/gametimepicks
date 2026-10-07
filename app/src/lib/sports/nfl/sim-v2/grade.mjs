/**
 * NS-2 · FORWARD GRADER FOR NFL SIMULATION V2 (architecture audit §8A / II.D #6). Pure. SHADOW.
 *
 * Grades one frozen pre-kickoff Sim V2 receipt against the official final and the captured box score, family by
 * family, into rows marked SHADOW. Nothing here is a pick or a record: these rows are the forward evidence NS-3 will
 * compare against the current champions (Elo-MOV win head, game-sim v1 ranges, share-level / props-v1 players).
 *
 * WHAT IS SCORED
 *   winner        log loss and Brier on P(home | decided). A tied final is VOID for the winner (not a loss).
 *   margin/total  exact CRPS from the receipt's integer histogram; 80% coverage (p10 ≤ y ≤ p90); |median − y|.
 *   team scores   quantile score (pinball loss averaged over p10/p25/p50/p75/p90, ×2 — a CRPS approximation, the
 *                 receipt stores quantiles only) and 80% coverage.
 *   players       the same quantile score + 80% coverage per stat family; log loss for anytime TD (rush or rec TD).
 *
 * MISSING IS NOT ZERO. A player absent from the box score, or present without the stat's key, is VOID for that family
 * and counted as a void — never graded as 0. (This follows the repo's absent-from-boxscore = VOID rule; NS-3 can
 * resolve absences through the snap-count participation truth.)
 */
export const NFL_SIM_V2_GRADER = "nfl-sim-v2-forward-grader-v1";
const r4 = (x) => (x == null || !Number.isFinite(x) ? null : Number(x.toFixed(4)));
const EPS = 1e-4;
const clamp = (p) => Math.min(1 - EPS, Math.max(EPS, p));
export const QUANTILE_LEVELS = Object.freeze([["p10", 0.1], ["p25", 0.25], ["p50", 0.5], ["p75", 0.75], ["p90", 0.9]]);

/** Sim V2 player stat → captured box-score key. */
export const PLAYER_FAMILIES = Object.freeze({
  passAtt: "passAtt", cmp: "passCmp", passYds: "passYds", passTd: "passTd", int: "passInt",
  rushAtt: "rushAtt", rushYds: "rushYds", rushTd: "rushTd",
  targets: "targets", rec: "rec", recYds: "recYds", recTd: "recTd",
});

/** Exact CRPS of an integer-valued distribution given as [{value, probability}] at integer outcome y. */
export function crpsFromHistogram(hist, y) {
  if (!Array.isArray(hist) || !hist.length || !Number.isFinite(y)) return null;
  const pts = [...hist].filter((h) => Number.isFinite(h.value)).sort((a, b) => a.value - b.value);
  const mass = pts.reduce((s, h) => s + (h.probability ?? 0), 0);
  if (!(mass > 0)) return null;
  const lo = Math.min(pts[0].value, y);
  const hi = Math.max(pts[pts.length - 1].value, y);
  let F = 0;
  let j = 0;
  let crps = 0;
  for (let k = lo; k < hi; k++) {
    while (j < pts.length && pts[j].value <= k) { F += pts[j].probability / mass; j++; }
    const H = k >= y ? 1 : 0;
    crps += (F - H) * (F - H);
  }
  return crps;
}

/** Quantile (pinball) score over the five stored quantiles, ×2 so it is on the CRPS scale. */
export function quantileScore(q, y) {
  if (!q || !Number.isFinite(y)) return null;
  let s = 0;
  for (const [k, tau] of QUANTILE_LEVELS) {
    if (!Number.isFinite(q[k])) return null;
    const u = y - q[k];
    s += u >= 0 ? tau * u : (tau - 1) * u;
  }
  return (2 * s) / QUANTILE_LEVELS.length;
}

const covered = (q, y) => (Number.isFinite(q?.p10) && Number.isFinite(q?.p90) ? y >= q.p10 && y <= q.p90 : null);
const binary = (p, hit) => ({ logLoss: r4(-Math.log(hit ? clamp(p) : 1 - clamp(p))), brier: r4((p - (hit ? 1 : 0)) ** 2) });

/**
 * @param receipt  a Sim V2 receipt of record (validated by the caller)
 * @param final    { ftHome, ftAway, players: [{ playerId, ...box keys }] } — the captured box score for the event
 * @returns rows, each { family, scope, state: "GRADED"|"VOID", ... } with promotionState SHADOW
 */
export function gradeSimV2Receipt(receipt, final) {
  const rows = [];
  const base = { promotionState: "SHADOW", grader: NFL_SIM_V2_GRADER };
  const a = receipt.aggregate;
  const h = final.ftHome;
  const w = final.ftAway;
  const decided = h !== w;
  const pHome = a.winProbability.home + a.winProbability.away > 0 ? a.winProbability.home / (a.winProbability.home + a.winProbability.away) : null;
  rows.push(decided && pHome != null
    ? { ...base, family: "winner", scope: "game", state: "GRADED", forecast: r4(pHome), actual: h > w ? "HOME" : "AWAY", ...binary(pHome, h > w) }
    : { ...base, family: "winner", scope: "game", state: "VOID", reason: decided ? "no win probability" : "tied final — VOID for the winner, not a loss" });
  for (const [family, y, q, hist] of [["margin", h - w, a.margin, a.marginHistogram], ["total", h + w, a.total, a.totalHistogram]]) {
    rows.push({ ...base, family, scope: "game", state: "GRADED", actual: y, median: q.p50, absError: Math.abs(q.p50 - y), covered80: covered(q, y), crps: r4(crpsFromHistogram(hist, y)) });
  }
  for (const [side, y] of [["home", h], ["away", w]]) {
    const q = a.score[side];
    rows.push({ ...base, family: "teamScore", scope: side, state: "GRADED", actual: y, median: q.p50, covered80: covered(q, y), quantileScore: r4(quantileScore(q, y)) });
  }
  const box = new Map((final.players ?? []).map((p) => [p.playerId, p]));
  for (const pl of receipt.playerStatDistributions ?? []) {
    const b = box.get(pl.playerId);
    for (const [family, key] of Object.entries(PLAYER_FAMILIES)) {
      const q = pl.stats?.[family];
      if (!q) continue;
      const y = b?.[key];
      if (!b || !Number.isFinite(y)) {
        rows.push({ ...base, family, scope: pl.playerId, team: pl.team, state: "VOID", reason: !b ? "absent from the box score" : `no ${key} in the box score` });
        continue;
      }
      rows.push({ ...base, family, scope: pl.playerId, team: pl.team, state: "GRADED", actual: y, median: q.p50, covered80: covered(q, y), quantileScore: r4(quantileScore(q, y)) });
    }
    if (pl.anytimeTd != null) {
      const rt = b?.rushTd;
      const ct = b?.recTd;
      if (!b || (!Number.isFinite(rt) && !Number.isFinite(ct))) {
        rows.push({ ...base, family: "anytimeTd", scope: pl.playerId, team: pl.team, state: "VOID", reason: !b ? "absent from the box score" : "no rushing or receiving line in the box score" });
      } else {
        const hit = (rt ?? 0) + (ct ?? 0) >= 1;
        rows.push({ ...base, family: "anytimeTd", scope: pl.playerId, team: pl.team, state: "GRADED", forecast: pl.anytimeTd, actual: hit, ...binary(pl.anytimeTd, hit) });
      }
    }
  }
  return rows;
}

/** Per-family summary over graded rows: n, voids, 80% coverage, mean CRPS / quantile score / log loss / Brier. */
export function summariseGrades(rows) {
  const by = new Map();
  for (const r of rows) {
    const s = by.get(r.family) ?? { family: r.family, n: 0, voids: 0, cov: [0, 0], crps: [], qs: [], ll: [], brier: [], absError: [] };
    by.set(r.family, s);
    if (r.state !== "GRADED") { s.voids += 1; continue; }
    s.n += 1;
    if (r.covered80 != null) { s.cov[1] += 1; if (r.covered80) s.cov[0] += 1; }
    for (const [k, v] of [["crps", r.crps], ["qs", r.quantileScore], ["ll", r.logLoss], ["brier", r.brier], ["absError", r.absError]]) if (Number.isFinite(v)) s[k].push(v);
  }
  const mean = (xs) => (xs.length ? r4(xs.reduce((t, x) => t + x, 0) / xs.length) : null);
  return [...by.values()].map((s) => ({
    family: s.family, graded: s.n, void: s.voids,
    coverage80: s.cov[1] ? r4(s.cov[0] / s.cov[1]) : null,
    meanCrps: mean(s.crps), meanQuantileScore: mean(s.qs), meanLogLoss: mean(s.ll), meanBrier: mean(s.brier), meanAbsError: mean(s.absError),
  })).sort((x, y) => (x.family < y.family ? -1 : 1));
}
