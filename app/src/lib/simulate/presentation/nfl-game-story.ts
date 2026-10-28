/**
 * The simulation story on /nfl/game/[eventId] — one function, so the page and its tests build the SAME manifest.
 *
 * The event is the lobby's (nflSimulateEligibility) when the index still lists it, else the archived frozen revision
 * (archived-forecast.ts). The footer's "produced" time is the forecast revision's own `generatedAt` — the time the
 * page's "Forecast frozen at" line and its provenance print — never the index rebuild stamp (P0 · 2026-10-28).
 */
import { nflSimulateEligibility } from "@/lib/sports/nfl/simulate-eligibility";
import { archivedEventFrom, type ArchivedGame } from "@/lib/sports/nfl/archived-forecast";
import { buildNflPresentation } from "./nfl";
import type { PresentationResult } from "./types";

/** The adapter's two arguments for this page, so the page and its tests build the same manifest:
 *  `buildNflPresentation(...nflGameStoryInputs(eventId, f, archived, nowIso))`. */
export function nflGameStoryInputs(
  eventId: string,
  forecast: { generatedAt?: string | null; model?: { id?: string; simulations?: number } | null },
  archived: ArchivedGame | null,
  nowIso: string,
): Parameters<typeof buildNflPresentation> {
  const eligibility = nflSimulateEligibility(nowIso);
  const event = eligibility.events.find((e) => e.providerEventId === eventId) ?? (archived ? archivedEventFrom(archived) : null);
  const sims = forecast.model?.simulations;
  return [event, {
    indexGeneratedAt: eligibility.indexGeneratedAt,
    forecastGeneratedAt: forecast.generatedAt ?? null,
    runCount: typeof sims === "number" && Number.isInteger(sims) && sims > 0 ? sims : null,
    modelVersion: forecast.model?.id ?? null,
    nowIso,
  }];
}

export const nflGameStoryManifest = (...a: Parameters<typeof nflGameStoryInputs>): PresentationResult => buildNflPresentation(...nflGameStoryInputs(...a));
