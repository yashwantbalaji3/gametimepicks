/**
 * v1.7 Phase G — the Play surfaces (Bank Builder, Moonshot, Mr. Dub) and their components make no
 * performance claim the owners do not support, and render today's eligible universe from the one
 * availability owner. Source-level pins; the built-output scanners cover the rendered HTML.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = path.resolve(new URL(".", import.meta.url).pathname, "..", "..", "..");
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const walk = (dir) => { const out = []; for (const e of fs.readdirSync(path.join(APP, dir), { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) out.push(...walk(p)); else if (/\.(tsx?|mjs)$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p); } return out; };

const SURFACES = ["src/app/bank-builder/page.tsx", "src/app/moonshot/page.tsx", "src/app/mr-dub/page.tsx", ...walk("src/components/bank-builder"), ...walk("src/components/moonshot"), ...walk("src/components/mr-dub"), "src/components/achievement-banner.tsx", "src/components/ladders/product-lanes-ladder.tsx", "src/components/products/eligible-universe.tsx"];

/** Claims no owner supports (audit A6). Word-bounded so "improve" / "unproven" stay legal. */
const BANNED = [/\bproven\b/i, /lock(s|ed|ing)? (in )?profit/i, /\$19\.5K/, /the model holds/i, /\bguaranteed\b/i, /\bsure thing\b/i, /\bbanker\b/i, /\bcan'?t lose\b/i,
  /* F1 Option A (founder decision 2026-09-22): the products build from market prices, so no Play surface may
     attribute a leg, a card or a no-play to "the model". The full labelling contract is pinned in
     v17-market-construction-labels.test.mjs. */
  /model confidence/i, /model-qualified legs/i, /model bar\b/i, /model discipline/i, /the model skips/i, /model skipped/i, /the model's ladder/i];

test("no unsupported performance claim in the Play surfaces' rendered strings", () => {
  for (const rel of SURFACES) {
    const src = stripComments(read(rel));
    for (const re of BANNED) assert.ok(!re.test(src), `${rel} contains ${re}`);
  }
});

test("/bank-builder's record label is the official protected record, not the June-frozen public summary", () => {
  const src = stripComments(read("src/app/bank-builder/page.tsx"));
  /* C2: the owner path was a proxy for "the OFFICIAL record". The official record is now the canonical
     projection's designated headline cell for bank-builder, reached through `currentProductRecord`, which
     passes no presentation context and therefore cannot return a legacy era (projection-core
     `cellPresentation`). Pin that, and pin that the page no longer opens the owner or formats the figure
     itself — a page that formats its own record is a page that can spell it differently from / and /today. */
  assert.ok(/currentProductRecord\("bank-builder"\)/.test(src), "the record comes through the one canonical Results reader");
  assert.ok(/const recordLabel = officialRecordLabel \?\? "—"/.test(src), "…and its absence renders as no figure");
  assert.ok(!/mr-dub", "portfolio\.json"/.test(src), "the page must not open the record owner itself");
  assert.ok(!/const recordLabel = `\$\{rec\.wins\}/.test(src), "the stale 5–0 derivation must not return");
  assert.ok(!/\$\{officialRecord\.wins\}/.test(src), "nor a hand-rolled record format beside the canonical one");
});

test("both Play pages mount today's eligible universe from the one availability owner, after the header and before the card", () => {
  for (const rel of ["src/app/bank-builder/page.tsx", "src/app/moonshot/page.tsx"]) {
    const src = read(rel);
    assert.ok(/import EligibleUniverse from "@\/components\/products\/eligible-universe"/.test(src), rel);
    assert.ok(/<EligibleUniverse availability=\{loadProductAvailability\(\)\}/.test(src), rel);
  }
  const bb = read("src/app/bank-builder/page.tsx");
  assert.ok(bb.indexOf("<EligibleUniverse") < bb.indexOf("<ClimbHero"), "universe sits above the hero on /bank-builder");
  const ms = read("src/app/moonshot/page.tsx");
  assert.ok(ms.indexOf("<EligibleUniverse") < ms.indexOf("<ProductLanesLadder"), "universe sits above today's card on /moonshot");
});

test("the availability loader reads only the public artifact and the component never prints an internal reason code", () => {
  const loader = read("src/lib/products/availability.ts");
  assert.ok(/"products", "availability", "latest\.json"/.test(loader));
  assert.ok(!/data[\\/]internal/.test(loader), "public route must not read internal data");
  const comp = read("src/components/products/eligible-universe.tsx");
  for (const code of ["SPORT_NOT_ELIGIBLE", "PRICE_UNAVAILABLE", "MODEL_STATUS_BLOCKED", "STALE", "MISSING_IDENTITY"]) assert.ok(!comp.includes(code), code);
  assert.ok(/priced by the sportsbook market with no forecast behind it/.test(comp), "names the market-priced caveat");
});

test("Mr. Dub's headline names the ladders, not a dollar figure no artifact carries", () => {
  const src = read("src/app/mr-dub/page.tsx");
  assert.ok(src.includes('title="The $100 → $10K ladders"'));
  /* C2 restated the eyebrow clause. The invariant this test names is the LAST assertion — the headline
     must not carry a dollar figure no artifact backs. The eyebrow was incidental, and "The record, as
     settled" was itself the defect: a CURRENT frame over two June ladders, which C3 forbids. Pinned as
     the corrected frame, plus the fabricated-figure rule that was always the point. */
  assert.ok(src.includes('eyebrow="Completed ladders · legacy history"'), "the June ladders are framed as legacy history, not as the settled record");
  assert.ok(!/19\.5K/.test(src));
});
