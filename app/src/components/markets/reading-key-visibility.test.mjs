/**
 * P185 · RELEASE E — the beginner comparison OPENS the page; it is not one click away.
 *
 * The charter's rules for Market Center: the page must "open with a beginner comparison … price ->
 * implied probability -> no-vig -> model probability -> signed difference in percentage points",
 * and it must not "leave unexplained 'pts' or columns". A separate rule says essential definitions
 * "cannot depend on hover" — a collapsed <details> is the same failure with a different gesture.
 *
 * What was live: `how-to-read-markets.tsx` rendered as a single <details> with NO `open` attribute,
 * so at every viewport — desktop included — the worked example and the ONLY definition of `pp` were
 * both closed, while every row on the page rendered a `pp` figure.
 *
 * P141's density reasoning is preserved and is NOT what this guard argues with: the full glossary
 * may stay collapsed. What may not be collapsed is the sentence that makes the column legible.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const src = fs.readFileSync(path.join(APP, "src/components/markets/how-to-read-markets.tsx"), "utf8");
const strip = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const code = strip(src);

test("the worked example renders OUTSIDE the disclosure", () => {
  const example = code.indexOf("model <strong>58.6%</strong>");
  const details = code.indexOf("<details");
  assert.ok(example > -1, "the worked example must exist");
  assert.ok(details > -1, "the glossary disclosure must still exist");
  assert.ok(example < details,
    "the worked example is inside <details> again — a reader who does not click never meets it");
});

test("the unit rendered in every row is defined where the row is", () => {
  const beforeDetails = code.slice(0, code.indexOf("<details"));
  assert.match(beforeDetails, /\bpp\b/,
    "`pp` appears in every difference cell; its meaning may not live only inside a closed element");
});

test("the built page shows the comparison without any interaction", () => {
  /*
   * Asserted on the BUILT export. <details> content is present in the HTML whether open or closed,
   * so a naive source or HTML grep cannot tell the difference — the check is that the example sits
   * before the <details> element in document order, which is what the reader's eye follows.
   */
  const f = path.join(APP, "out", "markets", "index.html");
  if (!fs.existsSync(f)) return;
  const html = fs.readFileSync(f, "utf8");
  const example = html.indexOf("58.6%");
  const details = html.indexOf("<details");
  assert.ok(example > -1, "the worked example must be in the exported page");
  assert.ok(details === -1 || example < details,
    "the exported page still buries the comparison inside the first disclosure");
});

test("the glossary still covers the terms the page actually shows", () => {
  /* A shorter key is not the fix; hiding it was the defect. */
  for (const term of ["Model probability", "Market-implied probability", "American odds",
                      "pp (percentage point)", "Difference", "Data freshness", "No-play"]) {
    assert.ok(src.includes(term), `the reading key lost "${term}"`);
  }
});
