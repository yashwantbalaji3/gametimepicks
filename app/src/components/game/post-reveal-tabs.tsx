"use client";
/**
 * PostRevealTabs — the Overview-led tab shell for a generated game dashboard.
 *
 * Rendered ONLY inside a runner's `postReveal` (which the runner mounts only in the `done`
 * phase), so the whole tabbed dashboard stays behind the pre-click gate — nothing here is in the
 * painted DOM until the user clicks Generate. The FIRST tab (Overview) is the default: the main
 * answer is visible immediately, deeper detail is one tap away.
 *
 * Presentational + client tab state only. No data, no fetch, no money. Mobile: the tab bar
 * scrolls horizontally; content never forces page-level horizontal scroll.
 */
import { useState } from "react";

export interface PostRevealTab {
  key: string;
  label: string;
  content: React.ReactNode;
  /** Optional short count/badge shown next to the label. */
  badge?: string | number | null;
}

export default function PostRevealTabs({ tabs }: { tabs: PostRevealTab[] }) {
  const usable = tabs.filter((t) => t && t.content != null);
  const [active, setActive] = useState(usable[0]?.key ?? "");
  if (usable.length === 0) return null;
  const current = usable.find((t) => t.key === active) ?? usable[0];

  return (
    <div className="flex flex-col gap-4">
      {/* Tab bar — horizontal scroll on mobile, no page overflow */}
      <div
        role="tablist"
        aria-label="Dashboard sections"
        className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1"
        style={{ scrollbarWidth: "none" }}
      >
        {usable.map((t) => {
          const on = t.key === current.key;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setActive(t.key)}
              className="vault-press shrink-0 inline-flex items-center gap-1.5 rounded-full px-3.5 font-mono uppercase tracking-[0.1em] transition-colors"
              style={{
                minHeight: 38,
                fontSize: 10.5,
                color: on ? "#06091a" : "var(--vault-text-mute)",
                background: on ? "linear-gradient(180deg, var(--vault-gold-bright), #d6a945)" : "var(--gtp-card)",
                border: on ? "none" : "1px solid var(--vault-rule)",
                fontWeight: on ? 700 : 500,
              }}
            >
              {t.label}
              {t.badge != null && t.badge !== 0 ? (
                <span
                  className="inline-flex items-center justify-center rounded-full"
                  style={{
                    minWidth: 16,
                    height: 16,
                    padding: "0 4px",
                    fontSize: 8.5,
                    background: on ? "rgba(6,9,26,0.18)" : "var(--gtp-card-sunken)",
                    color: on ? "#06091a" : "var(--vault-text-faint)",
                  }}
                >
                  {t.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Active panel */}
      <div role="tabpanel" aria-label={current.label} className="min-w-0">
        {current.content}
      </div>
    </div>
  );
}
