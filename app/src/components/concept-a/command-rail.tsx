"use client";

/**
 * CommandRail — Concept A (Command Center) PREVIEW ONLY.
 *
 * A persistent left navigation rail (desktop lg+) that replaces the
 * horizontal top nav, giving the app an "analytics OS" structure: nav on
 * the left, status bar across the top of content, modules in the canvas.
 *
 * No data/logic changes — it links to the same routes as the production nav.
 * On mobile the rail is hidden; the existing MobileBottomNav still applies.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import BrandMark from "@/components/brand-mark";

const ITEMS: Array<{ href: string; label: string; glyph: string; group?: string }> = [
  { href: "/", label: "Dashboard", glyph: "▤", group: "Overview" },
  { href: "/projections", label: "Projections", glyph: "◷" },
  { href: "/parlay-lab", label: "Parlay Lab", glyph: "⊞" },
  { href: "/bank-builder", label: "Bank Builder", glyph: "▰", group: "Tools" },
  { href: "/results", label: "Results", glyph: "✓" },
  { href: "/events", label: "Events", glyph: "◇", group: "More" },
  { href: "/about", label: "About", glyph: "ⓘ" },
];

export default function CommandRail() {
  const pathname = usePathname() || "/";
  const isActive = (href: string) =>
    href === "/"
      ? pathname === "/" || pathname === ""
      : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <aside
      aria-label="Primary (command rail)"
      className="ca-rail hidden lg:flex fixed inset-y-0 left-0 z-30 flex-col"
      style={{
        width: 232,
        background: "rgba(8, 12, 22, 0.96)",
        borderRight: "1px solid var(--vault-border)",
        backdropFilter: "blur(10px)",
      }}
    >
      <Link href="/" aria-label="GameTimePicks home" className="px-5 py-5 inline-flex items-center">
        <BrandMark variant="compact" />
      </Link>

      <nav className="flex-1 px-3 py-2 flex flex-col gap-0.5 overflow-y-auto">
        {ITEMS.map((item) => {
          const active = isActive(item.href);
          return (
            <span key={item.href} className="flex flex-col">
              {item.group && (
                <span
                  className="px-3 pt-4 pb-1 font-mono uppercase tracking-[0.18em]"
                  style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}
                >
                  {item.group}
                </span>
              )}
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className="group flex items-center gap-3 px-3 py-2 rounded-[6px] transition-colors"
                style={{
                  color: active ? "var(--vault-gold-bright)" : "var(--vault-text-mute)",
                  background: active ? "var(--vault-gold-dim)" : "transparent",
                  borderLeft: active
                    ? "2px solid var(--vault-gold-bright)"
                    : "2px solid transparent",
                }}
              >
                <span aria-hidden style={{ width: 18, textAlign: "center", fontSize: 13 }}>
                  {item.glyph}
                </span>
                <span className="text-[13px] font-medium tracking-tight">{item.label}</span>
              </Link>
            </span>
          );
        })}
      </nav>

      <div
        className="px-5 py-4 font-mono"
        style={{ borderTop: "1px solid var(--vault-rule)", color: "var(--vault-text-faint)", fontSize: 9.5 }}
      >
        Educational analytics · paper only
      </div>
    </aside>
  );
}
