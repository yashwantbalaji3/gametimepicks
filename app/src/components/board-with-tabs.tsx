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
import type { BoardData, SlateData, DataMode } from "@/lib/types";
import SlateTabs from "./slate-tabs";
import VaultBoard from "./vault-board";
import NoGamesToday from "./no-games-today";
import PropsUnavailable from "./props-unavailable";
import ScheduleStrip from "./schedule-strip";
import DemoFallbackBanner from "./demo-fallback-banner";

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

  return (
    <>
      <SlateTabs
        days={slate.days}
        selected={selected}
        onChange={setSelected}
        buildTimeToday={buildTimeToday}
      />
      {renderBody(dataMode, board, day, selected)}
    </>
  );
}

function renderBody(
  dataMode: DataMode,
  board: BoardData | undefined,
  day: { date: string; dayLabel: string } | undefined,
  selectedDate: string,
) {
  if (!board || !day) {
    return (
      <NoGamesToday
        date={day?.date ?? "—"}
        dayLabel={day?.dayLabel ?? "—"}
        reason="provider_failed"
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
                  source: board.scheduleSource ?? "nba_api",
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
      return (
        <>
          {board.manualOverrideUsed && (
            <ManualOverrideNotice
              source={board.manualOverrideSource}
              failureReason={board.scheduleFailureReason}
            />
          )}
          {board.games && board.games.length > 0 && (
            <div className="mb-6">
              <ScheduleStrip
                schedule={{
                  generatedAt: board.generatedAt,
                  source: board.scheduleSource ?? "nba_api",
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

    case "NoGames":
      return (
        <NoGamesToday
          date={board.generatedFor}
          dayLabel={day.dayLabel}
          reason="confirmed_empty"
        />
      );

    case "ScheduleUnavailable":
      return (
        <NoGamesToday
          date={board.generatedFor}
          dayLabel={day.dayLabel}
          reason="provider_failed"
          failureReason={board.scheduleFailureReason}
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

function ManualOverrideNotice({
  source,
  failureReason,
}: {
  source: string | null | undefined;
  failureReason: string | null | undefined;
}) {
  return (
    <div
      className="surface mb-4 px-4 py-3 border-l-2 text-[12px] font-mono"
      style={{ borderLeftColor: "var(--vault-gold)" }}
    >
      <div className="flex items-start gap-2">
        <span className="uppercase tracking-wider text-[var(--vault-gold-bright)] text-[10px] mt-0.5">
          schedule: manual verified
        </span>
      </div>
      <div className="mt-1.5 text-[12px] text-[var(--text-mute)] leading-relaxed">
        nba_api did not return games for this date — schedule loaded from
        operator-verified manual override (
        <span className="text-[var(--text)]">{source ?? "unknown"}</span>).
        {failureReason && (
          <span className="block mt-1 text-[10px] uppercase tracking-wider text-[var(--text-faint)]">
            nba_api status: {failureReason}
          </span>
        )}
      </div>
    </div>
  );
}
