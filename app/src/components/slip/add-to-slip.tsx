"use client";
import { useSlip, legKey, type SlipLeg } from "@/lib/slip/slip-store";

/**
 * ADD TO SLIP — the one control that puts a leg on a reader's shortlist.
 *
 * Drop it anywhere a leg is rendered, on any sport. It owns the identity rule (legKey) so two
 * surfaces showing the same selection add the SAME leg rather than two near-duplicates that differ
 * by whitespace.
 *
 * It is a toggle, not a one-way action: the second press removes. A control that can only add
 * forces a reader to hunt for the slip to undo a misclick.
 */
export default function AddToSlip({
  leg, size = "sm",
}: {
  leg: Omit<SlipLeg, "key">;
  size?: "sm" | "md";
}) {
  const { add, remove, has, ready, legs } = useSlip();
  const key = legKey(leg);
  const inSlip = has(key);
  const full = legs.length >= 12 && !inSlip;

  const px = size === "md" ? 10 : 7;
  const fs = size === "md" ? 10.5 : 9;

  return (
    <button
      type="button"
      // Disabled until the store has read localStorage, so the label can never flash the wrong state.
      disabled={!ready || full}
      onClick={() => (inSlip ? remove(key) : add({ ...leg, key }))}
      aria-pressed={inSlip}
      aria-label={inSlip ? `Remove ${leg.player} from your slip` : `Add ${leg.player} to your slip`}
      title={full ? "Your slip is full (12 legs)" : undefined}
      className="gtp-slip-btn shrink-0 rounded-[6px] font-mono uppercase tracking-[0.1em]"
      style={{
        padding: `${size === "md" ? 5 : 3}px ${px}px`,
        fontSize: fs,
        cursor: full ? "not-allowed" : "pointer",
        opacity: !ready || full ? 0.45 : 1,
        color: inSlip ? "#06140D" : "var(--vault-text-mute)",
        background: inSlip ? "var(--gtp-bank-heat)" : "rgba(255,255,255,0.03)",
        border: `1px solid ${inSlip ? "transparent" : "var(--vault-rule)"}`,
        fontWeight: inSlip ? 700 : 500,
      }}
    >
      {inSlip ? "✓ On slip" : "+ Slip"}
    </button>
  );
}
