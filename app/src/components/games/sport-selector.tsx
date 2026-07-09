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
      {/* SPORT TABS — the FIRST action: larger sport tiles with icon + name + games/sim-ready counts + an
          honest state chip. The active sport is elevated with an ember spine; unavailable sports stay
          muted-but-readable. Horizontal-scroll on mobile, no clipped text. */}
      <div
        role="tablist"
        aria-label="Choose a sport to simulate"
        className="flex items-stretch gap-2.5 overflow-x-auto pb-1.5 -mx-1 px-1"
        data-testid="sport-selector"
      >
        {sports.map((s) => {
          const on = s.key === active;
          const chip = toneChip(s.tone, on);
          const live = s.tone === "active" || s.tone === "available";
          return (
            <button
              key={s.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setActive(s.key)}
              className="gtp-pressable relative flex flex-col gap-2 rounded-[14px] px-4 py-3 text-left transition-colors shrink-0"
              style={{
                minWidth: 132,
                minHeight: 76,
                background: on
                  ? "radial-gradient(120% 130% at 0% 0%, rgba(242,54,69,0.12) 0%, transparent 60%), var(--vault-panel-elevated)"
                  : "var(--vault-panel)",
                border: `1px solid ${on ? "var(--vault-gold-bright)" : "var(--vault-border)"}`,
                boxShadow: on ? "0 10px 30px -18px rgba(242,54,69,0.6)" : "none",
                opacity: on || live ? 1 : 0.82,
              }}
            >
              {/* active spine — a clear "selected" marker on the tile's left edge. */}
              {on ? (
                <span aria-hidden className="absolute left-0 top-2.5 bottom-2.5 rounded-full" style={{ width: 3, background: "var(--vault-gold-bright)" }} />
              ) : null}
              <span className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="inline-flex items-center justify-center rounded-[9px] shrink-0"
                  style={{ width: 30, height: 30, fontSize: 16, background: on ? "rgba(242,54,69,0.14)" : "rgba(10,10,11,0.5)", border: `1px solid ${on ? "color-mix(in srgb, var(--vault-gold-bright) 40%, transparent)" : "var(--vault-rule)"}` }}
                >
                  {s.icon}
                </span>
                <span className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 14.5, fontWeight: 800, letterSpacing: "-0.01em" }}>{s.label}</span>
              </span>
              <span className="flex items-center gap-1.5 flex-wrap">
                <span
                  className="font-mono uppercase tracking-[0.08em] rounded-full px-2 py-0.5"
                  style={{ ...chip, fontSize: 9, fontWeight: 700 }}
                >
                  {s.stateLabel}
                </span>
                <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>
                  {s.gameCount} game{s.gameCount === 1 ? "" : "s"}
                  {s.simReadyCount > 0 ? <span style={{ color: "var(--gtp-success-on-dark, #7ee2a8)" }}> · {s.simReadyCount} ready</span> : ""}
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
