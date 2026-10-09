/**
 * UX-001 (2026-10-09) · A <style> ELEMENT TAKES ITS CSS AS RAW HTML, NEVER AS A REACT TEXT CHILD.
 *
 * `<style>{CSS}</style>` renders on the server with ">" escaped to "&gt;", and a <style> element's text is never
 * decoded, so the static page shipped ".nf-split &gt; div" — a broken rule — while the browser's render kept ">".
 * React saw different text, threw #425 → #418 → #423 on every NFL hub and game page (7 and 9 errors) and discarded
 * the server HTML to re-render the page on the client. `dangerouslySetInnerHTML` writes the CSS byte for byte on both.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const SRC = path.join(process.cwd(), "src");
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : /\.tsx$/.test(e.name) ? [path.join(d, e.name)] : []);

test("🔴 no <style> element takes its CSS as a React text child", () => {
  // The pattern only spans real attributes (name, name="…", name={…}), so a dangerouslySetInnerHTML element whose CSS
  // contains ">" is never mistaken for a text child.
  const probe = (x) => [...x.matchAll(/<style(\s+[\w-]+(=("[^"]*"|\{[^{}]*\}))?)*\s*>\s*\{/g)].length;
  assert.equal(probe("<style>{CSS}</style>"), 1); assert.equal(probe('<style nonce="n">{`a > b{}`}</style>'), 1);
  assert.equal(probe("<style dangerouslySetInnerHTML={{ __html: `.a > div{x:1}` }} />"), 0);
  assert.equal(probe("<style\n  dangerouslySetInnerHTML={{\n    __html: `\n .a > b {}`}} />"), 0);
  const offenders = [];
  for (const f of walk(SRC)) {
    const s = fs.readFileSync(f, "utf8");
    for (const m of s.matchAll(/<style(\s+[\w-]+(=("[^"]*"|\{[^{}]*\}))?)*\s*>\s*\{/g)) offenders.push(`${path.relative(process.cwd(), f)}:${s.slice(0, m.index).split("\n").length}`);
  }
  assert.deepEqual(offenders, [], `use <style dangerouslySetInnerHTML={{ __html: CSS }} /> instead:\n  ${offenders.join("\n  ")}`);
});

test("🔴 BUILT · the NFL pages ship their CSS unescaped (when a build exists)", { skip: !fs.existsSync(path.join(process.cwd(), "out/nfl/index.html")) }, () => {
  const pages = ["out/nfl/index.html", ...fs.readdirSync(path.join(process.cwd(), "out/nfl/game")).slice(0, 3).map((id) => `out/nfl/game/${id}/index.html`)];
  for (const rel of pages) {
    const html = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
    const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n");
    assert.ok(css.includes(".nf-split > div"), `${rel}: the forecast styles are present with a real ">"`);
    assert.doesNotMatch(css, /&gt;|&lt;|&amp;|&quot;|&#x27;/, `${rel}: no HTML entity inside a <style> element`);
  }
});
