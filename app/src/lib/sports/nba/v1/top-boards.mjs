/**
 * PREP · Stage 12 (NBA V1), NBA department, local only. NOT WIRED.
 *
 * NBA TOP BOARDS FROM DAY ONE, as Stage 5 `top-board-receipt@0` receipts (products/top-board/top-board.mjs, Product
 * Engine prep — not redefined here). A board is computed from the frozen per-game receipts only, at one freeze
 * instant, and is itself write-once:
 *
 *   - MEMBERSHIP: a game is on the day's board only if its receipt existed at the freeze (generatedAt ≤ frozenAt) and
 *     it had not started (frozenAt < tip). Every other game of the day is listed in `notOnBoard` with its reason —
 *     never silently dropped, never added later (a later receipt cannot join a frozen board).
 *   - POOL (`nba-board-pool@0`): players with a frozen distribution for the family, not ruled out, and expected
 *     minutes ≥ 20 (the prereg §6 graded population). Excluded candidates are counted in `ineligibleCount`.
 *   - RANK: the family's frozen median (p50) descending, then mean, then athlete id — deterministic, no clock.
 *   - ONE MODEL PER BOARD: every member comes from the same receipt family and model version, or the board refuses.
 *   - SHADOW: `selectorStatus: SHADOW`, `maturityAtFreeze: "OWNER:SHADOW"`. Nothing here can make a board public.
 *
 * Combination families (PRA, P+A, P+R) have no frozen joint median in a v0 receipt, so no board is built for them —
 * the function refuses rather than summing marginal medians.
 *
 * Pure: no fs, no clock.
 */
import { forecastIdFor } from "../../../forecast-ledger/identity.mjs";
import { TOP_BOARD_SCHEMA, BOARD_SIZE, METRIC_KIND, SELECTOR_STATUS } from "../../../products/top-board/top-board.mjs";
import { familyById } from "./families.mjs";

export const NBA_BOARD_POOL = Object.freeze({ id: "nba-board-pool@0", minExpectedMinutes: 20 });
export const NBA_BOARD_RANKING = Object.freeze({ id: "nba-board-ranking@0", tiebreak: "frozen p50 desc, then mean desc, then providerAthleteId asc" });

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/**
 * @param games      receipt games whose ET day is `scopeDate` (games[] from forecasts/<scopeDate>.json)
 * @param scopeDate  ET day "YYYY-MM-DD"
 * @param frozenAt   ISO instant of the freeze (the run that writes the board)
 * @param family     a boardable NBA V1 family id
 * @param boardType  "TOP_10" | "TOP_5"
 * @returns {{ receipt, notOnBoard }}  receipt null with `refused` when the board cannot be built honestly
 */
export function nbaDayBoard({ games, scopeDate, frozenAt, family, boardType }) {
  const fam = familyById(family);
  if (!fam || !fam.boardable) return { receipt: null, refused: `family ${family} is not a boardable NBA V1 family`, notOnBoard: [] };
  if (fam.source == null) return { receipt: null, refused: `family ${family} has no frozen joint distribution in the receipt yet (slice 12-S2)`, notOnBoard: [] };
  const size = BOARD_SIZE[boardType];
  if (!size) return { receipt: null, refused: `boardType ${boardType}`, notOnBoard: [] };
  const frozenMs = Date.parse(frozenAt);
  if (!Number.isFinite(frozenMs)) return { receipt: null, refused: "frozenAt", notOnBoard: [] };

  const notOnBoard = [];
  const onBoardGames = [];
  for (const g of games ?? []) {
    const eventId = String(g?.providerEventId ?? "");
    const tipMs = Date.parse(g?.dateUtc ?? "");
    const genMs = Date.parse(g?.receipt?.generatedAt ?? "");
    if (!g?.receipt?.payloadSha256 || !Number.isFinite(genMs)) { notOnBoard.push({ eventId, reason: "NO_FROZEN_RECEIPT" }); continue; }
    if (genMs > frozenMs) { notOnBoard.push({ eventId, reason: "RECEIPT_AFTER_FREEZE" }); continue; }
    if (!(frozenMs < tipMs)) { notOnBoard.push({ eventId, reason: "STARTED_BEFORE_FREEZE" }); continue; }
    onBoardGames.push(g);
  }

  const versions = new Set(onBoardGames.map((g) => `${g.receipt.family}|${g.receipt.modelVersion}`));
  if (versions.size > 1) return { receipt: null, refused: `one board, one model: receipts from ${[...versions].join(", ")}`, notOnBoard };

  const candidates = [];
  let ineligibleCount = 0;
  for (const g of onBoardGames) {
    for (const sideKey of ["home", "away"]) {
      for (const p of g.forecast?.players?.[sideKey] ?? []) {
        const dist = p?.[fam.stat];
        const id = p?.providerAthleteId != null ? String(p.providerAthleteId) : null;
        const eligible = id && isNum(dist?.p50) && p.availability !== "out" && isNum(p.expectedMinutes) && p.expectedMinutes >= NBA_BOARD_POOL.minExpectedMinutes;
        if (!eligible) { ineligibleCount += 1; continue; }
        candidates.push({ g, p, id, dist });
      }
    }
  }
  candidates.sort((a, b) => b.dist.p50 - a.dist.p50 || (b.dist.mean ?? 0) - (a.dist.mean ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const [first] = onBoardGames;
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
    modelId: first ? `nba-game-sim:${first.receipt.family}` : null,
    modelVersion: first?.receipt?.modelVersion ?? null,
    generation: first?.receipt?.family ?? null,
    maturityAtFreeze: "OWNER:SHADOW",
    eligibilityVersion: NBA_BOARD_POOL.id,
    rows: candidates.slice(0, size).map((c, i) => ({
      rank: i + 1,
      ledgerForecastId: forecastIdFor({ sport: "NBA", eventId: String(c.g.providerEventId), subjectType: "PLAYER", subjectId: c.id, family, forecastKind: fam.kind }),
      claimKey: null, // 3A's claimKey joins here once #1006 is on main
      eventId: String(c.g.providerEventId),
      eventStartUtc: c.g.dateUtc,
      subjectType: "PLAYER",
      subjectId: c.id,
      metricValue: c.dist.p50,
      line: null, // no authorized NBA price exists; a line is never invented
      frozenSide: null, // projection rows: NOT_DIRECTIONAL (Stage 3 Q3)
    })),
    ineligibleCount,
  };
  return { receipt, notOnBoard };
}

/**
 * The freeze instant for a day under the current receipt timing (8 h owed horizon; 06–14Z tips from 18 h):
 * the latest moment every non-overnight game of the day is owed, if that is still before the first such tip.
 * Overnight (06–14Z) tips are a separate scope. Returns null when no such instant exists (the board is refused,
 * not frozen late). A runner would freeze at the first forecast-window run at or after this instant.
 */
export function earliestHonestFreeze(games, { horizonHours = 8, overnightFrom = 6, overnightTo = 14 } = {}) {
  const tips = (games ?? []).map((g) => Date.parse(g?.dateUtc ?? "")).filter(Number.isFinite)
    .filter((t) => { const h = new Date(t).getUTCHours(); return !(h >= overnightFrom && h < overnightTo); })
    .sort((a, b) => a - b);
  if (!tips.length) return null;
  const allOwedAt = tips[tips.length - 1] - horizonHours * 3_600_000;
  return allOwedAt < tips[0] ? new Date(allOwedAt).toISOString() : null;
}
