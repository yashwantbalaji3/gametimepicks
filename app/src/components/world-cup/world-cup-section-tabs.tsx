"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Sport-section tabs for the World Cup hub — same pattern as
 * NbaSectionTabs / MlbSectionTabs etc. Used at the top of every
 * /world-cup/* route.
 */
const TABS = [
  { href: "/world-cup", label: "Overview" },
  { href: "/world-cup/schedule", label: "Schedule" },
  { href: "/world-cup/groups", label: "Groups" },
  { href: "/world-cup/teams", label: "Teams" },
];

export default function WorldCupSectionTabs() {
  const pathname = usePathname() || "/world-cup";
  return (
    <nav
      aria-label="World Cup section"
      className="overflow-x-auto"
      style={{ borderBottom: "1px solid var(--vault-rule)" }}
    >
      <div className="flex gap-1 sm:gap-2 min-w-max pb-2">
        {TABS.map((t) => {
          const active =
            t.href === "/world-cup"
              ? pathname === "/world-cup"
              : pathname === t.href || pathname.startsWith(`${t.href}/`);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className="px-3 py-1.5 rounded-[4px] font-mono uppercase tracking-[0.16em] text-[10.5px]"
              style={{
                color: active ? "var(--vault-gold-bright)" : "var(--vault-text-mute)",
                background: active
                  ? "linear-gradient(180deg, rgba(242, 54, 69,0.14) 0%, rgba(242, 54, 69,0) 90%)"
                  : "transparent",
                border: active
                  ? "1px solid rgba(242, 54, 69, 0.32)"
                  : "1px solid transparent",
                textDecoration: "none",
              }}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
