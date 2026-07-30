/**
 * Product reset Phase A — the 3-pillar nav + simulation-first framing. Pins the pillar spine, the
 * "Simulation Center" framing for the one modelled sport, and the coverage matrix wiring. Updated for
 * the 2026-07-30 public cleanup: /sports, /ufc and /world-cup are retired redirect stubs (the
 * capability registry — MLB the only FULL_MODEL sport — decides what may present as a live center).
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd(); // app/
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");

test("primary nav is the pruned Adoption-Sprint spine: Today · Simulate · Results · How It Works (in order, before the divider); the paper-bankroll products are SECONDARY so the simulation product leads", () => {
  const nav = read("src/components/nav.tsx");
  const dividerAt = nav.indexOf("beforeDivider: true");
  const order = ["/today", "/simulate", "/results", "/learn"];
  let last = -1;
  for (const href of order) {
    const at = nav.indexOf(`href: "${href}"`);
    assert.ok(at > last && at < dividerAt, `${href} is a primary item before the divider, in order`);
    last = at;
  }
  // Bank Builder + Moonshot moved to SECONDARY — they come after the primary spine (the sim product leads).
  assert.ok(nav.indexOf('href: "/bank-builder"') > last, "Bank Builder comes after the primary spine (secondary)");
  assert.ok(nav.indexOf('href: "/moonshot"') > dividerAt, "Moonshot is secondary (after the divider)");
});

test("/sports is retired to a redirect and the nav no longer links it", () => {
  // The 'More Sports' directory listed scaffold sports as equal tiles beside the one FULL_MODEL sport,
  // which overstated coverage however carefully each tile was gated. The route is a redirect stub now,
  // so a stub link would be nav noise — and re-linking it would re-open the overstated directory.
  const nav = read("src/components/nav.tsx");
  assert.ok(!/href: "\/sports"/.test(nav), "nav carries no /sports item");
  assert.match(read("src/app/sports/page.tsx"), /ClientRedirect/, "/sports is a redirect stub, not a directory");
});

test("the ONE modelled sport keeps 'Simulation Center' framing; retired sport routes claim none", () => {
  assert.match(read("src/app/mlb/page.tsx"), /MLB Simulation Center/, "/mlb framed as a Simulation Center (FULL_MODEL)");
  // The World Cup is closed — a redirect stub that must not present itself as a simulation center.
  // /ufc is different: it is a dated ARCHIVE of the one settled card, kept because that record had
  // no other public surface (accountability outranks minimalism). It must claim no simulation
  // center either — an archive of outcomes is not a product.
  const wcSrc = read("src/app/world-cup/page.tsx");
  assert.match(wcSrc, /ClientRedirect/, "src/app/world-cup/page.tsx is a redirect stub");
  assert.ok(!/Simulation Center/.test(wcSrc), "world-cup makes no Simulation Center claim");
  const ufcSrc = read("src/app/ufc/page.tsx");
  assert.match(ufcSrc, /settled|archive/i, "src/app/ufc/page.tsx reads as a settled archive");
  assert.ok(!/Simulation Center/.test(ufcSrc), "ufc makes no Simulation Center claim");
});

test("the coverage matrix is surfaced on the surviving sport page + methodology + simulate", () => {
  for (const rel of ["src/app/mlb/page.tsx", "src/app/methodology/page.tsx", "src/app/simulate/page.tsx"]) {
    assert.match(read(rel), /SimulationCoverageMatrix/, `${rel} renders the coverage matrix`);
  }
});

test("/build is demoted to Advanced Builder (secondary), not a primary pillar", () => {
  assert.match(read("src/app/build/page.tsx"), /Advanced Builder/, "/build titled Advanced Builder");
  const nav = read("src/components/nav.tsx");
  const primary = nav.slice(0, nav.indexOf("beforeDivider: true"));
  assert.ok(!primary.includes('href: "/build"'), "/build is not a primary nav pillar");
});
