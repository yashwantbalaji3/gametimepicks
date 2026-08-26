import Link from "next/link";

/**
 * PARLAY CENTER MODE TABS (P208 · Release A).
 *
 * One destination, two starting intents: browse the model's suggested cards, or build a card
 * yourself. The modes are REAL ROUTES (`/build` and `/build/custom`) rendered as plain links, so
 * the selected mode is URL-stable, refresh-safe, shareable and true in the static export — never
 * hydration-only state. `aria-current="page"` carries the active mode for assistive tech; the
 * visual treatment mirrors it for everyone else.
 */
export type ParlayCenterMode = "suggested" | "custom";

const TABS: ReadonlyArray<{ mode: ParlayCenterMode; href: string; label: string; sub: string }> = [
  { mode: "suggested", href: "/build", label: "Suggested Parlays", sub: "Start from a model-built card" },
  { mode: "custom", href: "/build/custom", label: "Build Your Own", sub: "Pick legs, set a paper stake" },
];

export default function ParlayCenterTabs({ active }: { active: ParlayCenterMode }) {
  return (
    <nav aria-label="Parlay Center modes" className="flex items-stretch gap-2">
      {TABS.map((t) => {
        const on = t.mode === active;
        return (
          <Link
            key={t.mode}
            href={t.href}
            aria-current={on ? "page" : undefined}
            className="vault-press flex flex-1 sm:flex-none flex-col justify-center rounded-[10px] px-4 py-2.5 no-underline"
            style={{
              minHeight: 52,
              minWidth: 0,
              border: `1px solid ${on ? "var(--vault-gold-bright)" : "var(--vault-border)"}`,
              background: on ? "var(--vault-gold-dim)" : "var(--vault-wash-faint)",
            }}
          >
            <span className="font-display tracking-tight" style={{ color: on ? "var(--vault-gold-bright)" : "var(--vault-text)", fontSize: 14.5, fontWeight: 750 }}>
              {t.label}
            </span>
            <span className="hidden sm:block" style={{ color: "var(--vault-text-mute)", fontSize: 11 }}>
              {t.sub}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
