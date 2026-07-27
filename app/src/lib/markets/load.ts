/**
 * MARKET CENTER LOADER (Sprint 029 · Phase 6).
 *
 * The one place that reads sportsbook + model artifacts off disk and assembles them into the
 * canonical intelligence objects. Runs at build time in a server component — the site is a static
 * export, so nothing here may reach the browser and no page may re-read these files itself.
 *
 * Every derivation is delegated: pairing decides modes, game-intelligence and player-intelligence
 * build the content. This module only does I/O, joins and ordering. Keeping it that way is what
 * lets the coverage census and the rendered page agree by construction rather than by discipline.
 */
import fs from "node:fs";
import path from "node:path";

import { buildGameIntelligence, type GameIntelligence } from "./game-intelligence";
import {
  buildPlayerPropIntelligence,
  leanJoinKey,
  propJoinKey,
  type BoardLean,
  type BookPropRow,
  type PlayerPropIntelligence,
} from "./player-intelligence";
import { censusPairing, type PairingCensus } from "./pairing";
import { evaluateArtifactFreshness, resolveFreshnessReference, type FreshnessReading } from "./freshness";
import { MODEL_KEY_BY_PLAYER_FAMILY, PLAYER_FAMILY_BY_PROVIDER_KEY } from "./types";
import type { PlayerMarketFamily } from "./types";

/** Model artifact key → canonical family, for the model-side pass. */
const MODEL_FAMILY_BY_KEY: Record<string, PlayerMarketFamily> = Object.fromEntries(
  Object.entries(MODEL_KEY_BY_PLAYER_FAMILY).map(([family, key]) => [key, family as PlayerMarketFamily]),
) as Record<string, PlayerMarketFamily>;

const DATA_DIR = path.join(process.cwd(), "public", "data", "mlb");

function readJson<T>(rel: string, fallback: T): T {
  try {
    const p = path.join(DATA_DIR, rel);
    if (!fs.existsSync(p)) return fallback;
    return JSON.parse(fs.readFileSync(p, "utf-8")) as T;
  } catch (err) {
    console.warn(`[markets] could not load ${rel}:`, err);
    return fallback;
  }
}

function availableDates(dir: string): string[] {
  try {
    return fs
      .readdirSync(path.join(DATA_DIR, dir))
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .map((f) => f.replace(/\.json$/, ""))
      .sort();
  } catch {
    return [];
  }
}

/**
 * The newest date for which BOTH sportsbook artifacts exist.
 *
 * Requiring both is the point: a date with game markets but no props would render a Market Center
 * that silently lost its player section, which reads as breakage rather than as absence.
 */
export function latestMarketDate(): string | null {
  const games = new Set(availableDates("team-markets"));
  const props = availableDates("player-props");
  const both = [...props].filter((d) => games.has(d)).sort();
  return both.length ? both[both.length - 1] : null;
}

export interface MarketCenterData {
  readonly date: string;
  /** True when the requested date had no sportsbook artifacts at all. */
  readonly missing: boolean;
  /**
   * True when the newest snapshot is not today's — so the page is showing a PAST slate.
   *
   * This distinction exists because the alternative is actively misleading. Evaluating a yesterday
   * snapshot against today strips the sportsbook side from every row (measured: 1,021 rows to
   * UNAVAILABLE, 0 prices left), which renders as "the book offers nothing" when the truth is
   * "we have not captured today yet". Both are wrong to show without saying which one it is.
   *
   * So the page declares its frame. When historical, freshness is evaluated against the artifact's
   * OWN slate date — making the snapshot internally coherent as a picture of that day — and the
   * surface must say plainly that it is not today's market. The rule that no row may claim to be
   * current when it is not is preserved by the framing, not by blanking the data.
   */
  readonly isHistorical: boolean;
  /** Whole days between the snapshot's slate and today. 0 when current. */
  readonly daysBehind: number;
  readonly gameFreshness: FreshnessReading;
  readonly propFreshness: FreshnessReading;
  readonly capturedAt: string | null;
  readonly bookmaker: string | null;
  readonly games: ReadonlyArray<GameIntelligence>;
  readonly props: ReadonlyArray<PlayerPropIntelligence>;
  readonly census: PairingCensus;
}

interface BoardShape {
  date?: string;
  games?: Array<{
    gamePk: number;
    homeTeamAbbr?: string;
    awayTeamAbbr?: string;
    awayProbablePitcherName?: string | null;
    homeProbablePitcherName?: string | null;
  }>;
  leans?: BoardLean[];
}

/**
 * Assemble everything the Market Center renders for one slate.
 *
 * `todayEt` and `nowIso` are injected so a page and its test evaluate freshness at the same instant
 * rather than at two different wall-clock reads.
 */
export function loadMarketCenter(date: string, todayEt: string, nowIso: string): MarketCenterData {
  const teamMarkets = readJson<{
    date?: string;
    generatedAt?: string;
    bookmaker?: string;
    games?: Record<string, Record<string, unknown>>;
  }>(`team-markets/${date}.json`, {});
  const propsFile = readJson<{ date?: string; generatedAt?: string; props?: BookPropRow[] }>(
    `player-props/${date}.json`,
    {},
  );
  const board = readJson<BoardShape>(`boards/${date}.json`, {});
  const sims = readJson<{ games?: Array<Record<string, unknown>> }>(
    `full-game-simulations/${date}.json`,
    {},
  );

  // Which date freshness is judged against. ONE shared rule (./freshness) so this page and the game
  // report can never disagree about whether the same snapshot is current.
  const { reference, isHistorical, daysBehind } = resolveFreshnessReference(date, todayEt);

  const gameFreshness = evaluateArtifactFreshness(
    { artifactDate: teamMarkets.date ?? null, generatedAt: teamMarkets.generatedAt ?? null },
    reference,
  );
  const propFreshness = evaluateArtifactFreshness(
    { artifactDate: propsFile.date ?? null, generatedAt: propsFile.generatedAt ?? null },
    reference,
  );

  const bookGames = Object.values(teamMarkets.games ?? {});
  const missing = bookGames.length === 0 && (propsFile.props ?? []).length === 0;

  // ── Joins ─────────────────────────────────────────────────────────────────────────────────────
  const leans = board.leans ?? [];
  const pkByGameId = new Map<string, number>();
  for (const l of leans) {
    if (l.gameId && l.gamePk != null) pkByGameId.set(l.gameId, l.gamePk);
  }
  const boardGameByPk = new Map((board.games ?? []).map((g) => [g.gamePk, g]));
  const simByPk = new Map((sims.games ?? []).map((g) => [g.gamePk as number, g]));
  const leanByKey = new Map(leans.map((l) => [leanJoinKey(l), l]));

  // ── Games ─────────────────────────────────────────────────────────────────────────────────────
  const games: GameIntelligence[] = bookGames
    .map((g) => {
      const gameId = String((g as { gameId?: string }).gameId ?? "");
      const gamePk = pkByGameId.get(gameId) ?? null;
      return buildGameIntelligence({
        book: g as never,
        sim: (gamePk != null ? simByPk.get(gamePk) ?? null : null) as never,
        gamePk,
        artifact: { date: teamMarkets.date ?? null, generatedAt: teamMarkets.generatedAt ?? null },
        todayEt: reference,
        nowIso,
      });
    })
    .sort((a, b) => String(a.startTime ?? "").localeCompare(String(b.startTime ?? "")));

  // ── Player props ──────────────────────────────────────────────────────────────────────────────
  const props: PlayerPropIntelligence[] = (propsFile.props ?? []).map((prop) => {
    const lean = leanByKey.get(propJoinKey(prop.player, prop.gameId, prop.market, prop.point)) ?? null;
    const gamePk = pkByGameId.get(prop.gameId) ?? null;
    const bg = gamePk != null ? boardGameByPk.get(gamePk) : undefined;

    // Participant cross-check. The board attributes batters from StatsAPI roster membership with a
    // silent first-wins tie-break, so a name collision could attach a player to a team that is not
    // in his game. Requiring participation turns that into a refusal instead of a confident error.
    const teamAbbr = lean?.playerTeamAbbr ?? null;
    const verified =
      teamAbbr != null && bg != null && (teamAbbr === bg.homeTeamAbbr || teamAbbr === bg.awayTeamAbbr);

    return buildPlayerPropIntelligence({
      prop,
      lean,
      family: PLAYER_FAMILY_BY_PROVIDER_KEY[prop.market] ?? null,
      gamePk,
      homeTeam: bg?.homeTeamAbbr ?? null,
      awayTeam: bg?.awayTeamAbbr ?? null,
      teamMapping: verified ? "RESOLVED_FROM_GAME" : "UNRESOLVED",
      artifact: { date: propsFile.date ?? null, generatedAt: propsFile.generatedAt ?? null },
      todayEt: reference,
      nowIso,
    });
  });

  // ── Model-side rows the book does not price ───────────────────────────────────────────────────
  // Iterating only sportsbook rows would make MODEL_ONLY structurally empty: a family the book
  // never posts cannot appear in its own feed. Without this pass the surface would show a
  // "Model only (0)" tab on a slate that genuinely has hundreds of them.
  const bookKeys = new Set(
    (propsFile.props ?? []).map((p) => propJoinKey(p.player, p.gameId, p.market, p.point)),
  );
  for (const lean of leans) {
    if (lean.projection == null) continue;
    if (bookKeys.has(leanJoinKey(lean))) continue;
    const family = MODEL_FAMILY_BY_KEY[lean.marketKey] ?? null;
    if (!family) continue;
    const bg = lean.gamePk != null ? boardGameByPk.get(lean.gamePk) : undefined;
    const teamAbbr = lean.playerTeamAbbr ?? null;
    const verified =
      teamAbbr != null && bg != null && (teamAbbr === bg.homeTeamAbbr || teamAbbr === bg.awayTeamAbbr);

    props.push(
      buildPlayerPropIntelligence({
        // The book posted no row, so the synthetic prop carries the model's line and no price.
        prop: {
          gameId: lean.gameId,
          player: lean.playerName,
          market: lean.marketKey,
          marketLabel: lean.marketLabel ?? null,
          point: lean.line ?? null,
          americanOdds: null,
          startTimeUtc: lean.commenceTime ?? null,
        },
        lean,
        family,
        bookRowPresent: false,
        gamePk: lean.gamePk ?? null,
        homeTeam: bg?.homeTeamAbbr ?? null,
        awayTeam: bg?.awayTeamAbbr ?? null,
        teamMapping: verified ? "RESOLVED_FROM_GAME" : "UNRESOLVED",
        artifact: { date: propsFile.date ?? null, generatedAt: propsFile.generatedAt ?? null },
        todayEt: reference,
        nowIso,
      }),
    );
  }

  return {
    date,
    missing,
    isHistorical,
    daysBehind,
    gameFreshness,
    propFreshness,
    capturedAt: teamMarkets.generatedAt ?? propsFile.generatedAt ?? null,
    bookmaker: teamMarkets.bookmaker ?? null,
    games,
    props,
    census: censusPairing(props.map((p) => p.intelligence)),
  };
}
