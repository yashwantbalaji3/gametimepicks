/**
 * PUBLIC VOCABULARY guard (P209 · Release G — F7 closure).
 *
 * Scans the VISIBLE TEXT of every built public page (tags and scripts stripped, entities decoded):
 *   · retired destination names may never return anywhere;
 *   · internal pipeline vocabulary stays off primary surfaces — the labelled technical pages
 *     (methodology, research, system-status, market-guide) may use their own subject's terms.
 * Text-only by design: a route string inside an href is wiring, not copy, and denial phrases in
 * comments never render. No-ops when out/ is absent (CI unit lane).
 *
 * Run: npx tsx --test src/lib/uiux/public-vocabulary.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const OUT = path.join(APP, "out");
const hasBuild = fs.existsSync(path.join(OUT, "index.html"));

const RETIRED_EVERYWHERE = ["Picks Lab", "Build-a-Pick", "Parlay Lab"];
const INTERNAL_OFF_PRIMARY = ["optimizer", "settlement contract", "shadow lane", "research corpus", "leakage-safe"];
const TECHNICAL_PAGES = new Set(["methodology", "research", "system-status", "market-guide", "bucket-blitz", "goal-rush"]);

function* publicPages() {
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (["_next", "data"].includes(e.name)) continue;
        walk(path.join(dir, e.name));
      } else if (e.name === "index.html") {
        pages.push(path.join(dir, e.name));
      }
    }
  };
  const pages = [];
  walk(OUT);
  yield* pages;
}

const decode = (s) =>
  s.replace(/&rsquo;|&#x27;|&#39;/g, "'").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&mdash;/g, "—");

function visibleText(file) {
  let h = fs.readFileSync(file, "utf8");
  h = h.replace(/<script[\s\S]*?<\/script>/g, " ");
  return decode(h.replace(/<[^>]+>/g, " "));
}

test("retired destination names never render on any public page", () => {
  if (!hasBuild) return;
  const offenders = [];
  for (const p of publicPages()) {
    const text = visibleText(p);
    for (const term of RETIRED_EVERYWHERE) {
      if (text.includes(term)) offenders.push(`${p.replace(OUT, "")}: "${term}"`);
    }
  }
  assert.deepEqual(offenders, [], `retired names rendering:\n  ${offenders.join("\n  ")}`);
});

test("internal pipeline vocabulary stays off primary public surfaces", () => {
  if (!hasBuild) return;
  const offenders = [];
  for (const p of publicPages()) {
    const top = p.replace(OUT, "").split("/").filter(Boolean)[0] ?? "";
    if (TECHNICAL_PAGES.has(top)) continue; // labelled technical depth may speak its own subject
    const text = visibleText(p).toLowerCase();
    for (const term of INTERNAL_OFF_PRIMARY) {
      if (text.includes(term)) offenders.push(`${p.replace(OUT, "")}: "${term}"`);
    }
  }
  assert.deepEqual(offenders, [], `internal vocabulary on primary surfaces:\n  ${offenders.join("\n  ")}`);
});
