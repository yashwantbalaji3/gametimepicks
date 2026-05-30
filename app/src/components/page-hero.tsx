/**
 * PageHero — the single, shared top-of-page header.
 *
 * Before this component, every route hand-rolled its own header:
 *   - Bank Builder & Events → bespoke `<header>` (eyebrow + gold H1 + sub)
 *   - About → `<SectionHeader>` (eyebrow + plain title + sub)
 *   - Home → bespoke gold-gradient hero
 *
 * That made every page's top fold look like a different product. This
 * component captures the one pattern so static, non-dashboard pages
 * (Bank Builder, Events, About, …) share an identical hero. Pages with
 * specialised, data-driven headers (Results → `ResultsHero`,
 * Projections → `DateStatusHeader`) keep theirs — those carry live
 * record/date state that a generic hero can't.
 *
 * Server component. No client state, renders cleanly into the static
 * export. Honesty: no copy is injected here — every string is supplied
 * by the caller, so there is nothing promotional baked in.
 */
import type { ReactNode } from "react";

export interface PageHeroProps {
  /** Mono uppercase kicker above the title (e.g. "Schedule hub"). */
  eyebrow: string;
  /** The H1. One per page. */
  title: string;
  /** Optional supporting paragraph under the title. */
  sub?: ReactNode;
  /** Max width (px) for the sub paragraph. Default 640. */
  subMaxWidth?: number;
  /** Optional trailing slot rendered after the sub (e.g. a chip). */
  children?: ReactNode;
}

export default function PageHero({
  eyebrow,
  title,
  sub,
  subMaxWidth = 640,
  children,
}: PageHeroProps) {
  return (
    <header className="flex flex-col gap-3">
      <span
        className="font-mono uppercase tracking-[0.18em]"
        style={{ color: "var(--vault-text-faint)", fontSize: 11 }}
      >
        {eyebrow}
      </span>
      <h1
        className="font-semibold tracking-tight"
        style={{
          color: "var(--vault-gold-bright)",
          fontSize: 30,
          lineHeight: 1.05,
        }}
      >
        {title}
      </h1>
      {sub != null && (
        <p
          className="text-[14px] leading-relaxed"
          style={{ color: "var(--vault-text-mute)", maxWidth: subMaxWidth }}
        >
          {sub}
        </p>
      )}
      {children}
    </header>
  );
}
