/**
 * THE NBA LANE of the homepage Command Center (NBA UI parity, founder directive 2026-10-22).
 *
 * NBA is not a CardSport: it has no universal prediction card, because its official forecast publishes no chance, no
 * score and no range — only the Elo-favoured side and player medians. So the lane carries no featured card; it lists
 * TODAY'S MATCHUPS instead (tip time ET, the official side where the current lane snapshot has
 * it, a recorded final), each linking to that game's card on /nba (hubLaneAnchor — the hub renders a card for every one
 * of today's games, from the same slate in the same build; the Theater link lives on that card). Every fact comes
 * from lib/sport-hub/nba-hub.ts nbaTodaySlate — the same view the /nba hub's cards render — so the homepage and the
 * hub cannot disagree.
 */
import type { NbaTodaySlate } from "@/lib/sport-hub/nba-hub";
import { SPORT_STATES, stateLabel } from "@/lib/home/simulation-hub.mjs";
import type { CommandCenterLane, CommandCenterGame } from "./command-center";
import { freshnessFor } from "./freshness";
import { NBA_MODEL_PERFORMANCE_NOTE, PUBLIC_TERMS } from "@/lib/public-registry";
import type { ModelStatusItem } from "./contract";
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

/**
 * The lane's two status chips (founder mandate 2026-10-24: NBA at parity with the other lanes' chips). Both forecast
 * families are graded after every game and neither has a public record yet, so both read "Too early to judge" — the
 * registry's own Model Performance sentence is the evidence line.
 */
const SOURCE = "public/data/nba/experimental-public/latest.json";
export const NBA_LANE_STATUSES: readonly ModelStatusItem[] = Object.freeze([
  { id: "nba_winner_side", family: "Favoured side", state: "TOO_EARLY", headline: "Graded after every game", detail: NBA_MODEL_PERFORMANCE_NOTE, n: null, source: SOURCE },
  { id: "nba_player_medians", family: "Player projections", state: "TOO_EARLY", headline: "Medians only", detail: "Each player's median from 10,000 simulated games; ranges are not published until they show reliable coverage.", n: null, source: SOURCE },
]);

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
    : slate.forecast === "PUBLISHED" ? `${games} · ${PUBLIC_TERMS.OFFICIAL_FORECAST}: favoured side and player projections`
    : slate.forecast === "PENDING" ? `${games} · ${PUBLIC_TERMS.OFFICIAL_FORECAST} publishes before tip-off`
    : `${games} · schedule only`;
  const rows: CommandCenterGame[] = slate.games.slice(0, NBA_LANE_ROWS).map((g) => ({
    id: g.id,
    label: `${g.away.abbr} @ ${g.home.abbr}`,
    crests: [g.away.logoTeam, g.home.logoTeam],
    time: g.tipLabel,
    note: g.finalNote ? `Final · ${g.finalNote}`
      : g.status === "postponed" ? "Postponed"
      : g.favoured ? `${g.favoured.abbr} favoured`
      : slate.forecast === "PENDING" ? "Forecast pending" : `No ${PUBLIC_TERMS.OFFICIAL_FORECAST}`,
    href: hubLaneAnchor(g.id),
  }));
  return {
    sport: "nba", label: "NBA", hubHref: "/nba/", simulateHref: "/simulate/?sport=nba",
    state,
    stateLabel: state === SPORT_STATES.HISTORICAL_ONLY ? "Schedule only" : n > 0 && slate.forecast !== "PUBLISHED" ? "Games today" : stateLabel(state),
    contextLine,
    freshness: freshnessFor(slate.updatedAt, nowIso),
    statuses: state === SPORT_STATES.HISTORICAL_ONLY ? [] : [...NBA_LANE_STATUSES],
    featured: null,
    emptyLine: n ? null : "No games today. Schedule, official finals and the next slate are on the NBA hub.",
    secondary: slate.forecast === "PUBLISHED" ? { label: "Top Boards", href: "/nba/projections/", note: "player projections" } : null,
    games: rows,
    moreGames: Math.max(0, n - NBA_LANE_ROWS),
  };
}
