"use client";
import type { ReactNode } from "react";
import { legHasStarted } from "@/lib/parlays/explorer-legs";
import { useReaderNowIso } from "@/components/slip/use-reader-now";

/**
 * The homepage features only games that have not started (W9, audit 2026-10-28). The page is static, so the
 * server picks the pregame games at build time and THESE re-check on the reader's clock by the one start rule:
 * a card disappears once its game starts, and the empty state appears when every featured game has started.
 * Children are server-rendered; only the start instants cross to the client.
 */
export function HideOnceStarted({ startUtc, children }: { startUtc: string | null; children: ReactNode }) {
  const now = useReaderNowIso();
  if (now != null && legHasStarted(startUtc, now)) return null;
  return <>{children}</>;
}

/** Renders its children only once every listed start has passed on the reader's clock (never before hydration). */
export function WhenAllStarted({ starts, children }: { starts: ReadonlyArray<string | null>; children: ReactNode }) {
  const now = useReaderNowIso();
  if (now == null || starts.length === 0 || !starts.every((s) => legHasStarted(s, now))) return null;
  return <>{children}</>;
}
