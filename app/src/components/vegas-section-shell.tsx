/**
 * VegasSectionShell — composed wrapper for a section that should read as
 * a "panel on a sportsbook wall" rather than free-floating text.
 *
 * Renders:
 *   - top gold rule line (decorative)
 *   - eyebrow row: small gold pulsing dot + uppercase mono kicker +
 *     optional action link
 *   - main heading
 *   - optional sub-line
 *   - children
 *
 * Pure presentation. Server component. No logic, no data shape coupling.
 */
import type { ReactNode } from "react";

interface Props {
  eyebrow: string;
  heading: ReactNode;
  sub?: ReactNode;
  /** Optional right-aligned action slot. Caller renders the Link/button. */
  action?: ReactNode;
  /** When true, hides the eyebrow pulsing dot. Use for non-live sections. */
  staticDot?: boolean;
  children: ReactNode;
  className?: string;
}

export default function VegasSectionShell({
  eyebrow,
  heading,
  sub,
  action,
  staticDot,
  children,
  className,
}: Props) {
  return (
    <section className={`gtp-vegas-shell ${className ?? ""}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-5">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className={`inline-block w-1.5 h-1.5 rounded-full ${staticDot ? "" : "gtp-neon-pulse"}`}
            style={{
              background: "var(--vault-gold-bright)",
              boxShadow: staticDot
                ? "none"
                : "0 0 8px rgba(240, 199, 94, 0.55)",
            }}
          />
          <span
            className="font-mono text-[10px] uppercase tracking-[0.18em]"
            style={{ color: "var(--vault-gold)" }}
          >
            {eyebrow}
          </span>
        </div>
        {action ? (
          <div className="flex items-center text-[12px]">{action}</div>
        ) : null}
      </div>
      <h2
        className="vault-display-h3"
        style={{ color: "var(--vault-text)" }}
      >
        {heading}
      </h2>
      {sub ? (
        <p
          className="mt-2 text-[14px] leading-relaxed max-w-2xl"
          style={{ color: "var(--vault-text-mute)" }}
        >
          {sub}
        </p>
      ) : null}
      <div className="mt-6">{children}</div>
    </section>
  );
}
