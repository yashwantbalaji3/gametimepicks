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
 * Measured by scripts/uiux/baseline.mjs. These are CEILINGS, not targets. They only move down.
 *
 * P185 SPLIT THE COUNT, because a single number could be lowered the wrong way. Migrating a
 * component nobody can reach, or converting a team's brand colour into a semantic token, both
 * lower a flat count while making the product worse. So each class is pinned separately and the
 * one that matters — drift on a live route — is pinned on its own:
 *
 *   themeDrift       literals that SHOULD be a semantic token          (migrate these)
 *   identityData     a team's/club's own brand colour                  (never migrate; relocate)
 *   maskStops        #000 as a mask alpha stop                         (not a colour at all)
 *
 * Because all three are pinned, reclassifying a literal cannot lower any ceiling: moving a literal
 * out of themeDrift raises identityData or maskStops, and those fail too.
 *
 * Measured 2026-08-19 on main @ eeff42d61 + this release.
 */
const CEILING = {
  rawColorLiterals: 1276,
  filesWithRawColors: 255,
  themeDrift: 1172,
  themeDriftReachable: 764,
  identityData: 89,
  maskStops: 8,
  illustrationArt: 7,
};

/** The same scan the baseline script performs, so the two cannot disagree about what counts. */
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

function walk(dir, exts, acc = []) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules") walk(p, exts, acc); }
    else if (exts.some((x) => e.name.endsWith(x))) acc.push(p);
  }
  return acc;
}

const COLOR = /#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d+\s*,/g;
const IDENTITY_LINE = /\b(primary|secondary|ink|bg|fg|border)\s*:\s*["'`]#/;
const MASK_LINE = /[Mm]ask[Ii]mage|mask-image/;
/* An SVG presentation attribute carrying a raw hex is a DRAWING INSTRUCTION, not a theme value.
   mr-dub-avatar.tsx is a first-party character mark: #f2d3a8 is a skin tone. Theming it recolours
   the mascot — the same category of wrong as theming the Yankees' navy. */
const ART_ATTR = /(?:fill|stroke|stopColor|stop-color|flood-color|lighting-color)=["'`]#/;

/** Files a route can actually pull in, by following imports from every route entrypoint. */
function reachableFiles() {
  const SRC = path.join(APP, "src");
  const all = walk(SRC, [".tsx", ".ts"]).filter((f) => !/\.test\./.test(f));
  const resolve = (from, spec) => {
    let base;
    if (spec.startsWith("@/")) base = path.join(SRC, spec.slice(2));
    else if (spec.startsWith(".")) base = path.join(path.dirname(from), spec);
    else return null;
    for (const c of [base + ".tsx", base + ".ts", path.join(base, "index.tsx"), path.join(base, "index.ts")]) {
      if (fs.existsSync(c)) return path.normalize(c);
    }
    return null;
  };
  const graph = new Map();
  for (const f of all) {
    const body = stripComments(fs.readFileSync(f, "utf8"));
    const out = new Set();
    for (const m of body.matchAll(/from\s+["']([^"']+)["']/g)) { const r = resolve(f, m[1]); if (r) out.add(r); }
    for (const m of body.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)) { const r = resolve(f, m[1]); if (r) out.add(r); }
    graph.set(path.normalize(f), out);
  }
  const roots = all.filter((f) => /[\\/]app[\\/].*(page|layout|template|not-found|error)\.tsx$/.test(f)).map((f) => path.normalize(f));
  const seen = new Set(); const stack = [...roots];
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    for (const n of graph.get(f) ?? []) if (!seen.has(n)) stack.push(n);
  }
  return seen;
}

function scan() {
  const reach = reachableFiles();
  let themeDrift = 0, identityData = 0, maskStops = 0, illustrationArt = 0, unreachable = 0;
  const files = [];
  for (const f of walk(path.join(APP, "src"), [".tsx"])) {
    const body = stripComments(fs.readFileSync(f, "utf8"));
    let d = 0, i = 0, m = 0, a = 0;
    for (const line of body.split("\n")) {
      const hits = (line.match(COLOR) ?? []).length;
      if (!hits) continue;
      if (IDENTITY_LINE.test(line)) i += hits;
      else if (MASK_LINE.test(line)) m += hits;
      else if (ART_ATTR.test(line)) a += hits;
      else d += hits;
    }
    if (!(d || i || m || a)) continue;
    themeDrift += d; identityData += i; maskStops += m; illustrationArt += a;
    if (!reach.has(path.normalize(f))) unreachable += d;
    files.push({ file: path.relative(APP, f), hits: d + i + m + a });
  }
  return { literals: themeDrift + identityData + maskStops + illustrationArt, themeDrift, identityData, maskStops, illustrationArt,
           themeDriftReachable: themeDrift - unreachable, files };
}

test("raw colour literals only ever decrease", () => {
  const s = scan();
  assert.ok(s.literals <= CEILING.rawColorLiterals,
    `raw colour literals rose to ${s.literals} from a ceiling of ${CEILING.rawColorLiterals}. ` +
    `A new component was written with hardcoded colour instead of a semantic token — fix the ` +
    `component, do not raise the ceiling.`);
  assert.ok(s.files.length <= CEILING.filesWithRawColors,
    `${s.files.length} files carry raw colours, up from ${CEILING.filesWithRawColors}.`);

  // Keep the ceiling honest: once real migration lands, a stale ceiling stops measuring anything.
  const slack = CEILING.rawColorLiterals - s.literals;
  assert.ok(slack < 150,
    `the ceiling is ${slack} above the real count (${s.literals}) — lower CEILING to ${s.literals} so it ` +
    `keeps ratcheting instead of drifting into decoration.`);
});

test("each class ratchets on its own, so a literal cannot be reclassified into a pass", () => {
  /*
   * The failure this prevents: relabel a hex as identity data (or move it onto a mask line) and a
   * single flat ceiling falls without a single component improving. Every class is pinned, so the
   * only way down is to actually remove a literal.
   */
  const s = scan();
  for (const k of ["themeDrift", "themeDriftReachable", "identityData", "maskStops", "illustrationArt"]) {
    assert.ok(s[k] <= CEILING[k],
      `${k} rose to ${s[k]} from ${CEILING[k]}. If a literal moved between classes, that is not a ` +
      `migration — the class it moved INTO is pinned too.`);
  }
});

test("the migration target is drift on a live route, and it is shrinking", () => {
  /*
   * Charter ranking: literal count x route reach x user visibility. dual-ladder-board.tsx carries
   * 44 literals and is unreachable — DualLadderBoard was removed from /bank-builder and a test
   * asserts it stays removed. Migrating it would lower a flat count and change nothing anyone can
   * see. So the number that has to move is drift a user can actually reach.
   */
  const s = scan();
  assert.ok(s.themeDriftReachable <= CEILING.themeDriftReachable,
    `live-route drift rose to ${s.themeDriftReachable} from ${CEILING.themeDriftReachable}`);
  assert.ok(s.themeDriftReachable < s.themeDrift,
    "reachable drift cannot exceed total drift — the reachability walk is broken");
});

test("a team's own brand colour is identity, not drift", () => {
  /*
   * team-badge.tsx ranked #1 in the P184 baseline with 72 literals. 68 of them are the Yankees'
   * navy and the Dodgers' blue. #003087 is a fact about the Yankees; a migration that replaces it
   * with a semantic token destroys team identity. The flat count invited exactly that, the same way
   * the first orphan list invited deleting live routes.
   */
  const badge = fs.readFileSync(path.join(APP, "src", "components", "team-badge.tsx"), "utf8");
  assert.match(badge, /NYY:\s*\{\s*primary:\s*"#003087"/,
    "the Yankees' navy must stay a literal — it is identity data, not a themeable value");
  assert.doesNotMatch(badge, /primary:\s*"var\(--/,
    "a team's primary colour was replaced with a semantic token; that is not a migration, it is " +
    "identity loss");
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
