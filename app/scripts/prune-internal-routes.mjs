/**
 * prune-internal-routes — remove internal-only routes from the static export so they 404 publicly.
 *
 * The site is `output: "export"`, which emits an index.html for EVERY page.tsx (incl. internal ones);
 * `noindex` alone does not make a URL private on a static host. `internal-route-guard` already makes
 * these pages render a data-free 404 shell in production (defense-in-depth); this step deletes the
 * emitted files entirely so `out/` truly has no internal route. Chained into `npm run build`.
 *
 * Skipped when NEXT_PUBLIC_INTERNAL_ROUTES=1 (an intentional internal build that keeps them).
 * Never touches source, data, or money — only the build output under out/.
 */
import fs from "node:fs";
import path from "node:path";

const INTERNAL_ROUTES = ["ops", "preview"];

if (process.env.NEXT_PUBLIC_INTERNAL_ROUTES === "1") {
  console.log("[prune-internal-routes] NEXT_PUBLIC_INTERNAL_ROUTES=1 → keeping internal routes in out/");
  process.exit(0);
}

const outDir = path.join(process.cwd(), "out");
if (!fs.existsSync(outDir)) {
  console.log("[prune-internal-routes] no out/ dir — nothing to prune");
  process.exit(0);
}

const removed = [];
for (const route of INTERNAL_ROUTES) {
  const dir = path.join(outDir, route);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
    removed.push(route);
  }
  // Also clear any *.txt RSC payload siblings (e.g. out/ops.txt) if present.
  const txt = path.join(outDir, `${route}.txt`);
  if (fs.existsSync(txt)) fs.rmSync(txt, { force: true });
}
console.log(`[prune-internal-routes] pruned from out/: ${removed.length ? removed.join(", ") : "(none present)"}`);
