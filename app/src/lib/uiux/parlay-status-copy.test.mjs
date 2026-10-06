/**
 * PARLAY STATUS COPY (Stage 2B truth-copy batch, prep rows #14-#27).
 *
 * The Parlay Center, the Today tile, the game-page card section, the shared card chip and the Results
 * trust table used to call suggested cards "model-built", their legs "model-qualified" and the count
 * "N model cards". Since #998 the leg pool is a card-rules screen (odds-backed, pre-event, role-quality,
 * card-leg eligibility), not a model qualification, so the public words are now "suggested" / "passed
 * the card rules" / "eligible". This guard keeps the old words out of the rendered source of those
 * surfaces. Comments are stripped first, exactly as the D6 ratchet in claims-contract.test.mjs does
 * (a comment explaining removed wording is not the wording).
 *
 * KNOWN_RESIDUE lists rendered hits that predate this batch and sit outside its rows. It is a ratchet:
 * each count must match exactly, so fixing one forces the number down and it can never grow.
 *
 * Run: npx tsx --test src/lib/uiux/parlay-status-copy.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const app = process.cwd();
const BANNED = /model-qualified|model-built|model card/gi;

const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const SCANNED_DIRS = ["src/app/build", "src/app/today", "src/components/parlays"];
const SCANNED_FILES = [
  "src/components/game/game-detail-page.tsx",
  "src/components/ui/suggested-card.tsx",
  "src/components/results/trust-center.tsx",
  "src/lib/products/product-state.mjs",
];

/** rel path -> exact number of banned hits allowed to remain (outside rows #14-#27; open items). */
const KNOWN_RESIDUE = {
  // "{n} model-built cards today, by scope × risk" (Suggested parlay coverage accordion on /build/custom).
  "src/components/parlays/parlays-explorer.tsx": 1,
  // "No model-qualified pick" empty states and the "Up to 3 model-qualified picks per market" sub/hint
  // in the game page's player-prop sections (not the card section this batch changed).
  "src/components/game/game-detail-page.tsx": 4,
};

function sourceFiles() {
  const files = [...SCANNED_FILES];
  const walk = (d) => {
    for (const e of fs.readdirSync(path.join(app, d), { withFileTypes: true })) {
      const rel = path.join(d, e.name);
      if (e.isDirectory()) { walk(rel); continue; }
      if (!/\.(tsx|ts|mjs)$/.test(e.name) || /\.test\.|\.spec\./.test(e.name)) continue;
      files.push(rel);
    }
  };
  for (const d of SCANNED_DIRS) walk(d);
  return [...new Set(files)];
}

test("no 'model-qualified | model-built | model card' in the rendered source of the parlay status surfaces", () => {
  const files = sourceFiles();
  assert.ok(files.length >= SCANNED_FILES.length + 3, "the scan found the Parlay Center / Today sources");
  const offenders = [];
  const residue = {};
  for (const rel of files) {
    const hits = [...stripComments(fs.readFileSync(path.join(app, rel), "utf8")).matchAll(BANNED)];
    if (hits.length === 0) continue;
    if (rel in KNOWN_RESIDUE) { residue[rel] = hits.length; continue; }
    offenders.push(`${rel}: ${hits.map((m) => m[0]).join(", ")}`);
  }
  assert.deepEqual(offenders, [], `model-attribution words back on a parlay status surface:\n  ${offenders.join("\n  ")}`);
  for (const [rel, n] of Object.entries(KNOWN_RESIDUE)) {
    assert.equal(residue[rel] ?? 0, n,
      `${rel}: KNOWN_RESIDUE says ${n} pre-existing hit(s), found ${residue[rel] ?? 0}. If you removed one, lower the count; it may never grow.`);
  }
});

test("the batch's replacement words are what renders (rows #14-#26)", () => {
  const src = (rel) => stripComments(fs.readFileSync(path.join(app, rel), "utf8"));
  assert.match(src("src/app/build/custom/page.tsx"), /Every leg here passed the card rules — odds-backed, pre-event, role-quality screened\./);
  const today = src("src/app/today/page.tsx");
  assert.match(today, /suggested card\$\{engineSuggested === 1 \? "" : "s"\}/);
  assert.match(today, /Suggested from today's eligible legs/);
  assert.match(today, /No eligible legs today — the builder returns with the next slate\./);
  assert.doesNotMatch(today, /leakage-validated/i, "Today never claims its legs are 'leakage-validated'");
  const build = src("src/app/build/page.tsx");
  assert.match(build, /Suggested cards at every risk level/);
  assert.match(build, /Every suggested card\n/);
  assert.match(build, /See all \{suggestedCards\.length\} suggested cards today/);
  assert.match(build, /candidate cards were withheld: every one uses a market-context family/);
  assert.doesNotMatch(build, /the model built/i);
  assert.match(src("src/components/parlays/parlay-center-tabs.tsx"), /Start from a suggested card/);
  const game = src("src/components/game/game-detail-page.tsx");
  assert.match(game, /Suggested cards · \$\{engineTotal\}/);
  assert.match(game, /Generated from current odds and card rules, by risk\./);
  assert.doesNotMatch(game, /Generated from current odds and model gates/i);
  assert.match(src("src/components/ui/suggested-card.tsx"), /Card · no market odds \(no paper payout\)/);
  assert.match(src("src/components/results/trust-center.tsx"), /"Suggested cards — educational"/);
});

test("Bank Builder's published-card sentence stays true after first pitch (row #27)", () => {
  const state = stripComments(fs.readFileSync(path.join(app, "src/lib/products/product-state.mjs"), "utf8"));
  assert.doesNotMatch(state, /events have not started/i,
    "CARD_PUBLISHED is also shown after first pitch (eventsStarted is not wired), so it must not claim the events have not started");
  assert.match(state, /Today's card is published\. It is graded from official results after its games finish\./);
});
