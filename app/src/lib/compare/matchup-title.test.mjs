/**
 * Matchup titles must identify their game (v1.8 · UX-1).
 *
 * Measured before the fix: 93 committed MLB matchups, **38 distinct titles**. This pins the property over
 * the REAL committed entries, not a fixture, because the collision was only visible when all 93 were
 * counted together.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { matchupTitles } from "./matchup-title.mjs";
import { matchupEntries, compareTeams } from "./compare-store";
import { formatGameDate } from "../research-pages/format.mjs";

const titlesFor = (sport) => {
  const entries = matchupEntries(sport);
  const teams = compareTeams(sport);
  const describe = (e) => `${teams.get(e.awayTeamId)?.name} at ${teams.get(e.homeTeamId)?.name}`;
  return { entries, titles: matchupTitles(entries, describe, formatGameDate) };
};

test("every committed matchup title is unique within its sport", () => {
  for (const sport of ["MLB", "NFL"]) {
    const { entries, titles } = titlesFor(sport);
    if (!entries.length) continue;
    const distinct = new Set(titles.values()).size;
    assert.equal(distinct, entries.length,
      `${sport}: ${entries.length} matchups collapse to ${distinct} titles — a reader cannot tell them apart from a tab or a search result`);
  }
});

test("POSITIVE CONTROL: without the date they really do collide, so the date is doing the work", () => {
  const { entries } = titlesFor("MLB");
  assert.ok(entries.length > 50, "there must be a real MLB set, or this control proves nothing");
  const teams = compareTeams("MLB");
  const teamsOnly = new Set(entries.map((e) => `${teams.get(e.awayTeamId)?.name} at ${teams.get(e.homeTeamId)?.name}`));
  assert.ok(teamsOnly.size < entries.length / 2,
    `teams alone must collide heavily (got ${teamsOnly.size} of ${entries.length}) — otherwise this fix is solving nothing`);
});

test("a game number appears ONLY for a real doubleheader", () => {
  const { entries, titles } = titlesFor("MLB");
  const numbered = [...titles.values()].filter((t) => / · Game \d+$/.test(t));
  // Every numbered title must have a sibling sharing its base.
  for (const t of numbered) {
    const base = t.replace(/ · Game \d+$/, "");
    const siblings = [...titles.values()].filter((x) => x.startsWith(`${base} · Game `));
    assert.ok(siblings.length > 1, `"${t}" claims a game number with no sibling — that asserts a second game that does not exist`);
  }
  assert.ok(numbered.length % 2 === 0 || numbered.length === 0, "doubleheaders come in pairs");
  assert.ok(numbered.length < entries.length * 0.1,
    `only genuine doubleheaders should be numbered (got ${numbered.length} of ${entries.length})`);
});

test("ordering is stable and starts at the earlier game", () => {
  const rows = [
    { gameId: "B", startUtc: "2026-09-22T23:05:00Z" },
    { gameId: "A", startUtc: "2026-09-22T17:05:00Z" },
  ];
  const t = matchupTitles(rows, () => "X at Y", () => "Sep 22, 2026");
  assert.equal(t.get("A"), "X at Y, Sep 22, 2026 · Game 1", "the earlier start is Game 1 regardless of input order");
  assert.equal(t.get("B"), "X at Y, Sep 22, 2026 · Game 2");
  // NEGATIVE CONTROL: a lone game takes no number at all.
  const solo = matchupTitles([{ gameId: "A", startUtc: "2026-09-22T17:05:00Z" }], () => "X at Y", () => "Sep 22, 2026");
  assert.equal(solo.get("A"), "X at Y, Sep 22, 2026");
});
