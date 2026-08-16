"use client";
/**
 * WcStickyTabs — a sportsbook-style sticky section nav for the World Cup hub. Each tab scrolls
 * to its section (so Player Props / Suggested Cards are one click away instead of a long scroll)
 * and highlights the section currently in view. Count badges surface how much is live. Pure
 * presentational client component — no data fetching.
 */
import { useEffect, useState } from "react";

export interface WcTabDef {
  key: string;
  label: string;
  badge?: string | number | null;
}

export default function WcStickyTabs({ tabs }: { tabs: WcTabDef[] }) {
  const [active, setActive] = useState<string>(tabs[0]?.key ?? "");

  useEffect(() => {
    const ids = tabs.map((t) => t.key);
    const els = ids
      .map((id) => document.getElementById(id))
      .filter((e): e is HTMLElement => !!e);
    if (!els.length) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: [0, 0.25, 0.5, 1] },
    );
    els.forEach((e) => obs.observe(e));
    return () => obs.disconnect();
  }, [tabs]);

  const go = (key: string) => {
    const el = document.getElementById(key);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setActive(key);
    }
  };

  return (
    <nav
      aria-label="World Cup sections"
      className="sticky top-0 z-20 -mx-4 sm:-mx-8 px-4 sm:px-8 py-2 mb-4 overflow-x-auto"
      style={{
        background: "rgba(11, 18, 14,0.92)",
        backdropFilter: "blur(8px)",
        borderBottom: "1px solid var(--vault-border)",
      }}
    >
      <div className="flex items-center gap-1.5 min-w-max">
        {tabs.map((t) => {
          const on = active === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => go(t.key)}
              aria-current={on ? "true" : undefined}
              className="flex items-center gap-1.5 rounded-full px-3.5 py-1.5 transition-colors"
              style={{
                background: on ? "var(--vault-gold-dim)" : "transparent",
                border: `1px solid ${on ? "var(--vault-gold-bright)" : "var(--vault-rule)"}`,
                color: on ? "var(--vault-gold-bright)" : "var(--vault-text-mute)",
                fontSize: 12.5,
                fontWeight: 600,
                whiteSpace: "nowrap",
              }}
            >
              {t.label}
              {t.badge !== null && t.badge !== undefined && t.badge !== "" ? (
                <span
                  className="font-mono rounded-full px-1.5"
                  style={{
                    background: on ? "var(--vault-gold-bright)" : "var(--vault-rule)",
                    color: on ? "#170f0a" : "var(--vault-text-faint)",
                    fontSize: 10,
                  }}
                >
                  {t.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
