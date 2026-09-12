import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildShapeRecord, shapeFor, cardsOf, sampleClass } from "./card-shape.mjs";

const leg = (o = {}) => ({ sport: "mlb", result: "win", oddsForSide: -110, ...o });
const card = (id, status, legs) => ({ slipId: id, status, legs });

test("a scratched leg leaves the card — it changes the size AND the price", () => {
  /* A parlay drops a voided leg and pays on what is left. Counting it in the size files the card
     under a shape it never had; pricing with it inflates the winner's payout, which a first pass
     here did — two-leg cards reported −1.5% when they were −10.8%. */
  const r = buildShapeRecord([{ date: "d", slips: [card("a", "win", [leg(), leg(), leg({ result: "void" })])] }], { minCards: 1 });
  assert.equal(r.sizes.length, 1);
  assert.equal(r.sizes[0].legs, 2, "the voided leg is not part of the shape");
  // Two legs at −110 pay 1.909^2 − 1 = 2.6446 units on a win.
  assert.ok(Math.abs(r.sizes[0].flatReturn - (Math.pow(1 + 100 / 110, 2) - 1)) < 1e-6, `flat: ${r.sizes[0].flatReturn}`);
});

test("a loss costs exactly one unit, whatever the price was", () => {
  const r = buildShapeRecord([{ slips: [card("a", "loss", [leg({ oddsForSide: 900 }), leg({ oddsForSide: 900 })]) ] }], { minCards: 1 });
  assert.equal(r.sizes[0].flatReturn, -1);
  assert.equal(r.sizes[0].hitRate, 0);
});

test("both published shapes are read, and one card is counted once", () => {
  const docs = [
    { slips: [card("slip_1", "win", [leg(), leg()])], publicRiskSections: { low: { all: [card("opt_1", "loss", [leg(), leg({ result: "loss" })])] } } },
    // the same file read twice must not double anything
    { slips: [card("slip_1", "win", [leg(), leg()])] },
  ];
  const r = buildShapeRecord(docs, { minCards: 1 });
  assert.equal(r.cards, 2, "two distinct cards");
  assert.equal(r.sizes[0].wins, 1);
  assert.equal(r.sizes[0].losses, 1);
  assert.equal(cardsOf(docs[0]).length, 2);
});

test("an undecided card is not a loss, and an unpriced one is not silently a win", () => {
  const r = buildShapeRecord([{
    slips: [
      card("a", "pending", [leg()]),
      card("b", "win", [leg({ oddsForSide: null })]),
      card("c", "win", [leg()]),
    ],
  }], { minCards: 1 });
  assert.equal(r.cards, 1, "only the decided, priced card counts");
  assert.equal(r.unpriced, 1);
});

test("a size with too little history is left out rather than shown as a rate", () => {
  const docs = [{ slips: [card("a", "win", [leg(), leg()]), card("b", "loss", [leg(), leg(), leg()])] }];
  assert.deepEqual(buildShapeRecord(docs, { minCards: 2 }).sizes, []);
  assert.equal(sampleClass(99).id, "thin");
  assert.equal(sampleClass(250).id, "substantial");
  assert.equal(shapeFor(null, 3), null);
});

test("the published corpus agrees, card by card, that a card wins when every surviving leg wins", () => {
  /* The whole derivation rests on this rule. If a single card disagreed, the price and the size
     here would be describing something other than what settled — so it is re-checked against the
     receipts on every run rather than asserted in a comment. */
  const root = path.join(process.cwd(), "public", "data", "parlays");
  const docs = [];
  for (const stream of ["graded", "optimizer-graded"]) {
    const dir = path.join(root, stream);
    let files = [];
    try { files = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)); } catch { continue; }
    for (const f of files) docs.push(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
  }
  if (!docs.length) return;
  let checked = 0;
  for (const doc of docs) {
    for (const slip of cardsOf(doc)) {
      if (slip.status !== "win" && slip.status !== "loss") continue;
      const legs = (slip.legs ?? []).filter((l) => l.result === "win" || l.result === "loss");
      if (!legs.length) continue;
      checked += 1;
      const allWon = legs.every((l) => l.result === "win");
      assert.equal(allWon, slip.status === "win", `${slip.slipId}: status and surviving legs disagree`);
    }
  }
  assert.ok(checked > 500, `the check must see the corpus; saw ${checked} cards`);

  const r = buildShapeRecord(docs, { sport: "mlb", minCards: 30 });
  assert.ok(r.sizes.length >= 4, "several card sizes have a real sample");
  for (const row of r.sizes) {
    assert.equal(row.wins + row.losses, row.cards);
    assert.ok(row.flatReturn >= -1, "a flat stake cannot lose more than the stake");
  }
});

test("no surface states a card-size rate without its caption, and every renderer is listed", () => {
  const root = path.join(process.cwd(), "src");
  const list = fs.readFileSync(path.join(root, "components/parlays/lab/card-shape-list.tsx"), "utf8");
  assert.match(list, /Our own published cards/, "the copy names whose cards these were");
  assert.match(list, /not a forecast/i);
  assert.match(list, /r\.sample\.text/, "and every row prints its sample caption");

  const consumers = ["components/parlays/lab/slip-gauges.tsx", "app/results/parlay-lab/page.tsx"];
  const renderers = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx$/.test(e.name) && fs.readFileSync(p, "utf8").includes("<CardShapeList")) renderers.push(path.relative(root, p));
    }
  };
  walk(root);
  for (const rel of renderers) {
    if (rel.endsWith("card-shape-list.tsx")) continue;
    assert.ok(consumers.includes(rel), `${rel} renders the card-size record but is not in this guard's list`);
    const src = fs.readFileSync(path.join(root, rel), "utf8");
    assert.ok(!/\.hitRate/.test(src), `${rel} must not format a rate itself`);
  }
  assert.equal(renderers.length, consumers.length, `the walk must find exactly the listed surfaces; found ${renderers.join(", ")}`);
});
