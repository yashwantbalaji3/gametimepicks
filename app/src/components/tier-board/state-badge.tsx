import { tierState } from "@/lib/products/tier-board/view.mjs";

/* ONE badge for the five tier-board states (qualified · model-only · blocked · insufficient · historical). Each state
   has a glyph as well as a colour, so the state never rests on colour alone. */
const TONE: Record<string, string> = {
  success: "var(--vault-success)",
  info: "var(--vault-info)",
  danger: "var(--vault-danger)",
  warn: "var(--vault-warn)",
  mute: "var(--vault-text-mute)",
};

export default function StateBadge({ state, size = "md" }: { state: string; size?: "sm" | "md" }) {
  const s = tierState(state);
  const c = TONE[s.tone] ?? TONE.mute;
  return (
    <span
      className="tb-state-badge"
      data-tier-state={s.label}
      style={{ color: c, borderColor: `color-mix(in srgb, ${c} 45%, transparent)`, background: `color-mix(in srgb, ${c} 10%, transparent)`, fontSize: size === "sm" ? 10.5 : 11.5 }}
    >
      <span aria-hidden>{s.glyph}</span>
      {s.label}
    </span>
  );
}
