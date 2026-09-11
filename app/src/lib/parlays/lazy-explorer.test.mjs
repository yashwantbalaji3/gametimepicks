/**
 * The /build/custom explorer loads on first open (P257).
 *
 * Embedded, it made the page grow with every game on the slate (573KB on 373 legs → 886KB on 598, past
 * its 800KB budget), all of it inside a disclosure most readers never open. It now fetches a file the
 * build emits. These pin the delivery: one literal path, emitted statically, fetched only by the
 * wrapper, and absent from the page itself.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const read = (p) => fs.readFileSync(path.join(APP, p), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("the page mounts the lazy wrapper, not the explorer or its data loaders", () => {
  const page = strip(read("src/app/build/custom/page.tsx"));
  assert.match(page, /<LazyParlaysExplorer eligibleCount=/);
  assert.ok(!/ParlaysExplorer slate=|explorerSlateView|buildCoverageMatrix/.test(page), "the explorer's data never renders into the page again");
});

test("one literal path: the wrapper fetches exactly what the static route emits", () => {
  const wrapper = read("src/components/parlays/lazy-parlays-explorer.tsx");
  const m = /EXPLORER_SLATE_URL = "([^"]+)"/.exec(wrapper);
  assert.ok(m, "a literal URL — the post-build /data sweep keeps only files the shipped output references");
  const routeFile = path.join("src/app", ...m[1].slice(1).split("/"), "route.ts");
  assert.ok(fs.existsSync(path.join(APP, routeFile)), `${m[1]} is emitted by ${routeFile}`);
  const route = strip(read(routeFile));
  assert.match(route, /export const dynamic = "force-static"/, "rendered once at build time (static export)");
  assert.match(route, /export function GET\(/);
  assert.match(route, /explorerSlateView\(slate\)/, "the same view the page used to embed");
});

test("the wrapper states failure and offers a retry rather than rendering blank", () => {
  const w = read("src/components/parlays/lazy-parlays-explorer.tsx");
  assert.match(w, /role="alert"/);
  assert.match(w, /Try again/);
  assert.match(w, /role="status"/);
});

test("BUILT · the file ships and the page no longer carries the payload", () => {
  const page = path.join(APP, "out", "build", "custom", "index.html");
  if (!fs.existsSync(page)) return; // no build in this run (CI unit lane)
  const file = path.join(APP, "out", "data", "build", "explorer-slate.json");
  assert.ok(fs.existsSync(file), "the explorer file survives the post-build sweep");
  const body = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(body.artifact, "build-explorer-slate");
  assert.ok(body.slate, "it carries the explorer view");
  const html = fs.readFileSync(page, "utf8");
  assert.match(html, /id="optimizer-coverage"/, "the disclosure's section is still on the page");
  assert.ok(!/detailOmitted/.test(html), "no explorer rows are embedded in the page");
});
