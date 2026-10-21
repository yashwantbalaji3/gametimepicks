/**
 * NBA Theater · PUBLIC CANDIDATE ROUTE /nba/simulation/[eventId] (flag OFF): the two-act gate, the page's source shape
 * (compile-time branch; nothing private imported statically), the build define, the prune, the client import graph
 * (browser-safe, never the loader / artifact contract / fs), and the research boundary (no product reads the engine).
 * Unit phase (it never reads the built export; possession-render.test.mjs simulates a flag-ON export).
 * Run: npx tsx --test src/lib/simulation-theater/nba/possession/public-theater-route.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { NBA_PUBLIC_THEATER_PLACEHOLDER, NBA_PUBLIC_THEATER_ROUTE, nbaPublicTheaterOn, nbaPublicTheaterParams } from "./public-route.mjs";
import { NBA_THEATER_PUBLIC_ENABLED, nbaTheaterPublicEnabled } from "../feature-manifest.mjs";

const APP = process.cwd();
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");
const PAGE = "src/app/nba/simulation/[eventId]/page.tsx";
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("gate: both acts required; the committed constant is false so every env is OFF; OFF params = one placeholder, no data read", () => {
  assert.equal(NBA_THEATER_PUBLIC_ENABLED, false, "never flipped here");
  for (const env of [{}, { GTP_NBA_THEATER_PUBLIC: "1" }, { GTP_NBA_THEATER_PUBLIC: "true" }, { GTP_DEV_ROUTES: "1", GTP_NBA_THEATER_PUBLIC: "1" }]) {
    assert.equal(nbaPublicTheaterOn({ env }), false);
    assert.equal(nbaTheaterPublicEnabled(env), false);
    let called = false;
    assert.deepEqual(nbaPublicTheaterParams(() => { called = true; return ["1"]; }, { env }), [{ eventId: NBA_PUBLIC_THEATER_PLACEHOLDER }]);
    assert.equal(called, false, "an OFF build reads no data");
  }
  assert.equal(nbaPublicTheaterOn({ constantEnabled: true, env: { GTP_NBA_THEATER_PUBLIC: "0" } }), false);
  assert.equal(nbaPublicTheaterOn({ constantEnabled: true, env: { GTP_NBA_THEATER_PUBLIC: "1" } }), true);
  assert.deepEqual(nbaPublicTheaterParams(() => [], { constantEnabled: true, env: { GTP_NBA_THEATER_PUBLIC: "1" } }), [{ eventId: NBA_PUBLIC_THEATER_PLACEHOLDER }]);
});

test("page source: static imports are the gate only; the loader and the island sit behind the compile-time flag; default notFound; noindex", () => {
  const src = read(PAGE);
  const code = strip(src);
  const statics = [...code.matchAll(/^import [^;]+ from "([^"]+)";$/gm)].map((m) => m[1]);
  assert.deepEqual(statics.filter((s) => s.startsWith("@/")).sort(), ["@/lib/seo/route-metadata", "@/lib/simulation-theater/nba/possession/public-route.mjs"]);
  assert.match(code, /const buildFlagOn = \(\) => process\.env\.GTP_NBA_THEATER_PUBLIC === "1";/);
  // every dynamic import is inside a buildFlagOn() branch
  const dyn = [...code.matchAll(/await import\("([^"]+)"\)/g)];
  assert.equal(dyn.length, 3);
  const gsp = code.slice(code.indexOf("export async function generateStaticParams"), code.indexOf("export const dynamicParams"));
  assert.match(gsp, /if \(buildFlagOn\(\)\) \{\s*const \{ publicPossessionEvents \} = await import\(/);
  assert.match(gsp, /return \[\{ eventId: NBA_PUBLIC_THEATER_PLACEHOLDER \}\];/);
  const body = code.slice(code.indexOf("export default async function"));
  assert.match(body, /if \(buildFlagOn\(\) && nbaPublicTheaterOn\(\) && params\.eventId !== NBA_PUBLIC_THEATER_PLACEHOLDER\) \{\s*const \{ loadPublicPossessionTheater \} = await import\(/);
  assert.match(body, /\n  notFound\(\);\n\}/, "the default path is a 404");
  assert.match(code, /robots: \{ index: false, follow: false \}/);
  assert.doesNotMatch(code, /data\/internal|nba-sim-v1-coherent|experimental-v1|NbaTheaterSection/);
  assert.equal(NBA_PUBLIC_THEATER_ROUTE, "nba/simulation");
});

test("build define and prune: next.config defines GTP_NBA_THEATER_PUBLIC as \"1\"/\"0\"; the prune removes the route unless the two-act gate is on", () => {
  const cfg = read("next.config.mjs");
  assert.match(cfg, /GTP_NBA_THEATER_PUBLIC: process\.env\.GTP_NBA_THEATER_PUBLIC === "1" \? "1" : "0"/);
  assert.match(cfg, /env: \{ \.\.\.buildInfoEnv\(\), \.\.\.theaterFlagEnv\(\) \}/);
  const prune = read("scripts/prune-internal-routes.mjs");
  assert.match(prune, /import \{ nbaTheaterPublicEnabled \} from "\.\.\/src\/lib\/simulation-theater\/nba\/feature-manifest\.mjs";/);
  assert.match(prune, /const NBA_THEATER_ROUTES = nbaTheaterPublicEnabled\(\) \? \[\] : \["nba\/simulation"\];/);
  assert.match(prune, /const INTERNAL_ROUTES = \[[^\]]*\.\.\.NBA_THEATER_ROUTES/);
});

// ── client import graph ───────────────────────────────────────────────────────────────────────────────────────────
const specs = (src) => [...strip(src).matchAll(/^(?:import|export)\s[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]).concat([...strip(src).matchAll(/^import\s+["']([^"']+)["'];/gm)].map((m) => m[1]));
function resolveSpec(spec, fromRel) {
  let base;
  if (spec.startsWith("@/")) base = `src/${spec.slice(2)}`;
  else if (spec.startsWith(".")) base = path.normalize(path.join(path.dirname(fromRel), spec));
  else return null;
  for (const c of [base, `${base}.tsx`, `${base}.ts`, `${base}.mjs`, `${base}/index.tsx`]) if (fs.existsSync(path.join(APP, c)) && fs.statSync(path.join(APP, c)).isFile()) return c;
  throw new Error(`unresolved ${spec} from ${fromRel}`);
}
function graph(entry) {
  const seen = new Set();
  const queue = [entry];
  const bad = [];
  while (queue.length) {
    const rel = queue.shift();
    if (seen.has(rel)) continue;
    seen.add(rel);
    if (rel.endsWith(".css")) continue;
    for (const s of specs(read(rel))) {
      if (s.startsWith("node:") || ["fs", "path", "crypto", "child_process", "os"].includes(s)) bad.push(`${rel} imports ${s}`);
      const next = resolveSpec(s, rel);
      if (next) queue.push(next);
    }
  }
  return { seen, bad };
}

test("the client island's whole import graph is browser-safe: no node: module, never the loader, the artifact contract or a receipt hasher", () => {
  const { seen, bad } = graph("src/components/simulation-theater/nba/possession/NbaPossessionTheater.tsx");
  assert.deepEqual(bad, []);
  for (const must of ["src/lib/simulation-theater/nba/possession/playback.mjs", "src/lib/simulation-theater/nba/possession/box.mjs", "src/lib/sports/nba/research/possession-sim/events.mjs"]) assert.ok(seen.has(must), must);
  for (const never of ["src/lib/simulation-theater/nba/possession/possession-loader.mjs", "src/lib/simulation-theater/nba/possession/artifact-contract.mjs", "src/lib/simulation-theater/nba/loader.mjs", "src/lib/sports/nba/forecast-receipt.mjs", "src/lib/sports/nba/research/possession-sim/engine.mjs", "src/lib/consistency/official-snapshot.mjs"]) {
    assert.ok(!seen.has(never), `the client reaches ${never}`);
  }
  // no client module names the private data path
  for (const f of seen) if (!f.endsWith(".css")) assert.doesNotMatch(strip(read(f)), /data\/internal\/research/, f);
});

test("research boundary: no product, board, snapshot, producer or workflow reads the possession Theater library or the engine", () => {
  const offenders = [];
  const walk = (d) => {
    for (const x of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, x.name);
      if (x.isDirectory()) { if (x.name !== "node_modules") walk(p); continue; }
      if (!/\.(tsx?|mjs)$/.test(x.name) || /\.test\./.test(x.name)) continue;
      const rel = path.relative(APP, p).split(path.sep).join("/");
      const src = read(rel);
      if (!/simulation-theater\/nba\/possession\/|possession-sim\//.test(src)) continue;
      const ok = rel.startsWith("src/lib/simulation-theater/nba/possession/") || rel.startsWith("src/components/simulation-theater/nba/possession/") || rel.startsWith("src/lib/sports/nba/research/possession-sim/")
        || rel === "src/app/nba/simulation/[eventId]/page.tsx" || rel === "src/app/dev/simulation-theater/nba/[eventId]/possession/page.tsx"
        || rel.startsWith("scripts/nba/research/");
      if (!ok) offenders.push(rel);
    }
  };
  walk(path.join(APP, "src"));
  walk(path.join(APP, "scripts"));
  assert.deepEqual(offenders, []);
  // and the official snapshot / representative selection never import the possession library (one-way: official → runs)
  for (const f of ["src/lib/consistency/official-snapshot.mjs", "src/lib/consistency/representative.mjs", "src/lib/simulation-theater/official-representative.mjs"]) assert.doesNotMatch(read(f), /possession/);
});
