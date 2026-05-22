"use client";

/**
 * ParlayLabExperience — game-first slip builder.
 *
 * Mirrors the four-step pattern shipped in PR #86 for /projections:
 *
 *   1. Compact header     — "Build tonight's slips · N games"
 *   2. Date pill row      — Today / Tomorrow / future dates with leans
 *   3. Game card grid     — sportsbook-style matchup cards,
 *                            with a "saved · pending" badge when
 *                            real snapshot slips exist for that game
 *   4. Game slip detail   — saved slips for the game (when present)
 *                            + risk-profile pills below for live
 *                            preview slips (NBA only — MLB builder
 *                            isn't wired yet, see step 9 of the day's
 *                            roadmap)
 *
 * Architecture:
 *   - Pure client component. Server page provides the unified
 *     projections payload (`ProjectionsPayload`) plus a precomputed
 *     `snapshotByDate` map keyed on date → ParlaySnapshot (so we
 *     never re-read the file system in the client).
 *   - URL state via search params (`?date=YYYY-MM-DD&game=<id>&risk=balanced`)
 *     so deep links + browser back/forward both work. Suspense
 *     wrapping happens on the server page.
 *   - Live preview slips are generated via the existing
 *     `buildParlayCandidates` helper using only the loaded NBA leans
 *     for the selected game. We never fabricate odds or projections.
 *
 * Honest framing locked:
 *   - "Saved · pending" badge appears only when a real snapshot file
 *     contains slips for the game.
 *   - "Live preview" tickets render with `savedPregame={false}` so
 *     the ticket card uses the "Pending final stats" badge — the same
 *     copy the snapshot flow uses pre-grading.
 *   - No combined-odds value is fabricated; missing odds render "—".
 *   - MLB games show an honest "Live preview unavailable" panel
 *     instead of inventing slips.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import TeamLogo from "./team-logo";
import ParlayTicketCard from "./parlay-ticket-card";
import { formatAmerican } from "@/lib/odds-math";

import {
  buildParlayCandidates,
  type RiskProfile,
  type ParlayCandidate,
} from "@/lib/parlay-builder";
import type {
  ProjectionsPayload,
  ProjectionsDate,
  ProjectionsGame,
} from "@/lib/data-projections";
import type {
  ParlaySlip,
  ParlaySnapshot,
} from "@/lib/data-parlays";
import type { PropLean } from "@/lib/types";

interface Props {
  /** Same payload the redesigned /projections page already builds. */
  payload: ProjectionsPayload;
  /** Snapshot (or graded) payload keyed by date. Loaded server-side. */
  snapshotsByDate: Record<
    string,
    { source: "snapshot" | "graded"; payload: ParlaySnapshot }
  >;
  /** Raw NBA leans by date, used to build live preview slips inline.
   *  We only carry the dates we actually want to show live previews
   *  for so the bundle stays small. */
  nbaLeansByDate: Record<string, PropLean[]>;
}

const RISK_PROFILES: { key: RiskProfile; label: string; sub: string }[] = [
  { key: "balanced", label: "Balanced", sub: "high + medium · ≥ 2pp" },
  { key: "aggressive", label: "Aggressive", sub: "wider edges · up to 5 legs" },
  { key: "conservative", label: "Conservative", sub: "high only · clean" },
];

export default function ParlayLabExperience({
  payload,
  snapshotsByDate,
  nbaLeansByDate,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const urlDate = searchParams.get("date");
  const urlGameId = searchParams.get("game");
  const urlRisk = (searchParams.get("risk") as RiskProfile) || "balanced";

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

  function navigate(next: {
    date?: string;
    game?: string | null;
    risk?: RiskProfile;
  }) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.date) params.set("date", next.date);
    if (next.game === null) params.delete("game");
    else if (typeof next.game === "string") params.set("game", next.game);
    if (next.risk) params.set("risk", next.risk);
    const qs = params.toString();
    router.replace(qs ? `/parlay-lab?${qs}` : "/parlay-lab", { scroll: false });
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
          No slips available right now
        </div>
        <p
          className="mt-2 text-[13.5px] leading-relaxed"
          style={{ color: "var(--vault-text-mute)" }}
        >
          When the next slate&apos;s projections land, candidate slips
          appear here automatically.
        </p>
      </section>
    );
  }

  const snapshotForDate = activeDate
    ? snapshotsByDate[activeDate.date] ?? null
    : null;

  return (
    <div className="flex flex-col gap-4">
      <Header
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
          <GameSlipDetail
            game={selectedGame}
            risk={urlRisk}
            onRiskChange={(r) => navigate({ risk: r })}
            onBack={() => navigate({ game: null })}
            nbaLeans={nbaLeansByDate[activeDate.date] ?? []}
            snapshotPayload={snapshotForDate?.payload ?? null}
            snapshotSource={snapshotForDate?.source ?? null}
          />
        ) : (
          <GameCardGrid
            games={activeDate.games}
            snapshotPayload={snapshotForDate?.payload ?? null}
            snapshotSource={snapshotForDate?.source ?? null}
            onSelect={(gameId) => navigate({ game: gameId })}
          />
        )
      ) : null}

      <FooterNote />
    </div>
  );
}

/* ============================================================================
   Header
============================================================================ */

function Header({
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
    <header className="flex flex-col gap-1.5">
      <h1
        className="font-display tracking-tight"
        style={{
          color: "var(--vault-text)",
          fontSize: "clamp(24px, 4.2vw, 36px)",
          lineHeight: 1.02,
          letterSpacing: "-0.02em",
          fontWeight: 600,
        }}
      >
        {selectedGame
          ? `${selectedGame.awayTeamAbbr} @ ${selectedGame.homeTeamAbbr}`
          : "Build tonight's slips."}
      </h1>
      <p
        className="font-mono"
        style={{ color: "var(--vault-text-mute)", fontSize: 12 }}
      >
        {selectedGame
          ? `${label} · pick a style, review the ticket.`
          : `${label} · choose a game, pick a style, review the ticket.`}
      </p>
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
  snapshotPayload,
  snapshotSource,
  onSelect,
}: {
  games: ProjectionsGame[];
  snapshotPayload: ParlaySnapshot | null;
  snapshotSource: "snapshot" | "graded" | null;
  onSelect: (gameId: string) => void;
}) {
  // Precompute slip counts per gameId so each card can show a saved-slip
  // badge in O(1) without re-walking the snapshot.
  const slipCountsByGameId = useMemo<Record<string, number>>(() => {
    const counts: Record<string, number> = {};
    if (!snapshotPayload) return counts;
    for (const slip of snapshotPayload.slips ?? []) {
      if (!slip.legs || slip.legs.length === 0) continue;
      const firstGid = slip.legs[0].gameId;
      if (!firstGid) continue;
      // Only count slips whose legs ALL share the same gameId.
      const sameGame = slip.legs.every((l) => l.gameId === firstGid);
      if (!sameGame) continue;
      counts[firstGid] = (counts[firstGid] ?? 0) + 1;
    }
    return counts;
  }, [snapshotPayload]);

  if (games.length === 0) return null;
  return (
    <section
      aria-label="Games"
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
    >
      {games.map((g) => {
        const slipCount = slipCountsByGameId[g.gameId] ?? 0;
        return (
          <ParlayMatchupCard
            key={`${g.sport}-${g.gameId}`}
            game={g}
            savedSlipCount={slipCount}
            source={snapshotSource}
            onSelect={() => onSelect(g.gameId)}
          />
        );
      })}
    </section>
  );
}

function ParlayMatchupCard({
  game,
  savedSlipCount,
  source,
  onSelect,
}: {
  game: ProjectionsGame;
  savedSlipCount: number;
  source: "snapshot" | "graded" | null;
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

      <div
        className="mt-3 pt-2 flex items-center justify-between font-mono"
        style={{
          borderTop: "1px solid var(--vault-rule)",
          fontSize: 11,
        }}
      >
        {savedSlipCount > 0 ? (
          <span
            className="inline-flex items-center gap-1"
            style={{
              color:
                source === "graded"
                  ? "var(--vault-success)"
                  : "var(--vault-warn)",
            }}
          >
            <span
              aria-hidden
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{
                background:
                  source === "graded"
                    ? "var(--vault-success)"
                    : "var(--vault-warn)",
              }}
            />
            {source === "graded" ? "Graded" : "Saved"} ·{" "}
            {savedSlipCount} slip{savedSlipCount === 1 ? "" : "s"}
          </span>
        ) : (
          <span style={{ color: "var(--vault-text-mute)" }}>
            {game.projectionCount} projection
            {game.projectionCount === 1 ? "" : "s"}
          </span>
        )}
        <span style={{ color: "var(--vault-gold-bright)" }}>Open →</span>
      </div>
    </button>
  );
}

/* ============================================================================
   Game slip detail
============================================================================ */

function GameSlipDetail({
  game,
  risk,
  onRiskChange,
  onBack,
  nbaLeans,
  snapshotPayload,
  snapshotSource,
}: {
  game: ProjectionsGame;
  risk: RiskProfile;
  onRiskChange: (risk: RiskProfile) => void;
  onBack: () => void;
  nbaLeans: PropLean[];
  snapshotPayload: ParlaySnapshot | null;
  snapshotSource: "snapshot" | "graded" | null;
}) {
  const tipoff = formatTipoffEt(game.tipoffIso);

  // Saved slips for this game (snapshot or graded).
  const savedSlips: ParlaySlip[] = useMemo(() => {
    if (!snapshotPayload) return [];
    return (snapshotPayload.slips ?? []).filter((slip) => {
      if (!slip.legs || slip.legs.length === 0) return false;
      return slip.legs.every((l) => l.gameId === game.gameId);
    });
  }, [snapshotPayload, game.gameId]);

  // Live preview slips — generated from the NBA leans for this game.
  // Skipped when sport is MLB because the builder doesn't yet emit
  // MLB candidates (honest gap, not a fake fallback).
  const previewCandidates: ParlayCandidate[] = useMemo(() => {
    if (game.sport !== "nba") return [];
    const gameLeans = nbaLeans.filter((l) => l.gameId === game.gameId);
    if (gameLeans.length === 0) return [];
    return buildParlayCandidates(gameLeans, {
      mode: "top_props",
      riskProfile: risk,
      numCandidates: 4,
      includeBenchPlayers: true,
    });
  }, [game.sport, game.gameId, nbaLeans, risk]);

  // Convert ParlayCandidate (legs are LegAnalysis) into the ParlaySlip
  // shape the shared ticket card consumes. Live previews carry a
  // synthetic slip id derived from leg-keys so React keys stay stable.
  const previewSlips: ParlaySlip[] = useMemo(
    () =>
      previewCandidates.map((c, i) => candidateToPreviewSlip(c, game.gameId, i)),
    [previewCandidates, game.gameId],
  );

  return (
    <section
      aria-label={`${game.awayTeamAbbr} at ${game.homeTeamAbbr} slip detail`}
      className="flex flex-col gap-4"
    >
      <button
        type="button"
        onClick={onBack}
        className="self-start inline-flex items-center gap-1 font-mono uppercase tracking-[0.14em]"
        style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}
      >
        ← All games
      </button>

      {/* Game hero — compact version of the projections hero. */}
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
                fontSize: "clamp(20px, 3.6vw, 28px)",
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
      </div>

      {/* Saved slips — render first when present. */}
      {savedSlips.length > 0 && (
        <div className="flex flex-col gap-3">
          <SectionEyebrow
            label={
              snapshotSource === "graded"
                ? "Saved · graded"
                : "Saved · pending final stats"
            }
            tone={snapshotSource === "graded" ? "success" : "warn"}
            cta={{ href: "/results/parlays", label: "Full history" }}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {savedSlips.map((slip) => (
              <ParlayTicketCard
                key={slip.slipId}
                slip={slip}
                savedPregame={snapshotSource === "snapshot"}
              />
            ))}
          </div>
        </div>
      )}

      {/* Risk profile pills — drive the live preview generator. */}
      <div className="flex flex-col gap-3">
        <SectionEyebrow label="Live preview · pick a style" />
        <div className="flex flex-wrap gap-2">
          {RISK_PROFILES.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => onRiskChange(p.key)}
              className="gtp-projections-date-pill"
              data-active={risk === p.key ? "true" : "false"}
              aria-pressed={risk === p.key}
            >
              <span className="block font-mono uppercase tracking-[0.14em] text-[10px] leading-none">
                {p.label}
              </span>
              <span
                className="block text-[10px] leading-tight mt-1"
                style={{
                  color: risk === p.key ? "inherit" : "var(--vault-text-faint)",
                }}
              >
                {p.sub}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Live preview slips. */}
      {game.sport === "nba" ? (
        previewSlips.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {previewSlips.map((slip) => (
              <ParlayTicketCard key={slip.slipId} slip={slip} />
            ))}
          </div>
        ) : (
          <EmptyPreviewPanel />
        )
      ) : (
        <MlbPreviewPendingPanel />
      )}
    </section>
  );
}

function SectionEyebrow({
  label,
  tone,
  cta,
}: {
  label: string;
  tone?: "success" | "warn" | "default";
  cta?: { href: string; label: string };
}) {
  const color =
    tone === "success"
      ? "var(--vault-success)"
      : tone === "warn"
        ? "var(--vault-warn)"
        : "var(--vault-gold)";
  return (
    <div className="flex items-center gap-3">
      <span
        className="font-mono uppercase tracking-[0.18em]"
        style={{ color, fontSize: 10 }}
      >
        {label}
      </span>
      <div className="flex-1 h-px" style={{ background: "var(--vault-rule)" }} />
      {cta && (
        <Link
          href={cta.href}
          className="font-mono uppercase tracking-[0.14em] shrink-0"
          style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}
        >
          {cta.label} →
        </Link>
      )}
    </div>
  );
}

function EmptyPreviewPanel() {
  return (
    <div
      className="rounded-[8px] px-4 py-4 text-[13px]"
      style={{
        background: "rgba(7,11,26,0.55)",
        border: "1px solid var(--vault-border)",
        color: "var(--vault-text-mute)",
      }}
    >
      <div
        className="font-mono uppercase tracking-[0.14em] mb-1"
        style={{ color: "var(--vault-gold)", fontSize: 10 }}
      >
        No eligible slips for this selection
      </div>
      <p style={{ lineHeight: 1.55 }}>
        Try a different risk style above, or open another game from the
        date row.
      </p>
    </div>
  );
}

function MlbPreviewPendingPanel() {
  return (
    <div
      className="rounded-[8px] px-4 py-4 text-[13px]"
      style={{
        background: "rgba(7,11,26,0.55)",
        border: "1px solid var(--vault-border)",
        color: "var(--vault-text-mute)",
      }}
    >
      <div
        className="font-mono uppercase tracking-[0.14em] mb-1"
        style={{ color: "var(--vault-gold)", fontSize: 10 }}
      >
        MLB live preview pending
      </div>
      <p style={{ lineHeight: 1.55 }}>
        Live MLB slip preview requires builder correlation rules and
        grading joins for MLB props. When that ships, MLB matchup cards
        will surface saved + preview tickets here too.
      </p>
    </div>
  );
}

function FooterNote() {
  return (
    <p
      className="mt-2 text-[11px] leading-relaxed"
      style={{ color: "var(--vault-text-faint)" }}
    >
      Saved slips are captured before tipoff. Graded only after final
      stats — pushes excluded, pending never counts as a loss.
      Educational analytics — not betting advice.
    </p>
  );
}

/* ============================================================================
   Preview → ParlaySlip adaptor
============================================================================ */

function candidateToPreviewSlip(
  candidate: ParlayCandidate,
  gameId: string,
  index: number,
): ParlaySlip {
  return {
    slipId: `preview-${gameId}-${candidate.riskProfile}-${index}`,
    riskProfile: candidate.riskProfile,
    sport: "nba",
    status: "pending",
    legs: candidate.legs.map((leg) => {
      const m = leg.matchedLean;
      const side = m?.lean ?? leg.leg.side ?? "";
      return {
        sport: "nba",
        gameId,
        gameDate: m?.date ?? "",
        playerId: m?.playerId ?? null,
        playerName: m?.playerName ?? leg.leg.rawPlayerName ?? "—",
        team: m?.team ?? null,
        opponent: m?.opponent ?? null,
        market: m?.market ?? leg.leg.market ?? "",
        side,
        line: typeof m?.line === "number" ? m.line : null,
        projection:
          typeof m?.projection === "number" ? m.projection : null,
        edgePct: typeof m?.edgePct === "number" ? m.edgePct : null,
        confidence: m?.confidence ?? null,
        bookmaker: m?.bookmaker ?? null,
        oddsForSide:
          side === "Over"
            ? (m?.oddsOver ?? null)
            : side === "Under"
              ? (m?.oddsUnder ?? null)
              : null,
        riskFlags: m?.riskFlags,
      };
    }),
    score: candidate.score,
    sameGame: candidate.hasSameGameLegs,
    hasAnomalyLeg: candidate.hasAnomalyLegs,
  };
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

// (re-exported only so the linter sees the import used; preview tickets
// rely on `formatAmerican` indirectly via `ParlayTicketCard`.)
void formatAmerican;
