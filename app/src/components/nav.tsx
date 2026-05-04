"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "Home" },
  { href: "/board", label: "Model Board" },
  { href: "/trends", label: "Player Trends" },
  { href: "/results", label: "Results" },
  { href: "/methodology", label: "Methodology" },
  { href: "/responsible-use", label: "Responsible Use" },
];

export default function Nav() {
  const pathname = usePathname() || "/";

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/" || pathname === "";
    return pathname.startsWith(href);
  };

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--border)] backdrop-blur-xl bg-[rgba(6,7,10,0.78)]">
      <div className="mx-auto max-w-[1280px] px-6 h-14 flex items-center justify-between gap-6">
        <Link href="/" className="flex items-center gap-2.5 group shrink-0">
          <div
            className="w-7 h-7 rounded-[3px] flex items-center justify-center font-mono font-bold text-[12px] tracking-tight"
            style={{
              background: "linear-gradient(135deg, #A3E635, #65A30D)",
              color: "#06070A",
            }}
          >
            GP
          </div>
          <div className="font-display text-[14px] font-semibold tracking-tight">
            Gametime<span className="text-[var(--text-mute)] font-normal">Picks</span>
          </div>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`px-3 py-1.5 text-[13px] font-medium tracking-tight rounded-[3px] transition-colors ${
                isActive(item.href)
                  ? "text-[var(--lime)] bg-[var(--lime-dim)]"
                  : "text-[var(--text-mute)] hover:text-[var(--text)] hover:bg-[var(--hover)]"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Mobile: compact menu indicator. The actual mobile menu is a simple
            horizontally scrolling row beneath. */}
        <div className="md:hidden text-[11px] font-mono text-[var(--text-faint)] uppercase tracking-wider">
          v0.4
        </div>
      </div>

      {/* Mobile horizontal nav row */}
      <div className="md:hidden border-t border-[var(--border)] overflow-x-auto">
        <div className="flex items-center gap-0 px-3 py-1.5 min-w-max">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`px-3 py-1.5 text-[12px] font-medium tracking-tight rounded-[3px] whitespace-nowrap transition-colors ${
                isActive(item.href)
                  ? "text-[var(--lime)] bg-[var(--lime-dim)]"
                  : "text-[var(--text-mute)]"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </header>
  );
}
