"use client";

import { useEffect, useState } from "react";

/** Sticky quick-jump nav for the MLB flagship sections. Smooth-scrolls to each section anchor and
 *  highlights the section currently in view (scroll-spy via IntersectionObserver). Horizontally
 *  scrollable on mobile so it never overflows. Purely presentational — no data, no fabrication. */
const SECTIONS = [
  { id: "mlb-featured", label: "Featured" },
  { id: "mlb-homer-nukes", label: "Homer Nukes" },
  { id: "mlb-player-props", label: "Player Props" },
  { id: "mlb-pitcher-props", label: "Pitcher Props" },
  { id: "mlb-game-explorer", label: "Games" },
] as const;

export default function MlbQuickJump() {
  const [active, setActive] = useState<string>(SECTIONS[0].id);

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target?.id) setActive(visible[0].target.id);
      },
      { rootMargin: "-25% 0px -65% 0px", threshold: 0 },
    );
    for (const s of SECTIONS) { const el = document.getElementById(s.id); if (el) obs.observe(el); }
    return () => obs.disconnect();
  }, []);

  const go = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <nav aria-label="MLB sections" className="sticky z-20 -mx-1 overflow-x-auto" style={{ top: 0 }}>
      <div className="flex items-center gap-1.5 px-1 py-2 min-w-max" style={{ background: "rgba(14,9,6,0.97)", backdropFilter: "blur(8px)" }}>
        {SECTIONS.map((s) => {
          const on = active === s.id;
          return (
            <button key={s.id} onClick={() => go(s.id)} aria-current={on ? "true" : undefined}
              className="rounded-full px-3 py-1.5 font-mono uppercase tracking-[0.08em] whitespace-nowrap transition-colors"
              style={{ fontSize: 10, cursor: "pointer", color: on ? "#120A07" : "var(--vault-text-mute)", background: on ? "var(--gtp-bank-heat)" : "rgba(255,255,255,0.045)", border: "1px solid var(--vault-rule)" }}>
              {s.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
