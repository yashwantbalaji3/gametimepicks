/**
 * C3 — the June completed-ladder policy, encoded and pinned (founder decision, 2026-09-22).
 *
 * The two completed June Bank Builder ladders (5–0 each) are REAL and are preserved. The decision governs
 * WHERE they may appear. They MAY stay typed in the projection, stay individually inspectable, and render in
 * an explicitly labelled Completed ladders / Legacy history context with exact dates and era context. They
 * may NEVER be the current Bank Builder headline, be added to the current protected record, be mixed into
 * receipt-era performance, contribute to a current-performance summary, or be offered as evidence for the
 * current methodology.
 *
 * A policy that lives only in prose is not encoded, so each clause is a test here, and each has a mutation
 * probe recorded in docs/V18_C3_LEGACY_LADDER_POLICY.md. Two clauses are ALSO facts about rendered pages
 * (the front door's record fallback and the legacy panel's labelling), and those are pinned at the bottom
 * against the real source, because the defect this decision corrects was a rendered one.
 *
 * Run: cd app && npx tsx --test src/lib/results/c3-legacy-presentation.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { readSources } from "../../../scripts/results/build-results-projection.mjs";
import {
  buildProjection, cellById, cellsByFamily, recordLabelOrNull, sumSameEra,
  headlineFor, headlineForProduct, legacyCells, mayShowIn, presentationOf,
  PRESENTATION, LEGACY_PRESENTATION_ERAS, ERAS, FAMILIES, makeCell, counts, STATUSES, RECORD_TYPES,
} from "./projection-core.mjs";

const APP = process.cwd();
const ROOT = path.join(APP, "public", "data");
const INTERNAL = path.join(path.dirname(APP), "data", "internal");
const P = buildProjection(readSources(ROOT, INTERNAL), { now: "2026-09-22T18:00:00Z" });
const byId = (id) => cellById(P, id);

/**
 * Source with block and line comments removed. The rendered-fact assertions below are about CODE: the first
 * draft of them failed because this file's own explanations of the OLD behaviour ("…CURRENT paper profit",
 * "`crownLadderSummary(dataRoot).recordLabel`") were still matching inside the doc comments of the files
 * being scanned. A guard that reads prose as code is a guard that will fire on its own footnotes.
 */
const codeOf = (rel) => fs.readFileSync(path.join(APP, rel), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");

const L1 = "product:-:bank-builder:LEDGER_ONLY:ladder-1";
const L2 = "product:-:bank-builder:LEDGER_ONLY:ladder-2";
const CURRENT = "product:-:bank-builder:COMPOSITE:protected-record";

test("POSITIVE CONTROL: the two June ladders are present, real, 5–0, and individually inspectable", () => {
  for (const id of [L1, L2]) {
    const c = byId(id);
    assert.ok(c, `${id} must remain in the projection — the decision PRESERVES these records`);
    assert.deepEqual([c.counts.won, c.counts.lost], [5, 0], `${id} is the real 5–0`);
    assert.equal(c.era, ERAS.LEDGER_ONLY);
    assert.equal(c.presentation, PRESENTATION.LEGACY_HISTORY);
    assert.ok(c.window.from && c.window.to, "exact dates, which the decision requires beside the figure");
    assert.ok(c.semantics.length > 20, "and its own methodology/era sentence");
  }
  assert.deepEqual([byId(L1).window.from, byId(L1).window.to], ["2026-06-09", "2026-06-13"]);
  assert.deepEqual([byId(L2).window.from, byId(L2).window.to], ["2026-06-18", "2026-06-24"]);
});

test("NEVER the current headline — no headline, by family or by product, may resolve to a legacy cell", () => {
  for (const family of Object.values(FAMILIES)) {
    const h = headlineFor(P, family);
    if (h) assert.notEqual(h.presentation, PRESENTATION.LEGACY_HISTORY, `headline for ${family} must not be legacy history (${h.cellId})`);
  }
  for (const product of ["bank-builder", "moonshot", "parlay-lab"]) {
    const h = headlineForProduct(P, product);
    if (h) assert.notEqual(h.presentation, PRESENTATION.LEGACY_HISTORY, `headline for ${product} must not be legacy history (${h.cellId})`);
  }
  // and specifically: the Bank Builder headline is the current composite, not a June ladder
  assert.equal(headlineForProduct(P, "bank-builder").cellId, CURRENT);
});

test("NEVER added to the current protected record — the composite declares its components and no LEDGER_ONLY is among them", () => {
  const cur = byId(CURRENT);
  assert.ok(Array.isArray(cur.composition) && cur.composition.length >= 2);
  const eras = cur.composition.map((c) => c.era);
  assert.deepEqual(eras, [ERAS.PROTECTED_BASE, ERAS.RECEIPT_ERA], "base + fold only");
  for (const e of eras) assert.ok(!LEGACY_PRESENTATION_ERAS.includes(e), `${e} is not a legacy-presentation era`);
  // arithmetic check: the composite equals base + fold exactly, so a 5–0 cannot be hiding inside it
  for (const k of ["won", "lost"]) {
    assert.equal(cur.counts[k], cur.composition.reduce((s, part) => s + part.counts[k], 0), `composite ${k} == Σ components`);
  }
  // …and adding a June ladder to the current record is refused outright
  assert.throws(() => sumSameEra([cur, byId(L1)]), /across eras|already a sum/);
});

test("NEVER mixed into receipt-era performance", () => {
  const receipt = byId("cycle:-:bank-builder:RECEIPT_ERA:-");
  assert.ok(receipt, "the receipt-era cycle cell exists");
  assert.deepEqual(receipt.window, { from: "2026-08-15", to: "2026-09-20" }, "the receipt era starts well after June");
  for (const id of [L1, L2]) {
    const l = byId(id);
    assert.ok(l.window.to < receipt.window.from, `${id} closes before the receipt era opens`);
    // refused either way: the cycle cell is a different family AND a non-summable record type
    assert.throws(() => sumSameEra([receipt, l]), /across families|across eras|not summable/);
  }
});

test("NEVER contributes to a current-performance summary — same-era arithmetic is refused in a CURRENT frame", () => {
  // The dangerous one: both are LEDGER_ONLY, so era/family/type checks all pass and 5–0 + 5–0 = 10–0.
  assert.throws(() => sumSameEra([byId(L1), byId(L2)]), /legacy history never contributes to current performance/);
  // It is allowed only for a caller that has declared the legacy frame, and the sum carries that frame.
  const legacySum = sumSameEra([byId(L1), byId(L2)], { context: PRESENTATION.LEGACY_HISTORY });
  assert.deepEqual([legacySum.counts.won, legacySum.counts.lost], [10, 0]);
  assert.equal(legacySum.presentation, PRESENTATION.LEGACY_HISTORY, "so it cannot be passed on as a current figure");
  assert.deepEqual(legacySum.window, { from: "2026-06-09", to: "2026-06-24" }, "and it carries the dates");
});

test("MAY render only in a legacy frame — the reader defaults to CURRENT and answers nothing there", () => {
  for (const id of [L1, L2]) {
    assert.equal(recordLabelOrNull(byId(id)), null, "an undeclared caller gets no figure");
    assert.equal(recordLabelOrNull(byId(id), { context: PRESENTATION.CURRENT }), null, "…and an explicit CURRENT caller too");
    assert.equal(recordLabelOrNull(byId(id), { context: PRESENTATION.LEGACY_HISTORY }), "5–0", "…and the real figure in a legacy panel");
    assert.equal(mayShowIn(byId(id), PRESENTATION.CURRENT), false);
    assert.equal(mayShowIn(byId(id), PRESENTATION.LEGACY_HISTORY), true);
  }
  // the CURRENT record is unaffected — this is a rule about legacy cells, not a blanket suppression
  assert.ok(recordLabelOrNull(byId(CURRENT)), "negative control: the current record still labels in a current frame");
  assert.equal(mayShowIn(byId(CURRENT), PRESENTATION.CURRENT), true);
  assert.throws(() => mayShowIn(byId(L1), "whatever"), /declared context/);
});

test("legacyCells is the one selector that answers with legacy cells, dated and oldest first", () => {
  const all = legacyCells(P);
  assert.ok(all.length >= 2);
  for (const c of all) {
    assert.equal(c.presentation, PRESENTATION.LEGACY_HISTORY);
    if (c.recordType !== RECORD_TYPES.ERA_GAP) assert.ok(c.window.from && c.window.to, `${c.cellId} carries exact dates`);
  }
  const froms = all.map((c) => c.window.from ?? "");
  assert.deepEqual(froms, [...froms].sort(), "oldest first, so a panel reads as a timeline");
  const bb = legacyCells(P, { product: "bank-builder" }).map((c) => c.cellId);
  assert.ok(bb.includes(L1) && bb.includes(L2), "the two June ladders are what a Bank Builder legacy panel draws");
  // no CURRENT cell leaks into the legacy selector
  assert.ok(!all.some((c) => c.cellId === CURRENT));
});

test("presentationOf is total and derives the frame from the era in one place", () => {
  for (const era of Object.values(ERAS)) {
    const got = presentationOf(era);
    assert.ok(Object.values(PRESENTATION).includes(got), `${era} → a declared context`);
    assert.equal(got === PRESENTATION.LEGACY_HISTORY, LEGACY_PRESENTATION_ERAS.includes(era), `${era} frame follows the era list`);
  }
  // PROTECTED_BASE is deliberately CURRENT: it is a declared component of the live composite, shown as its base
  assert.equal(presentationOf(ERAS.PROTECTED_BASE), PRESENTATION.CURRENT);
  assert.equal(presentationOf(ERAS.LEDGER_ONLY), PRESENTATION.LEGACY_HISTORY);
});

test("a LEGACY_HISTORY cell cannot be constructed without exact dates", () => {
  const base = {
    recordType: RECORD_TYPES.PRODUCT_RECORD, family: FAMILIES.PRODUCT, product: "bank-builder",
    era: ERAS.LEDGER_ONLY, counts: counts({ won: 5, lost: 0 }), n: 5, status: STATUSES.FROZEN,
    owner: { path: "mr-dub/banked-ladders.json", generatedAt: null, stampField: "bankedAt" },
    displayEligible: { eligible: true, reason: "probe" }, semantics: "a probe ladder",
  };
  assert.ok(makeCell({ ...base, window: { from: "2026-06-09", to: "2026-06-13" } }), "positive control: with dates it builds");
  assert.throws(() => makeCell({ ...base, window: { from: "2026-06-09", to: null } }), /needs exact dates/);
  assert.throws(() => makeCell({ ...base, window: { from: null, to: "2026-06-13" } }), /needs exact dates/);
  // a CURRENT-frame cell is not subject to this rule (an open window is legitimate for a live record)
  assert.ok(makeCell({ ...base, era: ERAS.RECEIPT_ERA, window: { from: "2026-08-15", to: null } }));
});

/* ── the two rendered facts this decision corrects ─────────────────────────────────────────────── */

test("RENDERED · the front door never falls back to a June ladder for its record", () => {
  const src = codeOf("src/app/page.tsx");
  // The defect: `let recordLabel = crown?.recordLabel ?? null` seeded the homepage's record with the June
  // 5–0, so any failure to read portfolio.json rendered `Record 5–0` as the CURRENT record.
  assert.doesNotMatch(src, /let\s+recordLabel[^=]*=\s*crown\??\.\s*recordLabel/, "the record must not be seeded from the crown ladder");
  assert.match(src, /let\s+recordLabel:\s*string\s*\|\s*null\s*=\s*null;/, "it must start at null and fail closed to no figure");
  assert.doesNotMatch(src, /crownLadderSummary/, "and the front door no longer imports or calls the completed-ladder summary");
});

test("RENDERED · the completed-ladder panel is labelled legacy, dated, and carries no current-performance figure", () => {
  const src = codeOf("src/components/achievement-banner.tsx");
  assert.match(src, /Completed ladders · legacy history/, "the explicit label the decision requires");
  assert.match(src, /aria-label="Completed ladders — legacy history"/, "…announced to assistive tech too");
  assert.match(src, /monthLabel|dayLabel/, "exact dates are rendered beside the figures");
  assert.match(src, /June multi-sport operator process/, "era / methodology context");
  assert.match(src, /not evidence for the\s+current methodology/, "and says so in words");
  // the current record and current profit no longer sit inside the legacy panel
  assert.doesNotMatch(src, /Bank Builder \{rec\.wins\}/, "the CURRENT record must not be rendered inside a legacy panel");
  assert.doesNotMatch(src, /paper profit/, "nor the current cumulative profit");
  assert.doesNotMatch(src, /challenge completed/, "and the old achievement headline is gone");
});
