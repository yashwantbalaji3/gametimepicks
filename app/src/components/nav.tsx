"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import BrandMark from "./brand-mark";
import SportsbookLightRail from "./sportsbook-light-rail";

const NAV_ITEMS = [
  { href: "/", label: "Home" },
  { href: "/board", label: "NBA" },
  { href: "/mlb", label: "MLB" },
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
          aria-label="GameTimePicks home"
          className="flex items-center group shrink-0 vault-glow-hover rounded-[3px] py-1 px-1"
        >
          <BrandMark variant="lockup" />
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className="relative px-3.5 py-2 text-[14px] font-medium tracking-tight transition-colors"
                style={{
                  color: active
                    ? "var(--vault-gold-bright)"
                    : "var(--vault-text-mute)",
                  // Iteration 4: gold-dim halo on the active nav item so
                  // the "you are here" beat reads as illuminated, not
                  // just underlined.
                  background: active
                    ? "linear-gradient(180deg, rgba(212, 175, 55, 0.10) 0%, rgba(212, 175, 55, 0) 80%)"
                    : "transparent",
                  borderRadius: 3,
                  textShadow: active
                    ? "0 0 12px rgba(240, 199, 94, 0.35)"
                    : "none",
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

      {/* Sportsbook LED rail directly under the header — gives the chrome
          a faint lounge-light strip. Pure presentation; respects
          prefers-reduced-motion. */}
      <SportsbookLightRail />

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
                aria-current={active ? "page" : undefined}
                className="relative px-3 py-1.5 text-[12px] font-medium tracking-tight whitespace-nowrap transition-colors"
                style={{
                  color: active
                    ? "var(--vault-gold-bright)"
                    : "var(--vault-text-mute)",
                  background: active
                    ? "linear-gradient(180deg, rgba(212, 175, 55, 0.10) 0%, rgba(212, 175, 55, 0) 80%)"
                    : "transparent",
                  borderRadius: 3,
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
