/**
 * EventSpotlight — the top-of-homepage banner for the current major event (driven by a SpotlightEvent
 * from lib/home/spotlight-event). Reusable across sports; UFC 329 is the first live implementation.
 * Server-renderable (no hooks). Original CSS/SVG only — no brand logos, no photos. Mobile-first, and
 * compact enough to be visible above the fold on desktop.
 */
import Link from "next/link";
import type { SpotlightEvent } from "@/lib/home/spotlight-event";

export default function EventSpotlight({ event }: { event: SpotlightEvent | null | undefined }) {
  if (!event) return null;
  const statusLabel = event.status === "final" ? "Result review" : event.status === "live" ? "Live now" : "Upcoming";
  return (
    <section
      className="relative overflow-hidden rounded-[16px] px-5 py-5 sm:px-8 sm:py-6"
      style={{ border: "1px solid var(--vault-border-strong)", background: "radial-gradient(120% 160% at 100% 0%, rgba(242,54,69,0.16) 0%, transparent 55%), linear-gradient(150deg, rgba(18,12,10,0.96) 0%, rgba(26,16,11,0.98) 100%)" }}
      aria-label={`${event.title} — ${event.trustLabel}`}
    >
      {/* Subtle cage/grid texture — original vector art, no brand assets. */}
      <svg aria-hidden viewBox="0 0 400 120" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" style={{ opacity: 0.14 }}>
        <defs>
          <pattern id="spotlight-grid" width="20" height="20" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <path d="M0 0H20V20" fill="none" stroke="var(--vault-gold-bright)" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="400" height="120" fill="url(#spotlight-grid)" />
      </svg>

      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono uppercase tracking-[0.14em]" style={{ background: "rgba(46,160,102,0.16)", border: "1px solid rgba(46,160,102,0.42)", color: "var(--gtp-success-on-dark, #7ee2a8)", fontSize: 9 }}>
              <span aria-hidden>▶</span> {statusLabel}
            </span>
            <span className="font-mono uppercase tracking-[0.16em]" style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}>{event.sport} · event spotlight</span>
          </div>
          <h2 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: "clamp(20px,3.6vw,28px)", fontWeight: 800, lineHeight: 1.06 }}>{event.title}</h2>
          <p style={{ color: "var(--vault-text-mute)", fontSize: 13.5, lineHeight: 1.4, maxWidth: 560 }}>{event.subtitle}</p>
          <div className="flex flex-wrap gap-1.5">
            {event.chips.map((c, i) => (
              <span key={i} className="rounded-full px-2.5 py-1 font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-mute)", background: "rgba(26,16,11,0.6)", border: "1px solid var(--vault-rule)", fontSize: 8.5 }}>{c}</span>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:items-end">
          <Link href={event.cta.href} className="gtp-cta-lava vault-press inline-flex items-center justify-center rounded-full px-5 font-mono uppercase tracking-[0.12em]" style={{ fontSize: 12, fontWeight: 700, textDecoration: "none", minHeight: 46 }}>
            {event.cta.label} →
          </Link>
          {event.secondaryCta ? (
            <Link href={event.secondaryCta.href} className="vault-press inline-flex items-center justify-center rounded-full px-4 font-mono uppercase tracking-[0.12em]" style={{ border: "1px solid var(--vault-rule)", color: "var(--vault-text-mute)", fontSize: 11, textDecoration: "none", minHeight: 40 }}>
              {event.secondaryCta.label}
            </Link>
          ) : null}
          <span className="font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>{event.trustLabel}</span>
        </div>
      </div>
    </section>
  );
}
