"use client";
/**
 * FreshnessBadge — the honest "is this current?" pill that fixes the frozen static-export clock.
 *
 * The site is statically exported, so server-rendered HTML carries the BUILD date. This client component
 * seeds with that build-date guess (so the first client render matches SSR — no hydration mismatch), then
 * re-computes with the REAL browser ET date in a useEffect after mount. Result: a July-1 slate viewed on
 * July-5 truthfully reads "Latest slate · 4 days ago", never a stale "Live today", even if no redeploy has
 * happened. Pure display logic lives in lib/freshness-display (unit-tested); this only owns the clock swap
 * and the palette.
 */
import { useEffect, useState } from "react";
import { currentEtDate } from "@/lib/freshness";
import { freshnessDisplay, type FreshnessTone } from "@/lib/freshness-display";

const TONE: Record<FreshnessTone, { color: string; bg: string; border: string }> = {
  live: { color: "var(--vault-success)", bg: "var(--vault-success-dim)", border: "color-mix(in srgb, var(--vault-success) 45%, transparent)" },
  recent: { color: "var(--vault-gold-bright)", bg: "var(--vault-gold-dim)", border: "color-mix(in srgb, var(--vault-gold-bright) 40%, transparent)" },
  stale: { color: "var(--vault-warn)", bg: "var(--vault-warn-dim)", border: "color-mix(in srgb, var(--vault-warn) 45%, transparent)" },
  future: { color: "var(--gtp-neon-cyan, #6fd6e0)", bg: "rgba(111,214,224,0.10)", border: "rgba(111,214,224,0.4)" },
  muted: { color: "var(--vault-text-faint)", bg: "transparent", border: "var(--vault-rule)" },
};

export default function FreshnessBadge({
  slateDate,
  serverToday,
  noun,
  className,
}: {
  slateDate?: string | null;
  serverToday: string;
  /** What the date represents ("slate" default, e.g. "board", "results"). */
  noun?: string;
  className?: string;
}) {
  const [today, setToday] = useState(serverToday);
  useEffect(() => {
    setToday(currentEtDate());
  }, []);

  const f = freshnessDisplay(slateDate, today, { noun });
  const t = TONE[f.tone];

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono uppercase tracking-[0.1em] px-2 py-0.5 rounded-full shrink-0${className ? ` ${className}` : ""}`}
      style={{ color: t.color, background: t.bg, border: `1px solid ${t.border}`, fontSize: 10, whiteSpace: "nowrap" }}
      title={f.warning ?? undefined}
    >
      <span
        aria-hidden
        className={f.tone === "live" ? "gtp-slate-dot gtp-slate-dot-live" : "gtp-slate-dot"}
        style={{ margin: 0, background: t.color }}
      />
      {f.text}
    </span>
  );
}
