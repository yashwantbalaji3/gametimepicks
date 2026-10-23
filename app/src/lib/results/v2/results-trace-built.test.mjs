/**
 * THE RESULTS TRACE, AGAINST THE BUILT EXPORT (founder 2026-10-23). Each settled game on a /results/date/<d>/ page
 * links its Official Forecast (the exported page that published the pregame forecast) and its sport's Model
 * Performance pages. A trace link to a page the deploy did not export would be worse than no link, so every one is
 * proven against out/. Post-build: skips when out/ is absent (unit lane).
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), "out");
const DAYS = path.join(OUT, "results/date");

const exported = (href) => {
  const p = href.split("#")[0].split("?")[0];
  return fs.existsSync(path.join(OUT, p, "index.html")) || fs.existsSync(path.join(OUT, p));
};

test("🔴 every trace and Model Performance link on the day pages opens an exported page", (t) => {
  if (!fs.existsSync(DAYS)) return t.skip("post-build: out/results/date is emitted by the build");
  let links = 0;
  let traced = 0;
  const missing = [];
  for (const d of fs.readdirSync(DAYS)) {
    const f = path.join(DAYS, d, "index.html");
    if (!fs.existsSync(f)) continue;
    const html = fs.readFileSync(f, "utf8");
    for (const block of html.match(/data-(?:trace|model-performance)="true"[\s\S]*?<\/p>/g) ?? []) {
      for (const [, href] of block.matchAll(/href="([^"]+)"/g)) {
        links += 1;
        if (!exported(href)) missing.push(`${d}: ${href}`);
      }
      if (block.startsWith("data-trace")) traced += 1;
    }
  }
  assert.deepEqual(missing.slice(0, 20), [], `${missing.length} trace links point at no exported page`);
  assert.ok(traced > 0 && links > 0, "the day pages carry the trace");
});
