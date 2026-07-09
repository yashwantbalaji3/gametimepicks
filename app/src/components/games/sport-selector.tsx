"use client";
/**
 * SportSelector — the simulate lobby's SPORT-FIRST front door (FreeSim-style: sport → game → Generate).
 *
 * A prominent row of sport tabs (Today · MLB · World Cup · NBA · NHL · UFC), each showing an honest STATE
 * and real counts, that FILTERS the all-games grid below to the chosen sport ("Today" shows all). Tab
 * state is the only thing client-side here — every state/count/note is DERIVED SERVER-SIDE from the same
 * real data the lobby already computes and passed in as `sports`; this component never fetches, reads fs,
 * or fabricates availability. Static-export compatible (no fs, no fetch, no per-user state beyond tabs).
 *
 * Honesty: a sport is only "active" when its board/sim artifacts genuinely exist; World Cup is flagged
 * "no simulation artifact" (soccer sims are not faked); off-season / provider-pending / no-current-card
 * states surface verbatim. When a selected sport has no simulation-ready games, an honest note shows —
 * never a fake sim module.
 */
import { useMemo, useState } from "react";

import GamesExperience, { type GameRow } from "@/components/games-experience";
import { getSportIdentity } from "@/lib/sport-identity";

/** Honest per-sport availability tone (drives the chip color + label). */
export type SportStateTone = "active" | "available" | "off_season" | "provider_pending" | "conditional";

/**
 * One sport tab, fully derived server-side from real per-sport data.
 *
 * `key` is "today" (the cross-sport view), a GameRow["sport"] value, or "nhl" — NHL has no provider
 * wired into the lobby, so no GameRow ever carries sport "nhl"; selecting that tab simply yields an
 * empty filtered grid + the honest provider-pending note (never fabricated availability).
 */
export interface SportState {
  key: "today" | "nhl" | GameRow["sport"];
  /** Display label, e.g. "World Cup". */
  label: string;
  /** Decorative glyph. */
  icon: string;
  /** Honest availability tone. */
  tone: SportStateTone;
  /** Short honest state word shown under the label, e.g. "active" / "off-season". */
  stateLabel: string;
  /** Real number of games listed for this sport (0 when none). */
  gameCount: number;
  /** Real number of simulation-ready games for this sport (0 when the sport has no sim artifact). */
  simReadyCount: number;
  /** An honest note shown when this tab is selected but has no simulation-ready games (e.g. the soccer note). */
  note?: string;
}

/** Chip palette per honest tone. */
function toneChip(tone: SportStateTone, selected: boolean): { color: string; background: string; border: string } {
  const base = (() => {
    switch (tone) {
      case "active":
        return { color: "var(--gtp-success-on-dark, #7ee2a8)", accent: "rgba(46,160,102,0.4)", fill: "rgba(46,160,102,0.14)" };
      case "available":
        return { color: "var(--vault-gold-bright)", accent: "color-mix(in srgb, var(--vault-gold-bright) 42%, transparent)", fill: "var(--vault-gold-dim)" };
      default:
        return { color: "var(--vault-text-mute)", accent: "var(--vault-rule)", fill: "rgba(255,255,255,0.03)" };
    }
  })();
  return {
    color: base.color,
    background: selected ? base.fill : "rgba(255,255,255,0.02)",
    border: `1px solid ${selected ? base.accent : "var(--vault-rule)"}`,
  };
}

export default function SportSelector({ sports, rows }: { sports: SportState[]; rows: GameRow[] }) {
  const [active, setActive] = useState<SportState["key"]>("today");
  const selected = useMemo(() => sports.find((s) => s.key === active) ?? sports[0], [sports, active]);
  const filtered = useMemo(
    // Compare as strings so an NHL tab (no GameRow ever has sport "nhl") yields an empty grid cleanly.
    () => (active === "today" ? rows : rows.filter((r) => (r.sport as string) === active)),
    [rows, active],
  );

  return (
    <div className="flex flex-col gap-4">
      {/* SPORT TABS — sport-first entry, honest state + counts on each. */}
      <div
        role="tablist"
        aria-label="Choose a sport to simulate"
        className="flex items-stretch gap-2 overflow-x-auto pb-1 -mx-1 px-1"
        data-testid="sport-selector"
      >
        {sports.map((s) => {
          const on = s.key === active;
          const chip = toneChip(s.tone, on);
          return (
            <button
              key={s.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setActive(s.key)}
              className="gtp-pressable flex flex-col gap-1 rounded-[12px] px-3.5 py-2.5 text-left transition-colors shrink-0"
              style={{
                minWidth: 104,
                minHeight: 44,
                background: on ? "var(--vault-panel-elevated)" : "var(--vault-panel)",
                border: `1px solid ${on ? "var(--vault-border-strong)" : "var(--vault-border)"}`,
                boxShadow: on ? "var(--vault-shadow-soft)" : "none",
              }}
            >
              <span className="flex items-center gap-1.5">
                <span aria-hidden style={{ fontSize: 15 }}>{s.icon}</span>
                <span className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 13, fontWeight: 700 }}>{s.label}</span>
              </span>
              <span className="flex items-center gap-1.5 flex-wrap">
                <span
                  className="font-mono uppercase tracking-[0.08em] rounded-full px-1.5 py-0.5"
                  style={{ ...chip, fontSize: 8.5, fontWeight: 700 }}
                >
                  {s.stateLabel}
                </span>
                <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
                  {s.gameCount} game{s.gameCount === 1 ? "" : "s"}
                  {s.simReadyCount > 0 ? ` · ${s.simReadyCount} ready` : ""}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Honest per-sport note when the selected sport carries NO simulation-ready games (never a fake sim). */}
      {selected && selected.simReadyCount === 0 && selected.note ? (
        <div
          data-testid="sport-selector-note"
          className="rounded-[10px] px-4 py-3 flex items-start gap-2.5"
          style={{ background: "rgba(15,10,7,0.5)", border: "1px dashed var(--vault-border-strong)" }}
        >
          <span aria-hidden style={{ fontSize: 13, lineHeight: 1.2 }}>ⓘ</span>
          <span className="text-[12px] leading-snug" style={{ color: "var(--vault-text-mute)" }}>{selected.note}</span>
        </div>
      ) : null}

      {/* The all-games grid, filtered to the chosen sport. GamesExperience keeps its own internal chips
          for further scanning; the selector above is the primary sport-first control. */}
      <GamesExperience games={filtered} />
    </div>
  );
}
