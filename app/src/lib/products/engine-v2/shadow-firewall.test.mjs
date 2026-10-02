/**
 * SHADOW FIREWALL (Session 7 §65) — shadow selections and the internal universe never reach a public record,
 * a public page, or Ask. Public products come from official owners only.
 *
 * Run: npx tsx --test src/lib/products/engine-v2/shadow-firewall.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const SHADOW_PATHS = /engine-v2\/sp-shadow|recommendation-universe|selector-shadow|sp-replay|engine-v2\/suggested-parlays/;
const walk = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dir, e.name);
  return e.isDirectory() ? (e.name === "node_modules" ? [] : walk(p)) : /\.(m?[jt]sx?)$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : [];
}) : []);
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

const READERS = [
  ...walk(path.join(APP, "src/app")), ...walk(path.join(APP, "src/components")),
  ...walk(path.join(APP, "src/lib/results")), ...walk(path.join(APP, "src/lib/ask")), ...walk(path.join(APP, "api")),
  path.join(APP, "scripts/ask/build-ask-projections.mjs"),
  path.join(APP, "scripts/parlays/build-lab-ledger.mjs"),
  path.join(APP, "scripts/parlays/build-risk-ladder.mjs"),
  path.join(APP, "scripts/parlays/settle-lab-cards.mjs"),
].filter((f) => fs.existsSync(f));

test("the reader set is real (a guard over zero files proves nothing)", () => {
  assert.ok(READERS.length > 100, `only ${READERS.length} reader files found`);
});

test("no public page, Results owner, Ask tool or public-record builder reads a shadow or the internal universe", () => {
  const hits = READERS.filter((f) => SHADOW_PATHS.test(strip(fs.readFileSync(f, "utf8")))).map((f) => path.relative(APP, f));
  assert.deepEqual(hits, [], `shadow / universe referenced by: ${hits.join(", ")}`);
});

test("the shadow artifacts are internal: they live under data/internal, never under public/data", () => {
  for (const f of ["scripts/products/suggested-parlays-shadow.mjs", "scripts/products/build-recommendation-universe.mjs", "scripts/products/replay-suggested-parlays-v2.mjs"]) {
    const src = strip(fs.readFileSync(path.join(APP, f), "utf8"));
    assert.match(src, /data\/internal\/products/, `${f} must write under data/internal/products`);
    assert.doesNotMatch(src, /public\/data\/[^"'`]*(sp-shadow|recommendation-universe|engine-v2)/, `${f} must not write a public path`);
  }
});
