/**
 * RENDERED · NO RECORD SURFACE PRINTS "0–0" (v1.8 · Track C · C2).
 *
 * The C9 rule is that a consumer which cannot find a record prints NOTHING. The projection enforces it in
 * the model — `recordLabelOrNull` returns null rather than a zero — but the OTHER read model over the same
 * owners does not: `read-model.mjs`'s `row()` coerces every absent count with `wins ?? 0`, and **12 of its
 * 31 rows today carry `wins: 0, losses: 0`** for lab streams that have never settled a card (all four NFL
 * tiers, two EPL tiers, all four `multi` tiers, and the NFL and multi stream totals).
 *
 * Nothing renders them as `0–0` today, and that is the point: the only thing standing between those rows
 * and a rendered "0–0" is one early return inside the explorer's `Rate` component (`if
 * (!row.hitRate.available)`). A rule that holds because of one conditional, with nothing pinning it, is a
 * rule that lasts until someone adds a second place that prints `{wins}-{losses}`. `/results` already has
 * two such call sites.
 *
 * WHY THIS IS SCOPED RATHER THAN SITE-WIDE. A blanket scan for "0–0" over `out/` finds **64 pages** — and
 * every one is an EPL exact-score probability table, where `0–0` is a scoreline and entirely correct. A
 * detector that cries wolf on 64 legitimate pages is not a weaker version of a good detector; it is one
 * that gets ignored. So it runs over the surfaces that print RECORDS, and the negative control below
 * asserts it stays silent on a scoreline page.
 *
 * WHAT THIS GUARD CANNOT SEE, stated because a probe found it rather than a reading. Removing the `Rate`
 * early return and rebuilding changed NOTHING in the static HTML: `results-explorer.tsx` is a client
 * component, and the twelve zero rows only reach the DOM after a viewer selects NFL or `multi` in its
 * filter. So this guard does not cover the explorer's filtered rows at all — it covers the SERVER-rendered
 * record surfaces, which is where C2 repointed the readers and therefore where a regression would land.
 * Proven, not assumed: making `currentProductRecord` return "0–0" and rebuilding fails the last test with
 * both front-door contexts named. The explorer's filtered rows need a driven browser test; that is the
 * named follow-up, not something this file silently pretends to do.
 *
 * Run: cd app && npm run build && npx tsx --test src/lib/results/c9-never-zero-zero.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const OUT = path.join(APP, "out");

/** The public surfaces that print a product or model RECORD. No scorelines live on any of them. */
const RECORD_SURFACES = [
  "index.html",
  "today/index.html",
  "results/index.html",
  "bank-builder/index.html",
  "moonshot/index.html",
  "mr-dub/index.html",
];

/** A page's visible text: tags stripped, entities decoded, whitespace collapsed. */
function visibleText(html) {
  const decoded = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
  return decoded.replace(/\s+/g, " ");
}

/**
 * A rendered zero record: `0–0` or `0—0`, not part of a longer number.
 *
 * BOTH dash forms are matched. The canonical formatter uses an en dash, but `/results`' "Official record"
 * tile writes `${wins}-${losses}` with an ASCII hyphen and the explorer's Rate does the same — a detector
 * that knew only the en dash would miss the two call sites most likely to regress. Measured before
 * widening: ASCII `0-0` occurs ZERO times across all six surfaces, so this costs no noise. The word and
 * digit boundaries keep it off ids, dates and class names.
 */
/*
 * TWO regexes on purpose. A `/g` regex carries `lastIndex` between calls, so reusing one across
 * `assert.match`, `.test()` and `.match()` makes it answer differently on identical input depending on
 * what was checked before it. The positive control below caught exactly that: the third sample failed
 * against a detector that had just matched the second. The stateless one is for asking; the global one
 * is only ever used with `String.prototype.match`, which resets it.
 */
const ZERO_RECORD = /(?<![\d.\w])0\s*[–—-]\s*0(?![\d.\w])/;
const ZERO_RECORD_ALL = /(?<![\d.\w])0\s*[–—-]\s*0(?![\d.\w])/g;

const read = (rel) => fs.readFileSync(path.join(OUT, rel), "utf8");

test("REFUSAL: this guard needs a built export, or it proves nothing", () => {
  assert.ok(fs.existsSync(OUT), "app/out/ is missing — run `npm run build` first");
  for (const rel of RECORD_SURFACES) {
    assert.ok(fs.existsSync(path.join(OUT, rel)), `${rel} must exist in the built export, or this guard silently skips it`);
  }
});

test("POSITIVE CONTROL: the detector really does see a rendered zero record", () => {
  for (const sample of [
    '<span class="record">0–0</span>',
    "<p>Record 0 – 0 · 0 pending</p>",
    "<td>0—0</td>",
  ]) assert.match(visibleText(sample), ZERO_RECORD, `must fire on: ${sample}`);

  // …and NOT on the things that merely look like one.
  for (const sample of [
    '<span>10–0</span>',                 // a real record that starts with a zero digit
    '<span>0–01</span>',
    '<span>v0-0-1</span>',               // a version string — word boundaries exclude it
    '<time datetime="2026-09-22">Sep 22</time>',
    '<span>0.0–0.5</span>',
  ]) assert.doesNotMatch(visibleText(sample), ZERO_RECORD, `must not fire on: ${sample}`);
});

test("NEGATIVE CONTROL: an EPL exact-score table keeps its legitimate 0–0", () => {
  /* 64 built pages render "0–0" as a SCORELINE. If this guard ever covers them it has become noise, and
     the right response is to narrow the scope rather than to change the pages. */
  const matches = fs.readdirSync(path.join(OUT, "epl", "match"), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => path.join("epl", "match", e.name, "index.html"))
    .filter((rel) => fs.existsSync(path.join(OUT, rel)));
  assert.ok(matches.length > 0, "there must be EPL match pages, or this control proves nothing");
  const withScoreline = matches.filter((rel) => ZERO_RECORD.test(visibleText(read(rel))));
  assert.ok(withScoreline.length > 0, "at least one EPL page must render a 0–0 scoreline, or the control is vacuous");
  for (const rel of withScoreline) {
    assert.ok(!RECORD_SURFACES.includes(rel), `${rel} is a scoreline page and must stay out of scope`);
  }
});

test("no public record surface renders a 0–0", () => {
  const offenders = [];
  for (const rel of RECORD_SURFACES) {
    const text = visibleText(read(rel));
    const hits = text.match(ZERO_RECORD_ALL) ?? [];
    if (hits.length === 0) continue;
    const context = [...text.matchAll(/.{70}(?<![\d.\w])0\s*[–—-]\s*0(?![\d.\w]).{40}/g)].map((m) => m[0].trim());
    offenders.push(`${rel}: ${hits.length} × ${JSON.stringify(context.slice(0, 2))}`);
  }
  assert.deepEqual(
    offenders, [],
    "a record that cannot be sourced prints NOTHING — never 0–0. `read-model.mjs` coerces 12 absent rows to " +
      "wins:0/losses:0, so a new call site that prints {wins}-{losses} without checking hitRate.available " +
      "puts a fabricated zero record on a public page:\n  " + offenders.join("\n  "),
  );
});
