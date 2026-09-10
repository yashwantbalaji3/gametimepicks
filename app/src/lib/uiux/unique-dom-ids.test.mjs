/**
 * AN ID IS A PROMISE THAT EXACTLY ONE ELEMENT ANSWERS TO IT.
 *
 * P253. The homepage shipped two `<section id="top-reads">` — the "strongest reads today" panel and
 * the "next reads — upcoming" panel, both rendered from TopReadsPanel, which hardcoded the id. The
 * component's own comment already knew the page renders two of them; only the id collision was
 * missed.
 *
 * Nothing looked broken, which is the interesting part. today/top-reads-filter.tsx scrolls to
 * `#top-reads`, browsers resolve a duplicate id to the first match, and the first match happened to
 * be the panel the filter meant. The anchor worked BY ACCIDENT of document order — reorder the two
 * sections and the filter silently starts jumping to the wrong list, with no error anywhere.
 *
 * Checked on BUILT output, because that is where a duplicate can actually appear: two correct-looking
 * call sites of one component produce it, and no amount of reading either source file shows it.
 *
 * SCOPE: ids inside <main>. Framework and nav chrome are shared across every page and are not this
 * guard's business — scanning them would report the same handful of hits on all 390 routes and the
 * guard would be switched off within a week. (The nav-chrome trap, learned the hard way here.)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), "out");
const hasBuild = fs.existsSync(path.join(OUT, "index.html"));

/** Every built page, as repo-relative route + html. */
function* builtPages(dir = OUT) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* builtPages(p);
    else if (e.name === "index.html") {
      const rel = path.relative(OUT, dir).replace(/\\/g, "/");
      yield { route: `/${rel}${rel ? "/" : ""}`, html: fs.readFileSync(p, "utf8") };
    }
  }
}

const mainOf = (html) => {
  const m = html.match(/<main\b[\s\S]*?<\/main>/i);
  return m ? m[0] : "";
};

function duplicateIds(html) {
  const seen = new Map();
  for (const m of mainOf(html).matchAll(/\bid="([^"]+)"/g)) {
    seen.set(m[1], (seen.get(m[1]) ?? 0) + 1);
  }
  return [...seen.entries()].filter(([, n]) => n > 1).map(([id, n]) => `${id}×${n}`);
}

test("BUILT · no page renders the same id twice inside <main>", () => {
  if (!hasBuild) return;
  const offenders = [];
  let pages = 0;
  for (const { route, html } of builtPages()) {
    pages += 1;
    const dupes = duplicateIds(html);
    if (dupes.length) offenders.push(`${route} → ${dupes.join(", ")}`);
  }
  assert.ok(pages > 100, `expected a full export, saw ${pages} pages`);
  assert.deepEqual(
    offenders.slice(0, 20),
    [],
    "duplicate ids: an in-page anchor to one of these resolves by document order, not by intent",
  );
});

test("BUILT · the homepage's two ranked panels have distinct ids, and the anchor still means today", () => {
  if (!hasBuild) return;
  const html = fs.readFileSync(path.join(OUT, "index.html"), "utf8");
  const main = mainOf(html);
  const today = main.indexOf('id="top-reads"');
  const upcoming = main.indexOf('id="top-reads-upcoming"');
  if (today < 0) return; // no reads published for this state — nothing to anchor

  assert.equal(
    (main.match(/id="top-reads"/g) ?? []).length,
    1,
    "#top-reads must identify exactly one panel — the filter scrolls to it",
  );
  if (upcoming >= 0) {
    assert.ok(
      today < upcoming,
      "today's panel precedes the upcoming one; the filter's #top-reads must not land past it",
    );
  }
});
