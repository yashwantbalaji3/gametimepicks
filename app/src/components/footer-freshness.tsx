"use client";

/**
 * Phase 14 — FooterFreshness.
 *
 * Tiny client component embedded in the otherwise server-rendered footer.
 * Computes pipeline-run freshness using the user's real clock after
 * hydration — that way "stale" / "fresh" labels stay accurate even when
 * the static build is hours old.
 *
 * SSR fallback: renders an empty span (no flash of stale content).
 */
import { useEffect, useState } from "react";
import {
  classifyRun,
  runFreshnessLabel,
  relativeTimeLabel,
  type RunFreshness,
} from "@/lib/freshness";

interface Props {
  lastRun: string | null | undefined;
}

const COLOR: Record<RunFreshness, string> = {
  fresh: "var(--vault-success)",
  recent: "var(--vault-text)",
  stale: "var(--vault-warn)",
  very_stale: "var(--vault-danger)",
  unknown: "var(--vault-text-faint)",
};

export default function FooterFreshness({ lastRun }: Props) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    // Re-evaluate every minute so a long-open tab doesn't drift
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Don't render anything until hydration so SSR/CSR match
  if (!now) {
    return <span className="text-[var(--vault-text-faint)]">—</span>;
  }

  const cls = classifyRun(lastRun, now);
  const rel = relativeTimeLabel(lastRun, now);

  return (
    <span className="inline-flex items-baseline gap-2">
      <span style={{ color: COLOR[cls] }}>{runFreshnessLabel(cls)}</span>
      {rel && (
        <span className="text-[var(--vault-text-faint)] text-[11px]">
          · {rel}
        </span>
      )}
    </span>
  );
}
