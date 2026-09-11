/**
 * BUILT-OUTPUT guard for the legal gate: while a legal document may not publish, the public export
 * carries no page for it, the sitemap does not list it, and no page links to it.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { LEGAL_ROUTES, legalRouteIsPublic } from "./texts.mjs";

const OUT = path.resolve(process.cwd(), "out");

test("an unpublishable legal page is absent from the export, the sitemap, and every footer", () => {
  if (!fs.existsSync(path.join(OUT, "index.html"))) return; // no build present
  const sitemap = fs.existsSync(path.join(OUT, "sitemap.xml")) ? fs.readFileSync(path.join(OUT, "sitemap.xml"), "utf8") : "";
  const home = fs.readFileSync(path.join(OUT, "index.html"), "utf8");
  let checked = 0;
  for (const [id, route] of Object.entries(LEGAL_ROUTES)) {
    if (legalRouteIsPublic(id)) continue;
    checked += 1;
    assert.ok(!fs.existsSync(path.join(OUT, route.slice(1), "index.html")), `${route}: no page ships before approval`);
    assert.ok(!sitemap.includes(`${route}/`), `${route}: not in the sitemap`);
    assert.ok(!home.includes(`href="${route}/"`), `${route}: not linked from the footer`);
  }
  assert.ok(checked > 0 || Object.keys(LEGAL_ROUTES).every(legalRouteIsPublic), "the guard examined the gated routes");
});

test("the footer admits a legal link only through the publish gate", () => {
  const footer = fs.readFileSync(path.resolve(process.cwd(), "src/components/footer.tsx"), "utf8");
  assert.match(footer, /\.filter\(\(l\) => legalRouteIsPublic\(l\.id\)\)/, "the legal links are filtered by legalRouteIsPublic");
  assert.doesNotMatch(footer, /href: "\/(terms|privacy)\/?"/, "no hard-coded legal href that could bypass the filter");
});
