/**
 * SPORT-HUB SHELL guards (P208 · Release C).
 *
 * One shared section nav on every hub, fed by one registry. The strongest slate-independent
 * assertion is self-consistency in the bytes people receive: every anchor the rendered strip
 * offers must exist as an id on the same page (the availability filter makes this true on ANY
 * slate — a section that did not render must not be offered), and every route the strip offers
 * must exist in the export. Plus the source contract: all four hubs mount the shared component,
 * none hand-rolls a second section nav.
 *
 * Run: npx tsx --test src/lib/sports/hub-shell.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HUB_SECTIONS } from "./hub-sections.ts";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (p) => fs.readFileSync(path.join(APP, p), "utf8");
const hasBuild = fs.existsSync(path.join(APP, "out", "mlb", "index.html"));

const HUBS = ["mlb", "epl", "ufc", "nfl"];

test("every hub page mounts the shared SportHubNav with its own sport key", () => {
  for (const sport of HUBS) {
    const src = read(`src/app/${sport}/page.tsx`);
    assert.match(src, /from "@\/components\/sports\/sport-hub-nav"/, `${sport}: shared component`);
    assert.match(src, new RegExp(`<SportHubNav[\\s\\S]{0,600}?sport="${sport}"`), `${sport}: its own key`);
  }
});

test("the registry's link targets are real routes in the export", () => {
  if (!hasBuild) return; // no build in this run (CI unit lane)
  for (const sport of HUBS) {
    for (const item of HUB_SECTIONS[sport].filter((i) => i.kind === "link")) {
      const route = item.target.split("?")[0].replace(/^\//, "").replace(/\/$/, "");
      const f = path.join(APP, "out", route, "index.html");
      assert.ok(fs.existsSync(f), `${sport}: link target ${item.target} exists in the export`);
    }
  }
});

test("SELF-CONSISTENT on any slate: every anchor the rendered strip offers exists on its page", () => {
  if (!hasBuild) return; // no build in this run (CI unit lane)
  for (const sport of HUBS) {
    const html = read(`out/${sport}/index.html`);
    assert.match(html, new RegExp(`aria-label="${sport.toUpperCase()} sections"`), `${sport}: strip renders`);
    // The strip's in-page anchors, as actually rendered (post availability-filter).
    const strip = html.match(new RegExp(`<nav[^>]*aria-label="${sport.toUpperCase()} sections"[\\s\\S]*?</nav>`))?.[0] ?? "";
    const offered = [...strip.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
    assert.ok(offered.length >= 2, `${sport}: strip offers at least two in-page sections (got ${offered.length})`);
    for (const id of offered) {
      assert.ok(html.includes(`id="${id}"`), `${sport}: offered anchor #${id} exists on the page`);
    }
    // And every offered anchor is one the registry knows — no page-local inventions.
    const known = new Set(HUB_SECTIONS[sport].filter((i) => i.kind === "anchor").map((i) => i.target));
    for (const id of offered) assert.ok(known.has(id), `${sport}: #${id} is a registry section`);
  }
});

test("anchor targets carry scroll margin so a jump never hides its heading under the chrome", () => {
  for (const sport of HUBS) {
    const src = read(`src/app/${sport}/page.tsx`);
    for (const item of HUB_SECTIONS[sport].filter((i) => i.kind === "anchor")) {
      const at = src.indexOf(`id="${item.target}"`);
      assert.ok(at !== -1, `${sport}: source renders #${item.target}`);
      const around = src.slice(Math.max(0, at - 200), at + 200);
      assert.match(around, /scroll-mt-24/, `${sport}: #${item.target} has scroll margin`);
    }
  }
});
