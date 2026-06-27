"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import BrandMark from "./brand-mark";
import SportsbookLightRail from "./sportsbook-light-rail";
import { MOBILE_NAV_ITEMS, resolveMobileNavBucket } from "@/lib/nav-active-route";

/**
 * Primary site header.
 *
 * Layout:
 *   Row 1 — centered GameTimePicks brand lockup (larger on desktop).
 *   Row 2 — nav strip. Sport links lead, product links follow, with a
 *           gold divider chip in between so the hierarchy reads at a
 *           glance. Horizontally scrollable on mobile.
 *
 * Centered logo + below-nav layout was chosen for casino/sportsbook
 * feel — the lockup is the focal point. Sport tabs (Overview · Model
 * Board · Power Board · Parlays · Results) live INSIDE each sport
 * section, not here.
 */
// v1 spine — the five primary destinations, the SAME shared source as the rail + bottom nav.
const NAV_ITEMS: Array<{ href: string; label: string }> = MOBILE_NAV_ITEMS.map((i) => ({ href: i.href, label: i.label }));

export default function Nav() {
  const pathname = usePathname() || "/";
  const activeBucket = resolveMobileNavBucket(pathname);
  // An item is active when the current route folds into the item's bucket.
  const isActive = (href: string) => {
    const b = resolveMobileNavBucket(href);
    return b != null && b === activeBucket;
  };

  return (
    <header
      className="sticky top-0 z-30 backdrop-blur-xl"
      style={{
        background: "rgba(26, 16, 11, 0.86)",
        borderBottom: "1px solid var(--vault-border)",
      }}
    >
      {/* PR `feature/professional-design-system` — collapsed two-row
          nav into one row on desktop (brand-left + links-centered) so
          the sticky header is ~50px instead of 155px. Mobile still
          uses stacked rows because the brand mark needs the full
          width and the nav strip wraps. */}

      {/* Mobile (< sm): row 1 = centered brand, shown big */}
      <div className="sm:hidden px-4 pt-2 pb-1.5 flex items-center justify-center">
        <Link
          href="/"
          aria-label="GameTimePicks home"
          className="vault-glow-hover rounded-[6px] py-1 px-2 inline-flex items-center"
        >
          <BrandMark variant="hero" />
        </Link>
      </div>

      {/* Desktop (sm+): single row — brand left, links centered */}
      <div className="hidden sm:flex mx-auto max-w-[1440px] px-6 lg:px-8 py-2 items-center gap-6">
        <Link
          href="/"
          aria-label="GameTimePicks home"
          className="vault-glow-hover rounded-[4px] py-1 px-2 inline-flex items-center shrink-0"
        >
          <BrandMark variant="lockup" />
        </Link>
        <nav
          aria-label="Primary (desktop)"
          className="flex-1 flex items-center justify-start lg:justify-center gap-0 min-w-0 overflow-x-auto"
        >
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className="relative px-3.5 py-1.5 text-[13px] font-medium tracking-tight whitespace-nowrap transition-all rounded-[6px]"
                style={{
                  color: active ? "var(--vault-gold-bright)" : "var(--vault-text-mute)",
                  background: active
                    ? "linear-gradient(180deg, rgba(242, 54, 69, 0.14) 0%, rgba(242, 54, 69, 0) 90%)"
                    : "transparent",
                  border: active ? "1px solid rgba(242, 54, 69, 0.32)" : "1px solid transparent",
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        {/* Right spacer — keeps the nav links visually centered. */}
        <span aria-hidden className="shrink-0" style={{ width: 80 }} />
      </div>

      {/* Mobile primary nav lives in the bottom bar (MobileBottomNav) — the five destinations are one tap
          away there, so the old top overflow strip is gone (it duplicated the bottom bar). */}

      {/* Sportsbook LED rail underneath the chrome — pure presentation,
          respects prefers-reduced-motion. */}
      <SportsbookLightRail />
    </header>
  );
}
