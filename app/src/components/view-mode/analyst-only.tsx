"use client";
/**
 * AnalystOnly — progressive disclosure for the Analyst layer.
 *
 * Renders its children only when the reader has chosen Analyst AND that choice has loaded. So a
 * Simple page's server HTML carries none of the Analyst subtree, and the server render and the first
 * client render always agree (both render nothing here).
 *
 * ⚠ WHAT MUST NEVER GO INSIDE: a prediction value, a line, a live measurement, a result, or any warning
 *   that bears on trust (stale, tracking unavailable, grading pending, experimental / estimate, paused).
 *   Those are always visible. Only additional model detail belongs here.
 */
import type { ReactNode } from "react";

import { useViewMode } from "@/lib/prefs/view-mode";

export default function AnalystOnly({ children }: { children: ReactNode }) {
  const { isAnalyst } = useViewMode();
  return isAnalyst ? <>{children}</> : null;
}
