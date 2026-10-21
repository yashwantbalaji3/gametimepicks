/**
 * NFL FORECAST VIEW — the ONE consumption layer every public NFL surface reads (hub slate, game page, Top boards).
 * NFL-local; CONTRACT-001 owns the cross-sport contract. Pure: documents in, view out; no I/O, no clock. Client-safe
 * (player-row.tsx imports formatValue), so the official snapshot is built by the server-side loader
 * (forecast-view-load.mjs → lib/consistency/official-snapshot.mjs `nflOfficialSnapshot`) and handed in.
 *
 * SOURCES OF RECORD (founder decision 2026-10-20 — Cross-Product Prediction Consistency):
 *
 *   game outcome (win chance, projected score, margin, total)  → the published forecast of record
 *                                                                 (nfl-regular-season-public-v1)
 *   passing / rushing / receiving yards, receptions             → the OFFICIAL player board, read through the official
 *   anytime touchdown                                             forecast snapshot (the families the prop ledger
 *                                                                 freezes and grades). Joined by `nfl-athlete-*` id only.
 *   passing touchdowns, first touchdown scorer                  → not published (no evaluated model)
 *
 *   World Model V2 is a SUPPORTING SIMULATION only. Its counted outcomes and sampled games render in their own block,
 *   labelled SUPPORTING_LABEL, with its version and the forecast input hash it was built from, and a notice when that
 *   hash is not the forecast of record's. Its numbers never enter a player row, a ranked board or a headline, and a
 *   player the board does not project shows "No official projection" — never a World Model V2 stand-in. Its embedded
 *   copy of the forecast of record (`forecastOfRecord`) is not carried into the view.
 *
 * EXACT NUMBERS. Every value is the snapshot's stored number, unrounded. Rounding happens only at render, through
 * `formatValue` (yards whole numbers, counts one decimal, probabilities one-decimal percent — the existing NFL display
 * convention).
 *
 * Nothing in this file promotes a model: every NFL output remains PUBLIC_EXPERIMENTAL ("under forward evaluation").
 */

import { PUBLIC_BOARD_CLEARED } from "./board-ranking.mjs";
import { isWithheldOffer, sanitizeOffer } from "../odds/public-offer-sanitizer.mjs";

export const NFL_FORECAST_VIEW_VERSION = 2;

export const SOURCES = Object.freeze({
  record: Object.freeze({ key: "record", label: "Game Time Forecast", modelId: "nfl-regular-season-public-v1", role: "OFFICIAL" }),
  playerBoard: Object.freeze({ key: "playerBoard", label: "Official player board", modelId: "player board", role: "OFFICIAL" }),
  opportunityTd: Object.freeze({ key: "opportunityTd", label: "Touchdown model (official player board)", modelId: "nfl-opportunity-td (player board)", role: "OFFICIAL" }),
  worldModel: Object.freeze({ key: "worldModel", label: "World Model V2", modelId: "nfl-world-model-v2", role: "SUPPORTING_SIMULATION" }),
});

/** The one label every World Model V2 block carries. */
export const SUPPORTING_LABEL = "Supporting simulation (World Model V2 · not the official projection · not graded)";
export const NO_OFFICIAL_PROJECTION = "No official projection";

/** Player families, in display order. `source: null` = not published, with the reason shown instead of a number. */
export const PLAYER_FAMILIES = Object.freeze([
  Object.freeze({ key: "passingYards", title: "Passing yards", short: "Pass yds", unit: "yds", kind: "yards", source: "playerBoard" }),
  Object.freeze({ key: "rushingYards", title: "Rushing yards", short: "Rush yds", unit: "yds", kind: "yards", source: "playerBoard" }),
  Object.freeze({ key: "receivingYards", title: "Receiving yards", short: "Rec yds", unit: "yds", kind: "yards", source: "playerBoard" }),
  Object.freeze({ key: "receptions", title: "Receptions", short: "Rec", unit: "rec", kind: "count", source: "playerBoard" }),
  Object.freeze({ key: "anytimeTd", title: "Anytime touchdown", short: "Anytime TD", unit: "%", kind: "probability", source: "opportunityTd" }),
  Object.freeze({ key: "passingTd", title: "Passing touchdowns", short: "Pass TD", unit: "TD", kind: "count", source: null, withheld: "Passing touchdowns have no evaluated projection on the official player board yet, so no number is published." }),
  Object.freeze({ key: "firstTd", title: "First touchdown scorer", short: "First TD", unit: "%", kind: "probability", source: null, withheld: "First-touchdown odds need the order of scoring plays, which no evaluated model here records, so no first-touchdown probability is published." }),
]);
export const BOARD_FAMILIES = Object.freeze(PLAYER_FAMILIES.map((f) => f.key));

/** One consistent rounding rule for every surface — applied at render only; the view keeps exact numbers. */
export function formatValue(kind, v) {
  if (v == null || !Number.isFinite(v)) return "—";
  if (kind === "probability") return `${(v * 100).toFixed(1)}%`;
  if (kind === "count") return (Math.round(v * 10) / 10).toFixed(1);
  return String(Math.round(v));
}

/**
 * Players cleared for a public ranked list: the ONE shared allowlist (board-ranking.mjs PUBLIC_BOARD_CLEARED) plus World
 * Model V2's own "ACTIVE" (kept for the shared evaluator, which reads this list). Out / Inactive / Questionable /
 * Doubtful never rank.
 */
export const CLEARED = Object.freeze([...PUBLIC_BOARD_CLEARED, "ACTIVE"]);

/** View family → the canonical market key every NFL artifact, the official snapshot and every page use for it. */
export const MARKET_KEY = Object.freeze({ passingYards: "player_pass_yds", rushingYards: "player_rush_yds", receivingYards: "player_reception_yds", receptions: "player_receptions", anytimeTd: "anytime_td" });
/** World Model V2 family names (supporting simulation only — used to say who it simulates that the board does not project). */
const WM_FAMILY = Object.freeze({ passingYards: "passingYards", rushingYards: "rushingYards", receivingYards: "receivingYards", receptions: "receptions" });

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const quantile = (o, q) => o?.distribution?.points?.find((x) => x.q === q)?.v ?? null;

/**
 * ONE MARKET TRUTH: a sportsbook price captured for (event, player, market) is shown beside the official projection —
 * the same book, line and prices as every other page, read from the player board artifact that holds the capture.
 * A market is a market, not a model output; it never changes the projection.
 *
 * O-7 (eligible-operators@1): the slot passes the SAME sanitiser the loaders use, so a capture from a book outside
 * the allowlist reaches PlayerRow as `{ sportsbook: null, bookWithheld }` — no book, line or price — even if a caller
 * handed this an unsanitised board.
 */
const capturedMarket = (board, playerId, fam) => {
  const m = sanitizeOffer(board?.players?.find((p) => p.playerId === playerId)?.markets?.[MARKET_KEY[fam]]?.market);
  if (isWithheldOffer(m)) return m;
  return m ? { sportsbook: m.sportsbook, line: m.line ?? null, overOdds: m.overOdds ?? null, underOdds: m.underOdds ?? null, yesOdds: m.yesOdds ?? null, capturedAt: m.capturedAt ?? null } : null;
};

/**
 * The supporting block: World Model V2 for this game, labelled, with its version and input hash, and a notice when it
 * was built on a forecast revision other than the forecast of record. Never official, never graded.
 */
function supportingSimulation(f, w) {
  const inputHash = w.run?.inputs?.forecastInputHash ?? null;
  const recordInputHash = f.model?.inputHash ?? null;
  const alignedWithRecord = inputHash && recordInputHash ? inputHash === recordInputHash : null;
  const builtFrom = w.run?.inputs?.forecastGeneratedAt ?? null;
  const older = builtFrom && f.generatedAt ? Date.parse(builtFrom) < Date.parse(f.generatedAt) : true;
  return {
    role: "SUPPORTING_SIMULATION", label: SUPPORTING_LABEL, official: false, graded: false,
    source: SOURCES.worldModel, version: w.model.version, simulationId: w.simulationId, generatedAt: w.run.generatedAt,
    inputHash, recordInputHash, alignedWithRecord,
    revisionNotice: alignedWithRecord === false
      ? `Built on ${older ? "an older" : "a different"} forecast revision: these simulated games used forecast input ${inputHash}, not the forecast of record's ${recordInputHash}. Use the forecast above for the official numbers.`
      : null,
    runs: w.run.runs, inputs: w.run.inputs,
    winProbability: w.game.winProbability, overtime: w.game.overtime,
    margin: w.game.margin, total: w.game.total, histograms: w.game.histograms ?? null,
    teams: { away: w.game.away, home: w.game.home },
    sampledWorlds: w.sampledWorlds, quarterbacks: w.quarterbacks ?? null,
    availability: w.availability, unsupported: w.unsupported, limitations: w.limitations,
    diagnostics: { teamWorldsChecked: w.diagnostics.teamWorldsChecked, invariantViolations: w.diagnostics.invariantViolations },
  };
}

/**
 * The view of one game.
 * @param {{forecast: object, world?: object|null, board?: object|null, official?: object|null, officialRefusal?: string|null}} docs
 *   `official` is the sealed official forecast snapshot for this event (nflOfficialSnapshot); without it no player
 *   number is official, and every family reads "No official projection".
 */
export function gameView({ forecast: f, world = null, board = null, official = null, officialRefusal = null }) {
  const s = f.forecastSummary;
  const home = f.home.abbr; const away = f.away.abbr;
  const favourite = s.winProbability.home >= s.winProbability.away ? home : away;
  const usableWorld = world && world.identity?.providerEventId === f.providerEventId ? world : null;
  const usableOfficial = official && String(official.eventId) === String(f.providerEventId) ? official : null;
  const players = playerRows({ forecast: f, official: usableOfficial, board });
  return {
    version: NFL_FORECAST_VIEW_VERSION,
    providerEventId: f.providerEventId, matchup: f.matchup, kickoffUtc: f.kickoffUtc, venue: f.venue ?? null,
    away: f.away, home: f.home, week: f.week, seasonType: f.seasonType,
    record: {
      source: SOURCES.record, modelId: f.model?.id ?? SOURCES.record.modelId, generatedAt: f.generatedAt, inputHash: f.model?.inputHash ?? null,
      favourite, winProbability: { home: s.winProbability.home, away: s.winProbability.away, tieAfterRegulation: s.winProbability.tieMass ?? null },
      projectedScore: s.projectedScore, margin: s.margin, total: s.total, scoreRange: s.scoreRange ?? null,
      teamInputs: f.teamInputs ?? null,
    },
    official: usableOfficial
      ? { snapshotId: usableOfficial.snapshotId, modelVersions: usableOfficial.modelVersions.players, boardGeneratedAt: usableOfficial.sources?.find((x) => x.role === "OFFICIAL" && /player-board/.test(x.modelVersion ?? ""))?.generatedAt ?? null, refusal: null }
      : { snapshotId: null, modelVersions: {}, boardGeneratedAt: null, refusal: officialRefusal ?? (official ? "EVENT_MISMATCH" : "NO_OFFICIAL_SNAPSHOT") },
    /* World Model V2 — SUPPORTING SIMULATION only (labelled; never a player row, a board or a headline). */
    simulation: usableWorld ? supportingSimulation(f, usableWorld) : null,
    players,
    unprojected: unprojectedByFamily(usableWorld, players),
  };
}

/**
 * One row per player the official snapshot projects, every family from the official player board — never mixed with
 * another source inside a row. Players are keyed by owner id (`nfl-athlete-<espnId>`); the board row supplies only
 * presentation (position) and the captured market, joined by that same id — never by name. A family the board marks
 * WITHHELD (or does not carry) is absent: the surface says "No official projection" instead.
 */
export function playerRows({ forecast: f, official, board }) {
  const opp = (team) => (team === f.home.abbr ? f.away.abbr : f.home.abbr);
  const boardRow = new Map((board?.players ?? []).filter((p) => p?.playerId).map((p) => [String(p.playerId), p]));
  const asOf = official?.sources?.find((x) => x.role === "OFFICIAL" && /player-board/.test(x.modelVersion ?? ""))?.generatedAt ?? board?.generatedAt ?? null;
  const atdPublished = board?.families?.anytime_td?.state === "PUBLISHED";
  const rows = [];
  for (const p of official?.players ?? []) {
    const b = boardRow.get(p.playerId) ?? null;
    const families = {};
    for (const [fam, mk] of Object.entries(MARKET_KEY)) {
      const o = p.families?.[mk];
      if (!o) continue;
      if (fam === "anytimeTd") {
        if (!atdPublished || o.state !== "PUBLISHED" || !isNum(o.expected)) continue;
        families.anytimeTd = { source: "opportunityTd", value: o.expected, familyState: o.state, modelVersion: o.modelVersion ?? null, snapshotId: official.snapshotId, asOf };
        continue;
      }
      if (!(o.state === "PUBLISHED" || o.state === "ESTIMATE")) continue;
      /* headline: the median for yards (skewed); the expected count for receptions (a whole-number median ties) */
      const value = fam === "receptions" ? o.expected : o.median;
      if (!isNum(value)) continue;
      families[fam] = { source: "playerBoard", value, mean: o.expected ?? null, median: o.median ?? null, p10: quantile(o, 0.1), p90: quantile(o, 0.9), familyState: o.state, modelVersion: o.modelVersion ?? null, snapshotId: official.snapshotId, asOf };
    }
    if (!Object.keys(families).length) continue;
    for (const [fam, e] of Object.entries(families)) { e.marketKey = MARKET_KEY[fam]; e.market = capturedMarket(board, p.playerId, fam); }
    const team = p.team ?? b?.team ?? null;
    const availability = [{ source: "playerBoard", state: p.participation ?? b?.participation ?? null }];
    rows.push({
      playerId: p.playerId, name: b?.name ?? p.displayName, position: b?.position ?? null, team, opponent: opp(team),
      providerEventId: f.providerEventId, matchup: f.matchup, kickoffUtc: f.kickoffUtc,
      availability, families, cleared: availability.every((a) => CLEARED.includes(a.state)), availabilityLabel: availabilityLabel(availability),
    });
  }
  return rows;
}

function availabilityLabel(list) {
  const states = list.map((a) => a.state);
  if (states.some((s) => s === "OUT" || s === "INACTIVE")) return "Out";
  if (states.includes("DOUBTFUL")) return "Doubtful";
  if (states.includes("QUESTIONABLE")) return "Questionable";
  return null;
}

/**
 * Players the supporting simulation carries for a family that the official board does not project (by id). They are
 * listed as "No official projection" — their simulated number is never shown in the official list.
 */
const RULED_OUT = new Set(["OUT", "INACTIVE"]);
function unprojectedByFamily(world, rows) {
  const out = {};
  if (!world) return out;
  const has = new Map(rows.map((r) => [r.playerId, r.families]));
  for (const [fam, wk] of Object.entries(WM_FAMILY)) {
    const list = (world.players ?? [])
      .filter((p) => p?.playerId && p.families?.[wk] && !has.get(p.playerId)?.[fam] && !RULED_OUT.has(p.availability))
      .map((p) => ({ playerId: p.playerId, name: p.name, team: p.team }))
      .sort((a, b) => String(a.team ?? "").localeCompare(String(b.team ?? "")) || String(a.name ?? "").localeCompare(String(b.name ?? "")));
    if (list.length) out[fam] = list;
  }
  return out;
}

/**
 * Top boards across games, from the SAME official rows the game pages render. Ranking metric per family: the official
 * projected value shown (median yards; expected receptions; the probability for anytime TD), ties by the official
 * expected value, then name. Only cleared players, only games that have not kicked off at `now`; fewer than `size`
 * rather than fill. No supporting-simulation number ever ranks.
 */
export function topBoards(views, { now, size = 10 }) {
  const live = views.filter((v) => Date.parse(v.kickoffUtc) > Date.parse(now));
  const out = {};
  for (const fam of PLAYER_FAMILIES) {
    if (!fam.source) { out[fam.key] = { family: fam, rows: [], withheld: fam.withheld }; continue; }
    const rows = [];
    for (const v of live) for (const p of v.players) {
      const d = p.families[fam.key];
      if (!d || !p.cleared || d.source !== fam.source) continue;
      rows.push({ ...p, entry: d });
    }
    rows.sort((a, b) => b.entry.value - a.entry.value || (b.entry.mean ?? 0) - (a.entry.mean ?? 0) || a.name.localeCompare(b.name));
    out[fam.key] = { family: fam, rows: rows.slice(0, size).map((r, i) => ({ rank: i + 1, ...r })), withheld: null };
  }
  return { boards: out, games: live.length };
}

/** What each family's headline number is — printed under every list so a reader never has to guess. */
export const FAMILY_METRIC = Object.freeze({
  passingYards: "Projected = the official player board's median passing yards; 80% of outcomes fall in the range shown",
  rushingYards: "Projected = the official player board's median rushing yards; 80% of outcomes fall in the range shown",
  receivingYards: "Projected = the official player board's median receiving yards; 80% of outcomes fall in the range shown",
  receptions: "Projected = the official player board's expected receptions (its average); 80% of outcomes fall in the range shown",
  anytimeTd: "Chance to score at least one rushing or receiving touchdown if he plays — from the published touchdown model on the official player board",
});

/** The family-level estimate statement (the board's ESTIMATE state, said once per list rather than on every row). */
export const ESTIMATE_NOTE = Object.freeze({
  all: "Estimate · the official player board has not cleared this statistic for publication, so these numbers are its estimates.",
  some: "Includes estimates · in some games the official player board has not cleared this statistic for publication.",
});

const estimateOf = (entries) => {
  const est = entries.filter((e) => e?.familyState === "ESTIMATE").length;
  return !est ? null : est === entries.length ? "all" : "some";
};

/**
 * Tab descriptors + rows for the shared FamilyTabs component. `lists` maps family → rows already ordered; the client
 * renders them verbatim. Game page: every player with the family (availability flagged). Boards: `topBoards` rows.
 */
export function familyTabs(rowsByFamily, { asOfByFamily = {}, sourcesByFamily = {}, estimateByFamily = {}, unprojected = {} } = {}) {
  const families = PLAYER_FAMILIES.map((f) => ({
    key: f.key, title: f.title, kind: f.kind, unit: f.unit, withheld: f.source ? null : f.withheld,
    metric: FAMILY_METRIC[f.key] ?? "",
    sourceLabel: f.source ? (sourcesByFamily[f.key]?.length ? sourcesByFamily[f.key] : [f.source]).map((k) => SOURCES[k].label).join(" + ") : null,
    asOf: asOfByFamily[f.key] ?? null,
    estimate: estimateByFamily[f.key] ? ESTIMATE_NOTE[estimateByFamily[f.key]] : null,
  }));
  return { families, lists: rowsByFamily, unprojected };
}

const slim = (p) => ({ playerId: p.playerId, name: p.name, position: p.position, team: p.team, opponent: p.opponent, providerEventId: p.providerEventId, matchup: p.matchup, kickoffUtc: p.kickoffUtc, availabilityLabel: p.availabilityLabel });
const slimEntry = (e) => ({ value: e.value, p10: e.p10 ?? null, p90: e.p90 ?? null, mean: e.mean ?? null, marketKey: e.marketKey ?? null, market: e.market ?? null });

export function gameTabs(view) {
  const lists = {}; const asOf = {}; const src = {}; const est = {};
  for (const f of PLAYER_FAMILIES) {
    if (!f.source) continue;
    const rows = view.players.filter((p) => p.families[f.key]).sort((a, b) => b.families[f.key].value - a.families[f.key].value || a.name.localeCompare(b.name));
    lists[f.key] = rows.map((p) => ({ player: slim(p), entry: slimEntry(p.families[f.key]) }));
    asOf[f.key] = rows[0]?.families[f.key].asOf ?? null;
    src[f.key] = [...new Set(rows.map((p) => p.families[f.key].source))].sort();
    est[f.key] = estimateOf(rows.map((p) => p.families[f.key]));
  }
  return familyTabs(lists, { asOfByFamily: asOf, sourcesByFamily: src, estimateByFamily: est, unprojected: view.unprojected ?? {} });
}

export function boardTabs(boards) {
  const lists = {}; const asOf = {}; const src = {}; const est = {};
  for (const [k, b] of Object.entries(boards)) {
    lists[k] = b.rows.map((r) => ({ rank: r.rank, player: slim(r), entry: slimEntry(r.entry) }));
    asOf[k] = b.rows.map((r) => r.entry.asOf).filter(Boolean).sort().at(-1) ?? null;
    src[k] = [...new Set(b.rows.map((r) => r.entry.source))].sort();
    est[k] = estimateOf(b.rows.map((r) => r.entry));
  }
  return familyTabs(lists, { asOfByFamily: asOf, sourcesByFamily: src, estimateByFamily: est });
}
