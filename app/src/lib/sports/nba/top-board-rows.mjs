/**
 * NBA TOP BOARD ROW VIEW MODEL — PURE, no I/O, no evaluator import (safe for the client table). PRIVATE.
 *
 * One flat, sortable, filterable row per frozen board row, carrying EVERY field the brief names:
 *   player     stable providerAthleteId + team
 *   game       event id, opponent, home/away, tip (UTC instant), ET date
 *   market     board key, label, statistic, basis (MARGINAL | JOINT_SIMULATED_SUM), components
 *   projection the frozen value the board was ranked by (p50, or the mean on a DISCRETE board — ranking@2), with the
 *              p10–p90 range, the family and its role (v0.1 = the OFFICIAL player forecast; anything else is a
 *              SUPPORTING_SIMULATION and is labelled so)
 *   price      sportsbook · line · Over/Under · model probability · odds · edge/EV — each its own cell. Today every
 *              cell is { value: null, state: "NO_AUTHORIZED_PRICE", reasonCode: "NO_AUTHORIZED_PRICE",
 *              display: "No authorized NBA price" }. A cell is filled ONLY from a `boardRowEvaluation` result
 *              (top-board-evaluation.mjs → the shared evaluateMarket) — this module never computes a probability, a
 *              side, an edge or an EV, and never reads a projection against a line.
 *   updated    forecast frozenAt / generatedAt / inputAsOf, and odds capturedAt (null with the reason today)
 *
 * Sorting: game, player, market, sportsbook, projection, edge. Filtering: game, player, market, sportsbook,
 * minimum projection, minimum edge. Sportsbook and edge controls are DISABLED, with the reason, while no row has a
 * price (`filterOptions`). Every sort is total and deterministic (ties → rowId).
 */
import { CATEGORIES, CATEGORIES_V1, DEFAULT_BOARD_FAMILY, MARKET_BASIS, MARKET_BASIS_TEXT, NOT_MODELLED_CATEGORIES, RANKING, RANKING_V1, TOP_BOARD_SCHEMA_V1, categoryByKey } from "./top-boards.mjs";

export const ROW_VIEW_VERSION = "nba-top-board-row-view@1";
import { NO_AUTHORIZED_PRICE, NO_PRICE_TEXT } from "./top-board-view-ops.mjs";
export { NO_AUTHORIZED_PRICE, NO_PRICE_TEXT };
export const NO_PRICE_EXPLANATION = "There is no authorized NBA price: the founder decision decision-nba-markets-authorization is open, NBA_MARKET_CONFIG has no player prop family, and the preregistration (§13) withholds odds, lines, edges and picks. Nothing on this board is an Over or an Under.";
/** The family whose player projections are the official forecast (coordinator: official = v0.1 players). */
export const OFFICIAL_PLAYER_FAMILY = DEFAULT_BOARD_FAMILY;

export const PRICE_FIELDS = Object.freeze(["sportsbook", "line", "side", "modelProbability", "odds", "edge"]);
export const PRICE_FIELD_LABELS = Object.freeze({
  sportsbook: "Sportsbook", line: "Line", side: "Over / Under", modelProbability: "Model probability", odds: "Odds", edge: "Edge / EV",
});

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const METRIC_LABEL = { MODEL_MEDIAN_P50: "model median", MODEL_MEAN: "model mean" };

/** A price cell in its "no authorized price" state. */
export const noPriceCell = (reasonCode = NO_AUTHORIZED_PRICE, display = NO_PRICE_TEXT) => Object.freeze({ value: null, state: reasonCode, reasonCode, display });

const fmtAmerican = (a) => (isNum(a) ? (a > 0 ? `+${a}` : String(a)) : "—");
const pct = (p) => (isNum(p) ? `${(p * 100).toFixed(1)}%` : "—");

/**
 * Price cells from a row evaluation (top-board-evaluation.mjs result) — or the NO_AUTHORIZED_PRICE cells when none.
 * Only an EVALUATED result fills values, and every value is copied from the shared evaluator's output.
 */
export function priceCells(evaluation = null) {
  if (!evaluation || evaluation.state === NO_AUTHORIZED_PRICE) return Object.fromEntries(PRICE_FIELDS.map((f) => [f, noPriceCell()]));
  if (evaluation.state !== "EVALUATED" || !evaluation.evaluation) {
    const code = evaluation.reasonCodes?.[0] ?? evaluation.state ?? NO_AUTHORIZED_PRICE;
    const text = evaluation.state === "NOT_MODELLED" ? "Not modelled" : `Price not used (${code})`;
    return Object.fromEntries(PRICE_FIELDS.map((f) => [f, noPriceCell(code, text)]));
  }
  const ev = evaluation.evaluation;
  const lean = ev.lean ?? "NONE";
  // A side is DISPLAYED only for a QUALIFIED evaluation. The evaluator may return a lean while non-blocking reasons
  // (private publication, sport not product-eligible) withhold it — that is not a pick and never reads as one.
  const qualified = ev.eligibility?.qualified === true;
  const shownLean = qualified ? lean : "NONE";
  const leanText = shownLean === "OVER" ? "Over" : shownLean === "UNDER" ? "Under" : qualified ? "No lean" : `No pick (${ev.withheldReasons?.[0] ?? "not qualified"})`;
  const leanSide = shownLean === "OVER" ? "over" : shownLean === "UNDER" ? "under" : null;
  const edgeBest = ev.edge && leanSide ? ev.edge[leanSide] : null; // never max(over, under): that would invent a side
  const cell = (value, display) => Object.freeze({ value, state: "EVALUATED", reasonCode: null, display });
  return {
    sportsbook: cell(evaluation.book, evaluation.book),
    line: cell(evaluation.line, String(evaluation.line)),
    side: Object.freeze({ value: lean, state: "EVALUATED", reasonCode: lean === "NONE" ? (ev.withheldReasons?.[0] ?? null) : null, display: leanText, qualified: ev.eligibility?.qualified ?? false, withheldReasons: ev.withheldReasons ?? [] }),
    modelProbability: cell({ over: ev.pOver, under: ev.pUnder, push: ev.pPush }, `Over ${pct(ev.pOver)} · Under ${pct(ev.pUnder)}`),
    odds: cell({ over: evaluation.overAmerican, under: evaluation.underAmerican }, `${fmtAmerican(evaluation.overAmerican)} / ${fmtAmerican(evaluation.underAmerican)}`),
    edge: cell({ edge: ev.edge, ev: ev.ev, best: edgeBest }, isNum(edgeBest) ? `Edge ${(edgeBest * 100).toFixed(1)} pts · EV ${isNum(ev.ev?.[leanSide]) ? (ev.ev[leanSide] * 100).toFixed(1) : "—"}%` : "—"),
  };
}

const MARKET_ORDER = [...CATEGORIES, ...NOT_MODELLED_CATEGORIES].map((c) => c.key);

/** One board row → its view. `edition` is the edition it was frozen in; `doc` its day document. */
export function boardRowView(row, { edition, doc, evaluation = null } = {}) {
  const c = categoryByKey(row.category);
  const isV1 = (doc?.schema ?? TOP_BOARD_SCHEMA_V1) === TOP_BOARD_SCHEMA_V1;
  const metric = row.rankingMetric ?? (isV1 ? RANKING_V1.metric : RANKING.metrics.CONTINUOUS);
  const value = metric === RANKING.metrics.DISCRETE ? row.projection?.mean : row.projection?.p50;
  const basis = row.marketBasis ?? c?.basis ?? MARKET_BASIS.MARGINAL;
  const family = row.family ?? doc?.family ?? null;
  const price = priceCells(evaluation);
  const capturedAt = evaluation?.state === "EVALUATED" ? evaluation.capturedAt ?? null : null;
  return {
    version: ROW_VIEW_VERSION,
    rowId: row.rowId,
    rank: row.rank,
    edition: edition?.edition ?? row.edition ?? null,
    player: {
      name: row.player?.name ?? null,
      providerAthleteId: row.player?.providerAthleteId ?? null,
      team: row.team ? { abbr: row.team.abbr ?? null, name: row.team.name ?? null, providerTeamId: row.team.providerTeamId ?? null, espnAbbr: row.team.espnAbbr ?? null } : null,
    },
    game: {
      eventId: row.eventId,
      opponent: row.opponent ? { abbr: row.opponent.abbr ?? null, name: row.opponent.name ?? null, providerTeamId: row.opponent.providerTeamId ?? null } : null,
      homeAway: row.homeAway ?? null,
      tipoffUtc: row.tipoffUtc ?? null,
      etDate: doc?.date ?? null,
    },
    market: {
      key: row.category, label: c?.label ?? row.category, stat: row.stat,
      basis, basisText: MARKET_BASIS_TEXT[basis] ?? null,
      components: row.components ?? c?.components ?? null,
    },
    projection: {
      value: isNum(value) ? value : null,
      metric,
      metricLabel: METRIC_LABEL[metric] ?? metric,
      p50: row.projection?.p50 ?? null,
      mean: row.projection?.mean ?? null,
      p10: row.range?.p10 ?? null,
      p90: row.range?.p90 ?? null,
      conditioning: row.quantileConditioning ?? null,
      playRate: row.playRate ?? null,
      expectedMinutes: row.expectedMinutes ?? null,
      family,
      modelVersion: row.modelVersion ?? null,
      role: family === OFFICIAL_PLAYER_FAMILY ? "OFFICIAL" : "SUPPORTING_SIMULATION",
      forecastSha256: row.receipt?.forecastSha256 ?? null,
    },
    price,
    priceExplanation: evaluation ? null : NO_PRICE_EXPLANATION,
    updated: {
      forecastFrozenAt: edition?.frozenAt ?? row.frozenAt ?? null,
      forecastGeneratedAt: row.updated?.generatedAt ?? null,
      forecastInputAsOf: row.updated?.inputAsOf ?? null,
      oddsCapturedAt: capturedAt,
      oddsCapturedAtReason: capturedAt ? null : NO_AUTHORIZED_PRICE,
    },
    injuryStatus: row.injuryStatus ?? null,
    flags: row.flags ?? [],
    sortKeys: {
      game: `${row.tipoffUtc ?? "9999"}|${row.eventId}`,
      player: `${(row.player?.name ?? "").toLowerCase()}|${row.player?.providerAthleteId ?? ""}`,
      market: MARKET_ORDER.indexOf(row.category) * 100 + (row.rank ?? 99),
      sportsbook: price.sportsbook.value ?? null,
      projection: isNum(value) ? value : null,
      edge: isNum(price.edge.value?.best) ? price.edge.value.best : null,
    },
  };
}

/**
 * Every market the board knows, with its state on THIS document:
 *   RANKED (rows) · EMPTY (board frozen, nobody eligible — its emptyReason) · NOT_IN_THIS_FREEZE (an @1 day file,
 *   frozen before the joint boards existed) · NOT_MODELLED (R+A).
 */
export function marketStates(doc) {
  const editions = doc?.editions ?? [];
  const v1 = (doc?.schema ?? TOP_BOARD_SCHEMA_V1) === TOP_BOARD_SCHEMA_V1;
  const v1Keys = new Set(CATEGORIES_V1.map((c) => c.key));
  const out = [];
  for (const c of CATEGORIES) {
    const boards = editions.map((e) => e.boards?.[c.key]).filter(Boolean);
    const rows = boards.reduce((s, b) => s + (b.rows?.length ?? 0), 0);
    if (!doc) out.push({ key: c.key, label: c.label, basis: c.basis, state: "NO_DATA", rows: 0, text: "No board document." });
    else if (!boards.length && v1 && !v1Keys.has(c.key)) out.push({ key: c.key, label: c.label, basis: c.basis, state: "NOT_IN_THIS_FREEZE", rows: 0, text: `Not on this freeze: the ${doc.date} file was frozen under board schema @1, before the joint ${c.label} board existed. Frozen files are never rewritten; it appears from the next freeze.` });
    else if (!boards.length) out.push({ key: c.key, label: c.label, basis: c.basis, state: "NO_DATA", rows: 0, text: "No board for this market in this document." });
    else if (!rows) out.push({ key: c.key, label: c.label, basis: c.basis, state: "EMPTY", rows: 0, text: boards.map((b) => b.emptyReason).filter(Boolean).join(" · ") || "No player passed every eligibility rule." });
    else out.push({ key: c.key, label: c.label, basis: c.basis, state: "RANKED", rows, text: null });
  }
  for (const c of NOT_MODELLED_CATEGORIES) {
    const b = editions.map((e) => e.boards?.[c.key]).find(Boolean);
    out.push({ key: c.key, label: c.label, basis: c.basis, state: "NOT_MODELLED", rows: 0, text: b?.emptyReason ?? `${c.label} is not modelled: no forecast family simulates ${c.components.join(" + ")} jointly, and adding marginal projections is not its distribution — it is never computed.` });
  }
  return out;
}

/** The whole table model for one day document. `evaluations`: { [rowId]: boardRowEvaluation result }. */
export function boardTableModel(doc, { evaluations = {} } = {}) {
  const rows = [];
  for (const e of doc?.editions ?? []) for (const b of Object.values(e.boards ?? {})) for (const r of b.rows ?? []) rows.push(boardRowView(r, { edition: e, doc, evaluation: evaluations[r.rowId] ?? null }));
  rows.sort((a, b) => a.sortKeys.market - b.sortKeys.market || compareStr(a.sortKeys.game, b.sortKeys.game) || compareStr(a.rowId, b.rowId));
  return {
    version: ROW_VIEW_VERSION,
    date: doc?.date ?? null,
    family: doc?.family ?? null,
    schema: doc?.schema ?? null,
    modelVersion: doc?.modelVersion ?? null,
    rows,
    markets: marketStates(doc),
    priced: rows.some((r) => r.price.sportsbook.state === "EVALUATED"),
  };
}

const compareStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// Sorting / filtering / control options live in a dependency-free module so the client table can import them without
// pulling the receipt hashing (node:crypto) this file reaches through top-boards.mjs. Re-exported unchanged.
export { SORT_KEYS, SORT_LABELS, sortRowViews, filterRowViews, filterOptions } from "./top-board-view-ops.mjs";
