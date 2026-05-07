"use client";

/**
 * ConfidenceTooltip — Phase 8.
 *
 * Vault-themed inline help that explains what each confidence tier
 * means. Positioned as a small "i" badge that the user can hover or
 * tap to reveal the explanation. CSS-only; no JavaScript state.
 *
 * Used in the /board hero and inside the methodology copy.
 */
export default function ConfidenceTooltip() {
  return (
    <span className="relative inline-flex group cursor-help align-baseline">
      <span
        className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full font-mono text-[9px] font-semibold cursor-help"
        style={{
          color: "var(--vault-gold)",
          background: "var(--vault-gold-dim)",
          border: "1px solid var(--vault-border-strong)",
        }}
        aria-label="confidence tier explanations"
      >
        i
      </span>

      <span
        className="invisible group-hover:visible group-focus-within:visible absolute z-10 left-1/2 -translate-x-1/2 mt-5 p-3 rounded-[3px] w-[280px] text-left pointer-events-none"
        style={{
          background: "var(--vault-panel-elevated)",
          border: "1px solid var(--vault-border-strong)",
          color: "var(--vault-text-mute)",
          boxShadow: "0 4px 14px rgba(0, 0, 0, 0.4)",
        }}
        role="tooltip"
      >
        <div
          className="font-mono text-[9px] uppercase tracking-[0.18em] mb-2"
          style={{ color: "var(--vault-gold)" }}
        >
          confidence tiers
        </div>
        <ul className="font-mono text-[11px] leading-[1.55] space-y-1">
          <li>
            <span style={{ color: "var(--vault-gold-bright)" }}>High</span>{" "}
            — strong edge, strong recent log
          </li>
          <li>
            <span style={{ color: "var(--vault-warn)" }}>Medium</span> —
            some edge, mixed evidence
          </li>
          <li>
            <span style={{ color: "var(--vault-text-mute)" }}>Low</span>{" "}
            — small edge, soft signal
          </li>
          <li>
            <span style={{ color: "var(--vault-text-faint)" }}>no data</span>{" "}
            — recent logs unavailable
          </li>
          <li>
            <span style={{ color: "var(--vault-text-faint)" }}>pass</span>{" "}
            — model declines below threshold
          </li>
        </ul>
        <p
          className="mt-2 font-mono text-[9px] leading-[1.55]"
          style={{ color: "var(--vault-text-faint)" }}
        >
          Educational only — not betting advice.
        </p>
      </span>
    </span>
  );
}
