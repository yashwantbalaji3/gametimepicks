/**
 * Guards for team-mark resolution.
 *
 * The load-bearing property is that a WRONG crest is worse than none. Every ambiguity below
 * resolves to the specific team or to null, never to a plausible neighbour.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { buildTeamMarkIndex, normaliseTeam, resolveMatchupMarks, resolveTeamMark } from "./team-marks.mjs";

const index = buildTeamMarkIndex({
  mlbGames: [
    { homeTeamName: "New York Yankees", homeTeamAbbr: "NYY", awayTeamName: "Colorado Rockies", awayTeamAbbr: "COL" },
    { homeTeamName: "New York Mets", homeTeamAbbr: "NYM", awayTeamName: "Miami Marlins", awayTeamAbbr: "MIA" },
    { homeTeamName: "Atlanta Braves", homeTeamAbbr: "ATL", awayTeamName: "Tampa Bay Rays", awayTeamAbbr: "TB" },
    { homeTeamName: "Philadelphia Phillies", homeTeamAbbr: "PHI", awayTeamName: "Houston Astros", awayTeamAbbr: "HOU" },
  ],
  nflRows: [{ home: { name: "Seattle Seahawks", abbr: "SEA" }, away: { name: "New England Patriots", abbr: "NE" } }],
});

test("the index is built from the feed's own name/abbr pairing", () => {
  assert.equal(index.get(normaliseTeam("New York Yankees")).abbr, "nyy");
  assert.equal(index.get(normaliseTeam("New York Yankees")).sport, "mlb");
  assert.equal(index.get(normaliseTeam("Seattle Seahawks")).sport, "nfl");
});

test("THE BUG · a real Bank Builder selection resolves to its team", () => {
  // Exactly the legs that rendered with a soccer ball on 2026-09-10.
  assert.equal(resolveTeamMark("New York Yankees to win", index).abbr, "nyy");
  assert.equal(resolveTeamMark("Tampa Bay Rays +1.5", index).abbr, "tb");
  assert.equal(resolveTeamMark("Houston Astros +1.5", index).abbr, "hou");
});

test("the LONGEST match wins — a shared prefix must not put the wrong crest on a row", () => {
  // "New York Mets" contains no substring trap, but "New York Yankees" and "New York Mets" both
  // start the same way. A naive first-match would be a coin flip on which logo appears.
  assert.equal(resolveTeamMark("New York Mets to win", index).abbr, "nym");
  assert.equal(resolveTeamMark("New York Yankees to win", index).abbr, "nyy");
});

test("an unknown team resolves to NULL rather than something plausible", () => {
  assert.equal(resolveTeamMark("Boston Red Sox to win", index), null, "not in today's index — no crest");
  assert.equal(resolveTeamMark("Over 8.5", index), null);
  assert.equal(resolveTeamMark("", index), null);
  assert.equal(resolveTeamMark("Yankees to win", null), null, "no index, no guess");
});

test("very short keys are refused as substring matches", () => {
  // A two- or three-letter key would match inside unrelated prose ("TB" inside "TBD").
  const tiny = buildTeamMarkIndex({ mlbGames: [{ homeTeamName: "TB", homeTeamAbbr: "TB" }] });
  assert.equal(resolveTeamMark("TBD starter", tiny), null);
});

test("a matchup yields both clubs, in order", () => {
  const m = resolveMatchupMarks("Colorado Rockies @ New York Yankees", index);
  assert.equal(m.away.abbr, "col");
  assert.equal(m.home.abbr, "nyy");
  assert.equal(resolveMatchupMarks("Tampa Bay Rays vs Atlanta Braves", index).home.abbr, "atl");
  // Half-resolvable is not resolvable: one known club and one unknown yields nothing rather than
  // a row wearing a single crest that reads as the whole game.
  assert.equal(resolveMatchupMarks("Boston Red Sox @ New York Yankees", index), null);
  assert.equal(resolveMatchupMarks("not a matchup", index), null);
});

test("normalisation ignores punctuation and case", () => {
  assert.equal(normaliseTeam("St. Louis Cardinals"), "stlouiscardinals");
  assert.equal(normaliseTeam("  new york   YANKEES "), "newyorkyankees");
});

test("abbreviations resolve EXACTLY — and only exactly", () => {
  // Half the surfaces here render "DET @ IND" rather than full club names.
  const idx = buildTeamMarkIndex({
    mlbGames: [{ homeTeamName: "Tampa Bay Rays", homeTeamAbbr: "TB", awayTeamName: "Atlanta Braves", awayTeamAbbr: "ATL" }],
    nflRows: [{ home: { name: "Indianapolis Colts", abbr: "IND" }, away: { name: "Detroit Lions", abbr: "DET" } }],
  });
  assert.equal(resolveTeamMark("DET", idx).name, "Detroit Lions");
  assert.equal(resolveTeamMark("tb", idx).name, "Tampa Bay Rays");
  assert.equal(resolveMatchupMarks("DET @ IND", idx).home.abbr, "ind");
  // …but a short abbreviation must never match as a SUBSTRING, or "TBD" wears a Rays crest.
  assert.equal(resolveTeamMark("TBD starter", idx), null);
  assert.equal(resolveTeamMark("INDoor game", idx), null);
});

test("a matchup splits on 'at' as well as '@' and 'vs'", () => {
  // The sports hub writes "Colorado Rockies at New York Yankees"; the boards write "X @ Y".
  const m = resolveMatchupMarks("Colorado Rockies at New York Yankees", index);
  assert.equal(m.away.abbr, "col");
  assert.equal(m.home.abbr, "nyy");
  // …and 'at' inside a club name must not split it. "Atlanta" starts with "at" but the separator
  // needs surrounding whitespace, so this still resolves as one club per side.
  const a = resolveMatchupMarks("Tampa Bay Rays at Atlanta Braves", index);
  assert.equal(a.home.abbr, "atl");
});
