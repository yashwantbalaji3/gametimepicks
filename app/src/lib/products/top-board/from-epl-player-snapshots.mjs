/**
 * PROTOTYPE · Stage 13 prep (Soccer, local only). NOT WIRED. Maps the EPL anytime-goalscorer forecasts onto Product
 * Engine's top-board-receipt@0 (top-board.mjs) to prove a soccer Top Board fits the Stage 5 schema with no invented
 * field. It builds SHADOW receipts only: no soccer ranked list exists in Production, and the EPL player head is an
 * experimental model ("not validated"), so nothing here may be shown until Stage 4 and the founder say so.
 *
 * Source: the EPL owner's immutable snapshot files (public/data/soccer/epl/player-projections/snapshot-*.json). A
 * snapshot is never rewritten, so a board rebuilt from them later is exactly what could have been frozen then.
 * Board scope: one board per ET day per kickoff SLOT (all fixtures sharing one kickoff minute). A whole-day board
 * would have to freeze before the day's first kickoff and so would rank the later games on pre-lineup numbers;
 * a slot board freezes from the latest snapshot strictly before that slot's kickoff, after lineups where ESPN has
 * posted them. Every member's start is the slot's start, so PE's "frozen before its own start" rule holds by
 * construction and is still checked by validateBoardReceipt.
 * Ranking: the published probability, ties by playerId. Conditional "if he starts" rows are ranked as published and
 * become VOID beside the record if the condition fails (owner grading), never a loss.
 */
import { forecastIdFor } from "../../forecast-ledger/identity.mjs";
import { FORECAST_KIND } from "../../forecast-ledger/contract.mjs";
import { TOP_BOARD_SCHEMA, METRIC_KIND, SELECTOR_STATUS, BOARD_SIZE, etDayOf } from "./top-board.mjs";

const FAMILY = "epl_anytime_goalscorer";

/**
 * @param {Array<{ file: string, generatedAt: string, model?: object, fixtures: Array<object> }>} snapshots
 * @param {{ boardType?: "TOP_5"|"TOP_10" }} [opts]
 * @returns {{ receipts: object[], skipped: Array<{ slot: string, reason: string }> }}
 */
export function receiptsFromEplSnapshots(snapshots, { boardType = "TOP_5" } = {}) {
  const size = BOARD_SIZE[boardType];
  if (!size) throw new Error(`receiptsFromEplSnapshots: boardType ${boardType}`);
  const snaps = (snapshots ?? []).filter((s) => Number.isFinite(Date.parse(s?.generatedAt ?? ""))).sort((a, b) => Date.parse(a.generatedAt) - Date.parse(b.generatedAt));
  const slots = new Set();
  for (const s of snaps) for (const f of s.fixtures ?? []) if (Number.isFinite(Date.parse(f.kickoffUtc ?? ""))) slots.add(new Date(Date.parse(f.kickoffUtc)).toISOString());
  const receipts = [], skipped = [];
  for (const slot of [...slots].sort()) {
    const slotMs = Date.parse(slot);
    const snap = [...snaps].reverse().find((s) => Date.parse(s.generatedAt) < slotMs && (s.fixtures ?? []).some((f) => Date.parse(f.kickoffUtc) === slotMs));
    if (!snap) { skipped.push({ slot, reason: "no snapshot generated before this kickoff carries it" }); continue; }
    const fixtures = snap.fixtures.filter((f) => Date.parse(f.kickoffUtc) === slotMs);
    const cands = [];
    let ineligible = 0;
    for (const f of fixtures) for (const p of f.players ?? []) {
      if (!f.eventId || p.playerId == null || typeof p.probability !== "number" || !Number.isFinite(p.probability)) { ineligible += 1; continue; }
      cands.push({ f, p });
    }
    cands.sort((a, b) => b.p.probability - a.p.probability || String(a.p.playerId).localeCompare(String(b.p.playerId)));
    const top = cands.slice(0, size);
    receipts.push({
      schema: TOP_BOARD_SCHEMA,
      boardId: `epl:${FAMILY}:${etDayOf(slot)}:${slot.slice(11, 16)}:${boardType}`,
      sport: "epl",
      family: FAMILY,
      boardType,
      scopeDate: etDayOf(slot),
      frozenAt: new Date(Date.parse(snap.generatedAt)).toISOString(),
      rankingRule: { id: "epl-scorer-slot-board@0", metricKind: METRIC_KIND.MODEL_PROBABILITY, tiebreak: "playerId" },
      selectorStatus: SELECTOR_STATUS.SHADOW,
      modelId: snap.model?.id ?? null,
      modelVersion: snap.model?.version ?? null,
      generation: null,
      maturityAtFreeze: "OWNER:EXPERIMENTAL_NOT_VALIDATED",
      eligibilityVersion: null,
      source: snap.file,
      rows: top.map(({ f, p }, i) => ({
        rank: i + 1,
        ledgerForecastId: forecastIdFor({ sport: "EPL", eventId: f.eventId, subjectType: "PLAYER", subjectId: `epl-athlete-${p.playerId}`, family: FAMILY, forecastKind: FORECAST_KIND.BINARY }),
        claimKey: null,
        eventId: f.eventId,
        eventStartUtc: new Date(Date.parse(f.kickoffUtc)).toISOString(),
        subjectType: "PLAYER",
        subjectId: `epl-athlete-${p.playerId}`,
        metricValue: p.probability,
        line: null,
        frozenSide: null,
        conditional: p.conditional === true,
      })),
      ineligibleCount: ineligible,
    });
  }
  return { receipts, skipped };
}
