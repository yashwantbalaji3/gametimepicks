/**
 * UFC CLAIMS COPY guard (UFC-001 · U3).
 *
 * Founder decision D2 HONEST (2026-10-07): the UFC model is "experimental; tested on past fights; winner forecasts
 * graded every card"; "do not imply proven edge". No rendered UFC string may say the model beat its baseline, cleared
 * its bar, or is the only / one model on the site to have done so. The held-out test is a test on history: the live
 * graded winner record (model-health `ufc_winner`) is still BELOW_BAR, and the market leads it.
 *
 * Comments are stripped FIRST, as in claims-contract.test.mjs and soccer-validated-claim.test.mjs: a comment
 * explaining removed wording is not the wording.
 *
 * Scope: every UFC-only source (the UFC hub and bout reports, /cage-chaos, the UFC card component, the UFC lib and the
 * UFC simulate presentation), plus the UFC slices of shared sources: the Cage Chaos signature product (rendered on
 * /mr-dub, /goal-rush and /bucket-blitz) and the UFC chunks of the Ask help corpus (source and committed projection).
 *
 * Run: npx tsx --test src/lib/uiux/ufc-claims-copy.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { HELP_CHUNKS } from "../ask/help-source.mjs";

const app = process.cwd();
const read = (rel) => fs.readFileSync(path.join(app, rel), "utf8");
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\s*\}/g, "");

/** Superiority claims D2 removed. Whitespace-tolerant, because JSX copy wraps across lines. */
const CLAIMS = [
  /\bbeat\s+(?:its|their|the)\s+baseline/i,
  /\bbeats?\s+(?:its|their|the)\s+baselines?\b/i,
  /\bcleared\s+(?:its|their|the)\s+bars?\b/i,
  /\bcleared\s+theirs\b/i,
  /\b(?:the\s+)?only\s+model\s+(?:here|on\s+(?:this|the)\s+site)\b/i,
  /\bone\s+model\s+on\s+the\s+site\b/i,
  /\bno\s+other\s+model\b/i,
  /\bproven\s+edge\b/i,
];

function claimHits(text) {
  const flat = text.replace(/\s+/g, " ");
  return CLAIMS.flatMap((re) => {
    const m = flat.match(re);
    return m ? [flat.slice(Math.max(0, m.index - 40), m.index + m[0].length + 30)] : [];
  });
}

const UFC_ONLY = [
  "src/app/ufc",
  "src/app/cage-chaos",
  "src/components/sports/ufc-card.tsx",
  "src/lib/sports/ufc",
  "src/lib/simulate/presentation/ufc.ts",
];
const UFC_WORDS = /\bufc\b|cage chaos|\bfight(er)?s?\b|\bbout\b/i;

test("UFC-only sources: no superiority claim in any rendered string", () => {
  const offenders = [];
  let files = 0;
  const scan = (p) => {
    if (!/\.(tsx?|mjs)$/.test(p) || /\.test\.mjs$/.test(p)) return;
    files += 1;
    for (const hit of claimHits(stripComments(fs.readFileSync(p, "utf8")))) offenders.push(`${path.relative(app, p)}: …${hit}…`);
  };
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else scan(p);
    }
  };
  for (const root of UFC_ONLY) {
    const abs = path.join(app, root);
    assert.ok(fs.existsSync(abs), `${root} exists (the guard must not pass vacuously)`);
    if (fs.statSync(abs).isDirectory()) walk(abs);
    else scan(abs);
  }
  assert.ok(files >= 10, `scanned ${files} UFC files — too few to mean anything`);
  assert.deepEqual(offenders, [], `UFC copy makes a claim D2 removed:\n  ${offenders.join("\n  ")}`);
});

test("Cage Chaos signature product: honest basis, no superiority claim in any rendered field", async () => {
  const { signatureFor } = await import("../products/signature-products.ts");
  const ufc = signatureFor("ufc");
  assert.ok(ufc, "the UFC signature product exists");
  const text = Object.values(ufc).filter((v) => typeof v === "string").join(" \n ");
  assert.deepEqual(claimHits(text), [], "Cage Chaos copy makes a claim D2 removed");
  assert.match(ufc.basis, /\bexperimental\b/i, "the basis says the model is experimental");
  assert.match(ufc.basis, /not yet graded/i, "the basis says what is not graded yet");
});

test("the D2 wording is what renders on /cage-chaos and the bout report", () => {
  for (const rel of ["src/app/cage-chaos/page.tsx", "src/app/ufc/bout/[boutId]/page.tsx"]) {
    const flat = stripComments(read(rel)).replace(/\s+/g, " ");
    assert.match(flat, /This is an experimental model: winner forecasts are graded on every new card, method and round are not yet graded, and it has not been shown to have an edge over the market\./, `${rel} carries the D2 wording`);
  }
});

test("Ask help corpus: UFC chunks make no superiority claim (source and committed projection)", () => {
  const isUfc = (c) => UFC_WORDS.test(`${c.id} ${c.title} ${c.text} ${(c.keywords ?? []).join(" ")}`);
  const source = HELP_CHUNKS.filter(isUfc);
  assert.ok(source.some((c) => c.id === "cage-chaos"), "the Cage Chaos chunk is in scope");
  const offenders = source.flatMap((c) => claimHits(`${c.title} ${c.text}`).map((h) => `${c.id}: …${h}…`));

  const projection = JSON.parse(fs.readFileSync(path.join(app, "..", "data", "ask-projection", "v1", "help.json"), "utf8"));
  const chunks = projection.chunks ?? [];
  assert.ok(chunks.some((c) => c.id === "cage-chaos"), "the committed projection carries the Cage Chaos chunk");
  for (const c of chunks.filter(isUfc)) for (const h of claimHits(`${c.title} ${c.text}`)) offenders.push(`projection ${c.id}: …${h}…`);
  assert.deepEqual(offenders, [], `Ask UFC copy makes a claim D2 removed:\n  ${offenders.join("\n  ")}`);
});
