/**
 * ONE "TODAY" PER BUILD for the /simulate date window.
 *
 * `/simulate/d/[date]` enumerates its pages in generateStaticParams and every day page renders a selector that links to
 * the same window — each computed from "today ET" at its own instant. A build that straddles midnight ET computed the
 * params on one day and rendered selectors on the next, so the selector linked to a date page that was never built
 * (2026-10-20 ~04:00Z: /simulate/d/2026-11-09 → /simulate/d/2026-11-10, a dead link that failed the rendered guards).
 *
 * During a production build (Next sets NEXT_PHASE in its build workers) both read the date the build stamped at its
 * start (`scripts/build-info.mjs --emit` → app/.build-info.json `buildEtDate`). Anywhere else — dev, tests, a missing or
 * malformed stamp — the caller's live fallback is used, exactly as before.
 */
import fs from "node:fs";
import path from "node:path";

export const BUILD_PHASE = "phase-production-build";
export const BUILD_STAMP_FILE = ".build-info.json";

export function pinnedBuildEtDate({ env = process.env, cwd = process.cwd(), fallback }) {
  if (env?.NEXT_PHASE !== BUILD_PHASE) return fallback();
  try {
    const d = JSON.parse(fs.readFileSync(path.join(cwd, BUILD_STAMP_FILE), "utf8"))?.buildEtDate;
    if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  } catch {
    /* no stamp → live clock */
  }
  return fallback();
}
