/**
 * The PUBLIC-SAFE projection of one game's World Model V2 grades (results-store pilot).
 *
 * Built by ALLOW-LIST from grades/latest.json (PRIVATE_RESEARCH): only the run identity a game page already shows,
 * each row's frozen forecast centre and 80% interval, the official actual, the error and the state. No file paths
 * (`gradedRun`), no availability internals, no ladders or research diagnostics. A field not listed here cannot leak.
 *
 * States stay distinct (LEDGER-001): GRADED carries an actual; PENDING (game not final) and NO_LINE (no box-score line,
 * participation unconfirmed) carry none and are never counted as zero.
 */
const STATES = new Set(["GRADED", "PENDING", "NO_LINE"]);
const FAMILIES = new Set(["passingYards", "rushingYards", "receivingYards", "receptions"]);
const num = (x) => (Number.isFinite(x) ? Math.round(x * 100) / 100 : null);

export function projectWm2Game(grades, eventId, { finality }) {
  const g = (grades?.games ?? []).find((x) => String(x.providerEventId) === String(eventId));
  if (!g) return null;
  if (!["FINAL_PROVISIONAL", "FINAL_CANONICAL", "PENDING"].includes(finality)) throw new Error("finality must be FINAL_PROVISIONAL, FINAL_CANONICAL or PENDING");
  const rows = (grades.rows ?? []).filter((r) => String(r.providerEventId) === String(eventId) && FAMILIES.has(r.family) && STATES.has(r.state))
    .map((r) => ({
      playerId: String(r.playerId), name: String(r.name), team: String(r.team), family: r.family, state: r.state,
      median: num(r.forecast?.median), p10: num(r.forecast?.p10), p90: num(r.forecast?.p90),
      ...(r.state === "GRADED" ? { actual: num(r.actual), errorVsMedian: num(r.actual - r.forecast?.median), in80: !!r.in80 } : {}),
    }))
    .sort((a, b) => (a.family + a.playerId).localeCompare(b.family + b.playerId));
  return {
    schemaVersion: 1, sport: "nfl", family: "wm2-grades",
    providerEventId: String(g.providerEventId), matchup: String(g.matchup), kickoffUtc: String(g.kickoffUtc),
    model: { id: "nfl-world-model-v2", version: String(g.modelVersion), simulationId: String(g.simulationId), forecastGeneratedAt: String(g.generatedAt) },
    finality, officialStatsAsOf: grades.officialStatsGeneratedAt ?? null,
    counts: { graded: rows.filter((r) => r.state === "GRADED").length, pending: rows.filter((r) => r.state === "PENDING").length, noLine: rows.filter((r) => r.state === "NO_LINE").length },
    rows,
  };
}
