/**
 * Forward grading for an accepted soccer league (P257). Pure.
 *
 * Every match is graded ONCE, against the LAST forecast published before its kickoff (each row carries its
 * own `forecastAt`), from the official final score. A grade that already exists is kept verbatim; a fresh
 * derivation that disagrees with it throws rather than restating the record.
 *
 * A count of graded matches is not an accuracy claim. The sample states mirror the Premier League record's
 * (lib/sports/epl/graded-record.ts): NONE → TOO_SMALL_TO_ASSESS (< 20) → ACCUMULATING.
 */
export const TOO_SMALL_BELOW = 20;
export const UNIFORM_LOG_LOSS = Number(Math.log(3).toFixed(4)); // what a one-in-three guess scores

/** archives: [{ generatedAt, rows }] → Map(eventId → { row, forecastAt }) — latest pre-kickoff forecast per event. */
export function lastPreKickoffForecasts(archives) {
  const out = new Map();
  for (const a of archives ?? []) for (const r of a?.rows ?? []) {
    const at = r.forecastAt ?? a.generatedAt;
    if (!at || !r.kickoffUtc || !(Date.parse(at) < Date.parse(r.kickoffUtc))) continue; // never a forecast made after kickoff
    const prev = out.get(r.eventId);
    if (!prev || Date.parse(at) > Date.parse(prev.forecastAt)) out.set(r.eventId, { row: r, forecastAt: at });
  }
  return out;
}

const r4 = (x) => Number(x.toFixed(4));

/** One graded match. final = { home, away } goals. */
export function gradeMatch({ row, forecastAt }, final) {
  const result = final.home > final.away ? "H" : final.home === final.away ? "D" : "A";
  const q = { H: row.probs.home, D: row.probs.draw, A: row.probs.away };
  const brier = ["H", "D", "A"].reduce((s, o) => s + (q[o] - (o === result ? 1 : 0)) ** 2, 0);
  return {
    eventId: row.eventId, matchup: row.matchup, homeClub: row.homeClub, awayClub: row.awayClub, kickoffUtc: row.kickoffUtc,
    forecastAt, probs: row.probs, final: { home: final.home, away: final.away }, result,
    probabilityOfResult: r4(q[result]), logLoss: r4(-Math.log(Math.max(1e-12, q[result]))), brier: r4(brier),
  };
}

/** Append-only merge: existing grades are kept verbatim; a disagreeing re-grade throws. */
export function mergeGraded(existing, fresh) {
  const byId = new Map((existing ?? []).map((g) => [g.eventId, g]));
  let added = 0;
  for (const g of fresh ?? []) {
    const was = byId.get(g.eventId);
    if (was) {
      if (was.result !== g.result || was.final.home !== g.final.home || was.final.away !== g.final.away || was.forecastAt !== g.forecastAt)
        throw new Error(`refusing to restate graded match ${g.eventId} (${was.final.home}-${was.final.away} → ${g.final.home}-${g.final.away})`);
      continue;
    }
    byId.set(g.eventId, g); added += 1;
  }
  return { matches: [...byId.values()].sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc)), added };
}

export function summarize(matches) {
  const n = (matches ?? []).length;
  const mean = (k) => (n ? r4(matches.reduce((s, m) => s + m[k], 0) / n) : null);
  return {
    matches: n, logLoss: mean("logLoss"), brier: mean("brier"), uniformLogLoss: UNIFORM_LOG_LOSS,
    sampleState: n === 0 ? "NONE" : n < TOO_SMALL_BELOW ? "TOO_SMALL_TO_ASSESS" : "ACCUMULATING",
  };
}

/** The words beside the count — one place, so no surface can drop the small-sample warning. */
export function gradedCaption(summary) {
  if (!summary || summary.sampleState === "NONE") return "no forecast match has finished yet";
  if (summary.sampleState === "TOO_SMALL_TO_ASSESS") return summary.matches === 1 ? "one match — far too few to judge accuracy" : "far too few matches to judge accuracy";
  return "accumulating — still a small sample for a three-way market";
}
