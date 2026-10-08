/**
 * WORLD MODEL V2 — FORWARD GRADING (NFL-005 / LEDGER-001 hook). Pure: runs + official box scores in, grades out.
 *
 * WHICH FORECAST IS GRADED: for each game, the LAST World Model V2 run generated strictly before kickoff — the
 * frozen pregame version, read from the write-once run files. A later run, a newer model or a rebuilt artifact is never
 * substituted. Each grade carries the run's simulationId, model version and generatedAt.
 *
 * OUTCOME STATES (never a loss unless graded):
 *   GRADED    the game is final and the player has a box-score line (a category he has no entry in counts 0)
 *   PENDING   the game is not final
 *   NO_LINE   the game is final and the player has no box-score line at all — he may not have played; not graded,
 *             counted separately so the share is visible
 *   NO_FORECAST  the game had no pregame run (nothing to grade)
 *
 * METRICS, per family, never combined across families: MAE of the median, bias (mean forecast − mean actual),
 * 80% and 50% interval coverage, and a ladder Brier score (mean over the published "at least" lines of
 * (P(≥ line) − 1[actual ≥ line])²) — a proper score of the distribution, not a hit rate.
 */

export const GRADED_FAMILIES = Object.freeze({
  passingYards: (l) => l.passYds ?? 0,
  rushingYards: (l) => l.rushYds ?? 0,
  receivingYards: (l) => l.recYds ?? 0,
  receptions: (l) => l.rec ?? 0,
});

/** The frozen pregame run per event: latest generatedAt strictly before kickoff. */
export function pregameRuns(runs) {
  const by = new Map();
  for (const r of runs) {
    const id = r?.identity?.providerEventId;
    if (!id || !(Date.parse(r.run?.generatedAt) < Date.parse(r.identity.kickoffUtc))) continue;
    const cur = by.get(id);
    if (!cur || Date.parse(r.run.generatedAt) > Date.parse(cur.run.generatedAt)) by.set(id, r);
  }
  return by;
}

/** One row per (event, player, family) the pregame run published. */
export function gradeRun(run, game) {
  const rows = [];
  const final = game && Number.isInteger(game.ftHome) && Number.isInteger(game.ftAway);
  const lines = new Map((game?.players ?? []).map((p) => [p.playerId, p]));
  for (const p of run.players) {
    for (const [fam, actualOf] of Object.entries(GRADED_FAMILIES)) {
      const d = p.families?.[fam];
      if (!d) continue;
      const base = { providerEventId: run.identity.providerEventId, playerId: p.playerId, name: p.name, team: p.team, family: fam, availability: p.availability, simulationId: run.simulationId, modelVersion: run.model.version, generatedAt: run.run.generatedAt, forecast: { median: d.median, mean: d.mean, p10: d.p10, p25: d.p25, p75: d.p75, p90: d.p90, atLeast: d.atLeast ?? null } };
      if (!final) { rows.push({ ...base, state: "PENDING" }); continue; }
      const line = lines.get(p.playerId);
      if (!line) { rows.push({ ...base, state: "NO_LINE" }); continue; }
      const y = actualOf(line);
      const ladder = d.atLeast ? Object.entries(d.atLeast).map(([t, pr]) => (pr - (y >= Number(t) ? 1 : 0)) ** 2) : [];
      rows.push({
        ...base, state: "GRADED", actual: y,
        absError: Math.abs(d.median - y), error: d.mean - y,
        in80: y >= d.p10 && y <= d.p90, in50: y >= d.p25 && y <= d.p75,
        ladderBrier: ladder.length ? ladder.reduce((a, b) => a + b, 0) / ladder.length : null,
      });
    }
  }
  return rows;
}

const r4 = (x) => (x == null || !Number.isFinite(x) ? null : Number(x.toFixed(4)));
/** Per-family (and per model version) summary — no cross-family accuracy number exists here by design. */
export function summarize(rows) {
  const out = {};
  for (const fam of Object.keys(GRADED_FAMILIES)) {
    const fr = rows.filter((r) => r.family === fam);
    const g = fr.filter((r) => r.state === "GRADED");
    const n = g.length;
    const mean = (f) => (n ? g.reduce((a, r) => a + f(r), 0) / n : null);
    const lb = g.filter((r) => r.ladderBrier != null);
    out[fam] = {
      graded: n, pending: fr.filter((r) => r.state === "PENDING").length, noLine: fr.filter((r) => r.state === "NO_LINE").length,
      mae: r4(mean((r) => r.absError)), bias: r4(mean((r) => r.error)),
      coverage80: r4(mean((r) => (r.in80 ? 1 : 0))), coverage50: r4(mean((r) => (r.in50 ? 1 : 0))),
      ladderBrier: lb.length ? r4(lb.reduce((a, r) => a + r.ladderBrier, 0) / lb.length) : null,
      versions: [...new Set(fr.map((r) => r.modelVersion))].sort(),
    };
  }
  return out;
}
