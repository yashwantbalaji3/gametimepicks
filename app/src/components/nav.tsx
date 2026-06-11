"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import BrandMark from "./brand-mark";
import SportsbookLightRail from "./sportsbook-light-rail";

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
const NAV_ITEMS: Array<{
  href: string;
  label: string;
  /** When true, render a faint gold divider chip BEFORE this item. */
  beforeDivider?: boolean;
}> = [
  // Product spine — clean, user-facing labels only (no implementation routes
  // like "Projections"/"Parlay Lab" in primary nav; those stay reachable as
  // routes and fold into Build/Sports active states). Brand mark links Home.
  { href: "/today", label: "Today" },
  { href: "/picks", label: "Picks" },
  { href: "/build", label: "Build" },
  { href: "/sports", label: "Sports" },
  { href: "/bank-builder", label: "Bank Builder", beforeDivider: true },
  { href: "/results", label: "Results" },
  { href: "/methodology", label: "Learn" },
  { href: "/about", label: "About" },
];

// Sport routes that should light up the "Sports" nav item.
const SPORT_RE = /^\/(sports|world-cup|mlb|nba|ufc|nhl|ipl|board|projections|trends|events)(\/|$)/;
const SPORT_HREFS = new Set(["/sports"]);

export default function Nav() {
  const pathname = usePathname() || "/";

  const isActive = (href: string) => {
    // Today owns the root/home as the default landing experience.
    if (href === "/today") return pathname === "/today" || pathname === "/" || pathname === "";
    // Build folds in the legacy /parlay-lab route (now an alias destination).
    if (href === "/build") {
      return pathname === "/build" || pathname.startsWith("/build/") || pathname === "/parlay-lab" || pathname.startsWith("/parlay-lab/") || pathname.endsWith("/parlays") || pathname.includes("/parlays/");
    }
    // Sports lights up on the directory + every sport hub/board route.
    if (href === "/sports") return SPORT_RE.test(pathname);
    // Results, but not the model-audit surface (that lives under Learn).
    if (href === "/results") return pathname === "/results" || (pathname.startsWith("/results/") && !pathname.startsWith("/results/model-audit"));
    // Learn = methodology hub + responsible-use + model audit.
    if (href === "/methodology") {
      return pathname === "/methodology" || pathname.startsWith("/methodology/") || pathname === "/responsible-use" || pathname.startsWith("/responsible-use/") || pathname === "/results/model-audit" || pathname.startsWith("/results/model-audit/");
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <header
      className="sticky top-0 z-30 backdrop-blur-xl"
      style={{
        background: "rgba(7, 11, 26, 0.86)",
        borderBottom: "1px solid var(--vault-border)",
      }}
    >
      {/* PR `feature/professional-design-system` — collapsed two-row
          nav into one row on desktop (brand-left + links-centered) so
          the sticky header is ~50px instead of 155px. Mobile still
          uses stacked rows because the brand mark needs the full
          width and the nav strip wraps. */}

      {/* Mobile (< sm): row 1 = centered brand */}
      <div className="sm:hidden px-4 pt-1.5 pb-1 flex items-center justify-center">
        <Link
          href="/"
          aria-label="GameTimePicks home"
          className="vault-glow-hover rounded-[4px] py-1 px-2 inline-flex items-center"
        >
          <BrandMark variant="compact" />
        </Link>
      </div>

      {/* Desktop (sm+): single row — brand left, links centered */}
      <div className="hidden sm:flex mx-auto max-w-[1440px] px-6 lg:px-8 py-2 items-center gap-6">
        <Link
          href="/"
          aria-label="GameTimePicks home"
          className="vault-glow-hover rounded-[4px] py-1 px-2 inline-flex items-center shrink-0"
        >
          <BrandMark variant="compact" />
        </Link>
        <nav
          aria-label="Primary (desktop)"
          className="flex-1 flex items-center justify-center gap-0 min-w-0"
        >
          {NAV_ITEMS.map((item, idx) => {
            const active = isActive(item.href);
            const isSport = SPORT_HREFS.has(item.href);
            return (
              <span key={item.href} className="inline-flex items-center">
                {item.beforeDivider && idx > 0 && (
                  <span
                    aria-hidden
                    className="mx-1.5 inline-block"
                    style={{
                      width: 4,
                      height: 4,
                      borderRadius: 999,
                      background: "var(--vault-gold-dim)",
                      boxShadow: "0 0 6px rgba(212, 175, 55, 0.30)",
                    }}
                  />
                )}
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className="relative px-3.5 py-1.5 text-[13px] font-medium tracking-tight whitespace-nowrap transition-all rounded-[6px]"
                  style={{
                    color: active
                      ? "var(--vault-gold-bright)"
                      : "var(--vault-text-mute)",
                    background: active
                      ? "linear-gradient(180deg, rgba(240, 199, 94, 0.14) 0%, rgba(240, 199, 94, 0) 90%)"
                      : "transparent",
                    border: active
                      ? "1px solid rgba(240, 199, 94, 0.32)"
                      : "1px solid transparent",
                    textShadow:
                      active && isSport
                        ? "0 0 14px rgba(240, 199, 94, 0.48)"
                        : "none",
                  }}
                >
                  {item.label}
                </Link>
              </span>
            );
          })}
        </nav>
        {/* Right spacer — keeps the nav links visually centered. */}
        <span aria-hidden className="shrink-0" style={{ width: 80 }} />
      </div>

      {/* Mobile (< sm): row 2 = horizontal-scrolling nav strip */}
      <nav
        aria-label="Primary"
        className="sm:hidden overflow-x-auto"
        style={{ borderTop: "1px solid var(--vault-rule)" }}
      >
        <div className="mx-auto px-3 py-1 flex items-center justify-start gap-0 min-w-max">
          {NAV_ITEMS.map((item, idx) => {
            const active = isActive(item.href);
            const isSport = SPORT_HREFS.has(item.href);
            return (
              <span key={item.href} className="inline-flex items-center">
                {item.beforeDivider && idx > 0 && (
                  <span
                    aria-hidden
                    className="mx-1.5 inline-block"
                    style={{
                      width: 4,
                      height: 4,
                      borderRadius: 999,
                      background: "var(--vault-gold-dim)",
                      boxShadow: "0 0 6px rgba(212, 175, 55, 0.30)",
                    }}
                  />
                )}
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className="relative px-3.5 py-2 text-[12.5px] sm:text-[13px] font-medium tracking-tight whitespace-nowrap transition-all rounded-[6px]"
                  style={{
                    color: active
                      ? "var(--vault-gold-bright)"
                      : "var(--vault-text-mute)",
                    background: active
                      ? "linear-gradient(180deg, rgba(240, 199, 94, 0.14) 0%, rgba(240, 199, 94, 0) 90%)"
                      : "transparent",
                    border: active
                      ? "1px solid rgba(240, 199, 94, 0.32)"
                      : "1px solid transparent",
                    textShadow: active && isSport
                      ? "0 0 14px rgba(240, 199, 94, 0.48)"
                      : "none",
                    boxShadow: active
                      ? "0 0 16px rgba(240, 199, 94, 0.10)"
                      : "none",
                  }}
                >
                  {item.label}
                  {active && (
                    <span
                      aria-hidden
                      className="absolute left-2 right-2 -bottom-px h-px"
                      style={{
                        background:
                          "linear-gradient(90deg, transparent, var(--vault-gold-bright), transparent)",
                        boxShadow: "0 0 8px rgba(240, 199, 94, 0.55)",
                      }}
                    />
                  )}
                </Link>
              </span>
            );
          })}
        </div>
      </nav>

      {/* Sportsbook LED rail underneath the chrome — pure presentation,
          respects prefers-reduced-motion. */}
      <SportsbookLightRail />
    </header>
  );
}
