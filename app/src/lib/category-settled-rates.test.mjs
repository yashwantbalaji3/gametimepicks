import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { CATEGORY_SETTLED_RATES, categoryRatesPhrase } from "./category-settled-rates.ts";

test("two public pages cannot state different settled rates for the same cohort", () => {
  /* THE DEFECT, found 2026-09-12: /about said "A 49.3%, B 50.0%, C 51.0%" and the market-guide
     glossary said "A 49.3%, B 50.6%, C 51.7%" — same 21,192 outcomes, two different triples. Both
     were hand-written literals, so neither could ever notice the other. */
  const root = path.join(process.cwd(), "src");
  const surfaces = ["app/about/page.tsx", "lib/glossary.ts"];
  for (const rel of surfaces) {
    const src = fs.readFileSync(path.join(root, rel), "utf8");
    assert.match(src, /CATEGORY_SETTLED_RATES|categoryRatesPhrase/, `${rel} must render the one owner`);
    /* No second transcription. Narrow on purpose: only a rate attached to a CATEGORY counts, so an
       unrelated percentage elsewhere on the page (the archived watchlist quotes 50.0% for something
       entirely different) is not swept in — the mistake this guard replaces was itself a number
       matched to the wrong thing. */
    const attached = [...src.matchAll(/Category\s+([ABC])[\s\S]{0,400}?[Ss]ettled(?:\s+at)?\s+(\d{1,2}\.\d)%/g)];
    assert.deepEqual(attached.map((m) => `${m[1]}=${m[2]}%`), [], `${rel} carries its own category rate literal`);
  }
});

test("the phrase is built from the numbers, and the direction is the claim that survives", () => {
  assert.equal(categoryRatesPhrase(), "A settled 49.4%, B 50.2%, C 50.9%");
  const r = CATEGORY_SETTLED_RATES;
  assert.ok(r.a < r.b && r.b < r.c, "anti-predictive: the biggest disagreements settled worst — both copies agreed on this");
  assert.ok(r.cohort > 1000);
});

test("it records when it was measured, and against how many rows", () => {
  /* The old copies claimed 21,192 outcomes — a snapshot neither page had refreshed. The cohort and
     the date travel with the numbers now, and published-rate-claims.test.mjs recomputes them from
     the ledger on every run, so a stale figure fails rather than ages quietly. */
  assert.equal(CATEGORY_SETTLED_RATES.cohort, 41007);
  assert.match(String(CATEGORY_SETTLED_RATES.measuredOn), /^\d{4}-\d{2}-\d{2}$/);
  const src = fs.readFileSync(new URL("./category-settled-rates.ts", import.meta.url), "utf8");
  assert.match(src, /settled_leans\.jsonl/, "and names the ledger it was measured from");
});
