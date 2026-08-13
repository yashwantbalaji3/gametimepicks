/**
 * Alias-destination guard (Program 172 · Release K).
 *
 * THE DEFECT THIS FIXES. Two Playwright redirect tests sat red across releases because their
 * expectation table was a hand-maintained duplicate of routing truth: /parlay-lab was repointed
 * when /picks was retired into /build, and /sports was deliberately revived as a real page. The
 * browser suite caught the drift, but slowly and only in CI — and "known red" is how a broken
 * inbound link hides.
 *
 * The rule this encodes: an alias's expected destination is DERIVED from the route that
 * implements it. Every entry in the e2e table must name a route that really is a redirect, and
 * must expect where that redirect really goes. Both directions are checked, so neither a moved
 * destination nor a retired alias can drift again — and this runs in the fast suite.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const APP_DIR = path.join(APP, "src/app");

/** Every route whose page.tsx is a ClientRedirect, mapped to its literal destination. */
function actualRedirects() {
  const out = new Map();
  const walk = (dir, rel = "") => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs, rel ? `${rel}/${entry.name}` : entry.name);
      else if (entry.name === "page.tsx") {
        const src = fs.readFileSync(abs, "utf8");
        if (!/ClientRedirect/.test(src)) continue;
        const m = src.match(/<ClientRedirect\s+to="([^"]+)"/);
        if (m) out.set(`/${rel}/`, m[1]);
      }
    }
  };
  walk(APP_DIR);
  return out;
}

/** The e2e expectation table, parsed from the spec that owns it. */
function e2eTable() {
  const spec = fs.readFileSync(path.join(APP, "e2e/navigation.spec.ts"), "utf8");
  const block = spec.match(/const REDIRECTS = \[([\s\S]*?)\];/);
  assert.ok(block, "the REDIRECTS table must exist in navigation.spec.ts");
  return [...block[1].matchAll(/\{\s*path:\s*"([^"]+)"\s*,\s*lands:\s*(\/[^,}]+)\s*\}/g)]
    .map(([, p, re]) => ({ path: p, source: re }));
}

const actual = actualRedirects();
const table = e2eTable();

test("every alias the e2e table asserts really IS a redirect route", () => {
  assert.ok(table.length >= 3, "the table must still cover the legacy aliases");
  for (const row of table) {
    assert.ok(actual.has(row.path), `${row.path} is in the e2e redirect table but is not a ClientRedirect route — either it was revived as a real page (drop it from the table) or the alias was deleted`);
  }
});

test("every asserted destination matches where the route actually sends the reader", () => {
  for (const row of table) {
    const dest = actual.get(row.path);
    const re = new RegExp(row.source.slice(1, row.source.lastIndexOf("/")));
    assert.ok(re.test(dest), `${row.path} redirects to "${dest}" but the e2e table expects ${row.source} — the table drifted from the route`);
  }
});

test("a destination lands somewhere that exists — no alias points into a void", () => {
  for (const [from, to] of actual) {
    const clean = to.split("#")[0].replace(/^\/|\/$/g, "");
    const target = path.join(APP_DIR, clean, "page.tsx");
    assert.ok(fs.existsSync(target), `${from} redirects to "${to}" but ${clean}/page.tsx does not exist`);
    assert.notEqual(clean, from.replace(/^\/|\/$/g, ""), `${from} redirects to itself`);
  }
});

test("no redirect chains: an alias never points at another alias (one hop to a real page)", () => {
  for (const [from, to] of actual) {
    const clean = `/${to.split("#")[0].replace(/^\/|\/$/g, "")}/`;
    assert.ok(!actual.has(clean), `${from} → ${to} → ${actual.get(clean)} is a two-hop chain; aliases must reach a real destination in one hop`);
  }
});

test("/sports is a real page, not an alias — the revival is deliberate and stays out of the table", () => {
  assert.ok(!actual.has("/sports/"), "/sports must not be a ClientRedirect (Program 148 · Release B revived it)");
  assert.ok(fs.existsSync(path.join(APP_DIR, "sports/page.tsx")));
  assert.ok(!table.some((r) => r.path === "/sports/"), "/sports must not be asserted as a redirect");
});
