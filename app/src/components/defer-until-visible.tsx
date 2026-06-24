"use client";

import { useEffect, useRef, useState } from "react";

/**
 * DeferUntilVisible — renders its (server-rendered) children only once the wrapper scrolls near the
 * viewport. Used to lazy-mount heavy BELOW-THE-FOLD content (e.g. the legacy MLB SportShell with all its
 * tab panels) so the initial page render + hydration stays light. The children are still passed through
 * the RSC payload (no data is dropped or fabricated) — they're just not inserted into the DOM until the
 * user scrolls toward them.
 *
 * SSR-safe: first render (server + client) shows the placeholder, so there is no hydration mismatch; an
 * IntersectionObserver then reveals the real content. A reserved min-height avoids layout shift.
 */
export default function DeferUntilVisible({
  children,
  minHeight = 480,
  rootMargin = "800px",
  label = "Loading more…",
}: {
  children: React.ReactNode;
  minHeight?: number;
  rootMargin?: string;
  label?: string;
}) {
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (show) return;
    const el = ref.current;
    if (!el) return;
    // If IntersectionObserver is unavailable, just show immediately (graceful fallback).
    if (typeof IntersectionObserver === "undefined") { setShow(true); return; }
    const obs = new IntersectionObserver(
      (entries) => { if (entries.some((e) => e.isIntersecting)) { setShow(true); obs.disconnect(); } },
      { rootMargin },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [show, rootMargin]);

  return (
    <div ref={ref} style={show ? undefined : { minHeight }}>
      {show ? (
        children
      ) : (
        <div className="flex items-center justify-center" style={{ minHeight, color: "var(--vault-text-faint)" }} aria-hidden>
          <span className="font-mono uppercase tracking-[0.12em]" style={{ fontSize: 10 }}>{label}</span>
        </div>
      )}
    </div>
  );
}
