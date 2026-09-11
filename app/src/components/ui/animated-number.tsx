"use client";
import { useEffect, useRef, useState } from "react";
import { frameValue } from "@/lib/uiux/number-transition.mjs";

/**
 * A number that moves to its new value when the READER changes the input behind it (role:
 * number-transition, 480ms decelerate). See lib/uiux/number-transition.mjs for the rule this may not
 * break: a published, already-computed figure never animates here.
 *
 * Reduced motion jumps straight to the value — the role's policy is "remove", and the number itself is
 * the information, not the movement. The first render never animates either: a value arriving for the
 * first time has nothing to travel from.
 */
export default function AnimatedNumber({
  value, format, durationMs = 480, className, style,
}: {
  value: number;
  format: (n: number) => string;
  durationMs?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const raf = useRef<number | null>(null);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) { first.current = false; from.current = value; setShown(value); return; }
    const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced || durationMs <= 0) { from.current = value; setShown(value); return; }
    const start = performance.now();
    const origin = from.current;
    const tick = (now: number) => {
      const v = frameValue(origin, value, now - start, durationMs) as number;
      setShown(v);
      if (now - start < durationMs) raf.current = requestAnimationFrame(tick);
      else { from.current = value; raf.current = null; }
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current != null) cancelAnimationFrame(raf.current); from.current = value; };
  }, [value, durationMs]);

  /* tabular-nums: the digits must not reflow while they move. */
  return <span className={className} style={{ fontVariantNumeric: "tabular-nums", ...style }}>{format(shown)}</span>;
}
