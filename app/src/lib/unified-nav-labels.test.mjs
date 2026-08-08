/**
 * UNIFIED NAV LABELS (Restructure Chunk 1) — one public label per route across ALL nav surfaces:
 *   desktop top nav (components/nav.tsx) · desktop command rail (components/command-rail.tsx) ·
 *   mobile bottom nav (lib/nav-active-route.ts MOBILE_NAV_ITEMS) · footer (components/footer.tsx).
 *
 * Specific fixes locked in: /picks is "Build-a-Pick" everywhere (never "Parlay Lab" in a nav surface);
 * /mr-dub is "Mr. Dub's Portfolio" (Program 139 founder rename, was "Daily Dashboard"); /moonshot is
 * "Longshot Lab" as a nav label. Money is display-only here and must be untouched.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { MOBILE_NAV_ITEMS } from "./nav-active-route.ts";

const NAV = fs.readFileSync("src/components/nav.tsx", "utf8");
const RAIL = fs.readFileSync("src/components/command-rail.tsx", "utf8");
const FOOTER = fs.readFileSync("src/components/footer.tsx", "utf8");
const mobileByHref = Object.fromEntries(MOBILE_NAV_ITEMS.map((i) => [i.href, i.label]));

// The unified label for each route (the single public name it must carry on every surface it appears on).
const UNIFIED = {
  "/simulate": "Simulate",
  "/today": "Today",
  "/results": "Results",
  "/bank-builder": "Bank Builder",
  "/mlb": "MLB",
  "/world-cup": "World Cup",
  "/world-cup-specials": "Soccer Specials",
  "/moonshot": "Moonshot",
  "/mr-dub": "Mr. Dub's Portfolio",
  "/learn": "How It Works",
};

// ── 1 · desktop top nav uses the unified labels ──────────────────────────────────────────────────
test("desktop top nav (nav.tsx) uses the unified labels", () => {
  for (const [href, label] of Object.entries(UNIFIED)) {
    if (!NAV.includes(`href: "${href}"`)) continue; // only assert on routes this surface carries
    assert.ok(NAV.includes(`href: "${href}", label: "${label}"`), `nav.tsx: ${href} → "${label}"`);
  }
});

// ── 2 · desktop command rail uses the unified labels ─────────────────────────────────────────────
test("command rail (command-rail.tsx) uses the unified labels", () => {
  for (const [href, label] of Object.entries(UNIFIED)) {
    if (!RAIL.includes(`href: "${href}"`)) continue;
    assert.ok(RAIL.includes(`href: "${href}", label: "${label}"`), `rail: ${href} → "${label}"`);
  }
});

// ── 3 · mobile bottom nav uses the unified labels ────────────────────────────────────────────────
test("mobile bottom nav (MOBILE_NAV_ITEMS) uses the unified labels", () => {
  for (const [href, label] of Object.entries(UNIFIED)) {
    if (!(href in mobileByHref)) continue;
    assert.equal(mobileByHref[href], label, `mobile: ${href} → "${label}"`);
  }
});

// ── 4 · Picks Lab is RETIRED (Program 143) — no nav surface may link or label it ───
test("Picks Lab is retired: no nav surface links /picks, and its old labels stay dead", () => {
  // The inversion of the original guard: it used to require the label everywhere; now the same
  // canonical-label principle requires its ABSENCE everywhere, so a nav item pointing at a
  // redirect stub cannot quietly come back.
  assert.ok(!NAV.includes(`href: "/picks"`), "top nav must not link the retired route");
  assert.ok(!RAIL.includes(`href: "/picks"`), "rail must not link the retired route");
  assert.equal(mobileByHref["/picks"], undefined, "mobile must not link the retired route");
  assert.ok(!/href="\/picks"/.test(FOOTER), "footer must not link the retired route");
  // No nav surface resurrects any of its labels.
  for (const bad of ["Parlay Lab", "Build-a-Pick", "Picks Lab"]) {
    assert.ok(!new RegExp(`label: "${bad}"`).test(NAV) && !new RegExp(`label: "${bad}"`).test(RAIL), `no '${bad}' nav label`);
    assert.ok(!MOBILE_NAV_ITEMS.some((i) => i.label === bad), `no '${bad}' mobile label`);
    assert.ok(!new RegExp(`>${bad}<`).test(FOOTER), `footer no longer links '${bad}'`);
  }
});

// ── 5 · /mr-dub is "Mr. Dub's Portfolio" everywhere; never 'Track Record' as a nav label ───
test("/mr-dub is \"Mr. Dub's Portfolio\" in nav; 'Track Record'/'Daily Dashboard' are not nav labels", () => {
  assert.ok(NAV.includes(`href: "/mr-dub", label: "Mr. Dub's Portfolio"`), "top nav");
  assert.ok(RAIL.includes(`href: "/mr-dub", label: "Mr. Dub's Portfolio"`), "rail");
  assert.equal(mobileByHref["/mr-dub"], "Mr. Dub's Portfolio", "mobile");
  // "Mr. Dub" alone is still forbidden — the label must be the full "Mr. Dub's Portfolio",
  // never the bare codename. The exact-match regex below distinguishes them.
  for (const bad of ["Mr. Dub", "Track Record", "Daily Dashboard"]) {
    assert.ok(!new RegExp(`label: "${bad.replace(".", "\\.")}"`).test(NAV), `no '${bad}' label in top nav`);
    assert.ok(!new RegExp(`label: "${bad.replace(".", "\\.")}"`).test(RAIL), `no '${bad}' label in rail`);
    assert.ok(!MOBILE_NAV_ITEMS.some((i) => i.label === bad), `no '${bad}' mobile label`);
  }
});

// ── 6 · canonical money file untouched ───────────────────────────────────────────────────────────
test("canonical money (portfolio.json) md5 is unchanged", () => {
  const md5 = crypto.createHash("md5").update(fs.readFileSync("public/data/mr-dub/portfolio.json")).digest("hex");
  assert.equal(md5, "affe6b21071f2b3be96bb2774eb347c3", "portfolio.json must be untouched by label changes");
});
