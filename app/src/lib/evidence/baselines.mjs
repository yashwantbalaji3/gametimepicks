/**
 * PRE-REGISTERED BASELINES for the sequential evidence evaluator (E-1), and the per-row paired differences it reads
 * from the Forecast Ledger.
 *
 * A baseline is fixed per family BEFORE looking at the result, so the comparison cannot be tuned after the fact:
 *   COIN             p = 0.5 for a two-sided pick (winner, run line, over/under). Same floor model-health uses.
 *   UNIFORM_CLASSES  1/K per class for a 1X2 (log loss ln 3). Same floor model-health uses.
 *   TRAILING_RATE    the family's own observed rate on EARLIER slates only (point-in-time, Laplace-smoothed), for a
 *                    skewed yes/no family (anytime scorer, HR, clean sheet) where a coin flip is a straw man. The
 *                    first slates, before WARMUP_EVENTS earlier events exist, have no baseline and are excluded.
 *   NONE             no pre-registered baseline exists in the ledger (continuous projections, exact scorelines).
 *                    Reported NOT_COMPUTABLE — never compared against an invented number.
 *
 * The market is never the maturity baseline. It is a separate badge (§15): log loss against the recorded market
 * probability, or, for a projection with a frozen line, absolute error against that line (the book's median).
 * The ledger records the market as each owner did; this module does not de-vig or re-price it.
 */

export const BASELINE = Object.freeze({
  COIN: { id: "COIN", description: "coin flip (p = 0.5, log loss 0.6931)" },
  UNIFORM_CLASSES: { id: "UNIFORM_CLASSES", description: "even odds across classes (1/K)" },
  TRAILING_RATE: { id: "TRAILING_RATE", description: "the family's observed rate on earlier slates only (Laplace-smoothed)" },
  NONE: { id: "NONE", description: "no pre-registered baseline in the ledger" },
});

/** Family → baseline. A family not listed here gets NONE and is reported, not guessed. */
export const FAMILY_BASELINES = Object.freeze({
  // Two-sided picks.
  nfl_game_winner: "COIN",
  mlb_moneyline: "COIN",
  mlb_run_line: "COIN",
  mlb_total: "COIN",
  ufc_winner: "COIN",
  epl_btts: "COIN",
  epl_over_2_5: "COIN",
  // Multiclass result.
  epl_1x2: "UNIFORM_CLASSES",
  ligue1_1x2: "UNIFORM_CLASSES",
  // Skewed yes/no.
  anytime_td: "TRAILING_RATE",
  mlb_homer_nukes: "TRAILING_RATE",
  epl_anytime_goalscorer: "TRAILING_RATE",
  epl_shots_on_goal_over_0_5: "TRAILING_RATE",
  epl_clean_sheet: "TRAILING_RATE",
});

export const WARMUP_EVENTS = 30;

/** Ledger family → model-health family id, so a BREACHED alarm can be read beside the evidence. */
export const HEALTH_IDS = Object.freeze({
  "NFL:nfl_game_winner": "nfl_winner",
  "NFL:anytime_td": "nfl_anytime_td",
  "NFL:player_receptions": "nfl_player_receptions",
  "NFL:player_rush_yds": "nfl_player_rush_yds",
  "NFL:player_reception_yds": "nfl_player_reception_yds",
  "NFL:player_pass_yds": "nfl_player_pass_yds",
  "NFL:nfl_game_total": "nfl_total_range",
  "NFL:nfl_game_margin": "nfl_margin_range",
  "MLB:mlb_moneyline": "mlb_moneyline",
  "MLB:mlb_run_line": "mlb_run_line",
  "MLB:mlb_total": "mlb_total",
  "UFC:ufc_winner": "ufc_winner",
  "EPL:epl_1x2": "epl_result",
  "LIGUE_1:ligue1_1x2": "ligue1_result",
});

const EPS = 1e-6;
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const clamp01 = (p) => Math.min(1 - EPS, Math.max(EPS, p));
const binaryLoss = (p, y) => (y === 1 ? -Math.log(clamp01(p)) : -Math.log(1 - clamp01(p)));

const ET = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
const etDate = (iso) => (typeof iso === "string" && Number.isFinite(Date.parse(iso)) ? ET.format(new Date(iso)) : null);

/**
 * The slate a row belongs to (the site's ET day). eventStart first; then the pregame publish time; then a date the
 * owner wrote into the receipt id (Homer Nukes files are per game day). Returns { slate, source } or null.
 */
export function slateOf(row) {
  const fromStart = etDate(row?.eventStart);
  if (fromStart) return { slate: fromStart, source: "eventStart" };
  const fromPublish = etDate(row?.publishedAt);
  if (fromPublish) return { slate: fromPublish, source: "publishedAt" };
  const m = typeof row?.receiptId === "string" ? row.receiptId.match(/(\d{4}-\d{2}-\d{2})/) : null;
  if (m) return { slate: m[1], source: "receiptId" };
  return null;
}

/** Why a row is not in the graded sample. null = it is gradable. Pending / void / withdrawn are never a loss. */
export function exclusionReason(row) {
  if (row.publicationStatus === "WITHDRAWN") return "withdrawn";
  const s = row.settlement?.state;
  if (s === "PENDING") return "pending";
  if (s === "VOID") return "void";
  if (s !== "SETTLED") return "noMeasurement";
  const m = row.measurement;
  if (row.forecastKind === "CONTINUOUS_PROJECTION") return isNum(m?.absoluteError) ? null : "noMeasurement";
  return isNum(m?.logLoss) ? null : "noMeasurement";
}

/** The model's log loss on a graded probability row, from the ledger's own measurement. */
const modelLoss = (row) => row.measurement.logLoss;

/** Market loss for the badge, or null when the ledger did not record a usable market number. */
export function marketDiff(row) {
  const mk = row.market;
  if (!mk) return null;
  if (row.forecastKind === "BINARY_PROBABILITY") {
    const q = mk.impliedProbability;
    const y = row.measurement?.observed;
    if (!isNum(q) || (y !== 0 && y !== 1)) return null;
    return modelLoss(row) - binaryLoss(q, y);
  }
  if (row.forecastKind === "MULTICLASS_PROBABILITY") {
    const q = mk.impliedProbability;
    const cat = row.settlement?.finalCategory;
    if (!q || typeof q !== "object" || !isNum(q[cat])) return null;
    return modelLoss(row) - (-Math.log(clamp01(q[cat])));
  }
  if (row.forecastKind === "CONTINUOUS_PROJECTION") {
    const line = mk.line;
    const fin = row.settlement?.finalValue;
    if (!isNum(line) || !isNum(fin) || !isNum(row.measurement?.absoluteError)) return null;
    return row.measurement.absoluteError - Math.abs(line - fin);
  }
  return null;
}

/**
 * Paired differences for one family (all its rows, every model version), in slate order, point-in-time.
 * Returns { items: [{ row, slate, d, dMarket }], excluded: { reason: count }, slateSources: { source: count } }.
 * `d` is null where the family has no baseline (NONE) or the row falls in the TRAILING_RATE warm-up.
 */
export function pairedDifferences(rows, family) {
  const baselineId = FAMILY_BASELINES[family] ?? "NONE";
  const excluded = {};
  const slateSources = {};
  const bump = (o, k) => { o[k] = (o[k] ?? 0) + 1; };
  const graded = [];
  for (const row of rows) {
    const why = exclusionReason(row);
    if (why) { bump(excluded, why); continue; }
    const s = slateOf(row);
    if (!s) { bump(excluded, "noSlateDate"); continue; }
    bump(slateSources, s.source);
    graded.push({ row, slate: s.slate });
  }
  graded.sort((a, b) => (a.slate < b.slate ? -1 : a.slate > b.slate ? 1 : a.row.forecastId < b.row.forecastId ? -1 : 1));

  // TRAILING_RATE: the rate of every EARLIER slate, never the current one.
  let priorYes = 0;
  let priorN = 0;
  let curSlate = null;
  let slateYes = 0;
  let slateN = 0;
  const items = [];
  for (const g of graded) {
    if (g.slate !== curSlate) {
      priorYes += slateYes;
      priorN += slateN;
      slateYes = 0;
      slateN = 0;
      curSlate = g.slate;
    }
    const row = g.row;
    let d = null;
    if (baselineId === "COIN" && row.forecastKind === "BINARY_PROBABILITY") d = modelLoss(row) - Math.LN2;
    else if (baselineId === "UNIFORM_CLASSES" && row.forecastKind === "MULTICLASS_PROBABILITY") {
      const k = Object.keys(row.classProbabilities ?? {}).length;
      if (k >= 2) d = modelLoss(row) - Math.log(k);
    } else if (baselineId === "TRAILING_RATE" && row.forecastKind === "BINARY_PROBABILITY") {
      const y = row.measurement.observed;
      if (priorN >= WARMUP_EVENTS && (y === 0 || y === 1)) d = modelLoss(row) - binaryLoss((priorYes + 1) / (priorN + 2), y);
      else if (priorN < WARMUP_EVENTS) bump(excluded, "warmup");
      if (y === 0 || y === 1) { slateYes += y; slateN += 1; }
    }
    items.push({ row, slate: g.slate, d, dMarket: marketDiff(row) });
  }
  return { baselineId, items, excluded, slateSources };
}
