/**
 * The /launch Offered Window panel — derived from the matrix, and confined to the protected build.
 *
 * Run: npx tsx --test src/lib/launch/offered-window-panel.test.mjs
 *
 * P226 · K0. The control plane had no consumer, so its truth existed only in a file nobody read.
 * Two things must hold at once: the operator view must derive every number from the committed
 * matrix rather than restating it, and none of it may cross into the public export.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const PAGE = path.join(APP, "src", "app", "launch", "page.tsx");
const OUT = path.join(APP, "out");

const blank = (m) => m.replace(/[^\n]/g, " ");
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/\/\/.*$/gm, blank);

test("the panel DERIVES from the committed matrix — no typed sport counts, no copied prose", () => {
  const code = strip(fs.readFileSync(PAGE, "utf8"));
  assert.match(code, /data", "internal", "offered-window"/, "it reads the committed matrix");
  assert.match(code, /offeredWindow\.sports/, "and iterates what the matrix says");

  /*
   * SLICE THE PANEL, NOT THE FILE.
   *
   * The first version of this took `code.slice(code.indexOf("offered-window"))` — which lands on the
   * LOADER, several sections above the panel, so the first `</section>` closed somebody else's
   * markup and the panel was never scanned at all. The mutation probe passed with a hardcoded count
   * sitting in it. Anchor on the section's own aria id instead.
   */
  const start = code.indexOf('aria-labelledby="offered-window"');
  assert.ok(start > -1, "the panel section must be findable by its own aria id");
  const panel = code.slice(start, code.indexOf("</section>", start));
  assert.ok(panel.includes("offeredWindow.sports"), "the sliced region must actually be the panel");

  /*
   * The failure this forbids: a panel that hardcodes "MLB 15" or a status sentence goes stale the
   * moment the matrix moves, and then two sources disagree with no way to tell which is right.
   */
  for (const state of ["NOT_YET_CAPTURED", "OFFERED_PRICED", "FORECAST_READY", "WORK_OWED", "NOT_OFFERED"]) {
    assert.ok(
      !new RegExp(`["'\`]${state}["'\`]`).test(panel),
      `the panel names ${state} literally — states must come from the matrix, not from this file`,
    );
  }
  // And no literal sport count either.
  assert.ok(!/\?\s*\d+\s*:/.test(panel.replace(/padding[^,}]*/g, "")), "the panel must not substitute a literal count for a derived one");
});

test("an ABSENT matrix is reported, never filled in", () => {
  const code = strip(fs.readFileSync(PAGE, "utf8"));
  assert.match(code, /No offered-window matrix is committed/, "a missing artifact must say so");
  assert.match(code, /return null;/, "and the loader must fail closed rather than inventing a shape");
});

test("BOUNDARY · /launch is absent from the public export", () => {
  /*
   * A hidden URL is not access control, but shipping the route at all is a separate and avoidable
   * mistake. The public build prunes it; this pins that it stays pruned.
   */
  if (!fs.existsSync(OUT)) return;
  assert.equal(fs.existsSync(path.join(OUT, "launch")), false, "/launch must not be in the public export");
});

test("BOUNDARY · the private matrix never reaches a public page", () => {
  if (!fs.existsSync(OUT)) return;
  const offenders = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "_next") continue;
        walk(full);
      } else if (e.name === "index.html") {
        const t = fs.readFileSync(full, "utf8");
        /*
         * The matrix's own vocabulary and file path. A public page may legitimately say "no games
         * today"; it may not carry the internal state names or point at the private artifact.
         */
        if (/NOT_YET_CAPTURED|JOIN_FAILED|data\/internal\/offered-window/.test(t)) {
          offenders.push(path.relative(OUT, full));
        }
      }
    }
  };
  walk(OUT);
  assert.deepEqual(offenders, [], `the private matrix leaked into:\n  ${offenders.join("\n  ")}`);
});

test("no offered-window artifact is served from the export", () => {
  if (!fs.existsSync(OUT)) return;
  const found = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/offered-window/.test(e.name)) found.push(path.relative(OUT, full));
    }
  };
  walk(OUT);
  assert.deepEqual(found, [], `these are served publicly and should not be:\n  ${found.join("\n  ")}`);
});
