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
      return (
        <svg {...props}>
          <path d="M3 11.5 12 4l9 7.5" />
          <path d="M5 10v10h14V10" />
        </svg>
      );
    case "games":
      // Grid of game cards — the unified cross-sport games board.
      return (
        <svg {...props}>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </svg>
      );
    case "picks":
      // Chart/bars motif — projections live here.
      return (
        <svg {...props}>
          <path d="M4 20V8" />
          <path d="M10 20V4" />
          <path d="M16 20v-9" />
          <path d="M22 20H2" />
        </svg>
      );
    case "lab":
      // Beaker — parlay lab.
      return (
        <svg {...props}>
          <path d="M9 3h6" />
          <path d="M10 3v6L4.5 18.5A2 2 0 0 0 6.2 21h11.6a2 2 0 0 0 1.7-2.5L14 9V3" />
          <path d="M7.5 14h9" />
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
    case "results":
      // Check-in-circle — settled results.
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="m8.5 12.5 2.5 2.5 4.5-5" />
        </svg>
      );
    case "sports":
      // Calendar — the Sports & Events schedules hub.
      return (
        <svg {...props}>
          <rect x="3" y="4.5" width="18" height="16" rx="2" />
          <path d="M3 9h18" />
          <path d="M8 2.5v4" />
          <path d="M16 2.5v4" />
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
        background: "rgba(7, 11, 26, 0.92)",
        borderTop: "1px solid var(--vault-border)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
      }}
    >
      <ul className="flex items-stretch justify-around list-none px-1 py-1">
        {MOBILE_NAV_ITEMS.map((item) => {
          const active = item.bucket === activeBucket;
          return (
            <li key={item.bucket} className="flex-1 max-w-[110px]">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                aria-label={`${item.label} — ${active ? "current page" : "navigate"}`}
                className="flex flex-col items-center justify-center gap-0.5 rounded-[8px] py-2 transition-colors"
                style={{
                  minHeight: 48,
                  background: active
                    ? "linear-gradient(180deg, rgba(240, 199, 94, 0.10) 0%, rgba(240, 199, 94, 0) 100%)"
                    : "transparent",
                  border: active
                    ? "1px solid rgba(240, 199, 94, 0.28)"
                    : "1px solid transparent",
                }}
              >
                <NavGlyph bucket={item.bucket} active={active} />
                <span
                  className="font-mono uppercase tracking-[0.08em] whitespace-nowrap"
                  style={{
                    color: active ? "var(--vault-gold-bright)" : "var(--vault-text-mute)",
                    fontSize: 9.5,
                    lineHeight: 1,
                  }}
                >
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
