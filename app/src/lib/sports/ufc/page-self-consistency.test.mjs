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
const text = raw ? raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ") : null;

test("if the page SHOWS a price, it must not claim no price is shown", () => {
  if (!text) return;
  // The paper cards render American odds. Their presence is the trigger.
  const showsPrices = /Paper cards/.test(text) && /[+-]\d{2,4}\b/.test(text);
  if (!showsPrices) return;
  assert.doesNotMatch(text, /No sportsbook price is shown/i, "the page shows posted prices");
  assert.doesNotMatch(text, /authorisation covers NFL\s*only/i, "a dedicated UFC odds receipt exists");
});

test("the distinction that survived: SHOWING a price is not being MEASURED against one", () => {
  if (!text) return;
  if (!/Paper cards/.test(text)) return;
  /*
   * The honest half of the retired sentence, and the reason this was a correction rather than a
   * deletion. No no-vig comparison has ever been run for UFC. Removing the caveat along with the
   * false part would have quietly upgraded the claim.
   */
  assert.match(text, /never been (SCORED|scored) against a no-vig line|no-vig/i,
    "the page must still say the model has not been measured against a price");
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
