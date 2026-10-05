/**
 * UFC card coverage: the card is the denominator, and a partly priced card may not read as ready.
 *
 * Written against the real Aug-29 Shanghai card, which published eight priced bouts out of thirteen
 * with `oddsReady: true`, `blockers: []`, and the other five listed as five English sentences.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { classifyCardCoverage, coverageReconciles, providerEventIdOf } from "./card-coverage.mjs";

const keyOf = (b) => [b.red?.name, b.blue?.name].sort().join("|");
const bout = (id, red, blue) => ({ boutId: id, red: { name: red }, blue: { name: blue }, weightClass: "Bantamweight", startUtc: "2026-08-29T10:00Z" });
const priced = (pairs, commenceUtc = "2026-08-29T10:00Z") =>
  new Map(pairs.map(([a, b], i) => [[a, b].sort().join("|"), { providerEventId: `pe${i}`, commenceUtc }]));

const fighterKeys = (b) => [b.red?.name, b.blue?.name];
const call = (cardBouts, pricedByKey, matchedKeys, fk = fighterKeys) =>
  classifyCardCoverage({ cardBouts, pricedByKey, matchedKeys: new Set(matchedKeys), keyOf, fighterKeys: fk });

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

test("THE BULK-ENDPOINT TRAP · other promotions in the same payload prove nothing about this card", () => {
  /*
   * Two wrong rules, both falsified by live data, both instructive:
   *
   *   · "ANY unmatched provider event" ⇒ 62 of them, nearly all on cards weeks away.
   *   · "unmatched, inside this card's TIME WINDOW" ⇒ 11 left, and they were Akbarjon Islomboev vs
   *     Elvis Silva and friends — regional-circuit bouts running the same weekend. Time says when a
   *     fight happens, not whose card it is on.
   */
  const { all } = shanghai();
  const pairs = all.slice(0, 8).map((b) => [b.red.name, b.blue.name]);
  const map = priced(pairs);
  // A different promotion, same weekend, same hour — exactly what the bulk endpoint returns.
  map.set("akbarjon islomboev|elvis silva", { providerEventId: "reg1", commenceUtc: "2026-08-29T09:00:00Z" });
  map.set("dedrek sanders|luis gomez", { providerEventId: "reg2", commenceUtc: "2026-08-29T10:00:00Z" });
  const r = call(all, map, pairs.map(([a, b]) => [a, b].sort().join("|")));
  assert.equal(r.coverage.unmatchedProviderEvents, 0, "nobody on those cards is fighting on ours");
  assert.equal(r.coverage.joinFailed, 0);
  assert.equal(r.coverage.marketNotOpen, 5);
});

test("REFUSAL · with no fighter fold there is no evidence, so no join failure is asserted", () => {
  const { all } = shanghai();
  const pairs = all.slice(0, 8).map((b) => [b.red.name, b.blue.name]);
  const map = priced(pairs);
  map.set("someone|else", { providerEventId: "x", commenceUtc: "2026-08-29T09:00:00Z" });
  const r = call(all, map, pairs.map(([a, b]) => [a, b].sort().join("|")), undefined);
  assert.equal(r.coverage.unmatchedProviderEvents, 0);
  assert.equal(r.coverage.joinFailed, 0);
});

test("HONEST LIMIT · a join failure on BOTH sides is undetectable, and under-claims rather than invents", () => {
  // Stated in the module header. If neither fighter folds to a name we hold, nothing distinguishes
  // the row from another promotion's fight — so it reports MARKET_NOT_OPEN, the conservative answer.
  const { all } = shanghai();
  const pairs = all.slice(0, 8).map((b) => [b.red.name, b.blue.name]);
  const map = priced(pairs);
  map.set("kai asakura-san|aoriqileng jr", { providerEventId: "both-folded-wrong", commenceUtc: "2026-08-29T09:00:00Z" });
  const r = call(all, map, pairs.map(([a, b]) => [a, b].sort().join("|")));
  assert.equal(r.coverage.joinFailed, 0);
  assert.equal(r.coverage.marketNotOpen, 5);
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
  /* ONE side folds to a fighter we know is on this card ("Kai Asakura"), the other does not — the
     realistic shape of a missed join: a diacritic, a nickname, a transliteration. */
  map.set("Kai Asakura|aoriqileng (the eagle)", { providerEventId: "near1", commenceUtc: "2026-08-29T09:30:00Z" });
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

/* ── Card identity is ESPN's — the provider has no card (2026-10-05) ────────────────────────────
 *
 * The bulk MMA endpoint returns one provider event PER FIGHT, each with its own hash. P264 tallied
 * those hashes, took the "most claimed" as the card's event id and compared it with the card's ESPN
 * id, so every capture that priced a single bout reported "the odds artifact describes event
 * 4a469d6a…, not this card (600061182)" — and no UFC card could read ready, 12/12 included. The old
 * fixtures let several fights share one provider id; these use the provider's real shape.
 */

/** UFC 332 (ESPN event 600061182) as captured 2026-10-03, every bout priced, ONE provider hash per fight. */
const UFC332_EVENT = "600061182";
const ufc332 = () => {
  const all = [
    bout("401912278", "Natalia Silva", "Wang Cong"),
    bout("401907087", "Deiveson Figueiredo", "Payton Talbott"),
    bout("401917347", "King Green", "Esteban Ribovics"),
    bout("401917345", "Roberto Soldić", "Khaos Williams"),
    bout("401907088", "Roman Kopylov", "Ateba Gautier"),
    bout("401912276", "Alden Coria", "Imanol Rodriguez"),
    bout("401912277", "Andrey Pulyaev", "Damian Pinas"),
    bout("401927906", "Anthony Romero", "Marcus McGhee"),
    bout("401922306", "Anthony Wint", "Lucas Armand"),
    bout("401926808", "Jacobe Smith", "Bruce Whitehead"),
    bout("401912275", "Marvin Vettori", "Ismail Naurdiev"),
    bout("401907089", "Court McGee", "Eric Nolan"),
    bout("401912274", "Johnny Walker", "Mick Parkin"),
    bout("401917346", "Rafael Dos Anjos", "Alexander Hernandez"),
  ];
  // A 32-hex id per fight, distinct — the first is the real hash the false blocker named.
  const hash = (i) => (i === 0 ? "4a469d6a287808bf75aa8a246197f51d" : (i * 2654435761 >>> 0).toString(16).padStart(8, "0").repeat(4));
  const map = new Map(all.map((b, i) => [keyOf(b), { providerEventId: hash(i), commenceUtc: "2026-10-03T20:00:00Z" }]));
  return { all, map, matched: all.map(keyOf) };
};
const classify332 = (snapshotEventId, { all, map, matched } = ufc332()) =>
  classifyCardCoverage({ cardBouts: all, pricedByKey: map, matchedKeys: new Set(matched), keyOf, fighterKeys, cardEventId: UFC332_EVENT, snapshotEventId });

test("REAL PROVIDER SHAPE · a fully priced card captured for its own ESPN event is ready, with no mismatch", () => {
  const fx = ufc332();
  assert.equal(new Set([...fx.map.values()].map((p) => p.providerEventId)).size, fx.all.length, "one provider id per fight");
  const r = classify332(UFC332_EVENT, fx);
  assert.equal(r.eventMismatch, false);
  assert.equal(r.oddsReady, true);
  assert.deepEqual(r.blockers, []);
});

test("MUTATION PROBE · the P264 identity (most-claimed provider hash) fails this fixture", () => {
  // Reinstated in memory, exactly as it ran: tally the joined bouts' provider ids, most-claimed wins,
  // ties by id. With one id per fight every tally is 1, so the "card id" is just the lowest hash.
  const fx = ufc332();
  const tally = new Map();
  for (const k of fx.matched) { const id = fx.map.get(k).providerEventId; tally.set(id, (tally.get(id) ?? 0) + 1); }
  const p264 = [...tally.entries()].sort((a, b) => (b[1] - a[1]) || String(a[0]).localeCompare(String(b[0])))[0][0];
  const mutant = classify332(p264, fx);
  assert.equal(mutant.eventMismatch, true, "the fixture must catch the defect, or it proves nothing");
  assert.equal(mutant.oddsReady, false, "the mutant reports a fully priced card as not ready");
  assert.match(mutant.blockers[0], /^the odds artifact describes event [0-9a-f]{32}, not this card \(600061182\)/);
  // …and the real identity, on the same bytes, does not.
  assert.equal(classify332(UFC332_EVENT, fx).eventMismatch, false);
});

test("a snapshot written under a DIFFERENT ESPN event is still no coverage of this card", () => {
  const r = classify332("600061541");
  assert.equal(r.eventMismatch, true);
  assert.equal(r.oddsReady, false);
  assert.equal(r.partiallyPriced, false);
  assert.match(r.blockers[0], /describes event 600061541, not this card \(600061182\)/);
});

test("no event id on either side asserts no mismatch — absence is not evidence", () => {
  assert.equal(classify332(null).eventMismatch, false);
});

test("a provider id is per-bout provenance: read for the key the bout claimed, never guessed", () => {
  const { all, map } = ufc332();
  assert.equal(providerEventIdOf(keyOf(all[0]), map), "4a469d6a287808bf75aa8a246197f51d");
  assert.notEqual(providerEventIdOf(keyOf(all[1]), map), providerEventIdOf(keyOf(all[0]), map));
  assert.equal(providerEventIdOf("missing", map), null);
  assert.equal(providerEventIdOf("x", new Map([["x", { providerEventId: "" }]])), null, "an empty id is not an id");
  assert.equal(providerEventIdOf("x", null), null);
});

test("the capture script judges identity in ESPN ids only, and its caller can no longer swallow a crash", () => {
  const script = fs.readFileSync(path.join(process.cwd(), "scripts/ufc/capture-ufc-odds.mjs"), "utf8");
  assert.match(script, /cardEventId: card\.event\?\.providerEventId \?\? null,/, "the card side is the card's ESPN event");
  assert.match(script, /snapshotEventId: snapshotEvent\.providerEventId \?\? null,/, "the snapshot side is the ESPN event it is written under");
  assert.match(script, /event: snapshotEvent,/, "and that is the event the artifact names");
  assert.match(script, /const snapshotEvent = \{ providerEventId: card\.event\.providerEventId,/);
  assert.ok(!/matchedProviderEventId|matchedEventId|oddsEventId/.test(script), "no provider id is promoted to card identity");
  assert.ok(!/matchedEvent\?\./.test(script), "the undefined identifier is gone");
  assert.match(script, /providerEventId: providerEventIdOf\(matchedKey, priced\)/, "the provider id rides on its own bout");
  assert.match(script, /^  unmatchedProviderEvents,$/m, "the evidence behind JOIN_FAILED is persisted, not only logged");
  assert.match(script, /process\.exit\(3\)/, "nothing-to-price has its own exit code");

  const wf = fs.readFileSync(path.join(process.cwd(), "..", ".github/workflows/ufc-fight-week.yml"), "utf8");
  const step = wf.slice(wf.indexOf("Refresh fight-winner prices"), wf.indexOf("Settle any card"));
  assert.ok(!/capture-ufc-odds\.mjs[^\n]*\|\|\s*\\?\s*$/m.test(step), "no bare `|| echo` around a paid call");
  assert.match(step, /rc=\$\?/, "the exit code is captured");
  assert.match(step, /elif \[ "\$rc" -ne 0 \]/, "and anything that is not the honest refusal fails the step");
});
