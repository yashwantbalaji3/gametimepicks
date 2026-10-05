/**
 * UFC → Forecast Ledger rows. Pure.
 *
 * WINNER (owner: grade-ufc-model-vs-market.mjs → data/internal/research/ufc/model-vs-market/graded.jsonl, one row per
 * bout, grading the model's probability from an immutable snapshot of the PUBLIC card captured before the bout).
 * BINARY: P(the model's pick wins). The pick is the side the published card favoured, so the owner's `hit` is carried
 * as the directional word (basis PUBLISHED_PICK). A bout with no winner (draw / no contest) is VOID.
 *
 * Identity uses the provider (ESPN) bout id, never the name-based `boutId`. Method and round heads are published but
 * have no forward grader — reported UNMEASURED in coverage, not invented here. The event-id mismatch flag (ESPN id vs
 * the odds feed's hash) concerns the MARKET join, not this identity; it blocks UFC products, not measurement.
 */
import { FORECAST_KIND, RECOVERABILITY } from "../contract.mjs";
import { measureBinary, withDirectional } from "../measure.mjs";
import { makeRow, marketBlock } from "../row.mjs";

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

export function ufcWinnerRows(graded = []) {
  const out = [];
  for (const g of graded) {
    if (!g.providerBoutId || !isNum(g.modelProbability)) continue;
    const decided = typeof g.hit === "boolean" && g.winner;
    out.push(makeRow({
      sport: "UFC",
      competition: g.eventName ?? "UFC",
      season: typeof g.eventDate === "string" ? g.eventDate.slice(0, 4) : null,
      eventId: String(g.providerBoutId),
      eventStart: null, // the grade log records the event date, not the bout start
      matchup: g.pick && g.opponent ? `${g.pick} vs ${g.opponent}` : null,
      subjectType: "BOUT",
      subjectId: `ufc-bout-${g.providerBoutId}`,
      subjectDisplay: g.pick && g.opponent ? `${g.pick} vs ${g.opponent}` : null,
      family: "ufc_winner",
      forecastKind: FORECAST_KIND.BINARY,
      modelId: g.modelId ?? null,
      publicationSurface: "ufc-card",
      receiptId: g.sourceFile ?? null,
      publishedAt: g.capturedAt ?? null,
      probability: g.modelProbability,
      probabilityType: "MODEL",
      direction: g.pick ? `${g.pick} wins` : null,
      categoryPrediction: g.pick ?? null,
      market: marketBlock({ impliedProbability: isNum(g.marketProbability) ? g.marketProbability : null, provider: g.books != null ? `${g.books} books` : null, capturedAt: g.capturedAt ?? null }),
      settlement: decided
        ? { state: "SETTLED", finalValue: g.hit ? 1 : 0, finalCategory: g.winner, settledAt: g.gradedAt ?? null, finality: "CANONICAL" }
        : g.gradedAt ? { state: "VOID", reason: "NO_WINNER", settledAt: g.gradedAt } : { state: "PENDING" },
      measurement: decided
        ? withDirectional(measureBinary({ probability: g.modelProbability, observed: g.hit ? 1 : 0 }), { result: g.hit ? "WIN" : "LOSS", basis: "PUBLISHED_PICK" })
        : {},
      recoverability: RECOVERABILITY.OWNER_GRADED_LOG,
    }));
  }
  return out;
}
