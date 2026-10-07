/**
 * Stage 13 prep (Soccer R3): one match is one question however often its provider id changes. Pins rules on a
 * fixture (committed rows copied verbatim plus marked synthetic rows), never on live totals.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalMatchKey, providerIdIndex, canonicalStarts, augMaySeason, singleTableRefusal } from "./canonical-match.mjs";

const FX = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "__fixtures__/canonical-match.json"), "utf8"));

test("an EPL match re-slotted from 14:00 Sat to 13:00 Sun keeps ONE key across both published ids", () => {
  const { byId, aliases, conflicts } = providerIdIndex(FX.eplForecastCopies);
  assert.equal(conflicts.length, 0);
  const keys = new Set(byId.values());
  assert.deepEqual([...keys], ["soccer:epl:2026-27:sunderland~fulham"]);
  assert.deepEqual(aliases.get("soccer:epl:2026-27:sunderland~fulham"), ["soccer:epl:fulham-v-sunderland:20260829t1400", "soccer:epl:fulham-v-sunderland:20260830t1300"]);
});

test("the reverse fixture (Fulham at home in April) is a different match, though its derived id shares the prefix", () => {
  const rows = FX.eplCaptures.flatMap((c) => c.rows.map((r) => ({ ...r, league: c.league, season: c.season })));
  const { aliases } = providerIdIndex(rows);
  assert.deepEqual([...aliases.keys()].sort(), ["soccer:epl:2026-27:fulham~sunderland", "soccer:epl:2026-27:sunderland~fulham"]);
});

test("the canonical start is the latest capture's kickoff, so 3A's cut-off is the actual start, not the copy's own", () => {
  const starts = canonicalStarts(FX.eplCaptures);
  assert.equal(starts.get("soccer:epl:2026-27:sunderland~fulham"), "2026-08-30T13:00:00.000Z");
  assert.equal(starts.get("soccer:epl:2026-27:fulham~sunderland"), "2027-04-17T12:00:00.000Z");
});

test("R3: a postponed match has NO start until it is re-dated (pending, never a loss), then the new date", () => {
  const caps = FX.postponed.captures;
  assert.equal(canonicalStarts(caps.slice(0, 2)).get("soccer:epl:2026-27:arsenal~leeds"), null, "postponed, no new date yet");
  assert.equal(canonicalStarts(caps).get("soccer:epl:2026-27:arsenal~leeds"), "2026-12-16T19:30:00.000Z");
  assert.equal(canonicalStarts([caps[2], caps[0]]).get("soccer:epl:2026-27:arsenal~leeds"), "2026-12-16T19:30:00.000Z", "capture order never matters, capturedAt does");
});

test("registry aliases make ESPN and corpus spellings one club", () => {
  assert.equal(canonicalMatchKey(FX.ligue1).key, "soccer:ligue-1:2026-27:marseille~paris-sg");
  assert.equal(canonicalMatchKey({ ...FX.ligue1, awayClub: "Paris SG" }).key, "soccer:ligue-1:2026-27:marseille~paris-sg");
  assert.equal(canonicalMatchKey({ league: "epl", homeClub: "Brighton & Hove Albion", awayClub: "Chelsea", kickoffUtc: "2026-08-30T13:00:00Z" }).key, "soccer:epl:2026-27:brighton~chelsea");
});

test("anything that is not provably single-table is refused (Q5: excluded and disclosed, never guessed)", () => {
  for (const k of ["ucl", "uel", "world-cup", "mls", "championship"]) assert.ok(singleTableRefusal(k), `${k} must be refused`);
  for (const k of ["epl", "ligue-1", "laliga", "serie-a", "bundesliga"]) assert.equal(singleTableRefusal(k), null, `${k} is single-table`);
  assert.equal(canonicalMatchKey({ league: "ucl", homeClub: "A", awayClub: "B", kickoffUtc: "2026-10-01T19:00:00Z" }).ok, false);
  assert.equal(canonicalMatchKey({ league: "epl", homeClub: "Arsenal", awayClub: "", kickoffUtc: "2026-10-01T19:00:00Z" }).ok, false);
  assert.equal(canonicalMatchKey({ league: "epl", homeClub: "Arsenal", awayClub: "Arsenal", kickoffUtc: "2026-10-01T19:00:00Z" }).ok, false);
  assert.equal(canonicalMatchKey({ league: "epl", homeClub: "Arsenal", awayClub: "Leeds" }).ok, false, "no season, no kickoff");
});

test("a provider id that points at two different matches is a conflict and maps to nothing", () => {
  const { byId, conflicts } = providerIdIndex([
    { league: "ligue-1", eventId: "soccer:ligue-1:1", homeClub: "Lyon", awayClub: "Nice", kickoffUtc: "2026-10-10T18:45:00Z" },
    { league: "ligue-1", eventId: "soccer:ligue-1:1", homeClub: "Nice", awayClub: "Lyon", kickoffUtc: "2026-10-10T18:45:00Z" },
  ]);
  assert.equal(byId.size, 0);
  assert.equal(conflicts.length, 1);
});

test("season labels follow the Aug–May calendar", () => {
  assert.equal(augMaySeason("2026-08-21T19:00:00Z"), "2026-27");
  assert.equal(augMaySeason("2027-05-23T15:00:00Z"), "2026-27");
  assert.equal(augMaySeason("nope"), null);
});
