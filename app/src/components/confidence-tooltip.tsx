"use client";

/**
 * ConfidenceTooltip — phrasing-content-safe rebuild for viewer readiness.
 *
 * The previous version of this component rendered <div>, <ul>, <li>,
 * and <p> elements inside a <span> that lived inside a <p> (in the
 * /board hero subtitle). HTML spec only allows phrasing content
 * inside <p>, so the browser auto-closed the outer <p> at the first
 * block-level descendant — which produced a React hydration mismatch
 * and a red runtime error indicator on localhost.
 *
 * This rebuild keeps the same visual + accessibility behavior using
 * ONLY phrasing-content elements:
 *   - <button> as the visible "i" badge (focusable, keyboard-friendly)
 *   - <span role="tooltip"> for the popover container
 *   - <span role="list"> / <span role="listitem"> for the tier list
 *     (preserves list semantics for screen readers)
 *
 * The popover's block-like layout is achieved with className "block"
 * (display: block) — that's a CSS effect, not a tag-name change.
 *
 * Behavior:
 *   - Hover or keyboard-focus the badge → popover reveals
 *   - All ARIA roles preserved
 *   - prefers-reduced-motion still honored (no transitions added here)
 *   - Pure CSS state via group-hover / group-focus-within
 *   - Zero JavaScript state (no useState, no portals)
 */
export default function ConfidenceTooltip() {
  return (
    <span className="relative inline-flex group align-baseline">
      {/* The visible info badge — using <button> so it's keyboard-focusable,
          which makes group-focus-within work for keyboard users. */}
      <button
        type="button"
        className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full font-mono text-[10px] font-semibold cursor-help focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-0"
        style={{
          color: "var(--vault-gold)",
          background: "var(--vault-gold-dim)",
          border: "1px solid var(--vault-border-strong)",
          padding: 0,
          lineHeight: 1,
        }}
        aria-label="Show confidence tier explanations"
      >
        i
      </button>

      {/* Popover — pure phrasing content. block layout via className "block". */}
      <span
        role="tooltip"
        className="invisible group-hover:visible group-focus-within:visible absolute z-10 left-1/2 -translate-x-1/2 mt-5 p-3 rounded-[3px] w-[280px] text-left pointer-events-none"
        style={{
          background: "var(--vault-panel-elevated)",
          border: "1px solid var(--vault-border-strong)",
          color: "var(--vault-text-mute)",
          boxShadow: "0 4px 14px rgba(0, 0, 0, 0.4)",
        }}
      >
        <span
          className="block font-mono text-[10px] uppercase tracking-[0.18em] mb-2"
          style={{ color: "var(--vault-gold)" }}
        >
          confidence tiers
        </span>

        <span
          role="list"
          className="block font-mono text-[11px] leading-[1.55] space-y-1"
        >
          <span role="listitem" className="block">
            <span style={{ color: "var(--vault-text-mute)" }}>Category A</span>{" "}
            — model and market differed by 5pp or more · settled 49.3%
          </span>
          <span role="listitem" className="block">
            <span style={{ color: "var(--vault-text-mute)" }}>Category B</span>{" "}
            — differed by 2.5–5pp · settled 50.6%
          </span>
          <span role="listitem" className="block">
            <span style={{ color: "var(--vault-text-mute)" }}>Category C</span>{" "}
            — differed by under 2.5pp or anomaly-flagged · settled 51.7%
          </span>
          <span role="listitem" className="block">
            <span style={{ color: "var(--vault-text-faint)" }}>no data</span>{" "}
            — recent logs unavailable
          </span>
          <span role="listitem" className="block">
            <span style={{ color: "var(--vault-text-faint)" }}>pass</span>{" "}
            — model declines below threshold
          </span>
        </span>

        <span
          className="block mt-2 font-mono text-[10px] leading-[1.55]"
          style={{ color: "var(--vault-text-faint)" }}
        >
          Educational only — not betting advice.
        </span>
      </span>
    </span>
  );
}
