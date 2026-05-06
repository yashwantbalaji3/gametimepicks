"use client";

import type { SlateDay, DataMode } from "@/lib/types";

interface Props {
  days: SlateDay[];
  selected: string;
  onChange: (date: string) => void;
}

/**
 * SlateTabs — vault-themed date selector for /board.
 *
 * Phase 7B-7: re-themed from lime to gold to match the rest of the
 * Gametime Vault palette. Active tab gets a gold underline + glow,
 * inactive tabs use vault text-mute, dataMode-specific subtitles
 * use vault success/warn/danger tokens.
 *
 * Behavior is unchanged: controlled component, parent owns selectedDate,
 * clicking a tab dispatches onChange(date).
 */
export default function SlateTabs({ days, selected, onChange }: Props) {
  return (
    <div
      className="vault-tabs mb-5 -mx-2 px-2"
      style={{ borderBottom: "1px solid var(--vault-border)" }}
    >
      <div className="flex gap-0 overflow-x-auto pb-px scrollbar-thin">
        {days.map((day) => {
          const isSelected = day.date === selected;
          const subtitle = subtitleForDay(day);
          const badge = badgeForDay(day);

          return (
            <button
              key={day.date}
              type="button"
              onClick={() => onChange(day.date)}
              aria-pressed={isSelected}
              className="shrink-0 px-4 sm:px-5 py-3 text-left transition-all duration-150 cursor-pointer"
              style={{
                borderBottom: `2px solid ${
                  isSelected ? "var(--vault-gold)" : "transparent"
                }`,
                marginBottom: "-1px",
                minWidth: "104px",
                boxShadow: isSelected
                  ? "0 4px 14px -8px var(--vault-gold-glow)"
                  : "none",
              }}
            >
              <div className="flex items-baseline gap-2">
                <span
                  className="font-display font-semibold text-[15px] tracking-tight"
                  style={{
                    color: isSelected
                      ? "var(--vault-gold-bright)"
                      : "var(--vault-text-mute)",
                  }}
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
 * Phase 7B-7: re-mapped to vault tokens.
 */
function subtitleForDay(day: SlateDay): { text: string; color: string } {
  const mode: DataMode = (day.dataMode as DataMode) || "ScheduleUnavailable";

  switch (mode) {
    case "Live":
      return {
        text: `${day.gameCount}g · ${day.leanCount}l${
          day.highConfidenceCount > 0 ? ` · ${day.highConfidenceCount} hi` : ""
        }`,
        color: "var(--vault-text-faint)",
      };

    case "ScheduleLiveOddsUnavailable":
      if (day.gameCount === 0) {
        return { text: "no games", color: "var(--vault-text-faint)" };
      }
      if (day.oddsProviderStatus === "failed") {
        return {
          text: `${day.gameCount}g · odds unavailable`,
          color: "var(--vault-danger)",
        };
      }
      if (day.oddsProviderStatus === "ok_no_props") {
        return {
          text: `${day.gameCount}g · no props returned`,
          color: "var(--vault-text-faint)",
        };
      }
      return {
        text: `${day.gameCount}g · props unavailable`,
        color: "var(--vault-text-faint)",
      };

    case "NoGames":
      return { text: "no games", color: "var(--vault-text-faint)" };

    case "ScheduleUnavailable":
      return { text: "schedule unavailable", color: "var(--vault-danger)" };

    case "DemoForced":
      return { text: "demo · sample", color: "var(--vault-warn)" };

    default:
      return { text: "unknown", color: "var(--vault-danger)" };
  }
}

/**
 * Small badge next to the day label — only on the primary day in live modes.
 */
function badgeForDay(
  day: SlateDay,
): { label: string; color: string } | null {
  const mode: DataMode = (day.dataMode as DataMode) || "ScheduleUnavailable";
  if (!day.isPrimary) return null;

  if (mode === "Live" || mode === "ScheduleLiveOddsUnavailable") {
    return { label: "live", color: "var(--vault-success)" };
  }
  return null;
}
