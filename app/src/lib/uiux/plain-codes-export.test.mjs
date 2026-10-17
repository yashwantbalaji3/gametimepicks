/*
 * Built-export guard (reads out/): no internal state code reaches a page's VISIBLE text.
 * Scripts, styles and attributes are dropped first, so data attributes and RSC payloads are not judged here — only
 * what a reader sees. One deliberate exception: provenance lines that quote a source's own status verbatim
 * (UFC "Source details": "ESPN MMA scoreboard (…, event N, STATUS_FINAL)") are labelled provenance, like the NFL
 * input-hash block, and stay as written.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), "out");
const PROVENANCE_OK = new Set(["STATUS_FINAL", "STATUS_SCHEDULED", "STATUS_IN_PROGRESS", "STATUS_POSTPONED"]);
const CODE = /\b[A-Z]{3,}(?:_[A-Z0-9]{2,})+\b/g;

function htmlFiles(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) htmlFiles(full, acc);
    else if (e.name.endsWith(".html")) acc.push(full);
  }
  return acc;
}

test("no internal state code appears in the visible text of any public page", () => {
  assert.ok(fs.existsSync(OUT), "this guard runs in the post-build phase and needs a built export at app/out/");
  const found = new Map();
  let pages = 0;
  for (const f of htmlFiles(OUT)) {
    const rel = path.relative(OUT, f);
    if (/^(ops|launch|preview|admin)\//.test(rel)) continue; // internal routes are pruned from Production
    pages++;
    const text = fs.readFileSync(f, "utf8").replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ");
    for (const code of text.match(CODE) ?? []) {
      if (PROVENANCE_OK.has(code)) continue;
      if (!found.has(code)) found.set(code, []);
      if (found.get(code).length < 3) found.get(code).push(rel);
    }
  }
  assert.ok(pages > 1000, `POSITIVE CONTROL: the export has its pages (${pages})`);
  assert.deepEqual([...found.entries()], [], `raw codes in visible text — add reader words (lib/uiux/plain-codes.mjs) at the render point: ${JSON.stringify([...found.entries()])}`);
});
