"use client";

/**
 * ProjectionsExperience — the new consumer-first /projections flow.
 *
 * Four-step architecture (replaces the prior sport-tile hub):
 *   1. Compact header  (date + game count + projection count)
 *   2. Date pill row    (horizontal scroll, snap-to-pill, mobile-first)
 *   3. Game card grid   (sportsbook-style matchup cards with market chips)
 *   4. Game detail view (inline; large logos + market chips + player accordions)
 *
 * Architecture decisions:
 *   - Pure client component. The server page passes the full
 *     `ProjectionsPayload` in once at first paint; we never re-fetch.
 *   - URL state via search params (`?date=YYYY-MM-DD&game=<gameId>`)
 *     so deep links + browser back/forward both work.
 *   - Only ONE player accordion may be expanded at a time on mobile;
 *     desktop allows multiple. Native <details> drives accordion
 *     semantics so SEO/JS-disabled paths still render usable text.
 *
 * Honesty rules locked:
 *   - We never render a market chip without a real value on disk.
 *   - We never render a "hit rate" badge on a player row — per-player
 *     hit rate would need persisted player audits we don't yet have.
 *     Confidence tier is the only badge we surface.
 *   - The recent-form sparkline only renders when at least 2 numeric
 *     samples exist in the lean's recentSeries.
 */
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import TeamLogo from "./team-logo";
import PlayerAvatar from "./player-avatar";
import { confidenceLabel } from "@/lib/confidence-labels";
import {
  EMPTY_CALIBRATION_TABLE,
  calibratedConfidenceLabelFromTable,
  type CalibrationTable,
  type Sport,
} from "@/lib/confidence-calibration-rules";
import { formatAmerican } from "@/lib/odds-math";

import type {
  ProjectionsPayload,
  ProjectionsDate,
  ProjectionsGame,
  ProjectionsLean,
} from "@/lib/data-projections";
import {
  groupLeansByMarket,
  type ProjectionsMarketGroup,
} from "@/lib/projections-market-group";

interface Props {
  payload: ProjectionsPayload;
  /** Calibration table loaded on the server. When absent (e.g.
   *  audit missing), the experience falls back to the empty
   *  table which classifies every tier as "unknown" — equivalent
   *  to no overlay (raw labels render). */
  calibrationTable?: CalibrationTable;
}

export default function ProjectionsExperience({
  payload,
  calibrationTable = EMPTY_CALIBRATION_TABLE,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const urlDate = searchParams.get("date");
  const urlGameId = searchParams.get("game");
  const urlSport = (searchParams.get("sport") ?? "all") as "all" | "nba" | "mlb";

  const selectedDate =
    urlDate && payload.dates.some((d) => d.date === urlDate)
      ? urlDate
      : payload.defaultDate ?? payload.dates[0]?.date ?? "";

  const activeDate: ProjectionsDate | undefined = payload.dates.find(
    (d) => d.date === selectedDate,
  );

  const selectedGameId =
    urlGameId && activeDate?.games.some((g) => g.gameId === urlGameId)
      ? urlGameId
      : null;

  const selectedGame: ProjectionsGame | null = selectedGameId
    ? activeDate?.games.find((g) => g.gameId === selectedGameId) ?? null
    : null;

  function navigate(next: { date?: string; game?: string | null; sport?: "all" | "nba" | "mlb" }) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.date) params.set("date", next.date);
    if (next.game === null) params.delete("game");
    else if (typeof next.game === "string") params.set("game", next.game);
    if (next.sport) {
      if (next.sport === "all") params.delete("sport");
      else params.set("sport", next.sport);
    }
    const qs = params.toString();
    router.replace(qs ? `/projections?${qs}` : "/projections", {
      scroll: false,
    });
  }

  if (payload.dates.length === 0) {
    return (
      <section
        className="rounded-[8px] px-5 py-5"
        style={{
          background: "rgba(7,11,26,0.55)",
          border: "1px solid var(--vault-border)",
        }}
      >
        <div
          className="font-mono uppercase tracking-[0.16em]"
          style={{ color: "var(--vault-gold)", fontSize: 10 }}
        >
          No live projections right now
        </div>
        <p
          className="mt-2 text-[13.5px] leading-relaxed"
          style={{ color: "var(--vault-text-mute)" }}
        >
          The next slate will appear here as soon as projections land.
        </p>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <HeaderRow
        activeDate={activeDate}
        selectedGame={selectedGame}
        todayEt={payload.todayEt}
      />

      <DatePillRow
        dates={payload.dates}
        selectedDate={selectedDate}
        todayEt={payload.todayEt}
        onSelect={(d) => navigate({ date: d, game: null })}
      />

      {activeDate ? (
        selectedGame ? (
          <GameDetailView
            game={selectedGame}
            leans={activeDate.leansByGameId[selectedGame.gameId] ?? []}
            onBack={() => navigate({ game: null })}
            calibrationTable={calibrationTable}
          />
        ) : (
          <>
            <SportNav
              activeDate={activeDate}
              selectedSport={urlSport}
              onSelect={(s) => navigate({ sport: s })}
            />
            <GameCardGroups
              activeDate={activeDate}
              selectedSport={urlSport}
              onSelect={(gameId) => navigate({ game: gameId })}
            />
          </>
        )
      ) : null}
    </div>
  );
}

/* ============================================================================
   Sport navigation
============================================================================ */

function SportNav({
  activeDate,
  selectedSport,
  onSelect,
}: {
  activeDate: ProjectionsDate;
  selectedSport: "all" | "nba" | "mlb";
  onSelect: (s: "all" | "nba" | "mlb") => void;
}) {
  // Build per-sport counts from the active date's games.
  const tallies: Record<"nba" | "mlb", { games: number; projections: number }> = {
    nba: { games: 0, projections: 0 },
    mlb: { games: 0, projections: 0 },
  };
  for (const g of activeDate.games) {
    const s = (g.sport ?? "").toLowerCase();
    if (s === "nba" || s === "mlb") {
      tallies[s].games += 1;
      tallies[s].projections += g.projectionCount ?? 0;
    }
  }
  const totalGames = activeDate.games.length;
  const totalProjections = activeDate.games.reduce(
    (sum, g) => sum + (g.projectionCount ?? 0),
    0,
  );
  // Only show sports that exist on this date.
  const available: Array<{
    key: "all" | "nba" | "mlb";
    label: string;
    icon: string | null;
    games: number;
    projections: number;
  }> = [
    { key: "all", label: "All", icon: null, games: totalGames, projections: totalProjections },
  ];
  if (tallies.nba.games > 0) {
    available.push({ key: "nba", label: "NBA", icon: "🏀", ...tallies.nba });
  }
  if (tallies.mlb.games > 0) {
    available.push({ key: "mlb", label: "MLB", icon: "⚾", ...tallies.mlb });
  }
  if (available.length <= 1) return null;
  return (
    <nav
      aria-label="Sport filter"
      className="flex flex-wrap gap-2"
    >
      {available.map((opt) => {
        const active = opt.key === selectedSport;
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onSelect(opt.key)}
            aria-pressed={active}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-full"
            style={{
              background: active ? "var(--vault-gold-bright)" : "rgba(7,11,26,0.55)",
              border: active
                ? "1px solid var(--vault-gold-bright)"
                : "1px solid var(--vault-border)",
              color: active ? "var(--vault-bg)" : "var(--vault-text)",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {opt.icon ? <span aria-hidden>{opt.icon}</span> : null}
            <span className="font-display" style={{ fontWeight: 600 }}>
              {opt.label}
            </span>
            <span
              className="font-mono"
              style={{
                color: active ? "var(--vault-bg)" : "var(--vault-text-faint)",
                fontSize: 10,
                opacity: active ? 0.7 : 1,
              }}
            >
              {opt.games} game{opt.games === 1 ? "" : "s"} · {opt.projections} proj
            </span>
          </button>
        );
      })}
    </nav>
  );
}

/* ============================================================================
   Grouped game cards (sport-first)
============================================================================ */

function GameCardGroups({
  activeDate,
  selectedSport,
  onSelect,
}: {
  activeDate: ProjectionsDate;
  selectedSport: "all" | "nba" | "mlb";
  onSelect: (gameId: string) => void;
}) {
  const filtered = activeDate.games.filter((g) => {
    if (selectedSport === "all") return true;
    return (g.sport ?? "").toLowerCase() === selectedSport;
  });
  if (filtered.length === 0) {
    return (
      <section
        className="rounded-[8px] p-5"
        style={{
          background: "rgba(7,11,26,0.55)",
          border: "1px dashed var(--vault-border)",
        }}
      >
        <span
          className="font-mono uppercase tracking-[0.16em]"
          style={{ color: "var(--vault-gold)", fontSize: 11 }}
        >
          No {selectedSport.toUpperCase()} games today
        </span>
      </section>
    );
  }
  if (selectedSport !== "all") {
    return (
      <GameCardGrid games={filtered} onSelect={onSelect} />
    );
  }
  // "All" sport → group by NBA first, then MLB. Use a small section
  // header so the visual rhythm matches the sport-first nav above.
  const nbaGames = filtered.filter((g) => (g.sport ?? "").toLowerCase() === "nba");
  const mlbGames = filtered.filter((g) => (g.sport ?? "").toLowerCase() === "mlb");
  const otherGames = filtered.filter((g) => {
    const s = (g.sport ?? "").toLowerCase();
    return s !== "nba" && s !== "mlb";
  });
  return (
    <div className="flex flex-col gap-5">
      {nbaGames.length > 0 && (
        <section className="flex flex-col gap-2">
          <SectionHeading icon="🏀" label="NBA" count={nbaGames.length} />
          <GameCardGrid games={nbaGames} onSelect={onSelect} />
        </section>
      )}
      {mlbGames.length > 0 && (
        <section className="flex flex-col gap-2">
          <SectionHeading icon="⚾" label="MLB" count={mlbGames.length} />
          <GameCardGrid games={mlbGames} onSelect={onSelect} />
        </section>
      )}
      {otherGames.length > 0 && (
        <section className="flex flex-col gap-2">
          <SectionHeading icon={null} label="Other" count={otherGames.length} />
          <GameCardGrid games={otherGames} onSelect={onSelect} />
        </section>
      )}
    </div>
  );
}

function SectionHeading({
  icon,
  label,
  count,
}: {
  icon: string | null;
  label: string;
  count: number;
}) {
  return (
    <div className="flex items-center gap-2">
      {icon ? <span aria-hidden>{icon}</span> : null}
      <span
        className="font-mono uppercase tracking-[0.18em]"
        style={{ color: "var(--vault-gold)", fontSize: 11 }}
      >
        {label}
      </span>
      <span
        className="font-mono"
        style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
      >
        {count} game{count === 1 ? "" : "s"}
      </span>
      <div
        className="flex-1 h-px"
        style={{ background: "var(--vault-rule)" }}
      />
    </div>
  );
}

/* ============================================================================
   Header
============================================================================ */

function HeaderRow({
  activeDate,
  selectedGame,
  todayEt,
}: {
  activeDate?: ProjectionsDate;
  selectedGame: ProjectionsGame | null;
  todayEt: string;
}) {
  if (!activeDate) return null;
  const label = humanizeDate(activeDate.date, todayEt);
  return (
    <header className="flex items-baseline justify-between gap-3 flex-wrap">
      <div className="flex items-baseline gap-3 min-w-0 flex-wrap">
        <h1
          className="font-display tracking-tight"
          style={{
            color: "var(--vault-text)",
            fontSize: "clamp(22px, 3.6vw, 30px)",
            lineHeight: 1.05,
            letterSpacing: "-0.02em",
            fontWeight: 600,
          }}
        >
          {selectedGame
            ? `${selectedGame.awayTeamAbbr} @ ${selectedGame.homeTeamAbbr}`
            : "Tonight's projections"}
        </h1>
        <span
          className="font-mono"
          style={{ color: "var(--vault-text-faint)", fontSize: 11 }}
        >
          {label}
        </span>
      </div>
      <div
        className="flex items-baseline gap-3 font-mono"
        style={{ color: "var(--vault-text-mute)", fontSize: 11 }}
      >
        <span>
          {activeDate.gameCount}{" "}
          {activeDate.gameCount === 1 ? "game" : "games"}
        </span>
        <span>·</span>
        <span style={{ color: "var(--vault-gold-bright)" }}>
          {activeDate.leanCount} projections
        </span>
      </div>
    </header>
  );
}

/* ============================================================================
   Date pill row
============================================================================ */

function DatePillRow({
  dates,
  selectedDate,
  todayEt,
  onSelect,
}: {
  dates: ProjectionsDate[];
  selectedDate: string;
  todayEt: string;
  onSelect: (date: string) => void;
}) {
  return (
    <nav
      aria-label="Date selector"
      className="gtp-projections-date-row flex gap-2 overflow-x-auto -mx-1 px-1 pb-1"
    >
      {dates.map((d) => {
        const active = d.date === selectedDate;
        const label = humanizeDate(d.date, todayEt);
        return (
          <button
            key={d.date}
            type="button"
            onClick={() => onSelect(d.date)}
            className="gtp-projections-date-pill"
            data-active={active ? "true" : "false"}
            aria-pressed={active}
          >
            <span className="block font-mono uppercase tracking-[0.14em] text-[10px] leading-none">
              {label}
            </span>
            <span
              className="block tabular text-[12px] leading-none mt-1"
              style={{ color: active ? "inherit" : "var(--vault-text-faint)" }}
            >
              {d.gameCount} game{d.gameCount === 1 ? "" : "s"}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

/* ============================================================================
   Game card grid
============================================================================ */

function GameCardGrid({
  games,
  onSelect,
}: {
  games: ProjectionsGame[];
  onSelect: (gameId: string) => void;
}) {
  if (games.length === 0) return null;
  return (
    <section
      aria-label="Games"
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
    >
      {games.map((g) => (
        <MatchupCard
          key={`${g.sport}-${g.gameId}`}
          game={g}
          onSelect={() => onSelect(g.gameId)}
        />
      ))}
    </section>
  );
}

function MatchupCard({
  game,
  onSelect,
}: {
  game: ProjectionsGame;
  onSelect: () => void;
}) {
  const tipoff = formatTipoffEt(game.tipoffIso);
  return (
    <button
      type="button"
      onClick={onSelect}
      className="gtp-matchup-card text-left"
      aria-label={`Open ${game.awayTeamAbbr} at ${game.homeTeamAbbr}`}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <span
          className="font-mono uppercase tracking-[0.16em]"
          style={{ color: "var(--vault-gold-bright)", fontSize: 9 }}
        >
          {game.sport.toUpperCase()}
        </span>
        <span
          className="font-mono"
          style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
        >
          {tipoff ?? "—"}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <TeamLogo team={game.awayTeamAbbr} sport={game.sport} size="md" />
        <span
          className="font-display tracking-tight"
          style={{
            color: "var(--vault-text)",
            fontSize: 17,
            lineHeight: 1.05,
            fontWeight: 600,
          }}
        >
          {game.awayTeamAbbr}
          <span
            style={{
              color: "var(--vault-text-mute)",
              margin: "0 6px",
              fontWeight: 400,
            }}
          >
            @
          </span>
          {game.homeTeamAbbr}
        </span>
        <span className="ml-auto">
          <TeamLogo team={game.homeTeamAbbr} sport={game.sport} size="md" />
        </span>
      </div>

      {game.markets && hasAnyMarketValue(game.markets) ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {game.markets.moneyline && (
            <MarketChip
              label="ML"
              value={formatMoneyline(game.markets.moneyline, game)}
            />
          )}
          {game.markets.spread && (
            <MarketChip
              label={game.sport === "mlb" ? "Run line" : "Spread"}
              value={formatSpread(game.markets.spread, game)}
            />
          )}
          {game.markets.total && (
            <MarketChip
              label="Total"
              value={
                game.markets.total.line != null
                  ? game.markets.total.line.toFixed(1)
                  : "—"
              }
            />
          )}
        </div>
      ) : null}

      <div
        className="mt-3 pt-2 flex items-center justify-between font-mono"
        style={{
          borderTop: "1px solid var(--vault-rule)",
          fontSize: 11,
        }}
      >
        <span style={{ color: "var(--vault-text-mute)" }}>
          {game.projectionCount} projection
          {game.projectionCount === 1 ? "" : "s"}
        </span>
        <span style={{ color: "var(--vault-gold-bright)" }}>Open →</span>
      </div>
    </button>
  );
}

function MarketChip({ label, value }: { label: string; value: string }) {
  return (
    <span
      className="inline-flex items-baseline gap-1.5 px-2 py-1 rounded-[5px]"
      style={{
        background: "rgba(7,11,26,0.55)",
        border: "1px solid var(--vault-border)",
      }}
    >
      <span
        className="font-mono uppercase tracking-[0.16em]"
        style={{ color: "var(--vault-text-faint)", fontSize: 9 }}
      >
        {label}
      </span>
      <span
        className="font-display tabular"
        style={{ color: "var(--vault-text)", fontSize: 12, fontWeight: 600 }}
      >
        {value}
      </span>
    </span>
  );
}

/* ============================================================================
   Game detail view
============================================================================ */

function GameDetailView({
  game,
  leans,
  onBack,
  calibrationTable,
}: {
  game: ProjectionsGame;
  leans: ProjectionsLean[];
  onBack: () => void;
  calibrationTable: CalibrationTable;
}) {
  // Group leans by player so the accordion list is one row per player.
  const playerGroups = useMemo(() => groupLeansByPlayer(leans), [leans]);
  const tipoff = formatTipoffEt(game.tipoffIso);
  return (
    <section
      aria-label={`${game.awayTeamAbbr} at ${game.homeTeamAbbr} detail`}
      className="flex flex-col gap-4"
    >
      <button
        type="button"
        onClick={onBack}
        className="self-start inline-flex items-center gap-1 font-mono uppercase tracking-[0.14em]"
        style={{
          color: "var(--vault-gold-bright)",
          fontSize: 10,
        }}
      >
        ← All games
      </button>

      {/* Hero */}
      <div
        className="rounded-[10px] px-4 py-4 sm:px-5 sm:py-5"
        style={{
          background:
            "linear-gradient(180deg, rgba(20,24,35,0.92) 0%, rgba(7,11,26,0.62) 100%)",
          border: "1px solid var(--vault-border)",
        }}
      >
        <div className="flex items-center justify-between gap-3 mb-2">
          <span
            className="font-mono uppercase tracking-[0.18em]"
            style={{ color: "var(--vault-gold-bright)", fontSize: 9 }}
          >
            {game.sport.toUpperCase()}
            {game.venue ? ` · ${game.venue}` : ""}
          </span>
          {tipoff && (
            <span
              className="font-mono"
              style={{ color: "var(--vault-text-mute)", fontSize: 11 }}
            >
              {tipoff}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 sm:gap-4">
          <TeamLogo team={game.awayTeamAbbr} sport={game.sport} size="lg" />
          <div className="flex-1 min-w-0">
            <h2
              className="font-display tracking-tight"
              style={{
                color: "var(--vault-text)",
                fontSize: "clamp(22px, 4vw, 32px)",
                lineHeight: 1.05,
                letterSpacing: "-0.02em",
                fontWeight: 600,
              }}
            >
              {game.awayTeamAbbr}
              <span
                style={{
                  color: "var(--vault-text-mute)",
                  margin: "0 10px",
                  fontWeight: 400,
                }}
              >
                @
              </span>
              {game.homeTeamAbbr}
            </h2>
            {(game.awayTeamName || game.homeTeamName) && (
              <div
                className="font-mono mt-1"
                style={{ color: "var(--vault-text-mute)", fontSize: 11 }}
              >
                {game.awayTeamName}
                {game.awayTeamName && game.homeTeamName ? " · " : ""}
                {game.homeTeamName}
              </div>
            )}
          </div>
          <TeamLogo team={game.homeTeamAbbr} sport={game.sport} size="lg" />
        </div>

        {game.markets && hasAnyMarketValue(game.markets) ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {game.markets.moneyline && (
              <BigMarketCell
                label="Moneyline"
                primary={formatMoneylineSide(
                  game.markets.moneyline.away,
                  game.awayTeamAbbr,
                )}
                secondary={formatMoneylineSide(
                  game.markets.moneyline.home,
                  game.homeTeamAbbr,
                )}
              />
            )}
            {game.markets.spread && (
              <BigMarketCell
                label={game.sport === "mlb" ? "Run line" : "Spread"}
                primary={formatSpreadSide(
                  game.markets.spread.away,
                  game.awayTeamAbbr,
                )}
                secondary={formatSpreadSide(
                  game.markets.spread.home,
                  game.homeTeamAbbr,
                )}
              />
            )}
            {game.markets.total && game.markets.total.line != null && (
              <BigMarketCell
                label="Total"
                primary={`O ${game.markets.total.line.toFixed(1)}`}
                secondary={`U ${game.markets.total.line.toFixed(1)}`}
              />
            )}
          </div>
        ) : (
          <p
            className="mt-3 font-mono"
            style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
          >
            Game markets pending — projections still rendered below.
          </p>
        )}
      </div>

      {/* Player accordions */}
      <PlayerAccordionList
        groups={playerGroups}
        calibrationTable={calibrationTable}
      />
    </section>
  );
}

function BigMarketCell({
  label,
  primary,
  secondary,
}: {
  label: string;
  primary: string;
  secondary: string;
}) {
  return (
    <div
      className="flex flex-col gap-0.5 rounded-[6px] px-2.5 py-1.5"
      style={{
        background: "rgba(7,11,26,0.55)",
        border: "1px solid var(--vault-border)",
        minWidth: 92,
      }}
    >
      <span
        className="font-mono uppercase tracking-[0.16em]"
        style={{ color: "var(--vault-text-faint)", fontSize: 9 }}
      >
        {label}
      </span>
      <span
        className="font-display tabular"
        style={{ color: "var(--vault-text)", fontSize: 13, fontWeight: 600 }}
      >
        {primary}
      </span>
      <span
        className="font-mono"
        style={{ color: "var(--vault-text-mute)", fontSize: 10 }}
      >
        {secondary}
      </span>
    </div>
  );
}

/* ============================================================================
   Player accordion list
============================================================================ */

interface PlayerGroup {
  playerId: number | null;
  playerName: string;
  team: string;
  sport: "nba" | "mlb";
  leans: ProjectionsLean[];
  /** Strongest projection — highest |edgePct|. Used in collapsed view. */
  topLean: ProjectionsLean | null;
}

function groupLeansByPlayer(leans: ProjectionsLean[]): PlayerGroup[] {
  const groups = new Map<string, PlayerGroup>();
  for (const l of leans) {
    if (!l.playerName) continue;
    const key = `${l.playerName}|${l.team}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        playerId: l.playerId,
        playerName: l.playerName,
        team: l.team,
        sport: l.sport,
        leans: [],
        topLean: null,
      };
      groups.set(key, g);
    }
    g.leans.push(l);
    if (
      !g.topLean ||
      _projectionRelevance(l) > _projectionRelevance(g.topLean)
    ) {
      g.topLean = l;
    }
  }
  return [...groups.values()].sort((a, b) => {
    const ra = _projectionRelevance(a.topLean);
    const rb = _projectionRelevance(b.topLean);
    if (rb !== ra) return rb - ra;
    return a.playerName.localeCompare(b.playerName);
  });
}

/**
 * Composite relevance score for a single projection — used to sort
 * players inside a game detail view. Higher = more interesting to a
 * casual reader.
 *
 * Inputs (ordered by impact):
 *   1. confidence tier (High > Medium > Low > insufficient)
 *   2. |edge| capped at 20pp to avoid extreme-edge outliers dominating
 *   3. lean ∈ {Over, Under} — actionable picks beat "No Play"
 *   4. recent10 array length (NBA: full sample = stronger signal)
 *   5. market stability nudge (REB, batter_hits beat AST, strikeouts)
 *
 * Pure function. Safe for both NBA and MLB shapes.
 */
function _projectionRelevance(l: ProjectionsLean | null): number {
  if (!l) return 0;
  const conf =
    l.confidence === "High"
      ? 1.0
      : l.confidence === "Medium"
        ? 0.6
        : l.confidence === "Low"
          ? 0.3
          : 0.05;
  const edge = Math.min(20, Math.max(0, Math.abs(l.edgePct ?? 0)));
  const actionable = l.side === "Over" || l.side === "Under" ? 0.1 : 0;
  const recent10 = Array.isArray(l.recentSeries) ? Math.min(l.recentSeries.length, 10) : 0;
  const recentBonus = recent10 >= 5 ? 0.1 : 0;
  // Per-market stability nudge — mirrors the optimizer's market weights.
  const sportMarket = `${(l.sport || "").toLowerCase()}:${l.market}`;
  const marketStable =
    sportMarket === "nba:REB" || sportMarket === "mlb:batter_hits"
      ? 0.05
      : sportMarket === "nba:AST" ||
          sportMarket === "mlb:pitcher_strikeouts" ||
          sportMarket === "mlb:batter_hits_runs_rbis"
        ? -0.05
        : 0;
  return conf * 0.6 + (edge / 20) * 0.3 + actionable + recentBonus + marketStable;
}

function PlayerAccordionList({
  groups,
  calibrationTable,
}: {
  groups: PlayerGroup[];
  calibrationTable: CalibrationTable;
}) {
  // Track which accordion is open (one at a time on mobile, native
  // <details> elements handle the actual rendering).
  const [openKey, setOpenKey] = useState<string | null>(null);
  if (groups.length === 0) {
    return (
      <div
        className="rounded-[8px] px-4 py-4 text-[13px]"
        style={{
          background: "rgba(7,11,26,0.55)",
          border: "1px solid var(--vault-border)",
          color: "var(--vault-text-mute)",
        }}
      >
        No player projections available for this game.
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {groups.map((g) => {
        const key = `${g.sport}-${g.playerName}`;
        const isOpen = openKey === key;
        return (
          <li key={key}>
            <PlayerAccordion
              group={g}
              isOpen={isOpen}
              onToggle={() => setOpenKey(isOpen ? null : key)}
              calibrationTable={calibrationTable}
            />
          </li>
        );
      })}
    </ul>
  );
}

interface PlayerAccordionProps {
  group: PlayerGroup;
  isOpen: boolean;
  onToggle: () => void;
  calibrationTable: CalibrationTable;
}

function PlayerAccordion({
  group,
  isOpen,
  onToggle,
  calibrationTable,
}: PlayerAccordionProps) {
  const top = group.topLean;
  // Apply the calibration overlay so MLB High doesn't read "Stronger
  // signal" while audit data shows the tier is inverted. Falls back to
  // the raw friendly label for sports outside the audit (e.g. future
  // NHL/IPL projections).
  const sportKey: Sport | null = top
    ? top.sport === "mlb" || top.sport === "nba"
      ? (top.sport as Sport)
      : null
    : null;
  const calibrated = top && sportKey
    ? calibratedConfidenceLabelFromTable(
        sportKey,
        top.confidence,
        calibrationTable[sportKey] ?? {},
      )
    : null;
  const confLabel = top
    ? calibrated?.label ?? confidenceLabel(top.confidence)
    : "";
  // Downgraded labels (e.g. "Calibration watch") use a muted warn
  // color so they don't read as Strong signals.
  const confColor = top
    ? calibrated?.downgraded
      ? "var(--vault-warn)"
      : top.confidence === "High"
        ? "var(--vault-success)"
        : top.confidence === "Medium"
          ? "var(--vault-gold-bright)"
          : "var(--vault-warn)"
    : "var(--vault-text-faint)";
  // Tag for tooltip / aria explanation (kept short).
  const confReason = calibrated?.reason ?? "";
  return (
    <details
      className="gtp-player-accordion"
      open={isOpen}
      onToggle={(e) => {
        if ((e.target as HTMLDetailsElement).open !== isOpen) {
          onToggle();
        }
      }}
    >
      <summary className="gtp-player-accordion-summary list-none cursor-pointer select-none">
        <div className="flex items-center gap-3 px-3 py-2.5">
          <PlayerAvatar
            playerId={group.playerId}
            playerName={group.playerName}
            team={group.team || undefined}
            sport={group.sport}
            size="sm"
          />
          <div className="flex-1 min-w-0">
            <div
              className="font-display tracking-tight truncate"
              style={{
                color: "var(--vault-text)",
                fontSize: 14,
                lineHeight: 1.15,
                fontWeight: 600,
              }}
            >
              {group.playerName}
            </div>
            {top ? (
              <div
                className="font-mono truncate"
                style={{ color: "var(--vault-text-mute)", fontSize: 11 }}
              >
                {top.side} {top.line != null ? top.line.toFixed(1) : "—"}{" "}
                {top.marketLabel}
                {top.edgePct != null
                  ? ` · ${top.edgePct > 0 ? "+" : ""}${top.edgePct.toFixed(1)}% edge`
                  : ""}
              </div>
            ) : (
              <div
                className="font-mono"
                style={{ color: "var(--vault-text-faint)", fontSize: 11 }}
              >
                No projection
              </div>
            )}
          </div>
          {confLabel && (
            <span
              className="font-mono uppercase tracking-[0.12em] shrink-0 px-2 py-1 rounded-[3px]"
              style={{
                color: confColor,
                fontSize: 9,
                border: `1px solid ${confColor}`,
              }}
              title={confReason || undefined}
            >
              {confLabel}
            </span>
          )}
          <span
            aria-hidden
            className="gtp-player-accordion-chevron font-mono shrink-0"
            style={{ color: "var(--vault-text-faint)", fontSize: 12 }}
          >
            ▾
          </span>
        </div>
      </summary>
      <div
        className="px-3 pb-3 pt-1 flex flex-col gap-2"
        style={{ borderTop: "1px solid var(--vault-rule)" }}
      >
        {/* PR `feature/projections-page-cleanup` (2026-05-28): group
            leans by (market, side, line) so per-book duplicates
            collapse into one row per stat. The 6-leans-per-player
            shape (3 markets × 2 books) now reads as 3 clean rows. */}
        {groupLeansByMarket(group.leans).map((mg, i) => (
          <PlayerMarketRow
            key={`${mg.market}-${mg.side}-${mg.line ?? "null"}-${i}`}
            group={mg}
          />
        ))}
      </div>
    </details>
  );
}

/** Render one consolidated row per (market, side, line) group. When
 *  multiple books contributed to the group, the right side shows the
 *  best-of price and a small "N books" chip. The collapsed per-book
 *  breakdown is exposed as a tiny disclosure below the row so the
 *  default expanded view stays scannable. */
function PlayerMarketRow({ group }: { group: ProjectionsMarketGroup }) {
  const edgeColor =
    group.bestEdgePct != null && group.bestEdgePct > 0
      ? "var(--vault-success)"
      : group.bestEdgePct != null && group.bestEdgePct < 0
        ? "var(--vault-warn)"
        : "var(--vault-text-faint)";
  const showBookChip = group.bookCount > 1;
  return (
    <div
      className="grid grid-cols-[1fr_1fr_1fr_72px] gap-2 items-baseline px-2 py-1.5 rounded-[5px]"
      style={{
        background: "rgba(7,11,26,0.55)",
        border: "1px solid var(--vault-rule)",
      }}
    >
      <div className="flex flex-col gap-0.5 min-w-0">
        <span
          className="font-mono uppercase tracking-[0.14em] truncate flex items-center gap-1.5"
          style={{ color: "var(--vault-text-faint)", fontSize: 9 }}
        >
          <span className="truncate">{group.marketLabel}</span>
          {showBookChip && (
            <span
              aria-label={`Best of ${group.bookCount} books`}
              title={
                group.bookmakers.length > 0
                  ? `Books: ${group.bookmakers.join(" · ")}`
                  : undefined
              }
              className="font-mono uppercase tracking-[0.10em] px-1 rounded-[3px] shrink-0"
              style={{
                color: "var(--vault-text-mute)",
                background: "rgba(0,0,0,0.30)",
                border: "1px solid var(--vault-rule)",
                fontSize: 8,
                lineHeight: 1.2,
              }}
            >
              {group.bookCount} books
            </span>
          )}
        </span>
        <span
          className="font-mono"
          style={{ color: "var(--vault-text)", fontSize: 12, fontWeight: 600 }}
        >
          {group.side}{" "}
          {group.line != null ? group.line.toFixed(1) : "—"}
        </span>
      </div>
      <ValueCell
        label="Proj."
        value={group.projection != null ? group.projection.toFixed(1) : "—"}
        tone="mute"
      />
      <ValueCell
        label="Edge"
        value={
          group.bestEdgePct != null
            ? `${group.bestEdgePct > 0 ? "+" : ""}${group.bestEdgePct.toFixed(1)}%`
            : "—"
        }
        color={edgeColor}
      />
      <div className="flex flex-col gap-0.5 min-w-0 items-end">
        <span
          className="font-mono uppercase tracking-[0.14em]"
          style={{ color: "var(--vault-text-faint)", fontSize: 9 }}
        >
          {showBookChip ? "Best odds" : "Odds"}
        </span>
        <span
          className="font-mono"
          style={{ color: "var(--vault-text-mute)", fontSize: 11 }}
        >
          {formatAmerican(group.bestOdds)}
        </span>
        {group.bestBookmaker && showBookChip && (
          <span
            className="font-mono truncate"
            style={{
              color: "var(--vault-text-faint)",
              fontSize: 9,
              lineHeight: 1.2,
            }}
            title={`Best price at ${group.bestBookmaker}`}
          >
            {_humanBook(group.bestBookmaker)}
          </span>
        )}
      </div>
      {group.recentSeries && group.recentSeries.length >= 2 && (
        <RecentSeriesSparkline
          values={group.recentSeries}
          line={group.line}
        />
      )}
    </div>
  );
}

/** Compact bookmaker display label. Mirrors the leg-row helper in
 *  parlay-ticket-card.tsx so both surfaces show "FanDuel" rather than
 *  "fanduel". Local copy keeps the projections-experience module
 *  self-contained. */
function _humanBook(book: string): string {
  const k = book.toLowerCase().trim();
  const known: Record<string, string> = {
    draftkings: "DraftKings",
    fanduel: "FanDuel",
    betmgm: "BetMGM",
    caesars: "Caesars",
    pointsbet: "PointsBet",
    bet365: "bet365",
    espnbet: "ESPN BET",
    fanatics: "Fanatics",
    hardrockbet: "Hard Rock Bet",
  };
  return known[k] ?? book.charAt(0).toUpperCase() + book.slice(1);
}


function ValueCell({
  label,
  value,
  tone = "mute",
  color,
}: {
  label: string;
  value: string;
  tone?: "mute" | "strong";
  color?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span
        className="font-mono uppercase tracking-[0.14em] truncate"
        style={{ color: "var(--vault-text-faint)", fontSize: 9 }}
      >
        {label}
      </span>
      <span
        className="font-display tabular"
        style={{
          color:
            color ??
            (tone === "strong" ? "var(--vault-text)" : "var(--vault-text-mute)"),
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function RecentSeriesSparkline({
  values,
  line,
}: {
  values: number[];
  line: number | null;
}) {
  const W = 64;
  const H = 16;
  const pad = 1;
  const min = Math.min(...values, line ?? Infinity);
  const max = Math.max(...values, line ?? -Infinity);
  const range = Math.max(max - min, 0.01);
  const xFor = (i: number) =>
    values.length === 1
      ? W / 2
      : pad + (i / (values.length - 1)) * (W - pad * 2);
  const yFor = (v: number) =>
    pad + (H - pad * 2) * (1 - (v - min) / range);
  const points = values.map((v, i) => `${xFor(i)},${yFor(v)}`).join(" ");
  const showLine = line != null && line >= min && line <= max;
  return (
    <svg
      className="col-span-4 mt-1"
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Recent form"
    >
      {showLine && (
        <line
          x1={pad}
          y1={yFor(line as number)}
          x2={W - pad}
          y2={yFor(line as number)}
          stroke="var(--vault-text-faint)"
          strokeWidth={0.5}
          strokeDasharray="2 2"
        />
      )}
      <polyline
        points={points}
        fill="none"
        stroke="var(--vault-gold-bright)"
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ============================================================================
   Helpers
============================================================================ */

function humanizeDate(date: string, today: string): string {
  try {
    const t = new Date(`${date}T12:00:00Z`);
    const p = new Date(`${today}T12:00:00Z`);
    const delta = Math.round((t.getTime() - p.getTime()) / 86400000);
    if (delta === 0) return "Today";
    if (delta === 1) return "Tomorrow";
    if (delta === -1) return "Yesterday";
    return t.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  } catch {
    return date;
  }
}

function formatTipoffEt(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(iso));
  } catch {
    return null;
  }
}

function hasAnyMarketValue(
  markets: NonNullable<ProjectionsGame["markets"]>,
): boolean {
  return Boolean(
    markets.moneyline?.home != null ||
      markets.moneyline?.away != null ||
      markets.spread?.home != null ||
      markets.spread?.away != null ||
      markets.total?.line != null,
  );
}

function formatMoneyline(
  ml: NonNullable<ProjectionsGame["markets"]>["moneyline"],
  game: ProjectionsGame,
): string {
  if (!ml) return "—";
  // Favorite first, by lowest (more negative) price.
  const a = ml.away;
  const h = ml.home;
  if (a == null && h == null) return "—";
  if (a != null && h != null) {
    const favA = a < h;
    return favA
      ? `${game.awayTeamAbbr} ${formatAmerican(a)}`
      : `${game.homeTeamAbbr} ${formatAmerican(h)}`;
  }
  return formatAmerican(a ?? h);
}

function formatMoneylineSide(price: number | null, team: string): string {
  if (price == null) return `${team} —`;
  return `${team} ${formatAmerican(price)}`;
}

function formatSpread(
  spread: NonNullable<ProjectionsGame["markets"]>["spread"],
  game: ProjectionsGame,
): string {
  if (!spread) return "—";
  // Show the favored side (negative spread).
  if (spread.home != null && spread.home < 0) {
    return `${game.homeTeamAbbr} ${spread.home.toFixed(1)}`;
  }
  if (spread.away != null && spread.away < 0) {
    return `${game.awayTeamAbbr} ${spread.away.toFixed(1)}`;
  }
  return spread.home != null
    ? `${game.homeTeamAbbr} ${spread.home > 0 ? "+" : ""}${spread.home.toFixed(1)}`
    : "—";
}

function formatSpreadSide(value: number | null, team: string): string {
  if (value == null) return `${team} —`;
  const sign = value > 0 ? "+" : "";
  return `${team} ${sign}${value.toFixed(1)}`;
}
