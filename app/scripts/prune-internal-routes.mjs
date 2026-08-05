/**
 * prune-internal-routes — reduce the static export to exactly what the public site serves.
 *
 * The site is `output: "export"`, which emits an index.html for EVERY page.tsx (incl. internal ones)
 * and copies ALL of `public/` verbatim; `noindex` alone does not make a URL private on a static host.
 * `internal-route-guard` already makes internal pages render a data-free 404 shell in production
 * (defense-in-depth); this step removes the shipped payload entirely. Chained into `npm run build`.
 *
 * THREE SWEEPS, each closing a hole the previous one left open:
 *   1. ROUTE HTML   — delete out/<route>/ and out/<route>.txt.
 *   2. ROUTE CHUNKS — delete out/_next/static/chunks/app/<route>/. Deleting the HTML alone leaves the
 *                     page's compiled JS on the CDN at a guessable path; the /ops chunk carried the
 *                     build commit sha and internal build-clock copy in plain text.
 *   3. DATA         — keep only the data files the built output actually references (plus the build
 *                     marker). `public/data/` is an internal working tree that `output: "export"`
 *                     mirrors into `out/data/`, where every file is world-readable at its raw URL even
 *                     though nothing links it. Deny-by-default is the only sweep that cannot rot: it
 *                     needs no list of what is secret, only proof of what is used.
 *
 * WHY DERIVE THE KEEP-SET INSTEAD OF LISTING IT
 * A hand-maintained allowlist goes stale the first time someone adds a fetch. The keep-set is read
 * out of the build itself: any `/data/...` path a shipped HTML/JS/RSC file names is kept. If the scan
 * finds a `/data/` reference it cannot resolve to a concrete file (a URL assembled at runtime), it
 * REFUSES to prune and exits non-zero rather than guess — a broken public page must never be the
 * silent outcome of a privacy sweep.
 *
 * Escape hatches (both loud):
 *   NEXT_PUBLIC_INTERNAL_ROUTES=1  intentional internal build — keeps everything.
 *   GTP_KEEP_PUBLIC_DATA=1         keep the whole out/data mirror (route sweeps still run).
 *
 * Never touches source, public/data, or money — only the build output under out/.
 */
import fs from "node:fs";
import path from "node:path";

const INTERNAL_ROUTES = ["ops", "preview", "launch"];

/**
 * Data files the public site serves even though no page links them. Kept deliberately, not by accident.
 *   build-info.json — the deployed build marker. `verify-deployment.mjs` and `public-beta-observe.mjs`
 *                     fetch it from production to state (not infer) which build is live.
 * Paths are relative to out/data/.
 */
const ALWAYS_PUBLIC_DATA = ["build-info.json"];

if (process.env.NEXT_PUBLIC_INTERNAL_ROUTES === "1") {
  console.log("[prune-internal-routes] NEXT_PUBLIC_INTERNAL_ROUTES=1 → keeping internal routes in out/");
  process.exit(0);
}

const outDir = path.join(process.cwd(), "out");
if (!fs.existsSync(outDir)) {
  console.log("[prune-internal-routes] no out/ dir — nothing to prune");
  process.exit(0);
}

/** Every file under `dir`, absolute paths. Missing dir → []. */
function walkFiles(dir) {
  const found = [];
  const visit = (d) => {
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) visit(p);
      else found.push(p);
    }
  };
  visit(dir);
  return found;
}

// ── 1 + 2. internal routes: HTML, RSC payload, and the compiled page chunk ──────────────────────
const removed = [];
const chunkRoot = path.join(outDir, "_next", "static", "chunks", "app");
for (const route of INTERNAL_ROUTES) {
  for (const target of [
    path.join(outDir, route), // out/ops/
    path.join(outDir, `${route}.txt`), // out/ops.txt (RSC payload sibling)
    path.join(chunkRoot, route), // out/_next/static/chunks/app/ops/
  ]) {
    if (fs.existsSync(target)) {
      fs.rmSync(target, { recursive: true, force: true });
      removed.push(path.relative(outDir, target));
    }
  }
}
console.log(`[prune-internal-routes] pruned from out/: ${removed.length ? removed.join(", ") : "(none present)"}`);

// ── 3. data: keep only what the shipped output references ───────────────────────────────────────
const dataDir = path.join(outDir, "data");

/**
 * Delete every internal (`"public": false`) JSON under out/data.
 *
 * Retained even though the deny-by-default sweep below is stricter: it is the fallback that still
 * runs when someone sets GTP_KEEP_PUBLIC_DATA=1, and it is the only sweep an artifact can opt into
 * from its own contents.
 */
function sweepInternalData(dir) {
  const pruned = [];
  for (const p of walkFiles(dir)) {
    if (!p.endsWith(".json")) continue;
    try {
      const txt = fs.readFileSync(p, "utf8");
      // Cheap pre-filter before JSON.parse; then confirm a real top-level public:false.
      if (/"public"\s*:\s*false/.test(txt)) {
        const j = JSON.parse(txt);
        if (j && j.public === false) {
          fs.rmSync(p, { force: true });
          pruned.push(path.relative(outDir, p));
        }
      }
    } catch {
      /* unreadable/!json → leave it */
    }
  }
  return pruned;
}

/**
 * Scan the shipped output (everything except out/data itself) for `/data/...` references.
 * Returns { concrete, ambiguous } — concrete paths are relative to out/data.
 */
function collectDataReferences() {
  const concrete = new Set();
  const ambiguous = [];
  // The lookbehind keeps this to URLs. Without it, prose and audit strings that merely CONTAIN the
  // substring — `app/public/data/results/lifetime_summary.json` in the capability registry's evidence
  // list — read as live references and pin megabytes nobody serves.
  // A concrete reference ends in a file extension; anything else is a prefix someone concatenates.
  const REF = /(?<![A-Za-z0-9_.-])\/data\/[A-Za-z0-9_@./-]*/g;
  const CONCRETE = /\.[A-Za-z0-9]{1,6}$/;
  for (const file of walkFiles(outDir)) {
    if (file.startsWith(dataDir + path.sep)) continue;
    if (!/\.(html|js|txt|json|xml|map|css)$/.test(file)) continue;
    let txt;
    try {
      txt = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const m of txt.matchAll(REF)) {
      const rel = m[0].slice("/data/".length);
      if (rel && CONCRETE.test(rel)) concrete.add(rel);
      else ambiguous.push({ file: path.relative(outDir, file), ref: m[0] });
    }
  }
  return { concrete, ambiguous };
}

if (!fs.existsSync(dataDir)) {
  console.log("[prune-internal-routes] no out/data — nothing to sweep");
} else if (process.env.GTP_KEEP_PUBLIC_DATA === "1") {
  const prunedData = sweepInternalData(dataDir);
  console.log(
    "[prune-internal-routes] GTP_KEEP_PUBLIC_DATA=1 → out/data kept in full; " +
      `internal (public:false) pruned: ${prunedData.length ? prunedData.join(", ") : "(none)"}`,
  );
} else {
  const { concrete, ambiguous } = collectDataReferences();
  if (ambiguous.length) {
    console.error(
      "[prune-internal-routes] REFUSING to sweep out/data: the build references /data/ paths that are " +
        "assembled at runtime, so no scan can prove which files are needed.",
    );
    for (const a of ambiguous.slice(0, 10)) console.error(`  ${a.file}: ${a.ref}`);
    console.error(
      "  Fix: reference the artifact by a literal path, or add it to ALWAYS_PUBLIC_DATA in this script.",
    );
    process.exit(1);
  }

  const keep = new Set([...ALWAYS_PUBLIC_DATA, ...concrete]);
  let removedFiles = 0;
  let removedBytes = 0;
  for (const p of walkFiles(dataDir)) {
    const rel = path.relative(dataDir, p).split(path.sep).join("/");
    if (keep.has(rel)) continue;
    try {
      removedBytes += fs.statSync(p).size;
    } catch {
      /* size is a report figure, not a gate */
    }
    fs.rmSync(p, { force: true });
    removedFiles += 1;
  }
  // Drop the directories the sweep emptied, then make sure out/data still exists for `build-info --publish`.
  const dropEmpty = (d) => {
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) if (e.isDirectory()) dropEmpty(path.join(d, e.name));
    if (d !== dataDir && fs.readdirSync(d).length === 0) fs.rmdirSync(d);
  };
  dropEmpty(dataDir);
  fs.mkdirSync(dataDir, { recursive: true });

  const kept = [...keep].sort();
  console.log(
    `[prune-internal-routes] out/data swept: removed ${removedFiles} file(s), ` +
      `${(removedBytes / 1e6).toFixed(1)} MB; kept ${kept.length ? kept.join(", ") : "(nothing referenced)"}`,
  );
}
