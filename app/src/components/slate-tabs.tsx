"use client";

import type { SlateDay, DataMode } from "@/lib/types";

interface Props {
  days: SlateDay[];
  selected: string;
  onChange: (date: string) => void;
}

/**
 * SlateTabs — 4-day date selector for /board.
 *
 * Phase 7B-1.1: each tab subtitle reflects the date's actual dataMode so
 * a "Today · live" badge never appears on a demo-fallback day. Demo days
 * are clearly labeled. Tabs remain clickable in all states (the page
 * body handles the per-state empty/banner rendering).
 */
export default function SlateTabs({ days, selected, onChange }: Props) {
  return (
    <div className="border-b border-[var(--border)] mb-6">
      <div className="flex gap-1 overflow-x-auto -mx-1 px-1 pb-px">
        {days.map((day) => {
          const isSelected = day.date === selected;
          const subtitle = subtitleForDay(day);
          const badge = badgeForDay(day);

          return (
            <button
              key={day.date}
              type="button"
              onClick={() => onChange(day.date)}
              className={[
                "shrink-0 px-4 py-3 text-left",
                "border-b-2 transition-colors cursor-pointer",
                "min-w-[120px]",
                isSelected
                  ? "border-[var(--lime)]"
                  : "border-transparent hover:border-[var(--border-strong)]",
              ].join(" ")}
            >
              <div className="flex items-baseline gap-2">
                <span
                  className={[
                    "font-display font-semibold text-[15px]",
                    isSelected
                      ? "text-[var(--text)]"
                      : "text-[var(--text-mute)]",
                  ].join(" ")}
                >
                  {day.dayLabel}
                </span>
                {badge && (
                  <span
                    className="font-mono text-[9px] uppercase tracking-wider"
                    style={{ color: badge.color }}
                  >
                    {badge.label}
                  </span>
                )}
              </div>
              <div
                className="mt-1 font-mono text-[10px] uppercase tracking-wider"
                style={{ color: subtitle.color }}
              >
                {subtitle.text}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Subtitle line below the day label, color-coded by dataMode.
 */
function subtitleForDay(day: SlateDay): { text: string; color: string } {
  const mode: DataMode = (day.dataMode as DataMode) || "ScheduleUnavailable";

  switch (mode) {
    case "Live":
      return {
        text: `${day.gameCount}g · ${day.leanCount}l${
          day.highConfidenceCount > 0 ? ` · ${day.highConfidenceCount} hi` : ""
        }`,
        color: "var(--text-faint)",
      };

    case "ScheduleLiveOddsUnavailable":
      // Phase 7B-2: distinguish odds-not-configured / no-props / failed
      if (day.gameCount === 0) {
        return { text: "no games", color: "var(--text-faint)" };
      }
      if (day.oddsProviderStatus === "failed") {
        return {
          text: `${day.gameCount}g · odds unavailable`,
          color: "var(--rose)",
        };
      }
      if (day.oddsProviderStatus === "ok_no_props") {
        return {
          text: `${day.gameCount}g · no props returned`,
          color: "var(--text-faint)",
        };
      }
      return {
        text: `${day.gameCount}g · props unavailable`,
        color: "var(--text-faint)",
      };

    case "NoGames":
      return { text: "no games", color: "var(--text-faint)" };

    case "ScheduleUnavailable":
      return { text: "schedule unavailable", color: "var(--rose)" };

    case "DemoForced":
      return { text: "demo · sample", color: "var(--amber)" };

    default:
      return { text: "unknown", color: "var(--rose)" };
  }
}

/**
 * Small badge next to the day label. Only shown for primary day in live mode.
 */
function badgeForDay(
  day: SlateDay,
): { label: string; color: string } | null {
  const mode: DataMode = (day.dataMode as DataMode) || "ScheduleUnavailable";
  if (!day.isPrimary) return null;

  // Only the LIVE-class modes get the lime "live" badge. Demo modes don't.
  if (mode === "Live" || mode === "ScheduleLiveOddsUnavailable") {
    return { label: "live", color: "var(--lime)" };
  }
  return null;
}
