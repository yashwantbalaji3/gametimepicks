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

// ── Internal DATA sweep: an artifact under public/data may be flagged `"public": false` (internal / dev,
// e.g. the shadow-calibration backtest). output:export copies it verbatim into out/data where it would be
// world-readable at its raw URL even though no page links it. Delete every out/data JSON that declares
// itself non-public so the deployed site can never serve internal backtest / calibration data. Bounded to
// out/data; reads each JSON's head only. Never touches source or public/data — only the build output.
function sweepInternalData(dir) {
  const pruned = [];
  const walk = (d) => {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".json")) {
        try {
          const txt = fs.readFileSync(p, "utf8");
          // Cheap pre-filter before JSON.parse; then confirm a real top-level public:false.
          if (/"public"\s*:\s*false/.test(txt)) {
            const j = JSON.parse(txt);
            if (j && j.public === false) { fs.rmSync(p, { force: true }); pruned.push(path.relative(outDir, p)); }
          }
        } catch { /* unreadable/!json → leave it */ }
      }
    }
  };
  walk(dir);
  return pruned;
}
const dataDir = path.join(outDir, "data");
if (fs.existsSync(dataDir)) {
  const prunedData = sweepInternalData(dataDir);
  console.log(`[prune-internal-routes] internal (public:false) data pruned from out/: ${prunedData.length ? prunedData.join(", ") : "(none)"}`);
}
