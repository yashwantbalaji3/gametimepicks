/**
 * ONE COMPONENT, AND NEVER ONE CLAIM.
 *
 * Run: npx tsx --test src/lib/parlays/sport-lab-cards.test.mjs
 *
 * The three risk ladders do not choose their sides the same way, and the difference is the whole
 * point. UFC selects on ITS MODEL, because that model passed its preregistered bar. EPL and MLB
 * select on PRICE, because theirs did not — EPL's has never been scored against a no-vig line and
 * would currently pick Hull City to beat Manchester United at 42.2% against a market price of 10.6%.
 *
 * A shared component that composed its own caption would eventually render one sport's cards under
 * another's claim, and on the page the honest and dishonest versions look identical. So the sentence
 * lives on the ARTIFACT, each builder states its own, and a ladder that does not say is not loaded.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { legLabel, loadSportLabLadder } from "./sport-lab-cards.ts";

const APP = process.cwd();
const readLadder = (dir) => {
  const p = path.join(APP, "public/data/parlays", dir, "latest.json");
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null;
};

test("THE COMPONENT COMPOSES NO CLAIM OF ITS OWN", () => {
  const comp = fs.readFileSync(path.join(APP, "src/components/sport-lab-cards.tsx"), "utf8");
  const code = comp.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  // It may render `selection`; it may not decide what selection means for any sport.
  assert.match(code, /\{ladder\.selection\}|\$\{ladder\.selection\}/, "the sentence must come from the artifact");
  for (const banned of [/market's own favourite/i, /passed its preregistered bar/i, /model's own read/i]) {
    assert.doesNotMatch(code, banned, `the component must not hardcode a sport's claim: ${banned}`);
  }
});

test("a ladder that does not state how it selected is REFUSED, not narrated", () => {
  // There is no safe default. Every available one is a claim about a model, and the wrong one is
  // worse than showing nothing at all.
  const src = fs.readFileSync(path.join(APP, "src/lib/parlays/sport-lab-cards.ts"), "utf8");
  assert.match(src, /typeof raw\?\.selection !== "string"/);
});

test("EACH LADDER STATES ITS OWN SELECTION, and the two do not agree", () => {
  const ufc = readLadder("risk-ladder-ufc");
  const epl = readLadder("risk-ladder-epl");
  if (!ufc || !epl) return;
  /*
   * P224: this asserted BOTH ladders always declare a selection. A ladder only has a selection when
   * it published a card — on 2026-09-01 the UFC ladder was honestly `state: "NO_PRICES"` with zero
   * cards for a card six days out, so it declared none and the loader refused it, exactly as
   * designed. The claim is about PUBLISHED ladders; an unpublished one has its own contract, which
   * the block below now pins instead of skipping.
   */
  const published = (l) => (l.cards ?? []).length > 0;
  for (const [sport, l] of [["ufc", ufc], ["epl", epl]]) {
    if (published(l)) {
      assert.ok(l.selection?.length > 0, `${sport}: a published ladder must declare how it selected`);
    } else {
      assert.ok(!l.selection, `${sport}: a ladder with no card must not narrate a selection it never made`);
      assert.ok(l.state && l.reason, `${sport}: and it must state WHY it published nothing (${l.state ?? "no state"})`);
    }
  }
  if (!published(ufc) || !published(epl)) return;
  assert.notEqual(ufc.selection, epl.selection, "two sports that select differently must not read identically");
  // UFC is the one model that earned the right to pick a side; EPL's explicitly has not.
  assert.match(ufc.selection, /model's own read/i);
  /*
   * EPL's sentence changed when the ladder started using the totals market as well as the three-way
   * favourite — it now says "a market price on a settleable market". What must hold is the CLAIM,
   * not the wording: the market is named as the source and the model is disclaimed.
   */
  assert.match(epl.selection, /market price|market's own/i);
  assert.match(epl.selection, /never this model's read/i);
});

test("a ladder for a DIFFERENT day is refused", () => {
  const ufc = readLadder("risk-ladder-ufc");
  if (!ufc) return;
  // Ladders are dated by the day of their FIXTURES. Serving one regardless is how a set of cards
  // came to carry three dates at once: written 08-18, fighting 08-22, published as 08-21.
  assert.equal(loadSportLabLadder("ufc", "1999-01-01"), null);
  /*
   * P224: "its own date must load" holds only for a ladder that HAS something to serve. An
   * unpublished ladder must refuse on its own date too — an empty scaffold reaching a surface is
   * how a product comes to look live while carrying nothing, so the refusal is the stronger claim
   * and is asserted here rather than skipped.
   */
  if ((ufc.cards ?? []).length > 0) {
    assert.ok(loadSportLabLadder("ufc", ufc.date), "a published ladder's own date must load");
  } else {
    assert.equal(loadSportLabLadder("ufc", ufc.date), null,
      "a ladder with no cards is refused even on its own date — an empty scaffold is not a product");
  }
});

test("an unknown sport loads nothing rather than guessing a directory", () => {
  assert.equal(loadSportLabLadder("nba", "2026-08-22"), null);
  assert.equal(loadSportLabLadder("epl", null), null);
});

test("leg labels read in the sport's own terms", () => {
  // A fight is a person against a person; a football draw names neither.
  assert.equal(legLabel({ player: "Gauge Young", opponent: "Stan Dorsainvil", market: "fight_winner", marketLabel: "Fight winner", side: "win" }), "Gauge Young to beat Stan Dorsainvil");
  assert.equal(legLabel({ player: null, team: null, matchup: "Everton v Crystal Palace", side: "draw", market: "match_result", marketLabel: "Match result" }), "Everton v Crystal Palace — draw");
  assert.equal(legLabel({ player: null, team: "Everton", matchup: "Everton v Crystal Palace", side: "home", market: "match_result", marketLabel: "Match result" }), "Everton — match result");
});

test("BUILT EXPORT · each sport's page carries its OWN sentence and not the other's", () => {
  /*
   * P224: read each page's <main>, not the whole document. The shared navigation lists "EPL Paper
   * Cards" and "UFC Paper Cards" on EVERY route, so `page.includes("Paper cards")` fired on the
   * menu rather than on rendered cards — and on a day /ufc publishes no ladder the UFC branch ran
   * anyway and demanded a sentence the page had no reason to carry.
   */
  /*
   * ...and DECODE what it reads. The rendered copy carries `&#x27;` for its apostrophes while this
   * guard was written against `&rsquo;`, so matching raw markup depends on which entity the renderer
   * happened to emit. Worse, the whole-document scan this replaced was satisfied by Next.js's
   * embedded RSC payload — the strings are serialised there unescaped — so the guard could pass on a
   * page whose visible text said nothing of the kind.
   */
  const decode = (t) => t
    .replace(/&#x27;|&#39;|&rsquo;|&apos;/gi, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/gi, '"')
    .replace(/&amp;/gi, "&")
    .replace(/&nbsp;/gi, " ");
  const read = (p) => {
    if (!fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p, "utf8");
    const main = /<main[^>]*>([\s\S]*?)<\/main>/.exec(raw)?.[1] ?? raw;
    return decode(main.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
  };
  const eplPage = read(path.join(APP, "out/epl/index.html"));
  const ufcPage = read(path.join(APP, "out/ufc/index.html"));
  if (!eplPage || !ufcPage) return;   // export not built in this run
  if (eplPage.includes("Paper cards")) {
    /*
     * This pinned "the market's own favourite", which stopped being the whole truth the day the
     * ladder started using totals as well as the three-way — a book's over/under line is a market
     * price and is not a favourite. The sister guard in sports/epl/ladder.test.mjs was restated
     * then; this one was missed, so it failed on a sentence that had become MORE accurate.
     *
     * The claim is what matters, and it has two halves that must BOTH be present: the side is the
     * market's, and it is explicitly not the model's. Either half alone is the dangerous version.
     */
    assert.match(eplPage, /market price|market's own/i, "EPL's cards must say the side comes from the market");
    assert.match(eplPage, /never this model's read/i, "and must disclaim the model in the same breath");
    assert.doesNotMatch(eplPage, /passed its preregistered bar/i, "EPL must never claim a cleared bar");
  }
  if (ufcPage.includes("Paper cards")) {
    /*
     * The copy says "CLEARED its preregistered bar"; this pinned "passed". The sentence was reworded
     * and this guard was not — the identical miss the EPL comment above records, in the same file,
     * one branch down. Match the CLAIM (a preregistered bar that the model met) rather than the verb.
     */
    assert.match(ufcPage, /(passed|cleared) its preregistered bar/i, "UFC's cards may state the bar its model met");
    assert.doesNotMatch(ufcPage, /market's own favourite/i, "UFC's cards are its model's read, not the price's");
  }
});

/*
 * ── A BAND THAT CAME UP EMPTY ──────────────────────────────────────────────────────────────────
 *
 * `low` is unreachable on nearly every slate: -200 to +100 means a two-leg card must combine to
 * 2.00 decimal, both legs at roughly -242 or shorter, which the leg-quality bar does not produce.
 * The fix that must NEVER ship is moving the boundary, because the band is the risk statement.
 */
import { deriveBandSubstitutes } from "./sport-lab-cards.ts";

const ladderWith = (cards, skipped) => ({
  sport: "epl", date: "2099-01-01", generatedAt: "2099-01-01T00:00:00Z",
  cards, skipped, selection: "market favourite", moneyClass: "NON_MONEY", eventName: null,
});

test("an empty band is pointed at the CALMEST card built, not the next rung up", () => {
  const subs = deriveBandSubstitutes(ladderWith(
    [{ tier: "medium", slipId: "m1" }, { tier: "high", slipId: "h1" }],
    [{ tier: "low", reason: "x" }, { tier: "longshot", reason: "y" }],
  ));
  assert.equal(subs.length, 2);
  assert.ok(subs.every((s) => s.offered === "medium"), "a reader handed a fallback lands on the mildest card available");
});

test("the note states the RISK DIRECTION, and gets it right in both directions", () => {
  const [low] = deriveBandSubstitutes(ladderWith([{ tier: "medium", slipId: "m1" }], [{ tier: "low", reason: "x" }]));
  assert.match(low.note, /longer price/, "a medium card offered to a low reader is MORE risk and must say so");
  const [shot] = deriveBandSubstitutes(ladderWith([{ tier: "medium", slipId: "m1" }], [{ tier: "longshot", reason: "y" }]));
  assert.match(shot.note, /shorter price/, "a medium card offered to a longshot reader is LESS risk and must say so");
});

test("a substitute never relabels the card — the offered band is named as itself", () => {
  const [low] = deriveBandSubstitutes(ladderWith([{ tier: "medium", slipId: "m1" }], [{ tier: "low", reason: "x" }]));
  assert.equal(low.band, "low");
  assert.equal(low.offered, "medium");
  assert.notEqual(low.band, low.offered, "the empty band and the card's own band must stay distinct");
});

test("no cards at all means no substitutes — there is nothing to point at", () => {
  assert.deepEqual(deriveBandSubstitutes(ladderWith([], [{ tier: "low", reason: "x" }])), []);
});

test("a band that HAS a card is never given a substitute", () => {
  const subs = deriveBandSubstitutes(ladderWith(
    [{ tier: "medium", slipId: "m1" }],
    [{ tier: "medium", reason: "stale entry" }, { tier: "high", reason: "y" }],
  ));
  assert.deepEqual(subs.map((s) => s.band), ["high"]);
});
