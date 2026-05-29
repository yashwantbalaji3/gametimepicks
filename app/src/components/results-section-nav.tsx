/**
 * ResultsSectionNav — in-page anchor nav for the `/results` page.
 *
 * Pure presentation. Renders a horizontal row of pill anchors that
 * scroll to the existing section IDs. Lives directly under the
 * `<ResultsHero>` so users can jump to any detail without scrolling
 * past the full page.
 *
 * Honesty:
 *   - Never invents a section: the parent (`results/page.tsx`) only
 *     passes in IDs that exist on the page.
 *   - Inert section: when the link target isn't on the page (e.g.
 *     learning signals are hidden because the summary file is
 *     missing) the pill is omitted entirely; we never link to a
 *     dead anchor.
 *   - Pure anchor links — no JS handler required. Smooth scroll is
 *     enabled via CSS `scroll-behavior: smooth` on the page-level
 *     wrapper; here we just need plain `#id` hrefs.
 */
import type { ReactNode } from "react";

export interface ResultsSectionNavItem {
  /** DOM `id` on the target section header. */
  id: string;
  /** Short label rendered on the pill. */
  label: string;
  /** Optional one-line summary hint. */
  hint?: string;
}

export interface ResultsSectionNavProps {
  items: ReadonlyArray<ResultsSectionNavItem>;
}

export default function ResultsSectionNav({ items }: ResultsSectionNavProps) {
  if (!items || items.length === 0) return null;
  return (
    <nav
      aria-label="Results section navigation"
      className="overflow-x-auto"
    >
      <ul className="flex flex-wrap gap-2 list-none p-0 m-0">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              className="font-mono uppercase tracking-[0.12em] px-3 py-1.5 rounded-full inline-flex items-center gap-1 whitespace-nowrap"
              style={{
                color: "var(--vault-text-mute)",
                background: "var(--gtp-card)",
                border: "1px solid var(--vault-rule)",
                fontSize: 11,
                lineHeight: 1.2,
              }}
              title={item.hint}
            >
              <span>{item.label}</span>
              {item.hint && (
                // Hidden under sm so the long Learning-signals
                // headline ("1 confirmed · 7 tracking · 11 too small")
                // doesn't blow out the mobile pill width. Desktop
                // viewers still get the inline count.
                <span
                  className="font-mono hidden sm:inline"
                  style={{
                    color: "var(--vault-text-faint)",
                    fontSize: 10,
                  }}
                >
                  {item.hint}
                </span>
              )}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Pure helper: build a Learning Signals hint string ("1 confirmed,
 *  11 too small, 7 tracking") from the row-status counts. */
export function summarizeLearningSignalCounts(
  rows: ReadonlyArray<{ status: string }>,
): string {
  const c = { confirmed: 0, tooSmall: 0, tracking: 0, shadow: 0 };
  for (const r of rows) {
    if (r.status === "confirmed-not-consumed") c.confirmed++;
    else if (r.status === "too-small") c.tooSmall++;
    else if (r.status === "shadow-test-candidate") c.shadow++;
    else c.tracking++;
  }
  const parts: string[] = [];
  if (c.confirmed) parts.push(`${c.confirmed} confirmed`);
  if (c.shadow) parts.push(`${c.shadow} shadow`);
  if (c.tracking) parts.push(`${c.tracking} tracking`);
  if (c.tooSmall) parts.push(`${c.tooSmall} too small`);
  return parts.join(" · ");
}

/** Convenience export so the page can render an optional pre-anchor
 *  to give the rendered pill its own surface. */
export function SectionAnchor({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  return (
    <span id={id} style={{ display: "block", scrollMarginTop: 80 }}>
      {children}
    </span>
  );
}
