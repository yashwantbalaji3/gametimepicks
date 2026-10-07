/**
 * NBA DAILY SHADOW TOP BOARDS (Stage 12-S2) — private, write-once, frozen before the day's first tip. PURE, no I/O.
 *
 * Each board is a Product Engine `top-board-receipt@0` (lib/products/top-board/top-board.mjs — used, not redefined),
 * built only from the CHAMPION's frozen pregame receipts (v0.1, founder N1, 2026-10-07):
 *
 *   - MEMBERSHIP: a game is on the day's boards only if its champion receipt existed at the freeze
 *     (generatedAt ≤ frozenAt) and it had not started (frozenAt < tip). Every other game of the day is listed in
 *     `notOnBoard` with its reason — never dropped silently, never added later.
 *   - POOL (`nba-board-pool@0`): players with a frozen distribution for the family, not ruled Out, expected minutes
 *     ≥ 20 (the preregistration §6 graded population). Excluded candidates are counted in `ineligibleCount`.
 *   - RANK: the family's frozen median (p50) descending, then mean, then athlete id. Deterministic, no clock.
 *   - TOP_10 and TOP_5 are SEPARATE receipts from the same ranked pool (a Top-5 record never reads ranks 6–10 of a
 *     Top-10 board, and vice versa). A board is a maximum, not a quota.
 *   - SHADOW: `selectorStatus: SHADOW`, `maturityAtFreeze: "OWNER:SHADOW"`. A Top Board is a ranked prediction
 *     display, never a product (founder Stage 4 Q9); nothing here can make one public or product-eligible.
 *
 * WHEN (boardFreezeDecision): at the first run, before the day's first non-overnight tip, at which either every
 * such game already has a champion receipt or the latest-owed instant has passed (last non-overnight tip − 8 h,
 * when every game is inside the forecast window). After the first non-overnight tip the day is MISSED: never
 * back-filled, never frozen partly late. Overnight (06–14Z) tips are their own scope and never hold a board up.
 */
import { forecastIdFor } from "../../forecast-ledger/identity.mjs";
import { FORECAST_KIND } from "../../forecast-ledger/contract.mjs";
import { TOP_BOARD_SCHEMA, BOARD_SIZE, METRIC_KIND, SELECTOR_STATUS, validateBoardReceipt } from "../../products/top-board/top-board.mjs";
import { isOvernightTip } from "./forecast-receipt.mjs";

export const NBA_BOARD_FILE_ARTIFACT = "nba-top-board-receipts";
export const NBA_BOARD_CHAMPION = "v0.1"; // N1
export const NBA_BOARD_POOL = Object.freeze({ id: "nba-board-pool@0", minExpectedMinutes: 20 });
export const NBA_BOARD_RANKING = Object.freeze({ id: "nba-board-ranking@0", tiebreak: "frozen p50 desc, then mean desc, then providerAthleteId asc" });
export const NBA_BOARD_HORIZON_HOURS = 8; // the forecast window's horizon (nba-forecast-window.yml)

/** Board family id → the receipt's player key. Ids are the Stage 12 ledger family ids. */
export const NBA_BOARD_FAMILIES = Object.freeze([
  { family: "nba_player_points", stat: "pts" },
  { family: "nba_player_rebounds", stat: "reb" },
  { family: "nba_player_assists", stat: "ast" },
  { family: "nba_player_threes", stat: "threePm" },
  { family: "nba_player_pra", stat: "pra" },
  { family: "nba_player_points_assists", stat: "ptsAst" },
  { family: "nba_player_points_rebounds", stat: "ptsReb" },
]);

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const ms = (iso) => Date.parse(iso ?? "");

/**
 * Should a run at `now` freeze the boards for this ET day?
 * @param rows        the day's schedule rows (providerEventId, dateUtc)
 * @param championIds Set of event ids the champion has frozen for the day
 * @param hasBoard    the day's board file already exists
 * @returns {{ state: "FREEZE"|"WAIT"|"FROZEN"|"MISSED"|"NO_BOARD_SCOPE", reason: string, firstTipUtc?: string, latestOwedUtc?: string }}
 */
export function boardFreezeDecision({ rows, championIds, now, hasBoard, horizonHours = NBA_BOARD_HORIZON_HOURS }) {
  if (hasBoard) return { state: "FROZEN", reason: "already frozen (write-once)" };
  const tips = (rows ?? []).filter((r) => r?.providerEventId && Number.isFinite(ms(r.dateUtc)) && !isOvernightTip(r.dateUtc))
    .sort((a, b) => ms(a.dateUtc) - ms(b.dateUtc));
  if (!tips.length) return { state: "NO_BOARD_SCOPE", reason: "no non-overnight game on the day" };
  const nowMs = ms(now);
  const first = tips[0].dateUtc;
  const latestOwedUtc = new Date(ms(tips[tips.length - 1].dateUtc) - horizonHours * 3_600_000).toISOString();
  if (!(nowMs < ms(first))) return { state: "MISSED", reason: `the first tip ${first} has passed without a freeze — never back-filled`, firstTipUtc: first, latestOwedUtc };
  const allFrozen = tips.every((r) => championIds?.has(String(r.providerEventId)));
  if (allFrozen) return { state: "FREEZE", reason: "every game of the day has a champion receipt", firstTipUtc: first, latestOwedUtc };
  if (nowMs >= ms(latestOwedUtc)) return { state: "FREEZE", reason: `every game is inside the forecast window since ${latestOwedUtc}`, firstTipUtc: first, latestOwedUtc };
  return { state: "WAIT", reason: `${tips.filter((r) => !championIds?.has(String(r.providerEventId))).length} game(s) not yet frozen by the champion`, firstTipUtc: first, latestOwedUtc };
}

/**
 * The day's boards from the champion's date file.
 * @param artifact   the champion's forecast date file (games[] with receipts)
 * @param scheduleRows the day's schedule rows (so a game with no receipt at all is still disclosed)
 * @returns {{ receipts: object[], notOnBoard: object[], refused: object[] }}
 */
export function nbaDayBoards({ artifact, scheduleRows = [], scopeDate, frozenAt }) {
  const frozenMs = ms(frozenAt);
  if (!Number.isFinite(frozenMs)) throw new Error("nbaDayBoards: frozenAt (ISO) is required");
  const notOnBoard = [];
  const onBoard = [];
  const byId = new Map((artifact?.games ?? []).map((g) => [String(g.providerEventId), g]));
  const ids = new Set([...byId.keys(), ...scheduleRows.map((r) => String(r.providerEventId))]);
  for (const id of [...ids].sort()) {
    const g = byId.get(id);
    const tipUtc = g?.dateUtc ?? scheduleRows.find((r) => String(r.providerEventId) === id)?.dateUtc ?? null;
    if (!g?.receipt?.payloadSha256 || !Number.isFinite(ms(g.receipt.generatedAt))) { notOnBoard.push({ eventId: id, tipUtc, reason: "NO_FROZEN_RECEIPT" }); continue; }
    if (ms(g.receipt.generatedAt) > frozenMs) { notOnBoard.push({ eventId: id, tipUtc, reason: "RECEIPT_AFTER_FREEZE" }); continue; }
    if (!(frozenMs < ms(g.dateUtc))) { notOnBoard.push({ eventId: id, tipUtc, reason: "STARTED_BEFORE_FREEZE" }); continue; }
    if (g.receipt.family !== NBA_BOARD_CHAMPION) { notOnBoard.push({ eventId: id, tipUtc, reason: `NOT_CHAMPION (${g.receipt.family})` }); continue; }
    onBoard.push(g);
  }
  const versions = new Set(onBoard.map((g) => g.receipt.modelVersion));
  if (versions.size > 1) throw new Error(`REFUSED: one board, one model — receipts from ${[...versions].join(", ")}`);
  const modelVersion = onBoard[0]?.receipt?.modelVersion ?? artifact?.modelVersion ?? null;

  const receipts = [];
  const refused = [];
  if (!onBoard.length) return { receipts, notOnBoard, refused: [{ family: "*", reason: "no game of the day had a champion receipt before the freeze" }] };
  for (const { family, stat } of NBA_BOARD_FAMILIES) {
    const candidates = [];
    let ineligibleCount = 0;
    let carriesStat = false;
    for (const g of onBoard) {
      for (const side of ["home", "away"]) {
        for (const p of g.forecast?.players?.[side] ?? []) {
          const dist = p?.[stat];
          if (dist) carriesStat = true;
          const id = p?.providerAthleteId != null ? String(p.providerAthleteId) : null;
          const ok = id && isNum(dist?.p50) && p.availability !== "out" && isNum(p.expectedMinutes) && p.expectedMinutes >= NBA_BOARD_POOL.minExpectedMinutes;
          if (!ok) { ineligibleCount += 1; continue; }
          candidates.push({ g, id, dist });
        }
      }
    }
    // A receipt written before the joint combinations existed has no `pra` etc.: no board, never summed medians.
    if (!carriesStat) { refused.push({ family, reason: `no frozen ${stat} distribution in the champion's receipts` }); continue; }
    candidates.sort((a, b) => b.dist.p50 - a.dist.p50 || (b.dist.mean ?? 0) - (a.dist.mean ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    for (const boardType of ["TOP_10", "TOP_5"]) {
      const receipt = {
        schema: TOP_BOARD_SCHEMA,
        boardId: `nba:${family}:${scopeDate}:${boardType}`,
        sport: "nba",
        family,
        boardType,
        scopeDate,
        frozenAt,
        rankingRule: { id: NBA_BOARD_RANKING.id, metricKind: METRIC_KIND.MODEL_MEDIAN, tiebreak: NBA_BOARD_RANKING.tiebreak },
        selectorStatus: SELECTOR_STATUS.SHADOW,
        modelId: `nba-game-sim:${NBA_BOARD_CHAMPION}`,
        modelVersion,
        generation: modelVersion,
        maturityAtFreeze: "OWNER:SHADOW",
        eligibilityVersion: NBA_BOARD_POOL.id,
        rows: candidates.slice(0, BOARD_SIZE[boardType]).map((c, i) => ({
          rank: i + 1,
          ledgerForecastId: forecastIdFor({ sport: "NBA", eventId: String(c.g.providerEventId), subjectType: "PLAYER", subjectId: c.id, family, forecastKind: FORECAST_KIND.CONTINUOUS }),
          claimKey: null, // Stage 3A's claimKey joins here once a reader needs it
          eventId: String(c.g.providerEventId),
          eventStartUtc: c.g.dateUtc,
          subjectType: "PLAYER",
          subjectId: c.id,
          metricValue: c.dist.p50,
          line: null, // no authorized NBA price exists; a line is never invented
          frozenSide: null, // a projection board is not directional (Stage 3 Q3)
        })),
        ineligibleCount,
      };
      const problems = validateBoardReceipt(receipt);
      if (problems.length) throw new Error(`REFUSED: ${receipt.boardId} is not a valid receipt: ${problems.join("; ")}`);
      receipts.push(receipt);
    }
  }
  return { receipts, notOnBoard, refused };
}

/**
 * Which ET days owe a board freeze at `now`? (The forecast window's pre-check; today's and tomorrow's days only.)
 * @param championIdsByDate (date) => Set of event ids the champion froze at or before `now`
 * @param hasBoardFor       (date) => the day's board file exists
 * @returns {string[]} ET days whose decision is FREEZE
 */
export function owedBoardDays({ rows, now, etDateOf, championIdsByDate, hasBoardFor }) {
  const nowMs = ms(now);
  const days = [...new Set((rows ?? []).filter((r) => ms(r?.dateUtc) > nowMs).map((r) => etDateOf(r.dateUtc)))].sort().slice(0, 2);
  return days.filter((day) => boardFreezeDecision({
    rows: rows.filter((r) => r?.dateUtc && etDateOf(r.dateUtc) === day), championIds: championIdsByDate(day), now, hasBoard: hasBoardFor(day),
  }).state === "FREEZE");
}
