/**
 * THE LOCAL GATE MUST RUN EVERYTHING CI RUNS.
 *
 * Three quality-gate runs went red on main while every local report said green, because
 * `npm run a11y` ran e2e/accessibility.spec.ts and CI ran that PLUS e2e/route-assurance.spec.ts.
 * A local gate that is a strict subset of the real one does not reduce risk, it hides it — the
 * failures were a hydration crash on /mlb and seven broken crests on /, both on flagship pages,
 * both live for hours.
 *
 * So the two are pinned together. If CI grows a spec, this fails until the local script grows it too.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const read = (p) => fs.readFileSync(path.join(APP, p), "utf8");

test("npm run a11y runs every spec the quality gate runs", () => {
  const wf = (() => {
    for (const p of ["../.github/workflows/quality-gate.yml", ".github/workflows/quality-gate.yml"]) {
      const full = path.join(APP, p);
      if (fs.existsSync(full)) return fs.readFileSync(full, "utf8");
    }
    return null;
  })();
  if (!wf) return; // no workflow in this checkout

  const ciLine = wf.split("\n").find((l) => /playwright test/.test(l) && /e2e\//.test(l));
  assert.ok(ciLine, "the quality gate no longer names its playwright specs — this guard cannot see them");
  const ciSpecs = [...ciLine.matchAll(/e2e\/[\w.-]+\.spec\.ts/g)].map((m) => m[0]);
  assert.ok(ciSpecs.length > 0, "no specs parsed out of the CI command");

  const local = JSON.parse(read("package.json")).scripts?.a11y ?? "";
  for (const spec of ciSpecs) {
    assert.ok(local.includes(spec),
      `CI runs ${spec} and \`npm run a11y\` does not — a local gate that is a subset of CI hides failures instead of catching them`);
  }
});

test("the route-assurance spec still asserts a clean console", () => {
  // The cheapest way to make this file pass is to stop failing on page errors. It is also how a
  // hydration crash becomes invisible, so the assertion itself is pinned.
  const src = read("e2e/route-assurance.spec.ts");
  assert.match(src, /pageerror/, "route assurance must listen for page errors");
  assert.match(src, /toEqual\(\[\]\)/, "route assurance must require ZERO console/page errors");
});
