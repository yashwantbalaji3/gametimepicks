/**
 * 3-CLICK RULE — every key user destination must be reachable from the navigation chrome (top nav,
 * desktop command rail, or mobile bottom nav), i.e. ≤1 click from any page, and therefore ≤3 clicks
 * for any drill-down (hub → board → game detail). Guards the discoverability regression class where a
 * flagship page (e.g. /mlb) silently drops out of a nav surface: desktop kept it, mobile lost it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const rail = fs.readFileSync("src/components/command-rail.tsx", "utf8") + fs.readFileSync("src/lib/navigation.ts", "utf8");
const nav = fs.readFileSync("src/components/nav.tsx", "utf8") + fs.readFileSync("src/lib/navigation.ts", "utf8");
const mobileRoute = fs.readFileSync("src/lib/nav-active-route.ts", "utf8");

// The 2026 World Cup is complete — /world-cup and /world-cup-specials are NOT active rail destinations
// anymore (archive only, reachable from results/methodology), so they are not key destinations.
const KEY_DESTINATIONS = [
  "/today", "/picks", "/bank-builder", "/moonshot",
  "/mlb", "/mr-dub", "/results",
];

// P196: the surfaces DERIVE their destinations from src/lib/navigation.ts, so a reachability check
// must read the canonical list too — the href no longer appears literally in the surface file. The
// assertion is unchanged; it now looks where the answer actually lives.
test("desktop rail reaches every key destination in one click", () => {
  for (const href of KEY_DESTINATIONS) {
    assert.ok(rail.includes(`"${href}"`), `command rail links ${href}`);
  }
  // Methodology is one click on desktop too.
  assert.ok(rail.includes('"/methodology"'), "command rail links /methodology");
});

test("MOBILE reaches every key destination from nav chrome (top strip + bottom bar combined)", () => {
  // Mobile chrome = nav.tsx (top strip; dedupes bottom-bar items) + nav-active-route MOBILE items (bottom).
  const mobileChrome = nav + mobileRoute;
  for (const href of KEY_DESTINATIONS) {
    assert.ok(mobileChrome.includes(`"${href}"`), `mobile nav chrome links ${href} (flagship pages must never be desktop-only)`);
  }
  // Methodology is reachable via the Learn hub (one hop → ≤3 clicks); the Learn entry must exist.
  assert.ok(nav.includes('"/learn"'), "mobile links the Learn hub (→ /methodology within 3 clicks)");
});

test("no retired product in primary nav (Homer Nukes stays retired)", () => {
  assert.ok(!nav.includes('"/homer-nukes"'), "mobile/top nav has no Homer Nukes entry");
  assert.ok(!rail.includes('"/homer-nukes"'), "desktop rail has no Homer Nukes entry");
});
