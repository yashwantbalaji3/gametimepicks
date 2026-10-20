/**
 * SIMULATION THEATER V2 · PROJECTED BOX SCORE (`nfl-box-score@1`). Pure, deterministic, run-bound.
 *
 * One adapted TheaterSample (one representative run of ONE `nfl-drive-sim-v2` receipt) → the box score of THAT run,
 * computed only from what the run records. The engine's run record (`nfl-drive-run@1`) is a list of drive summaries:
 *
 *   q · clockStart · offense · startYardsToGoal · result · plays · netYards · seconds · score-after   (+ final, quarters)
 *
 * It carries no plays, no participants and no per-run team or player stat lines (adapter UNAVAILABLE_FIELDS). So:
 *
 *   MODELED      a value the run record stores as such: the final score, points by period.
 *   DERIVED      exactly computable from the recorded drives: counts and sums of drive facts (drives, plays, net yards,
 *                clock, results), and the try points read from each touchdown drive's score change.
 *   NOT_MODELED  everything else. Rendered as the words "Not modeled by this engine", NEVER as 0. Every player section
 *                (passing, rushing, receiving, kicking, defense) is NOT_MODELED: this engine records drives, not plays
 *                or players. Nothing from World Model V2 (allocV1 player allocations) or from the receipt's batch-level
 *                distributions is read here: those describe other runs or another engine, not this run.
 *
 * FAIL CLOSED. Every reconciliation below must hold or `nflBoxScore` throws a BoxScoreInvariantError; the UI then
 * shows "Box score unavailable" with the reason, never a partial or guessed table:
 *   the sample validated and belongs to this manifest's receipt · score chain continuous · last drive's score = final ·
 *   points by period sum to the final and equal what the drives credit to each period · every point is attributed to
 *   a drive result (touchdown 6 + try 0/1/2, defensive touchdown 6 + try 0/1, field goal 3, safety 2, nothing else) ·
 *   the composition 6·TD + try points + 3·FG + 2·safety equals the final · regulation clock sums to exactly 60:00 ·
 *   the overtime flag matches the drives · each drive's end spot equals start − net yards.
 *
 * The output is plain JSON (no functions), so the server table and the client dialog render the same object; the
 * unit test proves the client path (unpacked theater-pack@1) yields a byte-identical box score.
 */
import { PERIOD_SHORT, fmtDuration, fmtSigned } from "./format.mjs";

export const BOX_SCORE_VERSION = "nfl-box-score@1";
export const BOX_SCORE_WATERMARK = "SIMULATED · PROJECTED · NOT ACTUAL GAME STATISTICS";
export const BOX_SCORE_TITLE = "Projected box score";
export const NOT_MODELED_TEXT = "Not modeled by this engine";
export const PLAYER_NOT_MODELED_REASON = "this engine records drives, not plays or players";
export const STATUS = Object.freeze({ MODELED: "MODELED", DERIVED: "DERIVED", NOT_MODELED: "NOT_MODELED" });
export const STATUS_LABEL = Object.freeze({ MODELED: "Modeled", DERIVED: "Derived", NOT_MODELED: "Not modeled" });
export const STATUS_HELP = Object.freeze({
  MODELED: "stored by the engine for this run",
  DERIVED: "computed exactly from this run's recorded drives",
  NOT_MODELED: "this engine does not record it",
});

const REG_SECONDS = 3600;
const SIDES = Object.freeze(["away", "home"]);
const other = (s) => (s === "home" ? "away" : "home");

export class BoxScoreInvariantError extends Error {
  constructor(code, detail) {
    super(`box score invariant ${code}: ${detail}`);
    this.name = "BoxScoreInvariantError";
    this.code = code;
    this.detail = detail;
  }
}

/** Player sections: all NOT_MODELED, one reason. Never rendered as a zero line. */
export const PLAYER_SECTIONS = Object.freeze([
  { id: "passing", label: "Passing" },
  { id: "rushing", label: "Rushing" },
  { id: "receiving", label: "Receiving" },
  { id: "kicking", label: "Kicking and punting" },
  { id: "defense", label: "Defense" },
].map((s) => Object.freeze({ ...s, status: STATUS.NOT_MODELED, reason: PLAYER_NOT_MODELED_REASON })));

/** Team categories a real box score carries that this run record cannot support, each with its own reason. */
const TEAM_NOT_MODELED = Object.freeze([
  { id: "redZoneTrips", label: "Red-zone trips", reason: "only each drive's start and end spots are recorded; a drive can enter the opponent 20 and finish outside it, so trips are not exactly computable" },
  { id: "firstDowns", label: "First downs", reason: "downs and distance are not modeled" },
  { id: "passRush", label: "Passing / rushing yards", reason: "drive net yards are recorded as one number, not split by play type" },
  { id: "thirdDown", label: "Third-down conversions", reason: "downs and distance are not modeled" },
  { id: "intFum", label: "Interceptions / fumbles lost", reason: "a turnover is recorded without its kind" },
  { id: "sacks", label: "Sacks", reason: "individual plays are not recorded" },
  { id: "penalties", label: "Penalties", reason: "penalties are not modeled" },
  { id: "returns", label: "Kick and punt returns", reason: "kick and punt landing and return spots are not modeled" },
]);

const fmtInt = (n) => fmtSigned(n);
const fmtDec = (n) => (n == null ? "—" : fmtSigned(Number(n.toFixed(1))).replace(/^(−?\d+)$/, "$1.0"));
/** Mean start spot (offense-relative yards to goal) in field language: "own 27.6", "midfield", "opp 44.0". */
function fmtSpot(m) {
  if (m == null) return "—";
  const r = Math.round(m * 10) / 10;
  if (r === 50) return "midfield";
  return r > 50 ? `own ${(100 - r).toFixed(1)}` : `opp ${r.toFixed(1)}`;
}

function need(cond, code, detail) {
  if (!cond) throw new BoxScoreInvariantError(code, detail);
}

/**
 * @param {object} sample   one adapted TheaterSample (adapter-nfl-sim-v2.mjs), validated
 * @param {object} manifest the TheaterManifest the sample came from (identity, teams, provenance)
 * @returns {object} the box score (plain JSON); throws BoxScoreInvariantError when any reconciliation fails
 */
export function nflBoxScore(sample, manifest) {
  need(manifest && manifest.teams && manifest.teams.home && manifest.teams.away, "MANIFEST", "manifest with teams required");
  need(sample && Array.isArray(sample.events), "SAMPLE", "sample with events required");
  need(sample.receiptId === manifest.receiptId, "RUN_BINDING", `sample of ${sample.receiptId} is not from receipt ${manifest.receiptId}`);
  need(sample.validation?.ok === true, "SAMPLE_INVALID", `run #${sample.runIndex} failed validation: ${(sample.validation?.errors ?? []).map((e) => e.code).join(", ") || "unknown"}`);
  need(sample.events.length > 0, "NO_DRIVES", `run #${sample.runIndex} records no drives`);
  const fin = sample.finalScore;
  const ps = sample.periodScores;
  need(fin && Number.isInteger(fin.home) && Number.isInteger(fin.away), "FINAL", "final score missing");
  need(ps && Array.isArray(ps.home) && Array.isArray(ps.away), "PERIODS", "points by period missing");

  const events = sample.events;
  const teams = manifest.teams;
  const invariants = [];
  const pass = (id, detail) => invariants.push({ id, ok: true, detail });

  // ── score chain and final ──────────────────────────────────────────────────────────────────────────────────
  let prev = { home: 0, away: 0 };
  events.forEach((ev, i) => {
    need(ev.index === i, "DRIVE_ORDER", `event ${i} carries index ${ev.index}`);
    need(ev.scoreBefore.home === prev.home && ev.scoreBefore.away === prev.away, "SCORE_CHAIN", `drive ${i + 1} starts ${ev.scoreBefore.away}–${ev.scoreBefore.home}, previous ended ${prev.away}–${prev.home}`);
    for (const s of SIDES) need(ev.delta[s] === ev.scoreAfter[s] - ev.scoreBefore[s], "SCORE_CHAIN", `drive ${i + 1} ${s} delta`);
    prev = ev.scoreAfter;
  });
  const last = events[events.length - 1];
  need(last.scoreAfter.home === fin.home && last.scoreAfter.away === fin.away, "FINAL_MISMATCH", `last drive ${last.scoreAfter.away}–${last.scoreAfter.home} ≠ final ${fin.away}–${fin.home}`);
  pass("FINAL_MATCHES_LAST_DRIVE", `${events.length} drives; the last ends ${teams.away.abbr} ${fin.away}–${fin.home} ${teams.home.abbr} = final`);

  // ── overtime ───────────────────────────────────────────────────────────────────────────────────────────────
  const anyOT = events.some((e) => e.inOT);
  need(Boolean(fin.overtime) === anyOT, "OT_FLAG", `final.overtime ${Boolean(fin.overtime)} but ${anyOT ? "an" : "no"} overtime drive`);
  pass("OT_FLAG", anyOT ? "overtime flag set and overtime drives recorded" : "no overtime flag and no overtime drive");

  // ── periods ────────────────────────────────────────────────────────────────────────────────────────────────
  const nPeriods = fin.overtime ? 5 : 4;
  const credited = { home: [0, 0, 0, 0, 0], away: [0, 0, 0, 0, 0] };
  for (const ev of events) for (const s of SIDES) credited[s][(ev.inOT ? 5 : ev.scorePeriod) - 1] += ev.delta[s];
  for (const s of SIDES) {
    for (let p = 0; p < 5; p++) {
      const rec = ps[s][p] ?? 0;
      need(rec === credited[s][p], "PERIOD_CREDIT", `${teams[s].abbr} ${PERIOD_SHORT[p + 1]}: recorded ${rec}, drives credit ${credited[s][p]}`);
    }
    if (!fin.overtime) need((ps[s][4] ?? 0) === 0, "PERIOD_CREDIT", `${teams[s].abbr} has overtime points without overtime`);
    const sum = ps[s].slice(0, 5).reduce((a, b) => a + (b ?? 0), 0);
    need(sum === fin[s], "PERIOD_SUM", `${teams[s].abbr} periods sum to ${sum}, final ${fin[s]}`);
  }
  pass("PERIODS_SUM_TO_FINAL", SIDES.map((s) => `${teams[s].abbr} ${ps[s].slice(0, nPeriods).join("+")}=${fin[s]}`).join("; "));
  pass("PERIODS_MATCH_DRIVES", "every period's recorded points equal the points of the drives that ended in it");

  // ── field and clock ────────────────────────────────────────────────────────────────────────────────────────
  for (const ev of events) {
    const end = ev.outcome === "TD" ? 0 : ev.outcome === "SAFETY" ? 100 : ev.fieldStart - ev.netYards;
    need(ev.fieldEnd === end, "FIELD", `drive ${ev.index + 1}: end spot ${ev.fieldEnd} ≠ start ${ev.fieldStart} − net ${ev.netYards}`);
    if (ev.outcome === "TD") need(ev.netYards === ev.fieldStart, "FIELD", `drive ${ev.index + 1}: touchdown net ${ev.netYards} ≠ start ${ev.fieldStart}`);
    need(Number.isInteger(ev.plays) && ev.plays >= 1 && Number.isInteger(ev.seconds) && ev.seconds >= 0, "DRIVE_FIELDS", `drive ${ev.index + 1}: plays/seconds`);
  }
  pass("FIELD_SPOTS", "every drive's end spot = start − net yards (a touchdown's net yards = its start)");
  const regSeconds = events.filter((e) => !e.inOT).reduce((a, e) => a + e.seconds, 0);
  need(regSeconds === REG_SECONDS, "CLOCK_TOTAL", `regulation drives use ${regSeconds} s, not ${REG_SECONDS}`);
  const otSeconds = events.filter((e) => e.inOT).reduce((a, e) => a + e.seconds, 0);
  pass("CLOCK_TOTAL", `regulation drives use exactly 60:00${anyOT ? `; overtime drives ${fmtDuration(otSeconds)}` : ""}`);

  // ── per-team tallies (offense-credited unless stated) ──────────────────────────────────────────────────────
  const T = {};
  for (const s of SIDES) {
    const off = events.filter((e) => e.offense === s);
    const def = events.filter((e) => e.offense !== s);
    const count = (list, r) => list.filter((e) => e.outcome === r).length;
    const td = off.filter((e) => e.outcome === "TD");
    const defTd = def.filter((e) => e.outcome === "OPP_TD");
    let tryPts = 0;
    let xpMade = 0;
    let twoMade = 0;
    let tryFailed = 0;
    for (const e of td) {
      need([6, 7, 8].includes(e.delta[s]) && e.delta[other(s)] === 0, "TD_POINTS", `drive ${e.index + 1}: touchdown worth ${e.delta[s]} (opponent +${e.delta[other(s)]})`);
    }
    for (const e of defTd) {
      need([6, 7].includes(e.delta[s]) && e.delta[other(s)] === 0, "DEF_TD_POINTS", `drive ${e.index + 1}: defensive touchdown worth ${e.delta[s]}`);
    }
    for (const e of [...td, ...defTd]) {
      const t = e.delta[s] - 6;
      tryPts += t;
      if (t === 1) xpMade++;
      else if (t === 2) twoMade++;
      else tryFailed++;
    }
    const fg = count(off, "FG");
    const safeties = count(def, "SAFETY");
    for (const e of off.filter((x) => x.outcome === "FG")) need(e.delta[s] === 3 && e.delta[other(s)] === 0, "FG_POINTS", `drive ${e.index + 1}: field goal worth ${e.delta[s]}`);
    for (const e of def.filter((x) => x.outcome === "SAFETY")) need(e.delta[s] === 2 && e.delta[other(s)] === 0, "SAFETY_POINTS", `drive ${e.index + 1}: safety worth ${e.delta[s]}`);
    // every other drive scores nothing for this side
    for (const e of events) {
      const scoresHere = (e.offense === s && (e.outcome === "TD" || e.outcome === "FG")) || (e.offense !== s && (e.outcome === "OPP_TD" || e.outcome === "SAFETY"));
      if (!scoresHere) need(e.delta[s] === 0, "UNATTRIBUTED_POINTS", `drive ${e.index + 1} (${e.outcome}) gives ${teams[s].abbr} +${e.delta[s]}`);
    }
    const composed = 6 * (td.length + defTd.length) + tryPts + 3 * fg + 2 * safeties;
    need(composed === fin[s], "POINTS_COMPOSITION", `${teams[s].abbr}: 6×${td.length + defTd.length} + ${tryPts} + 3×${fg} + 2×${safeties} = ${composed} ≠ ${fin[s]}`);
    const plays = off.reduce((a, e) => a + e.plays, 0);
    const yards = off.reduce((a, e) => a + e.netYards, 0);
    const seconds = off.reduce((a, e) => a + e.seconds, 0);
    const endHalf = off.filter((e) => e.outcome === "END_HALF");
    const runoff = off.filter((e) => e.notes?.some((n) => n.code === "ENGINE_CLOCK_RUNOFF"));
    T[s] = {
      points: fin[s],
      td: td.length,
      defTd: defTd.length,
      tryPts,
      xpMade,
      twoMade,
      tryFailed,
      fg,
      fgMiss: count(off, "FG_MISS"),
      safeties,
      drives: off.length,
      scoringDrives: td.length + fg,
      plays,
      yards,
      ypp: plays > 0 ? yards / plays : null,
      seconds,
      avgStart: off.length ? off.reduce((a, e) => a + e.fieldStart, 0) / off.length : null,
      endedInside20: off.filter((e) => e.fieldEnd <= 20).length,
      punts: count(off, "PUNT"),
      giveaways: count(off, "TURNOVER") + count(off, "OPP_TD"),
      downs: count(off, "DOWNS"),
      endHalf: endHalf.length,
      endHalfKinds: endHalf.map((e) => e.outcomeLabel),
      runoffDrives: runoff.map((e) => ({ drive: e.index + 1, seconds: e.seconds, plays: e.plays })),
      composition: { td: td.length, defTd: defTd.length, tryPts, fg, safeties, total: composed },
    };
  }
  need(T.home.drives + T.away.drives === events.length, "DRIVE_COUNT", "drives by offense do not add up");
  pass("POINTS_COMPOSITION", SIDES.map((s) => `${teams[s].abbr} ${compositionText(T[s].composition)}`).join("; "));
  pass("POINTS_ATTRIBUTED", "every point belongs to a touchdown (+try), defensive touchdown (+try), field goal or safety drive");
  pass("DRIVE_COUNT", `${teams.away.abbr} ${T.away.drives} + ${teams.home.abbr} ${T.home.drives} = ${events.length} recorded drives`);
  const top = T.home.seconds + T.away.seconds;
  need(top === regSeconds + otSeconds, "TOP_TOTAL", `possession ${top} s ≠ game clock ${regSeconds + otSeconds} s`);
  pass("TOP_TOTAL", `time of possession sums to the game clock (${fmtDuration(top)})`);

  // ── categories ─────────────────────────────────────────────────────────────────────────────────────────────
  const row = (id, group, label, status, get, fmt, note = null) => ({
    id, group, label, status, note, reason: null,
    away: { value: get(T.away), display: fmt(get(T.away)) },
    home: { value: get(T.home), display: fmt(get(T.home)) },
  });
  const runoffNote = SIDES.flatMap((s) => T[s].runoffDrives.map((r) => `${teams[s].abbr} drive ${r.drive}: ${fmtDuration(r.seconds)} on ${r.plays} play${r.plays === 1 ? "" : "s"}`));
  const endHalfNote = SIDES.filter((s) => T[s].endHalf).map((s) => `${teams[s].abbr}: ${T[s].endHalfKinds.join(", ")}`).join("; ");
  const categories = [
    row("points", "Scoring", "Points", STATUS.MODELED, (t) => t.points, fmtInt, "the run's recorded final score"),
    row("td", "Scoring", "Touchdowns (offense)", STATUS.DERIVED, (t) => t.td, fmtInt),
    row("defTd", "Scoring", "Defensive touchdowns", STATUS.DERIVED, (t) => t.defTd, fmtInt, "scored by this team's defense on the opponent's drive"),
    row("tryPts", "Scoring", "Try points after touchdowns", STATUS.DERIVED, (t) => t.tryPts, fmtInt, "read from each touchdown drive's score change: +7 kick good, +8 two-point try good, +6 try failed"),
    row("xpMade", "Scoring", "Extra-point kicks made", STATUS.DERIVED, (t) => t.xpMade, fmtInt),
    row("twoMade", "Scoring", "Two-point tries made", STATUS.DERIVED, (t) => t.twoMade, fmtInt),
    row("tryFailed", "Scoring", "Tries not converted", STATUS.DERIVED, (t) => t.tryFailed, fmtInt, "a failed try is recorded only as +6: whether it was a kick or a two-point attempt is not recorded"),
    row("fg", "Scoring", "Field goals made", STATUS.DERIVED, (t) => t.fg, fmtInt),
    row("fgMiss", "Scoring", "Field goals missed", STATUS.DERIVED, (t) => t.fgMiss, fmtInt),
    row("safeties", "Scoring", "Safeties scored", STATUS.DERIVED, (t) => t.safeties, fmtInt),
    row("drives", "Possession", "Drives", STATUS.DERIVED, (t) => t.drives, fmtInt),
    row("scoringDrives", "Possession", "Scoring drives", STATUS.DERIVED, (t) => t.scoringDrives, fmtInt, "drives ending in a touchdown or a field goal"),
    row("plays", "Possession", "Plays", STATUS.DERIVED, (t) => t.plays, fmtInt, "sum of each drive's recorded play count"),
    row("yards", "Possession", "Total net yards", STATUS.DERIVED, (t) => t.yards, fmtInt, "sum of each drive's recorded net yards"),
    row("ypp", "Possession", "Yards per play", STATUS.DERIVED, (t) => (t.ypp == null ? null : Math.round(t.ypp * 10) / 10), fmtDec, "total net yards ÷ plays"),
    row("top", "Possession", "Time of possession", STATUS.DERIVED, (t) => t.seconds, (v) => fmtDuration(v),
      `sum of each drive's recorded clock${anyOT ? ", overtime included" : ""}${runoffNote.length ? `; includes the engine running out the half (${runoffNote.join("; ")})` : ""}`),
    row("avgStart", "Possession", "Average drive start", STATUS.DERIVED, (t) => (t.avgStart == null ? null : Math.round(t.avgStart * 10) / 10), fmtSpot),
    row("inside20", "Possession", "Drives ending inside the opponent 20", STATUS.DERIVED, (t) => t.endedInside20, fmtInt, "touchdowns included; not the same as red-zone trips"),
    row("punts", "Drive results", "Punts", STATUS.DERIVED, (t) => t.punts, fmtInt),
    row("giveaways", "Drive results", "Turnovers", STATUS.DERIVED, (t) => t.giveaways, fmtInt, "drives ending in a turnover, defensive touchdowns included; interception or fumble is not recorded"),
    row("downs", "Drive results", "Turnovers on downs", STATUS.DERIVED, (t) => t.downs, fmtInt),
    row("endHalf", "Drive results", "Drives ended by the clock", STATUS.DERIVED, (t) => t.endHalf, fmtInt, endHalfNote ? `end of half / regulation / overtime (${endHalfNote})` : "end of half / regulation / overtime"),
    ...TEAM_NOT_MODELED.map((n) => ({
      id: n.id, group: "Not recorded for this run", label: n.label, status: STATUS.NOT_MODELED, note: null, reason: n.reason,
      away: { value: null, display: NOT_MODELED_TEXT },
      home: { value: null, display: NOT_MODELED_TEXT },
    })),
  ];

  const columns = Array.from({ length: nPeriods }, (_, p) => PERIOD_SHORT[p + 1]);
  const winner = fin.home > fin.away ? "home" : fin.away > fin.home ? "away" : null;
  const header = {
    label: "SIMULATED FINAL",
    matchup: `${teams.away.abbr} @ ${teams.home.abbr}`,
    teams: { away: { abbr: teams.away.abbr, name: teams.away.name ?? null }, home: { abbr: teams.home.abbr, name: teams.home.name ?? null } },
    final: { away: fin.away, home: fin.home },
    overtime: Boolean(fin.overtime),
    winner,
    scoreLine: `${teams.away.abbr} ${fin.away}–${fin.home} ${teams.home.abbr}${fin.overtime ? " (OT)" : ""}`,
    runIndex: sample.runIndex,
    runCount: manifest.runCount ?? null,
    kind: sample.kind,
    kindLabel: sample.kindLabel ?? sample.kind,
    engine: manifest.engine,
    engineVersion: manifest.engineVersion ?? null,
    receiptId: manifest.receiptId,
    receiptFile: manifest.file ?? null,
    receiptHash: manifest.receiptHash ?? null,
    generatedAt: manifest.generatedAt ?? null,
  };
  return {
    version: BOX_SCORE_VERSION,
    watermark: BOX_SCORE_WATERMARK,
    header,
    provenance: provenanceLine(header),
    periods: {
      status: STATUS.MODELED,
      note: "points credited to the period in which each scoring drive ended",
      columns,
      away: ps.away.slice(0, nPeriods),
      home: ps.home.slice(0, nPeriods),
      total: { away: fin.away, home: fin.home },
    },
    composition: { away: compositionText(T.away.composition), home: compositionText(T.home.composition) },
    categories,
    players: PLAYER_SECTIONS.map((p) => ({ ...p })),
    invariants,
  };
}

/** "2 TD × 6 + 1 defensive TD × 6 + 2 try points + 3 FG × 3 + 1 safety × 2 = 31" (zero terms left out). */
export function compositionText(c) {
  const parts = [];
  if (c.td) parts.push(`${c.td} TD × 6`);
  if (c.defTd) parts.push(`${c.defTd} defensive TD × 6`);
  if (c.tryPts) parts.push(`${c.tryPts} try point${c.tryPts === 1 ? "" : "s"}`);
  if (c.fg) parts.push(`${c.fg} FG × 3`);
  if (c.safeties) parts.push(`${c.safeties} safet${c.safeties === 1 ? "y" : "ies"} × 2`);
  return `${parts.length ? parts.join(" + ") : "no scoring"} = ${c.total}`;
}

/**
 * "Run #48 of 10,000 (Median-like) · nfl-drive-sim-v2 2.0.0-shadow · receipt nfl-sim-v2:… · artifact hash …". The frozen
 * timestamp (`header.generatedAt`) is NOT in this string: pages print it through <EtTime> (P246: no raw ISO-UTC stamp in
 * visible text), keeping the exact value in the `datetime` attribute.
 */
export function provenanceLine(h) {
  const parts = [
    `Run #${h.runIndex.toLocaleString("en-US")}${h.runCount ? ` of ${h.runCount.toLocaleString("en-US")}` : ""} (${h.kindLabel})`,
    `${h.engine}${h.engineVersion ? ` ${h.engineVersion}` : ""}`,
    `receipt ${h.receiptId}`,
  ];
  if (h.receiptHash) parts.push(`artifact hash ${h.receiptHash}`);
  return parts.join(" · ");
}

/** Non-throwing wrapper for the UI: `{ ok: true, box }` or `{ ok: false, error: { code, reason } }` (fail closed). */
export function safeNflBoxScore(sample, manifest) {
  try {
    return { ok: true, box: nflBoxScore(sample, manifest), error: null };
  } catch (e) {
    return { ok: false, box: null, error: { code: e?.code ?? "BOX_SCORE_ERROR", reason: String(e?.detail ?? e?.message ?? e) } };
  }
}

/** Category groups in display order (the dialog and the server table share it). */
export const CATEGORY_GROUPS = Object.freeze(["Scoring", "Possession", "Drive results", "Not recorded for this run"]);
