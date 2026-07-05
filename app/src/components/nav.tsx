"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import BrandMark from "./brand-mark";
import SportsbookLightRail from "./sportsbook-light-rail";
import { MOBILE_NAV_ITEMS } from "@/lib/nav-active-route";

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
  // PRIMARY — the clean user-facing spine (Home = brand mark, left). Lead with the product story.
  // "Track Record" opens the polished trust center (/mr-dub: money path + bankroll calendar + receipts);
  // the older parlay-hit-rate dashboard at /results stays reachable below as "Results".
  { href: "/today", label: "Today's Picks" },
  { href: "/bank-builder", label: "Bank Builder" },
  { href: "/mr-dub", label: "Track Record" },
  { href: "/world-cup", label: "World Cup" },
  // MLB is a flagship sport hub (daily board + props) — it was reachable only from the desktop rail,
  // leaving mobile users no nav path to /mlb (a 3-click-rule violation). Primary, next to World Cup.
  { href: "/mlb", label: "MLB" },
  { href: "/learn", label: "How It Works" },
  // SECONDARY — still reachable, de-emphasized after the divider (no routes removed).
  { href: "/moonshot", label: "Moonshot", beforeDivider: true },
  { href: "/world-cup-specials", label: "WC Specials" },
  { href: "/games", label: "Games" },
  { href: "/picks", label: "Parlay Lab" },
  { href: "/results", label: "Results" },
];

// Sport routes that should light up the "Sports" nav item.
const SPORT_RE = /^\/(sports|world-cup-specials|world-cup|mlb|nba|ufc|nhl|ipl|board|projections|trends|events)(\/|$)/;
const SPORT_HREFS = new Set(["/sports"]);

// The mobile bottom nav already carries the 8 core product routes. To keep the mobile TOP strip
// COMPLEMENTARY (not a duplicate of the bottom bar), it shows only the items the bottom nav lacks —
// Results · Sports · Learn. Desktop still renders the full NAV_ITEMS spine.
const BOTTOM_NAV_HREFS = new Set(MOBILE_NAV_ITEMS.map((i) => i.href));
const MOBILE_TOP_ITEMS = NAV_ITEMS.filter((i) => !BOTTOM_NAV_HREFS.has(i.href));

export default function Nav() {
  const pathname = usePathname() || "/";

  const isActive = (href: string) => {
    // Today owns the root/home as the default landing experience.
    if (href === "/today") return pathname === "/today" || pathname === "/" || pathname === "";
    // Parlay Lab is the canonical /picks; /parlays + /parlay-lab redirect there, so they highlight it.
    if (href === "/picks") {
      return pathname === "/picks" || pathname.startsWith("/picks/") ||
        pathname === "/parlays" || pathname.startsWith("/parlays/") ||
        pathname === "/parlay-lab" || pathname.startsWith("/parlay-lab/");
    }
    // Build = the custom paper-card builder only.
    if (href === "/build") {
      return pathname === "/build" || pathname.startsWith("/build/");
    }
    // Sports lights up on the directory + every sport hub/board route.
    if (href === "/sports") return SPORT_RE.test(pathname);
    // Results, but not the model-audit surface (that lives under Learn).
    if (href === "/results") return pathname === "/results" || (pathname.startsWith("/results/") && !pathname.startsWith("/results/model-audit"));
    // Learn = the education hub + methodology + responsible-use + model audit.
    if (href === "/learn") {
      return pathname === "/learn" || pathname.startsWith("/learn/") || pathname === "/methodology" || pathname.startsWith("/methodology/") || pathname === "/responsible-use" || pathname.startsWith("/responsible-use/") || pathname === "/results/model-audit" || pathname.startsWith("/results/model-audit/");
    }
    return pathname === href || pathname.startsWith(`${href}/`);
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
                      boxShadow: "0 0 6px rgba(242, 54, 69, 0.30)",
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
                      ? "linear-gradient(180deg, rgba(242, 54, 69, 0.14) 0%, rgba(242, 54, 69, 0) 90%)"
                      : "transparent",
                    border: active
                      ? "1px solid rgba(242, 54, 69, 0.32)"
                      : "1px solid transparent",
                    textShadow:
                      active && isSport
                        ? "0 0 14px rgba(242, 54, 69, 0.48)"
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
        <div className="mx-auto px-3 py-1 flex items-center justify-start gap-1 min-w-max">
          {MOBILE_TOP_ITEMS.map((item, idx) => {
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
                      boxShadow: "0 0 6px rgba(242, 54, 69, 0.30)",
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
                      ? "linear-gradient(180deg, rgba(242, 54, 69, 0.14) 0%, rgba(242, 54, 69, 0) 90%)"
                      : "transparent",
                    border: active
                      ? "1px solid rgba(242, 54, 69, 0.32)"
                      : "1px solid transparent",
                    textShadow: active && isSport
                      ? "0 0 14px rgba(242, 54, 69, 0.48)"
                      : "none",
                    boxShadow: active
                      ? "0 0 16px rgba(242, 54, 69, 0.10)"
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
                        boxShadow: "0 0 8px rgba(242, 54, 69, 0.55)",
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
