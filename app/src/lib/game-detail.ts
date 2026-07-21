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
import { normTeamName } from "@/lib/world-cup/market-outlook";
import { resolveWcPlayerTeam } from "@/lib/world-cup/player-team-map";
import { getMlbBoardForDate, activeMlbDate } from "@/lib/data-mlb";
import { mlbTeamLogoUrl } from "@/lib/player-headshots";
import { buildMlbGameLabReport, type MlbGameLabView } from "@/lib/game-lab/mlb-report";
import { buildWcGameLabReport, type WcGameLabView } from "@/lib/game-lab/wc-report";
import { readGameSimulation, gameSimulationPath } from "@/lib/game-simulations/read";
import type { GameSimulationReadResult } from "@/lib/game-simulations/types";
import { validateGameSimulation } from "@/lib/game-simulations/validate";
import {
  buildGameSimulationView,
  unavailableSimulationView,
  type GameSimulationView,
  type GameSimulationArtifactMeta,
} from "@/lib/game-simulations/game-lab-view";
import { getMlbGameCenter, type MlbGameCenter } from "@/lib/mlb-team-markets";
import { getWcGameCenter, type WcGameCenter } from "@/lib/wc-game-center";
import { getWcExpandedMarkets, type WcExpandedMarkets } from "@/lib/wc-expanded-markets";
import fs from "node:fs";
import path from "node:path";
import { loadWorldCupSpecials } from "@/lib/world-cup/world-cup-specials";
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
  /** Provider event/match id (World Cup: Odds API event id) — used to map engine game-specific cards. */
  matchId?: string;
  homeTeam?: string;
  awayTeam?: string;
  /** Real provider team-logo URLs (api-sports) when the artifact carries them. */
  homeLogo?: string | null;
  awayLogo?: string | null;
  venue?: string;
  regulationNote?: string;
  teamProjections: PublicProjection[];
  playerProps: PublicProjection[];
  suggestedCards: PublicSuggestedCard[];
  buildUrl: string;
  caveats: string[];
  dataStatus: Array<{ label: string; status: "live" | "pending" | "unavailable" | "model_only"; detail?: string }>;
  /** MLB Game Lab report (model-vs-market, biggest leans, recent form, product-mapping links + honest
   *  "not yet simulated" placeholders) — derived verbatim from the MLB board. Null for non-MLB / no leans. */
  gameLabMlb?: MlbGameLabView | null;
  /** World Cup Game Lab report (odds-only model-vs-market, biggest team-market leans, regulation-90
   *  caveats, artifact-proven product-mapping links + honest "not yet simulated" placeholders) — derived
   *  verbatim from the WC projections. Null for non-WC / no rows. */
  gameLabWc?: WcGameLabView | null;
  /** Market-implied Soccer Game Center (World Cup only) — 3-way result, double chance,
   *  draw-no-bet, match total + O/U lean, BTTS, de-vigged. Null when no market rows.
   *  NOT a sampled simulation (no runCount); kept distinct from a Monte Carlo sim. */
  wcGameCenter?: WcGameCenter | null;
  /** Expanded WC market modules (Asian handicap + team totals), de-vigged from the
   *  odds. Null when no expanded-markets artifact for the slate; per-module unavailable
   *  notes when a book didn't post one. Never fabricated. */
  wcExpanded?: WcExpandedMarkets | null;
  /**
   * Deterministic per-game SIMULATION view (Phase 5) — the precomputed artifact the "Generate
   * Simulation" reveal plays back. Loaded at build time from
   * public/data/mlb/game-simulations/<board.date>.json and joined to this fixture by gamePk (the
   * MLB board id = `matchId`), then by gameId/slug. Fully serializable (plain JSON) so the client
   * component only animates — no fs/fetch, no per-user randomness. Every user sees the SAME picks.
   * `status: "unavailable"` (well-formed) when no artifact/matching game. Null for non-MLB.
   */
  gameLabSimulation?: GameSimulationView | null;
  /**
   * Market-implied Game Center (MLB only) — win probability, game total + O/U lean,
   * and run-line lean, derived by de-vigging the sportsbook team markets
   * (public/data/mlb/team-markets/<date>.json). Null when the game has no team markets.
   * Kept DISTINCT from the player-prop MODEL modules; never fabricated.
   */
  gameCenter?: MlbGameCenter | null;
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

/**
 * True when EVERY leg of a suggested card belongs to the given fixture (the leg
 * sublabel carries the "Home vs Away" match string). Fixture detail pages show
 * fixture-specific cards ONLY — a cross-game card (e.g. a leg from another match)
 * is confusing on a single game's page, so it is excluded here and stays on
 * /picks where the cross-game context is explicit.
 */
export function cardBelongsToFixture(
  card: { legs: Array<{ sublabel?: string }> },
  gameLabel: string | undefined,
): boolean {
  if (!gameLabel || card.legs.length === 0) return false;
  return card.legs.every((l) => l.sublabel === gameLabel);
}

// ── World Cup ──
function worldCupDetails(): PublicGameDetail[] {
  // Raw projections carry the real api-sports team-logo URLs that the
  // normalized shape drops — index them by matchId for the fixture hero.
  const logoByMatch = new Map<string, { home: string | null; away: string | null }>();
  for (const m of loadWorldCupProjections()?.matches ?? []) {
    if (m.matchId != null && !logoByMatch.has(String(m.matchId))) {
      logoByMatch.set(String(m.matchId), { home: m.homeLogo ?? null, away: m.awayLogo ?? null });
    }
  }
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
  // For the WC Game Lab report: the raw projections (full fields: edgePct/settlementSupport/outcomes/…)
  // and the set of fixture titles that appear in a WC Specials card (artifact-proven product mapping).
  const rawWcProjections = loadWorldCupProjections();
  const wcSpecialGames = new Set((loadWorldCupSpecials()?.cards ?? []).flatMap((c) => c.games ?? []));
  const out: PublicGameDetail[] = [];
  for (const [matchId, teamProjections] of byMatch) {
    const head = teamProjections[0];
    const [homeTeam, awayTeam] = head.gameLabel.split(" vs ");
    // Player props join on the shared matchId when available; the player-props artifact keys on the
    // Odds API event id (not the schedule matchId), so fall back to matching each prop's team to one
    // of the two fixture sides (alias-normalized) — unambiguous within a single matchday slate.
    const fixtureTeams = new Set([homeTeam, awayTeam].map((t) => normTeamName(t ?? "")).filter(Boolean));
    const playerProps = players
      .filter(
        (p) =>
          String(p.matchId) === matchId ||
          fixtureTeams.has(normTeamName(p.player?.team ?? p.gameLabel ?? "")),
      )
      // Correct each prop's team from the official-squad map (the Odds feed has no team, so the generator
      // defaults everyone to the home side). Constrained to this fixture's two teams; leaves the value as-is
      // when unresolved so we never introduce a NEW wrong team.
      .map((p) => {
        if (!p.player?.name) return p;
        const team = resolveWcPlayerTeam(p.player.name, homeTeam ?? "", awayTeam ?? "");
        return team && team !== p.player.team ? { ...p, player: { ...p.player, team } } : p;
      });
    const cardsForGame = cards.filter((c) => cardBelongsToFixture(c, head.gameLabel));
    const playerMarkets = new Set(playerProps.map((p) => p.marketLabel));
    out.push({
      slug: gameSlug(homeTeam ?? "", awayTeam ?? "", head.date),
      sport: "world_cup",
      sportLabel: "World Cup",
      title: head.gameLabel,
      date: head.date,
      matchId,
      homeTeam,
      awayTeam,
      homeLogo: logoByMatch.get(matchId)?.home ?? null,
      awayLogo: logoByMatch.get(matchId)?.away ?? null,
      regulationNote: "90-minute regulation only — a Draw is a real third outcome (no extra time / penalties).",
      gameLabWc: buildWcGameLabReport(rawWcProjections, matchId, { inWcSpecials: wcSpecialGames.has(head.gameLabel) }),
      // Market-implied Soccer Game Center (3-way / DC / DNB / total / BTTS) from the de-vigged WC
      // projection. Null when the fixture has no market rows → the UI shows an honest absence.
      wcGameCenter: getWcGameCenter(matchId),
      // Expanded modules keyed by the SLATE date (the expanded-markets artifact holds every
      // fixture in the projection window), not the individual match date.
      wcExpanded: getWcExpandedMarkets(String((rawWcProjections as { date?: string } | null)?.date ?? head.date), matchId),
      teamProjections,
      playerProps,
      suggestedCards: cardsForGame,
      buildUrl: `/build?sport=world_cup&game=${encodeURIComponent(matchId)}`,
      caveats: [
        "90-minute regulation only — Draw is a real outcome.",
        ...(playerProps.some((p) => (p.lineupStatus ?? "").startsWith("pre")) ? ["Player props stay projection-based until the starting XI is confirmed."] : []),
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
  games: Array<{ gamePk?: number | string | null; gameId?: string | null; awayTeamAbbr?: string | null; homeTeamAbbr?: string | null; homeTeamId?: number | null; awayTeamId?: number | null; venue?: string | null }>,
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
      matchId: key || undefined, // gamePk (MLB) / gameId (NBA) — used to join the Game Lab report
      homeTeam: home,
      awayTeam: away,
      homeLogo: sport === "mlb" ? mlbTeamLogoUrl(g.homeTeamId) : null,
      awayLogo: sport === "mlb" ? mlbTeamLogoUrl(g.awayTeamId) : null,
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

/**
 * Load the per-day MLB game-simulation artifact ONCE and return a joiner that maps a fixture (by its
 * MLB board id / gamePk in `matchId`, falling back to gameId/slug) to a fully-serializable simulation
 * view. Never throws: a missing/malformed artifact yields joiners that return the honest "unavailable"
 * view for every game.
 *
 * STALENESS is decided HONESTLY by `readGameSimulation`, which is given a "current" date + the
 * artifact's own simulationVersion. The current date is the ACTIVE MLB SLATE date (`slateDate` =
 * `activeMlbDate()`), NOT the raw calendar day: `activeMlbDate()` deliberately anchors to the active
 * slate and does not tick forward at midnight, so the artifact that matches the active slate is fresh.
 * An artifact only reads "stale" when its date is behind the active slate (a genuinely old artifact) or
 * its simulationVersion is behind the current engine. No clock is embedded in a lib beyond this
 * already-established freshness anchor.
 */
function mlbSimulationJoiner(date: string, slateDate: string): (matchId: string | undefined, slug: string) => GameSimulationView {
  const root = path.join(process.cwd(), "public", "data");
  const filePath = gameSimulationPath(root, "mlb", date);

  // Read + validate the artifact once so we can (a) build per-game views via the shared reader and
  // (b) resolve a game by gamePk/slug without re-reading the file. A missing file is normal.
  let raw: string | null = null;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch {
    raw = null;
  }
  let meta: GameSimulationArtifactMeta = {
    modelVersion: null,
    simulationVersion: null,
    runCount: null,
    generatedAt: null,
  };
  // Map every joinable key (gamePk as string, gameId, slug) → the artifact game's gameId.
  const gameIdByKey = new Map<string, string>();
  let currentSimulationVersion: number | undefined;
  if (raw != null) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      const validation = validateGameSimulation(parsed);
      if (validation.ok) {
        const artifact = parsed as {
          modelVersion: string;
          simulationVersion: number;
          runCount: number | null;
          generatedAt: string;
          games: Array<{ gameId: string; gamePk?: number; slug: string }>;
        };
        meta = {
          modelVersion: artifact.modelVersion ?? null,
          simulationVersion: artifact.simulationVersion ?? null,
          runCount: artifact.runCount ?? null,
          generatedAt: artifact.generatedAt ?? null,
        };
        currentSimulationVersion = artifact.simulationVersion;
        for (const g of artifact.games ?? []) {
          if (g.gamePk != null) gameIdByKey.set(String(g.gamePk), g.gameId);
          if (g.slug) gameIdByKey.set(g.slug, g.gameId);
          gameIdByKey.set(g.gameId, g.gameId);
        }
      }
    } catch {
      // Malformed artifact ⇒ leave meta empty + no keys ⇒ every game resolves to "unavailable".
    }
  }

  // The active-slate date is the honest "current" date for staleness (see the doc comment above).
  return (matchId: string | undefined, slug: string): GameSimulationView => {
    // Resolve the artifact game by gamePk (the board id = matchId), then by slug.
    const gameId = (matchId ? gameIdByKey.get(matchId) : undefined) ?? gameIdByKey.get(slug);
    if (!gameId) return unavailableSimulationView("mlb", date, matchId ?? slug, "game_not_in_artifact");
    // Read this ONE game through the shared reader so status/stale/unavailable stay in one place.
    const result: GameSimulationReadResult = readGameSimulation(root, "mlb", date, gameId, {
      currentDate: slateDate,
      currentSimulationVersion,
    });
    return buildGameSimulationView(result, meta);
  };
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
  const details = boardDetails("mlb", date, board.games ?? [], props, (g) => idByPk.get(String(g.gamePk)) ?? null);
  // Load the per-day simulation artifact ONCE and attach the matching game to each detail. Staleness is
  // judged against the ACTIVE MLB SLATE date (= `date`, from `activeMlbDate()`), not the raw calendar
  // day, so the artifact that matches the active slate is fresh rather than spuriously "stale".
  const joinSim = mlbSimulationJoiner(board.date || date, date);
  // Attach the MLB Game Lab report + the deterministic simulation view per game (both derived from the
  // board / the precomputed artifact; the report is null when no leans, the sim is "unavailable" when
  // no matching artifact game — neither ever fabricates data).
  return details.map((d) => {
    const sim = joinSim(d.matchId, d.slug);
    return {
      ...d,
      gameLabMlb: d.matchId ? buildMlbGameLabReport(board, d.matchId) : null,
      gameLabSimulation: sim,
      // Market-implied Game Center, joined by the sim's gameId (== the Odds event id).
      // Null when the game has no de-vigged team markets → the UI shows an honest
      // unavailable state rather than inventing win-prob / total / run-line numbers.
      gameCenter: sim?.gameId ? getMlbGameCenter(date, sim.gameId) : null,
    };
  });
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

/** One entry in the in-page game selector — a sibling game on the same date + sport. */
export interface SiblingGameLink {
  slug: string;
  urlSport: string;
  title: string;
  /** True when a ready deterministic simulation artifact exists (drives the "sim ready" chip). */
  simReady: boolean;
}

/** Sibling games on the SAME date + sport (for the in-page game selector), excluding the current slug.
 *  Cheap — buildAllGameDetails() is memoized. Sim-ready games first, then by slug for stable order. */
export function siblingGames(sport: SportKey, date: string, currentSlug: string): SiblingGameLink[] {
  return buildAllGameDetails()
    .filter((d) => d.sport === sport && d.date === date && d.slug !== currentSlug)
    .map((d) => ({ slug: d.slug, urlSport: urlSport(d.sport), title: d.title, simReady: !!d.gameLabSimulation }))
    .sort((a, b) => (a.simReady === b.simReady ? a.slug.localeCompare(b.slug) : a.simReady ? -1 : 1));
}

/** The full fixture detail for a team pair (order/date-independent), or null when none exists. */
export function getDetailForTeams(sport: SportKey, teamA: string, teamB: string): PublicGameDetail | null {
  const key = [slugify(teamA), slugify(teamB)].sort().join("|");
  return (
    buildAllGameDetails().find(
      (x) => x.sport === sport && [slugify(x.homeTeam ?? ""), slugify(x.awayTeam ?? "")].sort().join("|") === key,
    ) ?? null
  );
}

/** Detail-page href for a fixture by its two teams (order/date-independent). Used by the sport
 *  hubs to link each listed game straight to its detail page; null when no detail exists. */
export function detailHrefForTeams(sport: SportKey, teamA: string, teamB: string): string | null {
  const d = getDetailForTeams(sport, teamA, teamB);
  return d ? `/games/${urlSport(d.sport)}/${d.slug}` : null;
}
