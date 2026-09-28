"use client";
/**
 * Simple | Analyst — one clear, unobtrusive control, the same everywhere it appears.
 *
 * NATIVE RADIOS, visually a segmented control: a fieldset with a legend, two labelled
 * <input type="radio">. That gives the right semantics with no ARIA re-implementation — arrow keys move
 * between the two, Tab enters and leaves the group, and the checked state is announced. The selected
 * option is marked by a check glyph and weight as well as colour, so it never relies on colour alone.
 */
import { useId } from "react";

import { useViewMode, type ViewMode } from "@/lib/prefs/view-mode";

const OPTIONS: Array<{ value: ViewMode; label: string; hint: string }> = [
  { value: "simple", label: "Simple", hint: "The prediction, the line and how it is tracking" },
  { value: "analyst", label: "Analyst", hint: "Adds model detail: ranges, model status and sources" },
];

export default function ViewModeToggle({ compact = false }: { compact?: boolean }) {
  const { mode, setMode } = useViewMode();
  const name = useId();
  return (
    <fieldset className="gtp-view-mode" style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
      <legend style={{ fontFamily: "var(--font-display)", fontSize: 10.5, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--vault-text-faint)", marginBottom: 6, padding: 0 }}>
        Detail level
      </legend>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, padding: 3, borderRadius: 9, border: "1px solid var(--vault-border)", background: "color-mix(in srgb, var(--vault-scrim-base) 60%, transparent)" }}>
        {OPTIONS.map((o) => {
          const on = mode === o.value;
          return (
            <label key={o.value} title={o.hint} className="gtp-view-mode-option" style={{
              position: "relative", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              minHeight: compact ? 36 : 44, padding: "0 10px", borderRadius: 7, cursor: "pointer",
              fontFamily: "var(--font-display)", fontSize: 13, fontWeight: on ? 700 : 500,
              color: on ? "var(--vault-text)" : "var(--vault-text-mute)",
              background: on ? "var(--vault-panel)" : "transparent",
              boxShadow: on ? "inset 0 0 0 1px var(--vault-border-strong)" : "none",
            }}>
              <input
                type="radio" name={name} value={o.value} checked={on}
                onChange={() => setMode(o.value)}
                className="gtp-view-mode-input"
                style={{ position: "absolute", opacity: 0, width: 1, height: 1, margin: 0 }}
              />
              <span aria-hidden="true" style={{ width: 12, textAlign: "center" }}>{on ? "✓" : ""}</span>
              <span>{o.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
