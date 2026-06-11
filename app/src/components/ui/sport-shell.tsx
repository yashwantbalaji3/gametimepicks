"use client";
/**
 * SportShell — a true tabbed sport-page experience (shows ONE section at a time, not a long
 * scroll). ALL tab content is server-rendered into the DOM (SSG/SEO-friendly) and the shell
 * toggles visibility with client state — so there's no client-only bailout. Reads `?tab=` after
 * mount for shareable deep-links and keeps the URL in sync via history.replaceState (no router
 * dependency, no Suspense requirement). Reusable across World Cup / MLB / NBA / UFC.
 */
import { useEffect, useState } from "react";

export interface ShellTab {
  key: string;
  label: string;
  badge?: string | number | null;
  content: React.ReactNode;
}

export default function SportShell({ tabs }: { tabs: ShellTab[] }) {
  const [active, setActive] = useState<string>(tabs[0]?.key ?? "");

  // Deep-link: adopt ?tab= after mount (client-only — never forces SSR bail).
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t && tabs.some((x) => x.key === t)) setActive(t);
  }, [tabs]);

  const select = (key: string) => {
    setActive(key);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", key);
      window.history.replaceState(null, "", url.toString());
    } catch {
      /* no-op */
    }
  };

  return (
    <div>
      <nav
        aria-label="Sport sections"
        className="sticky top-0 z-20 -mx-4 sm:-mx-8 px-4 sm:px-8 py-2 mb-5 overflow-x-auto"
        style={{ background: "rgba(7,11,26,0.92)", backdropFilter: "blur(8px)", borderBottom: "1px solid var(--vault-border)" }}
      >
        <div className="flex items-center gap-1.5 min-w-max" role="tablist">
          {tabs.map((t) => {
            const on = t.key === active;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => select(t.key)}
                className="flex items-center gap-1.5 rounded-full px-3.5 py-1.5 transition-colors"
                style={{
                  background: on ? "var(--vault-gold-dim)" : "transparent",
                  border: `1px solid ${on ? "var(--vault-gold-bright)" : "var(--vault-rule)"}`,
                  color: on ? "var(--vault-gold-bright)" : "var(--vault-text-mute)",
                  fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap",
                }}
              >
                {t.label}
                {t.badge != null && t.badge !== "" ? (
                  <span
                    className="font-mono rounded-full px-1.5"
                    style={{ background: on ? "var(--vault-gold-bright)" : "var(--vault-rule)", color: on ? "#0b0f1f" : "var(--vault-text-faint)", fontSize: 10 }}
                  >
                    {t.badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </nav>
      {/* All tabs rendered server-side; inactive ones hidden. Keeps content in static HTML. */}
      {tabs.map((t) => (
        <div key={t.key} role="tabpanel" aria-labelledby={t.key} hidden={t.key !== active}>
          {t.content}
        </div>
      ))}
    </div>
  );
}
