"use client";

import { useState } from "react";
import type { SlateDay } from "@/lib/types";

interface Props {
  days: SlateDay[];
  selected: string;
  onChange: (date: string) => void;
}

/**
 * SlateTabs — 4-day date selector for /board.
 * Today is selected by default. Unavailable days are still visible but
 * styled as disabled with a small "—" label.
 */
export default function SlateTabs({ days, selected, onChange }: Props) {
  return (
    <div className="border-b border-[var(--border)] mb-6">
      <div className="flex gap-1 overflow-x-auto -mx-1 px-1 pb-px">
        {days.map((day) => {
          const isSelected = day.date === selected;
          const isAvailable = day.isAvailable;
          const isToday = day.dayLabel === "Today";

          return (
            <button
              key={day.date}
              type="button"
              onClick={() => onChange(day.date)}
              disabled={!isAvailable}
              className={[
                "shrink-0 px-4 py-3 text-left",
                "border-b-2 transition-colors",
                "min-w-[120px]",
                isSelected
                  ? "border-[var(--lime)]"
                  : isAvailable
                  ? "border-transparent hover:border-[var(--border-strong)]"
                  : "border-transparent",
                isAvailable
                  ? "cursor-pointer"
                  : "cursor-not-allowed opacity-40",
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
                {isToday && (
                  <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--lime)]">
                    live
                  </span>
                )}
              </div>
              <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-[var(--text-faint)]">
                {!isAvailable ? (
                  <span>— not generated</span>
                ) : day.gameCount === 0 ? (
                  <span>no games</span>
                ) : (
                  <span>
                    {day.gameCount}g · {day.leanCount}l
                    {day.highConfidenceCount > 0 && (
                      <span className="text-[var(--lime)]">
                        {" · "}
                        {day.highConfidenceCount} hi
                      </span>
                    )}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
