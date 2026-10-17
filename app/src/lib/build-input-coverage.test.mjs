/**
 * BUILD_INPUTS in scripts/vercel-ignore-build.sh cover every repo-root data/internal path a PUBLIC page reads
 * (build-input coverage audit, 2026-10-17).
 *
 * The ignore step skips a Production build when no BUILD_INPUT changed since the last deployed commit. A file under
 * data/internal that a public route (or a `npm run build` step) reads at build time but that is NOT a BUILD_INPUT
 * therefore goes stale silently: its commit is "Canceled by Ignored Build Step" and Production keeps serving the
 * previous build's content until some unrelated app/ commit happens to build. Until this guard existed the script
 * claimed four such paths were "the only" ones; there were at least nine more (sim-v2 shadow receipts, NFL
 * experimental settlement, the Model Lab receipts, …).
 *
 *   producer ⇒ reader   (fail closed) the static import closure of every non-internal route under src/app (its page
 *                       plus every layout above it, route handlers, sitemap/robots/manifest/not-found) and of every
 *                       `npm run build` step is scanned for data/internal path references — string literals,
 *                       path.join("data", "internal", …) segment runs, constants built from them (also across
 *                       modules) and one-argument path helpers (`research("epl/…")`). Every reference must be covered
 *                       by a BUILD_INPUT, or carry an EXEMPTION whose own condition is re-verified here.
 *   reader ⇒ producer   every data/internal BUILD_INPUT exists in the repo and is still referenced by something public,
 *                       and every exemption still matches a real reference — no entry can rot into a no-op.
 *
 * Granularity is the MODULE: a public page that imports a module is assumed to read every data/internal path that
 * module names. That over-approximates on purpose (fail closed); the few verified false positives are exemptions
 * below, each with a machine-checked condition that lapses the moment the module's public use changes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const SCRIPT = path.join(APP, "scripts", "vercel-ignore-build.sh");
const sh = fs.readFileSync(SCRIPT, "utf8");
const block = /# GTP-BUILD-INPUTS-BEGIN\s*\nBUILD_INPUTS=\(([\s\S]*?)\)\s*\n# GTP-BUILD-INPUTS-END/.exec(sh);
const INPUTS = block ? [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1].replace(/^:\(top\)/, "")) : [];
const INTERNAL_INPUTS = INPUTS.filter((i) => i.startsWith("data/internal/"));
const covered = (ref) => INPUTS.some((i) => (i.endsWith("/") ? `${ref}/`.startsWith(i) : ref === i));

/*
 * Verified exemptions. `kind` decides what is re-checked:
 *   "label"   the module performs no file I/O at all (no fs import, no read call) — its paths are provenance text.
 *   "allow"   public modules may import ONLY these names from it; those names were verified not to reach the paths.
 *   "forbid"  the named reader is defined once in the module and referenced nowhere else in any public closure.
 */
const EXEMPTIONS = [
  { module: "src/lib/sports/soccer/leagues.mjs", kind: "label", why: "validation{preregistration,report} provenance strings + leagueDir() label; no I/O" },
  { module: "src/lib/sport-capability-registry.ts", kind: "label", why: "evidence[] provenance strings; no I/O" },
  { module: "src/lib/launch/runbook-registry.mjs", kind: "label", why: "runbook receipt descriptions; no I/O" },
  {
    module: "src/lib/research/row-lineage-loader.ts", kind: "allow",
    allow: ["loadLineageIndex", "loadDateLineageArtifact", "LineageIndexEntry", "LineageIndexArtifact", "LINEAGE_ARTIFACT_DIR"],
    why: "/markets reads only the exported lineage artifact under app/public/data/research/row-lineage; the pregame-archive / quarantine / alias readers are used by the emit script, not by a page",
  },
  { module: "src/lib/sports/nfl/player-props-v1.mjs", kind: "forbid", forbid: ["loadPlayerPropsFit"], why: "public pages import only the sampling helpers; the fit-receipt loader has no public caller" },
];

const exts = [".ts", ".tsx", ".mjs", ".js", ".jsx", ".json", ".cjs"];
const resolve = (from, spec) => {
  const base = spec.startsWith("@/") ? path.join(APP, "src", spec.slice(2)) : spec.startsWith(".") ? path.resolve(path.dirname(from), spec) : null;
  if (!base) return null;
  for (const c of [base, ...exts.map((e) => base + e), ...exts.map((e) => path.join(base, "index" + e))]) if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  return null;
};
const isCode = (f) => /\.(tsx?|mjs|js|cjs|jsx)$/.test(f) && !/\.test\./.test(f);
const SRC = new Map();
const read = (f) => { if (!SRC.has(f)) SRC.set(f, fs.readFileSync(f, "utf8")); return SRC.get(f); };
const rel = (f) => path.relative(APP, f).split(path.sep).join("/");
const IMPORT_RE = /(?:from\s+|import\s*\(\s*|import\s+|require\s*\(\s*)["']([^"']+)["']/g;
function closure(entries) {
  const seen = new Set(entries), stack = [...entries];
  while (stack.length) {
    const f = stack.pop();
    if (!isCode(f)) continue;
    for (const m of read(f).matchAll(IMPORT_RE)) { const r = resolve(f, m[1]); if (r && !seen.has(r)) { seen.add(r); stack.push(r); } }
  }
  return seen;
}

/* ── entries: every non-internal route + every build step ───────────────────────────────────────────────────── */
async function publicEntries() {
  const { ROUTE_TABLE } = await import(path.join(APP, "src/lib/audits/route-inventory.mjs"));
  const APPDIR = path.join(APP, "src", "app");
  const classOf = (route) => { let r = route; while (r) { if (ROUTE_TABLE[r]) return ROUTE_TABLE[r].classification; r = r.slice(0, r.lastIndexOf("/")); } return ROUTE_TABLE["/"]?.classification ?? "public"; };
  const layoutsAbove = (dir) => { const out = []; for (let d = dir; d.startsWith(APPDIR); d = path.dirname(d)) { for (const n of ["layout.tsx", "template.tsx"]) if (fs.existsSync(path.join(d, n))) out.push(path.join(d, n)); if (d === APPDIR) break; } return out; };
  const entries = new Map();
  for (const f of fs.readdirSync(APPDIR, { recursive: true }).map((x) => path.join(APPDIR, x)).filter((x) => isCode(x) && fs.statSync(x).isFile())) {
    const dir = path.dirname(f), base = path.basename(f);
    const route = "/" + path.relative(APPDIR, dir).split(path.sep).join("/");
    const r = route === "/" ? "/" : route;
    if (base === "page.tsx") { if (classOf(r) !== "internal") entries.set(r, [f, ...layoutsAbove(dir)]); }
    else if (base === "route.ts") { if (classOf(r) !== "internal") entries.set(`handler:${r}`, [f]); }
    else if (dir === APPDIR && /^(sitemap|robots|manifest|not-found|layout)\.tsx?$/.test(base)) entries.set(`app:${base}`, [f]);
  }
  const steps = JSON.parse(fs.readFileSync(path.join(APP, "package.json"), "utf8")).scripts.build.match(/scripts\/[\w./-]+\.(?:mjs|js|ts)/g) ?? [];
  for (const s of steps) entries.set(`build:${s}`, [path.join(APP, s)]);
  return { entries, steps };
}

/* ── data/internal reference extraction ─────────────────────────────────────────────────────────────────────── */
const LIT = /["'`]((?:\.\.\/)*data\/internal(?:\/[^"'`\s]*)?)["'`]/g;          // no whitespace: prose labels are not paths
const SEQ = /["']data["']\s*,\s*["']internal["']((?:\s*,\s*["'][^"'$\s]*["'])*)/g;
const segs = (s) => [...s.matchAll(/["']([^"']*)["']/g)].map((x) => x[1]);
const clean = (p) => p.replace(/^(\.\.\/)+/, "").replace(/\$\{.*$/, "").replace(/\/\/+/g, "/").replace(/\/+$/, "");
const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const firstPath = (expr, vars) => {
  const seq = new RegExp(SEQ.source).exec(expr);
  if (seq) return clean(["data/internal", ...segs(seq[1])].join("/"));
  const lit = new RegExp(LIT.source).exec(expr);
  if (lit) return clean(lit[1]);
  const j = /\.(?:join|resolve)\(([^)]*)\)/.exec(expr);
  if (j) {
    const parts = j[1].split(",").map((x) => x.trim());
    const i = parts.findIndex((x) => vars.has(x));
    if (i >= 0) {
      const tail = [];
      for (const x of parts.slice(i + 1)) { const m = /^["'`]([^"'`]*)["'`]$/.exec(x); if (!m) break; tail.push(m[1]); if (m[1].includes("${")) break; }
      return clean([vars.get(parts[i]), ...tail].join("/"));
    }
  }
  return null;
};
/** Constants (exported or not) whose value is a data/internal path: NAME → path. */
function constantsOf(text, seed = new Map()) {
  const vars = new Map(seed);
  for (let pass = 0; pass < 3; pass++) {
    for (const m of text.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::\s*[\w<>[\]| ]+)?=\s*([^;\n]+)/g)) {
      if (/=>/.test(m[2])) continue; // helpers are handled separately
      const v = firstPath(m[2], vars);
      if (v) vars.set(m[1], v);
    }
  }
  return vars;
}
const GLOBAL = new Map();
for (const f of ["src", "scripts"].flatMap((d) => fs.readdirSync(path.join(APP, d), { recursive: true }).map((x) => path.join(APP, d, x)))) {
  if (!isCode(f) || !fs.statSync(f).isFile()) continue;
  const t = stripComments(read(f));
  if (!t.includes("internal")) continue;
  const vars = constantsOf(t);
  for (const m of t.matchAll(/export\s+const\s+([A-Za-z_$][\w$]*)/g)) if (vars.has(m[1])) GLOBAL.set(m[1], vars.get(m[1]));
}
function referencesIn(file) {
  const t = stripComments(read(file));
  const imported = new Map([...GLOBAL].filter(([k]) => new RegExp(`\\b${k}\\b`).test(t)));
  const vars = constantsOf(t, imported);
  const refs = new Set();
  // One-argument helpers: const NAME = (p) => …join(<base…>, p)…  → NAME("x") ⇒ base/x; their own base is not a ref.
  const helperLines = new Set();
  for (const m of t.matchAll(/(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*\(\s*([A-Za-z_$][\w$]*)[^)]*\)\s*=>\s*([^\n]+)/g)) {
    const [, name, param, body] = m;
    const j = new RegExp(`\\.(?:join|resolve)\\(([^)]*)\\b${param}\\s*\\)`).exec(body);
    if (!j) continue;
    const base = firstPath(`path.join(${j[1].replace(/,\s*$/, "")})`, vars);
    if (!base) continue;
    helperLines.add(m[0]);
    for (const c of t.matchAll(new RegExp(`\\b${name}\\(\\s*(?:["'\`]([^"'\`]*)["'\`])?`, "g"))) {
      if (c.index === m.index + m[0].indexOf(name)) continue;
      refs.add(c[1] !== undefined ? clean(`${base}/${c[1]}`) : base);
    }
  }
  let body = t;
  for (const l of helperLines) body = body.replace(l, "");
  for (const m of body.matchAll(LIT)) refs.add(clean(m[1]));
  for (const m of body.matchAll(SEQ)) refs.add(clean(["data/internal", ...segs(m[1])].join("/")));
  for (const m of body.matchAll(/\.(?:join|resolve)\(([^)]*)\)/g)) { const v = firstPath(`path.join(${m[1]})`, vars); if (v) refs.add(v); }
  for (const v of vars.values()) refs.add(v);
  return [...refs].filter((r) => r === "data/internal" || r.startsWith("data/internal/"));
}

/* ── the map ─────────────────────────────────────────────────────────────────────────────────────────────────── */
async function coverageMap() {
  const { entries, steps } = await publicEntries();
  const readers = new Map(); // ref → Map(module → Set(entry))
  const closures = new Map();
  for (const [name, files] of entries) {
    const c = closure(files);
    closures.set(name, c);
    for (const f of c) {
      if (!isCode(f)) continue;
      for (const ref of referencesIn(f)) {
        const byMod = readers.get(ref) ?? readers.set(ref, new Map()).get(ref);
        (byMod.get(rel(f)) ?? byMod.set(rel(f), new Set()).get(rel(f))).add(name);
      }
    }
  }
  const allPublic = new Set([...closures.values()].flatMap((c) => [...c]));
  return { readers, entries, steps, allPublic };
}
const MAP = await coverageMap();

function importedNames(fromFile, targetAbs) {
  const out = [];
  const t = read(fromFile);
  for (const m of t.matchAll(/import\s+(type\s+)?([\s\S]*?)\s+from\s+["']([^"']+)["']/g)) {
    if (resolve(fromFile, m[3]) !== targetAbs) continue;
    const clause = m[2];
    if (/\*\s+as\s+/.test(clause)) { out.push("*"); continue; }
    const def = /^([A-Za-z_$][\w$]*)\s*(?:,|$)/.exec(clause); if (def) out.push("default");
    const named = /\{([\s\S]*)\}/.exec(clause);
    if (named) for (const n of named[1].split(",").map((x) => x.trim()).filter(Boolean)) out.push(n.replace(/^type\s+/, "").split(/\s+as\s+/)[0].trim());
  }
  for (const m of t.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)) if (resolve(fromFile, m[1]) === targetAbs) out.push("*");
  return out;
}
function exemptionHolds(ex) {
  const abs = path.join(APP, ex.module);
  const text = stripComments(read(abs));
  if (ex.kind === "label") return !/from\s+["'](?:node:)?fs(?:\/promises)?["']|require\(\s*["'](?:node:)?fs["']\s*\)|\b(?:readFileSync|readdirSync|existsSync|statSync|createReadStream)\b/.test(text) || `${ex.module} now performs file I/O — its data/internal strings may be reads`;
  const importers = [...MAP.allPublic].filter((f) => f !== abs && isCode(f));
  if (ex.kind === "allow") {
    for (const f of importers) for (const n of importedNames(f, abs)) if (!ex.allow.includes(n)) return `${rel(f)} imports "${n}" from ${ex.module} — not on the verified allow-list; re-verify which data/internal files it reaches`;
    return true;
  }
  if (ex.kind === "forbid") {
    for (const name of ex.forbid) {
      const defs = (text.match(new RegExp(`\\b${name}\\b`, "g")) ?? []).length;
      if (defs !== 1) return `${name} is referenced ${defs}× inside ${ex.module} (expected only its definition)`;
      for (const f of importers) if (new RegExp(`\\b${name}\\b`).test(stripComments(read(f)))) return `${rel(f)} references ${name} — its data/internal read is now public`;
    }
    return true;
  }
  return `unknown exemption kind ${ex.kind}`;
}

test("the ignore step declares a parseable BUILD_INPUTS block with data/internal entries", () => {
  assert.ok(block, "GTP-BUILD-INPUTS markers missing or unparseable — this guard would check nothing");
  assert.ok(INPUTS.includes("app/"), "app/ must remain a build input");
  assert.ok(INTERNAL_INPUTS.length >= 4);
});

test("the scan sees the build: routes, steps and a known reader", () => {
  assert.ok(MAP.steps.length >= 8, `found only ${MAP.steps.length} build steps`);
  assert.ok([...MAP.entries.keys()].filter((k) => k.startsWith("/")).length >= 50, "implausibly few public routes");
  assert.ok(MAP.allPublic.size > 500, `public closure of ${MAP.allPublic.size} files is implausibly small`);
  // Sentinels: each extraction form must keep working, or the guard is vacuous.
  assert.ok(MAP.readers.get("data/internal/research/nfl/sim-v2/shadow")?.has("src/lib/sports/nfl/sim-v2/public-receipt.mjs"), "literal-constant form not detected");
  assert.ok(MAP.readers.get("data/internal/mlb/prediction-snapshots")?.has("src/lib/command-center/changes.ts"), "path.join segment form not detected");
  assert.ok(MAP.readers.get("data/internal/research/epl/forward-totals/receipt.json")?.has("src/lib/command-center/model-lab.ts"), "path-helper form not detected");
  assert.ok(MAP.readers.get("data/internal/nfl/winner-corrections")?.has("src/lib/results/nfl-model-favored-io.mjs"), "cross-module constant form not detected");
});

test("producer ⇒ reader: every data/internal path a public route or build step reads is a BUILD_INPUT (fail closed)", () => {
  const exempt = new Map(EXEMPTIONS.map((e) => [e.module, e]));
  const missing = [];
  for (const [ref, byMod] of MAP.readers) {
    if (covered(ref)) continue;
    const unexempted = [...byMod.keys()].filter((m) => !exempt.has(m));
    if (unexempted.length) missing.push(`${ref}\n      read via ${unexempted.join(", ")}\n      by ${[...new Set(unexempted.flatMap((m) => [...byMod.get(m)]))].slice(0, 6).join(" ")}`);
  }
  assert.deepEqual(missing, [], `public build-time reads that a data/internal-only commit would NOT rebuild — add each to BUILD_INPUTS in scripts/vercel-ignore-build.sh (or, if the read is provably not public, add a checked EXEMPTION here):\n  ${missing.join("\n  ")}`);
});

test("exemptions are still true and still needed", () => {
  for (const ex of EXEMPTIONS) {
    assert.equal(exemptionHolds(ex), true, `exemption for ${ex.module} (${ex.why}) no longer holds`);
    const used = [...MAP.readers].some(([ref, byMod]) => !covered(ref) && byMod.has(ex.module));
    assert.ok(used, `exemption for ${ex.module} matches no uncovered reference — delete it`);
  }
});

test("reader ⇒ producer: every data/internal BUILD_INPUT exists and is still read by something public", () => {
  for (const i of INTERNAL_INPUTS) {
    assert.ok(fs.existsSync(path.join(REPO, i)), `${i} does not exist — the entry is a no-op`);
    const read = [...MAP.readers.keys()].some((ref) => (i.endsWith("/") ? `${ref}/`.startsWith(i) || i.startsWith(`${ref}/`) : ref === i || i.startsWith(`${ref}/`)));
    assert.ok(read, `${i} is a BUILD_INPUT but no public route or build step names it — it only causes builds; remove it`);
  }
});
