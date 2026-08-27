/**
 * UFC card coverage: the card is the denominator, and a partly priced card may not read as ready.
 *
 * Written against the real Aug-29 Shanghai card, which published eight priced bouts out of thirteen
 * with `oddsReady: true`, `blockers: []`, and the other five listed as five English sentences.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { classifyCardCoverage, coverageReconciles } from "./card-coverage.mjs";

const keyOf = (b) => [b.red?.name, b.blue?.name].sort().join("|");
const bout = (id, red, blue) => ({ boutId: id, red: { name: red }, blue: { name: blue }, weightClass: "Bantamweight", startUtc: "2026-08-29T10:00Z" });
const priced = (pairs, commenceUtc = "2026-08-29T10:00Z") =>
  new Map(pairs.map(([a, b], i) => [[a, b].sort().join("|"), { providerEventId: `pe${i}`, commenceUtc }]));

const CARD_START_MS = Date.parse("2026-08-29T07:00:00Z");
const call = (cardBouts, pricedByKey, matchedKeys, cardStartMs = CARD_START_MS) =>
  classifyCardCoverage({ cardBouts, pricedByKey, matchedKeys: new Set(matchedKeys), keyOf, cardStartMs });

/** The card as it actually stood on 2026-08-27: 13 bouts, 8 priced, no unmatched provider event. */
function shanghai() {
  const all = [
    bout("401887532", "Song Yadong", "Umar Nurmagomedov"),
    bout("401887535", "Yan Xiaonan", "Denise Gomes"),
    bout("401913129", "Bilal Hasan", "Nilson Rojas"),
    bout("401905190", "Namsrai Batbayar", "Andre Lima"),
    bout("401887537", "Rei Tsuruya", "Kevin Borjas"),
    bout("401898005", "Sean Woodson", "Jack Jenkins"),
    bout("401913544", "Lawrence Lui", "Hector Santiago"),
    bout("401905191", "Jingnan Xiong", "Julia Polastri"),
    bout("401891333", "Kai Asakura", "Aoriqileng"),
    bout("401887536", "Alex Perez", "Sumudaerji"),
    bout("401914040", "Liu Ce", "Levi Rodrigues Jr."),
    bout("401913543", "Xiao Long", "Francesco Nuzzi"),
    bout("401913545", "Ding Meng", "Cameron Nelson"),
  ];
  const pricedPairs = all.slice(0, 8).map((b) => [b.red.name, b.blue.name]);
  return { all, map: priced(pricedPairs), matched: pricedPairs.map(([a, b]) => [a, b].sort().join("|")) };
}

test("THE SHANGHAI SHAPE · eight of thirteen is not a ready card", () => {
  const { all, map, matched } = shanghai();
  const r = call(all, map, matched);
  assert.equal(r.coverage.cardBouts, 13);
  assert.equal(r.coverage.priced, 8);
  assert.equal(r.oddsReady, false, "the published artifact said true");
  assert.equal(r.partiallyPriced, true);
  assert.ok(r.blockers.length, "and it said blockers: []");
  assert.match(r.blockers.join(" "), /5 of 13/);
});

test("a fully priced card is ready, with nothing blocking it", () => {
  const { all } = shanghai();
  const pairs = all.map((b) => [b.red.name, b.blue.name]);
  const r = call(all, priced(pairs), pairs.map(([a, b]) => [a, b].sort().join("|")));
  assert.equal(r.oddsReady, true);
  assert.equal(r.partiallyPriced, false);
  assert.deepEqual(r.blockers, []);
  assert.deepEqual(r.unpriced, []);
});

test("CONSERVATION · priced + not-open + join-failed always equals the card", () => {
  const { all, map, matched } = shanghai();
  for (const n of [0, 1, 5, 8, 13]) {
    const pairs = all.slice(0, n).map((b) => [b.red.name, b.blue.name]);
    const r = call(all, priced(pairs), pairs.map(([a, b]) => [a, b].sort().join("|")));
    assert.ok(coverageReconciles(r.coverage), `n=${n}: ${JSON.stringify(r.coverage)}`);
    assert.equal(r.coverage.cardBouts, 13);
  }
  assert.ok(coverageReconciles(call(all, map, matched).coverage));
});

test("every unpriced bout carries its boutId — a sentence cannot be joined to a card", () => {
  const { all, map, matched } = shanghai();
  const r = call(all, map, matched);
  assert.equal(r.unpriced.length, 5);
  assert.deepEqual(
    r.unpriced.map((u) => u.boutId).sort(),
    ["401887536", "401891333", "401913543", "401913545", "401914040"],
  );
  for (const u of r.unpriced) {
    assert.ok(u.boutId && u.red && u.blue && u.reason && u.nextCheck, `${u.matchup} is fully typed`);
  }
});

test("no unmatched provider event ⇒ MARKET_NOT_OPEN, which is a normal state and not a defect", () => {
  const { all, map, matched } = shanghai();
  const r = call(all, map, matched);
  assert.ok(r.unpriced.every((u) => u.state === "MARKET_NOT_OPEN"));
  assert.equal(r.coverage.joinFailed, 0);
  assert.equal(r.coverage.unmatchedProviderEvents, 0);
  assert.doesNotMatch(r.blockers.join(" "), /defect/);
});

test("THE BULK-ENDPOINT TRAP · unmatched events on OTHER cards prove nothing about this one", () => {
  /*
   * Caught by running it, not by reading it. The authorised UFC call is the BULK MMA endpoint, so
   * the provider map holds every upcoming fight the book lists — on the live run, 62 of them, nearly
   * all belonging to cards weeks out. The first version asked only whether ANY provider event went
   * unmatched, so it labelled all five Shanghai bouts JOIN_FAILED: a rule that would fire on every
   * card forever is a constant dressed as a diagnosis.
   */
  const { all } = shanghai();
  const pairs = all.slice(0, 8).map((b) => [b.red.name, b.blue.name]);
  const map = priced(pairs);
  // Two fights on a card three weeks away, exactly as the bulk endpoint returns them.
  map.set("bo hyun park|farida abdueva", { providerEventId: "far1", commenceUtc: "2026-09-20T02:00:00Z" });
  map.set("chungreng koren|ryo tajima", { providerEventId: "far2", commenceUtc: "2026-09-20T03:00:00Z" });
  const r = call(all, map, pairs.map(([a, b]) => [a, b].sort().join("|")));
  assert.equal(r.coverage.unmatchedProviderEvents, 0, "another card's fights are not evidence about this one");
  assert.equal(r.coverage.joinFailed, 0);
  assert.equal(r.coverage.marketNotOpen, 5);
  assert.ok(r.unpriced.every((u) => u.state === "MARKET_NOT_OPEN"));
});

test("REFUSAL · with no card start there is no window, so no join failure is asserted", () => {
  // Without a window every unmatched event would qualify again. Absent evidence is not evidence.
  const { all } = shanghai();
  const pairs = all.slice(0, 8).map((b) => [b.red.name, b.blue.name]);
  const map = priced(pairs);
  map.set("someone|else", { providerEventId: "x", commenceUtc: "2026-08-29T09:00:00Z" });
  const r = call(all, map, pairs.map(([a, b]) => [a, b].sort().join("|")), NaN);
  assert.equal(r.coverage.unmatchedProviderEvents, 0);
  assert.equal(r.coverage.joinFailed, 0);
});

test("an unmatched provider event ⇒ JOIN_FAILED, because the market provably exists", () => {
  /*
   * The whole reason the two states are separated. A book that has not opened an undercard fight
   * resolves itself; a book that HAS the fight while we fail to recognise it is a bout we already
   * paid for and threw away, and it will not resolve itself.
   */
  const { all } = shanghai();
  const pairs = all.slice(0, 8).map((b) => [b.red.name, b.blue.name]);
  const map = priced(pairs);
  // Inside the card's own window — this is the case that IS evidence about this card.
  map.set("another name|someone unrecognised", { providerEventId: "near1", commenceUtc: "2026-08-29T09:30:00Z" });
  const r = call(all, map, pairs.map(([a, b]) => [a, b].sort().join("|")));
  assert.equal(r.coverage.unmatchedProviderEvents, 1);
  assert.equal(r.coverage.joinFailed, 5);
  assert.equal(r.coverage.marketNotOpen, 0);
  assert.ok(r.unpriced.every((u) => u.state === "JOIN_FAILED"));
  assert.match(r.blockers.join(" "), /defect, not a closed market/);
  assert.ok(coverageReconciles(r.coverage));
});

test("a card with nothing priced is not ready and says so first", () => {
  const { all } = shanghai();
  const r = call(all, new Map(), []);
  assert.equal(r.oddsReady, false);
  assert.equal(r.partiallyPriced, false, "nothing priced is not 'partially' priced");
  assert.match(r.blockers[0], /no h2h market/);
  assert.ok(coverageReconciles(r.coverage));
});

test("an empty card is never ready — zero of zero is not complete coverage", () => {
  const r = call([], new Map(), []);
  assert.equal(r.oddsReady, false);
  assert.equal(r.coverage.cardBouts, 0);
});

test("LIVE ARTIFACT · the published snapshot reconciles against the card it names", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const root = path.join(process.cwd(), "public", "data", "ufc");
  const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(root, f), "utf8")); } catch { return null; } };
  const odds = read("odds-latest.json");
  const card = read("card-latest.json");
  if (!odds || !card) return;
  if (odds.event?.providerEventId !== card.event?.providerEventId) return; // different cards, nothing to reconcile
  if (!odds.coverage) return; // pre-contract artifact, rewritten on the next capture
  assert.equal(odds.coverage.cardBouts, (card.bouts ?? []).length, "the denominator is the card");
  assert.ok(coverageReconciles(odds.coverage), JSON.stringify(odds.coverage));
  assert.equal(odds.coverage.priced, (odds.bouts ?? []).length);
  if (odds.coverage.priced < odds.coverage.cardBouts) {
    assert.equal(odds.oddsReady, false, "a partly priced card must not publish as ready");
    assert.ok(odds.blockers?.length, "and must name what is missing");
  }
});
