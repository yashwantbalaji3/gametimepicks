/**
 * THE ONE ACCESSOR for official NBA player projections (forecast guard, founder authorization 2026-11-04). PURE,
 * browser-safe (no imports beyond the pure guard module). The node reader that pairs a lane file with its guard file is
 * forecast-guard-files.mjs.
 *
 * Every NBA surface that prints a player projection reads the lane THROUGH applyForecastGuard: the /nba hub cards and
 * Official Forecasts, game pages (Theater official card, settled page), /nba/projections and its Top Boards, /today and
 * home (via the hub), Level A / Bank Builder / Moonshot / Parlay Lab inputs.
 *
 * HIDE-ONLY. A row the guard puts in review or blocked keeps its name and team but loses every figure (expected
 * minutes, medians, combo medians become null) and carries `guard` = { state, rules, text }; the surface prints
 * UNDER_REVIEW_TEXT in place of the numbers. A pass row with an R_STAT cell loses that cell and every combo containing
 * it. Nothing is ever re-valued: a printed figure is always the lane's own. Nulling (not a flag alone) is what makes it
 * fail closed — a surface that forgot the label prints its "—", never the number and never a 0.
 *
 * FORWARD ONLY (historical reproducibility). The guard applies to slates dated on or after FORECAST_GUARD.cutover. Any
 * earlier slate is returned AS THE SAME OBJECT, so settled and past pages render byte-for-byte as before (pinned by
 * forecast-guard-accessor.test.mjs over every committed lane file). The lane files are never written.
 *
 * FAIL CLOSED. On or after the cut-over, a slate whose guard document is missing, of another schema, of another date,
 * computed against another lane build, or silent on a row, withholds that row (GUARD_MISSING): no guard data, no number.
 */
import { FORECAST_GUARD_SCHEMA, GUARD_TEXT, FLAG_TEXT, FLAG_SHORT, UNDER_REVIEW_TEXT } from "./forecast-guard.mjs";

export const FORECAST_GUARD = Object.freeze({
  id: "nba-forecast-guard@1",
  /** Rollback switch: false returns every lane untouched (the pre-guard site). */
  enabled: true,
  /**
   * The first slate the guard applies to. The release owner sets it to the first slate whose lane is published AFTER
   * the release merges, so no page that was ever live changes. Slates before it render exactly as they were frozen.
   */
  cutover: "2026-11-05",
  /** public/data/<dir>/<date>.json — the committed guard document per slate. */
  dir: "nba/forecast-guard",
});

const COMBO_PARTS = Object.freeze({ pra: ["pts", "reb", "ast"], ptsReb: ["pts", "reb"], ptsAst: ["pts", "ast"] });
const nulls = (o) => (o && typeof o === "object" ? Object.fromEntries(Object.keys(o).map((k) => [k, null])) : o);

/** Does the guard apply to this slate date? */
export function guardApplies(date, { cutover = FORECAST_GUARD.cutover, enabled = FORECAST_GUARD.enabled } = {}) {
  return Boolean(enabled && typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= cutover);
}

/** Problems that make a guard document unusable for this lane (empty = usable). */
export function guardDocProblems(lane, guardDoc) {
  if (!guardDoc) return ["no guard document"];
  const p = [];
  if (guardDoc.schema !== FORECAST_GUARD_SCHEMA) p.push(`schema ${guardDoc.schema}`);
  if (guardDoc.date !== lane?.date) p.push(`date ${guardDoc.date} ≠ lane ${lane?.date}`);
  if (guardDoc.asOf !== lane?.generatedAt) p.push(`computed against lane ${guardDoc.asOf}, lane is ${lane?.generatedAt}`);
  return p;
}

const rowText = (codes) => codes.map((c) => GUARD_TEXT[c] ?? c);

function guardRow(row, v) {
  if (!v || (v.state !== "pass" && v.state !== "review" && v.state !== "blocked")) v = { state: "review", rules: ["GUARD_MISSING"], review: [], cells: {} };
  if (v.state !== "pass") {
    const codes = [...(v.rules ?? []), ...(v.review ?? [])];
    return { ...row, expectedMinutes: null, medians: nulls(row.medians), ...(row.comboMedians ? { comboMedians: nulls(row.comboMedians) } : {}), guard: { state: v.state, rules: codes, text: UNDER_REVIEW_TEXT, reasons: rowText(codes) } };
  }
  const flagged = Object.entries(v.cells ?? {}).filter(([, rs]) => rs?.length).map(([k]) => k);
  if (!flagged.length) return row;
  const medians = { ...row.medians };
  for (const k of flagged) if (k in medians) medians[k] = null;
  const comboMedians = row.comboMedians ? { ...row.comboMedians } : undefined;
  if (comboMedians) for (const [c, parts] of Object.entries(COMBO_PARTS)) if (c in comboMedians && parts.some((q) => flagged.includes(q))) comboMedians[c] = null;
  const codes = [...new Set(flagged.flatMap((k) => v.cells[k]))];
  return { ...row, medians, ...(comboMedians ? { comboMedians } : {}), guard: { state: "pass", cells: flagged, rules: codes, text: UNDER_REVIEW_TEXT, reasons: rowText(codes) } };
}

/**
 * The lane as every surface must read it.
 * @param {any} lane      a committed lane snapshot (or null)
 * @param {any} guardDoc  the committed guard document for the same date (or null)
 * @returns the SAME lane object before the cut-over (or with the switch off); otherwise a guarded copy.
 */
export function applyForecastGuard(lane, guardDoc, opts = {}) {
  if (!lane || !Array.isArray(lane.games) || !guardApplies(lane.date, opts)) return lane;
  const problems = guardDocProblems(lane, guardDoc);
  const byGame = new Map(problems.length ? [] : (guardDoc.games ?? []).map((g) => [String(g.providerEventId), g]));
  const games = lane.games.map((g) => {
    let gg = byGame.get(String(g.providerEventId)) ?? null;
    // a guard computed against another receipt is not this game's guard
    if (gg && gg.receiptPayloadSha256 !== (g.receipt?.payloadSha256 ?? null)) gg = null;
    const players = { ...g.players };
    for (const s of ["away", "home"]) if (Array.isArray(g.players?.[s])) players[s] = g.players[s].map((r) => guardRow(r, gg?.players?.[String(r.providerAthleteId)] ?? null));
    const fav = gg ? gg.favoured : { state: "review", flags: ["GUARD_MISSING"], rotationFlagged: [] };
    return {
      ...g, players,
      ...(fav?.state === "review" ? { guard: { favoured: { state: "review", flags: fav.flags, text: fav.flags.map((f) => FLAG_TEXT[f] ?? GUARD_TEXT[f] ?? f), short: fav.flags.map((f) => FLAG_SHORT[f]).filter(Boolean).join("; "), players: (fav.rotationFlagged ?? []).map((r) => ({ name: r.name, status: r.status })) } } } : {}),
    };
  });
  return { ...lane, games, guard: { id: FORECAST_GUARD.id, state: problems.length ? "MISSING" : "APPLIED", ...(problems.length ? { problems } : {}) } };
}

/** Is this guarded row's whole projection withheld? */
export const rowWithheld = (row) => Boolean(row?.guard && row.guard.state !== "pass");
/** Is this one cell withheld (a whole-row hold, or a flagged cell / combo)? */
export const cellWithheld = (row, k) => rowWithheld(row) || Boolean(row?.guard && ((row.medians && k in row.medians ? row.medians[k] : row.comboMedians?.[k]) == null));
/** Is a game's favoured side under review? (products: not an eligible leg; pages: a warning beside the side) */
export const favouredUnderReview = (game) => game?.guard?.favoured?.state === "review";
