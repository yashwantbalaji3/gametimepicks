/**
 * THE PHONE MENU SHEET (Phase 5O · O504). Two properties this file exists to keep:
 *
 *  1. The sheet is NOT rendered inside the bottom bar. The bar paints `backdrop-filter: blur(14px)`, and a filtered
 *     element is the containing block for every `position: fixed` descendant — so a sheet nested in it resolved its
 *     `inset-0` against the bar (measured 375×56 at 375px) and every destination the bar lacks was unreachable.
 *  2. Saved Forecasts is in the canonical NOW group, so the rail and this sheet list it with the other "now"
 *     destinations instead of painting a second "Main" heading under Track record — and it is near the top of the
 *     sheet, i.e. two taps from any phone screen (Menu → Saved Forecasts).
 *
 * Run: npx tsx --test src/lib/uiux/mobile-menu-sheet.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { NAV_DESTINATIONS, destinationsFor } from "../navigation.ts";
import { MOBILE_NAV_ITEMS } from "../nav-active-route.ts";

const src = fs.readFileSync("src/components/mobile-bottom-nav.tsx", "utf8");

test("the sheet renders outside the backdrop-filtered bar (its containing block must be the viewport)", () => {
  assert.match(src, /backdropFilter/, "the bar still paints a backdrop filter — that is what makes this rule necessary");
  const navClose = src.indexOf("</nav>");
  const sheetRender = src.indexOf("<MenuSheet");
  assert.ok(navClose > 0 && sheetRender > navClose, "<MenuSheet> must be rendered AFTER </nav>, never inside the filtered bar");
});

test("Saved Forecasts sits in the now group and near the top of the sheet — two taps at 375px", () => {
  const saved = NAV_DESTINATIONS.find((d) => d.href === "/saved");
  assert.ok(saved, "/saved is a canonical destination");
  assert.equal(saved.group, "now");
  assert.ok(saved.surfaces.includes("rail"), "the sheet renders the rail's destinations");
  const barHrefs = new Set(MOBILE_NAV_ITEMS.map((i) => i.href));
  const sheet = destinationsFor("rail").filter((d) => !barHrefs.has(d.href));
  const at = sheet.findIndex((d) => d.href === "/saved");
  assert.ok(at >= 0 && at < 4, `Saved Forecasts is item ${at + 1} of the sheet — it must stay in the first few rows`);
  // One heading per group: a "now" entry listed after the record group would paint a second "Main".
  const headings = sheet.map((d) => d.group).filter((g, i, a) => g !== a[i - 1]);
  assert.deepEqual(headings, [...new Set(headings)], `the sheet paints a repeated group heading: ${headings.join(" → ")}`);
});

test("the Saved count comes from the browser-local store only — no account or sync claim", () => {
  assert.match(src, /useSavedForecasts/);
  assert.match(src, /savedCount > 0/);
  assert.match(src, /on this device/);
  /* RENDERED copy only: the comments explain WHY there is no account, and scanning them made this guard
     fail on its own rationale — a noisy guard is as bad as a vacuous one. */
  const code = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
  assert.doesNotMatch(code, /sync|account|cloud|signed in/i);
});
