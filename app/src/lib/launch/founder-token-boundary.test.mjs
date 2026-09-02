/**
 * NO FOUNDER ANSWER TOKEN REACHES THE PUBLIC EXPORT — Program 231 · K1.
 *
 * Run: npx tsx --test src/lib/launch/founder-token-boundary.test.mjs   (after a public build)
 *
 * A founder answer token is the exact phrase the founder types to authorise an action on a gated
 * product. It is operating protocol: it belongs in the protected console, beside the consequences and
 * the dry-run, where the decision is actually answered.
 *
 * `/moonshot` was printing one to every visitor — "Open decision:
 * MOONSHOT_REPAIR_PAUSE_OR_RETIRE — publishing needs…" — because the module returned the token and
 * the reason as ONE string and the public page rendered the whole thing.
 *
 * THE FIX WAS NOT TO HIDE THE PAUSE. The paused state and the full reason for it stay public, word
 * for word; concealing a product's readiness would be the worse failure, and this repository forbids
 * it explicitly. Only the token moved.
 *
 * This scans the BUILT export rather than source, because the question is what a visitor receives —
 * and the token reached them through a data string, not through a literal anyone would have found by
 * grepping the page.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { PRODUCT_REGISTRY, GOVERNED_PRODUCTS } from "../products/lifecycle-registry.mjs";

const OUT = path.join(process.cwd(), "out");

/** Every gate token the registry knows about — the list cannot go stale behind a new gated product. */
const TOKENS = GOVERNED_PRODUCTS
  .map((id) => PRODUCT_REGISTRY.get(id)?.founderGate)
  .filter(Boolean);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(html|txt|json|js)$/.test(e.name)) out.push(p);
  }
  return out;
}

test("the registry actually knows a token to look for", () => {
  /* If this list were empty the scan below would pass vacuously — a boundary test that checks for
     nothing is the failure it is meant to prevent, one level up. */
  assert.ok(TOKENS.length > 0, "no founder gate is registered; the scan would prove nothing");
});

test("NO gate token appears anywhere in the public export", () => {
  if (!fs.existsSync(OUT)) return; // no build present
  const files = walk(OUT);
  assert.ok(files.length > 100, "the export looks empty — the scan would prove nothing");

  const hits = [];
  for (const f of files) {
    const text = fs.readFileSync(f, "utf8");
    for (const t of TOKENS) {
      if (text.includes(t)) hits.push(`${path.relative(OUT, f)} → ${t}`);
    }
  }
  assert.deepEqual(hits, [], `founder answer token(s) served publicly: ${hits.slice(0, 5).join("; ")}`);
});

test("and the pause itself is STILL public — the token moved, the truth did not", () => {
  /*
   * The counter-check that keeps this from being satisfied by deleting the disclosure. A build where
   * the token is gone AND the paused product says nothing about being paused would pass the scan
   * above and be a worse outcome than the defect.
   */
  const page = path.join(OUT, "moonshot", "index.html");
  if (!fs.existsSync(page)) return;
  const txt = fs.readFileSync(page, "utf8").replace(/<[^>]+>/g, " ");
  assert.match(txt, /multi-lane exposure accounting/, "the reason the product is paused stays public");
  assert.match(txt, /product decision/, "and so does the open question");
});
