/**
 * THE BUILD'S ONE `asOf` INSTANT (Phase 6 · P610 fix).
 *
 * `/build/custom` states an eligible-leg count and the explorer loads `data/build/explorer-slate.json`.
 * Both are produced by the same static build, from the same loader — but each called
 * `loadTodaySlate()` with its own `new Date()`, and `next build` renders a page and a route handler in
 * separate worker processes, so the module-level slate cache is not shared between them. Two
 * evaluations, two instants: on 2026-09-16 the page stated 137 legs while the artifact carried 177,
 * because MLB first pitches fell between the two renders. The count was not wrong — the two numbers
 * simply described different moments and claimed to describe one.
 *
 * `scripts/build-info.mjs --emit` runs BEFORE `next build` and stamps `app/.build-info.json` with the
 * build instant. Reading it gives every render in the build the same `asOf`, so the page's pool and
 * the artifact's pool are the same evaluation by construction rather than by luck of scheduling.
 *
 * Falls back to the current instant when the stamp is absent (dev server, tests, a direct import) —
 * the fallback only costs the cross-render agreement the stamp buys; it never invents a time.
 */
import fs from "node:fs";
import path from "node:path";

export const BUILD_INFO_PATH = ".build-info.json";

let cached: string | null = null;

/** The instant this build resolved "now" to. Stable across every render in one build. */
export function buildAsOfIso(): string {
  if (cached) return cached;
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), BUILD_INFO_PATH), "utf8");
    const builtAt = JSON.parse(raw)?.builtAt;
    if (typeof builtAt === "string" && !Number.isNaN(Date.parse(builtAt))) {
      cached = builtAt;
      return cached;
    }
  } catch {
    /* no stamp (dev, tests) — fall through to the live clock */
  }
  cached = new Date().toISOString();
  return cached;
}
