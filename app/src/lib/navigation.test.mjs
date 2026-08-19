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

test("every surface is DERIVED, never hand-listed", () => {
  const files = {
    "top nav": "src/components/nav.tsx",
    "command rail": "src/components/command-rail.tsx",
    "mobile bar": "src/lib/nav-active-route.ts",
    // P185: the footer was the last hand-maintained surface, and it had drifted exactly the way the
    // other three had — it omitted UFC (a LIVE sport), EPL, Moonshot, Homer Nukes and Mr. Dub.
    footer: "src/components/footer.tsx",
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

test("the footer promises a sitemap, so it must carry the WHOLE site", () => {
  /*
   * A footer labelled "Site map" that lists two thirds of the destinations is worse than no footer:
   * it reads as the complete answer. Every canonical destination therefore carries the footer
   * surface, and this fails if one is ever dropped from it.
   */
  const footer = destinationsFor("footer");
  const missing = NAV_DESTINATIONS.filter((d) => !d.surfaces.includes("footer"));
  assert.deepEqual(missing.map((d) => d.href), [],
    "these destinations exist but the sitemap does not list them");
  for (const href of ["/ufc", "/epl", "/moonshot", "/homer-nukes", "/mr-dub"]) {
    assert.ok(footer.some((d) => d.href === href),
      `${href} must appear in the footer — it was one of the five the hand-written footer lost`);
  }
});

test("a mobile short label is an abbreviation of the real one, never a different word", () => {
  /*
   * The bottom bar paints `shortLabel` while the ACCESSIBLE name stays `label`. WCAG 2.5.3
   * (Label in Name) requires the visible text to appear within the accessible name, so a short form
   * that is not a substring would break voice control: a user saying what they can see would not
   * match what the control is called.
   */
  for (const d of NAV_DESTINATIONS) {
    if (!d.shortLabel) continue;
    assert.ok(d.label.toLowerCase().includes(d.shortLabel.toLowerCase()),
      `"${d.shortLabel}" is not contained in "${d.label}" — voice control would not match it`);
    assert.ok(d.shortLabel.length < d.label.length, `"${d.shortLabel}" does not shorten anything`);
  }
});

test("the mobile bar fits a thumb row without clipping its last label", () => {
  /*
   * Measured in the browser at 390px: the bar overflowed by 75px, and "MR. DUB'S PORTFOLIO" alone
   * rendered 132px against a 58px basis, leaving the trailing label permanently half-cut behind a
   * hidden scrollbar. This is the cheap static proxy for that measurement — the real check runs in
   * e2e/p185-shell.spec.ts against a live viewport. A character budget cannot prove pixels, but it
   * catches the regression that actually happens: someone gives a destination a longer name.
   */
  const mobile = destinationsFor("mobile");
  const BUDGET = 9;                       // chars at 10px mono + 0.08em tracking inside a 58px cell
  for (const d of mobile) {
    const painted = d.shortLabel ?? d.label;
    assert.ok(painted.length <= BUDGET,
      `the bottom bar paints "${painted}" (${painted.length} chars) for ${d.href} — over the ` +
      `${BUDGET}-char budget, which is what pushed the trailing item off-screen. Add a shortLabel.`);
  }
});

test("a coverage note adds information rather than repeating the label", () => {
  /*
   * "/sports" is labelled "Sports · Schedules". Giving it note: "schedules" rendered
   * "Sports · Schedules · schedules" in the footer — a note whose only content is already in the
   * label is noise wearing the costume of state.
   */
  for (const d of NAV_DESTINATIONS) {
    if (!d.note) continue;
    assert.ok(!d.label.toLowerCase().includes(d.note.toLowerCase()),
      `${d.href}: note "${d.note}" already appears in label "${d.label}" — it reads as a stutter`);
  }
});
