"use client";

/**
 * CommandRail — production left-rail navigation (desktop lg+).
 *
 * Promotes the "Command Center" structure into production: a persistent
 * vertical rail replaces the horizontal top nav on desktop, grouped by
 * section so the hierarchy reads at a glance. On mobile the rail is hidden
 * and the existing top `Nav` strip + `MobileBottomNav` apply unchanged.
 *
 * Uses the brand gold/vault theme and mirrors the production nav's
 * active-route logic (including legacy sport/parlay/about routes) so the
 * highlighted item matches the top nav exactly. No data/logic changes.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import BrandMark from "./brand-mark";

// PR `feat/home-rail-path-cards` (2026-06-01) — the rail now reads in
// plain, action-oriented language organised around the five clear user
// paths, and splits the former single "Parlay Lab" entry into its two
// real modes via the hash deep-links shipped in PR #223. `parlayMode`
// marks the two Parlay Lab hash entries so the active-highlight can tell
// them apart (pathname alone can't — both live on /parlay-lab).
type RailItem = {
  href: string;
  label: string;
  glyph: string;
  group?: string;
  parlayMode?: "suggested" | "build";
};

const ITEMS: RailItem[] = [
  { href: "/", label: "Home", glyph: "▤", group: "Overview" },
  { href: "/projections", label: "Straight Bets", glyph: "◷", group: "Today's picks" },
  { href: "/parlay-lab/#suggested", label: "Suggested Parlays", glyph: "⊞", parlayMode: "suggested" },
  { href: "/parlay-lab/#build", label: "Build a Parlay", glyph: "✎", parlayMode: "build" },
  { href: "/bank-builder", label: "Bank Builder", glyph: "▰" },
  { href: "/results", label: "Results", glyph: "✓", group: "Track record" },
  { href: "/events", label: "Events", glyph: "◇", group: "More" },
  { href: "/about", label: "About", glyph: "ⓘ" },
];

/** True for the Parlay Lab route and the legacy parlay entry points the
 *  production nav also treats as Parlay Lab. */
function isParlayPath(pathname: string): boolean {
  return (
    pathname === "/parlay-lab" ||
    pathname.startsWith("/parlay-lab/") ||
    pathname.endsWith("/parlays") ||
    pathname.includes("/parlays/") ||
    pathname === "/results/parlays" ||
    pathname.startsWith("/results/parlays/")
  );
}

/** Current URL hash (normalized, no leading '#'). Re-reads on hashchange
 *  AND on pathname change, since a cross-route Link to `/parlay-lab/#build`
 *  changes the path (not just the hash) and so won't fire `hashchange`. */
function useCurrentHash(): string {
  const pathname = usePathname() || "/";
  const [hash, setHash] = useState("");
  useEffect(() => {
    const read = () =>
      setHash((window.location.hash || "").replace(/^#/, "").trim().toLowerCase());
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, [pathname]);
  return hash;
}

function useIsActive() {
  const pathname = usePathname() || "/";
  const hash = useCurrentHash();
  // Mirrors components/nav.tsx isActive so the rail highlight matches the
  // top nav on every route, including legacy entry points.
  return (item: RailItem): boolean => {
    const { href, parlayMode } = item;
    if (parlayMode) {
      if (!isParlayPath(pathname)) return false;
      // "Build a Parlay" only lights up on #build; "Suggested Parlays" is
      // the canonical Parlay Lab entry, so it owns every other hash
      // (no hash, #suggested, #bankroll, or an unknown/legacy value).
      return parlayMode === "build" ? hash === "build" : hash !== "build";
    }
    if (href === "/") return pathname === "/" || pathname === "";
    if (href === "/projections") {
      return (
        pathname === "/projections" ||
        pathname.startsWith("/projections/") ||
        pathname === "/nba" || pathname.startsWith("/nba/") ||
        pathname === "/board" || pathname.startsWith("/board/") ||
        pathname === "/mlb" || pathname.startsWith("/mlb/") ||
        pathname === "/nhl" || pathname.startsWith("/nhl/") ||
        pathname === "/ipl" || pathname.startsWith("/ipl/") ||
        pathname === "/world-cup" || pathname.startsWith("/world-cup/")
      );
    }
    if (href === "/about") {
      return (
        pathname === "/about" || pathname.startsWith("/about/") ||
        pathname === "/methodology" || pathname.startsWith("/methodology/") ||
        pathname === "/responsible-use" || pathname.startsWith("/responsible-use/") ||
        pathname === "/results/model-audit" || pathname.startsWith("/results/model-audit/")
      );
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  };
}

export default function CommandRail() {
  const isActive = useIsActive();
  const pathname = usePathname() || "/";

  // When a Parlay Lab hash item is clicked while already ON Parlay Lab,
  // a Next.js <Link> updates the URL via the history API, which does NOT
  // fire `hashchange` — so the page's mode and this rail's highlight would
  // go stale. Set `location.hash` directly in that case (fires hashchange,
  // which both surfaces already listen for). Cross-route clicks fall
  // through to Link's normal SPA navigation, where the destination reads
  // the hash on mount.
  const onParlayItemClick = (
    item: RailItem,
    e: React.MouseEvent<HTMLAnchorElement>,
  ) => {
    if (!item.parlayMode || !isParlayPath(pathname)) return;
    e.preventDefault();
    if (window.location.hash.replace(/^#/, "") !== item.parlayMode) {
      window.location.hash = item.parlayMode;
    }
  };

  return (
    <aside
      aria-label="Primary"
      className="gtp-command-rail hidden lg:flex fixed inset-y-0 left-0 z-30 flex-col"
      style={{
        width: "var(--gtp-rail-w, 232px)",
        background: "rgba(7, 11, 26, 0.94)",
        borderRight: "1px solid var(--vault-border)",
        backdropFilter: "blur(12px)",
      }}
    >
      <Link
        href="/"
        aria-label="GameTimePicks home"
        className="px-5 py-5 inline-flex items-center vault-glow-hover rounded-[6px] mx-2 mt-2"
      >
        <BrandMark variant="compact" />
      </Link>

      <nav className="flex-1 px-3 py-2 flex flex-col gap-0.5 overflow-y-auto">
        {ITEMS.map((item) => {
          const active = isActive(item);
          return (
            <span key={item.href} className="flex flex-col">
              {item.group && (
                <span
                  className="px-3 pt-4 pb-1 font-mono uppercase tracking-[0.18em]"
                  style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}
                >
                  {item.group}
                </span>
              )}
              <Link
                href={item.href}
                onClick={(e) => onParlayItemClick(item, e)}
                aria-current={active ? "page" : undefined}
                className="group flex items-center gap-3 px-3 py-2 rounded-[6px] transition-colors"
                style={{
                  color: active ? "var(--vault-gold-bright)" : "var(--vault-text-mute)",
                  background: active ? "var(--vault-gold-dim)" : "transparent",
                  borderLeft: active
                    ? "2px solid var(--vault-gold-bright)"
                    : "2px solid transparent",
                }}
              >
                <span aria-hidden style={{ width: 18, textAlign: "center", fontSize: 13 }}>
                  {item.glyph}
                </span>
                <span className="text-[13px] font-medium tracking-tight">{item.label}</span>
              </Link>
            </span>
          );
        })}
      </nav>

      <div
        className="px-5 py-4 font-mono"
        style={{ borderTop: "1px solid var(--vault-rule)", color: "var(--vault-text-faint)", fontSize: 9.5 }}
      >
        Educational analytics · paper only
      </div>
    </aside>
  );
}
