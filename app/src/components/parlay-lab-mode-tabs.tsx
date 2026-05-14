"use client";

/**
 * Phase 17 — ParlayLabModeTabs.
 *
 * Container that switches between the two Parlay Lab modes:
 *   - "build"    → ParlayBuilderClient — model-assisted builder
 *   - "analyze"  → ParlayLabClient — paste-and-analyze
 *
 * Both modes receive the active-slate metadata so the Build mode can
 * default to the current/upcoming date instead of the stale primary,
 * and so each mode can clearly label archived dates as such.
 *
 * Pure client component. No fetches.
 */
import { useState } from "react";
import type { PropLean, ScheduleGame } from "@/lib/types";
import type { ActiveSlateKind } from "@/lib/active-slate";
import ParlayLabClient from "./parlay-lab-client";
import ParlayBuilderClient from "./parlay-builder-client";

type LabMode = "build" | "analyze";

interface DateOption {
  date: string;
  label: string;
  isArchived: boolean;
  isActiveDefault: boolean;
}

interface Props {
  allLeans: PropLean[];
  datesAvailable: DateOption[];
  activeSlateKind: ActiveSlateKind;
  activeDate: string | null;
  gamesByGameId: Record<string, ScheduleGame>;
}

export default function ParlayLabModeTabs({
  allLeans,
  datesAvailable,
  activeSlateKind,
  activeDate,
  gamesByGameId,
}: Props) {
  const [mode, setMode] = useState<LabMode>("build");

  return (
    <div>
      <div
        className="flex gap-2 mb-6 border-b"
        style={{ borderColor: "var(--vault-border)" }}
      >
        <ModeTab
          active={mode === "build"}
          label="Build with model"
          subtitle="Generate candidate parlays from real slate leans"
          onClick={() => setMode("build")}
        />
        <ModeTab
          active={mode === "analyze"}
          label="Analyze slip"
          subtitle="Paste a slip and compare each leg to the model"
          onClick={() => setMode("analyze")}
        />
      </div>

      {mode === "build" ? (
        <ParlayBuilderClient
          allLeans={allLeans}
          datesAvailable={datesAvailable}
          activeSlateKind={activeSlateKind}
          activeDate={activeDate}
          gamesByGameId={gamesByGameId}
        />
      ) : (
        <ParlayLabClient
          allLeans={allLeans}
          datesAvailable={datesAvailable.map((d) => ({
            date: d.date,
            label: d.label,
          }))}
        />
      )}
    </div>
  );
}

function ModeTab({
  active,
  label,
  subtitle,
  onClick,
}: {
  active: boolean;
  label: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 sm:flex-initial text-left px-4 sm:px-5 py-3 transition-all ${
        active ? "vault-tab-active" : ""
      }`}
      style={{
        borderBottom: `2px solid ${
          active ? "var(--vault-gold)" : "transparent"
        }`,
        marginBottom: "-1px",
        minWidth: "180px",
      }}
    >
      <div
        className="font-display text-[14px] sm:text-[15px] font-semibold tracking-tight"
        style={{
          color: active ? "var(--vault-text)" : "var(--vault-text-mute)",
        }}
      >
        {label}
      </div>
      <div
        className="text-[11px] mt-0.5 leading-snug"
        style={{ color: "var(--vault-text-faint)" }}
      >
        {subtitle}
      </div>
    </button>
  );
}
