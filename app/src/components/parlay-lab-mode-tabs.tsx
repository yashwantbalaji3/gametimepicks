"use client";

/**
 * Phase 16 — ParlayLabModeTabs.
 *
 * Container that switches between the two Parlay Lab modes:
 *   - "build"    → ParlayBuilderClient (Phase 16) — model-assisted builder
 *   - "analyze"  → ParlayLabClient (Phase 12) — paste-and-analyze
 *
 * The user lands on "build" by default because that's where the new
 * value lives. They can switch to "analyze" to compare a slip they've
 * already built on a sportsbook.
 *
 * Pure client component. No fetches.
 */
import { useState } from "react";
import type { PropLean } from "@/lib/types";
import ParlayLabClient from "./parlay-lab-client";
import ParlayBuilderClient from "./parlay-builder-client";

type LabMode = "build" | "analyze";

interface DateOption {
  date: string;
  label: string;
}

interface Props {
  allLeans: PropLean[];
  datesAvailable: DateOption[];
}

export default function ParlayLabModeTabs({ allLeans, datesAvailable }: Props) {
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
        />
      ) : (
        <ParlayLabClient
          allLeans={allLeans}
          datesAvailable={datesAvailable}
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
        className="font-mono text-[10px] uppercase tracking-[0.15em] mt-0.5"
        style={{ color: "var(--vault-text-faint)" }}
      >
        {subtitle}
      </div>
    </button>
  );
}
