/**
 * NFL QB props v0 · LEAK CHECK on the built export (post-build phase: reads out/). A build without
 * GTP_NFL_QB_PROPS_PUBLIC=1 carries no QB line on any /nfl/simulation page and no chunk of the component.
 * Run (from app/, after a build): npx tsx --test src/components/nfl/qb-props-export.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), "out");

test("flag-OFF export: no QB line on any simulation page, and no QB-line code in any chunk", (t) => {
  if (!fs.existsSync(path.join(OUT, "index.html"))) { t.skip("no export in this run"); return; }
  if (process.env.GTP_NFL_QB_PROPS_PUBLIC === "1") { t.skip("this build has the flag ON"); return; }
  const simDir = path.join(OUT, "nfl", "simulation");
  const pages = fs.existsSync(simDir) ? fs.readdirSync(simDir).filter((d) => fs.existsSync(path.join(simDir, d, "index.html"))) : [];
  assert.ok(pages.length > 0, "the export has simulation pages to check");
  for (const d of pages) {
    const html = fs.readFileSync(path.join(simDir, d, "index.html"), "utf8");
    assert.ok(!html.includes("data-nfl-qb-props") && !html.includes("Quarterbacks in the simulation"), `${d}: QB line leaked`);
  }
  const chunks = path.join(OUT, "_next", "static", "chunks");
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith(".js") ? [path.join(dir, e.name)] : []));
  for (const f of walk(chunks)) assert.ok(!fs.readFileSync(f, "utf8").includes("Quarterbacks in the simulation"), `${path.relative(OUT, f)}: QB-line code in a flag-OFF chunk`);
});
