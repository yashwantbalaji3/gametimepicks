"use client";
/**
 * The reader's ET date, hydration-safe: returns `seed` (the build's ET date) for the server render and the
 * first client render, then the browser's real ET date after mount. Any "is this today's data?" decision a
 * static page shows must read this, never the build clock alone (#761).
 */
import { useEffect, useState } from "react";

import { currentEtDate } from "@/lib/freshness";

export function useReaderEtDate(seed: string): string {
  const [today, setToday] = useState(seed);
  useEffect(() => { setToday(currentEtDate()); }, []);
  return today;
}
