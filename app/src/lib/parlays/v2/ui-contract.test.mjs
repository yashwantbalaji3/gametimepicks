/**
 * Parlay Lab V2 · source contracts for the flag and the components. Run: npx tsx --test src/lib/parlays/v2/ui-contract.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const app = process.cwd();
const read = (rel) => fs.readFileSync(path.join(app, rel), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const COMPONENTS = ["TierBoard.tsx", "ParlayCard.tsx", "SmartBetslip.tsx"].map((f) => `src/components/parlays/v2/${f}`);

test("/build renders the V2 board only when NEXT_PUBLIC_PARLAY_LAB_V2 is exactly '1' (default off)", () => {
  const page = strip(read("src/app/build/page.tsx"));
  assert.match(page, /const PARLAY_LAB_V2 = process\.env\.NEXT_PUBLIC_PARLAY_LAB_V2 === "1";/);
  assert.match(page, /const v2Model = PARLAY_LAB_V2\s*\?/);
  assert.match(page, /\{v2Model \? <TierBoard model=\{v2Model\} \/> : null\}/);
  assert.equal((page.match(/<TierBoard\b/g) ?? []).length, 1);
});

test("V2 components carry no outbound link, no sportsbook URL, and no retired product name", () => {
  for (const rel of COMPONENTS) {
    const src = strip(read(rel));
    assert.doesNotMatch(src, /https?:\/\//, `${rel}: no absolute URL`);
    assert.doesNotMatch(src, /target="_blank"|window\.open|location\.href/, `${rel}: no navigation away`);
    for (const href of src.matchAll(/href=\{?"([^"]+)"/g)) assert.ok(href[1].startsWith("/"), `${rel}: only site-internal links (${href[1]})`);
    assert.doesNotMatch(src, />[^<{]*Parlay Lab[^<{]*</, `${rel}: "Parlay Lab" is retired public vocabulary`);
  }
});

test("V2 components use design tokens only — no raw colour literal", () => {
  for (const rel of COMPONENTS) assert.doesNotMatch(strip(read(rel)), /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/, rel);
});

test("the slip is keyboard- and screen-reader-operable: labelled controls, a live status, a disabled handoff that explains itself", () => {
  const s = read("src/components/parlays/v2/SmartBetslip.tsx");
  assert.match(s, /aria-label=\{`Move \$\{name\} up`\}/);
  assert.match(s, /aria-label=\{`Move \$\{name\} down`\}/);
  assert.match(s, /aria-label=\{`Remove \$\{name\} from the slip`\}/);
  assert.match(s, /role="status" aria-live="polite"/);
  assert.match(s, /disabled aria-disabled="true" aria-describedby="smart-betslip-handoff-note"/);
  const b = read("src/components/parlays/v2/TierBoard.tsx");
  assert.match(b, /No qualifying parlay today/);
  assert.match(b, /slipHeading\.current\?\.focus\(\)/, "opening a card moves focus to the slip");
});
