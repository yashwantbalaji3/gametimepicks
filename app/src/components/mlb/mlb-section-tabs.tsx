"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Small in-section sub-nav for the MLB area. Lives at the top of every
 * /mlb/* page so users always know how to move between Overview, Model
 * Board, Power Board, Parlays and Results without going back to the
 * main nav. Tab labels mirror NbaSectionTabs so NBA and MLB feel like
 * equal sibling products.
 */
const TABS = [
  { href: "/mlb", label: "Overview", end: true },
  { href: "/mlb/board", label: "Model Board" },
  { href: "/mlb/power", label: "Power Board" },
  { href: "/mlb/parlays", label: "Parlays" },
  { href: "/mlb/results", label: "Results" },
];

export default function MlbSectionTabs() {
  const pathname = usePathname() || "/";

  const isActive = (href: string, end?: boolean) => {
    if (end) return pathname === href || pathname === `${href}/`;
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <nav
      aria-label="MLB section"
      className="flex flex-wrap items-center gap-1 -mx-1"
    >
      {TABS.map((t) => {
        const active = isActive(t.href, t.end);
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
