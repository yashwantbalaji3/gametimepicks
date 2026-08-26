import Link from "next/link";

import {
  getAvailableBoardDates,
  getBoardForDate,
} from "@/lib/data";
import {
  activeMlbDate,
  getMlbBoardForDate,
  getMlbScheduleForDate,
} from "@/lib/data-mlb";
import {
  activeNhlDate,
  getNhlScheduleForDate,
} from "@/lib/data-nhl";
// PR #113: IPL loader imports removed; the schedule still exists on
// disk for future re-enablement but is no longer surfaced.
import { selectActiveSlate } from "@/lib/active-slate";
import { currentEtDate } from "@/lib/freshness";

import TonightMatchupCard from "./tonight-matchup-card";
import { getPlayoffContext } from "./playoff-context";

/**
 * Homepage tonight rail — large visual matchup cards for live sports
 * (NBA + MLB), a slim row for sports that only have schedule on disk
 * (NHL / IPL), and a World Cup teaser tile when no WC match is today.
 *
 * Pure server component. Every value is derived from on-disk artifacts.
 */
export default function HomepageSportsRail() {
  const today = currentEtDate();

  // ─── NBA ────────────────────────────────────────────────────────────
  const allBoardDates = getAvailableBoardDates();
  const boardsByDate: Record<string, ReturnType<typeof getBoardForDate>> = {};
  for (const d of allBoardDates) boardsByDate[d] = getBoardForDate(d);
  const nbaActive = selectActiveSlate(allBoardDates, today, boardsByDate);
  const nbaActiveDate =
    nbaActive.kind !== "no_data" && nbaActive.kind !== "no_current"
      ? nbaActive.selectedDate
      : null;
  const nbaBoard = nbaActiveDate ? boardsByDate[nbaActiveDate] : null;
  const nbaGames = nbaBoard?.games ?? [];
  const nbaLeans = nbaBoard?.leans ?? [];
  const nbaStrongerSignals = nbaLeans.filter(
    (l) => l.confidence === "High",
  ).length;

  // ─── MLB ────────────────────────────────────────────────────────────
  const mlbDate = activeMlbDate() ?? null;
  const mlbBoard = mlbDate ? getMlbBoardForDate(mlbDate) : null;
  const mlbSchedule = mlbDate ? getMlbScheduleForDate(mlbDate) : null;
  const mlbLeans = mlbBoard?.summary?.leans ?? 0;
  const mlbGames = mlbBoard?.games ?? mlbSchedule?.games ?? [];

  // ─── NHL (schedule-only) ────────────────────────────────────────────
  // PR #113: IPL schedule no longer loaded for the homepage rail.
  const nhlDate = activeNhlDate() ?? null;
  const nhlSchedule = nhlDate ? getNhlScheduleForDate(nhlDate) : null;
  const nhlGames = nhlSchedule?.games ?? [];

  // The 2026 World Cup is complete — no kickoff-countdown teaser on the homepage (it is an archive, not an
  // active or upcoming sport). Homepage sports focus on the live sport (MLB) + real future schedules.

  const liveSports = nbaLeans.length > 0 || mlbLeans > 0;

  return (
    <section
      className="mt-8 reveal relative"
      aria-label="Tonight's slate"
    >
      <div className="flex items-center gap-3 mb-5">
        <span
          aria-hidden
          className="inline-block w-1.5 h-1.5 rounded-full gtp-neon-pulse"
          style={{
            background: "var(--vault-gold-bright)",
            boxShadow: "0 0 8px color-mix(in srgb, var(--vault-accent) 60%, transparent)",
          }}
        />
        <span
          className="font-mono uppercase tracking-[0.18em]"
          style={{ color: "var(--vault-gold)", fontSize: 11 }}
        >
          Tonight on GameTimePicks
        </span>
        <div className="flex-1 h-px" style={{ background: "var(--vault-rule)" }} />
      </div>

      {/* Live tonight — big matchup cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {nbaLeans.length > 0 && nbaGames.length > 0 && (
          <NbaTonight
            game={nbaGames[0]}
            leansCount={nbaLeans.length}
            strongerSignalCount={nbaStrongerSignals}
            date={nbaActiveDate ?? today}
          />
        )}
        {mlbLeans > 0 && mlbGames.length > 0 && (
          <MlbTonight
            gameCount={mlbGames.length}
            leansCount={mlbLeans}
            firstGame={pickMlbFeaturedGame(mlbGames, mlbDate ?? today)}
            date={mlbDate ?? today}
          />
        )}
        {!liveSports && (
          <article
            className="rounded-[12px] px-5 py-5 col-span-full"
            style={{
              background: "color-mix(in srgb, var(--vault-scrim-base) 55%, transparent)",
              border: "1px solid var(--vault-border)",
            }}
          >
            <div
              className="font-mono uppercase tracking-[0.18em]"
              style={{ color: "var(--vault-gold)", fontSize: 11 }}
            >
              No live slate
            </div>
            <h2
              className="mt-2 font-display tracking-tight"
              style={{
                color: "var(--vault-text)",
                fontSize: "clamp(22px, 3vw, 28px)",
                lineHeight: 1.15,
              }}
            >
              Tonight's projections land at the next refresh.
            </h2>
            <Link
              href="/results"
              className="mt-3 inline-flex font-mono uppercase tracking-[0.16em]"
              style={{ color: "var(--vault-gold-bright)", fontSize: 11 }}
            >
              See latest results →
            </Link>
          </article>
        )}
      </div>

      {/* Pending sports — slim row (PR #113: IPL tile removed,
          NHL kept). The IPL schedule loader still exists in the
          codebase but no longer renders. */}
      {nhlGames.length > 0 && (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <PendingTile
            emoji="🏒"
            sport="NHL"
            line={`${nhlGames.length} game${nhlGames.length === 1 ? "" : "s"} · projection model pending`}
            href="/today"
          />
        </div>
      )}

    </section>
  );
}

function NbaTonight({
  game,
  leansCount,
  strongerSignalCount,
  date,
}: {
  game: { gameId: string; awayTeamAbbr?: string | null; homeTeamAbbr?: string | null; tipoff?: string | null; awayTeamFull?: string | null; homeTeamFull?: string | null };
  leansCount: number;
  strongerSignalCount: number;
  date: string;
}) {
  const ctx = getPlayoffContext(
    game.gameId,
    game.awayTeamAbbr ?? undefined,
    game.homeTeamAbbr ?? undefined,
  );
  // Optional market context (PR #68 added NBA game markets for this date).
  // Read lazily to avoid coupling the rail to the team-projection loader.
  const gameMarket = loadGameMarket("nba", date, game.gameId);
  return (
    <TonightMatchupCard
      sportEmoji="🏀"
      sportLabel="NBA"
      sportKey="nba"
      awayTeam={game.awayTeamAbbr ?? null}
      homeTeam={game.homeTeamAbbr ?? null}
      awayTeamFull={game.awayTeamFull ?? null}
      homeTeamFull={game.homeTeamFull ?? null}
      contextLine={
        ctx.isPlayoffs ? `${ctx.roundLabel} · ${ctx.gameLabel}` : null
      }
      tipoff={game.tipoff ?? null}
      projectionCount={leansCount}
      strongerSignalCount={strongerSignalCount}
      spread={gameMarket?.spread ?? null}
      total={gameMarket?.total ?? null}
      moneyline={gameMarket?.moneyline ?? null}
      /* P185 · the baseline's ONE dead link. /nba/board was retired with /nba/power when NBA
         became HISTORICAL_ONLY — the source has been failing since 2026-06-13 and there is no live
         projection capability. The label was the worse half of the defect: "Open NBA projections"
         promised a capability that does not exist, and a working href to a live-looking hub would
         have been a bigger lie than the broken one. The honest destination is the settled archive. */
      ctaHref="/results/nba"
      ctaLabel="See NBA settled results"
      status="live"
    />
  );
}

function MlbTonight({
  gameCount,
  leansCount,
  firstGame,
  date,
}: {
  gameCount: number;
  leansCount: number;
  firstGame: { gamePk?: number | null; awayTeamAbbr?: string | null; homeTeamAbbr?: string | null; awayTeamName?: string | null; homeTeamName?: string | null };
  date: string;
}) {
  // Pull market chips from app/public/data/mlb/game-markets/<date>.json if
  // present. Same fail-closed pattern as NBA: render only when on disk.
  const mlbMarket = firstGame.gamePk
    ? loadGameMarket("mlb", date, String(firstGame.gamePk))
    : null;
  return (
    <TonightMatchupCard
      sportEmoji="⚾"
      sportLabel="MLB"
      sportKey="mlb"
      awayTeam={firstGame?.awayTeamAbbr ?? null}
      homeTeam={firstGame?.homeTeamAbbr ?? null}
      awayTeamFull={firstGame?.awayTeamName ?? null}
      homeTeamFull={firstGame?.homeTeamName ?? null}
      contextLine={
        gameCount > 1
          ? `${gameCount} games on the slate · first matchup`
          : `1 game on the slate`
      }
      tipoff={null}
      projectionCount={leansCount}
      spread={mlbMarket?.spread ?? null}
      total={mlbMarket?.total ?? null}
      moneyline={mlbMarket?.moneyline ?? null}
      ctaHref={`/mlb/board?date=${date}`}
      ctaLabel="Open MLB projections"
      status="live"
    />
  );
}

function PendingTile({
  emoji,
  sport,
  line,
  href,
}: {
  emoji: string;
  sport: string;
  line: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="vault-glow-hover rounded-[8px] px-4 py-3 flex items-center gap-3"
      style={{
        background: "color-mix(in srgb, var(--vault-scrim-base) 55%, transparent)",
        border: "1px solid var(--vault-border)",
        textDecoration: "none",
      }}
    >
      <span aria-hidden role="img" style={{ fontSize: 22, lineHeight: 1 }}>
        {emoji}
      </span>
      <div className="flex-1 min-w-0">
        <div
          className="font-mono uppercase tracking-[0.16em]"
          style={{ color: "var(--vault-gold)", fontSize: 10 }}
        >
          {sport}
        </div>
        <div
          className="font-display"
          style={{
            color: "var(--vault-text-mute)",
            fontSize: 13,
            marginTop: 1,
          }}
        >
          {line}
        </div>
      </div>
      <span
        className="font-mono uppercase tracking-[0.16em] shrink-0"
        style={{ color: "var(--vault-text-mute)", fontSize: 10 }}
      >
        Open →
      </span>
    </Link>
  );
}

/**
 * Quick lookup against the NBA game-markets artifact for tonight's
 * NBA card. Inlined here so the rail stays a single self-contained
 * component; the artifact shape comes from pipeline/fetch_game_markets.py.
 */
type GameMarketEntry = {
  spread: string | null;
  total: string | null;
  moneyline: string | null;
};

function loadGameMarket(
  sport: "nba" | "mlb",
  date: string,
  gameId: string,
): GameMarketEntry | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("node:fs");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require("node:path");
    const p = path.join(
      process.cwd(),
      "public",
      "data",
      sport,
      "game-markets",
      `${date}.json`,
    );
    if (!fs.existsSync(p)) return null;
    const data = JSON.parse(fs.readFileSync(p, "utf-8")) as {
      games?: Record<
        string,
        {
          spread?: { home: number; away: number } | null;
          total?: { line: number } | null;
          moneyline?: { home: number; away: number } | null;
          homeTeam?: string;
          awayTeam?: string;
        }
      >;
    };
    const row = data.games?.[gameId];
    if (!row) return null;
    const spreadFmt =
      row.spread && typeof row.spread.home === "number"
        ? `${row.spread.home > 0 ? "+" : ""}${row.spread.home}`
        : null;
    const totalFmt =
      row.total && typeof row.total.line === "number"
        ? `O/U ${row.total.line}`
        : null;
    const fmtMl = (n: number) => (n > 0 ? `+${n}` : `${n}`);
    const moneylineFmt =
      row.moneyline &&
      typeof row.moneyline.home === "number" &&
      typeof row.moneyline.away === "number"
        ? `${fmtMl(row.moneyline.away)} / ${fmtMl(row.moneyline.home)}`
        : null;
    if (!spreadFmt && !totalFmt && !moneylineFmt) return null;
    return {
      spread: spreadFmt,
      total: totalFmt,
      moneyline: moneylineFmt,
    };
  } catch {
    return null;
  }
}

/**
 * Pick the MLB game to feature on the homepage card. Prefer a game
 * whose market lines are actually on disk — that way the card always
 * shows spread/total/ML chips when ANY market exists, even if earlier
 * day games have already finished. Falls back to first game on the
 * slate if no markets exist yet.
 */
function pickMlbFeaturedGame<
  T extends { gamePk?: number | null }
>(games: T[], date: string): T {
  for (const g of games) {
    if (!g.gamePk) continue;
    const mkt = loadGameMarket("mlb", date, String(g.gamePk));
    if (mkt) return g;
  }
  return games[0];
}
