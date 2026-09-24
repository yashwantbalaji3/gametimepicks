/**
 * THE SWEEP MUST ACTUALLY SWEEP (v1.8 · B2).
 *
 * `output: "export"` mirrors ALL of `public/` into `out/`, so `out/data/` starts as a verbatim copy of
 * `public/data/` — an internal working tree that is **963 MB across ~3,240 files** today. Every one of
 * those files is world-readable at its raw URL on a static host, linked or not.
 * `prune-internal-routes.mjs` deletes the ones the built output does not reference: measured
 * 2026-09-23, **3,128 files / 982.3 MB removed, 1,626 files / 47 MB kept — 97% of the tree is copied
 * and then deleted.**
 *
 * The prune is deny-by-default and derives its keep-set from the build, which is the right design. What
 * was missing is a guard on the OUTCOME. Existing tests name individual families that must be absent
 * (`public-data-boundary.test.mjs`); a family nobody thought to name is unguarded, and more importantly
 * **nothing at all notices if the sweep fails open**. Two ways it can:
 * `GTP_KEEP_PUBLIC_DATA=1` (a documented escape hatch) and `NEXT_PUBLIC_INTERNAL_ROUTES=1`. Either one
 * publishes the whole internal tree, and every existing check would still pass.
 *
 * So this asserts the property rather than a list: what is served must stay a small fraction of what
 * exists, the heavy internal families must be absent, and — the half that stops this passing vacuously —
 * the families that genuinely ARE public must be present. A build that emitted nothing would satisfy
 * "nothing internal is served" perfectly.
 *
 * This guard does NOT assert a file count or a byte total. `compare/v1` alone is 1,456 files and grows
 * with the matchup slate; a fixed budget would fail on a busy day and teach everyone to raise it. The
 * ratio is stable because both sides grow together.
 *
 * Run: cd app && npm run build && npx tsx --test src/lib/build/export-data-budget.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const OUT_DATA = path.join(APP, "out", "data");
const PUBLIC_DATA = path.join(APP, "public", "data");

/** Total bytes and file count under a directory. */
function measure(dir) {
  let bytes = 0, files = 0;
  const walk = (d) => {
    let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      try { bytes += fs.statSync(p).size; files += 1; } catch { /* raced away; not this guard's business */ }
    }
  };
  walk(dir);
  return { bytes, files };
}

/**
 * Families that exist in `public/data` for BUILD-TIME reads and must never be SERVED.
 *
 * The distinction this file is really about: `mlb/boards` is read by sixteen source files including the
 * public `/mlb` page, so it must be on disk during static generation — and must still not be a URL.
 * "Needed to build the site" and "part of the site" are different claims.
 */
const MUST_NOT_BE_SERVED = Object.freeze([
  "parlays/optimizer-graded",   // 233 MB
  "parlays/optimizer",          // 181 MB
  "mlb/boards",                 // 202 MB · read at build time by /mlb, never served
  "mlb/game-simulations",       //  72 MB
  "mlb/player-props",           //  48 MB
  "mlb/home-run-props",         //  14 MB
  "mlb/full-game-simulations",  //  10 MB
]);

/** Families the public site really does fetch at runtime. Their ABSENCE means the export is broken. */
const MUST_BE_SERVED = Object.freeze(["compare/v1", "ask/v1", "lab/v1", "mlb/results", "build-info.json"]);

/** The sweep's own escape hatches. Either one publishes the whole tree; both are meant to be loud. */
const SWEEP_DISABLED = process.env.GTP_KEEP_PUBLIC_DATA === "1" || process.env.NEXT_PUBLIC_INTERNAL_ROUTES === "1";

test("REFUSAL: this guard needs a built export, or it proves nothing", () => {
  assert.ok(fs.existsSync(OUT_DATA), "app/out/data is missing — run `npm run build` first");
  assert.ok(fs.existsSync(PUBLIC_DATA), "app/public/data is missing — there is nothing to compare against");
  const pub = measure(PUBLIC_DATA);
  assert.ok(pub.files > 500, `public/data must be the real tree (got ${pub.files} files), or the ratio below is meaningless`);
});

test("POSITIVE CONTROL: the families the public site fetches are present", () => {
  /* Without this the whole file passes for a build that emitted nothing at all — the classic way a
     "nothing leaked" assertion becomes a tautology. */
  for (const fam of MUST_BE_SERVED) {
    const p = path.join(OUT_DATA, fam);
    assert.ok(fs.existsSync(p), `out/data/${fam} must be served — its absence is a broken export, not a clean one`);
  }
  const compare = measure(path.join(OUT_DATA, "compare", "v1"));
  assert.ok(compare.files > 100, `compare/v1 must carry real content (got ${compare.files} files)`);
});

test("no internal data family is served, however large the slate gets", () => {
  const served = [];
  for (const fam of MUST_NOT_BE_SERVED) {
    const { files, bytes } = measure(path.join(OUT_DATA, fam));
    if (files > 0) served.push(`${fam}: ${files} file(s), ${(bytes / 1_048_576).toFixed(1)} MB`);
  }
  assert.deepEqual(served, [], `internal data reached the public export:\n  ${served.join("\n  ")}`);
});

test("the sweep removed the bulk of the mirror — it did not fail open", () => {
  const out = measure(OUT_DATA);
  const pub = measure(PUBLIC_DATA);
  const ratio = out.bytes / pub.bytes;
  /*
   * Measured 2026-09-23: 47 MB served of 963 MB on disk = 4.9%. The ceiling is 20% — far enough above
   * the real figure that a growing slate cannot trip it, and far enough below 100% that a sweep which
   * failed open cannot hide. A fixed byte budget would do neither.
   */
  assert.ok(
    ratio < 0.20,
    `out/data is ${(ratio * 100).toFixed(1)}% of public/data (${(out.bytes / 1_048_576).toFixed(0)} MB of ` +
      `${(pub.bytes / 1_048_576).toFixed(0)} MB, ${out.files} of ${pub.files} files). Above 20% the sweep has ` +
      `failed open and the internal working tree is being published at its raw URLs.`,
  );
  assert.equal(SWEEP_DISABLED, false, "an escape hatch (GTP_KEEP_PUBLIC_DATA / NEXT_PUBLIC_INTERNAL_ROUTES) is set — this export must not ship");
});
