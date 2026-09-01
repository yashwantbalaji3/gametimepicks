/**
 * EVERY REMOTE IMAGE FALLBACK COVERS BOTH FAILURE WINDOWS — Program 230 · incident guard.
 *
 * Run: npx tsx --test src/lib/ui/image-failure.test.mjs
 *
 * The site is a static export, so the browser fetches images while parsing SSR HTML — before the
 * React bundle has loaded. An image that fails in that window fires `error` at a DOM node with no
 * handler attached, and the event neither queues nor replays: React hydrates, attaches `onError`,
 * and waits for something that already happened. The broken-image icon stays forever.
 *
 * Five components carried a correct `onError` and could not pass the P214 identity fixture because
 * of it — 42 MLB team logos on `/`, 12 UFC portraits on `/ufc/`. `onError` alone is only half the
 * contract, so this guard requires both halves at every owner.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { reportIfAlreadyFailed } from "./image-failure.ts";

/** Minimal stand-ins for the three states the browser can present at commit time. */
const img = (complete, naturalWidth) => ({ complete, naturalWidth });

test("an image that already failed is reported", () => {
  let called = 0;
  reportIfAlreadyFailed(img(true, 0), () => called++);
  assert.equal(called, 1, "complete with no intrinsic width is the browser's record of a failure");
});

test("REFUSAL · a loaded image and a not-yet-started lazy image are NOT failures", () => {
  let called = 0;
  reportIfAlreadyFailed(img(true, 120), () => called++);
  assert.equal(called, 0, "a loaded image must not be replaced by its fallback");

  /* `loading="lazy"` images the browser has not begun report complete === false. Treating those as
     failures would blank every below-the-fold avatar on first paint. */
  reportIfAlreadyFailed(img(false, 0), () => called++);
  assert.equal(called, 0, "a deferred image is not a failed one");
});

test("REFUSAL · null is safe — React calls a ref with null on unmount", () => {
  /* When the fallback replaces the image the img unmounts, and React invokes the ref with null.
     Acting on that would loop: report → fallback → unmount → report. */
  let called = 0;
  assert.doesNotThrow(() => reportIfAlreadyFailed(null, () => called++));
  assert.equal(called, 0);
});

test("EVERY owner of a remote <img> handles BOTH windows", () => {
  /*
   * The failure this prevents is a new component shipping a correct `onError` and inheriting the
   * race — which is exactly how all five existing owners got it. Scanning by `onError` finds them
   * by the thing they all do right.
   */
  const root = path.join(process.cwd(), "src/components");
  const files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".tsx")) files.push(p);
    }
  };
  walk(root);

  const uncovered = [];
  for (const f of files) {
    const src = fs.readFileSync(f, "utf8");
    /* Strip comments first: several of these files EXPLAIN the race in prose, and a scan that
       cannot tell an explanation from code fails on the sentence describing the bug it prevents.
       (Seventh appearance of this class in this repo.) */
    const code = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/\/\/.*$/gm, "");
    if (!/<img\b/.test(code) || !/onError=/.test(code)) continue;
    /* Require the WIRING, not the identifier. Matching the bare name passes on the leftover import
       alone — this guard did exactly that when first written, and reported a component whose `ref`
       had been deleted as covered. A guard satisfied by an unused import is not a guard. */
    if (!/ref=\{[^}]*reportIfAlreadyFailed/.test(code)) uncovered.push(path.relative(process.cwd(), f));
  }

  assert.deepEqual(
    uncovered,
    [],
    `these render a remote <img> with onError but never check whether it ALREADY failed: ${uncovered.join(", ")}`,
  );
});
