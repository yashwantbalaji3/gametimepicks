/**
 * Browser-assurance contract guards (Program 161 · Release C).
 *
 * The contract is only honest while four bindings hold: the routes exist in the route inventory as
 * public+built, the spec derives its list FROM the contract (not a private copy), the playwright
 * config runs that spec on all three engines, and the quality-gate workflow actually executes it.
 * Each binding is asserted here so /launch can never claim coverage the gate stopped providing.
 *
 * Run: npx tsx --test src/lib/launch/browser-assurance.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { BROWSER_ASSURANCE_VERSION, ENGINES, ASSURED_ROUTES } from "./browser-assurance.mjs";

const APP = process.cwd();
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");

test("contract shape: version, three engines, unique routes with a proves clause", () => {
  assert.equal(BROWSER_ASSURANCE_VERSION, 1);
  assert.deepEqual([...ENGINES].sort(), ["chromium", "firefox", "webkit"]);
  assert.ok(ASSURED_ROUTES.length >= 8, "the high-traffic set");
  const routes = ASSURED_ROUTES.map((r) => r.route);
  assert.equal(new Set(routes).size, routes.length, "no duplicate routes");
  for (const r of ASSURED_ROUTES) {
    assert.match(r.route, /^\/[a-z0-9\-/]*$/, r.route);
    assert.ok(r.proves && r.proves.length > 20, `${r.route} states what it proves`);
  }
});

test("every assured route is a PUBLIC BUILT route in the route inventory", () => {
  const inv = JSON.parse(fs.readFileSync(path.resolve(APP, "..", "data", "internal", "audits", "route-inventory-v1.json"), "utf8"));
  const publicBuilt = new Map(inv.routes.filter((r) => r.classification === "public" && r.built).map((r) => [r.route, r]));
  for (const { route } of ASSURED_ROUTES) {
    assert.ok(publicBuilt.has(route), `${route} must be public+built in route-inventory-v1 — assure real surfaces only`);
  }
});

test("the spec imports the contract instead of copying the route list", () => {
  const spec = read("e2e/route-assurance.spec.ts");
  assert.match(spec, /import \{ ASSURED_ROUTES \} from "\.\.\/src\/lib\/launch\/browser-assurance\.mjs"/);
  assert.match(spec, /for \(const \{ route \} of ASSURED_ROUTES\)/, "the baseline loop iterates the contract");
});

test("playwright config runs the spec on webkit and firefox projects (chromium runs every spec)", () => {
  const cfg = read("playwright.config.ts");
  const engineBlocks = cfg.split(/\{\s*name:/).slice(1);
  for (const name of ["webkit-a11y", "firefox-a11y"]) {
    const block = engineBlocks.find((b) => b.includes(`"${name}"`));
    assert.ok(block, `${name} project present`);
    assert.match(block, /route-assurance\\\.spec\\\.ts/, `${name} testMatch includes the assurance spec`);
  }
});

test("the quality-gate workflow executes the assurance spec", () => {
  const wf = fs.readFileSync(path.resolve(APP, "..", ".github", "workflows", "quality-gate.yml"), "utf8");
  assert.match(wf, /playwright test e2e\/accessibility\.spec\.ts e2e\/route-assurance\.spec\.ts/,
    "the browser step must run BOTH specs — a11y alone silently drops the route contract");
});

test("/launch renders the contract, not a homegrown list", () => {
  const page = read("src/app/launch/page.tsx");
  assert.match(page, /import \{ ENGINES, ASSURED_ROUTES \} from "@\/lib\/launch\/browser-assurance\.mjs"/);
  assert.match(page, /ASSURED_ROUTES\.map/);
});
