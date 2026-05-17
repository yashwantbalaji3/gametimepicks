"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * NHL section sub-nav — mirrors NbaSectionTabs / MlbSectionTabs so NHL
 * feels like an equal sibling sport. Lives at the top of every /nhl/*
 * page.
 */
const TABS: Array<{ href: string; label: string; end?: boolean }> = [
  { href: "/nhl", label: "Overview", end: true },
  { href: "/nhl/board", label: "Model Board" },
  { href: "/nhl/power", label: "Power Board" },
  { href: "/nhl/parlays", label: "Parlays" },
  { href: "/nhl/results", label: "Results" },
];

export default function NhlSectionTabs() {
  const pathname = usePathname() || "/";
  const isActive = (href: string, end?: boolean) => {
    if (end) return pathname === href || pathname === `${href}/`;
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <nav
      aria-label="NHL section"
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
