"use client";
/** SportTabs — generic sticky section nav (scroll-to + scroll-spy) reusable on any sport page. */
import { useEffect, useState } from "react";

export interface SportTabDef { key: string; label: string; badge?: string | number | null }

export default function SportTabs({ tabs }: { tabs: SportTabDef[] }) {
  const [active, setActive] = useState<string>(tabs[0]?.key ?? "");
  useEffect(() => {
    const els = tabs.map((t) => document.getElementById(t.key)).filter((e): e is HTMLElement => !!e);
    if (!els.length) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const v = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (v[0]) setActive(v[0].target.id);
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: [0, 0.25, 0.5, 1] },
    );
    els.forEach((e) => obs.observe(e));
    return () => obs.disconnect();
  }, [tabs]);
  const go = (k: string) => { const el = document.getElementById(k); if (el) { el.scrollIntoView({ behavior: "smooth", block: "start" }); setActive(k); } };
  return (
    <nav aria-label="Sections" className="sticky top-0 z-20 -mx-4 sm:-mx-8 px-4 sm:px-8 py-2 mb-4 overflow-x-auto"
         style={{ background: "color-mix(in srgb, var(--vault-scrim-base) 92%, transparent)", backdropFilter: "blur(8px)", borderBottom: "1px solid var(--vault-border)" }}>
      <div className="flex items-center gap-1.5 min-w-max">
        {tabs.map((t) => {
          const on = active === t.key;
          return (
            <button key={t.key} type="button" onClick={() => go(t.key)} aria-current={on ? "true" : undefined}
                    className="flex items-center gap-1.5 rounded-full px-3.5 py-1.5 transition-colors"
                    style={{ background: on ? "var(--vault-gold-dim)" : "transparent", border: `1px solid ${on ? "var(--vault-gold-bright)" : "var(--vault-rule)"}`, color: on ? "var(--vault-gold-bright)" : "var(--vault-text-mute)", fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap" }}>
              {t.label}
              {t.badge != null && t.badge !== "" ? (
                <span className="font-mono rounded-full px-1.5" style={{ background: on ? "var(--vault-gold-bright)" : "var(--vault-rule)", color: on ? "var(--vault-on-accent)" : "var(--vault-text-faint)", fontSize: 10 }}>{t.badge}</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
