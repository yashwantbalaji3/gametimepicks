/**
 * P251-F3 — UFC HAS PER-EVENT ROUTES, LIKE EVERY OTHER LIVE SPORT.
 *
 * Every "View report" on /ufc was an anchor to a row further down the same page, so a bout could
 * not be shared, bookmarked, linked to from a ranked panel, or indexed — on the sport whose model
 * is the best evidenced here: three heads, all PASS on preregistered bars over 3,557 held-out
 * fights, while MLB's markets were demoted to market context and NFL's and EPL's have never been
 * scored against a price.
 *
 * The claims: every bout on the card is addressable, no surface links to the retired anchor, and
 * a bout the model refuses to read still gets a page that says why rather than a page that lies.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { loadUfcCard, findUfcBout, ufcBoutIds, boutPositionLabel } from "./bout.ts";

const APP = process.cwd();

test("every bout on the current card is addressable", () => {
  const card = loadUfcCard();
  if (!card?.bouts?.length) return; // between cards there is nothing to address
  const ids = ufcBoutIds();
  assert.equal(ids.length, card.bouts.length, "the static-params list covers the whole card");
  assert.equal(new Set(ids).size, ids.length, "no bout id appears twice");
  for (const id of ids) {
    const ctx = findUfcBout(id);
    assert.ok(ctx, `bout ${id} resolves`);
    assert.equal(ctx.siblings.length, ids.length - 1, "the sibling strip is every OTHER bout");
    assert.ok(!ctx.siblings.some((s) => String(s.boutId) === String(id)), "a bout is never its own sibling");
  }
});

test("a bout the model refuses to read still gets a page, and says why", () => {
  const card = loadUfcCard();
  const refused = (card?.bouts ?? []).filter((b) => b.unmodelledReason);
  const src = fs.readFileSync(path.join(APP, "src/app/ufc/bout/[boutId]/page.tsx"), "utf8");
  assert.match(src, /bout\.unmodelledReason/, "the page renders the producer's own refusal");
  assert.match(src, /No model read for this bout/, "…under a heading that says so plainly");
  for (const b of refused) {
    assert.ok(findUfcBout(String(b.boutId)), `${b.red.name} vs ${b.blue.name} is still addressable`);
    assert.equal(b.prediction?.winner ?? null, null, "a refused bout carries no winner to render");
  }
});

test("no surface still links to the retired #bout- anchor", () => {
  const offenders = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!/\.(ts|tsx|mjs)$/.test(e.name) || /\.test\./.test(e.name)) continue;
      const s = fs.readFileSync(p, "utf8");
      /* The ID attribute stays — the hub still anchors its own rows; what must be gone is a LINK
         that navigates to it, because that is the one a reader clicks expecting a report. */
      for (const m of s.matchAll(/(href|reportHref)\s*[:=]\s*[^,\n]*#bout-/g)) {
        offenders.push(`${path.relative(APP, p)}: ${m[0].trim()}`);
      }
    }
  };
  walk(path.join(APP, "src"));
  assert.deepEqual(offenders, [], `these still send a reader to an anchor instead of the bout page:\n  ${offenders.join("\n  ")}`);
});

test("the position label uses the card's own vocabulary and never invents one", () => {
  assert.equal(boutPositionLabel(0, 13), "Main event");
  assert.equal(boutPositionLabel(1, 13), "Co-main event");
  assert.equal(boutPositionLabel(5, 13), "Bout 6 of 13");
});

test("the page prints the model's held-out evidence WITH its denominator", () => {
  const src = fs.readFileSync(path.join(APP, "src/app/ufc/bout/[boutId]/page.tsx"), "utf8");
  assert.match(src, /held-out fights/, "the sample is named beside the accuracy");
  assert.match(src, /e\.accuracy == null \|\| e\.n == null/, "an accuracy with no n is not printed at all");
  assert.match(src, /card\.model\?\.evidence\?\.(winner|method|round)/, "the numbers come from the artifact, never typed");
});
