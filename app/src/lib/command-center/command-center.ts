/**
 * THE COMMAND CENTER (P306) — four sports, one read: what is on, what the model thinks matters most, whether the
 * model may be trusted right now, when the numbers were produced, and where to go next.
 *
 * Built from owners only: the product-day authority for "what is on" (passed in by the page, which already consumes
 * it), the sport's canonical artifact for the featured forecast (featured.ts), the receipts and the health scorecard
 * for status (model-status.ts), the artifact's own stamp for freshness (freshness.ts). The page maps nothing itself.
 */
import fs from "node:fs";
import path from "node:path";
import { loadEplForecasts } from "@/lib/sports/epl/forecast-view";
import { sportStateFromProductDay, stateLabel, SPORT_STATES } from "@/lib/home/simulation-hub.mjs";
import type { ProductDay } from "@/lib/product-day/product-day";
import type { CardSport, Freshness, ModelStatusItem, PredictionCardModel } from "./contract";
import { freshnessFor } from "./freshness";
import { modelStatusFor } from "./model-status";
import { featuredEpl, featuredMlb, featuredNfl, featuredUfc } from "./featured";

export interface CommandCenterLane {
  sport: CardSport;
  label: string;
  hubHref: string;
  simulateHref: string;
  /** Hub vocabulary from the shared rule (LIVE_TODAY, IN_SEASON_NO_SLATE, EVENT_THIS_WEEK, HISTORICAL_ONLY, NOT_SUPPORTED). */
  state: string;
  stateLabel: string;
  /** The owner's one-line answer for the day, verbatim. */
  contextLine: string;
  freshness: Freshness;
  /** At most two on the lane; the hub carries the full panel. */
  statuses: ModelStatusItem[];
  featured: PredictionCardModel | null;
  /** Why there is no featured card, in reader words — a designed empty state, never a blank. */
  emptyLine: string | null;
  /** A secondary league inside this lane (Ligue 1 under the soccer lane) when its artifact publishes. */
  secondary: { label: string; href: string; note: string } | null;
}

export interface CommandCenterInput {
  dataRoot: string;
  repoRoot: string;
  today: string;
  nowIso: string;
  days: Partial<Record<CardSport, ProductDay | null>>;
}

const readJson = (p: string): unknown => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

/** Designed copy for a lane with nothing to feature, by the owner's declared state — never "no data". */
function emptyLineFor(sport: CardSport, day: ProductDay | null | undefined, reason: string | null): string {
  if (!day) return "This sport's status could not be read at build time.";
  switch (day.state) {
    case "OFF_SEASON": return "Out of season. The record and every settled forecast stay in the archive.";
    case "SOURCE_STALE": return "The latest data is older than this sport's freshness bar, so nothing new is featured until it refreshes.";
    case "BLOCKED": return day.reason ? `Held closed: ${day.reason}` : "Held closed by a named gate.";
    case "INCIDENT": return "The sport's artifact could not be read; nothing is featured until it can.";
    case "NO_EVENTS": return reason ?? (sport === "nfl" ? "No game today. The next window's forecasts appear when they publish." : "Nothing on today's slate.");
    default: return reason ?? "Nothing to feature right now.";
  }
}

import { leadStatus } from "./report-card";

export function buildCommandCenter(input: CommandCenterInput): CommandCenterLane[] {
  const { dataRoot, repoRoot, today, nowIso, days } = input;
  const eplSet = loadEplForecasts();
  const ufcCard = readJson(path.join(dataRoot, "ufc", "card-latest.json")) as { generatedAt?: string; model?: { verdicts?: Record<string, string> } } | null;
  const nflIndex = readJson(path.join(dataRoot, "nfl", "index.json")) as { generatedAt?: string; counts?: { weekLabel?: string } } | null;

  const lane = (sport: CardSport, label: string, hubHref: string, statuses: ModelStatusItem[], leadId: string, build: (fresh: Freshness, status: ModelStatusItem) => { card: PredictionCardModel | null; reason: string | null }): CommandCenterLane => {
    const day = days[sport] ?? null;
    const fresh = freshnessFor(day?.sourceStamp ?? null, nowIso, { sourceStale: day?.state === "SOURCE_STALE" });
    const { card, reason } = build(fresh, leadStatus(statuses, leadId));
    const state = sportStateFromProductDay(day, { slateDate: today });
    return {
      sport, label, hubHref, simulateHref: `/simulate/?sport=${sport}`,
      state, stateLabel: stateLabel(state, { artifactDate: day?.productDate ?? undefined }),
      contextLine: day?.note ?? "Status unavailable at build time.",
      freshness: fresh,
      statuses: statuses.slice(0, 2),
      featured: state === SPORT_STATES.NOT_SUPPORTED ? null : card,
      emptyLine: card && state !== SPORT_STATES.NOT_SUPPORTED ? null : emptyLineFor(sport, day, reason),
      secondary: null,
    };
  };

  const nflStatuses = modelStatusFor("nfl", { dataRoot, repoRoot, nowIso });
  const mlbStatuses = modelStatusFor("mlb", { dataRoot, repoRoot, nowIso });
  const eplStatuses = modelStatusFor("epl", { dataRoot, repoRoot, nowIso, eplValidation: eplSet?.validation ?? null });
  const ufcStatuses = modelStatusFor("ufc", { dataRoot, repoRoot, nowIso, ufcVerdicts: ufcCard?.model?.verdicts ?? null });

  const lanes: CommandCenterLane[] = [
    lane("nfl", "NFL", "/nfl/", nflStatuses, "nfl_team", (freshness, status) => featuredNfl({ dataRoot, today, nowIso, freshness, status, weekLabel: nflIndex?.counts?.weekLabel ?? null })),
    lane("mlb", "MLB", "/mlb/", mlbStatuses, "mlb_moneyline", (freshness, status) => featuredMlb({ dataRoot, today, nowIso, freshness, status })),
    lane("epl", "Premier League", "/epl/", eplStatuses, "epl_match_model", (freshness, status) => featuredEpl({ dataRoot, today, nowIso, freshness, status, set: eplSet })),
    lane("ufc", "UFC", "/ufc/", ufcStatuses, "ufc_model", (freshness, status) => featuredUfc({ dataRoot, today, nowIso, freshness, status, card: ufcCard as never })),
  ];

  /* Ligue 1 rides inside the soccer lane as a secondary league when its forecast set publishes rows. */
  const ligue1 = readJson(path.join(dataRoot, "soccer", "ligue-1", "forecasts", "latest.json")) as { rows?: Array<{ state?: string }> } | null;
  const l1 = (ligue1?.rows ?? []).filter((r) => r.state === "CURRENT_PRE_EVENT" || r.state === "READY_EXCEPT_ODDS").length;
  const soccer = lanes.find((l) => l.sport === "epl");
  if (soccer && l1 > 0) soccer.secondary = { label: "Ligue 1", href: "/soccer/ligue-1/", note: `${l1} fixture forecast${l1 === 1 ? "" : "s"}` };

  return lanes;
}
