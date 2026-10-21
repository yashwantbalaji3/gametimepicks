/**
 * UNIT GUARD (no build needed) · the private possession-engine id never reaches a client bundle outside the Theater
 * island (release PR 1173, CI run 39624904702: a frozen NBA_THEATER_REPLAY_ENGINE object in theater-gate-policy.mjs —
 * reached by client components through representative-labels.mjs — shipped "nba-possession-sim-v0" in a shared client
 * chunk of the FLAG-OFF export).
 *
 * Roots: every "use client" module under app/src EXCEPT the possession island itself
 * (components/simulation-theater/nba/possession/, whose chunk exists only in a flag-ON build and is allowlisted there).
 * From each root, the static + dynamic import graph is walked; no reachable module's CODE (comments stripped) may
 * name the engine id, and none may import theater-replay-engine.mjs (the server-only home of the approved engine).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const SRC = path.join(APP, "src");
const ENGINE_ID = "nba-possession-sim-v0";
const ISLAND = path.join(SRC, "components", "simulation-theater", "nba", "possession") + path.sep;
const SERVER_ONLY = path.join(SRC, "lib", "consistency", "theater-replay-engine.mjs");

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

function graph(root) {
  const seen = new Set([root]), stack = [root];
  while (stack.length) {
    const f = stack.pop();
    // type-only imports are erased at compile time and bundle nothing
    for (const m of read(f).replace(/^import type [^;]+;$/gm, "").matchAll(IMPORT_RE)) {
      const r = resolve(f, m[1]);
      if (r && isCode(r) && !seen.has(r)) { seen.add(r); stack.push(r); }
    }
  }
  return seen;
}

test("no client bundle outside the possession island can carry the private engine id (static import-graph walk)", () => {
  const roots = walkFiles(SRC).filter((f) => !f.startsWith(ISLAND) && isClient(f));
  assert.ok(roots.length > 20, `found ${roots.length} "use client" roots — the walk is looking`);
  const rel = (f) => path.relative(APP, f).split(path.sep).join("/");
  const offenders = new Map();
  for (const root of roots) {
    for (const f of graph(root)) {
      if (f === SERVER_ONLY) offenders.set(rel(f), `imported (server-only) — reached from ${rel(root)}`);
      else if (code(read(f)).includes(ENGINE_ID)) offenders.set(rel(f), `names ${ENGINE_ID} — reached from ${rel(root)}`);
    }
  }
  assert.deepEqual([...offenders.entries()].map(([f, why]) => `${f}: ${why}`), []);
});

test("the guard catches the PR 1173 shape: a client-reachable module that names the id", () => {
  // the module that leaked, as it was: theater-gate-policy.mjs is reachable from client code …
  const labels = path.join(SRC, "lib", "simulation-theater", "representative-labels.mjs");
  const policy = path.join(SRC, "lib", "consistency", "theater-gate-policy.mjs");
  assert.ok(graph(labels).has(policy), "representative-labels.mjs reaches theater-gate-policy.mjs (client path)");
  // … so it must not name the engine id, and the approved engine lives only in the server-only module
  assert.doesNotMatch(code(read(policy)), new RegExp(ENGINE_ID));
  assert.match(read(SERVER_ONLY), new RegExp(`id: "${ENGINE_ID}"`));
  // and the comment stripper does not hide a real string
  assert.ok(code(`const x = "${ENGINE_ID}"; // ${ENGINE_ID}`).includes(ENGINE_ID));
  assert.ok(!code(`/* ${ENGINE_ID} */\n// ${ENGINE_ID}\nconst y = 1;`).includes(ENGINE_ID));
});
