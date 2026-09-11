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

test("LIVE · every eligible leg still travels — now in the explorer file — and the count the page states is the file's", () => {
  if (!fs.existsSync(PAGE)) return;
  /*
   * P257 · WHERE THE LEGS TRAVEL MOVED. The explorer used to be embedded in this page, so this read the
   * marketplace's `Legs (N)` heading and the omitted-row markers out of the HTML. The page grew with the
   * slate (886KB on 598 legs, 2026-09-11) and the explorer now loads its data from
   * out/data/build/explorer-slate.json on first open. The claims are unchanged — nothing is dropped,
   * the projection never swallows the rendered window — they are simply checked where the legs now are.
   */
  const raw = fs.readFileSync(PAGE, "utf8");
  const text = raw.replace(/<!--.*?-->/g, "").replace(/<[^>]+>/g, " ");
  const stated = /the full eligible-leg pool \((\d+) legs?, by risk\)/.exec(text);
  assert.ok(stated, "the disclosure states the pool size before anything loads");
  assert.equal((raw.match(/detailOmitted/g) ?? []).length, 0, "the page itself no longer carries the explorer payload");
  const file = path.join(process.cwd(), "out", "data", "build", "explorer-slate.json");
  assert.ok(fs.existsSync(file), "the build emits the explorer file the disclosure loads");
  const body = JSON.parse(fs.readFileSync(file, "utf8"));
  const pool = body?.slate?.eligibleLegs;
  const legs = Array.isArray(pool) ? pool : Object.values(pool ?? {}).flat();
  const total = legs.length;
  assert.equal(total, Number(stated[1]), `the page states ${stated[1]} legs; the explorer file carries ${total}`);
  if (total === 0) return; // the ordinary overnight regime: an empty pool, stated as such
  const bySport = new Map();
  for (const l of legs) { const k = l?.sport ?? l?.sportKey ?? "?"; bySport.set(k, [...(bySport.get(k) ?? []), l]); }
  for (const [sport, rows] of bySport) {
    const omitted = rows.filter((l) => isDetailOmitted(l)).length;
    if (rows.length > EXPLORER_LEG_RENDER_CAP) {
      assert.ok(omitted > 0, `${sport}: ${rows.length} legs exceed the ${EXPLORER_LEG_RENDER_CAP} cap — the projection must be in effect`);
      assert.ok(omitted < rows.length, `${sport}: every leg was omitted — the projection has swallowed the rendered window`);
    } else {
      assert.equal(omitted, 0, `${sport}: ${rows.length} legs fit inside the ${EXPLORER_LEG_RENDER_CAP} cap — nothing may be omitted`);
    }
  }
});

test("LIVE · the page is under its budget, and the budget never moved UP", () => {
  if (!fs.existsSync(PAGE)) return;
  const kb = fs.statSync(PAGE).size / 1024;
  /*
   * P251-F10 REBASE. This pinned the literal 1400 to stop someone RAISING the ceiling to hide a
   * regression — the right claim, stated in a way that also blocked the opposite move. When the
   * per-leg style attributes became classes the page fell to 573KB and the budget came down with
   * the emission, which is the shrink-only rule page-weight-budgets.mjs states about itself. The
   * ceiling is now read rather than matched, so it can fall and cannot rise.
   */
  const budgets = fs.readFileSync(path.join(process.cwd(), "src/lib/uiux/page-weight-budgets.mjs"), "utf8");
  const declared = Number((budgets.match(/"build\/custom\/index\.html":\s*(\d+)/) ?? [])[1]);
  assert.ok(Number.isFinite(declared), "the budget for /build/custom must be declared in the one owner");
  assert.ok(declared <= 1400, `the ceiling rose to ${declared}KB from 1400KB — raising it is hiding a regression one level up`);
  assert.ok(kb < declared, `/build/custom is ${Math.round(kb)}KB against its own ${declared}KB budget`);
});
