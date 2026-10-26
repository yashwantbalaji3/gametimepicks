/**
 * The "Degraded inputs" label and its one-sentence reason (lib/mlb/full-game/degraded-note.mjs), for the /mlb hub card and
 * the MLB Game Simulation. Not a control: a label and plain text. No hooks, so a server or client tree can render it.
 *
 * Contrast (AA, on --vault-panel #0F1512): label --vault-warn #F0C75E, text --vault-text-mute #B4BEB8 — pinned in
 * degraded-note.test.mjs from globals.css.
 */
type Note = { label: string; reason: string; refusal: string; suggestions: string };

export default function MlbDegradedInputs({ note, compact = false, showLabel = true }: { note: Note; compact?: boolean; showLabel?: boolean }) {
  return (
    <div data-mlb-degraded-inputs="" className={compact ? "mt-1.5" : ""} style={{ display: "grid", gap: 4 }}>
      {showLabel ? (
        <span
          className="font-mono uppercase tracking-[0.1em] rounded-full px-2.5 py-0.5"
          style={{ justifySelf: "start", fontSize: 9.5, fontWeight: 700, color: "var(--vault-warn)", border: "1px solid color-mix(in srgb, var(--vault-warn) 45%, transparent)" }}
        >
          {note.label}
        </span>
      ) : null}
      <p style={{ margin: 0, fontSize: compact ? 11.5 : 12.5, lineHeight: 1.5, color: "var(--vault-text-mute)" }}>
        {note.reason}{" "}
        {compact ? note.suggestions.replace(/^It is not/, "Not") : <>{note.refusal} {note.suggestions}</>}
      </p>
    </div>
  );
}
