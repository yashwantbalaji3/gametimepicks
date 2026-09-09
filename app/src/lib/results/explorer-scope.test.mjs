/**
 * P250 · A07/A11 — filter scope, pooled disclosure, and the finishable-pending contract.
 *
 * Source-contract guards over the results explorer and the settlement sweep: the sport×tier grid
 * obeys the same sport filter as the headline; a ≥90%-one-sport pooled figure names its mix; the
 * date-refusal copy points at the real dated surfaces instead of over-claiming "aggregate only";
 * the settler voids a scratch instead of pending it forever; and the nightly workflow runs the
 * pending-day sweep so no finishable day is left behind again.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const explorer = fs.readFileSync(path.join(APP, "src/components/results/results-explorer.tsx"), "utf8");
const settler = fs.readFileSync(path.join(APP, "scripts/parlays/settle-lab-cards.mjs"), "utf8");
const workflow = fs.readFileSync(path.join(APP, "..", ".github/workflows/nightly-settle.yml"), "utf8");

test("the sport×tier grid obeys the selected sport — same rule as the per-sport table", () => {
  const grid = explorer.slice(explorer.indexOf("By sport and risk tier"));
  assert.match(grid, /gridSports\.filter\(\(sp\) => sport === "all" \|\| sp === sport\)/, "the grid filters by the selected sport");
});

test("a one-sport-dominated pooled figure names its mix", () => {
  assert.match(explorer, /of this pooled population is/, "the disclosure sentence exists");
  assert.match(explorer, /share < 0\.9/, "…and appears exactly when one sport supplies ≥90% of decisive");
});

test("the date-refusal copy points at the dated surfaces that actually exist", () => {
  assert.match(explorer, /model-audit/, "MLB's dated event-level explorer is linked");
  assert.match(explorer, /results\/picks/, "the per-sport graded-pick lists are linked");
  assert.ok(!explorer.includes("would narrow the label without"), "the over-broad aggregate-only claim is gone");
});

test("settler: a scratch against a FINAL box voids; an unknown market never fabricates a refund", () => {
  assert.match(settler, /if \(!stats\) \{ results\.push\("void"\); continue; \}/, "scratch → void");
  assert.match(settler, /marketKnown\(leg\.marketLabel\) \? "void" : "pending"/, "known-market missing stat → void; unknown market stays pending");
  assert.match(settler, /r !== "push" && r !== "void"/, "voids reduce the card like pushes");
});

test("completion re-runs carry forward what a quiet source can no longer say, inside the recorded population", () => {
  assert.match(settler, /the recorded population stands/, "cards not on the recorded receipt are left out, logged");
  assert.match(settler, /source no longer answers — the recorded/, "decided outcomes never regress to pending");
});

test("the nightly workflow sweeps finishable pending days", () => {
  assert.match(workflow, /complete-pending-days\.mjs --now "\$NOW" --window-days 30 --apply/, "the sweep runs after ET-yesterday settlement");
});

test("LIVE · no lab receipt in the last 30 days carries a pending card older than 3 days", () => {
  const dir = path.join(APP, "public/data/parlays/lab-settled");
  const today = new Date().toISOString().slice(0, 10);
  for (const f of fs.readdirSync(dir).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x))) {
    const date = f.slice(0, 10);
    const ageDays = (Date.parse(today) - Date.parse(date)) / 86_400_000;
    if (ageDays <= 3 || ageDays > 30) continue; // fresh days may legitimately pend; older than the window is out of scope
    const doc = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    const pending = (doc.cards ?? []).filter((c) => c.result === "pending");
    assert.equal(pending.length, 0, `${date}: ${pending.map((c) => c.slipId).join(", ")} still pending after ${Math.floor(ageDays)} days — the sweep exists so this cannot happen`);
  }
});
