/**
 * Route-inventory guards (Program 159 · Release A).
 *
 * Run: npx tsx --test src/lib/audits/route-inventory.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { buildRouteInventory, discoverRoutes, ROUTE_TABLE } from "./route-inventory.mjs";

const APP = process.cwd();
const NOW = "2026-08-11T03:15:00Z";
const appDir = path.join(APP, "src", "app");

test("every discovered source route is explained by the table — an unexplained route would be a P0", () => {
  const inv = buildRouteInventory({ now: NOW, appDir });
  assert.equal(inv.totals.findings, 0, JSON.stringify(inv.findings.slice(0, 3)));
  for (const r of inv.routes) {
    assert.ok(r.owner && r.purpose && r.classification, `${r.route}: schema completeness`);
    if (r.classification === "redirect") assert.ok(ROUTE_TABLE[r.redirectTo], `${r.route}: redirect target known`);
  }
  assert.equal(inv.routes.length, discoverRoutes(appDir).length, "one record per source route");
});

test("DETERMINISM · same inputs produce identical bytes", () => {
  const a = JSON.stringify(buildRouteInventory({ now: NOW, appDir }));
  const b = JSON.stringify(buildRouteInventory({ now: NOW, appDir }));
  assert.equal(a, b);
});

test("CONTRADICTIONS fire fail-closed: internal nav link and unknown nav link are P0s", () => {
  const internal = buildRouteInventory({ now: NOW, appDir, navSources: [{ name: "test-nav", source: 'href="/launch"' }] });
  assert.ok(internal.findings.some((f) => f.severity === "P0" && /nav-internal/.test(f.id)), "linking an internal route is a P0");
  const unknown = buildRouteInventory({ now: NOW, appDir, navSources: [{ name: "test-nav", source: 'href="/totally-made-up"' }] });
  assert.ok(unknown.findings.some((f) => f.severity === "P0" && /nav-unknown/.test(f.id)), "linking an unknown route is a P0");
});

test("the committed artifact reconciles all three layers with zero findings and stays private", () => {
  const artifact = JSON.parse(fs.readFileSync(path.resolve(APP, "..", "data", "internal", "audits", "route-inventory-v1.json"), "utf8"));
  assert.equal(artifact.dataClass, "PRIVATE_AUDIT");
  assert.equal(artifact.totals.p0, 0, "zero engineering-owned P0s — the launch-blocker bar");
  assert.equal(artifact.totals.findings, 0, "the route surface is clean, mechanically");
  assert.equal(artifact.totals.routes, 51); // P169-J added /nfl (public, owned in ROUTE_TABLE)
  // The built layer was actually exercised (not UNVERIFIED) for concrete public routes.
  const home = artifact.routes.find((r) => r.route === "/");
  assert.equal(home.built, true, "the committed run reconciled against a real export");
  // And no inventory content exists under public data.
  const pub = path.join(APP, "public", "data");
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((x) => x.isDirectory() ? walk(path.join(d, x.name)) : x.name.endsWith(".json") && /"artifact":\s*"route-inventory"/.test(fs.readFileSync(path.join(d, x.name), "utf8")) ? [path.join(d, x.name)] : []);
  assert.deepEqual(walk(pub), []);
});
