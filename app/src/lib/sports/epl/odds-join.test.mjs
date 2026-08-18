/**
 * THE EPL PRICE CAPTURE MUST JOIN TO OUR FIXTURE IDS, NOT THE PROVIDER'S.
 *
 * runEplShadow matches an odds row to a fixture on `fixture.eventId` — our own
 * "soccer:epl:arsenal-v-coventry-city:20260821t1900". The provider supplies its own opaque id and
 * club names. Publishing the provider id would make every row fail that match SILENTLY: the model
 * would keep reporting "no authorized odds snapshot" with a full price capture sitting on disk, and
 * nothing anywhere would say why.
 *
 * That is the failure these pin, along with the two ways the join itself can lie.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const SRC = fs.readFileSync(path.join(process.cwd(), "scripts", "epl", "capture-epl-odds.mjs"), "utf8");
const BODY = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("rows the model consumes carry OUR event id", () => {
  assert.match(BODY, /shadowRows\.push\(\{\s*eventId: fixture\.eventId/,
    "the shadow rows must key on the fixture's own id — the provider's id matches nothing downstream");
  assert.match(BODY, /marketType: "h2h"/, "the shadow filters on marketType h2h");
  assert.match(BODY, /capturedAt: NOW/, "the shadow reads capturedAt for staleness");
});

test("the snapshot exposes capturedAt at the top level", () => {
  // runEplShadow reads oddsSnapshot.capturedAt. An artifact carrying only generatedAt is stale to it
  // by definition — Date.parse(undefined) is NaN, and the freshness check refuses.
  assert.match(BODY, /capturedAt: NOW,\s*\n\s*eventCount/, "the snapshot must expose capturedAt, not only generatedAt");
});

test("each bookmaker is kept separate, never averaged before de-vig", () => {
  /*
   * The shadow de-vigs EACH book on its own. A consensus median cannot be de-vigged as a book: the
   * median of three books is not a price any book posted, and its implied sum means nothing.
   */
  assert.match(BODY, /for \(const bk of ev\.bookmakers \?\? \[\]\)/, "per-book rows are required");
  assert.match(BODY, /bookmaker: bk\.key/, "each row must name the book it came from");
});

test("an unjoinable or ambiguous provider event is quarantined, never guessed", () => {
  assert.match(BODY, /hits\.length === 1/, "exactly one fixture must match");
  assert.match(BODY, /quarantined\.push/, "a failed join must be recorded");
  assert.match(BODY, /if \(!fixture\) continue;/, "an unjoined event must not contribute rows");
  // Both directions: nothing matched, and more than one matched.
  assert.match(BODY, /hits\.length === 0/, "the zero-match case needs its own reason");
});

test("the club alias table is empty until a real capture supplies evidence", () => {
  /*
   * An alias is a claim that two names are the same club, and a wrong one puts one match's prices on
   * another. The first draft was written from memory and was backwards — it mapped full official
   * names to abbreviations while the fixture source writes the full forms, so every entry would have
   * broken a join that otherwise worked. No EPL capture has ever succeeded, so the provider's club
   * strings have not been observed. This stays empty until they have been.
   *
   * When Thursday's quarantine names real mismatches, add them WITH that receipt and change this
   * test to assert those specific entries.
   */
  const table = /const CLUB_ALIASES = \{([\s\S]*?)\};/.exec(BODY)?.[1] ?? "";
  assert.equal(table.trim(), "", "aliases must be added from an observed capture, never from memory");
});
