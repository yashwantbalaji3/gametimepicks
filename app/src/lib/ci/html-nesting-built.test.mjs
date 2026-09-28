/**
 * Every exported page must be markup the browser will NOT restructure (#782).
 *
 * Production /live shipped `<li><li>` from the pre-V2B NFL card: the text was right, every text-level
 * guard passed, and React threw hydration away (#418 → #423) because the parsed DOM no longer matched
 * its tree. This reads the built export and fails on either parser-repair class.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { invalidNesting } from "./html-nesting.mjs";

const APP = path.resolve(new URL("../../..", import.meta.url).pathname);
const OUT = path.join(APP, "out");

const pages = [];
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".html")) pages.push(p);
  }
};

test("no exported page contains markup the parser will repair before hydration", () => {
  walk(OUT);
  assert.ok(pages.length > 100, `anti-vacuity: expected the full export, found ${pages.length} pages`);
  assert.ok(pages.some((p) => p.endsWith(path.join("live", "index.html"))), "the flagship /live page must be among them");
  const bad = [];
  for (const p of pages) {
    const found = invalidNesting(fs.readFileSync(p, "utf8"));
    if (found.length) bad.push(`${path.relative(OUT, p)}: ${[...new Set(found.map((f) => `${f.kind}<${f.tag}>`))].join(", ")}`);
  }
  assert.deepEqual(bad.slice(0, 20), [], `${bad.length} page(s) would be restructured by the browser and fail hydration`);
});
