/**
 * EXACTLY ONE `<main>` LANDMARK PER PAGE — the layout owns it, and no page or component may add one.
 *
 * 🔴 THE DEFECT, measured on the built export: 17 pages carried TWO `<main>` elements. A screen
 * reader's landmark list shows two "main" regions and "skip to main content" becomes ambiguous.
 *
 *     live · my · following · mr-dub · goal-rush · bucket-blitz · sports · cards/{epl,nfl,ufc}
 *     results/{picks,parlay-lab,model-audit} · results/picks/{mlb,nfl,epl,ufc}
 *
 * ⚠ AND THE REPOSITORY ALREADY KNEW. `/nfl`, `/mlb` and `/epl` each carry a comment saying exactly
 * this — "A DIV, not <main>: the app layout already provides the single main landmark" — fixed
 * route by route, which is why fifteen other files never got it. §12: do not patch each route
 * independently when a shared rule is the root fix.
 *
 * Two of the fifteen were shared COMPONENTS (`product-in-development`, `sport-schedule-page`), so a
 * single file put the second landmark on many routes at once.
 *
 * Run: cd app && npx tsx --test src/lib/uiux/main-landmark.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const SRC = path.join(APP, "src");
const OUT = path.join(APP, "out");

/** Every .tsx under src, so a component that adds a landmark is caught as well as a page. */
function tsxFiles(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) tsxFiles(p, acc);
    else if (e.name.endsWith(".tsx")) acc.push(p);
  }
  return acc;
}

/** Source with comments stripped — this guard is about what the CODE emits, not what it explains. */
const code = (p) => fs.readFileSync(p, "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
  .replace(/(^|[^:])\/\/.*$/gm, "$1");

test("🔴 only the app layout emits a <main> landmark", () => {
  const layout = path.join(SRC, "app/layout.tsx");
  assert.match(code(layout), /<main\b/, "the layout must own the landmark");

  const offenders = [];
  for (const f of tsxFiles(SRC)) {
    if (f === layout) continue;
    if (/<main\b/.test(code(f))) offenders.push(path.relative(APP, f));
  }
  assert.deepEqual(offenders, [], "these files add a second main landmark; use a div — the layout already provides it");
});

test("the layout's landmark is focusable and named, so 'skip to main content' lands somewhere", () => {
  const layout = code(path.join(SRC, "app/layout.tsx"));
  assert.match(layout, /<main[^>]*id="main-content"/);
  assert.match(layout, /<main[^>]*tabIndex=\{-1\}/, "a skip target must be focusable");
});

/* ── and the same claim on the real export, where it is actually true or not ─────────────────── */

const built = fs.existsSync(OUT);

test("🔴 every BUILT page has exactly one <main>", { skip: !built }, () => {
  const pages = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === "index.html") pages.push(p);
    }
  };
  walk(OUT);
  assert.ok(pages.length > 50, `expected a real export, found ${pages.length} pages`);

  const bad = [];
  for (const p of pages) {
    const n = (fs.readFileSync(p, "utf8").match(/<main\b/g) ?? []).length;
    if (n !== 1) bad.push(`${path.relative(OUT, p)} has ${n}`);
  }
  assert.deepEqual(bad.slice(0, 20), [], `${bad.length} page(s) do not have exactly one main landmark`);
});
