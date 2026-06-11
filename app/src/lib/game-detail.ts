/**
 * Fixture-level game-detail contract + resolvers. Aggregates EXISTING public artifacts for one
 * game — team projections, player props, suggested cards, market availability — into a single
 * PublicGameDetail. No faked odds/props/fixtures: World Cup joins on the API-Football matchId that
 * projections + player props already share; MLB/NBA join on the board game id. Slugs are
 * deterministic (sport + teams + date). Today's games only (the /games board).
 */
import {
  loadWorldCupProjections,
  loadWorldCupPlayerProjections,
  loadWorldCupParlays,
  loadWorldCupMarketAvailability,
} from "@/lib/world-cup/projections";
import { getMlbBoardForDate, activeMlbDate } from "@/lib/data-mlb";
import { getBoardForDate, getAvailableBoardDates } from "@/lib/data";
import {
  normalizeWcProjections,
  normalizeWcPlayerProps,
  normalizeWcCards,
  normalizeMlbLeans,
  normalizeNbaLeans,
  type PublicProjection,
  type PublicSuggestedCard,
  type SportKey,
} from "@/lib/normalize";

export interface PublicGameDetail {
  slug: string;
  sport: SportKey;
  sportLabel: string;
  title: string;
  date: string;
  homeTeam?: string;
  awayTeam?: string;
  venue?: string;
  regulationNote?: string;
  teamProjections: PublicProjection[];
  playerProps: PublicProjection[];
  suggestedCards: PublicSuggestedCard[];
  buildUrl: string;
  caveats: string[];
  dataStatus: Array<{ label: string; status: "live" | "pending" | "unavailable" | "model_only"; detail?: string }>;
}

const SPORT_LABEL: Record<SportKey, string> = { world_cup: "World Cup", mlb: "MLB", nba: "NBA", ufc: "UFC" };

export function slugify(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Deterministic slug: <home>-vs-<away>-<date>. Stable across artifacts (team pair + date). */
export function gameSlug(home: string, away: string, date: string): string {
  return `${slugify(home)}-vs-${slugify(away)}-${date}`;
}

// ── World Cup ──
function worldCupDetails(): PublicGameDetail[] {
  const projections = normalizeWcProjections(loadWorldCupProjections());
  const players = normalizeWcPlayerProps(loadWorldCupPlayerProjections());
  const cards = normalizeWcCards(loadWorldCupParlays());
  const availability = loadWorldCupMarketAvailability();

  // Group by matchId (shared by team projections + player props).
  const byMatch = new Map<string, PublicProjection[]>();
  for (const p of projections) {
    const k = String(p.matchId ?? "");
    if (!k) continue;
    byMatch.set(k, [...(byMatch.get(k) ?? []), p]);
  }
  const out: PublicGameDetail[] = [];
  for (const [matchId, teamProjections] of byMatch) {
    const head = teamProjections[0];
    const [homeTeam, awayTeam] = head.gameLabel.split(" vs ");
    const playerProps = players.filter((p) => String(p.matchId) === matchId);
    const cardsForGame = cards.filter((c) =>
      c.legs.some((l) => l.sublabel && head.gameLabel && l.sublabel.includes(homeTeam ?? "###")),
    );
    const playerMarkets = new Set(playerProps.map((p) => p.marketLabel));
    out.push({
      slug: gameSlug(homeTeam ?? "", awayTeam ?? "", head.date),
      sport: "world_cup",
      sportLabel: "World Cup",
      title: head.gameLabel,
      date: head.date,
      homeTeam,
      awayTeam,
      regulationNote: "90-minute regulation only — a Draw is a real third outcome (no extra time / penalties).",
      teamProjections,
      playerProps,
      suggestedCards: cardsForGame,
      buildUrl: `/build?sport=world_cup&game=${encodeURIComponent(matchId)}`,
      caveats: [
        "90-minute regulation only — Draw is a real outcome.",
        ...(playerProps.some((p) => (p.lineupStatus ?? "").startsWith("pre")) ? ["Player props are pre-lineup until the starting XI is confirmed."] : []),
      ],
      dataStatus: [
        { label: "Moneyline / double chance", status: teamProjections.some((p) => p.market === "moneyline_90" || p.market === "double_chance") ? "live" : "pending" },
        { label: "Total goals", status: teamProjections.some((p) => p.market === "match_total_goals") ? "live" : "pending" },
        { label: "Total corners", status: (availability?.markets?.["match_total_corners"]?.oddsReady) ? "live" : "unavailable", detail: "Corner totals depend on book support for this fixture." },
        { label: "Player props", status: playerMarkets.size > 0 ? "live" : "unavailable", detail: playerMarkets.size > 0 ? `${[...playerMarkets].join(", ")}` : "Not offered by the current books for this fixture yet." },
      ],
    });
  }
  return out;
}

// ── MLB / NBA (player-prop boards) ──
function boardDetails(
  sport: "mlb" | "nba",
  date: string,
  games: Array<{ gamePk?: number | string | null; gameId?: string | null; awayTeamAbbr?: string | null; homeTeamAbbr?: string | null; venue?: string | null }>,
  props: PublicProjection[],
  gameIdForBuild: (g: { gamePk?: number | string | null; gameId?: string | null }) => string | null,
): PublicGameDetail[] {
  const byGame = new Map<string, PublicProjection[]>();
  for (const p of props) byGame.set(String(p.matchId ?? ""), [...(byGame.get(String(p.matchId ?? "")) ?? []), p]);
  return games.map((g) => {
    const home = g.homeTeamAbbr ?? "?";
    const away = g.awayTeamAbbr ?? "?";
    const key = String(g.gamePk ?? g.gameId ?? "");
    const playerProps = byGame.get(key) ?? [];
    const buildId = gameIdForBuild(g);
    return {
      slug: gameSlug(away, home, date),
      sport,
      sportLabel: SPORT_LABEL[sport],
      title: `${away} @ ${home}`,
      date,
      homeTeam: home,
      awayTeam: away,
      venue: g.venue ?? undefined,
      teamProjections: [],
      playerProps,
      suggestedCards: [],
      buildUrl: buildId ? `/build?sport=${sport}&game=${encodeURIComponent(buildId)}` : `/build?sport=${sport}`,
      caveats: [],
      dataStatus: [
        { label: "Player props", status: playerProps.length > 0 ? "live" : "pending", detail: playerProps.length > 0 ? `${playerProps.length} projections` : "Lines pending for this game." },
      ],
    };
  });
}

function mlbDetails(): PublicGameDetail[] {
  const date = activeMlbDate() ?? "";
  if (!date) return [];
  const board = getMlbBoardForDate(date);
  const props = normalizeMlbLeans(board as Parameters<typeof normalizeMlbLeans>[0]);
  const idByPk = new Map<string, string>();
  for (const l of (board.leans ?? []) as Array<{ gamePk?: number | string; gameId?: string }>) {
    if (l.gamePk != null && l.gameId) idByPk.set(String(l.gamePk), l.gameId);
  }
  return boardDetails("mlb", date, board.games ?? [], props, (g) => idByPk.get(String(g.gamePk)) ?? null);
}

function nbaDetails(): PublicGameDetail[] {
  let date = "";
  for (const d of getAvailableBoardDates()) if ((getBoardForDate(d).leans?.length ?? 0) > 0) date = d;
  if (!date) return [];
  const board = getBoardForDate(date);
  const props = normalizeNbaLeans(board as Parameters<typeof normalizeNbaLeans>[0]);
  return boardDetails("nba", date, board.games ?? [], props, (g) => (g.gameId ? String(g.gameId) : null));
}

let _cache: PublicGameDetail[] | null = null;
export function buildAllGameDetails(): PublicGameDetail[] {
  if (_cache) return _cache;
  _cache = [...worldCupDetails(), ...mlbDetails(), ...nbaDetails()];
  return _cache;
}

/** URL sport segment uses the dash form for World Cup to match /world-cup. */
export function urlSport(sport: SportKey): string {
  return sport === "world_cup" ? "world-cup" : sport;
}
function fromUrlSport(sport: string): SportKey {
  return (sport === "world-cup" ? "world_cup" : sport) as SportKey;
}

export function getGameDetail(sport: string, slug: string): PublicGameDetail | null {
  const key = fromUrlSport(sport);
  return buildAllGameDetails().find((d) => d.sport === key && d.slug === slug) ?? null;
}

export function gameDetailParams(): Array<{ sport: string; gameId: string }> {
  return buildAllGameDetails().map((d) => ({ sport: urlSport(d.sport), gameId: d.slug }));
}

/** Detail-page href for a fixture by its two teams (order/date-independent). Used by the sport
 *  hubs to link each listed game straight to its detail page; null when no detail exists. */
export function detailHrefForTeams(sport: SportKey, teamA: string, teamB: string): string | null {
  const key = [slugify(teamA), slugify(teamB)].sort().join("|");
  const d = buildAllGameDetails().find(
    (x) => x.sport === sport && [slugify(x.homeTeam ?? ""), slugify(x.awayTeam ?? "")].sort().join("|") === key,
  );
  return d ? `/games/${urlSport(d.sport)}/${d.slug}` : null;
}
