"use client";

/**
 * BoardWithTabs — Phase 7B-6 thin shell.
 *
 * Owns ONLY selectedDate. Filter state lives entirely inside <VaultBoard>
 * which is REMOUNTED whenever the date changes (via key={selectedDate}).
 * This means each date gets a fresh, isolated set of filters with no risk
 * of cross-date contamination — and there is no inter-component sync to
 * get wrong, since filters never leave VaultBoard.
 *
 * For non-Live dataModes, renders the existing info components.
 */
import { useState } from "react";
import type { BoardData, SlateData, SlateDay, DataMode } from "@/lib/types";
import SlateTabs from "./slate-tabs";
import VaultBoard from "./vault-board";
import NoGamesToday from "./no-games-today";
import PropsUnavailable from "./props-unavailable";
import PropsComingSoon from "./props-coming-soon";
import ScheduleStrip from "./schedule-strip";
import DemoFallbackBanner from "./demo-fallback-banner";
import { formatTipoffLabel } from "@/lib/freshness";

interface Props {
  slate: SlateData;
  boardsByDate: Record<string, BoardData>;
  /** Phase 14: build-time today for SSR fallback before client hydrates. */
  buildTimeToday?: string;
}

export default function BoardWithTabs({ slate, boardsByDate, buildTimeToday }: Props) {
  const [selected, setSelected] = useState<string>(slate.primaryDate);
  const board = boardsByDate[selected] ?? boardsByDate[slate.primaryDate];
  const day =
    slate.days.find((d) => d.date === selected) ?? slate.days[0];
  const dataMode: DataMode =
    (board?.dataMode as DataMode) || "ScheduleUnavailable";

  // Find the next slate after the selected date that has games on it.
  // Surfaced inside NoGamesToday so an off-day or refresh-pending day
  // points the user forward instead of feeling like a dead end.
  const nextSlate = nextSlateWithGames(slate.days, selected);

  return (
    <>
      <SlateTabs
        days={slate.days}
        selected={selected}
        onChange={setSelected}
        buildTimeToday={buildTimeToday}
      />
      {renderBody(dataMode, board, day, selected, nextSlate)}
    </>
  );
}

function nextSlateWithGames(
  days: SlateDay[],
  selectedDate: string,
): { date: string; dayLabel: string; gameCount: number } | null {
  const future = days
    .filter((d) => d.date > selectedDate && (d.gameCount ?? 0) > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (future.length === 0) return null;
  const n = future[0];
  return { date: n.date, dayLabel: n.dayLabel, gameCount: n.gameCount };
}

function gameLabelsWithTipoffs(games: BoardData["games"]): string[] {
  return (games ?? [])
    .map((g) => {
      if (!g.awayTeamAbbr || !g.homeTeamAbbr) return null;
      const base = `${g.awayTeamAbbr} @ ${g.homeTeamAbbr}`;
      const tip = formatTipoffLabel(g.tipoff);
      return tip ? `${base} · ${tip}` : base;
    })
    .filter((s): s is string => Boolean(s));
}

function renderBody(
  dataMode: DataMode,
  board: BoardData | undefined,
  day: { date: string; dayLabel: string } | undefined,
  selectedDate: string,
  nextSlate: { date: string; dayLabel: string; gameCount: number } | null,
) {
  if (!board || !day) {
    return (
      <NoGamesToday
        date={day?.date ?? "—"}
        dayLabel={day?.dayLabel ?? "—"}
        reason="provider_failed"
        nextSlate={nextSlate}
      />
    );
  }

  switch (dataMode) {
    // ---- Live: full vault interactive board ----
    // key={selectedDate} forces a fresh VaultBoard mount on every date
    // change, which is the cleanest way to guarantee filter state never
    // bleeds across dates.
    case "Live":
      return board.leans.length > 0 ? (
        <VaultBoard key={selectedDate} board={board} />
      ) : (
        <>
          {board.games && board.games.length > 0 && (
            <div className="mb-6">
              <ScheduleStrip
                schedule={{
                  generatedAt: board.generatedAt,
                  source: board.scheduleSource ?? "live schedule",
                  isDemo: false,
                  date: board.generatedFor,
                  games: board.games,
                }}
              />
            </div>
          )}
          <PropsUnavailable
            gameCount={board.games?.length ?? 0}
            reason={propsUnavailableReason(board)}
            failureReason={board.oddsFailureReason}
          />
        </>
      );

    case "ScheduleLiveOddsUnavailable":
      // PR 17: PropsComingSoon now carries the schedule story end-to-end
      // (status pill, headline, game labels with tipoffs, CTAs). The
      // previous stack added ScheduleStrip + PropsUnavailable below, which
      // repeated the same message. Drop those — the hero is enough.
      return (
        <div className="mb-6">
          <PropsComingSoon
            gameCount={board.games?.length ?? 0}
            gameLabels={gameLabelsWithTipoffs(board.games)}
          />
        </div>
      );

    case "NoGames":
      return (
        <NoGamesToday
          date={board.generatedFor}
          dayLabel={day.dayLabel}
          reason="confirmed_empty"
          nextSlate={nextSlate}
        />
      );

    case "ScheduleUnavailable":
      return (
        <NoGamesToday
          date={board.generatedFor}
          dayLabel={day.dayLabel}
          reason="provider_failed"
          failureReason={board.scheduleFailureReason}
          nextSlate={nextSlate}
        />
      );

    case "DemoForced":
      return (
        <>
          <DemoFallbackBanner
            dataMode={dataMode}
            failureReason={board.failureReason}
          />
          {board.leans.length > 0 ? (
            <VaultBoard key={selectedDate} board={board} />
          ) : (
            board.games && board.games.length > 0 && (
              <div className="mb-6">
                <ScheduleStrip
                  schedule={{
                    generatedAt: board.generatedAt,
                    source: board.scheduleSource ?? "demo",
                    isDemo: true,
                    date: board.generatedFor,
                    games: board.games,
                  }}
                />
              </div>
            )
          )}
        </>
      );

    default:
      return (
        <NoGamesToday
          date={board.generatedFor}
          dayLabel={day.dayLabel}
          reason="provider_failed"
          nextSlate={nextSlate}
        />
      );
  }
}

function propsUnavailableReason(
  board: BoardData,
): "not_configured" | "no_props_returned" | "provider_failed" | "dry_run" {
  switch (board.oddsProviderStatus) {
    case "ok_no_props":
      return "no_props_returned";
    case "failed":
      return "provider_failed";
    case "dry_run":
      return "dry_run";
    case "not_configured":
    default:
      return "not_configured";
  }
}

