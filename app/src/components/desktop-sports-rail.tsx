/**
 * Desktop sports rail — fixed-left thin navigation column visible at
 * `lg+` viewports. GameTimePicks-native styling (no copied sportsbook
 * look). Mirrors the broad "left sports column" UX pattern common to
 * sportsbook product apps, but uses our own vault tokens + glyphs.
 *
 * Scope (this PR — foundation only):
 *   - Renders 6 anchors: All / NBA / MLB / Mixed / Results / Custom.
 *   - Each anchor links to an existing top-level route so the rail
 *     is functional from day one. No fake / unsupported sports.
 *   - "Mixed" and "Custom" anchor /parlay-lab (the only surface today
 *     that hosts mixed-sport + custom-builder slips). Routing them
 *     there is honest and avoids creating new dead pages.
 *   - Cricket is intentionally absent (PR #113 removed cricket from
 *     visible surfaces). WNBA is deferred per product spec.
 *
 * Hidden at < lg. Mobile bottom nav covers small viewports.
 *
 * Accessibility:
 *   - Single `<nav aria-label="Sports">` landmark.
 *   - Active anchor gets `aria-current="page"` based on pathname.
 *   - Each link has a visible label below the glyph + an
 *     `aria-label` for screen readers.
 *
 * Theme: vault tokens only. No theme flip.
 */
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface RailItem {
  key: string;
  label: string;
  href: string;
  /** Matches pathname patterns that should highlight this rail item. */
  isActive(pathname: string): boolean;
}

const RAIL_ITEMS: ReadonlyArray<RailItem> = [
  {
    key: "all",
    label: "All",
    href: "/",
    isActive: (p) => p === "/" || p === "",
  },
  {
    key: "nba",
    label: "NBA",
    href: "/nba",
    isActive: (p) =>
      p === "/nba" || p.startsWith("/nba/") || p === "/results/nba" || p.startsWith("/results/nba/"),
  },
  {
    key: "mlb",
    label: "MLB",
    href: "/mlb",
    isActive: (p) =>
      p === "/mlb" || p.startsWith("/mlb/") || p === "/results/mlb" || p.startsWith("/results/mlb/"),
  },
  {
    key: "mixed",
    label: "Mixed",
    href: "/parlay-lab",
    // Mixed = the Parlay Lab itself (where multi-sport slips live).
    // Only highlight Mixed when on /parlay-lab AND not on a single-
    // sport board.
    isActive: (p) => p === "/parlay-lab" || p.startsWith("/parlay-lab/"),
  },
  {
    key: "results",
    label: "Results",
    href: "/results",
    isActive: (p) =>
      (p === "/results" || p.startsWith("/results/")) &&
      !p.startsWith("/results/nba") &&
      !p.startsWith("/results/mlb"),
  },
  {
    key: "custom",
    label: "Custom",
    href: "/parlay-lab#custom",
    // "Custom" is a deep-link to the Custom Generator section inside
    // /parlay-lab. The hash navigation isn't tracked in `pathname`,
    // so we never highlight Custom automatically — it's purely a
    // jump-to anchor.
    isActive: () => false,
  },
] as const;

function RailGlyph({ kind, active }: { kind: string; active: boolean }) {
  const stroke = active ? "var(--vault-gold-bright)" : "var(--vault-text-mute)";
  const props = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke,
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (kind) {
    case "all":
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3v18M3 12h18" />
        </svg>
      );
    case "nba":
      // basketball motif
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c4 3 4 15 0 18M12 3c-4 3-4 15 0 18" />
        </svg>
      );
    case "mlb":
      // baseball motif
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M5 7c4 2 7 5 9 9M19 17c-4-2-7-5-9-9" />
        </svg>
      );
    case "mixed":
      return (
        <svg {...props}>
          <circle cx="9" cy="9" r="5" />
          <circle cx="15" cy="15" r="5" />
        </svg>
      );
    case "results":
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="m8.5 12.5 2.5 2.5 4.5-5" />
        </svg>
      );
    case "custom":
      return (
        <svg {...props}>
          <path d="M4 12h7M16 4v16M11 4l5 4-5 4" />
        </svg>
      );
    default:
      return null;
  }
}

export default function DesktopSportsRail() {
  const pathname = usePathname() ?? "/";

  return (
    <aside
      aria-label="Sports navigation"
      className="hidden lg:flex fixed left-0 z-20 flex-col items-stretch gap-1 px-1.5 py-3"
      style={{
        top: "var(--gtp-nav-offset, 96px)",
        bottom: 0,
        width: 64,
        background: "rgba(7, 11, 26, 0.55)",
        borderRight: "1px solid var(--vault-rule)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
      }}
    >
      <nav aria-label="Sports" className="flex flex-col gap-1">
        {RAIL_ITEMS.map((item) => {
          const active = item.isActive(pathname);
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={active ? "page" : undefined}
              aria-label={item.label}
              className="flex flex-col items-center justify-center gap-1 py-2.5 rounded-[6px] transition-colors"
              style={{
                background: active
                  ? "linear-gradient(180deg, rgba(240, 199, 94, 0.12) 0%, rgba(240, 199, 94, 0) 100%)"
                  : "transparent",
                border: active
                  ? "1px solid rgba(240, 199, 94, 0.30)"
                  : "1px solid transparent",
              }}
            >
              <RailGlyph kind={item.key} active={active} />
              <span
                className="font-mono uppercase tracking-[0.14em]"
                style={{
                  color: active ? "var(--vault-gold-bright)" : "var(--vault-text-mute)",
                  fontSize: 9,
                  lineHeight: 1,
                }}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
