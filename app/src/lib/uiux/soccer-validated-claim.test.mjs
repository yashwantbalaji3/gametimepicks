/**
 * SOCCER "VALIDATED" CLAIM guard (Stage 2A · public truth-copy batch, PR 1).
 *
 * Founder decision 2026-10-06 (#997): the EPL player model is labelled "not validated"; the team
 * match model may say "tested blind on past seasons". So no rendered soccer / Premier League string
 * may call a model "validated" unless it is negated ("not validated"). The raw validation enum
 * (VALIDATED_OUT_OF_SAMPLE_HISTORY / NOT_VALIDATED_OUT_OF_SAMPLE) never matches /\bvalidated\b/,
 * because "_" is a word character — enums are wiring, the guard is about words.
 *
 * Comments are stripped FIRST, the same way the D6 ratchet in claims-contract.test.mjs does it:
 * a comment explaining removed wording is not the wording.
 *
 * Scope: every soccer-only source (EPL hub + match reports, /soccer/[league], /goal-rush, the soccer
 * components and the EPL lib), plus the soccer slices of shared sources: the Premier League entry on
 * /learn, the Goal Rush signature product, and the soccer chunks of the Ask help corpus (source and
 * committed projection).
 *
 * Run: npx tsx --test src/lib/uiux/soccer-validated-claim.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { HELP_CHUNKS } from "../ask/help-source.mjs";

const app = process.cwd();
const read = (rel) => fs.readFileSync(path.join(app, rel), "utf8");
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** Every "validated" not immediately preceded by "not " — each returned as a short excerpt. */
function unnegatedValidated(text) {
  const hits = [];
  for (const m of text.matchAll(/\bvalidated\b/gi)) {
    const before = text.slice(Math.max(0, m.index - 20), m.index);
    if (/\bnot\s+$/i.test(before)) continue;
    hits.push(text.slice(Math.max(0, m.index - 50), m.index + 30).replace(/\s+/g, " "));
  }
  return hits;
}

const SOCCER_ONLY_ROOTS = [
  "src/app/epl",
  "src/app/soccer",
  "src/app/goal-rush",
  "src/components/soccer",
  "src/lib/sports/epl",
];
const SOCCER_WORDS = /premier league|\bepl\b|soccer|goal rush|goalscorer|ligue/i;

test("soccer-only sources: no un-negated \"validated\" in rendered strings", () => {
  const offenders = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!/\.(tsx?|mjs)$/.test(p) || /\.test\.mjs$/.test(p)) continue;
      for (const hit of unnegatedValidated(stripComments(fs.readFileSync(p, "utf8")))) {
        offenders.push(`${path.relative(app, p)}: …${hit}…`);
      }
    }
  };
  for (const root of SOCCER_ONLY_ROOTS) {
    const abs = path.join(app, root);
    assert.ok(fs.existsSync(abs), `${root} exists (the guard must not pass vacuously)`);
    walk(abs);
  }
  assert.deepEqual(offenders, [], `soccer copy claims "validated":\n  ${offenders.join("\n  ")}`);
});

test("/learn: the Premier League entry never claims a validated model", () => {
  const src = stripComments(read("src/app/learn/page.tsx"));
  const lines = src.split("\n").filter((l) => SOCCER_WORDS.test(l));
  assert.ok(lines.some((l) => /name: "Premier League"/.test(l)), "the Premier League entry is still found");
  const offenders = lines.flatMap(unnegatedValidated);
  assert.deepEqual(offenders, [], `/learn soccer copy claims "validated":\n  ${offenders.join("\n  ")}`);
});

test("Goal Rush signature product: no un-negated \"validated\" in any rendered field", async () => {
  const { signatureFor } = await import("../products/signature-products.ts");
  const soccer = signatureFor("soccer");
  assert.ok(soccer, "the soccer signature product exists");
  const text = Object.values(soccer).filter((v) => typeof v === "string").join(" \n ");
  assert.deepEqual(unnegatedValidated(text), [], "Goal Rush copy claims \"validated\"");
});

test("Ask help corpus: soccer chunks never claim a validated model (source and committed projection)", () => {
  const isSoccer = (c) => SOCCER_WORDS.test(`${c.id} ${c.title} ${c.text} ${(c.keywords ?? []).join(" ")}`);
  const source = HELP_CHUNKS.filter(isSoccer);
  assert.ok(source.some((c) => c.id === "goal-rush"), "the Goal Rush chunk is in scope");
  const offenders = source.flatMap((c) => unnegatedValidated(`${c.title} ${c.text}`).map((h) => `${c.id}: …${h}…`));

  const projection = JSON.parse(fs.readFileSync(path.join(app, "..", "data", "ask-projection", "v1", "help.json"), "utf8"));
  const chunks = projection.chunks ?? [];
  assert.ok(chunks.some((c) => c.id === "goal-rush"), "the committed projection carries the Goal Rush chunk");
  for (const c of chunks.filter(isSoccer)) {
    for (const h of unnegatedValidated(`${c.title} ${c.text}`)) offenders.push(`projection ${c.id}: …${h}…`);
  }
  assert.deepEqual(offenders, [], `Ask soccer copy claims "validated":\n  ${offenders.join("\n  ")}`);
});

test("EPL match report: the raw validation enum is mapped to words, never rendered as-is", () => {
  const src = stripComments(read("src/app/epl/match/[slug]/page.tsx"));
  assert.ok(!/\?\?\s*"NOT_VALIDATED_OUT_OF_SAMPLE"/.test(src), "the enum is not a rendered fallback");
  assert.match(src, /<Meta k="Validation" v=\{validationLine\} \/>/, "the Validation row still renders validationLine");
  assert.match(src, /"Team match model tested blind on past seasons · not shown to outperform market prices"/);
  assert.match(src, /"Team match model not tested out of sample"/);
});
