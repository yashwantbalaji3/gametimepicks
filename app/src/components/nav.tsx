"use client";

import Link from "next/link";
import { destinationsFor, NAV_GROUP_LABEL } from "@/lib/navigation";
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
/**
 * P196: the spine is DERIVED from the canonical destination list, not hand-maintained here. Three
 * surfaces each keeping their own copy is how /build ended up reachable on a phone and nowhere else.
 */
const NAV_ITEMS = destinationsFor("top").map((d, i, list) => ({
  href: d.href,
  label: d.label,
  group: d.group,
  beforeDivider: i > 0 && list[i - 1]!.group !== d.group,
}));
// The old "More Sports" directory of equal model-ish tiles stays gone. What exists instead is the
// honest schedules directory at /sports (real EPL/NFL/NBA/UFC data, "Schedule only — not modelled"
// in words) — one nav item, secondary group, beside the one live sport hub. NBA's settled archive
// stays reachable from Results; retired leagues (NHL, IPL, WNBA, MLS) still have no destinations.
// The 2026 World Cup is complete: it is NOT an active nav destination. It remains reachable only as an
// archive (from /results / methodology), never a primary nav item or an active sport. /world-cup-specials
// is a retired World-Cup-only product landing, likewise out of nav.

// Routes that light up the MLB nav item. The retired aliases (/board, /projections) redirect into the
// MLB board, so they highlight the destination they land on rather than flashing no active item.
const SPORT_RE = /^\/(mlb|board|projections)(\/|$)/;
const NFL_RE = /^\/nfl(\/|$)/;
const EPL_RE = /^\/epl(\/|$)/;
const UFC_RE = /^\/ufc(\/|$)/;
const SPORT_HREFS = new Set(["/mlb"]);

/*
 * P208: the mobile complement strip is GONE, structurally. It existed to guarantee that a top-band
 * destination missing from the bottom bar stayed reachable on a phone — and when Results + Sports
 * moved to the Menu sheet, it dutifully revived itself as a second mobile nav, which is the exact
 * two-competing-navs defect the founder reported. The guarantee it provided now lives in the Menu
 * sheet itself, which derives "the rail minus the bar" from the same canonical list — every top-band
 * destination is on the rail, so nothing can be stranded. One mobile nav, by construction.
 */

/** The four clusters, in the order a reader needs them: what's on now, which sport, which product,
 *  and how it has done. Rendered as a quiet label at each boundary. */
const GROUP_LABEL = NAV_GROUP_LABEL;

export default function Nav() {
  const pathname = usePathname() || "/";

  const isActive = (href: string) => {
    // P208: Home is a destination of its own — exact match only, or every route would light it.
    if (href === "/") return pathname === "/" || pathname === "";
    if (href === "/today") return pathname === "/today" || pathname.startsWith("/today/");
    // Parlay Lab is the canonical /picks; /parlays + /parlay-lab redirect there, so they highlight it.
    // Build = the custom paper-card builder only.
    if (href === "/build") {
      // /build now owns the suggested-card lobby, so the retired Parlay Lab aliases highlight HERE.
      // Without this they would bounce to /build with no active nav item during the redirect.
      return (
        pathname === "/build" || pathname.startsWith("/build/") ||
        pathname === "/picks" || pathname.startsWith("/picks/") ||
        pathname === "/parlays" || pathname.startsWith("/parlays/") ||
        pathname === "/parlay-lab" || pathname.startsWith("/parlay-lab/")
      );
    }
    // MLB lights up on the hub, its boards, and the retired aliases that redirect into them.
    if (href === "/mlb") return SPORT_RE.test(pathname);
    if (href === "/nfl") return NFL_RE.test(pathname);
    if (href === "/epl") return EPL_RE.test(pathname);
    if (href === "/ufc") return UFC_RE.test(pathname);
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
        background: "rgba(11, 18, 14, 0.86)",
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
                {idx > 0 && NAV_ITEMS[idx - 1]?.group !== item.group && item.group && (
                  <span className="font-mono uppercase tracking-[0.16em] select-none px-1.5" aria-hidden style={{ color: "var(--vault-text-faint)", fontSize: 8.5, alignSelf: "center" }}>
                    {GROUP_LABEL[item.group]}
                  </span>
                )}
                {item.beforeDivider && idx > 0 && (
                  <span
                    aria-hidden
                    className="mx-1.5 inline-block"
                    style={{
                      width: 4,
                      height: 4,
                      borderRadius: 999,
                      background: "var(--vault-gold-dim)",
                      boxShadow: "0 0 6px rgba(52, 211, 153, 0.30)",
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
                      ? "linear-gradient(180deg, rgba(52, 211, 153, 0.14) 0%, rgba(52, 211, 153, 0) 90%)"
                      : "transparent",
                    border: active
                      ? "1px solid rgba(52, 211, 153, 0.32)"
                      : "1px solid transparent",
                    textShadow:
                      active && isSport
                        ? "0 0 14px rgba(52, 211, 153, 0.48)"
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


      {/* Sportsbook LED rail underneath the chrome — pure presentation,
          respects prefers-reduced-motion. */}
      <SportsbookLightRail />
    </header>
  );
}
