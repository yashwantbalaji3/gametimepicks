/**
 * /ufc MUST NOT DENY WHAT IT RENDERS.
 *
 * Run: npx tsx --test src/lib/sports/ufc/page-self-consistency.test.mjs
 *
 * Two sentences on this page had expired into contradictions, and both were found only by reading
 * the built output rather than the source.
 *
 *   "No sportsbook price is shown or compared — our odds authorisation covers NFL only"
 *      sat directly above paper cards showing -160, +115 and +160, under a dedicated UFC receipt.
 *
 *   "Historical record only; UFC has no live model coverage"
 *      was the META DESCRIPTION of a page rendering a model pick for every bout on the next card.
 *      That one is worse for being invisible to the team: it reaches a search result and a link
 *      preview, and nobody on the project ever looks at it.
 *
 * Both were true when written. That is the whole failure mode — a claim that was accurate becoming
 * false because the product moved underneath it, with nothing checking the pair.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const PAGE = path.join(APP, "out/ufc/index.html");
const raw = fs.existsSync(PAGE) ? fs.readFileSync(PAGE, "utf8") : null;
/*
 * P224: scan THIS PAGE'S BODY, not the whole document. The shared navigation lists "EPL Paper
 * Cards", "UFC Paper Cards" and "NFL Paper Cards" on every route, so a `/Paper cards/` trigger fired
 * on the chrome rather than on anything /ufc actually renders — a check that cannot tell the page
 * from its own menu is not checking the page.
 */
const mainOf = (html) => (/<main[^>]*>([\s\S]*?)<\/main>/.exec(html ?? "")?.[1] ?? html ?? "");
const text = raw ? mainOf(raw).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ") : null;

test("if the page SHOWS a price, it must not claim no price is shown", () => {
  if (!text) return;
  // The paper cards render American odds. Their presence is the trigger.
  const showsPrices = /Paper cards/.test(text) && /[+-]\d{2,4}\b/.test(text);
  if (!showsPrices) return;
  assert.doesNotMatch(text, /No sportsbook price is shown/i, "the page shows posted prices");
  assert.doesNotMatch(text, /authorisation covers NFL\s*only/i, "a dedicated UFC odds receipt exists");
});

test("a page that claims MEASUREMENT must state the limits of it", () => {
  if (!text) return;
  /*
   * P224: this demanded the sentence "the model has never been scored against a no-vig line". That
   * was true when written and is now false — since 2026-08-22 the model IS graded against the
   * de-vigged line (16 picks in ufc/graded-picks.json, hit rate 0.625, sampleState
   * TOO_SMALL_TO_ASSESS), and the page says so. Requiring the old denial would have forced the page
   * to publish something untrue in order to stay green: the exact failure mode this file was
   * written to catch, arriving this time inside the guard rather than inside the copy.
   *
   * The intent survives without the wording. A page may claim to be measured against the market
   * ONLY while it also states the limit of that measurement — sample size, or which side the
   * comparison currently favours. Claiming the comparison with no caveat is the real defect.
   */
  const claimsMeasurement = /scored against the de-?vig|measured against .{0,24}\b(line|market|price)\b|no-?vig/i.test(text);
  if (!claimsMeasurement) return;
  /*
   * The caveat must be ABOUT THE SAMPLE. A first draft of this pattern accepted a bare "too few",
   * which every per-fighter blurb on the card satisfies ("3 tracked bouts — too few clear tendencies
   * to call out"): nine matches, none of them the caveat, so the guard passed on a page with the
   * caveat deleted. Tie the smallness to the sample or to what it cannot support.
   */
  assert.match(
    text,
    /(?:sample|graded picks)[^.]{0,60}?too (?:small|few)|too (?:small|few)[^.]{0,60}?(?:to say|to support|to assess|about accuracy)|(?:favours|favors) the market|never been (?:SCORED|scored) against a no-?vig line/i,
    "the page compares itself to the market, so it must also say how little that comparison can support",
  );
});

test("the META DESCRIPTION must not contradict the page", () => {
  if (!raw) return;
  const m = /<meta name="description" content="([^"]*)"/.exec(raw);
  if (!m) return;
  const desc = m[1];
  const hasModelRead = /Model pick/i.test(text ?? "");
  if (hasModelRead) {
    assert.doesNotMatch(desc, /no live model coverage/i, "the page renders a model pick for every bout");
    assert.doesNotMatch(desc, /Historical record only/i, "the page is not historical only");
  }
  // And it must still carry the limitation, because a search result is read by someone who has seen
  // nothing else.
  assert.match(desc, /experimental/i);
  assert.match(desc, /[Pp]aper-only|educational/);
});

test("the title describes what the page is now", () => {
  if (!raw) return;
  const t = /<title>(.*?)<\/title>/.exec(raw)?.[1] ?? "";
  if (/Model pick/i.test(text ?? "")) {
    assert.doesNotMatch(t, /^UFC Settled Archive/, "a page with a live model read is not only an archive");
  }
});
