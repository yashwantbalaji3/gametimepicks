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
import { MOBILE_NAV_ITEMS, resolveMobileNavBucket, type MobileNavBucket } from "@/lib/nav-active-route";

/** One glyph per primary destination (the rail's only per-item decoration). */
const RAIL_GLYPH: Record<MobileNavBucket, string> = {
  home: "▤",
  bank: "▰",
  picks: "⊞",
  record: "⚗",
  how: "◳",
};

// June-12 IA restructure — the rail is organised around user intent
// ("what do I want to do?"), not internal implementation routes:
//   Today   → the daily loop (Today / Games / Picks / Build)
//   Bankroll→ the money story (Bank Builder / Results)
//   Sports  → the four sport hubs
//   Learn   → trust + education (How it works / Methodology / About)
// Old labels ("Straight Bets", "Suggested Parlays", "Sports & Events")
// are gone; those routes stay reachable and fold into these active states.
export default function CommandRail() {
  const pathname = usePathname() || "/";
  const activeBucket = resolveMobileNavBucket(pathname);

  return (
    <aside
      aria-label="Primary"
      className="gtp-command-rail hidden lg:flex fixed inset-y-0 left-0 z-30 flex-col"
      style={{
        width: "var(--gtp-rail-w, 232px)",
        background: "rgba(26, 16, 11, 0.94)",
        borderRight: "1px solid var(--vault-border)",
        backdropFilter: "blur(12px)",
      }}
    >
      <Link
        href="/"
        aria-label="GameTimePicks home"
        className="px-3 py-4 flex items-center justify-center vault-glow-hover rounded-[8px] mx-2 mt-3"
      >
        <BrandMark variant="rail" />
      </Link>

      <nav className="flex-1 px-3 py-3 flex flex-col gap-1 overflow-y-auto">
        {MOBILE_NAV_ITEMS.map((item) => {
          const active = item.bucket === activeBucket;
          return (
            <Link
              key={item.bucket}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className="group flex items-center gap-3 px-3 py-2.5 rounded-[7px] transition-all"
              style={{
                color: active ? "var(--vault-gold-bright)" : "var(--vault-text-mute)",
                background: active ? "var(--vault-gold-dim)" : "transparent",
                borderLeft: active ? "2px solid var(--vault-gold-bright)" : "2px solid transparent",
                boxShadow: active ? "inset 0 0 0 1px var(--vault-border), 0 0 14px var(--vault-gold-glow)" : "none",
              }}
            >
              <span aria-hidden style={{ width: 18, textAlign: "center", fontSize: 13 }}>{RAIL_GLYPH[item.bucket]}</span>
              <span className={`text-[13.5px] tracking-tight ${active ? "font-semibold" : "font-medium"}`}>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div
        className="px-5 py-4 font-mono"
        style={{ borderTop: "1px solid var(--vault-rule)", color: "var(--vault-text-faint)", fontSize: 10 }}
      >
        Educational analytics · paper only
      </div>
    </aside>
  );
}
