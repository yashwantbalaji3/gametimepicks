/**
 * /ufc MUST SAY WHEN IT KNEW WHAT IT KNOWS.
 *
 * Run: npx tsx --test src/lib/sports/ufc/publication-freshness.test.mjs
 *
 * The page carried no stamp of any kind. It rendered a card artifact and never told a reader when
 * that artifact was produced, so a two-day-old read and a two-minute-old one looked identical — and
 * on 2026-08-22 it was showing a card read on 2026-08-20 beside a ladder built four days before
 * that, with nothing on the page to distinguish them.
 *
 * The stamps are now per-artifact, which is the only honest form when a page reads several. One
 * number standing for all of them is a figure built for one scope reused for a broader claim, which
 * is the defect this codebase keeps finding under different names.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const read = (p) => { try { return JSON.parse(fs.readFileSync(path.join(APP, p), "utf8")); } catch { return null; } };
const PAGE = path.join(APP, "out/ufc/index.html");
const rendered = fs.existsSync(PAGE) ? fs.readFileSync(PAGE, "utf8").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ") : null;

test("the CARD's stamp is rendered byte-identically to the artifact's own field", () => {
  const card = read("public/data/ufc/card-latest.json");
  if (!rendered || !card?.generatedAt) return;
  // Byte-identical, not "approximately today". A reformatted stamp is a stamp someone computed, and
  // a computed stamp can be computed from the wrong thing — a build time being the classic.
  assert.ok(rendered.includes(card.generatedAt), `the page must carry ${card.generatedAt} exactly`);
});

test("the LADDER's stamp is its own, and differs from the card's", () => {
  const ladder = read("public/data/parlays/risk-ladder-ufc/latest.json");
  const card = read("public/data/ufc/card-latest.json");
  if (!rendered || !ladder?.generatedAt) return;
  if (!rendered.includes("Prices read")) return;   // no cards published for this card's date
  assert.ok(rendered.includes(ladder.generatedAt), "the cards must carry the ladder's own stamp");
  // The two artifacts are produced by different jobs at different times. If a page ever showed one
  // number for both, it would be asserting a freshness it had not established for one of them.
  if (card?.generatedAt) {
    assert.notEqual(ladder.generatedAt, card.generatedAt, "distinct artifacts must not share one stamp");
  }
});

test("NO BUILD TIME anywhere near a freshness claim", () => {
  const src = fs.readFileSync(path.join(APP, "src/app/ufc/page.tsx"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  // A statically exported page compiled at build time would render the compile clock as if it were
  // knowledge. The stamp must be read from an artifact and from nowhere else.
  assert.doesNotMatch(code, /new Date\(\)\.toISOString\(\)[^)]*generatedAt/, "a stamp must never be computed here");
  assert.match(code, /card\?\.generatedAt/, "the card's stamp comes from the card");
});

test("the ladder shown is for THIS card, and says which card that is", () => {
  const ladder = read("public/data/parlays/risk-ladder-ufc/latest.json");
  const card = read("public/data/ufc/card-latest.json");
  if (!ladder || !card?.event?.slateDate) return;
  // The reader-facing half of the three-dates defect: cards written 08-18, fighting 08-22, published
  // under 08-21. The page now states the card date beside the prices.
  assert.equal(ladder.date, card.event.slateDate, "the published ladder must belong to the card on the page");
  if (rendered?.includes("Prices read")) assert.ok(rendered.includes(`card date ${ladder.date}`));
});
