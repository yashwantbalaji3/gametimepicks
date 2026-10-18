/**
 * SIMULATION THEATER V2 · VALIDATION (spec §4.3 rules 1–8, with review corrections S4, S5, S14, S15). Pure.
 *
 * A sample that fails renders a readable "unavailable" state — never a guessed one. The build never fails for one bad
 * receipt; the unit test over every receipt on disk does.
 *
 * Returns { ok, errors: [{code, drive?, detail}], notes: [{code, drive?, detail}] }. Notes are never failures.
 */
import { DRIVE_RESULTS, RUNOFF_NOTE_TEXT, quarterOf } from "./format.mjs";

export const ENGINE_ID = "nfl-drive-sim-v2";
export const RECEIPT_SCHEMA = "simulation-receipt@2";
export const SUPPORTED_RUN_SCHEMAS = Object.freeze(["nfl-drive-run@1"]);
/** The World Model V2 artifact marker (S14: an `artifact` field, not an engine id; build-nfl-world-model-v2.mjs:221). */
export const WM2_ARTIFACT = "nfl-world-model-v2-simulation";

/**
 * Rule 1 · engine identity. A positive check on the drive engine already rejects any other artifact; the WM2 marker,
 * a `sampledWorlds` field or a world-model file path are named explicitly so the reason is readable.
 * @returns {null | {code: "ENGINE_MISMATCH" | "SCHEMA_UNSUPPORTED" | "MALFORMED", reason: string}}
 */
export function checkEngineIdentity(r, { file = null } = {}) {
  if (!r || typeof r !== "object") return { code: "MALFORMED", reason: "not a receipt object" };
  if (r.artifact === WM2_ARTIFACT || "sampledWorlds" in r || (file && /world-model-v2/.test(String(file)))) {
    return { code: "ENGINE_MISMATCH", reason: `a World Model V2 artifact (${WM2_ARTIFACT}) is a different engine, not ${ENGINE_ID}` };
  }
  if (r.simulationEngine !== ENGINE_ID) return { code: "ENGINE_MISMATCH", reason: `engine ${r.simulationEngine ?? "(none)"} is not ${ENGINE_ID}` };
  if (r.schemaVersion !== RECEIPT_SCHEMA) return { code: "SCHEMA_UNSUPPORTED", reason: `receipt schema ${r.schemaVersion ?? "(none)"} is not ${RECEIPT_SCHEMA}` };
  if (!SUPPORTED_RUN_SCHEMAS.includes(r.runSchemaVersion)) return { code: "SCHEMA_UNSUPPORTED", reason: `run schema ${r.runSchemaVersion ?? "(none)"} is not supported` };
  return null;
}

/** Allowed (offense, defense) score deltas per result (rule 2; F9: a TD delta includes the try). */
function deltaAllowed(result, dOff, dDef) {
  switch (result) {
    case "TD": return [6, 7, 8].includes(dOff) && dDef === 0;
    case "FG": return dOff === 3 && dDef === 0;
    case "OPP_TD": return dOff === 0 && [6, 7].includes(dDef);
    case "SAFETY": return dOff === 0 && dDef === 2;
    default: return dOff === 0 && dDef === 0;
  }
}

const isInt = (v) => Number.isInteger(v);

/**
 * Rule 8 (S4) · an END_HALF drive with seconds > 300 AND seconds > 60 × plays: the engine ran out the half on a drive
 * of a few plays (engine.mjs:230-232). A NOTE, never a failure; the drive is never edited or skipped.
 */
export const isClockRunoff = (d) => d.result === "END_HALF" && d.seconds > 300 && d.seconds > 60 * d.plays;

/**
 * Rules 2–5 and 8 over one representative run (`representativeRuns[k]` as recorded).
 * @param {{ final: {home:number, away:number, overtime:boolean}, quarters: {home:number[], away:number[]}, drives: any[] }} run
 */
export function validateRun(run) {
  const errors = [];
  const notes = [];
  const err = (code, drive, detail) => errors.push({ code, drive, detail });
  const drives = Array.isArray(run?.drives) ? run.drives : null;
  if (!drives || !drives.length) {
    err("NO_DRIVES", null, "the run records no drives");
    return { ok: false, errors, notes };
  }
  if (!run.final || !isInt(run.final.home) || !isInt(run.final.away) || !run.quarters || !Array.isArray(run.quarters.home) || !Array.isArray(run.quarters.away)) {
    err("MALFORMED", null, "final or quarters missing");
    return { ok: false, errors, notes };
  }

  // Shape and rule 5 (field) per drive.
  for (let i = 0; i < drives.length; i++) {
    const d = drives[i];
    const shapeOk = d && isInt(d.q) && isInt(d.clockStart) && (d.offense === 0 || d.offense === 1) && isInt(d.startYardsToGoal)
      && isInt(d.plays) && isInt(d.netYards) && isInt(d.seconds) && Array.isArray(d.score) && d.score.length === 2 && d.score.every(isInt);
    if (!shapeOk) { err("MALFORMED", i, "drive fields missing or not integers"); continue; }
    if (!DRIVE_RESULTS.includes(d.result)) err("UNKNOWN_RESULT", i, `result ${d.result}`);
    if (d.startYardsToGoal < 1 || d.startYardsToGoal > 99) err("FIELD_RANGE", i, `start ${d.startYardsToGoal} outside 1–99`);
    const end = d.result === "TD" ? 0 : d.result === "SAFETY" ? 100 : d.startYardsToGoal - d.netYards;
    if (end < 0 || end > 100) err("FIELD_RANGE", i, `derived end spot ${end} outside 0–100`);
    if (d.result === "TD" && d.netYards !== d.startYardsToGoal) err("TD_NET_YARDS", i, `TD net ${d.netYards} ≠ start ${d.startYardsToGoal}`);
    if (d.result === "SAFETY" && d.netYards !== d.startYardsToGoal - 100) err("SAFETY_NET_YARDS", i, `safety net ${d.netYards} ≠ start − 100`);
    if (d.plays < 1) err("FIELD_RANGE", i, `plays ${d.plays} < 1`);
    if (isClockRunoff(d)) notes.push({ code: "ENGINE_CLOCK_RUNOFF", drive: i, detail: `${RUNOFF_NOTE_TEXT}: ${d.seconds} s on ${d.plays} play${d.plays === 1 ? "" : "s"}` });
  }
  if (errors.length) return { ok: false, errors, notes };

  // Rule 2 · score reconciliation.
  const last = drives[drives.length - 1];
  if (last.score[0] !== run.final.home || last.score[1] !== run.final.away) err("SCORE_FINAL_MISMATCH", drives.length - 1, `last drive ${last.score.join("–")} ≠ final ${run.final.home}–${run.final.away}`);
  const credited = { home: [0, 0, 0, 0, 0], away: [0, 0, 0, 0, 0] };
  let prev = [0, 0];
  for (let i = 0; i < drives.length; i++) {
    const d = drives[i];
    const dh = d.score[0] - prev[0];
    const da = d.score[1] - prev[1];
    const dOff = d.offense === 0 ? dh : da;
    const dDef = d.offense === 0 ? da : dh;
    if (!deltaAllowed(d.result, dOff, dDef)) err("SCORE_DELTA_INVALID", i, `${d.result}: offense +${dOff}, defense +${dDef}`);
    const inOT = d.q === 5;
    const clockEnd = Math.max(0, d.clockStart - d.seconds);
    const p = inOT ? 4 : quarterOf(clockEnd) - 1; // points credited to the END instant's quarter (F5)
    credited.home[p] += dh;
    credited.away[p] += da;
    prev = d.score;
  }
  for (const side of ["home", "away"]) {
    const rec = run.quarters[side];
    for (let p = 0; p < 5; p++) {
      if ((rec[p] ?? 0) !== credited[side][p]) err("QUARTER_SUM_MISMATCH", null, `${side} period ${p + 1}: recorded ${rec[p]}, drives credit ${credited[side][p]}`);
    }
  }
  const anyOT = drives.some((d) => d.q === 5);
  if (Boolean(run.final.overtime) !== anyOT) err("OVERTIME_FLAG_MISMATCH", null, `final.overtime ${run.final.overtime} but ${anyOT ? "an" : "no"} OT drive`);
  if (run.final.home === run.final.away && !run.final.overtime) err("TIE_WITHOUT_OT", null, "a tied final is valid only after overtime");

  // Rule 3 · clock. Regulation counts 3600 → 0 with no gaps; the second half opens at exactly 1800.
  const reg = drives.map((d, i) => ({ d, i })).filter(({ d }) => d.q !== 5);
  const ot = drives.map((d, i) => ({ d, i })).filter(({ d }) => d.q === 5);
  if (reg.length && reg[0].d.clockStart !== 3600) err("CLOCK_GAP", reg[0].i, `first drive starts at ${reg[0].d.clockStart}, not 3600`);
  if (ot.length && ot[0].i < reg.length) err("CLOCK_ORDER", ot[0].i, "an overtime drive precedes a regulation drive");
  let secondHalfStarts = 0;
  for (let k = 0; k < reg.length; k++) {
    const { d, i } = reg[k];
    const end = d.clockStart - d.seconds;
    if (end < 0) err("CLOCK_OVERRUN", i, `drive runs past 0 (${end})`);
    if (d.clockStart > 1800 && end < 1800) err("HALF_STRADDLE", i, `drive crosses halftime (${d.clockStart} → ${end})`);
    const cutByClock = end === 1800 && d.clockStart > 1800 ? true : end === 0;
    if (d.seconds < 5 && !cutByClock) err("SHORT_DRIVE", i, `${d.seconds} s and not cut by the clock`);
    if (k + 1 < reg.length) {
      const n = reg[k + 1].d;
      if (n.clockStart > d.clockStart) err("CLOCK_INCREASE", reg[k + 1].i, `${d.clockStart} → ${n.clockStart}`);
      else if (n.clockStart !== end) err("CLOCK_GAP", reg[k + 1].i, `expected ${end}, recorded ${n.clockStart}`);
      if (d.clockStart > 1800 && n.clockStart <= 1800) {
        secondHalfStarts++;
        if (n.clockStart !== 1800) err("SECOND_HALF_START", reg[k + 1].i, `second half opens at ${n.clockStart}, not 1800`);
      }
    } else if (end !== 0) {
      err("REGULATION_END", i, `regulation's last drive ends at ${end}, not 0`);
    }
  }
  if (reg.length && secondHalfStarts !== 1) err("SECOND_HALF_START", null, `${secondHalfStarts} second-half openers`);
  // Regulation must end tied for overtime to exist (OT only from a regulation tie).
  if (ot.length && reg.length) {
    const s = reg[reg.length - 1].d.score;
    if (s[0] !== s[1]) err("OT_WITHOUT_TIE", ot[0].i, `regulation ended ${s[0]}–${s[1]}`);
  }
  // Overtime: the FIRST period is 600 s even in the postseason (engine.mjs:444); a tied postseason period restarts at 900.
  for (let k = 0; k < ot.length; k++) {
    const { d, i } = ot[k];
    const end = Math.max(0, d.clockStart - d.seconds);
    if (k === 0) {
      if (d.clockStart !== 600) err("OT_CLOCK", i, `overtime opens at ${d.clockStart}, not 600`);
    } else {
      const p = ot[k - 1].d;
      const pEnd = Math.max(0, p.clockStart - p.seconds);
      const restart = pEnd === 0 && p.score[0] === p.score[1] && d.clockStart === 900;
      if (!restart && d.clockStart !== pEnd) err("OT_CLOCK", i, `expected ${pEnd}, recorded ${d.clockStart}`);
    }
    if (d.seconds < 5 && end !== 0) err("SHORT_DRIVE", i, `${d.seconds} s and not cut by the OT clock`);
  }

  // Rule 4 · possession, in precedence order (S15): resets → OPP_TD → postseason restart → alternation.
  for (let i = 1; i < drives.length; i++) {
    const p = drives[i - 1];
    const d = drives[i];
    const pEnd = Math.max(0, p.clockStart - p.seconds);
    const secondHalfOpener = p.q !== 5 && d.q !== 5 && p.clockStart > 1800 && pEnd === 1800;
    const firstOtDrive = p.q !== 5 && d.q === 5;
    if (secondHalfOpener) {
      if (d.offense !== 1 - drives[0].offense) err("SECOND_HALF_RECEIVER", i, "the second half must open with the team that did not receive the opening kickoff");
      continue;
    }
    if (firstOtDrive) continue; // a coin flip (engine.mjs:441-447): either side is valid
    if (p.result === "OPP_TD") {
      if (d.offense !== p.offense) err("POSSESSION_AFTER_OPP_TD", i, "after a defensive touchdown the same offense receives");
      continue;
    }
    const otRestart = p.q === 5 && d.q === 5 && pEnd === 0 && d.clockStart === 900;
    if (otRestart) {
      if (d.offense !== p.offense) err("POSSESSION_REPEAT", i, "a postseason OT restart keeps the same offense");
      continue;
    }
    if (d.offense === p.offense) err("POSSESSION_REPEAT", i, "the same offense drives twice in a row with no recorded reason");
  }

  return { ok: errors.length === 0, errors, notes };
}

/**
 * Rule 6 · representative count and shared runs (S5). 1–5 representatives with unique kinds; zero is a fail.
 * Shared runIndex values are valid and reported as SHARED_RUN notes.
 */
export function validateRepresentatives(reps) {
  const errors = [];
  const notes = [];
  if (!Array.isArray(reps) || reps.length === 0) {
    errors.push({ code: "NO_REPRESENTATIVES", detail: "the receipt carries no representative runs" });
    return { ok: false, errors, notes };
  }
  if (reps.length > 5) errors.push({ code: "TOO_MANY_REPRESENTATIVES", detail: `${reps.length} > 5` });
  const kinds = reps.map((r) => r.kind);
  if (new Set(kinds).size !== kinds.length) errors.push({ code: "DUPLICATE_KIND", detail: kinds.join(",") });
  const byRun = new Map();
  for (const r of reps) byRun.set(r.runIndex, [...(byRun.get(r.runIndex) ?? []), r.kind]);
  for (const [runIndex, ks] of byRun) if (ks.length > 1) notes.push({ code: "SHARED_RUN", runIndex, kinds: ks, detail: `${ks.join(" = ")} = run #${runIndex}` });
  return { ok: errors.length === 0, errors, notes };
}
