"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "Home" },
  { href: "/board", label: "Model Board" },
  { href: "/parlay-lab", label: "Parlay Lab" },
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
    <header
      className="sticky top-0 z-30 backdrop-blur-xl"
      style={{
        background: "rgba(7, 11, 26, 0.82)",
        borderBottom: "1px solid var(--vault-border)",
      }}
    >
      <div className="mx-auto max-w-[1440px] px-6 sm:px-8 h-16 flex items-center justify-between gap-6">
        <Link
          href="/"
          className="flex items-center gap-3 group shrink-0 vault-glow-hover rounded-[3px] py-1"
        >
          <div
            className="w-8 h-8 rounded-[4px] flex items-center justify-center font-mono font-bold text-[13px] tracking-tight"
            style={{
              background: "linear-gradient(135deg, #F0C75E, #B8901E)",
              color: "#06070A",
              boxShadow:
                "0 0 0 1px rgba(212, 175, 55, 0.45) inset, 0 0 14px -4px rgba(240, 199, 94, 0.4)",
            }}
          >
            GP
          </div>
          <div className="font-display text-[15px] font-semibold tracking-[-0.012em]">
            Gametime<span className="text-[var(--vault-text-mute)] font-normal">Picks</span>
          </div>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className="relative px-3.5 py-2 text-[14px] font-medium tracking-tight transition-colors"
                style={{
                  color: active
                    ? "var(--vault-gold-bright)"
                    : "var(--vault-text-mute)",
                }}
              >
                {item.label}
                {active && (
                  <span
                    aria-hidden
                    className="absolute left-2 right-2 -bottom-px h-px"
                    style={{
                      background:
                        "linear-gradient(90deg, transparent, var(--vault-gold-bright), transparent)",
                      boxShadow: "0 0 6px rgba(240, 199, 94, 0.45)",
                    }}
                  />
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Mobile horizontal nav row */}
      <div
        className="md:hidden overflow-x-auto"
        style={{ borderTop: "1px solid var(--vault-border)" }}
      >
        <div className="flex items-center gap-0 px-3 py-1.5 min-w-max">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className="relative px-3 py-1.5 text-[12px] font-medium tracking-tight whitespace-nowrap transition-colors"
                style={{
                  color: active
                    ? "var(--vault-gold-bright)"
                    : "var(--vault-text-mute)",
                }}
              >
                {item.label}
                {active && (
                  <span
                    aria-hidden
                    className="absolute left-2 right-2 -bottom-px h-px"
                    style={{
                      background:
                        "linear-gradient(90deg, transparent, var(--vault-gold-bright), transparent)",
                    }}
                  />
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </header>
  );
}
