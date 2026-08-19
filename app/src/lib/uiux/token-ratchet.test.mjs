/**
 * PROGRAM 184 · THE DESIGN-TOKEN RATCHET.
 *
 * The measured baseline is 1,616 raw colour literals across 266 files, against 143 semantic tokens
 * that already exist. That is the design-system drift the charter asks to be counted and then shrunk:
 * a component consuming `var(--vault-text)` can be re-themed in one place, and one carrying
 * `#1A0E06` cannot — which is why swapping the brand mark earlier today changed the logo and left
 * every hardcoded surface around it untouched.
 *
 * A ratchet rather than a ban. Banning raw colours outright would fail the build on day one and be
 * switched off within an hour; this fails only if the number goes UP. Migration happens where work
 * is already happening, and the number cannot quietly climb back while that proceeds.
 *
 * TO LOWER THE CEILING: run `node scripts/uiux/baseline.mjs`, take the new count, and edit CEILING
 * down in the same commit as the migration. Never edit it up — a rise means a component was written
 * with hardcoded colour, and the fix is the component, not this line.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();

/**
 * Measured 2026-08-19 by scripts/uiux/baseline.mjs on main @ 8cf568d96.
 * This is a CEILING, not a target. It only ever moves down.
 */
const CEILING = { rawColorLiterals: 1616, filesWithRawColors: 266 };

/** The same scan the baseline script performs, so the two cannot disagree about what counts. */
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

function walk(dir, acc = []) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules") walk(p, acc); }
    else if (e.name.endsWith(".tsx")) acc.push(p);
  }
  return acc;
}

function scan() {
  let literals = 0; const files = [];
  for (const f of walk(path.join(APP, "src"))) {
    const hits = [...stripComments(fs.readFileSync(f, "utf8")).matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d+\s*,/g)].length;
    if (hits) { literals += hits; files.push({ file: path.relative(APP, f), hits }); }
  }
  return { literals, files };
}

test("raw colour literals only ever decrease", () => {
  const { literals, files } = scan();
  assert.ok(literals <= CEILING.rawColorLiterals,
    `raw colour literals rose to ${literals} from a ceiling of ${CEILING.rawColorLiterals}. ` +
    `A new component was written with hardcoded colour instead of a semantic token — fix the ` +
    `component, do not raise the ceiling.`);
  assert.ok(files.length <= CEILING.filesWithRawColors,
    `${files.length} files carry raw colours, up from ${CEILING.filesWithRawColors}.`);

  // Keep the ceiling honest: once real migration lands, a stale ceiling stops measuring anything.
  const slack = CEILING.rawColorLiterals - literals;
  assert.ok(slack < 150,
    `the ceiling is ${slack} above the real count (${literals}) — lower CEILING to ${literals} so it ` +
    `keeps ratcheting instead of drifting into decoration.`);
});

test("the semantic token layer exists and is what components should consume", () => {
  const globals = fs.readFileSync(path.join(APP, "src", "app", "globals.css"), "utf8");
  const tokens = new Set([...globals.matchAll(/--([a-z0-9-]+)\s*:/gi)].map((m) => m[1]));
  assert.ok(tokens.size >= 100, `only ${tokens.size} semantic tokens declared — the layer to migrate ONTO must exist first`);
  // The migration target must cover the roles the charter names, or components have nowhere to go.
  for (const role of ["vault-text", "vault-rule", "vault-border"]) {
    assert.ok([...tokens].some((t) => t.includes(role.split("-")[1])), `no token covers the "${role}" role`);
  }
});

test("the baseline script the ceiling came from is committed and runnable", () => {
  /*
   * A ceiling whose provenance is a number someone typed is not evidence. The script that produced
   * it has to be in the tree so the count can be reproduced and lowered with a receipt.
   */
  const script = path.join(APP, "scripts", "uiux", "baseline.mjs");
  assert.ok(fs.existsSync(script), "the baseline script must be committed alongside the ceiling it set");
  const src = fs.readFileSync(script, "utf8");
  assert.match(src, /rawColorLiterals/, "the baseline must emit the figure this ratchet pins");
  assert.match(src, /PRIVATE_INTERNAL/, "the baseline inventories internal routes and must stay private");
});
