/**
 * Public/static leak guard for the v1.7 product artifacts (Phase 13.3).
 *
 * The static export copies app/public only; repo-root data/internal/** never reaches out/. That boundary
 * holds only while nothing under app/public/data/products/ is an internal artifact and no page reads
 * data/internal/products/** at build time. This guard pins both, plus the content contract of the one
 * public product artifact (availability): counts, plain reasons and flags — never a leg id, an odds
 * number or an entity id.
 *
 * Deviation from the audit brief, recorded: app/public/data/products/ holds TWO public directories —
 * availability/ (v1.7) and lifecycle/ (P228, the settled-card lifecycle ledger nightly-settle commits at
 * .github/workflows/nightly-settle.yml "git add app/public/data/products/lifecycle/"). Both are public by
 * design; anything else under products/ is a leak.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, "..", "..", "..");
const REPO = path.resolve(APP, "..");
const PUBLIC_PRODUCTS = path.join(APP, "public", "data", "products");
const PUBLIC_DIRS = new Set(["availability", "lifecycle"]);
const INTERNAL_NAMES = /selector-shadow|eligible-legs|forensic|selector-replay|receipts|forward-coverage|cycle-table|manifest|research|nba/i;

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isSymbolicLink()) out.push({ p, symlink: true });
    else if (e.isDirectory()) walk(p, out);
    else out.push({ p, symlink: false });
  }
  return out;
}

test("app/public/data/products/ holds only availability/ and lifecycle/ — no internal artifact, no symlink", () => {
  assert.ok(fs.existsSync(PUBLIC_PRODUCTS), "the public products dir exists (availability is written there)");
  const top = fs.readdirSync(PUBLIC_PRODUCTS, { withFileTypes: true });
  for (const e of top) {
    assert.ok(e.isDirectory() && !e.isSymbolicLink(), `${e.name}: only real directories at the top level`);
    assert.ok(PUBLIC_DIRS.has(e.name), `${e.name}: not a public product directory (allowed: ${[...PUBLIC_DIRS].join(", ")})`);
  }
  for (const f of walk(PUBLIC_PRODUCTS)) {
    assert.equal(f.symlink, false, `${path.relative(APP, f.p)} is a symlink`);
    assert.doesNotMatch(path.relative(PUBLIC_PRODUCTS, f.p), INTERNAL_NAMES, `${path.relative(APP, f.p)} looks like an internal artifact`);
    assert.match(f.p, /\.json$/, `${path.relative(APP, f.p)}: only JSON is served here`);
  }
});

test("no symlink under app/public points anywhere, and data/internal is not reachable through app/public", () => {
  for (const f of walk(path.join(APP, "public", "data"))) assert.equal(f.symlink, false, `${path.relative(APP, f.p)} is a symlink`);
  assert.ok(!fs.existsSync(path.join(APP, "public", "data", "internal")), "no app/public/data/internal");
  const rp = fs.realpathSync(path.join(APP, "public"));
  assert.ok(!rp.includes(path.join("data", "internal")), "app/public does not resolve into data/internal");
});

test("the availability artifact carries only counts, plain reasons and flags (no leg ids, odds or entity ids), and it is stamped", () => {
  const dir = path.join(PUBLIC_PRODUCTS, "availability");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  assert.ok(files.includes("latest.json"), "latest.json exists");
  const ALLOWED_TOP = new Set(["schemaVersion", "artifact", "dataClass", "date", "asOf", "generatedAt", "note", "sports"]);
  const ALLOWED_SPORT = new Set(["eligibleLegs", "events", "marketFamilies", "reason", "marketPricedOnly"]);
  for (const f of files) {
    const raw = fs.readFileSync(path.join(dir, f), "utf8");
    const doc = JSON.parse(raw);
    assert.equal(doc.dataClass, "PUBLIC_DERIVED", `${f}: public-derived class`);
    for (const k of Object.keys(doc)) assert.ok(ALLOWED_TOP.has(k), `${f}: unexpected top-level key ${k}`);
    for (const [sport, s] of Object.entries(doc.sports)) {
      for (const k of Object.keys(s)) assert.ok(ALLOWED_SPORT.has(k), `${f}/${sport}: unexpected key ${k}`);
      for (const k of ["eligibleLegs", "events", "marketFamilies"]) assert.equal(typeof s[k], "number", `${f}/${sport}.${k} is a count`);
      assert.equal(typeof s.reason, "string"); assert.equal(typeof s.marketPricedOnly, "boolean");
      assert.doesNotMatch(s.reason, /_[A-Z]{2,}/, `${f}/${sport}: reason is plain English, not a reason code`);
    }
    // No leg id shape, no odds, no gamePk / entity ids anywhere in the bytes.
    assert.doesNotMatch(raw, /\b(mlb|nfl|ufc|epl|nba):\d+:/i, `${f}: contains a leg id`);
    assert.doesNotMatch(raw, /"(american|odds|price|decimal|legId|eventId|gamePk|entityIds|probability|marketImpliedProbability|bookmaker)"/, `${f}: contains a leg field`);
    assert.doesNotMatch(raw, /[+-]\d{3}\b/, `${f}: contains an American price`);
    assert.match(String(doc.asOf), /^\d{4}-\d{2}-\d{2}T/, `${f}: asOf is an instant`);
  }
});

test("no page or lib under app/src reads data/internal/products/{selector-shadow,eligible-legs,forensic-v17,selector-replay}", () => {
  const offenders = [];
  const scan = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { scan(p); continue; }
      if (!/\.(ts|tsx|mjs|js)$/.test(e.name) || /\.test\.mjs$/.test(e.name)) continue;
      // Comments are not reads: strip them, then require an fs read in the same file.
      const src = fs.readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      const reads = /readFileSync|readdirSync|createReadStream|readJson/.test(src);
      if (reads && /internal\/products\/(selector-shadow|eligible-legs|forensic-v17|selector-replay)/.test(src)) offenders.push(path.relative(APP, p));
      if (reads && /"selector-shadow"|"eligible-legs"|selector-shadow\/|eligible-legs\//.test(src)) offenders.push(path.relative(APP, p));
    }
  };
  scan(path.join(APP, "src"));
  assert.deepEqual(offenders, [], `app/src must not read the internal research artifacts: ${offenders.join(", ")}`);
});

test("the export prune cannot keep an internal product artifact: nothing under app/public references data/internal, and the availability page-read is build-time only", () => {
  // The prune keeps only URLs the built pages reference; the availability artifact is read with fs at
  // build time (loadProductAvailability) and never fetched, so it is swept from out/data — verified when
  // out/ exists.
  const outProducts = path.join(APP, "out", "data", "products");
  if (fs.existsSync(path.join(APP, "out", "index.html"))) {
    assert.ok(!fs.existsSync(outProducts), "out/data/products is swept from the export (nothing fetches it at runtime)");
    for (const name of ["selector-shadow", "eligible-legs", "forensic-v17", "research"]) assert.ok(!fs.existsSync(path.join(APP, "out", "data", name)), `out/data/${name} must not exist`);
  }
  const loader = fs.readFileSync(path.join(APP, "src", "lib", "products", "availability.ts"), "utf8");
  assert.match(loader, /readFileSync/, "availability is read from disk at build time");
  assert.doesNotMatch(loader, /fetch\(/, "never fetched at runtime (so it is never served)");
  assert.ok(fs.existsSync(path.join(REPO, "data", "internal", "products")), "the internal store lives at the repo root, outside app/");
});
