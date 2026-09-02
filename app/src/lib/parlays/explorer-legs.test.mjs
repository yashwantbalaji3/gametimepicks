/**
 * The eligible-leg payload projection — and the proof that no record was lost.
 *
 * Run: npx tsx --test src/lib/parlays/explorer-legs.test.mjs
 *
 * /build/custom shipped all 610 eligible legs in full: 549 KB, 65% of the page's client payload, and
 * 97 KB over its budget. The explorer renders at most `EXPLORER_LEG_RENDER_CAP` legs per sport and
 * otherwise resolves a leg only when a card references it — so 481 of the 610 were serialized
 * complete in order to be counted and nothing else.
 *
 * THE BUDGET WAS NOT RAISED AND NO ROW WAS HIDDEN. Every leg still travels; a leg nobody displays
 * travels as its identity. 1497 KB → 1071 KB against an unchanged 1400 KB budget.
 *
 * A NOTE ON ARCHITECTURE. The charter proposed detail chunks fetched on demand with a manifest. That
 * turned out to be unnecessary: the payload was not large because the page needs a lot of data, it
 * was large because it shipped display objects for rows it never renders. Projecting them costs zero
 * extra requests, no manifest, no chunk-failure states and no loading spinner — so the corruption
 * cases for missing manifests, missing chunks and network failure do not exist here. The cases that
 * DO exist are below.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { EXPLORER_LEG_RENDER_CAP, isDetailOmitted } from "./explorer-legs.ts";

const omitted = { legId: "x", sport: "MLB", detailOmitted: true };
const full = { legId: "y", sport: "MLB", market: "h2h", participant: "Someone", americanOdds: -120 };

test("an omitted row is recognised; a full row is not", () => {
  assert.equal(isDetailOmitted(omitted), true);
  assert.equal(isDetailOmitted(full), false);
});

test("REFUSAL · the predicate survives the shapes a renderer may actually hand it", () => {
  /*
   * The first signature typed the argument as `{ detailOmitted?: boolean }`, which TypeScript
   * rejected at every call site because a full display object has no property in common with it.
   * The runtime behaviour matters as much: null and undefined must not throw on a page render.
   */
  for (const v of [null, undefined, 0, "", [], {}]) assert.equal(isDetailOmitted(v), false);
});

test("the render cap is a SHARED constant, not two numbers that happen to match", () => {
  /*
   * The projection keeps this many full objects per sport and the component slices this many. If
   * they were separate literals, raising one would render rows whose detail was never shipped.
   */
  assert.ok(Number.isInteger(EXPLORER_LEG_RENDER_CAP) && EXPLORER_LEG_RENDER_CAP > 0);

  const loader = fs.readFileSync(path.join(process.cwd(), "src/lib/parlays/ui-loader.ts"), "utf8");
  const view = fs.readFileSync(path.join(process.cwd(), "src/components/parlays/parlays-explorer.tsx"), "utf8");
  assert.match(loader, /EXPLORER_LEG_RENDER_CAP/, "the projection uses the shared cap");
  assert.match(view, /EXPLORER_LEG_RENDER_CAP/, "the component slices by the shared cap");
  assert.ok(!/slice\(0,\s*60\)/.test(view), "no literal 60 may remain beside the shared cap");
});

test("THE CONTRACT MODULE IS NODE-FREE — the client must be able to load it", () => {
  /*
   * The first attempt put the cap and the predicate in `ui-loader.ts`, which reads the filesystem.
   * Importing it from the client component pulled `node:fs` into the browser bundle and webpack
   * refused the build — correctly. A contract two runtimes share cannot live in a module only one of
   * them can load.
   */
  /* Strip comments first. The module's own docblock EXPLAINS the node:fs defect, and a scan that
     cannot tell an explanation from an import fails on the sentence describing the bug it prevents —
     which teaches the next author to delete the explanation. Fifth time this class has appeared. */
  const blank = (m) => m.replace(/[^\n]/g, " ");
  const code = fs
    .readFileSync(path.join(process.cwd(), "src/lib/parlays/explorer-legs.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/\/\/.*$/gm, blank);
  for (const forbidden of ["node:fs", "node:path", 'from "fs"', 'from "path"']) {
    assert.ok(!code.includes(forbidden), `explorer-legs.ts must not import ${forbidden}`);
  }
  assert.ok(!/^\s*import .*(fs|path)/m.test(code), "and no filesystem import may appear at all");
});

/* ── AGAINST THE BUILT EXPORT ──────────────────────────────────────────────────────────────────── */

const PAGE = path.join(process.cwd(), "out", "build", "custom", "index.html");

test("LIVE · every eligible leg still travels, and the count the page shows is unchanged", () => {
  if (!fs.existsSync(PAGE)) return;
  const raw = fs.readFileSync(PAGE, "utf8");

  const text = raw.replace(/<!--.*?-->/g, "").replace(/<[^>]+>/g, " ");
  const shown = /Legs \((\d+)\)/.exec(text);

  /*
   * A THIRD REGIME, and it is the ordinary overnight one.
   *
   * `Legs (N)` is the marketplace accordion's heading and only renders for a sport tab that has
   * legs. Late at night every game has started, the eligible pool is legitimately zero, and the page
   * renders "0 eligible legs" with a named reason and the builder still mounted — which is correct
   * behaviour, not a missing count.
   *
   * This guard asserted the heading unconditionally and went red at 23:52 ET for the second time in
   * two days, in the branch next to the one already fixed for the same reason. A guard that fails on
   * a correct empty slate teaches whoever is on call that this file cries wolf.
   */
  if (!shown) {
    assert.match(text, /\b0 eligible legs?\b/, "an empty pool must still state its count");
    assert.match(text, /No eligible legs right now/, "and say why, rather than rendering blank");
    assert.equal(
      (raw.match(/detailOmitted/g) ?? []).length,
      0,
      "nothing may be omitted from a pool that is empty",
    );
    return;
  }
  const total = Number(shown[1]);

  const omittedRows = (raw.match(/detailOmitted/g) ?? []).length;

  /*
   * THE ASSERTION DEPENDS ON THE SLATE, and both regimes are real.
   *
   * This used to assert `omittedRows > 0` unconditionally, which made it a test of how many games
   * happened to be on tonight rather than of the projection. It failed at 21:30 ET on a 32-leg slate
   * — below the per-sport render cap, where omitting nothing is the CORRECT behaviour — so the guard
   * went red because the product was right. A test that fails when the code succeeds gets deleted by
   * whoever is on call, and the real claim goes with it.
   *
   * The real claim holds either way: nothing is ever dropped, and the projection never swallows the
   * window it exists to preserve.
   */
  if (total > EXPLORER_LEG_RENDER_CAP) {
    assert.ok(omittedRows > 0, `a ${total}-leg slate exceeds the ${EXPLORER_LEG_RENDER_CAP} cap — the projection must be in effect`);
    assert.ok(
      omittedRows < total,
      `every leg was omitted (${omittedRows} of ${total}) — the projection has swallowed the rendered window`,
    );
  } else {
    assert.equal(
      omittedRows,
      0,
      `a ${total}-leg slate fits inside the ${EXPLORER_LEG_RENDER_CAP} cap — nothing may be omitted from it`,
    );
  }
});

test("LIVE · the page is under its budget without the budget having moved", () => {
  if (!fs.existsSync(PAGE)) return;
  const kb = fs.statSync(PAGE).size / 1024;
  assert.ok(kb < 1400, `/build/custom is ${Math.round(kb)}KB against the 1400KB budget`);

  const budgets = fs.readFileSync(path.join(process.cwd(), "src/lib/uiux/page-weight-budgets.mjs"), "utf8");
  assert.match(budgets, /1400/, "the 1400KB budget must still be the budget — raising it is hiding records one level up");
});
