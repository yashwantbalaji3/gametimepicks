/**
 * Mobile bottom navigation.
 *
 * Sticky fixed-bottom strip: the five primaries (Home / Sports / Live / Simulations / Results) and a Menu. Mobile-only
 * — hidden at `md+`, where the header carries the five primaries and its own Menu button (UX-001 phase 2), and the
 * rail takes over at `lg+`.
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
import { useEffect, useRef, useState } from "react";

import {
  MOBILE_NAV_ITEMS,
  activeHref,
  resolveMobileNavBucket,
  type MobileNavBucket,
} from "@/lib/nav-active-route";
import SiteSearch from "@/components/search/site-search";
import { destinationsFor, NAV_GROUP_LABEL, groupChangedAt } from "@/lib/navigation";
import { useSavedForecasts } from "@/lib/saved/saved-store";
import { useDialogFocus } from "@/components/a11y/use-dialog-focus";

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
    case "live":
      // A broadcast dot with signal rings — the game is on now.
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="2.5" />
          <path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4" />
          <path d="M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14" />
        </svg>
      );
    case "home":
      return (
        <svg {...props}>
          <path d="M3 11.5 12 4l9 7.5" />
          <path d="M5 10v10h14V10" />
        </svg>
      );
    case "today":
      // Day view — today's slate.
      return (
        <svg {...props}>
          <rect x="3" y="4.5" width="18" height="16" rx="2" />
          <path d="M3 9h18" />
          <path d="M8 2.5v4" />
          <path d="M16 2.5v4" />
          <circle cx="12" cy="15" r="2.2" />
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
    case "lab":
      // Beaker — parlay lab.
      return (
        <svg {...props}>
          <path d="M9 3h6" />
          <path d="M10 3v6L4.5 18.5A2 2 0 0 0 6.2 21h11.6a2 2 0 0 0 1.7-2.5L14 9V3" />
          <path d="M7.5 14h9" />
        </svg>
      );
    case "markets":
      // Two columns compared — model beside market, the Market Center's whole job.
      return (
        <svg {...props}>
          <path d="M7 20V9" />
          <path d="M12 20V4" />
          <path d="M17 20v-7" />
          <path d="M4 20h16" />
          <path d="M4 6.5h4" />
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

/**
 * THE MENU SHEET (P208 · Release B). The bar carries the five thumb destinations (Home / Today /
 * Simulate / Picks / Parlay); everything else the rail offers — Results, the sport hubs, the paper
 * products, the record and learning pages — lives one tap away in a LABELLED sheet. Derived from
 * the same canonical list as every other surface: the sheet is "the rail minus the bar", grouped
 * under the same headings, so a destination can never exist on desktop and be unreachable here.
 */
export function MenuSheet({ onClose, pathname, withSearch = false }: {
  onClose: () => void;
  pathname: string;
  /** UX-001 phase 2: the tablet header opens this sheet too, and has no search box of its own (the phone header does). */
  withSearch?: boolean;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  /* Phase 5O: the Saved row carries the reader's own count, read from the browser-local store only (no account). */
  const saved = useSavedForecasts();
  const savedCount = saved.ready ? saved.items.length : 0;
  const barHrefs = new Set(MOBILE_NAV_ITEMS.map((i) => i.href));
  const items = destinationsFor("rail").filter((d) => !barHrefs.has(d.href));
  /* UX-001 phase 2: the shared resolver, asked over the whole rail — so /mlb/board lights MLB here, as on the rail. */
  const activeRail = activeHref(pathname, destinationsFor("rail").map((d) => d.href));
  /*
   * FOCUS GOES IN, IS CONTAINED, AND COMES BACK — all three now, from one primitive.
   *
   * This sheet already moved focus to Close and returned it to the Menu button (Phase 6 · P605).
   * What it did NOT do was contain Tab: `aria-modal="true"` tells assistive technology the rest of
   * the page is inert and does nothing to a real browser's Tab key, so Shift+Tab from Close walked
   * straight out of the open menu into the page behind it. `useDialogFocus` owns all of it, and the
   * same hook now serves every dialog in the product.
   */
  useDialogFocus(sheetRef, { onClose, initialFocus: closeRef });
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end lg:hidden" style={{ background: "color-mix(in srgb, var(--vault-ink-black) 60%, transparent)" }} onClick={onClose}>
      <div
        ref={sheetRef}
        role="dialog" aria-modal="true" aria-label="Menu"
        className="rounded-t-[16px] max-h-[78vh] overflow-y-auto px-4 pb-8 pt-3"
        onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--vault-panel-elevated)", borderTop: "1px solid var(--vault-border-strong)", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}
      >
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 16, fontWeight: 800 }}>Menu</span>
          <button ref={closeRef} type="button" onClick={onClose} className="font-mono uppercase tracking-[0.12em] rounded-[8px]" style={{ color: "var(--vault-text-mute)", fontSize: 11, minHeight: 44, minWidth: 44 }}>
            Close ✕
          </button>
        </div>
        {withSearch ? <div className="mt-2 mb-1"><SiteSearch /></div> : null}
        <ul className="list-none m-0 p-0 flex flex-col">
          {items.map((d, i) => {
            const groupStart = groupChangedAt(items, i);
            const active = d.href === activeRail;
            return (
              <li key={d.href}>
                {groupStart && NAV_GROUP_LABEL[groupStart] ? (
                  <span className="block font-mono uppercase tracking-[0.16em] pt-3 pb-1" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
                    {NAV_GROUP_LABEL[groupStart]}
                  </span>
                ) : null}
                <Link
                  href={d.href}
                  onClick={onClose}
                  aria-current={active ? "page" : undefined}
                  className="flex items-center gap-2.5 rounded-[8px] px-2 no-underline"
                  style={{ minHeight: 44, color: active ? "var(--vault-gold-bright)" : "var(--vault-text)", background: active ? "var(--vault-gold-dim)" : "transparent" }}
                >
                  {d.glyph ? <span aria-hidden style={{ width: 18, textAlign: "center", fontSize: 13 }}>{d.glyph}</span> : null}
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{d.label}</span>
                  {d.note ? <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>{d.note}</span> : null}
                  {d.href === "/saved" && savedCount > 0 ? <span className="font-mono" style={{ color: "var(--vault-gold)", fontSize: 10 }}>{savedCount} on this device</span> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export default function MobileBottomNav() {
  const pathname = usePathname();
  const activeBucket = resolveMobileNavBucket(pathname);
  const [menuOpen, setMenuOpen] = useState(false);
  const barBuckets = new Set(MOBILE_NAV_ITEMS.map((i) => i.bucket));
  // The Menu lights up when the reader is ON a destination the sheet owns (e.g. /results, /sports)
  // — the same "highlight where you are" rule the bar items follow.
  const menuActive = (activeBucket == null || !barBuckets.has(activeBucket))
    && activeHref(pathname, destinationsFor("rail").map((d) => d.href).filter((h) => !MOBILE_NAV_ITEMS.some((i) => i.href === h))) != null;

  return (
    <>
    {/*
      * THE SHEET RENDERS OUTSIDE THIS <nav>, and that is not a style preference.
      *
      * The bar paints itself with `backdrop-filter: blur(14px)`, and a filtered element becomes the
      * CONTAINING BLOCK for any `position: fixed` descendant. So the sheet's `inset-0` resolved to the
      * bar's own box — measured 375×56 at 375px — and the whole Menu (Results, the sport hubs, the paper
      * products, the records, Saved Forecasts: 18 destinations, 999px of content) was squeezed into a
      * 56px strip scrolling behind the bar. Everything the bar does not carry was unreachable on a phone.
      * Moving the dialog out of the filtered subtree restores the viewport as its containing block.
      */}
    <nav
      aria-label="Mobile bottom navigation"
      className="fixed inset-x-0 bottom-0 z-40 md:hidden"
      style={{
        // safe-area awareness — devices with home indicator get extra
        // padding so the nav items don't sit under the OS chrome.
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        background: "color-mix(in srgb, var(--vault-scrim-base) 92%, transparent)",
        borderTop: "1px solid var(--vault-border)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
      }}
    >
      <ul
        className="flex items-stretch gap-0.5 list-none px-1 py-1 overflow-x-auto"
        // Six buckets that FIT. Scrolling stays as the overflow escape hatch for very narrow
        // screens, but it is no longer the design: a trailing label permanently half-cut behind a
        // hidden scrollbar reads as a bug, not an affordance. grow+shrink-0 lets the row fill
        // wider screens; shortLabel keeps each item near its 58px basis so it does not have to.
        style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}
      >
        {MOBILE_NAV_ITEMS.map((item) => {
          const active = item.bucket === activeBucket;
          return (
            <li key={item.bucket} className="grow shrink-0 basis-[58px]">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                aria-label={`${item.label} — ${active ? "current page" : "navigate"}`}
                className="flex flex-col items-center justify-center gap-0.5 rounded-[8px] py-2 transition-colors"
                style={{
                  minHeight: 48,
                  background: active
                    ? "linear-gradient(180deg, color-mix(in srgb, var(--vault-accent) 10%, transparent) 0%, color-mix(in srgb, var(--vault-accent) 0%, transparent) 100%)"
                    : "transparent",
                  border: active
                    ? "1px solid color-mix(in srgb, var(--vault-accent) 28%, transparent)"
                    : "1px solid transparent",
                }}
              >
                <NavGlyph bucket={item.bucket} active={active} />
                <span
                  className="font-mono uppercase tracking-[0.08em] whitespace-nowrap"
                  style={{
                    color: active ? "var(--vault-gold-bright)" : "var(--vault-text-mute)",
                    fontSize: 10,
                    lineHeight: 1,
                  }}
                >
                  {item.shortLabel}
                </span>
              </Link>
            </li>
          );
        })}
        {/* The sixth slot: a LABELLED Menu (P208) — Results, sports, products, records, learning.
            A button, not a link: it opens the sheet, and its label says so. */}
        <li className="grow shrink-0 basis-[58px]">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-expanded={menuOpen}
            aria-haspopup="dialog"
            aria-label={`Menu — Results, sports and more${menuActive ? " (current section)" : ""}`}
            className="w-full flex flex-col items-center justify-center gap-0.5 rounded-[8px] py-2 transition-colors"
            style={{
              minHeight: 48,
              background: menuActive
                ? "linear-gradient(180deg, color-mix(in srgb, var(--vault-gold-bright) 10%, transparent) 0%, transparent 100%)"
                : "transparent",
              border: menuActive ? "1px solid color-mix(in srgb, var(--vault-gold-bright) 28%, transparent)" : "1px solid transparent",
            }}
          >
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={menuActive ? "var(--vault-gold-bright)" : "var(--vault-text-mute)"} strokeWidth={1.8} strokeLinecap="round" aria-hidden>
              <path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" />
            </svg>
            <span className="font-mono uppercase tracking-[0.08em] whitespace-nowrap" style={{ color: menuActive ? "var(--vault-gold-bright)" : "var(--vault-text-mute)", fontSize: 10, lineHeight: 1 }}>
              Menu
            </span>
          </button>
        </li>
      </ul>
    </nav>
    {menuOpen ? <MenuSheet onClose={() => setMenuOpen(false)} pathname={pathname ?? "/"} /> : null}
    </>
  );
}
