/**
 * RETIRED ROUTE DISCOVERY (Restructure Chunk 1, Phase 3) — reduce stale discovery signals WITHOUT
 * deleting or redirecting any route:
 *   • the dead "homer" mobile-nav bucket is gone (Homer Nukes retired 2026-06-30),
 *   • retired routes (/homer-nukes, /trends) are not promoted in any nav surface,
 *   • /trends is noindex (still reachable by direct URL),
 *   • every legacy route file still EXISTS (nothing deleted — only discovery reduced),
 *   • money untouched.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { MOBILE_NAV_ITEMS, resolveMobileNavBucket } from "./nav-active-route.ts";

const NAV_SRC = fs.readFileSync("src/lib/nav-active-route.ts", "utf8");
const TOP_NAV = fs.readFileSync("src/components/nav.tsx", "utf8") + fs.readFileSync("src/lib/navigation.ts", "utf8");
const RAIL = fs.readFileSync("src/components/command-rail.tsx", "utf8") + fs.readFileSync("src/lib/navigation.ts", "utf8");
const GLYPH = fs.readFileSync("src/components/mobile-bottom-nav.tsx", "utf8");

// ── 1 · the dead "homer" bucket is removed ───────────────────────────────────────────────────────
// P196: the surfaces DERIVE their destinations from src/lib/navigation.ts, so a reachability check
// must read the canonical list too — the href no longer appears literally in the surface file. The
// assertion is unchanged; it now looks where the answer actually lives.
test("the dead 'homer' mobile-nav bucket is removed (type, resolver, glyph)", () => {
  assert.ok(!/\|\s*"homer"/.test(NAV_SRC), "MobileNavBucket no longer includes 'homer'");
  assert.ok(!/return "homer"/.test(NAV_SRC), "resolver no longer returns 'homer'");
  assert.ok(!/case "homer"/.test(GLYPH), "the mobile glyph no longer has a 'homer' case");
  assert.equal(resolveMobileNavBucket("/homer-nukes"), null, "retired /homer-nukes → no bucket");
  assert.ok(!MOBILE_NAV_ITEMS.some((i) => i.bucket === "homer"), "no 'homer' item in the mobile spine");
});

// ── 2 · retired routes are not promoted in any nav surface ───────────────────────────────────────
test("retired routes (/homer-nukes, /trends) are not linked in any nav surface", () => {
  for (const href of ["/homer-nukes", "/trends"]) {
    assert.ok(!TOP_NAV.includes(`href: "${href}"`), `top nav does not link ${href}`);
    assert.ok(!RAIL.includes(`href: "${href}"`), `command rail does not link ${href}`);
    assert.ok(!MOBILE_NAV_ITEMS.some((i) => i.href === href), `mobile nav does not link ${href}`);
  }
});

// ── 3 · /trends is noindex (still reachable by URL, just not discoverable) ────────────────────────
test("/trends is noindex", () => {
  const trends = fs.readFileSync("src/app/trends/page.tsx", "utf8");
  assert.match(trends, /export const metadata/, "/trends declares metadata");
  assert.match(trends, /robots:\s*\{\s*index:\s*false/, "/trends is robots index:false");
});

// ── 4 · every legacy route file still EXISTS (nothing deleted — discovery only) ───────────────────
test("legacy/retired route files still exist (no deletions in this chunk)", () => {
  for (const rel of [
    "src/app/trends/page.tsx",
    "src/app/homer-nukes/page.tsx",
    "src/app/board/page.tsx",
    "src/app/projections/page.tsx",
    "src/app/events/page.tsx",
  ]) {
    assert.ok(fs.existsSync(rel), `${rel} still exists (route not deleted)`);
  }
});

// ── 5 · canonical money file untouched ───────────────────────────────────────────────────────────
test("canonical money (portfolio.json) md5 is unchanged", () => {
  const md5 = crypto.createHash("md5").update(fs.readFileSync("public/data/mr-dub/portfolio.json")).digest("hex");
  assert.equal(md5, "affe6b21071f2b3be96bb2774eb347c3");
});
