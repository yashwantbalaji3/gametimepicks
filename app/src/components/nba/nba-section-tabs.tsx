"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * NBA section sub-nav — mirrors MlbSectionTabs visually + structurally
 * so NBA and MLB feel like equal sibling products. Sits at the top of
 * every /nba/* page and the legacy NBA URLs (`/board`, `/parlay-lab`)
 * so users always see the sport-aware tab strip.
 *
 * Active matching: each tab declares its canonical `href` plus any
 * `legacyHrefs` that should also count as that tab being active. This
 * lets `/board` highlight "Model Board" and `/parlay-lab` highlight
 * "Parlays" without breaking those bookmarks.
 */
const TABS: Array<{
  href: string;
  label: string;
  end?: boolean;
  legacyHrefs?: string[];
}> = [
  { href: "/nba", label: "Overview", end: true },
  { href: "/nba/board", label: "Model Board", legacyHrefs: ["/board"] },
  { href: "/nba/power", label: "Power Board" },
  {
    href: "/nba/parlays",
    label: "Parlays",
    legacyHrefs: ["/parlay-lab"],
  },
  { href: "/nba/results", label: "Results" },
];

export default function NbaSectionTabs() {
  const pathname = usePathname() || "/";

  const isActive = (
    href: string,
    end?: boolean,
    legacyHrefs?: string[],
  ) => {
    const matches = (h: string) => {
      if (end) return pathname === h || pathname === `${h}/`;
      return pathname === h || pathname.startsWith(`${h}/`);
    };
    if (matches(href)) return true;
    if (legacyHrefs?.some(matches)) return true;
    return false;
  };

  return (
    <nav
      aria-label="NBA section"
      className="flex flex-wrap items-center gap-1 -mx-1"
    >
      {TABS.map((t) => {
        const active = isActive(t.href, t.end, t.legacyHrefs);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className="px-3 py-1.5 text-[12px] font-mono uppercase tracking-[0.14em] rounded-[3px] transition-colors"
            style={{
              color: active
                ? "var(--vault-gold-bright)"
                : "var(--vault-text-mute)",
              background: active
                ? "linear-gradient(180deg, rgba(212, 175, 55, 0.12) 0%, rgba(212, 175, 55, 0) 90%)"
                : "transparent",
              border: active
                ? "1px solid rgba(212, 175, 55, 0.30)"
                : "1px solid var(--vault-border)",
            }}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
