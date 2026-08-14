#!/usr/bin/env node
/**
 * Measure reader-facing prose per route from the BUILT export.
 *
 * "Too much text" is easy to assert and hard to act on, so this counts the thing that actually makes
 * a page read like speaker notes: sentences of 28+ words. Run it before and after a copy pass to see
 * whether the page got lighter or just moved words around.
 *
 *   npm run build && node scripts/audit-page-prose.mjs
 *
 * Explainer routes (/learn, /about, /methodology) are SUPPOSED to carry prose — judge product pages.
 */
// Measure reader-facing prose per route from the BUILT export — the words a user actually sees.
import fs from "node:fs"; import path from "node:path";
const OUT = "out";
const routes = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name === "index.html") routes.push(p);
  }
})(OUT);
const rows = [];
for (const f of routes) {
  let h = fs.readFileSync(f, "utf8");
  h = h.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ");
  const text = h.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();
  // Long sentences are the "speaker notes" signal: explanatory prose, not UI labels.
  const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.split(" ").length > 4);
  const long = sentences.filter((s) => s.split(" ").length >= 28);
  rows.push({
    route: "/" + path.relative(OUT, path.dirname(f)).replace(/\\/g, "/"),
    words: text.split(" ").length,
    sentences: sentences.length,
    longSentences: long.length,
    longest: long.sort((a, b) => b.length - a.length)[0]?.slice(0, 90) ?? "",
  });
}
rows.sort((a, b) => b.longSentences - a.longSentences || b.words - a.words);
console.log(`${rows.length} routes\n`);
console.log("WORST BY EXPLANATORY PROSE (sentences of 28+ words):");
for (const r of rows.slice(0, 18)) console.log(`  ${String(r.longSentences).padStart(3)} long · ${String(r.words).padStart(5)} words  ${r.route}`);
const tot = rows.reduce((s, r) => s + r.longSentences, 0);
console.log(`\ntotal long sentences across the site: ${tot}`);
