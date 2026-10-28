"use client";
import { useEffect, useState } from "react";

/**
 * The reader's clock as an ISO string, or null until after hydration (the server render is the BUILD's
 * clock and would mismatch). Re-ticks each minute so a slip control cannot outlive its own first pitch
 * in an open tab. Consumers treat null as "not yet known" — the store's add gate still checks at click.
 */
export function useReaderNowIso(intervalMs = 60_000): string | null {
  const [now, setNow] = useState<string | null>(null);
  useEffect(() => {
    setNow(new Date().toISOString());
    const t = setInterval(() => setNow(new Date().toISOString()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
