"use client";

/**
 * BoardWithTabs — client wrapper that holds the selected-date state and
 * routes between five render states based on the board's `dataMode`.
 *
 *   Live                            real schedule + real odds → BoardClient
 *   ScheduleLiveOddsUnavailable     real schedule (nba_api OR manual override),
 *                                    no odds key → ScheduleStrip + PropsUnavailable
 *   NoGames                         provider explicitly confirmed empty →
 *                                    NoGamesToday with reason="confirmed_empty"
 *   ScheduleUnavailable             provider failed AND no manual override →
 *                                    NoGamesToday with reason="provider_failed"
 *   DemoForced                      explicit demo opt-in →
 *                                    DemoFallbackBanner + ScheduleStrip + cards
 *
 * Demo prop cards are NEVER rendered without the demo banner above them.
 */
import { useState } from "react";
import type { BoardData, SlateData, DataMode } from "@/lib/types";
import SlateTabs from "./slate-tabs";
import BoardClient from "./board-client";
import NoGamesToday from "./no-games-today";
import PropsUnavailable from "./props-unavailable";
import ScheduleStrip from "./schedule-strip";
import DemoFallbackBanner from "./demo-fallback-banner";

interface Props {
  slate: SlateData;
  boardsByDate: Record<string, BoardData>;
}

export default function BoardWithTabs({ slate, boardsByDate }: Props) {
  const [selected, setSelected] = useState<string>(slate.primaryDate);
  const day = slate.days.find((d) => d.date === selected) ?? slate.days[0];
  const board = boardsByDate[selected];
  const dataMode: DataMode =
    (board?.dataMode as DataMode) || "ScheduleUnavailable";

  return (
    <>
      <SlateTabs
        days={slate.days}
        selected={selected}
        onChange={setSelected}
      />
      {renderBody(dataMode, board, day)}
    </>
  );
}

function renderBody(
  dataMode: DataMode,
  board: BoardData | undefined,
  day: { date: string; dayLabel: string } | undefined,
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
    // ----------------------------------------------------------------
    // Real schedule, no odds — show real games, render the right
    // PropsUnavailable variant based on oddsProviderStatus
    // ----------------------------------------------------------------
    case "ScheduleLiveOddsUnavailable":
      return (
        <>
          {/* Manual-override notice */}
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

    // ----------------------------------------------------------------
    // Real schedule + real odds — full board (Phase 7B-2)
    // ----------------------------------------------------------------
    case "Live":
      return (
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
          {board.leans.length > 0 ? (
            <BoardClient leans={board.leans} />
          ) : (
            <PropsUnavailable
              gameCount={board.games?.length ?? 0}
              reason={propsUnavailableReason(board)}
              failureReason={board.oddsFailureReason}
            />
          )}
        </>
      );

    // ----------------------------------------------------------------
    // No games — provider explicitly confirmed empty
    // ----------------------------------------------------------------
    case "NoGames":
      return (
        <NoGamesToday
          date={board.generatedFor}
          dayLabel={day.dayLabel}
          reason="confirmed_empty"
        />
      );

    // ----------------------------------------------------------------
    // Schedule unavailable — provider failed, no override
    // ----------------------------------------------------------------
    case "ScheduleUnavailable":
      return (
        <NoGamesToday
          date={board.generatedFor}
          dayLabel={day.dayLabel}
          reason="provider_failed"
          failureReason={board.scheduleFailureReason}
        />
      );

    // ----------------------------------------------------------------
    // DemoForced — banner first, then demo content
    // ----------------------------------------------------------------
    case "DemoForced":
      return (
        <>
          <DemoFallbackBanner
            dataMode={dataMode}
            failureReason={board.failureReason}
          />
          {board.games && board.games.length > 0 && (
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
          )}
          {board.leans.length > 0 && (
            <>
              <DemoSampleHeading />
              <BoardClient leans={board.leans} />
            </>
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
      style={{ borderLeftColor: "var(--lime)" }}
    >
      <div className="flex items-start gap-2">
        <span className="uppercase tracking-wider text-[var(--lime)] text-[10px] mt-0.5">
          schedule: manual verified
        </span>
      </div>
      <div className="mt-1.5 text-[12px] text-[var(--text-mute)] leading-relaxed">
        nba_api did not return games for this date — schedule loaded from
        operator-verified manual override (<span className="text-[var(--text)]">{source ?? "unknown"}</span>).
        {failureReason && (
          <span className="block mt-1 text-[10px] uppercase tracking-wider text-[var(--text-faint)]">
            nba_api status: {failureReason}
          </span>
        )}
      </div>
    </div>
  );
}

function DemoSampleHeading() {
  return (
    <div className="flex items-baseline gap-2 mt-2 mb-3">
      <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--amber)] px-2 py-0.5 rounded-[2px] bg-[var(--amber-dim)]">
        demo sample
      </span>
      <span className="font-mono text-[11px] uppercase tracking-wider text-[var(--text-faint)]">
        representative cards · not tonight&apos;s real props
      </span>
    </div>
  );
}

/**
 * Map a board's oddsProviderStatus to the PropsUnavailable reason variant.
 * Distinguishes:
 *   not_configured        → "props unavailable — odds provider not configured"
 *   ok_no_props           → "no player props returned for this slate"
 *   failed                → "odds provider unavailable" (with error detail)
 *   dry_run               → "dry-run mode — odds fetches skipped" (Phase 7B-3)
 */
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
