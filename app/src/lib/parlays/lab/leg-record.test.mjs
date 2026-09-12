import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildLegRecord, recordForLeg, sampleClass, familyKey } from "./leg-record.mjs";

const leg = (o = {}) => ({
  sport: "mlb", playerId: 1, market: "batter_hits", marketLabel: "Hits", side: "Over", line: 0.5,
  oddsForSide: -110, result: "win", ...o,
});
const doc = (date, slips) => ({ date, slips: slips.map((legs) => ({ legs })) });

test("one leg is one observation, however many cards used it", () => {
  /* THE DEFECT THIS EXISTS TO PREVENT: 18 cards a day share legs. Counting card slots weights each
     leg by the optimizer's repetition, and on the real corpus that moved a family's rate by three
     points. The sample is distinct legs; the slots are reported separately as the fact they are. */
  const r = buildLegRecord([doc("2026-09-01", [[leg()], [leg()], [leg({ result: "loss" })]])], { minDecided: 1 });
  const f = r.families[0];
  assert.equal(f.decided, 1, "the same leg on the same day is one observation");
  assert.equal(f.wins, 1);
  assert.equal(f.cardUses, 3, "and the three card uses are still reported");
  assert.equal(r.distinct, 1);
  assert.equal(r.slots, 3);
});

test("the same leg on another day is another observation", () => {
  const r = buildLegRecord([doc("2026-09-01", [[leg()]]), doc("2026-09-02", [[leg({ result: "loss" })]])], { minDecided: 1 });
  assert.equal(r.families[0].decided, 2);
  assert.equal(r.days, 2);
  assert.equal(r.since, "2026-09-01");
  assert.equal(r.until, "2026-09-02");
});

test("a scratch is neither a win nor a loss, and never a zero", () => {
  const r = buildLegRecord([doc("2026-09-01", [[leg({ result: "void", playerId: 7 }), leg({ result: "unresolved", playerId: 8 }), leg()]])], { minDecided: 1 });
  assert.equal(r.families[0].decided, 1);
  assert.equal(r.voided, 1);
  assert.equal(r.unresolved, 1);
  assert.equal(r.slots, 1, "an undecided leg is not a slot either");
});

test("the line is part of the family — Over 0.5 and Over 1.5 are different bets", () => {
  const r = buildLegRecord([doc("2026-09-01", [[leg({ playerId: 1, line: 0.5 }), leg({ playerId: 2, line: 1.5, result: "loss" })]])], { minDecided: 1 });
  assert.equal(r.families.length, 2);
  assert.notEqual(familyKey({ market: "batter_hits", side: "Over", line: 0.5 }), familyKey({ market: "batter_hits", side: "Over", line: 1.5 }));
});

test("flat return is arithmetic on the prices, and a losing family says so", () => {
  // Two legs at −110: one win (+0.909), one loss (−1). Mean = −0.0455 per unit staked.
  const r = buildLegRecord([doc("2026-09-01", [[leg({ playerId: 1 }), leg({ playerId: 2, result: "loss" })]])], { minDecided: 1 });
  const f = r.families[0];
  assert.ok(Math.abs(f.flatReturn - (0.9090909 - 1) / 2) < 1e-6, `flat return: ${f.flatReturn}`);
  assert.ok(Math.abs(f.hitRate - 0.5) < 1e-9);
  assert.ok(Math.abs(f.impliedMean - 0.5238) < 0.001, "the implied mean includes the sportsbook's margin");
});

test("a rate never travels without its sample caption", () => {
  assert.equal(sampleClass(30).id, "thin");
  assert.equal(sampleClass(99).id, "thin");
  assert.equal(sampleClass(100).id, "accumulating");
  assert.equal(sampleClass(249).id, "accumulating");
  assert.equal(sampleClass(250).id, "substantial");
  const r = buildLegRecord([doc("2026-09-01", [[leg()]])], { minDecided: 1 });
  const row = r.families[0];
  assert.ok(row.sample.text, "every row carries its caption");
  assert.equal(row.sample.id, "thin", "one leg is thin, and says so");
  assert.equal(row.standardError, 0, "a single win has no spread to report — and 0 is not a claim of precision");
});

test("a different sport is not folded in", () => {
  const r = buildLegRecord([doc("2026-09-01", [[leg(), leg({ sport: "nba", playerId: 99, market: "PTS" })]])], { sport: "mlb", minDecided: 1 });
  assert.equal(r.families.length, 1);
  assert.equal(r.families[0].market, "batter_hits");
});

test("a leg in the builder finds its own family, not a near neighbour", () => {
  const r = buildLegRecord([
    doc("2026-09-01", [[leg({ playerId: 1 }), leg({ playerId: 2, line: 1.5, result: "loss" })]]),
  ], { minDecided: 1 });
  const hit = recordForLeg(r, { market: "batter_hits", side: "Over", point: 0.5 });
  assert.equal(hit.line, 0.5);
  assert.equal(recordForLeg(r, { market: "batter_hits", side: "Over", point: 2.5 }), null, "no history is null, never the nearest row");
  // The board's shape says "Over 1.5" in one string; the lookup must survive that.
  assert.equal(recordForLeg(r, { market: "batter_hits", selection: "Over 1.5", point: 1.5 })?.line, 1.5);
});

test("both published card streams feed one record, and a leg in both is one observation", () => {
  /* The band cards live under `publicRiskSections[tier].all`, the daily suggested set under `slips`.
     Reading only the first shape would have missed the families the band cards use most — and would
     have labelled the result "the legs inside our cards" while measuring one of the two streams. */
  const l = leg({ playerId: 5 });
  const r = buildLegRecord([
    { date: "2026-09-01", slips: [{ legs: [l] }], publicRiskSections: { low: { all: [{ legs: [l] }] } } },
  ], { minDecided: 1 });
  assert.equal(r.distinct, 1, "the same leg in both streams on one day is one observation");
  assert.equal(r.slots, 2, "and both card slots are still counted");
  const onlyBands = buildLegRecord([
    { date: "2026-09-02", publicRiskSections: { medium: { all: [{ legs: [leg({ playerId: 6, result: "loss" })] }] } } },
  ], { minDecided: 1 });
  assert.equal(onlyBands.distinct, 1, "a file with no `slips` key is still read");
});

test("a leg the settler could not resolve is not a loss", () => {
  const r = buildLegRecord([{ date: "2026-09-01", slips: [{ legs: [leg({ result: "invalid", playerId: 3 }), leg({ playerId: 4 })] }] }], { minDecided: 1 });
  assert.equal(r.families[0].decided, 1);
  assert.equal(r.voided, 1, "`invalid` is set aside with the scratches, never counted as a zero");
});

test("a slip read off a screenshot joins by label — but only with the same side and line", () => {
  /* A screenshot gives us "Hits", never `batter_hits`. The label fallback exists for that, and it is
     whole-string: a join loose enough to match would report Over 0.5's record for a bet on Over 2.5. */
  const r = buildLegRecord([doc("2026-09-01", [[leg({ playerId: 1 }), leg({ playerId: 2, line: 1.5, result: "loss" })]])], { minDecided: 1 });
  assert.equal(recordForLeg(r, { market: "Hits", side: "Over", line: 0.5 })?.line, 0.5, "the printed label finds the family");
  assert.equal(recordForLeg(r, { marketLabel: "hits", side: "over 0.5", line: 0.5 })?.line, 0.5, "case and phrasing do not matter");
  assert.equal(recordForLeg(r, { market: "Hits", side: "Over", line: 2.5 }), null, "a different line is a different bet");
  assert.equal(recordForLeg(r, { market: "Hits", side: "Under", line: 0.5 }), null, "and so is the other side");
  assert.equal(recordForLeg(r, { market: "Hits", line: 0.5 }), null, "an unknown side matches nothing");
  assert.equal(recordForLeg(r, { market: "Home runs", side: "Over", line: 0.5 }), null, "a label we have no record for is null");
});

test("the engine's own claimed edge is never an input", () => {
  const src = fs.readFileSync(new URL("./leg-record.mjs", import.meta.url), "utf8");
  for (const field of ["edgePct", "confidence", "projection", "riskFlags"]) {
    assert.ok(!new RegExp(`leg\\.${field}|\\["${field}"\\]`).test(src), `${field} must not be read — it is a claim, not a result`);
  }
  // And the record must never present itself as the market's history.
  assert.match(src, /NOT the history of the market/);
});

test("it reproduces the published corpus, and the corpus is big enough to be worth showing", () => {
  const dir = path.join(process.cwd(), "public", "data", "parlays", "graded");
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)); } catch { return; }
  if (files.length === 0) return;
  const docs = files.map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
  const r = buildLegRecord(docs, { sport: "mlb", minDecided: 30 });
  assert.ok(r.distinct > 0 && r.slots >= r.distinct, "slots can never be fewer than distinct legs");
  for (const f of r.families) {
    assert.equal(f.wins + f.losses, f.decided);
    assert.ok(f.cardUses >= f.decided, `${f.label}: a family cannot be used fewer times than it was decided`);
    assert.ok(f.hitRate >= 0 && f.hitRate <= 1);
  }
});

test("no surface states a leg-family rate without saying whose legs they were", () => {
  const root = path.join(process.cwd(), "src");
  const list = fs.readFileSync(path.join(root, "components/parlays/lab/leg-record-list.tsx"), "utf8");
  assert.match(list, /our own published cards/, "the caption lives in the one component that renders the rows");
  assert.match(list, /not a record of the market/, "and it says what the record is not");
  assert.match(list, /r\.sample\.text/, "and every row prints its sample caption");

  /* Every consumer must go through that component. A surface that reached into `families` itself
     could print 59% with no caption at all, which is the whole failure mode this record invites. */
  const consumers = [
    "components/parlays/lab/slip-gauges.tsx",
    "components/accounts/slip-read-panel.tsx",
    "app/build/page.tsx",
    "app/results/parlay-lab/page.tsx",
  ];
  /* And the list itself must stay honest: every file that imports the component has to be in it, or
     a new surface could render rates with no caption and this guard would still pass. */
  const importers = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      /* A file that only imports the TYPE is passing the record along; a file that RENDERS the
         component is a surface, and a surface is what needs the caption. */
      else if (/\.tsx?$/.test(e.name) && fs.readFileSync(p, "utf8").includes("<LegRecordList")) importers.push(path.relative(root, p));
    }
  };
  walk(root);
  for (const rel of importers) {
    if (rel.endsWith("leg-record-list.tsx")) continue;
    assert.ok(consumers.includes(rel), `${rel} renders the leg record but is not in this guard's list`);
  }
  for (const rel of consumers) {
    const src = fs.readFileSync(path.join(root, rel), "utf8");
    assert.match(src, /<LegRecordList/, `${rel} must render the record through LegRecordList`);
    assert.ok(!/\.hitRate/.test(src), `${rel} must not format a rate itself`);
  }
});

test("a leg record is never dressed up as an edge or a forecast", () => {
  /* The check is on the COPY a reader sees. The module's own doc comment names `edgePct` in order to
     say it is never read, and a blunt word ban would have forced that explanation out of the file —
     which is how a rule against a word ends up removing the sentence that prevents the mistake. */
  const rendered = fs.readFileSync(path.join(process.cwd(), "src", "components/parlays/lab/leg-record-list.tsx"), "utf8");
  const copy = [...rendered.matchAll(/>([^<>{}]{8,})</g)].map((m) => m[1]).join(" ");
  for (const banned of [/\bedge\b/i, /\bexpect(ed|s)? to\b/i, /\bshould (hit|land|win)\b/i, /\bwill land\b/i, /\blikely\b/i]) {
    assert.ok(!banned.test(copy), `the rendered copy must not contain ${banned}`);
  }
  assert.ok(copy.length > 80, "and the copy must actually have been found, or this guard proves nothing");
});
