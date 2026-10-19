/**
 * NBA SIMULATION THEATER · SAMPLE VALIDATION (nba-sim-v1 contract, "Per-draw invariants"). Pure.
 *
 * The theater re-checks every representative sample it is handed, whatever the engine claims (`invariants.violations`).
 * A sample that fails is listed as unavailable with its reasons and is never drawn: no court, no score, no player line.
 * Returns { ok, errors: [{ code, detail }], notes: [{ code, detail }] } (notes are never failures). Every code below has a mutation test in nba-adapter.test.mjs.
 *
 *   MALFORMED            a required field is missing or of the wrong type
 *   LABEL_UNKNOWN        label is not typical | close | high | low | upset
 *   RUN_INDEX_RANGE      runIndex is not an integer in [0, simulations)
 *   NEGATIVE_OR_NONINT   a score or counting stat is negative or not an integer
 *   PERIOD_SEQUENCE      periods are not Q1..Q4 then OT1..OTn, numbered 1..4+n
 *   OT_COUNT             overtimePeriods ≠ the number of OT periods listed
 *   PERIOD_SUM           Σ period scores ≠ final (invariant 1)
 *   TIED_FINAL           the final is tied (invariant 5)
 *   TEAM_PTS             team pts ≠ final (invariant 1)
 *   PLAYER_PTS_SUM       Σ player pts ≠ team pts (invariant 1)
 *   PLAYER_PTS_FORMULA   a player's pts ≠ 3·3PM + 2·2PM + FTM (invariant 2)
 *   THREE_PM_GT_PA       a player's (or the team's) 3PM > 3PA (invariant 2)
 *   TEAM_FGM             team fgm ≠ team 3PM + 2PM
 *   AST_GT_FGM           team assists > team FGM (invariant 4)
 *   MINUTES_SUM          Σ player minutes ≠ 240 + 25·OT (invariant 3, to 1e-6 — or, when EVERY minute value in the side is
 *                        serialized at 0.01 resolution, to the rounding bound 0.005 × players-with-minutes; that case is
 *                        returned as a NOTE `MINUTES_ROUNDED`, never silently: the engine checks the exact sum before
 *                        serializing, and nba-sim-v1-coherent artifacts round minutes to 2 decimals)
 *   MINUTES_RANGE        a player outside 0 ≤ min ≤ 48 + 5·OT (invariant 3)
 *   REB_SUM              Σ player rebounds ≠ team rebounds (invariant 6)
 *   ZERO_MIN_STATS       a player with 0 minutes has a non-zero counting stat (invariant 7)
 */
export const SAMPLE_LABELS = Object.freeze(["typical", "close", "high", "low", "upset"]);
export const MINUTES_TOL = 1e-6;
/** Serialization resolution the rounding allowance applies to (minutes written with 2 decimals). */
export const MINUTES_RESOLUTION = 0.01;
const atResolution = (m) => Math.abs(m / MINUTES_RESOLUTION - Math.round(m / MINUTES_RESOLUTION)) < 1e-6;

const isInt = (v) => Number.isInteger(v);
const nonNegInt = (v) => isInt(v) && v >= 0;
const SIDES = ["home", "away"];
const PLAYER_COUNTS = ["pts", "reb", "ast", "threePa", "threePm", "twoPm", "ftm"];
const TEAM_COUNTS = ["pts", "reb", "ast", "threePa", "threePm", "twoPm", "ftm", "fgm"];

export const periodLabel = (n) => (n <= 4 ? `Q${n}` : `OT${n - 4}`);

/**
 * @param {any} s           one entry of representativeSamples
 * @param {{ simulations?: number }} ctx
 */
export function validateSample(s, { simulations = null } = {}) {
  const errors = [];
  const notes = [];
  const err = (code, detail) => errors.push({ code, detail });
  if (!s || typeof s !== "object") return { ok: false, errors: [{ code: "MALFORMED", detail: "not an object" }], notes };

  if (!SAMPLE_LABELS.includes(s.label)) err("LABEL_UNKNOWN", `label ${JSON.stringify(s.label)}`);
  if (!isInt(s.runIndex) || s.runIndex < 0 || (Number.isInteger(simulations) && s.runIndex >= simulations)) {
    err("RUN_INDEX_RANGE", `runIndex ${s.runIndex} outside [0, ${simulations ?? "N"})`);
  }
  if (typeof s.selectionRule !== "string" || !s.selectionRule.trim()) err("MALFORMED", "selectionRule missing");
  const final = s.final;
  const periods = s.periods;
  if (!final || !Array.isArray(periods) || !s.team || !s.players) {
    err("MALFORMED", "final, periods, team or players missing");
    return { ok: false, errors, notes };
  }
  for (const side of SIDES) if (!nonNegInt(final[side])) err("NEGATIVE_OR_NONINT", `final.${side} = ${final[side]}`);

  // periods: Q1..Q4 then OT1..OTn
  if (periods.length < 4) err("PERIOD_SEQUENCE", `${periods.length} periods (< 4)`);
  periods.forEach((p, i) => {
    if (!p || p.period !== i + 1 || p.label !== periodLabel(i + 1)) err("PERIOD_SEQUENCE", `period ${i + 1}: ${JSON.stringify({ period: p?.period, label: p?.label })}`);
    for (const side of SIDES) if (!nonNegInt(p?.[side])) err("NEGATIVE_OR_NONINT", `${p?.label ?? i + 1}.${side} = ${p?.[side]}`);
  });
  const ot = Math.max(0, periods.length - 4);
  if (s.overtimePeriods !== ot) err("OT_COUNT", `overtimePeriods ${s.overtimePeriods} ≠ ${ot} OT period(s) listed`);

  for (const side of SIDES) {
    const sum = periods.reduce((a, p) => a + (Number(p?.[side]) || 0), 0);
    if (sum !== final[side]) err("PERIOD_SUM", `${side}: Σ periods ${sum} ≠ final ${final[side]}`);
  }
  if (isInt(final.home) && final.home === final.away) err("TIED_FINAL", `final ${final.home}–${final.away} is tied`);

  const maxMin = 48 + 5 * ot;
  const teamMinutes = 240 + 25 * ot;
  for (const side of SIDES) {
    const t = s.team[side];
    const ps = s.players[side];
    if (!t || !Array.isArray(ps)) { err("MALFORMED", `team.${side} or players.${side} missing`); continue; }
    for (const k of TEAM_COUNTS) if (!nonNegInt(t[k])) err("NEGATIVE_OR_NONINT", `team.${side}.${k} = ${t[k]}`);
    if (t.pts !== final[side]) err("TEAM_PTS", `team.${side}.pts ${t.pts} ≠ final ${final[side]}`);
    if (isInt(t.threePm) && isInt(t.twoPm) && t.fgm !== t.threePm + t.twoPm) err("TEAM_FGM", `team.${side}.fgm ${t.fgm} ≠ 3PM ${t.threePm} + 2PM ${t.twoPm}`);
    if (isInt(t.ast) && isInt(t.fgm) && t.ast > t.fgm) err("AST_GT_FGM", `team.${side}: ast ${t.ast} > fgm ${t.fgm}`);
    if (isInt(t.threePm) && isInt(t.threePa) && t.threePm > t.threePa) err("THREE_PM_GT_PA", `team.${side}: 3PM ${t.threePm} > 3PA ${t.threePa}`);

    let pts = 0;
    let reb = 0;
    let min = 0;
    let played = 0;
    let rounded = ps.length > 0;
    for (const p of ps) {
      const who = `${side} ${p?.name ?? p?.providerAthleteId ?? "?"}`;
      if (!p || typeof p.name !== "string" || typeof p.minutes !== "number" || !Number.isFinite(p.minutes)) { err("MALFORMED", `${who}: name or minutes missing`); continue; }
      for (const k of PLAYER_COUNTS) if (!nonNegInt(p[k])) err("NEGATIVE_OR_NONINT", `${who}.${k} = ${p[k]}`);
      if (3 * p.threePm + 2 * p.twoPm + p.ftm !== p.pts) err("PLAYER_PTS_FORMULA", `${who}: pts ${p.pts} ≠ 3·${p.threePm} + 2·${p.twoPm} + ${p.ftm}`);
      if (p.threePm > p.threePa) err("THREE_PM_GT_PA", `${who}: 3PM ${p.threePm} > 3PA ${p.threePa}`);
      if (p.minutes > 0) played++;
      if (!atResolution(p.minutes)) rounded = false;
      if (p.minutes < 0 || p.minutes > maxMin + MINUTES_TOL) err("MINUTES_RANGE", `${who}: ${p.minutes} min outside 0–${maxMin}`);
      if (p.minutes === 0 && PLAYER_COUNTS.some((k) => p[k] !== 0)) err("ZERO_MIN_STATS", `${who}: 0 minutes but non-zero stats`);
      pts += Number(p.pts) || 0;
      reb += Number(p.reb) || 0;
      min += p.minutes;
    }
    if (pts !== t.pts) err("PLAYER_PTS_SUM", `${side}: Σ player pts ${pts} ≠ team ${t.pts}`);
    if (reb !== t.reb) err("REB_SUM", `${side}: Σ player reb ${reb} ≠ team ${t.reb}`);
    const dev = Math.abs(min - teamMinutes);
    const bound = 0.5 * MINUTES_RESOLUTION * played + 1e-9;
    if (dev > MINUTES_TOL) {
      if (rounded && dev <= bound) notes.push({ code: "MINUTES_ROUNDED", detail: `${side}: Σ minutes ${Math.round(min * 100) / 100} vs ${teamMinutes} — within the 0.01-rounding bound ±${Math.round(bound * 1000) / 1000} for ${played} players` });
      else err("MINUTES_SUM", `${side}: Σ minutes ${Math.round(min * 1e6) / 1e6} ≠ ${teamMinutes}${rounded ? ` (beyond the rounding bound ±${Math.round(bound * 1000) / 1000})` : ""}`);
    }
  }
  return { ok: errors.length === 0, errors, notes };
}
