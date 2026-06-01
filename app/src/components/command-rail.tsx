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

type RailItem = { href: string; label: string; glyph: string; group?: string };

const ITEMS: RailItem[] = [
  { href: "/", label: "Home", glyph: "▤", group: "Overview" },
  { href: "/projections", label: "Projections", glyph: "◷" },
  { href: "/parlay-lab", label: "Parlay Lab", glyph: "⊞" },
  { href: "/bank-builder", label: "Bank Builder", glyph: "▰", group: "Tools" },
  { href: "/results", label: "Results", glyph: "✓" },
  { href: "/events", label: "Events", glyph: "◇", group: "More" },
  { href: "/about", label: "About", glyph: "ⓘ" },
];

function useIsActive() {
  const pathname = usePathname() || "/";
  // Mirrors components/nav.tsx isActive so the rail highlight matches the
  // top nav on every route, including legacy entry points.
  return (href: string): boolean => {
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
    if (href === "/parlay-lab") {
      return (
        pathname === "/parlay-lab" ||
        pathname.startsWith("/parlay-lab/") ||
        pathname.endsWith("/parlays") ||
        pathname.includes("/parlays/") ||
        pathname === "/results/parlays" ||
        pathname.startsWith("/results/parlays/")
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
          const active = isActive(item.href);
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
