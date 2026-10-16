"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { HUB_SECTIONS, currentHubSection, type HubSport } from "@/lib/sports/hub-sections";

/**
 * SPORT-HUB SECTION NAV (P208 · Release C) — the shared in-page wayfinding strip every hub mounts
 * under its hero. Sticky, horizontally scrollable at 390/768/1280/1440, one visual rhythm for all
 * four sports; anchors jump within the hub, links open the capability at its canonical owner. The
 * current anchor is tracked from the scroll position (IntersectionObserver) so the strip answers
 * "where am I on this page" — and under reduced data (no IO) it still works as plain links.
 */
export default function SportHubNav({ sport, anchors }: {
  sport: HubSport;
  /** Anchor ids the page actually rendered this build. A section that did not render (no slate,
   *  no artifact) is filtered OUT of the strip — a dead in-page link is a dead button. Omit to
   *  show every registry anchor (hubs whose sections always render, refusals included). */
  anchors?: readonly string[];
}) {
  const items = HUB_SECTIONS[sport].filter(
    (i) => i.kind === "link" || anchors == null || anchors.includes(i.target),
  );
  const anchorIds = items.filter((i) => i.kind === "anchor").map((i) => i.target);
  const [current, setCurrent] = useState<string | null>(null);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    /* UXR1-15: recompute from every section's position whenever one crosses the band — the old callback only ever
       SET a section, so after scrolling back to the top the last-visited one stayed highlighted over the hero. */
    const io = new IntersectionObserver(
      () => {
        const boxes = anchorIds.flatMap((id) => {
          const r = document.getElementById(id)?.getBoundingClientRect();
          return r ? [{ id, top: r.top, bottom: r.bottom }] : [];
        });
        setCurrent(currentHubSection(boxes, window.innerHeight * 0.2, window.innerHeight * 0.35));
      },
      { rootMargin: "-20% 0px -65% 0px" },
    );
    for (const id of anchorIds) {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
    // anchorIds derives from the static registry for this sport — stable per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sport]);

  return (
    <nav
      aria-label={`${sport.toUpperCase()} sections`}
      /* Sticky from sm+ (under the collapsed one-row header); static on phones, where the stacked
         header is tall and a second sticky band would eat the viewport — the strip stays a
         scrollable wayfinder at the top of the hub there. Anchor targets carry scroll-mt so a jump
         never hides its heading under the chrome. */
      className="sm:sticky z-20 -mx-4 sm:mx-0 px-4 sm:px-0"
      style={{ top: 52 }}
    >
      <div
        className="flex items-center gap-1 overflow-x-auto rounded-[10px] px-2 py-1.5"
        style={{
          border: "1px solid var(--vault-border)",
          background: "color-mix(in srgb, var(--vault-scrim-base) 88%, transparent)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          scrollbarWidth: "none",
        }}
      >
        {items.map((it) => {
          const isAnchor = it.kind === "anchor";
          const on = isAnchor && current === it.target;
          const common = {
            /* UXR1-09 (GTP-12, DS-001 §6): these section links were 33 px tall on every hub (and on /nba since #1106);
               a tappable control gets a 44 px hit area. */
            className: "shrink-0 inline-flex items-center rounded-full px-3 no-underline whitespace-nowrap",
            style: {
              minHeight: 44,
              fontSize: 12,
              fontWeight: 650,
              color: on ? "var(--vault-gold-bright)" : "var(--vault-text-mute)",
              background: on ? "var(--vault-gold-dim)" : "transparent",
              border: `1px solid ${on ? "var(--vault-gold-bright)" : "transparent"}`,
            } as React.CSSProperties,
            "aria-current": on ? ("location" as const) : undefined,
          };
          return isAnchor ? (
            <a key={it.target} href={`#${it.target}`} {...common} onClick={() => setCurrent(it.target)}>
              {it.label}
            </a>
          ) : (
            <Link key={it.target} href={it.target} {...common}>
              {it.label} ↗
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
