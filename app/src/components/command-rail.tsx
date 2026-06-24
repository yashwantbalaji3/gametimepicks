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
import Link from "next/link";
import { usePathname } from "next/navigation";
import BrandMark from "./brand-mark";

// June-12 IA restructure — the rail is organised around user intent
// ("what do I want to do?"), not internal implementation routes:
//   Today   → the daily loop (Today / Games / Picks / Build)
//   Bankroll→ the money story (Bank Builder / Results)
//   Sports  → the four sport hubs
//   Learn   → trust + education (How it works / Methodology / About)
// Old labels ("Straight Bets", "Suggested Parlays", "Sports & Events")
// are gone; those routes stay reachable and fold into these active states.
type RailItem = {
  href: string;
  label: string;
  glyph: string;
  group?: string;
};

const ITEMS: RailItem[] = [
  { href: "/today", label: "Today", glyph: "▤", group: "Today" },
  { href: "/games", label: "Games", glyph: "◷" },
  { href: "/picks", label: "Parlay Lab", glyph: "⊞" },
  { href: "/build", label: "Build", glyph: "✎" },
  { href: "/bank-builder", label: "Bank Builder", glyph: "▰", group: "Bankroll" },
  { href: "/moonshot", label: "Moonshot", glyph: "🌙" },
  { href: "/world-cup-specials", label: "WC Specials", glyph: "🏆" },
  { href: "/homer-nukes", label: "Homer Nukes", glyph: "💣" },
  { href: "/mr-dub", label: "Mr. Dub", glyph: "⚗" },
  { href: "/results", label: "Results", glyph: "✓" },
  { href: "/world-cup", label: "World Cup", glyph: "⚽", group: "Sports" },
  { href: "/mlb", label: "MLB", glyph: "⚾" },
  { href: "/nba", label: "NBA", glyph: "🏀" },
  { href: "/ufc", label: "UFC", glyph: "🥊" },
  { href: "/learn", label: "Learn", glyph: "✦", group: "Learn" },
  { href: "/methodology", label: "Methodology", glyph: "◳" },
  { href: "/about", label: "About", glyph: "ⓘ" },
];

function useIsActive() {
  const pathname = usePathname() || "/";
  // Mirrors components/nav.tsx isActive so the rail highlight matches the
  // top nav on every route, including legacy entry points.
  return (item: RailItem): boolean => {
    const { href } = item;
    if (href === "/today") return pathname === "/today" || pathname === "/" || pathname === "";
    if (href === "/games") {
      // Games folds in the schedule/board legacy entry points.
      return (
        pathname === "/games" || pathname.startsWith("/games/") ||
        pathname === "/events" || pathname.startsWith("/events/") ||
        pathname === "/board" || pathname.startsWith("/board/") ||
        pathname === "/projections" || pathname.startsWith("/projections/")
      );
    }
    if (href === "/picks") {
      // The canonical Parlay Lab; /parlays + /parlay-lab redirect here, so they highlight it too.
      return (
        pathname === "/picks" || pathname.startsWith("/picks/") ||
        pathname === "/parlays" || pathname.startsWith("/parlays/") ||
        pathname === "/parlay-lab" || pathname.startsWith("/parlay-lab/")
      );
    }
    if (href === "/build") {
      return pathname === "/build" || pathname.startsWith("/build/");
    }
    if (href === "/results") {
      return pathname === "/results" || (pathname.startsWith("/results/") && !pathname.startsWith("/results/model-audit"));
    }
    if (href === "/learn") {
      return (
        pathname === "/learn" || pathname.startsWith("/learn/") ||
        pathname === "/responsible-use" || pathname.startsWith("/responsible-use/") ||
        pathname === "/results/model-audit" || pathname.startsWith("/results/model-audit/")
      );
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  };
}

export default function CommandRail() {
  const isActive = useIsActive();

  return (
    <aside
      aria-label="Primary"
      className="gtp-command-rail hidden lg:flex fixed inset-y-0 left-0 z-30 flex-col"
      style={{
        width: "var(--gtp-rail-w, 232px)",
        background: "rgba(26, 16, 11, 0.94)",
        borderRight: "1px solid var(--vault-border)",
        backdropFilter: "blur(12px)",
      }}
    >
      <Link
        href="/"
        aria-label="GameTimePicks home"
        className="px-3 py-4 flex items-center justify-center vault-glow-hover rounded-[8px] mx-2 mt-3"
      >
        <BrandMark variant="rail" />
      </Link>

      <nav className="flex-1 px-3 py-2 flex flex-col gap-0.5 overflow-y-auto">
        {ITEMS.map((item) => {
          const active = isActive(item);
          return (
            <span key={item.href} className="flex flex-col">
              {item.group && (
                <span
                  className="flex items-center gap-2 px-3 pt-4 pb-1 font-mono uppercase tracking-[0.18em]"
                  style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
                >
                  <span aria-hidden style={{ width: 5, height: 5, borderRadius: 999, background: "var(--gtp-bank-heat)", opacity: 0.7 }} />
                  {item.group}
                </span>
              )}
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className="group flex items-center gap-3 px-3 py-2 rounded-[7px] transition-all"
                style={{
                  color: active ? "var(--vault-gold-bright)" : "var(--vault-text-mute)",
                  background: active ? "var(--vault-gold-dim)" : "transparent",
                  borderLeft: active
                    ? "2px solid var(--vault-gold-bright)"
                    : "2px solid transparent",
                  boxShadow: active ? "inset 0 0 0 1px var(--vault-border), 0 0 14px var(--vault-gold-glow)" : "none",
                }}
              >
                <span aria-hidden style={{ width: 18, textAlign: "center", fontSize: 13 }}>
                  {item.glyph}
                </span>
                <span className={`text-[13px] tracking-tight ${active ? "font-semibold" : "font-medium"}`}>{item.label}</span>
              </Link>
            </span>
          );
        })}
      </nav>

      <div
        className="px-5 py-4 font-mono"
        style={{ borderTop: "1px solid var(--vault-rule)", color: "var(--vault-text-faint)", fontSize: 10 }}
      >
        Educational analytics · paper only
      </div>
    </aside>
  );
}
