"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Unified sport section sub-nav. One component, one visual rhythm, for
 * NBA, MLB, NHL and IPL. Replaces the four per-sport tab files so the
 * "Overview · Model Board · Power Board · Parlays · Results" pattern
 * is identical across sports.
 *
 * Each sport gets its own /<sport>/* prefix. Legacy NBA URLs (/board,
 * /parlay-lab) keep their "active" highlight thanks to the legacyHrefs
 * list, so bookmarks don't break.
 */
export type SportKey = "nba" | "mlb" | "nhl" | "ipl";

const SPORT_LABEL: Record<SportKey, string> = {
  nba: "NBA",
  mlb: "MLB",
  nhl: "NHL",
  ipl: "IPL",
};

const LEGACY_HREFS: Partial<Record<SportKey, Partial<Record<string, string[]>>>> = {
  nba: {
    "/nba/board": ["/board"],
    "/nba/parlays": ["/parlay-lab"],
  },
};

interface TabSpec {
  slug: "" | "board" | "power" | "parlays" | "results";
  label: string;
  /** When true, matches the exact pathname (used for the Overview tab
   *  so /<sport> doesn't also light up when on /<sport>/board). */
  exact?: boolean;
}

const TABS: TabSpec[] = [
  { slug: "", label: "Overview", exact: true },
  { slug: "board", label: "Model Board" },
  { slug: "power", label: "Power Board" },
  { slug: "parlays", label: "Parlays" },
  { slug: "results", label: "Results" },
];

export default function SportSectionTabs({ sport }: { sport: SportKey }) {
  const pathname = usePathname() || "/";
  const base = `/${sport}`;
  const sportLabel = SPORT_LABEL[sport];
  const legacy = LEGACY_HREFS[sport] ?? {};

  const isActive = (href: string, exact?: boolean) => {
    const exactMatch = pathname === href || pathname === `${href}/`;
    const prefixMatch = !exact && pathname.startsWith(`${href}/`);
    if (exactMatch || prefixMatch) return true;
    const legacyList = legacy[href] ?? [];
    for (const l of legacyList) {
      if (pathname === l || pathname === `${l}/`) return true;
      if (!exact && pathname.startsWith(`${l}/`)) return true;
    }
    return false;
  };

  return (
    <nav
      aria-label={`${sportLabel} section`}
      className="flex flex-wrap items-center gap-1 -mx-1"
    >
      {TABS.map((t) => {
        const href = t.slug ? `${base}/${t.slug}` : base;
        const active = isActive(href, t.exact);
        return (
          <Link
            key={t.slug || "overview"}
            href={href}
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
