/**
 * UNIT GUARD (no build needed) · no client bundle may carry a `data/internal` path (Housekeeping 10-22).
 *
 * Production's site-wide layout chunk (/_next/static/chunks/app/layout-*.js, loaded on every page) shipped five
 * internal file paths — the soccer league preregistration and four walk-forward reports — because the league
 * registry (lib/sports/soccer/leagues.mjs) carried them as `validation` metadata and the site nav reaches that
 * registry (layout.tsx → command-rail.tsx → lib/navigation.ts → lib/sports/catalog.ts → leagues.mjs). The paths now live in the server-only
 * leagues-validation.mjs.
 *
 * Roots: every "use client" module under app/src, plus src/app/layout.tsx (whose whole static graph is held to the
 * same rule, so nothing the site-wide layout imports can name an internal path). From each root the static +
 * dynamic import graph is walked (the walk of simulation-theater/nba/possession/client-graph-engine-id.test.mjs);
 * no reachable module's CODE (comments stripped) may contain "data/internal".
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const SRC = path.join(APP, "src");
const NEEDLE = "data/internal";
const LAYOUT = path.join(SRC, "app", "layout.tsx");

/*
 * Known, pre-existing client-reachable modules that still name a data/internal path, each with the follow-up that
 * removes it. NOT reachable from the layout (asserted below). The list may only shrink: an entry that is no longer
 * an offender fails the second test, so it must be deleted when fixed.
 */
const KNOWN_PENDING = new Map([
  ["src/lib/sport-capability-registry.ts", "evidence[] provenance strings (EPL learning, Ligue 1 walk-forward, NFL public card) — reached from the Parlay Lab builder client island; follow-up: move evidence paths server-side as was done for soccer leagues"],
]);

const exts = [".ts", ".tsx", ".mjs", ".js", ".jsx", ".cjs"];
const isCode = (f) => /\.(tsx?|mjs|js|cjs|jsx)$/.test(f);
const resolve = (from, spec) => {
  const base = spec.startsWith("@/") ? path.join(SRC, spec.slice(2)) : spec.startsWith(".") ? path.resolve(path.dirname(from), spec) : null;
  if (!base) return null;
  for (const c of [base, ...exts.map((e) => base + e), ...exts.map((e) => path.join(base, "index" + e))]) if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  return null;
};
const read = (f) => fs.readFileSync(f, "utf8");
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/([^:"'`])\/\/[^\n"'`]*$/gm, "$1");
const IMPORT_RE = /(?:from\s+|import\s*\(\s*|import\s+)["']([^"']+)["']/g;
const walkFiles = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules") walkFiles(p, out); continue; }
    if (isCode(p) && !/\.test\./.test(p)) out.push(p);
  }
  return out;
};
const isClient = (f) => /^\s*(?:\/\*[\s\S]*?\*\/\s*|\/\/[^\n]*\n\s*)*["']use client["']/.test(read(f));
const rel = (f) => path.relative(APP, f).split(path.sep).join("/");

/** module → the module that first imported it (root → null), for a readable chain in failures. */
function graph(root) {
  const parent = new Map([[root, null]]), stack = [root];
  while (stack.length) {
    const f = stack.pop();
    // type-only imports are erased at compile time and bundle nothing
    for (const m of read(f).replace(/^import type [^;]+;$/gm, "").matchAll(IMPORT_RE)) {
      const r = resolve(f, m[1]);
      if (r && isCode(r) && !parent.has(r)) { parent.set(r, f); stack.push(r); }
    }
  }
  return parent;
}
const chain = (parent, f) => { const out = []; for (let x = f; x; x = parent.get(x)) out.unshift(rel(x)); return out.join(" → "); };

function offenders(roots) {
  const found = new Map();
  for (const root of roots) {
    const g = graph(root);
    for (const f of g.keys()) if (!found.has(rel(f)) && code(read(f)).includes(NEEDLE)) found.set(rel(f), chain(g, f));
  }
  return found;
}

const CLIENT_ROOTS = walkFiles(SRC).filter(isClient);

test("no module reachable from src/app/layout.tsx (the site-wide layout chunk) names a data/internal path", () => {
  const g = graph(LAYOUT);
  assert.ok(g.size > 20, `layout graph of ${g.size} modules — the walk is looking`);
  assert.ok([...g.keys()].some((f) => rel(f) === "src/lib/sports/soccer/leagues.mjs"), "the layout still reaches the league registry (the 10-22 leak path) — the guard covers it");
  assert.deepEqual([...offenders([LAYOUT])].map(([f, via]) => `${f}: ${via}`), []);
});

test("no module reachable from a \"use client\" module names a data/internal path (except the shrinking known list)", () => {
  assert.ok(CLIENT_ROOTS.length > 20, `found ${CLIENT_ROOTS.length} "use client" roots — the walk is looking`);
  const found = offenders(CLIENT_ROOTS);
  const unexpected = [...found].filter(([f]) => !KNOWN_PENDING.has(f)).map(([f, via]) => `${f}: ${via}`);
  assert.deepEqual(unexpected, [], "a client bundle would ship an internal file path — move the path into a server-only module");
  for (const f of KNOWN_PENDING.keys()) assert.ok(found.has(f), `${f} no longer reaches a client graph with "${NEEDLE}" — delete it from KNOWN_PENDING`);
  for (const f of KNOWN_PENDING.keys()) assert.ok(![...graph(LAYOUT).keys()].some((x) => rel(x) === f), `${f} is now reached from the site-wide layout`);
});

test("the soccer registry is clean and its evidence paths live only in the server-only module, which no client graph reaches", () => {
  const registry = path.join(SRC, "lib", "sports", "soccer", "leagues.mjs");
  const serverOnly = path.join(SRC, "lib", "sports", "soccer", "leagues-validation.mjs");
  assert.doesNotMatch(code(read(registry)), /data\/internal/);
  assert.match(code(read(serverOnly)), /data\/internal\/research\/soccer\/preregistration-league-expansion-v1\.json/);
  for (const root of [LAYOUT, ...CLIENT_ROOTS]) assert.ok(!graph(root).has(serverOnly), `${rel(root)} reaches the server-only leagues-validation.mjs`);
  // the guard is not vacuous: the module the 10-22 leak came from, as it was, would have failed it
  const leaked = `export const L = [{ key: "laliga", validation: { report: "data/internal/research/soccer/laliga/reports/walk-forward-v1.json" } }];`;
  assert.ok(code(leaked).includes(NEEDLE));
  assert.ok(!code(`/* ${NEEDLE} */\n// ${NEEDLE}\nconst y = 1;`).includes(NEEDLE), "comments are not code");
});
