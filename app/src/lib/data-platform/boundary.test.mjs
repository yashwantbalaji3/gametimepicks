/**
 * DATA PLATFORM BOUNDARIES (v1.2 · §49 §69 §70 §101).
 *
 *  1. No consumer yet: nothing outside the platform package reads the store or imports the package. This is
 *     also what keeps the 2023–2025 MLB finals archive out of live model inputs (see
 *     mlb/finals-history-isolation.test.mjs — the platform is its one permitted reader).
 *  2. Adapters are pure: no network, no filesystem, no React, no clock.
 *  3. No fuzzy identity: the package contains no name-normalizing or similarity primitive.
 *  4. Committed artifacts carry no model judgment copy and no personal state.
 *
 * Run: npx tsx --test src/lib/data-platform/boundary.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { isTransientSource } from "../ci/source-tree.mjs";

const REPO = path.join(process.cwd(), process.cwd().endsWith("app") ? ".." : "");
const PKG = [path.join(REPO, "app/src/lib/data-platform"), path.join(REPO, "app/scripts/data-platform")];
const STORE = path.join(REPO, "data/internal/platform/v1");
const walk = (dir, keep, acc = []) => {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!["node_modules", ".next", "out"].includes(e.name)) walk(p, keep, acc); }
    else if (!isTransientSource(e.name) && keep(e.name)) acc.push(p);
  }
  return acc;
};
const inPkg = (f) => PKG.some((d) => f.startsWith(d + path.sep));
const code = (n) => /\.(mjs|js|ts|tsx)$/.test(n);
/** strip comments so a rule documented in prose is not mistaken for code (P308 lesson) */
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

/*
 * v1.3 (Team + Player Research): the platform has exactly ONE external consumer — the build-time research projection
 * script. It reads the committed store once and writes data/research-projection/v1, which pages read. Nothing else
 * (no page, component, client module, API route or model) may import the package or read the store; the research
 * package's own boundary test pins the page side (research-pages/boundary.test.mjs).
 */
export const PLATFORM_CONSUMERS = Object.freeze([
  "app/scripts/research/build-research-projections.mjs",
  // test-only: proves the committed projection equals a rebuild from the committed platform (never shipped)
  "app/src/lib/research-pages/boundary.test.mjs",
]);

/*
 * Files that NAME the platform path in order to prove something is REFUSED.
 *
 * v1.6: the Ask loader's allowlist test feeds `/data/internal/platform/v1/manifest.json` to
 * `isAllowedAssetPath` and asserts it comes back false — the literal is the point of the assertion,
 * and Ask has no code path that could read it. The alternative was to split the string so the guard
 * would not see it, which is evading a guard rather than satisfying one: the path would still be in
 * the test, and the next reader would have no idea why it was written oddly.
 *
 * A file here is exempt from the CONSUMER rule only. It is still forbidden to import the package, and
 * the check below proves each one refuses rather than reads.
 */
export const PLATFORM_REFUSAL_PROBES = Object.freeze([
  "app/src/lib/ask/ask-contract.test.mjs",
  "app/src/lib/ask/ask-mutation-probes.test.mjs",
]);

test("B1 no app code outside the platform package reads the store or imports the package (one allowlisted consumer)", () => {
  const hits = [];
  const consumers = [];
  const importRe = /(from\s+|import\(\s*)["'`][^"'`]*data-platform\//;
  const storeRe = /data\/internal\/platform|internal["'`],\s*["'`]platform/;
  for (const root of ["app/src", "app/scripts", "app/api"]) {
    for (const f of walk(path.join(REPO, root), code)) {
      if (inPkg(f)) continue;
      const src = fs.readFileSync(f, "utf8");
      if (!(importRe.test(src) || storeRe.test(src))) continue;
      const rel = path.relative(REPO, f).split(path.sep).join("/");
      if (PLATFORM_CONSUMERS.includes(rel)) { consumers.push(rel); continue; }
      if (PLATFORM_REFUSAL_PROBES.includes(rel)) {
        // An exemption that cannot be checked is just a hole. A refusal probe must not IMPORT the
        // package, and it must actually assert a refusal near the path it names.
        assert.ok(!importRe.test(src), `${rel} is listed as a refusal probe but imports the platform package`);
        assert.match(src, /isAllowedAssetPath|must be refused|assert\.equal\([^)]*false/, `${rel} names the platform path but asserts no refusal`);
        continue;
      }
      hits.push(rel);
    }
  }
  assert.deepEqual(hits, [], "only the research projection builder may consume the platform; a new consumer is a deliberate change with its own review");
  assert.deepEqual([...consumers].sort(), [...PLATFORM_CONSUMERS].sort(), "the allowlisted consumer must exist and actually be the one reading the platform (no stale allowlist)");
  // positive control: the detector does fire on a real consumer shape
  assert.ok(importRe.test('import { openPlatform } from "../lib/data-platform/readers.mjs";'));
  assert.ok(storeRe.test('path.join(REPO, "data/internal/platform/v1")'));
});

test("B2 adapters and pure modules touch no network, filesystem, React or clock", () => {
  const pure = walk(path.join(REPO, "app/src/lib/data-platform"), (n) => n.endsWith(".mjs") && !n.endsWith(".test.mjs"))
    .filter((f) => !/readers\.mjs$/.test(f)); // the read layer is the one module that opens files
  assert.ok(pure.length >= 12, `pure modules found: ${pure.length}`);
  for (const f of pure) {
    const src = stripComments(fs.readFileSync(f, "utf8"));
    for (const [label, re] of [["network", /\bfetch\(|node:https?\b|XMLHttpRequest/], ["filesystem", /node:fs\b|readFileSync|writeFileSync/], ["react", /from\s+["']react/], ["clock", /Date\.now\(|new Date\(\)(?!\.)|performance\.now/]]) {
      assert.doesNotMatch(src, re, `${path.relative(REPO, f)} must not use ${label}`);
    }
  }
  const scripts = walk(path.join(REPO, "app/scripts/data-platform"), (n) => n.endsWith(".mjs"));
  for (const f of scripts) assert.doesNotMatch(stripComments(fs.readFileSync(f, "utf8")), /\bfetch\(|node:https?\b/, `${path.relative(REPO, f)}: the builder reads committed artifacts only`);
});

test("B3 no fuzzy identity primitive exists in the package (names are labels, never keys)", () => {
  const banned = [
    ["case-folded comparison", /\.toLowerCase\(\)|\.toUpperCase\(\)/],
    ["unicode folding", /normalize\(\s*["']NF/],
    ["locale compare", /localeCompare/],
    ["similarity", /levenshtein|jaro|similarity|fuzzy|closest/i],
    ["substring name match", /name[A-Za-z]*\.includes\(|\.startsWith\(\s*name/],
  ];
  for (const f of walk(path.join(REPO, "app/src/lib/data-platform"), (n) => n.endsWith(".mjs") && !n.endsWith(".test.mjs"))) {
    const src = stripComments(fs.readFileSync(f, "utf8"));
    for (const [label, re] of banned) assert.doesNotMatch(src, re, `${path.relative(REPO, f)}: ${label}`);
  }
  // positive control
  assert.match(stripComments("const same = a.name.toLowerCase() === b.name.toLowerCase();"), banned[0][1]);
});

test("B4 committed artifacts carry no model-judgment copy and no personal or credential state", () => {
  const texts = walk(STORE, (n) => n.endsWith(".json")).map((f) => [f, fs.readFileSync(f, "utf8")]);
  assert.ok(texts.length >= 10);
  for (const [f, s] of texts) {
    assert.doesNotMatch(s, /model validated|high confidence|\bedge\b|beat the market|lock of the/i, path.relative(REPO, f));
    assert.doesNotMatch(s, /gtp\.follow|gtp\.observation|savedAt|followedIds|ODDS_API_KEY|API_FOOTBALL_KEY|\/Users\//, path.relative(REPO, f));
  }
});

test("B5 the store lives outside app/ (never served) and is not swept by a broad bot `git add`", () => {
  assert.ok(!STORE.includes(`${path.sep}app${path.sep}`));
  const wf = path.join(REPO, ".github/workflows");
  const hits = [];
  for (const f of fs.existsSync(wf) ? fs.readdirSync(wf) : []) {
    const s = fs.readFileSync(path.join(wf, f), "utf8");
    if (/git add\s+(-A|--all|\.(\s|$)|data\/?(\s|$)|data\/internal\/?(\s|$))/m.test(s)) hits.push(f);
  }
  assert.deepEqual(hits, [], "a workflow that stages data/internal wholesale would commit a half-built store");
});
