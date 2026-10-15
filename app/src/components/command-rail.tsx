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
import { activeHref } from "@/lib/nav-active-route";
import Link from "next/link";
import { destinationsFor, NAV_GROUP_LABEL, type NavGroup } from "@/lib/navigation";
import { usePathname } from "next/navigation";
import BrandMark from "./brand-mark";
import SiteSearch from "@/components/search/site-search";

// June-12 IA restructure — the rail is organised around user intent
// ("what do I want to do?"), not internal implementation routes:
//   Today   → the daily loop (Today / Games / Picks / Build)
//   Bankroll→ the money story (Bank Builder / Results)
//   Sports  → the four sport hubs
//   Learn   → trust + education (How it works / Methodology / About)
// Old labels ("Straight Bets", "Suggested Parlays", "Sports & Events")
// are gone; those routes stay reachable and fold into these active states.
type RailItem = {
  href: string;
  label: string;
  glyph: string;
  group?: string;
  /** One-line plain-English descriptor so the rail explains itself (labels stay unified). */
  desc?: string;
};

// Labels are the UNIFIED nav labels (see unified-nav-labels.test) — unchanged. The `desc` line is the
// clarity fix for "the sidebar is misleading": each item now says what it's for, so the apparent overlap
// between Simulate / Today / Game Reports and Build-a-Pick / Build reads clearly.
/**
 * P196: the rail renders the CANONICAL destination list. It used to carry four destinations the top
 * nav did not, so "everything the site offers" meant something different depending on your viewport.
 */
const ITEMS: RailItem[] = destinationsFor("rail").map((d, i, list) => ({
  href: d.href,
  label: d.label,
  glyph: d.glyph ?? "•",
  desc: d.desc,
  // A group heading renders at each boundary, so the rail reads as clusters, not thirty rows.
  group: i === 0 || list[i - 1]!.group !== d.group ? NAV_GROUP_LABEL[d.group] : undefined,
}));

/*
 * UX System V2 (2026-10-13) · ONE RAIL, FIVE CLUSTERS, THREE OF THEM FOLDED. The audit counted 30 rail rows at equal
 * weight — Main alone had eleven. Main (the primaries, Today, Saved) and Sports stay open; Picks & parlays,
 * My GameTime and Learn fold into a native <details> that opens by itself when it holds the current page. Every
 * destination is still a real link in the DOM (keyboard, search engines, the rendered-nav guards), one click away.
 */
type RailGroup = { key: NavGroup; label: string; items: RailItem[] };
const ALWAYS_OPEN: readonly NavGroup[] = ["now", "sports"];
const GROUPS: RailGroup[] = destinationsFor("rail").reduce<RailGroup[]>((acc, d) => {
  const item = ITEMS.find((i) => i.href === d.href)!;
  const last = acc.at(-1);
  if (last && last.key === d.group) last.items.push(item);
  else acc.push({ key: d.group, label: NAV_GROUP_LABEL[d.group], items: [item] });
  return acc;
}, []);

/** UX-001 phase 2: the one shared resolver (lib/nav-active-route.ts) — the rail lights exactly what the top nav, the
 *  phone bar and the Menu sheet light, including retired aliases mid-redirect. */
function useIsActive() {
  const pathname = usePathname() || "/";
  const active = activeHref(pathname, ITEMS.map((i) => i.href));
  return (item: RailItem): boolean => item.href === active;
}

export default function CommandRail() {
  const isActive = useIsActive();

  return (
    <aside
      aria-label="Primary"
      className="gtp-command-rail hidden lg:flex fixed inset-y-0 left-0 z-30 flex-col"
      style={{
        width: "var(--gtp-rail-w, 232px)",
        background: "color-mix(in srgb, var(--vault-scrim-base) 94%, transparent)",
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

      {/* P251-F7: the way in. 377 pages and nineteen board-scoped filter boxes meant a reader had
          to know which page to open before they could look anything up. */}
      <div className="px-4 pb-1">
        <SiteSearch />
      </div>

      <nav aria-label="Primary (rail)" className="flex-1 px-3 py-2 flex flex-col gap-0.5 overflow-y-auto">
        {GROUPS.map((g) => {
          const rows = g.items.map((item) => {
            const active = isActive(item);
            return (
              <span key={item.href} className="flex flex-col">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className="gtp-rail-link group flex items-center gap-3 px-3 py-2 rounded-[7px] transition-all"
                  /* Colour, background, left rule and the --rail-shadow glow come from .gtp-rail-link and
                     .gtp-rail-link[aria-current="page"] in globals.css (COST-002, 2026-10-15: these were
                     inline on every rail link of every page). The glow stays a custom property, never an
                     inline box-shadow, so the a:focus-visible ring still wins — see .gtp-rail-link. */
                >
                  <span aria-hidden className="gtp-rail-glyph">
                    {item.glyph}
                  </span>
                  <span className="flex flex-col leading-tight">
                    <span className={`text-[13px] tracking-tight ${active ? "font-semibold" : "font-medium"}`}>{item.label}</span>
                    {item.desc && (
                      <span className="text-[10.5px] tracking-tight gtp-rail-desc">{item.desc}</span>
                    )}
                  </span>
                </Link>
              </span>
            );
          });
          const headingDot = <span aria-hidden style={{ width: 5, height: 5, borderRadius: 999, background: "var(--gtp-bank-heat)", opacity: 0.7 }} />;
          if (ALWAYS_OPEN.includes(g.key)) {
            return (
              <div key={g.key} className="flex flex-col gap-0.5">
                <span className="flex items-center gap-2 px-3 pt-4 pb-1 font-mono uppercase tracking-[0.18em]" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>
                  {headingDot}
                  {g.label}
                </span>
                {rows}
              </div>
            );
          }
          const holdsActive = g.items.some((item) => isActive(item));
          return (
            <details key={`${g.key}:${holdsActive}`} open={holdsActive} className="gtp-rail-group flex flex-col">
              <summary
                className="gtp-rail-group-summary flex items-center gap-2 px-3 pt-4 pb-1 font-mono uppercase tracking-[0.18em] cursor-pointer select-none"
                style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
              >
                {headingDot}
                <span className="flex-1">{g.label}</span>
                <span aria-hidden className="gtp-rail-group-caret">›</span>
              </summary>
              <div className="flex flex-col gap-0.5">{rows}</div>
            </details>
          );
        })}
      </nav>

      {/* Sprint 012 (R8): the rail no longer repeats the paper-only/educational disclosure. It is already
          stated ABOVE every page by DisclaimerBanner ("Not betting advice. For modeling and research
          purposes only.") and again in the Footer — four simultaneous statements before any content trained
          users to ignore all of them. The required language is unchanged and still on every page; only this
          fourth duplicate is removed. */}
    </aside>
  );
}
