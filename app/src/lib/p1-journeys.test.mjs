/**
 * P1-B · one name per destination, and the two "start following" entry points read as one.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

test("🔴 'Today's Picks' names exactly one destination — the picks page (/markets)", () => {
  const files = [...walk(path.join(process.cwd(), "src/components")), ...walk(path.join(process.cwd(), "src/app"))].filter((f) => /\.tsx$/.test(f));
  const hits = [];
  for (const f of files) {
    const src = code(fs.readFileSync(f, "utf8"));
    const re = /Today(?:&rsquo;|’|'|\\')s Picks/g; let m;
    while ((m = re.exec(src))) hits.push({ f: path.relative(process.cwd(), f), near: src.slice(Math.max(0, m.index - 1200), m.index) });
  }
  assert.ok(hits.length >= 1, "the Home picks CTA still exists — otherwise this scan proves nothing");
  for (const h of hits) {
    const href = [...h.near.matchAll(/href[=:]\s*["{]?["`]?([^"`}\s]+)/g)].map((x) => x[1]).at(-1);
    assert.equal(href?.replace(/\/$/, ""), "/markets", `${h.f}: "Today's Picks" must lead to /markets (found ${href})`);
  }
});

test("/today is 'Today' in its H1 and every link label that points at it", () => {
  const header = fs.readFileSync(path.join(process.cwd(), "src/components/today/daily-slate-header.tsx"), "utf8");
  assert.match(header, /<h1[^>]*>\s*Today\s*<\/h1>/);
  const home = fs.readFileSync(path.join(process.cwd(), "src/components/home/home-sections.tsx"), "utf8");
  assert.match(home, /\{ href: "\/today", label: "Open Today" \}/);
});

test("🔴 My GameTime's first run and /following's empty state offer the same styled follow entry points", () => {
  const my = fs.readFileSync(path.join(process.cwd(), "src/components/my/my-gametime.tsx"), "utf8");
  const fm = fs.readFileSync(path.join(process.cwd(), "src/components/follow/following-manager.tsx"), "utf8");
  for (const label of ["MLB teams", "NFL teams"]) {
    assert.ok(my.includes(label), `My GameTime names "${label}"`);
    assert.ok(fm.includes(label), `/following names "${label}"`);
  }
  assert.doesNotMatch(code(my), /fontSize: 11\.5 \}\}>(MLB|NFL)<\/Link>/, "no bare, unstyled sport words");
  const pill = /borderRadius: 999, border: "1px solid var\(--vault-border\)"/;
  assert.match(my, pill); assert.match(fm, pill);
});
