/**
 * C2 — THE FRAME IS DERIVED FROM THE ERA, AND THE CURRENT RECORD IS ASKED ONCE.
 *
 * Two things are pinned here.
 *
 * 1. THE C3 POLICY MUST HOLD OVER THE ARTIFACT A PAGE ACTUALLY LOADS, not only over cells fresh from the
 *    constructor. C3's own suite builds every cell through `makeCell`, which stamps `presentation`; the
 *    committed `results/projection/latest.json` was built BEFORE C3 existed and carries no such field on
 *    any of its 53 cells. Three of the four C3 predicates read that stamp, so against the real file both
 *    June 5–0 completed ladders answered `recordLabelOrNull` with "5–0" in the DEFAULT CURRENT frame,
 *    `mayShowIn(cell, "CURRENT")` was true, and `legacyCells()` returned ZERO — the policy failed open on
 *    the front-door side and failed shut on the legacy-panel side, simultaneously. The tests below run
 *    against THE COMMITTED ARTIFACT ON DISK, unmodified, because that is the only thing a page reads.
 *
 * 2. THE THREE SURFACES THAT PRINT THE CURRENT RECORD ASK ONE READER. They each opened the owner and
 *    formatted the figure by hand, which is how the front door came to fall back to a June ladder.
 *
 * Run: cd app && npx tsx --test src/lib/results/c2-consolidation.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  cellPresentation, ERAS, legacyCells, makeCell, mayShowIn, PRESENTATION,
  presentationOf, RECORD_TYPES, FAMILIES, STATUSES, counts, recordLabelOrNull, sumSameEra,
} from "./projection-core.mjs";

const APP = process.cwd();
const ARTIFACT = path.join(APP, "public", "data", "results", "projection", "latest.json");
const committed = JSON.parse(fs.readFileSync(ARTIFACT, "utf8"));
const codeOf = (rel) => fs.readFileSync(path.join(APP, rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const juneLadders = () => committed.cells.filter((c) => c.era === ERAS.LEDGER_ONLY && /ladder-\d+$/.test(c.cellId));

/* ── 1. the committed artifact really is the pre-C3 shape this guards against ──────────────────── */

test("PREMISE: the committed artifact carries no `presentation` stamp — the thing that made the stamp untrustworthy", () => {
  const stamped = committed.cells.filter((c) => c.presentation !== undefined);
  assert.equal(stamped.length, 0, "if a rebuilt artifact is committed this premise changes, but the rule below must still hold by derivation");
  const ladders = juneLadders();
  assert.equal(ladders.length, 2, "both June completed ladders are present as typed cells");
  for (const c of ladders) {
    assert.equal(c.counts.won, 5);
    assert.equal(c.counts.lost, 0);
    assert.equal(c.displayEligible.eligible, true, "they ARE display-eligible — the frame is what restricts them");
  }
});

/* ── 2. the frame, derived ─────────────────────────────────────────────────────────────────────── */

test("a June ladder from the committed artifact is refused in the CURRENT frame", () => {
  for (const c of juneLadders()) {
    assert.equal(cellPresentation(c), PRESENTATION.LEGACY_HISTORY, `${c.cellId} is legacy by its era`);
    assert.equal(recordLabelOrNull(c), null, "the default CURRENT frame must answer with no figure");
    assert.equal(recordLabelOrNull(c, { context: PRESENTATION.CURRENT }), null, "…and an explicit CURRENT too");
    assert.equal(mayShowIn(c, PRESENTATION.CURRENT), false);
  }
});

test("POSITIVE CONTROL: the same cells DO answer an explicitly legacy panel, with their exact dates", () => {
  const legacy = legacyCells(committed, { product: "bank-builder" });
  const ids = legacy.map((c) => c.cellId);
  for (const c of juneLadders()) {
    assert.ok(ids.includes(c.cellId), `${c.cellId} must be reachable by the legacy selector — its only permitted home`);
    assert.equal(recordLabelOrNull(c, { context: PRESENTATION.LEGACY_HISTORY }), "5–0");
    assert.equal(mayShowIn(c, PRESENTATION.LEGACY_HISTORY), true);
    assert.ok(c.window.from && c.window.to, "the decision allows them only with exact dates");
  }
  assert.ok(legacy.length >= 2, `legacyCells returned ${legacy.length} — it returned 0 before the frame was derived`);
});

test("POSITIVE CONTROL: a CURRENT cell from the same artifact is untouched", () => {
  const cur = committed.cells.find((c) => c.cellId === "product:-:bank-builder:COMPOSITE:protected-record");
  assert.ok(cur, "the composite protected record is the bank-builder headline");
  assert.equal(cellPresentation(cur), PRESENTATION.CURRENT);
  assert.equal(recordLabelOrNull(cur), "36–35", "the figure every current surface prints");
  assert.equal(mayShowIn(cur, PRESENTATION.CURRENT), true);
});

test("a stamped frame that contradicts its era is REFUSED, not believed", () => {
  const [ladder] = juneLadders();
  assert.throws(
    () => cellPresentation({ ...ladder, presentation: PRESENTATION.CURRENT }),
    /contradicts itself/,
    "an artifact cannot widen its own frame by stamping one",
  );
  // …and an agreeing stamp is fine, so this is a contradiction check and not a ban on the field.
  assert.equal(cellPresentation({ ...ladder, presentation: PRESENTATION.LEGACY_HISTORY }), PRESENTATION.LEGACY_HISTORY);
  const cur = committed.cells.find((c) => c.era === ERAS.COMPOSITE);
  assert.equal(cellPresentation({ ...cur, presentation: PRESENTATION.CURRENT }), PRESENTATION.CURRENT);
});

test("a cell with no typed era establishes no frame, and fails CLOSED", () => {
  const untyped = { cellId: "probe", era: "NOT_AN_ERA", recordType: RECORD_TYPES.PRODUCT_RECORD, counts: counts({ won: 9, lost: 1 }), displayEligible: { eligible: true, reason: "probe" } };
  assert.equal(cellPresentation(untyped), null);
  assert.equal(recordLabelOrNull(untyped), null, "no frame ⇒ no figure, never a figure by default");
  assert.equal(mayShowIn(untyped, PRESENTATION.CURRENT), false);
  // control: the identical cell with a typed CURRENT era does label, so the refusal is the era and nothing else
  assert.equal(recordLabelOrNull({ ...untyped, era: ERAS.RECEIPT_ERA }), "9–1");
});

test("the constructor still stamps the frame, and it agrees with the derivation", () => {
  const cell = makeCell({
    recordType: RECORD_TYPES.PRODUCT_RECORD, family: FAMILIES.PRODUCT, product: "bank-builder",
    era: ERAS.LEDGER_ONLY, counts: counts({ won: 5, lost: 0 }), n: 5, status: STATUSES.FROZEN,
    owner: { path: "mr-dub/banked-ladders.json", generatedAt: null, stampField: "bankedAt" },
    window: { from: "2026-06-09", to: "2026-06-13" },
    displayEligible: { eligible: true, reason: "probe" }, semantics: "a probe ladder",
  });
  assert.equal(cell.presentation, PRESENTATION.LEGACY_HISTORY);
  assert.equal(cellPresentation(cell), cell.presentation, "stamp and derivation must never disagree for a constructed cell");
  assert.equal(presentationOf(cell.era), cell.presentation, "and both come from presentationOf — the one rule site");
});

test("legacy cells still cannot be summed into a current frame, from the committed artifact", () => {
  const ladders = juneLadders();
  assert.throws(() => sumSameEra(ladders), /never contributes to current performance/, "5–0 + 5–0 must not become a current 10–0");
  const legacySum = sumSameEra(ladders, { context: PRESENTATION.LEGACY_HISTORY });
  assert.equal(legacySum.counts.won, 10, "positive control: the legacy frame may sum them");
  assert.equal(legacySum.presentation, PRESENTATION.LEGACY_HISTORY, "and the sum carries its own frame");
});

/* ── 3. the three surfaces ask one reader ──────────────────────────────────────────────────────── */

const SURFACES = ["src/app/page.tsx", "src/app/today/page.tsx", "src/app/bank-builder/page.tsx"];

test("every surface that prints the current record reads it through currentProductRecord", () => {
  for (const rel of SURFACES) {
    const src = codeOf(rel);
    assert.match(src, /import \{ currentProductRecord \} from "@\/lib\/results\/current-record"/, `${rel} imports the one reader`);
    assert.match(src, /currentProductRecord\("bank-builder"\)/, `${rel} asks it for the product`);
  }
});

test("…and none of them opens the record owner or formats the figure itself", () => {
  for (const rel of SURFACES) {
    const src = codeOf(rel);
    assert.doesNotMatch(src, /"mr-dub", "portfolio\.json"/, `${rel} must not open the record owner inline`);
    assert.doesNotMatch(src, /\.record\.wins/, `${rel} must not re-derive the record from raw owner fields`);
    assert.doesNotMatch(src, /LEGACY_HISTORY/, `${rel} must never declare the legacy frame`);
  }
});

test("the shared reader passes NO presentation context — that is what makes a legacy era unreachable", () => {
  const src = fs.readFileSync(path.join(APP, "src/lib/results/current-record.ts"), "utf8");
  assert.match(src, /recordLabelOrNull\(cell\)/, "called with the cell alone, so the strict CURRENT default applies");
  assert.doesNotMatch(src.replace(/\/\*[\s\S]*?\*\//g, ""), /context:/, "it must not pass a context at all");
});

/* ── 4. two MORE rendered C3 violations, on the surfaces C3 did not audit ──────────────────────── */

test("RENDERED · the /results products grid describes Bank Builder by its CURRENT record, not a June completion", () => {
  const tile = codeOf("src/components/results/trust-center.tsx");
  /* The defect: `detail: `${model.completedCards[0].name} completed ${…result}`` rendered
     "Road to $10K completed 5–0" beside "2 paper cards published today" — a June ladder inside a current
     products summary, undated and unlabelled. */
  assert.doesNotMatch(tile, /completedCards\[0\]\.name\} completed/, "a completed June ladder must not be the tile's description");
  assert.match(tile, /model\.bankBuilderRecordLabel/, "the tile carries the current record instead");
  const model = codeOf("src/lib/results-trust-center.ts");
  assert.match(model, /bankBuilderRecordLabel: currentProductRecord\("bank-builder"\)\.recordLabel/, "…sourced through the one canonical reader");
  assert.doesNotMatch(model, /LEGACY_HISTORY/, "…which is never asked for the legacy frame on this path");
});

test("RENDERED · /bank-builder's completed-ladder strip is labelled legacy, dated, and carries its era", () => {
  const hero = codeOf("src/components/bank-builder/climb-hero.tsx");
  assert.match(hero, /Completed ladders · legacy history/, "the explicit label the decision requires");
  assert.match(hero, /aria-label="Completed ladders — legacy history"/, "…announced to assistive tech too");
  assert.match(hero, /ladderDates\(l\)/, "exact dates are rendered beside each ladder");
  assert.match(hero, /June 2026 multi-sport operator process/, "era / methodology context");
  assert.match(hero, /not evidence for the current methodology/, "and says so in words");
});

test("…and an UNDATED completed ladder is dropped rather than rendered without its dates", () => {
  const page = codeOf("src/app/bank-builder/page.tsx");
  assert.match(page, /const from = dates\[0\] \?\? null;/, "the span is read from the owner's own dates");
  assert.match(page, /if \(!from \|\| !to\) return null;/, "a ladder without them is not rendered");
  assert.match(page, /\.filter\(Boolean\)/, "…and is actually dropped from the list");
});

test("RENDERED · /results' Bank Builder history shows the June ladders only as dated legacy history", () => {
  const tc = codeOf("src/components/results/trust-center.tsx");
  /* The defect: `model.completedCards.map(...)` under the heading "Bank Builder — settled cards", with no
     date, no era, and the CURRENT awaiting-lane note directly beneath. */
  assert.doesNotMatch(tc, /model\.completedCards\.map/, "the conflated, undated completedCards row must not render");
  assert.match(tc, /model\.legacyLadders\.map/, "the dated per-ladder source renders instead");
  assert.match(tc, /Completed ladders · legacy history/, "inside an explicitly labelled legacy panel");
  assert.match(tc, /aria-label="Completed ladders — legacy history"/);
  assert.match(tc, /legacyDay\(c\.completedDate\)/, "each ladder carries its exact completion date");
  assert.match(tc, /June 2026 multi-sport operator process/, "era / methodology context");

  const model = codeOf("src/lib/results-trust-center.ts");
  assert.match(model, /typeof l\.completedDate === "string" && l\.completedDate/, "an undated ladder is dropped, never shown undated");
});

test("RENDERED · /mr-dub's ladder section does not sum the two June ladders, and is framed as legacy", () => {
  const src = codeOf("src/app/mr-dub/page.tsx");
  /* "ten winning legs" is 5–0 + 5–0 = 10–0 written by hand — the arithmetic `sumSameEra` throws on. A
     refusal in the model does nothing about a total typed into a string. */
  assert.doesNotMatch(src, /ten winning legs/, "the two legacy ladders must not be summed in prose");
  assert.doesNotMatch(src, /eyebrow="The record, as settled"/, "…nor framed as the settled record");
  assert.match(src, /eyebrow="Completed ladders · legacy history"/, "the explicit legacy label");
  assert.match(src, /Jun 9 – Jun 24/, "exact dates");
  assert.match(src, /June multi-sport operator process/, "era / methodology context");
  assert.doesNotMatch(src, /Today's lane climbs toward its next rung/, "and today's lane is not pulled into the legacy sentence");
});
