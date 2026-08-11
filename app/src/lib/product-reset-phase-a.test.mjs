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

test("/sports revival keeps the retirement's invariant: coverage stated in words, never as equal tiles", () => {
  // The 'More Sports' directory was retired 2026-07-30 because equal sport tiles beside the one
  // FULL_MODEL sport overstated coverage. Release B (Program 148) revived the route by FIXING the
  // overstatement instead of hiding the page: the invariant moves from "the route must not exist"
  // to "the rendered words must state what each sport is not". Nav still does not link it — the
  // strip on the homepage is the deliberate, restrained discovery path.
  // Program 158 IA decision: ONE "Sports · Schedules" nav item exists (secondary group), never
  // four league links — the label carries "Schedules" so it cannot read as a second model hub.
  const nav = read("src/components/nav.tsx");
  const sportsItems = nav.match(/href: "\/sports"/g) ?? [];
  assert.equal(sportsItems.length, 1, "exactly ONE /sports nav item — the canonical discovery path");
  assert.match(nav, /label: "Sports · Schedules"/, "the nav label says Schedules, never a bare sport-hub claim");
  assert.ok(!/href: "\/epl"|href: "\/nfl"|href: "\/ufc-schedule"/.test(nav), "no per-league nav links");
  const page = read("src/app/sports/page.tsx");
  const shared = read("src/components/sports/upcoming-sports.tsx");
  assert.match(page, /not modelled/, "the page itself says these sports are not modelled");
  assert.match(shared, /Schedule only — not modelled/, "coverage state is rendered in words, not implied by layout");
  assert.match(shared, /no simulations, no predictions and no picks/, "every sport section closes with the explicit no-model line");
  assert.match(page, /MLB Simulation Center/, "the one modelled product is named so the contrast is explicit");
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
