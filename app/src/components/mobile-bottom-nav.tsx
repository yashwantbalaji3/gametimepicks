/**
 * Mobile bottom navigation.
 *
 * Sticky fixed-bottom strip with 4 buckets (Home / Picks / Lab /
 * Results). Mobile-only — hidden at `md+` so the existing desktop
 * top nav remains the primary surface on wider viewports.
 *
 * Honesty / accessibility:
 *   - 44px+ tap targets, vertically centered, safe-area-inset padded.
 *   - `aria-current="page"` on the active bucket.
 *   - Hidden from screen readers when not at mobile viewport size
 *     (the top nav still covers screen-reader users on desktop).
 *   - Active bucket resolved via `resolveMobileNavBucket()` —
 *     pathname-driven, no client-state.
 *   - No external links, no banned copy.
 *
 * Theme: uses existing vault tokens. No theme flip.
 */
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  MOBILE_NAV_ITEMS,
  resolveMobileNavBucket,
  type MobileNavBucket,
} from "@/lib/nav-active-route";

// Lightweight inline glyphs. Tiny SVGs keep the bundle slim and let
// us use `currentColor` for active/inactive theming. Not branded icons.
function NavGlyph({ bucket, active }: { bucket: MobileNavBucket; active: boolean }) {
  const stroke = active ? "var(--vault-gold-bright)" : "var(--vault-text-mute)";
  const props = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke,
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (bucket) {
    case "home":
      // House — the front door.
      return (
        <svg {...props}>
          <path d="M3 11.5 12 4l9 7.5" />
          <path d="M5 10v10h14V10" />
        </svg>
      );
    case "bank":
      // Stacked coins — the paper-bankroll Bank Builder ladder.
      return (
        <svg {...props}>
          <ellipse cx="12" cy="6" rx="7" ry="2.5" />
          <path d="M5 6v5c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6" />
          <path d="M5 11v5c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-5" />
        </svg>
      );
    case "picks":
      // Chart/bars — today's model picks.
      return (
        <svg {...props}>
          <path d="M4 20V8" />
          <path d="M10 20V4" />
          <path d="M16 20v-9" />
          <path d="M22 20H2" />
        </svg>
      );
    case "record":
      // Check-in-circle — the public, settled track record.
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="m8.5 12.5 2.5 2.5 4.5-5" />
        </svg>
      );
    case "how":
      // Open book — how it works / methodology.
      return (
        <svg {...props}>
          <path d="M12 6c-2-1.3-4.5-1.5-7-1v12c2.5-.5 5-.3 7 1 2-1.3 4.5-1.5 7-1V5c-2.5-.5-5-.3-7 1Z" />
          <path d="M12 6v13" />
        </svg>
      );
  }
}

export default function MobileBottomNav() {
  const pathname = usePathname();
  const activeBucket = resolveMobileNavBucket(pathname);

  return (
    <nav
      aria-label="Mobile bottom navigation"
      className="fixed inset-x-0 bottom-0 z-40 md:hidden"
      style={{
        // safe-area awareness — devices with home indicator get extra
        // padding so the nav items don't sit under the OS chrome.
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        background: "rgba(26, 16, 11, 0.92)",
        borderTop: "1px solid var(--vault-border)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
      }}
    >
      <ul
        className="flex items-stretch gap-0.5 list-none px-1 py-1"
        // Exactly 5 destinations — they fit one row evenly even at 320px (no scroll).
        style={{ scrollbarWidth: "none" }}
      >
        {MOBILE_NAV_ITEMS.map((item) => {
          const active = item.bucket === activeBucket;
          return (
            <li key={item.bucket} className="flex-1 min-w-0">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                aria-label={`${item.label} — ${active ? "current page" : "navigate"}`}
                className="flex flex-col items-center justify-center gap-0.5 rounded-[8px] py-2 transition-colors"
                style={{
                  minHeight: 48,
                  background: active
                    ? "linear-gradient(180deg, rgba(242, 54, 69, 0.10) 0%, rgba(242, 54, 69, 0) 100%)"
                    : "transparent",
                  border: active
                    ? "1px solid rgba(242, 54, 69, 0.28)"
                    : "1px solid transparent",
                }}
              >
                <NavGlyph bucket={item.bucket} active={active} />
                <span
                  className="font-mono uppercase tracking-[0.06em] whitespace-nowrap"
                  style={{
                    color: active ? "var(--vault-gold-bright)" : "var(--vault-text-mute)",
                    fontSize: 10,
                    lineHeight: 1,
                  }}
                >
                  {item.short}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
