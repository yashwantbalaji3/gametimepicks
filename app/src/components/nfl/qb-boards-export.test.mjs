/**
 * NFL QB market boards · LEAK CHECK on the built export (post-build phase: reads out/). A build without
 * GTP_NFL_QB_BOARDS_PUBLIC=1 carries no QB boards on /nfl and no chunk of the component.
 * Run (from app/, after a build): npx tsx --test src/components/nfl/qb-boards-export.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), "out");

test("flag-OFF export: no QB boards on /nfl, and no QB-boards code in any chunk", (t) => {
  if (!fs.existsSync(path.join(OUT, "index.html"))) { t.skip("no export in this run"); return; }
  if (process.env.GTP_NFL_QB_BOARDS_PUBLIC === "1") { t.skip("this build has the flag ON"); return; }
  const hub = path.join(OUT, "nfl", "index.html");
  assert.ok(fs.existsSync(hub), "the export has the /nfl hub");
  const html = fs.readFileSync(hub, "utf8");
  assert.ok(!html.includes("data-nfl-qb-boards") && !html.includes("Quarterback markets in the simulation"), "/nfl: QB boards leaked");
  const chunks = path.join(OUT, "_next", "static", "chunks");
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith(".js") ? [path.join(dir, e.name)] : []));
  for (const f of walk(chunks)) assert.ok(!fs.readFileSync(f, "utf8").includes("Quarterback markets in the simulation"), `${path.relative(OUT, f)}: QB-boards code in a flag-OFF chunk`);
});
