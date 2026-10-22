/**
 * THE NBA LANE of the homepage Command Center (NBA UI parity, founder directive 2026-10-22).
 *
 * NBA is not a CardSport: it has no universal prediction card, because its official forecast publishes no chance, no
 * score and no range — only the Elo-favoured side and player medians. So the lane carries no featured card and no
 * status chips; it lists TODAY'S MATCHUPS instead (tip time ET, the official side where the current lane snapshot has
 * it, a recorded final), each linking to that game's card on /nba (hubLaneAnchor — the hub renders a card for every one
 * of today's games, from the same slate in the same build; the Theater link lives on that card). Every fact comes
 * from lib/sport-hub/nba-hub.ts nbaTodaySlate — the same view the /nba hub's cards render — so the homepage and the
 * hub cannot disagree.
 */
import type { NbaTodaySlate } from "@/lib/sport-hub/nba-hub";
import { SPORT_STATES, stateLabel } from "@/lib/home/simulation-hub.mjs";
import type { CommandCenterLane, CommandCenterGame } from "./command-center";
import { freshnessFor } from "./freshness";
import { hubLaneAnchor } from "@/lib/sports/nba/projection-board-ops.mjs";

/**
 * EVIDENCE GATE (the hub's promotion rule — simulation-hub-promotion.test): a schedule alone never promotes a sport. NBA
 * is a primary lane only with today's official forecast published, or — on a game day before the publish, or an off
 * day — while a committed official forecast is at most this many days old. Otherwise it is "Schedule only" and the
 * shared partition puts it under Other coverage.
 */
export const NBA_RECENT_PUBLISH_DAYS = 3;
/** Rows shown on the lane; the rest are counted and live on the hub (first-viewport word budget, busiest-state.test). */
export const NBA_LANE_ROWS = 3;
const DAY = 86_400_000;

/** `lastPublished`: the newest committed official forecast's slate date (experimental-lane committedLaneDates). */
export function nbaLane(slate: NbaTodaySlate, nowIso: string, { lastPublished = null }: { lastPublished?: string | null } = {}): CommandCenterLane {
  const n = slate.games.length;
  const daysToNext = slate.next ? (Date.parse(slate.next.tipUtc) - Date.parse(nowIso)) / DAY : null;
  const sincePublish = lastPublished ? (Date.parse(`${slate.date}T12:00:00Z`) - Date.parse(`${lastPublished}T12:00:00Z`)) / DAY : null;
  const recent = sincePublish != null && sincePublish >= 0 && sincePublish <= NBA_RECENT_PUBLISH_DAYS;
  const state = slate.forecast === "DISABLED" ? SPORT_STATES.HISTORICAL_ONLY
    : n > 0 && slate.forecast === "PUBLISHED" ? SPORT_STATES.LIVE_TODAY
    : !recent ? SPORT_STATES.HISTORICAL_ONLY
    : n > 0 ? SPORT_STATES.IN_SEASON_NO_SLATE
    : daysToNext != null && daysToNext <= 7 ? SPORT_STATES.EVENT_THIS_WEEK : SPORT_STATES.IN_SEASON_NO_SLATE;
  const games = `${n} game${n === 1 ? "" : "s"} today`;
  const contextLine = n === 0
    ? `No NBA games today${slate.next ? ` · next ${slate.next.matchup}, ${slate.next.label}` : ""}`
    : slate.forecast === "PUBLISHED" ? `${games} · official side and player projections · experimental, not validated`
    : slate.forecast === "PENDING" ? `${games} · official forecast publishes before tip-off`
    : `${games} · schedule only`;
  const rows: CommandCenterGame[] = slate.games.slice(0, NBA_LANE_ROWS).map((g) => ({
    id: g.id,
    label: `${g.away.abbr} @ ${g.home.abbr}`,
    crests: [g.away.logoTeam, g.home.logoTeam],
    time: g.tipLabel,
    note: g.finalNote ? `Final · ${g.finalNote}`
      : g.status === "postponed" ? "Postponed"
      : g.favoured ? `${g.favoured.abbr} favoured · Elo`
      : slate.forecast === "PENDING" ? "Forecast pending" : "No official forecast",
    href: hubLaneAnchor(g.id),
  }));
  return {
    sport: "nba", label: "NBA", hubHref: "/nba/", simulateHref: null,
    state,
    stateLabel: state === SPORT_STATES.HISTORICAL_ONLY ? "Schedule only" : n > 0 && slate.forecast !== "PUBLISHED" ? "Games today" : stateLabel(state),
    contextLine,
    freshness: freshnessFor(slate.updatedAt, nowIso),
    statuses: [],
    featured: null,
    emptyLine: n ? null : "No games today. Schedule, official finals and the next slate are on the NBA hub.",
    secondary: slate.forecast === "PUBLISHED" ? { label: "Top Boards", href: "/nba/projections/", note: "player projections" } : null,
    games: rows,
    moreGames: Math.max(0, n - NBA_LANE_ROWS),
  };
}
