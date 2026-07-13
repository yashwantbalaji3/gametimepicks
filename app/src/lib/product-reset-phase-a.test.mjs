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

test("primary nav is the 3-pillar spine: Simulate · Bank Builder · Moonshot · Today · Results (in order, before the divider)", () => {
  const nav = read("src/components/nav.tsx");
  const primary = nav.slice(0, nav.indexOf("beforeDivider: true"));
  const order = ["/simulate", "/bank-builder", "/moonshot", "/today", "/results"];
  let last = -1;
  for (const href of order) {
    const at = primary.indexOf(`href: "${href}"`);
    assert.ok(at > last, `${href} is a primary pillar, in order`);
    last = at;
  }
  // Moonshot is now a primary pillar (was secondary).
  assert.ok(primary.includes('href: "/moonshot"'), "Moonshot promoted to a primary pillar");
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
