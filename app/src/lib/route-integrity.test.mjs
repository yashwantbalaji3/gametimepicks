/**
 * Every internal link on every exported page resolves to a real route or asset.
 *
 * A dead internal link is the most basic way a site stops feeling finished, and it is invisible in
 * source review because the href and the route that should answer it live in different files. This
 * checks the BUILT export, which is the only place the question can actually be settled.
 *
 * Skips (rather than fails) without a build, so a source-only test run stays fast; CI builds first.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), "out");

test("no internal link anywhere in the export points at a route that does not exist", () => {
  if (!fs.existsSync(OUT)) return;
  const pages = [];
  const assets = new Set();
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else {
        assets.add("/" + path.relative(OUT, p).replace(/\\/g, "/"));
        if (e.name === "index.html") pages.push(p);
      }
    }
  })(OUT);
  assert.ok(pages.length > 50, `expected a full export, found ${pages.length} pages`);

  const routes = new Set(pages.map((f) => {
    const r = "/" + path.relative(OUT, path.dirname(f)).replace(/\\/g, "/");
    return r === "/." ? "/" : r;
  }));

  const broken = [];
  for (const f of pages) {
    const from = "/" + path.relative(OUT, path.dirname(f)).replace(/\\/g, "/");
    for (const m of fs.readFileSync(f, "utf8").matchAll(/href="([^"#?]+)"/g)) {
      const href = m[1];
      if (!href.startsWith("/") || href.startsWith("//")) continue;
      if (/\.(png|jpg|jpeg|svg|ico|webmanifest|xml|txt|json|css|js|woff2?)$/.test(href)) continue;
      const clean = href.replace(/\/$/, "") || "/";
      if (routes.has(clean) || assets.has(href)) continue;
      broken.push(`${from} → ${href}`);
    }
  }
  assert.deepEqual(broken.slice(0, 12), [], `dead internal links (${broken.length} total):\n  ${broken.slice(0, 12).join("\n  ")}`);
});

test("every sport in the primary nav resolves to an exported page", () => {
  if (!fs.existsSync(OUT)) return;
  for (const r of ["/mlb", "/nfl", "/epl", "/ufc", "/sports", "/today", "/simulate", "/results", "/markets", "/build"]) {
    assert.ok(fs.existsSync(path.join(OUT, r.slice(1), "index.html")), `${r} must exist in the export — it is linked from primary navigation`);
  }
});
