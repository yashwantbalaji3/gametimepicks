/**
 * SOCIAL / GRAPHICS EXPORT CONTRACT — `gtp-graphics-export@1` (Track E, 2026-10-29, for the 2026-10-30 content day).
 *
 * One row per publishable number, for an external formatter (the AI Command Center) that ONLY formats and publishes
 * eligible rows. It never computes: every value here is copied from the canonical accessors the website itself renders,
 * and the builder REFUSES (throws) when the website value and the official snapshot value disagree, so a consumer can
 * never receive a second forecast.
 *
 *   NFL  rows of the five weekly Top 5 boards, ranked by THE ranking owner (lib/sports/nfl/top-boards.mjs buildTopBoards
 *        — the same function, inputs and rule the weekly-boards artifact and /nfl render), restricted to games that have
 *        not kicked off at --as-of. Each row's value is checked against the game page's view row
 *        (forecast-view-load.mjs loadForecastViews — the view reads the official snapshot, nflOfficialSnapshot) and
 *        against the raw per-game player board.
 *   NBA  the official lane for one date (app/public/data/nba/experimental-public/<date>.json — the file /nba and
 *        /nba/projections render), read through the existing social accessor (nba-social.mjs buildNbaSocialDay, which uses
 *        the ONE Elo accessor eloWinProbabilityOf), each value checked against the official snapshot (nbaOfficialSnapshot,
 *        display rule: median to 1 dp).
 *
 * MODEL STATUS (per row):
 *   OFFICIAL           an official forecast value the website publishes as such.
 *   OFFICIAL_ESTIMATE  shown on the website, labelled an estimate (NFL ESTIMATE families; the NBA Elo-derived game-winner
 *                      estimate, accuracy not established). NFL: graphic-eligible ONLY with its `model.label` (founder P0
 *                      2026-10-30; the written NFL policy — family-publication.mjs ESTIMATE DISPLAY POLICY — permits public
 *                      display "with the failed bar(s) and a plain-English caveat … never as bare picks"), and never with a
 *                      line, price or direction. NBA Elo estimate: never graphic-eligible (no label is issued for it).
 *   EXPERIMENTAL       an experimental / supporting / simulated number. Never carries a value here, never graphic-eligible.
 *   UNAVAILABLE        no official value (withheld, absent, refused). Never carries a value, never graphic-eligible.
 *
 * GRAPHIC ELIGIBILITY: eligible ⇔ (status OFFICIAL, or OFFICIAL_ESTIMATE carrying its label) ∧ a value ∧ an official
 * snapshot id ∧ the canonical checks passed ∧ the game has not started at --as-of. Anything else lists its reasons.
 *
 * SPORTSBOOK FIELDS (line, price, direction) exist in the schema and are gated by lib/odds/display-authorization.mjs
 * (surface "social"). Committed state 2026-10-29: social NOT authorized for NBA or NFL → every row carries them WITHHELD
 * with reason NOT_AUTHORIZED_FOR_SOCIAL and no number. Even if the social surface is later authorized, contract @1 never
 * carries a line or price (reason NOT_CARRIED_IN_CONTRACT_V1 — a reviewed @2 must add them), and a direction is never
 * emitted for a family that is not direction-qualified (DIRECTION_NOT_QUALIFIED) or has no direction (NOT_APPLICABLE:
 * anytime touchdown, game winner).
 *
 * DETERMINISM: pure — documents in, document out; no fs, no clock. `asOf` is an input (the CLI requires --as-of). Same
 * inputs + same asOf → byte-identical output (serializeGraphicsExport).
 */
import { buildTopBoards, TOP_BOARDS_CONTRACT, TOP_BOARD_SOURCE } from "../sports/nfl/top-boards.mjs";
import { PLAYER_FAMILIES as NFL_VIEW_FAMILIES, MARKET_KEY as NFL_MARKET_KEY, formatValue as nflFormatValue } from "../sports/nfl/forecast-view.mjs";
import { estimateLabel as nflEstimateLabel } from "../sports/nfl/family-publication.mjs";
import { DISPLAY_AUTHORIZATION, DISPLAY_AUTHORIZATION_RULE, displayAuthorization, directionAuthorization } from "../odds/display-authorization.mjs";
import { NBA_LINE_DISPLAY } from "../sports/nba/line-board.mjs";
import { buildNbaSocialDay, PLAYER_FAMILIES as NBA_FAMILIES } from "./nba-social.mjs";

export const GRAPHICS_EXPORT_SCHEMA = "gtp-graphics-export@1";

export const MODEL_STATUS = Object.freeze({
  OFFICIAL: "OFFICIAL",
  OFFICIAL_ESTIMATE: "OFFICIAL_ESTIMATE",
  EXPERIMENTAL: "EXPERIMENTAL",
  UNAVAILABLE: "UNAVAILABLE",
});
export const MODEL_STATUSES = Object.freeze(Object.values(MODEL_STATUS));

/** Why a sportsbook field carries no number. */
export const WITHHELD_REASON = Object.freeze({
  NOT_AUTHORIZED_FOR_SOCIAL: "NOT_AUTHORIZED_FOR_SOCIAL",
  NOT_CARRIED_IN_CONTRACT_V1: "NOT_CARRIED_IN_CONTRACT_V1",
  DIRECTION_NOT_QUALIFIED: "DIRECTION_NOT_QUALIFIED",
  NOT_APPLICABLE: "NOT_APPLICABLE",
});

/** The NFL families of the five boards. Anytime touchdown is a yes/no market: no line direction exists. */
export const NFL_MARKET_TYPE = Object.freeze({
  anytime_td: "YES_NO", player_receptions: "OVER_UNDER", player_reception_yds: "OVER_UNDER", player_pass_yds: "OVER_UNDER", player_rush_yds: "OVER_UNDER",
});
/** Board family key → the direction-qualification key in the authorization record. */
const NFL_DIRECTION_KEY = Object.freeze({ player_receptions: "receptions", player_reception_yds: "reception_yds", player_pass_yds: "pass_yds", player_rush_yds: "rush_yds" });

export const USAGE_RULES = Object.freeze([
  "Publish only rows whose graphicEligibility.eligible is true; print model.display exactly (the website's digits).",
  "Never compute, round differently, combine or compare values; never mix rows from different exports (check snapshot.id and edition).",
  "An eligible OFFICIAL_ESTIMATE row must be printed with its model.label beside the value (e.g. \"Estimate · calibration standard not yet met\"), never as a pick, a lean, an over/under or a comparison to any line.",
  "EXPERIMENTAL and UNAVAILABLE rows (and any OFFICIAL_ESTIMATE row without a label) are context for operators only and are never graphics.",
  "line, price and direction are WITHHELD: do not state, estimate or source any sportsbook line, price, side or edge.",
  "A row whose game has started at the time of posting must not be posted as a pregame forecast; re-export with a later --as-of.",
  "Values are model projections (medians / probabilities), not picks, locks or bets; no accuracy claims.",
]);

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
/** Kickoff/tip instants are stored as "YYYY-MM-DDTHH:MMZ"; normalise before parsing. */
export const instantMs = (iso) => Date.parse(String(iso ?? "").replace(/T(\d\d):(\d\d)Z$/, "T$1:$2:00Z"));

/**
 * The verdict of the authorization record for the social surfaces of one sport (no numbers, only switches + reasons).
 * @param {"nba"|"nfl"} sport
 */
export function socialAuthorization(sport, record = DISPLAY_AUTHORIZATION) {
  const social = displayAuthorization(sport, "social", record);
  const prices = displayAuthorization(sport, "socialPrices", record);
  return {
    rule: DISPLAY_AUTHORIZATION_RULE,
    social: { authorized: social.ok, reasons: social.reasons },
    socialPrices: { authorized: prices.ok, reasons: prices.reasons },
  };
}

/**
 * The gated sportsbook fields of one row. Contract @1 NEVER carries a number here (see the header).
 * @param {{ sport: "nba"|"nfl", directionKey: string|null, marketType: "OVER_UNDER"|"YES_NO"|"GAME_WINNER"|"NONE", record?: object }} o
 */
export function marketFields({ sport, directionKey, marketType, record = DISPLAY_AUTHORIZATION }) {
  const social = displayAuthorization(sport, "social", record).ok;
  const priceOk = displayAuthorization(sport, "socialPrices", record).ok;
  const qualified = marketType === "OVER_UNDER" && directionKey != null && directionAuthorization(sport, directionKey, "social", record).ok;
  const hasLine = marketType === "OVER_UNDER";
  const withheld = (reason) => ({ state: "WITHHELD", reason });
  const lineReason = social ? WITHHELD_REASON.NOT_CARRIED_IN_CONTRACT_V1 : WITHHELD_REASON.NOT_AUTHORIZED_FOR_SOCIAL;
  return {
    marketEligibility: {
      marketType,
      socialLines: social ? "AUTHORIZED_NOT_CARRIED_V1" : WITHHELD_REASON.NOT_AUTHORIZED_FOR_SOCIAL,
      socialPrices: priceOk ? "AUTHORIZED_NOT_CARRIED_V1" : WITHHELD_REASON.NOT_AUTHORIZED_FOR_SOCIAL,
      directionQualified: qualified,
    },
    market: {
      line: hasLine ? withheld(lineReason) : { state: "NOT_APPLICABLE", reason: WITHHELD_REASON.NOT_APPLICABLE },
      price: withheld(priceOk ? WITHHELD_REASON.NOT_CARRIED_IN_CONTRACT_V1 : WITHHELD_REASON.NOT_AUTHORIZED_FOR_SOCIAL),
      direction: !hasLine
        ? { state: "NOT_APPLICABLE", reason: WITHHELD_REASON.NOT_APPLICABLE }
        : !social ? withheld(WITHHELD_REASON.NOT_AUTHORIZED_FOR_SOCIAL)
        : !qualified ? withheld(WITHHELD_REASON.DIRECTION_NOT_QUALIFIED)
        : withheld(WITHHELD_REASON.NOT_CARRIED_IN_CONTRACT_V1),
    },
  };
}

function eligibility({ status, value, snapshotId, extra = [], label = null }) {
  const reasons = [];
  const labelledEstimate = status === MODEL_STATUS.OFFICIAL_ESTIMATE && typeof label === "string" && label.length > 0;
  if (status !== MODEL_STATUS.OFFICIAL && !labelledEstimate) reasons.push(`MODEL_STATUS_${status}`);
  if (value == null) reasons.push("NO_VALUE");
  if (!snapshotId) reasons.push("NO_OFFICIAL_SNAPSHOT");
  reasons.push(...extra);
  return { eligible: reasons.length === 0, reasons };
}

class ExportRefusal extends Error {
  constructor(msg) { super(`REFUSED (${GRAPHICS_EXPORT_SCHEMA}): ${msg}`); this.name = "GraphicsExportRefusal"; }
}
export { ExportRefusal };

/* ─────────────────────────────────────────────── NFL ─────────────────────────────────────────────── */

/** Board family state → model status. */
export function nflModelStatus(boardState) {
  if (boardState === "PUBLISHED") return MODEL_STATUS.OFFICIAL;
  if (boardState === "ESTIMATE") return MODEL_STATUS.OFFICIAL_ESTIMATE;
  return MODEL_STATUS.UNAVAILABLE;
}

const NFL_VIEW_KEY = Object.freeze(Object.fromEntries(Object.entries(NFL_MARKET_KEY).map(([view, market]) => [market, view])));
const NFL_KIND = Object.freeze(Object.fromEntries(NFL_VIEW_FAMILIES.map((f) => [f.key, f.kind])));
/** The website's own kind for a board family (prediction-presentation/nfl.ts presentTopBoard). */
const nflKind = (family) => (family === "anytime_td" ? "probability" : family === "player_receptions" ? "count" : "yards");
const whole = (v) => (isNum(v) ? Math.round(v) : null);

/**
 * @param {{ seasonType: number, week: number, asOf: string,
 *           boards: Array<any>,          raw per-game player boards (app/public/data/nfl/player-board/<id>.json) of the period
 *           views: Array<any>,           the game-page views (forecast-view-load.mjs loadForecastViews)
 *           boardSha256?: Record<string,string>,  eventId → sha256 of the committed board bytes
 *           forwardFor?: Function,       family-gate.mjs forwardEvidenceFor (readiness wording only)
 *           authorizationRecord?: object, inputs?: Array<{ref: string, sha256: string|null}> }} o
 */
export function buildNflGraphicsExport({ seasonType, week, asOf, boards, views, boardSha256 = {}, forwardFor = () => null, authorizationRecord = DISPLAY_AUTHORIZATION, inputs = [] }) {
  const t = Date.parse(asOf ?? "");
  if (!Number.isFinite(t)) throw new ExportRefusal("asOf (ISO instant) is required");
  if (!Number.isInteger(seasonType) || !Number.isInteger(week)) throw new ExportRefusal("seasonType and week are required integers");
  const period = (boards ?? []).filter((b) => b?.seasonType === seasonType && b?.week === week);
  if (period.length !== (boards ?? []).length) throw new ExportRefusal("boards outside the requested period were passed in");
  const ordered = [...period].sort((a, b) => instantMs(a.kickoffUtc) - instantMs(b.kickoffUtc) || String(a.providerEventId).localeCompare(String(b.providerEventId)));
  const upcoming = ordered.filter((b) => instantMs(b.kickoffUtc) > t);
  const started = ordered.filter((b) => !(instantMs(b.kickoffUtc) > t));
  const viewOf = new Map((views ?? []).map((v) => [String(v.providerEventId), v]));
  const auth = socialAuthorization("nfl", authorizationRecord);
  const editionKey = `${seasonType}-${String(week).padStart(2, "0")}`;

  // THE ranking owner, over the whole period at asOf: its weekly scope is exactly the games still to kick off. Prices
  // never enter (slotFor returns nothing), so no row can carry one.
  const top = upcoming.length ? buildTopBoards({ weekBoards: ordered, now: asOf, slotFor: () => ({}), forwardFor }) : null;
  if (top) {
    const scoped = new Set(top.weekly.scope.events);
    if (scoped.size !== upcoming.length || upcoming.some((b) => !scoped.has(String(b.providerEventId)))) {
      throw new ExportRefusal("the ranking owner's weekly scope is not exactly the games still to kick off");
    }
  }

  const rows = [];
  const boardsOut = (top?.weekly.boards ?? []).map((b) => {
    const boardState = b.state === "PUBLISHED" || b.state === "ESTIMATE" ? b.state : b.readiness?.boardState ?? null;
    const status = b.state === "PUBLISHED" ? MODEL_STATUS.OFFICIAL : b.state === "ESTIMATE" ? MODEL_STATUS.OFFICIAL_ESTIMATE : nflModelStatus(boardState === "PUBLISHED" || boardState === "ESTIMATE" ? null : boardState);
    /* The ONE estimate label (family-publication.mjs estimateLabel) — the ranking owner's, re-derived to prove they agree. */
    const label = b.state === "ESTIMATE" ? (b.estimate?.label ?? null) : null;
    if (b.state === "ESTIMATE" && label !== nflEstimateLabel(b.estimate?.reason)) throw new ExportRefusal(`${b.id}: estimate label ${JSON.stringify(label)} is not the policy label`);
    const kind = nflKind(b.family);
    const rowIds = [];
    for (const r of b.rows ?? []) {
      const eventId = String(r.providerEventId);
      const raw = ordered.find((x) => String(x.providerEventId) === eventId);
      const rawValue = raw?.players?.find((p) => p.playerId === r.playerId)?.markets?.[b.family]?.[b.method];
      if (rawValue !== r.value) throw new ExportRefusal(`${b.id} ${r.playerId}: ranked value ${r.value} is not the player board's ${b.method} ${rawValue}`);
      const view = viewOf.get(eventId);
      const vp = view?.players?.find((p) => p.playerId === r.playerId) ?? null;
      const vf = vp?.families?.[NFL_VIEW_KEY[b.family]] ?? null;
      const snapshotId = view?.official?.snapshotId ?? null;
      const extra = [];
      if (!view) extra.push("NO_GAME_PAGE_VIEW");
      else if (!vf) extra.push("NOT_ON_GAME_PAGE");
      else {
        if (vf.value !== r.value) throw new ExportRefusal(`${b.id} ${r.playerId}: top-board value ${r.value} ≠ game page value ${vf.value}`);
        if ((vf.familyState === "ESTIMATE") !== (b.state === "ESTIMATE")) throw new ExportRefusal(`${b.id} ${r.playerId}: the game page shows ${vf.familyState}, the top board ${b.state}`);
        if (label && vf.estimateLabel !== label) throw new ExportRefusal(`${b.id} ${r.playerId}: game page label ${JSON.stringify(vf.estimateLabel)} ≠ top board label ${JSON.stringify(label)}`);
        if (vf.snapshotId !== snapshotId) throw new ExportRefusal(`${b.id} ${r.playerId}: game page row is from snapshot ${vf.snapshotId}, not ${snapshotId}`);
        if (NFL_KIND[NFL_VIEW_KEY[b.family]] !== kind) throw new ExportRefusal(`${b.family}: display kind differs between the game page and the top board`);
      }
      if (!(instantMs(r.kickoffUtc) > t)) extra.push("GAME_STARTED");
      const rowId = `nfl:${editionKey}:${eventId}:${r.playerId}:${b.family}`;
      rowIds.push(rowId);
      const value = status === MODEL_STATUS.OFFICIAL || (status === MODEL_STATUS.OFFICIAL_ESTIMATE && label) ? r.value : null;
      /* an estimate is never direction-qualified, whatever the authorization record says */
      const directionKey = status === MODEL_STATUS.OFFICIAL_ESTIMATE ? null : NFL_DIRECTION_KEY[b.family] ?? null;
      rows.push({
        rowId,
        kind: "PLAYER_PROP",
        board: { id: b.id, title: b.title, rank: r.rank },
        identity: {
          sport: "nfl", seasonType, week, eventId, matchup: raw.matchup ?? view?.matchup ?? null, kickoffUtc: r.kickoffUtc, etDate: r.etDate,
          playerId: r.playerId, playerName: r.name, team: r.team, opponent: r.opponent, market: b.family, marketLabel: b.label, metric: b.method,
        },
        officialForecast: {
          id: "nfl-official-player-board",
          modelVersion: vf?.modelVersion ?? view?.official?.modelVersions?.[b.family] ?? null,
          gameRecordModel: view?.record?.modelId ?? null,
          rankingContract: TOP_BOARDS_CONTRACT,
        },
        snapshot: {
          id: snapshotId,
          boardGeneratedAt: view?.official?.boardGeneratedAt ?? raw.generatedAt ?? null,
          recordGeneratedAt: view?.record?.generatedAt ?? null,
          lockAt: r.kickoffUtc,
        },
        model: {
          status,
          value,
          kind,
          display: value == null ? null : nflFormatValue(kind, value),
          ...(label ? { label, caveat: b.estimate?.caveat ?? null } : {}),
          ...(b.method === "probability" ? {} : { p10: value == null ? null : r.p10, p90: value == null ? null : r.p90, rangeDisplay: value == null || !isNum(r.p10) || !isNum(r.p90) ? null : `${whole(r.p10)}–${whole(r.p90)}` }),
          participation: r.participation,
        },
        checks: { gamePageValue: vf ? "EQUAL" : "NOT_FOUND", playerBoardValue: "EQUAL", officialSnapshot: snapshotId ? "GAME_PAGE_READS_SNAPSHOT" : "NO_SNAPSHOT" },
        ...marketFields({ sport: "nfl", directionKey, marketType: NFL_MARKET_TYPE[b.family], record: authorizationRecord }),
        graphicEligibility: eligibility({ status, value, snapshotId, extra, label }),
        provenance: {
          playerBoard: `app/public/data/nfl/player-board/${eventId}.json`,
          playerBoardSha256: boardSha256[eventId] ?? null,
          ranking: `lib/sports/nfl/top-boards.mjs buildTopBoards (${TOP_BOARD_SOURCE})`,
          gamePage: `/nfl/game/${eventId}/ (forecast-view-load.mjs loadForecastViews)`,
        },
      });
    }
    return {
      id: b.id, title: b.title, market: b.family, label: b.label, metric: b.method,
      modelStatus: status,
      ...(label ? { label } : {}),
      graphicEligible: (status === MODEL_STATUS.OFFICIAL || (status === MODEL_STATUS.OFFICIAL_ESTIMATE && Boolean(label))) && rowIds.length > 0,
      readiness: b.state === "PUBLISHED" || b.state === "ESTIMATE" ? null : { code: b.readiness?.code ?? null, text: b.readiness?.text ?? null },
      availabilityExcluded: b.availabilityExcluded ?? 0,
      rowIds,
    };
  });

  return {
    schemaVersion: GRAPHICS_EXPORT_SCHEMA,
    sport: "nfl",
    edition: { kind: "NFL_WEEK_TOP5", key: editionKey, seasonType, week },
    asOf,
    publication: { status: !ordered.length ? "NO_GAMES_IN_PERIOD" : !upcoming.length ? "NO_UPCOMING_GAMES" : "PUBLISHED" },
    scope: {
      rule: "Games that have not kicked off at asOf (kickoff strictly after asOf); a started game never contributes a row.",
      eventsInPeriod: ordered.length,
      eventsIncluded: upcoming.map((b) => ({ eventId: String(b.providerEventId), matchup: b.matchup ?? null, kickoffUtc: b.kickoffUtc })),
      eventsExcludedStarted: started.map((b) => ({ eventId: String(b.providerEventId), matchup: b.matchup ?? null, kickoffUtc: b.kickoffUtc })),
    },
    authorization: auth,
    contract: contractBlock(),
    boards: boardsOut,
    rows,
    inputs: sortInputs(inputs),
    usageRules: USAGE_RULES,
  };
}

/* ─────────────────────────────────────────────── NBA ─────────────────────────────────────────────── */

const r1 = (x) => (isNum(x) ? Math.round(x * 10) / 10 : null);

/**
 * @param {{ date: string, asOf: string, lane: any|null,
 *           snapshots: Map<string, { snapshot: any|null, refusal: string|null }>,  eventId → nbaOfficialSnapshot result
 *           laneSha256?: string|null, authorizationRecord?: object, eloEnabled?: boolean,
 *           inputs?: Array<{ref: string, sha256: string|null}> }} o
 */
export function buildNbaGraphicsExport({ date, asOf, lane, snapshots = new Map(), laneSha256 = null, authorizationRecord = DISPLAY_AUTHORIZATION, eloEnabled, inputs = [] }) {
  const t = Date.parse(asOf ?? "");
  if (!Number.isFinite(t)) throw new ExportRefusal("asOf (ISO instant) is required");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date ?? ""))) throw new ExportRefusal("date (YYYY-MM-DD) is required");
  if (lane && lane.date !== date) throw new ExportRefusal(`lane is for ${lane.date}, not ${date}`);
  const auth = socialAuthorization("nba", authorizationRecord);
  // The existing social accessor (same lane fields, the ONE Elo accessor). Its line block is ignored: this contract
  // gates sportsbook fields itself, from the same authorization record.
  const day = lane ? buildNbaSocialDay({ lane, buildEtDate: date, latestDate: date, laneSha256, eloEnabled, lineDisplay: { ...NBA_LINE_DISPLAY, social: false } }) : null;
  const events = day?.events ?? [];
  const upcoming = events.filter((e) => instantMs(e.tipUtc) > t);
  const started = events.filter((e) => !(instantMs(e.tipUtc) > t));
  const laneGame = new Map((lane?.games ?? []).map((g) => [String(g.providerEventId), g]));
  const rows = [];
  const eventsOut = [];

  for (const e of upcoming) {
    const g = laneGame.get(e.eventId);
    const { snapshot = null, refusal = null } = snapshots.get(e.eventId) ?? { refusal: "NOT_BUILT" };
    const snapshotId = snapshot?.snapshotId ?? null;
    const snapExtra = snapshot ? [] : [`SNAPSHOT_REFUSED_${refusal ?? "UNKNOWN"}`];
    const identity = (extra) => ({ sport: "nba", date, eventId: e.eventId, matchup: `${e.away.abbr} @ ${e.home.abbr}`, tipUtc: e.tipUtc, away: e.away.abbr, home: e.home.abbr, ...extra });
    const snapBlock = { id: snapshotId, frozenAt: e.frozenAt, lockAt: e.tipUtc, receiptPayloadSha256: e.receipt.payloadSha256, laneSnapshotId: e.snapshotId };
    const official = (extra = {}) => ({ id: "nba-official-lane", lane: lane.lane ?? null, modelVersion: e.receipt.modelVersion, ...extra });
    const prov = { lane: `app/public/data/nba/experimental-public/${date}.json`, laneSha256, gamePage: `/nba/ (hub) and /nba/projections/${date}/` };
    const ids = [];
    const push = (row) => { rows.push(row); ids.push(row.rowId); };

    // Game: the official winner side (Elo, nba-winner-side@1).
    const favoured = e.official.sideState === "FAVOURED" ? e.official.favouredTeam : null;
    if (snapshot) {
      const snapSide = snapshot.game?.winner?.side === "HOME" ? snapshot.home?.abbr : snapshot.game?.winner?.side === "AWAY" ? snapshot.away?.abbr : null;
      if (snapSide !== favoured) throw new ExportRefusal(`${e.eventId}: lane favoured ${favoured} ≠ official snapshot side ${snapSide}`);
    }
    const sideStatus = favoured ? MODEL_STATUS.OFFICIAL : MODEL_STATUS.UNAVAILABLE;
    push({
      rowId: `nba:${date}:${e.eventId}:game:winner_side`, kind: "GAME_WINNER_SIDE",
      identity: identity({ market: "winner_side", marketLabel: "Favoured side (Elo)" }),
      officialForecast: official({ rule: g?.elo?.rule ?? null }),
      snapshot: snapBlock,
      model: { status: sideStatus, value: favoured, kind: "team", display: favoured, sideState: e.official.sideState },
      checks: { gamePageValue: "EQUAL", officialSnapshot: snapshot ? "EQUAL" : "NO_SNAPSHOT" },
      ...marketFields({ sport: "nba", directionKey: null, marketType: "GAME_WINNER", record: authorizationRecord }),
      graphicEligibility: eligibility({ status: sideStatus, value: favoured, snapshotId, extra: [...snapExtra, ...(favoured ? [] : ["TOO_CLOSE"])] }),
      provenance: prov,
    });

    // Game: the Elo-derived estimate — shown on the site, accuracy not established → OFFICIAL_ESTIMATE, never a graphic.
    const est = e.official.eloEstimate;
    if (est && snapshot && snapshot.game?.pHome !== est.home) throw new ExportRefusal(`${e.eventId}: lane Elo home ${est.home} ≠ official snapshot pHome ${snapshot.game?.pHome}`);
    const estStatus = est ? MODEL_STATUS.OFFICIAL_ESTIMATE : MODEL_STATUS.UNAVAILABLE;
    push({
      rowId: `nba:${date}:${e.eventId}:game:elo_win_estimate`, kind: "GAME_WIN_ESTIMATE",
      identity: identity({ market: "elo_win_estimate", marketLabel: est?.label ?? "Elo-derived game-winner estimate" }),
      officialForecast: official({ rule: g?.elo?.rule ?? null }),
      snapshot: snapBlock,
      model: { status: estStatus, value: est ? est.home : null, kind: "probability_home", display: est ? `${e.home.abbr} ${est.homePct}% · ${e.away.abbr} ${est.awayPct}%` : null, accuracyEstablished: false },
      checks: { gamePageValue: est ? "EQUAL" : "NOT_FOUND", officialSnapshot: est && snapshot ? "EQUAL" : "NO_SNAPSHOT" },
      ...marketFields({ sport: "nba", directionKey: null, marketType: "NONE", record: authorizationRecord }),
      graphicEligibility: eligibility({ status: estStatus, value: est ? est.home : null, snapshotId, extra: snapExtra }),
      provenance: prov,
    });

    // Game: team scores / margin / total — no official value.
    push({
      rowId: `nba:${date}:${e.eventId}:game:team_scores`, kind: "GAME_TEAM_SCORES",
      identity: identity({ market: "team_scores", marketLabel: "Team scores, margin and total" }),
      officialForecast: official(),
      snapshot: snapBlock,
      model: { status: MODEL_STATUS.UNAVAILABLE, value: null, kind: "score", display: null, reason: g?.teamScores?.reason ?? "WITHHELD" },
      checks: { gamePageValue: "WITHHELD", officialSnapshot: "WITHHELD" },
      ...marketFields({ sport: "nba", directionKey: null, marketType: "NONE", record: authorizationRecord }),
      graphicEligibility: eligibility({ status: MODEL_STATUS.UNAVAILABLE, value: null, snapshotId, extra: snapExtra }),
      provenance: prov,
    });

    // Players: the lane's published medians, each equal to the official snapshot's median at 1 dp.
    for (const p of e.players) {
      const sp = snapshot?.players?.find((x) => x.playerId === p.id) ?? null;
      for (const f of NBA_FAMILIES) {
        const value = p.medians[f.key];
        if (snapshot && value != null) {
          const o = sp?.families?.[f.key];
          if (!o || r1(o.median) !== value) throw new ExportRefusal(`${e.eventId} ${p.id} ${f.key}: lane median ${value} ≠ official snapshot ${o ? r1(o.median) : "absent"}`);
        }
        const status = value == null ? MODEL_STATUS.UNAVAILABLE : MODEL_STATUS.OFFICIAL;
        push({
          rowId: `nba:${date}:${e.eventId}:${p.id}:${f.key}`, kind: "PLAYER_PROP",
          identity: identity({ playerId: p.id, playerName: p.name, team: p.team, position: p.position, market: f.key, marketLabel: f.label, metric: "median", definition: f.definition }),
          officialForecast: official(),
          snapshot: snapBlock,
          model: { status, value, kind: "median", display: value == null ? null : String(value), expectedMinutes: p.expectedMinutes, injuryStatus: p.injuryStatus },
          checks: { gamePageValue: value == null ? "NOT_FOUND" : "EQUAL", officialSnapshot: snapshot && value != null ? "EQUAL_1DP" : "NO_SNAPSHOT" },
          ...marketFields({ sport: "nba", directionKey: f.key, marketType: "OVER_UNDER", record: authorizationRecord }),
          graphicEligibility: eligibility({ status, value, snapshotId, extra: snapExtra }),
          provenance: prov,
        });
      }
    }
    eventsOut.push({ eventId: e.eventId, matchup: `${e.away.abbr} @ ${e.home.abbr}`, tipUtc: e.tipUtc, snapshotId, snapshotRefusal: snapshot ? null : refusal ?? "NOT_BUILT", publication: snapshot?.publication ?? null, rowIds: ids });
  }

  return {
    schemaVersion: GRAPHICS_EXPORT_SCHEMA,
    sport: "nba",
    edition: { kind: "NBA_DAY", key: date, date },
    asOf,
    publication: { status: !lane ? "NOT_PUBLISHED" : !events.length ? "NO_GAMES" : !upcoming.length ? "NO_UPCOMING_GAMES" : "PUBLISHED", lane: lane?.lane ?? null, laneLabel: lane?.label ?? null, laneSha256 },
    scope: {
      rule: "Games that have not tipped off at asOf (tip strictly after asOf); a started game never contributes a row.",
      eventsInDay: events.length,
      eventsIncluded: upcoming.map((e) => ({ eventId: e.eventId, matchup: `${e.away.abbr} @ ${e.home.abbr}`, tipUtc: e.tipUtc })),
      eventsExcludedStarted: started.map((e) => ({ eventId: e.eventId, matchup: `${e.away.abbr} @ ${e.home.abbr}`, tipUtc: e.tipUtc })),
    },
    authorization: auth,
    contract: contractBlock(),
    events: eventsOut,
    rows,
    inputs: sortInputs(inputs),
    usageRules: USAGE_RULES,
  };
}

/* ─────────────────────────────────────────── shared ─────────────────────────────────────────── */

function contractBlock() {
  return {
    statuses: MODEL_STATUSES,
    graphicRule: "eligible only when model.status is OFFICIAL (or OFFICIAL_ESTIMATE carrying model.label, printed with it), a value exists, the official snapshot id is present, the canonical checks passed and the game has not started at asOf",
    sportsbookFields: "line, price and direction are WITHHELD in contract @1 (no numbers); reason NOT_AUTHORIZED_FOR_SOCIAL while the social surface is not authorized",
    determinism: "no wall-clock field; identical inputs and asOf give identical bytes",
  };
}

const sortInputs = (inputs) => [...(inputs ?? [])].map((i) => ({ ref: String(i.ref), sha256: i.sha256 ?? null })).sort((a, b) => a.ref.localeCompare(b.ref));

/** Stable bytes: two-space JSON + trailing newline (key order is the builder's, fixed). */
export const serializeGraphicsExport = (doc) => `${JSON.stringify(doc, null, 2)}\n`;

const BANNED = ["data/internal", "PRIVATE_RESEARCH", "apiKey", "api_key"];
const containsNumber = (v) => (isNum(v) ? true : Array.isArray(v) ? v.some(containsNumber) : v && typeof v === "object" ? Object.values(v).some(containsNumber) : false);
const PRICE_KEY = /^(price|odds|americanOdds|overPrice|underPrice|yesPrice|noPrice|book|sportsbook|line|difference|side|edge)$/;
function priceKeys(v, out = [], at = "") {
  if (Array.isArray(v)) v.forEach((x, i) => priceKeys(x, out, `${at}[${i}]`));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { if (PRICE_KEY.test(k) && x != null && typeof x !== "object") out.push(`${at}.${k}`); priceKeys(x, out, `${at}.${k}`); }
  return out;
}

/**
 * Every rule of the contract, checked on a finished document. [] when it holds. The CLI refuses to write otherwise.
 * @param {any} doc
 */
export function graphicsExportViolations(doc) {
  const v = [];
  if (doc?.schemaVersion !== GRAPHICS_EXPORT_SCHEMA) v.push(`schemaVersion is ${JSON.stringify(doc?.schemaVersion)}`);
  const asOf = Date.parse(doc?.asOf ?? "");
  if (!Number.isFinite(asOf)) v.push("asOf missing");
  const startedIds = new Set((doc?.scope?.eventsExcludedStarted ?? []).map((e) => e.eventId));
  const seen = new Set();
  for (const r of doc?.rows ?? []) {
    const id = r?.rowId ?? "?";
    if (seen.has(id)) v.push(`${id}: duplicate rowId`);
    seen.add(id);
    const st = r?.model?.status;
    if (!MODEL_STATUSES.includes(st)) v.push(`${id}: unknown model status ${st}`);
    if ((st === MODEL_STATUS.EXPERIMENTAL || st === MODEL_STATUS.UNAVAILABLE) && r.model.value != null) v.push(`${id}: ${st} row carries a value`);
    const ge = r?.graphicEligibility;
    if (st === MODEL_STATUS.OFFICIAL_ESTIMATE && r?.marketEligibility?.directionQualified === true) v.push(`${id}: an estimate is direction-qualified`);
    if (ge?.eligible === true) {
      const labelledEstimate = st === MODEL_STATUS.OFFICIAL_ESTIMATE && typeof r.model.label === "string" && r.model.label.length > 0;
      if (st !== MODEL_STATUS.OFFICIAL && !labelledEstimate) v.push(`${id}: graphic-eligible with status ${st}${st === MODEL_STATUS.OFFICIAL_ESTIMATE ? " and no label" : ""}`);
      if (r.model.value == null) v.push(`${id}: graphic-eligible without a value`);
      if (!r.snapshot?.id) v.push(`${id}: graphic-eligible without an official snapshot id`);
    }
    if (ge?.eligible !== (ge?.reasons?.length === 0)) v.push(`${id}: eligibility flag disagrees with its reasons`);
    for (const k of ["line", "price", "direction"]) {
      const f = r?.market?.[k];
      if (!f || !["WITHHELD", "NOT_APPLICABLE"].includes(f.state)) v.push(`${id}: market.${k} is not withheld`);
      if (containsNumber(f)) v.push(`${id}: market.${k} carries a number`);
      if (f && Object.keys(f).some((x) => !["state", "reason"].includes(x))) v.push(`${id}: market.${k} carries extra fields`);
    }
    if (r?.marketEligibility?.directionQualified !== true && r?.market?.direction?.reason === WITHHELD_REASON.NOT_CARRIED_IN_CONTRACT_V1) v.push(`${id}: direction treated as qualified`);
    const startAt = instantMs(r?.identity?.kickoffUtc ?? r?.identity?.tipUtc);
    if (!(startAt > asOf)) v.push(`${id}: game started at asOf`);
    if (startedIds.has(r?.identity?.eventId)) v.push(`${id}: row from an excluded started game`);
    const pk = priceKeys(r);
    if (pk.length) v.push(`${id}: sportsbook-like keys ${pk.join(", ")}`);
  }
  const raw = JSON.stringify(doc ?? null);
  for (const b of BANNED) if (raw.includes(b)) v.push(`banned string ${JSON.stringify(b)} in the export`);
  return v;
}
