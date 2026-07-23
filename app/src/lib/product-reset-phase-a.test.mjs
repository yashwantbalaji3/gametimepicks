/**
 * Product reset Phase A — the 3-pillar nav + simulation-first framing. Pins the pillar spine, the
 * "Simulation Center" framing per sport, the coverage matrix wiring, and that /sports is no longer orphaned.
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

test("/sports is linked as 'More Sports' (no longer orphaned)", () => {
  const nav = read("src/components/nav.tsx");
  assert.match(nav, /href: "\/sports", label: "More Sports"/, "nav links /sports as More Sports");
});

test("per-sport pages carry 'Simulation Center' framing", () => {
  assert.match(read("src/app/mlb/page.tsx"), /MLB Simulation Center/, "/mlb framed as a Simulation Center");
  assert.match(read("src/app/world-cup/page.tsx"), /World Cup Simulation Center/, "/world-cup framed as a Simulation Center");
  assert.match(read("src/app/ufc/page.tsx"), /UFC Simulation Center/, "/ufc framed as a Simulation Center");
});

test("the coverage matrix is surfaced on the sport pages + methodology + simulate", () => {
  for (const rel of ["src/app/mlb/page.tsx", "src/app/world-cup/page.tsx", "src/app/methodology/page.tsx", "src/app/simulate/page.tsx"]) {
    assert.match(read(rel), /SimulationCoverageMatrix/, `${rel} renders the coverage matrix`);
  }
});

test("/build is demoted to Advanced Builder (secondary), not a primary pillar", () => {
  assert.match(read("src/app/build/page.tsx"), /Advanced Builder/, "/build titled Advanced Builder");
  const nav = read("src/components/nav.tsx");
  const primary = nav.slice(0, nav.indexOf("beforeDivider: true"));
  assert.ok(!primary.includes('href: "/build"'), "/build is not a primary nav pillar");
});
