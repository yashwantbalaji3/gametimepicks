/**
 * ONE destination list, three surfaces — and they must stay in agreement.
 *
 * Before P196 the top nav, mobile bar and command rail were three hand-maintained arrays that had
 * quietly diverged: /build existed only on mobile, /mr-dub was treated two different ways, and the
 * rail offered four destinations the top nav did not. A reader cannot build a mental model of a site
 * whose menu changes shape by device, so these assert the properties that keep it one site.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { NAV_DESTINATIONS, destinationsFor, NAV_GROUP_LABEL } from "./navigation.ts";

const APP = process.cwd();

test("every destination is reachable, and never from ONE surface only", () => {
  for (const d of NAV_DESTINATIONS) {
    assert.ok(d.surfaces.length > 0, `${d.href} appears on no surface — it is unreachable`);
    // Mobile is the shortest list by design; anything it carries must also live elsewhere, or a
    // phone becomes the only route to that page. That is exactly what happened to /build.
    if (d.surfaces.includes("mobile")) {
      assert.ok(d.surfaces.some((s) => s !== "mobile"),
        `${d.href} is mobile-only — a destination must never depend on the viewport`);
    }
  }
});

test("every destination resolves to a real exported route", () => {
  const out = path.join(APP, "out");
  if (!fs.existsSync(out)) return;                       // source-only run
  for (const d of NAV_DESTINATIONS) {
    assert.ok(fs.existsSync(path.join(out, d.href.slice(1), "index.html")),
      `${d.href} is in navigation but has no exported page`);
  }
});

test("the three surfaces are DERIVED, never hand-listed", () => {
  const files = {
    "top nav": "src/components/nav.tsx",
    "command rail": "src/components/command-rail.tsx",
    "mobile bar": "src/lib/nav-active-route.ts",
  };
  for (const [name, rel] of Object.entries(files)) {
    const src = fs.readFileSync(path.join(APP, rel), "utf8");
    assert.match(src, /destinationsFor\(/, `${name} must derive from the canonical list`);
    // A surface that re-declares its own href list has forked again.
    const inlineHrefs = [...src.matchAll(/\{\s*(?:bucket: "[a-z]+",\s*)?href: "\/[a-z-]+", label:/g)];
    assert.equal(inlineHrefs.length, 0,
      `${name} hand-lists ${inlineHrefs.length} destination(s) — that is how the surfaces drifted apart`);
  }
});

test("groups are ordered by the question a reader is asking", () => {
  const order = ["now", "sports", "products", "record"];
  const seen = [];
  for (const d of NAV_DESTINATIONS) if (!seen.includes(d.group)) seen.push(d.group);
  assert.deepEqual(seen, order, "groups must run Now → Sports → Products → Track record");
  for (const g of order) assert.ok(NAV_GROUP_LABEL[g], `${g} has a rendered label`);
});

test("the mobile bar stays thumb-sized", () => {
  const mobile = destinationsFor("mobile");
  assert.ok(mobile.length >= 4 && mobile.length <= 6,
    `mobile carries ${mobile.length} destinations — a bottom bar past six stops being tappable`);
});
