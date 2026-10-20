/**
 * NBA theater · development route gate: no page without GTP_DEV_ROUTES=1 (and no data read), the page guards itself,
 * the prune removes out/dev/ (this route included), the route is in the inventory as a dev-only internal family, and
 * nothing outside the dev tree links to it.
 * Run: npx tsx --test src/lib/simulation-theater/nba/nba-dev-route.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DISABLED_PLACEHOLDER, contentParams, devRoutesEnabled, devStaticParams } from "../dev-routes.mjs";
import { nbaRouteEvents, readArtifact } from "./loader.mjs";
import { ROUTE_TABLE } from "../../audits/route-inventory.mjs";

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const PAGE = "src/app/dev/simulation-theater/nba/[eventId]/page.tsx";
const src = fs.readFileSync(path.join(APP, PAGE), "utf8");

test("without GTP_DEV_ROUTES=1 the NBA route emits only the inert placeholder and reads no artifact", () => {
  let reads = 0;
  const getIds = () => { reads++; return nbaRouteEvents(REPO); };
  for (const env of [{}, { GTP_DEV_ROUTES: "0" }, { GTP_DEV_ROUTES: "true" }, { NEXT_PUBLIC_INTERNAL_ROUTES: "1" }]) {
    assert.equal(devRoutesEnabled(env), false);
    assert.deepEqual(devStaticParams(getIds, env), [{ eventId: DISABLED_PLACEHOLDER }]);
  }
  assert.equal(reads, 0);
  const on = devStaticParams(getIds, { GTP_DEV_ROUTES: "1" });
  const ids = contentParams(on).map((p) => p.eventId);
  // derived from the COMMITTED receipt (never pinned runs, never a fixture): its games, then the slate games its run log
  // names but it does not hold yet (they render "No official forecast receipt for this game yet")
  const r = readArtifact(REPO);
  if (!r.artifact) { assert.deepEqual(ids, [], "no committed receipt in this checkout: no NBA page at all"); return; }
  const inFile = r.artifact.games.map((g) => String(g.providerEventId));
  const logged = r.artifact.runs.flatMap((x) => x.outcomes.map((o) => String(o.providerEventId)));
  assert.ok(ids.length > 0 && ids.length <= 3);
  for (const id of ids) assert.ok(inFile.includes(id) || logged.includes(id), `${id} is neither in the receipt nor in its run log`);
  assert.deepEqual(ids.filter((id) => inFile.includes(id)), inFile.filter((id) => ids.includes(id)), "receipt games come first, in file order");
});

test("the page uses the shared gate, 404s itself when disabled, is noindex, and passes the fixture banner explicitly", () => {
  assert.match(src, /devStaticParams\(\(\) => nbaRouteEvents\(REPO_ROOT\)\)/);
  assert.match(src, /export const dynamicParams = false/);
  assert.match(src, /if \(!devRoutesEnabled\(\) \|\| params\.eventId === DISABLED_PLACEHOLDER/);
  assert.match(src, /notFound\(\)/);
  assert.match(src, /index: false, follow: false/);
  assert.match(src, /fixtureBanner=\{load\.manifest\?\.fixture \? FIXTURE_BANNER : null\}/);
});

test("the production prune deletes out/dev/ (the NBA route is under it) unless GTP_DEV_ROUTES=1", () => {
  const prune = fs.readFileSync(path.join(APP, "scripts/prune-internal-routes.mjs"), "utf8");
  assert.match(prune, /const DEV_ROUTES = process\.env\.GTP_DEV_ROUTES === "1" \? \[\] : \["dev"\];/);
  assert.match(prune, /const INTERNAL_ROUTES = \[[^\]]*\.\.\.DEV_ROUTES/);
  assert.ok(PAGE.startsWith("src/app/dev/"), "the NBA route lives under the pruned dev/ tree");
});

test("route inventory: a dev-only internal family; nothing outside the dev tree and the theater's modules links to it", () => {
  const e = ROUTE_TABLE["/dev/simulation-theater/nba/[eventId]"];
  assert.equal(e?.classification, "internal");
  assert.equal(e?.devOnly, true);
  assert.equal(e?.family, true);
  const offenders = [];
  const walk = (d) => {
    for (const x of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, x.name);
      if (x.isDirectory()) { if (x.name !== "node_modules") walk(p); continue; }
      if (!/\.(tsx?|mjs)$/.test(x.name) || /\.test\./.test(x.name)) continue;
      const rel = path.relative(APP, p);
      if (rel.startsWith("src/app/dev/") || rel.startsWith("src/lib/simulation-theater/") || rel === "src/lib/audits/route-inventory.mjs") continue;
      if (/["'`]\/dev\/simulation-theater\/nba/.test(fs.readFileSync(p, "utf8"))) offenders.push(rel);
    }
  };
  walk(path.join(APP, "src"));
  assert.deepEqual(offenders, []);
});
