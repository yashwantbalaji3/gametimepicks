/**
 * UNIFIED NAV LABELS (Restructure Chunk 1) — one public label per route across ALL nav surfaces:
 *   desktop top nav (components/nav.tsx) · desktop command rail (components/command-rail.tsx) ·
 *   mobile bottom nav (lib/nav-active-route.ts MOBILE_NAV_ITEMS) · footer (components/footer.tsx).
 *
 * Specific fixes locked in: /picks is "Build-a-Pick" everywhere (never "Parlay Lab" in a nav surface);
 * /mr-dub is "Daily Dashboard" (never "Mr. Dub" or "Track Record" in a nav surface); /moonshot is
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
  "/today": "Today's Picks",
  "/results": "Results",
  "/bank-builder": "Bank Builder",
  "/games": "Game Reports",
  "/mlb": "MLB",
  "/world-cup": "World Cup",
  "/picks": "Build-a-Pick",
  "/world-cup-specials": "Soccer Specials",
  "/moonshot": "Longshot Lab",
  "/mr-dub": "Daily Dashboard",
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

// ── 4 · /picks has ONE label ("Build-a-Pick") on every surface; "Parlay Lab" is not a nav label ───
test("/picks is 'Build-a-Pick' on every surface; no 'Parlay Lab' nav label survives", () => {
  assert.ok(NAV.includes(`href: "/picks", label: "Build-a-Pick"`), "top nav");
  assert.ok(RAIL.includes(`href: "/picks", label: "Build-a-Pick"`), "rail");
  assert.equal(mobileByHref["/picks"], "Build-a-Pick", "mobile");
  assert.ok(/href="\/picks"[^>]*>Build-a-Pick</.test(FOOTER), "footer links /picks as Build-a-Pick");
  // No nav surface labels a link "Parlay Lab" any more.
  assert.ok(!/label: "Parlay Lab"/.test(NAV) && !/label: "Parlay Lab"/.test(RAIL), "no 'Parlay Lab' nav label");
  assert.ok(!MOBILE_NAV_ITEMS.some((i) => i.label === "Parlay Lab"), "no 'Parlay Lab' mobile label");
  assert.ok(!/>Parlay Lab</.test(FOOTER), "footer no longer links 'Parlay Lab'");
});

// ── 5 · /mr-dub is 'Daily Dashboard' publicly; never 'Mr. Dub' or 'Track Record' as a nav label ───
test("/mr-dub is 'Daily Dashboard' in nav; 'Mr. Dub'/'Track Record' are not nav labels", () => {
  assert.ok(NAV.includes(`href: "/mr-dub", label: "Daily Dashboard"`), "top nav");
  assert.ok(RAIL.includes(`href: "/mr-dub", label: "Daily Dashboard"`), "rail");
  assert.equal(mobileByHref["/mr-dub"], "Daily Dashboard", "mobile");
  for (const bad of ["Mr. Dub", "Track Record"]) {
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
