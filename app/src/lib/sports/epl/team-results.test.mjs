/**
 * Batch 1 · #8 — EPL team pages show each club's recorded 2026-27 results (date, opponent, home/away, final score, W/D/L),
 * newest first, from the same graded ledger the /epl hub reads; fixtures stay. Scores are checked against the hub's
 * archive data (lib/sports/epl/graded-record.ts loadEplGradedRecord).
 *
 * Run (from app/): npx tsx --test src/lib/sports/epl/team-results.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { eplTeamResults } from "./team-results.mjs";
import { loadEplGradedRecord } from "./graded-record.ts";
import { researchIndex, teamBySlug } from "../../research-pages/projection-store.ts";
import { COVERAGE_COPY, coverageNoteText, eplTeamCoverageWithResults } from "../../research-pages/coverage.mjs";

globalThis.React = React;
const text = (h) => h.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ");

const LEDGER = loadEplGradedRecord()?.team.matchesList ?? [];
const TEAMS = researchIndex().filter((e) => e.kind === "team" && e.sport === "EPL").map((e) => teamBySlug("EPL", e.slug)).filter(Boolean);

test("unit: perspective, W/D/L, newest first; a row whose side disagrees with the matchup is dropped, not guessed", () => {
  const games = [
    ["e1", "2026-08-21T19:00:00Z", "EPL-2026-27", "H", "t2", "S", null, null, null],
    ["e2", "2026-08-28T14:00:00Z", "EPL-2026-27", "A", "t3", "S", null, null, null],
    ["e3", "2026-09-04T14:00:00Z", "EPL-2026-27", "A", "t4", "S", null, null, null],
    ["e4", "2026-09-11T14:00:00Z", "EPL-2026-27", "H", "t5", "S", null, null, null], // wrong side in the ledger
    ["e5", "2027-05-01T14:00:00Z", "EPL-2026-27", "H", "t6", "S", null, null, null], // not played
  ];
  const ledger = [
    { eventId: "e1", matchup: "Club v Two", kickoffUtc: "2026-08-21T19:00:00Z", actual: { homeGoalsFT: 3, awayGoalsFT: 0 } },
    { eventId: "e2", matchup: "Three v Club", kickoffUtc: "2026-08-28T14:00:00Z", actual: { homeGoalsFT: 2, awayGoalsFT: 1 } },
    { eventId: "e3", matchup: "Four v Club", kickoffUtc: "2026-09-04T14:00:00Z", actual: { homeGoalsFT: 1, awayGoalsFT: 1 } },
    { eventId: "e4", matchup: "Five v Club", kickoffUtc: "2026-09-11T14:00:00Z", actual: { homeGoalsFT: 0, awayGoalsFT: 2 } },
  ];
  const out = eplTeamResults({ teamName: "Club", games, ledger });
  assert.deepEqual(out.rows.map((r) => [r.eventId, r.ha, r.own, r.opp, r.result, r.opponentId]), [
    ["e3", "A", 1, 1, "D", "t4"],
    ["e2", "A", 1, 2, "L", "t3"],
    ["e1", "H", 3, 0, "W", "t2"],
  ]);
  assert.equal(out.mismatched, 1);
  assert.deepEqual(out.record, { w: 1, d: 1, l: 1, played: 3, scored: 5, conceded: 3 });
  assert.deepEqual(eplTeamResults({ teamName: "Club", games, ledger: [] }).rows, []);
});

test("committed data: every graded match joins BOTH clubs' pages by event id, with no side mismatch", () => {
  assert.ok(LEDGER.length > 0, "the hub's graded ledger is readable");
  assert.equal(TEAMS.length, 20);
  let total = 0;
  for (const t of TEAMS) {
    const out = eplTeamResults({ teamName: t.name, games: t.games, ledger: LEDGER });
    assert.equal(out.mismatched, 0, `${t.name}: a ledger side disagrees with the projection's home/away flag`);
    const own = LEDGER.filter((m) => m.matchup.split(" v ").includes(t.name));
    assert.equal(out.rows.length, own.length, `${t.name}: one result per graded match it played`);
    assert.equal(out.record.w + out.record.d + out.record.l, out.record.played);
    for (let i = 1; i < out.rows.length; i++) assert.ok(out.rows[i - 1].kickoffUtc >= out.rows[i].kickoffUtc, "newest first");
    total += out.rows.length;
  }
  assert.equal(total, LEDGER.length * 2, "every graded match appears on exactly two club pages");
});

test("committed data: a sample of scores matches the hub's archive exactly, from both sides", () => {
  const byName = new Map(TEAMS.map((t) => [t.name, t]));
  const sorted = [...LEDGER].sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc));
  const sample = [sorted[0], sorted[Math.floor(sorted.length / 2)], sorted[sorted.length - 1]];
  for (const m of sample) {
    const [home, away] = m.matchup.split(" v ");
    const h = eplTeamResults({ teamName: home, games: byName.get(home).games, ledger: LEDGER }).rows.find((r) => r.eventId === m.eventId);
    const a = eplTeamResults({ teamName: away, games: byName.get(away).games, ledger: LEDGER }).rows.find((r) => r.eventId === m.eventId);
    assert.deepEqual([h.ha, h.own, h.opp], ["H", m.actual.homeGoalsFT, m.actual.awayGoalsFT], `${m.matchup} home side`);
    assert.deepEqual([a.ha, a.own, a.opp], ["A", m.actual.awayGoalsFT, m.actual.homeGoalsFT], `${m.matchup} away side`);
    const want = m.actual.outcome === "H" ? ["W", "L"] : m.actual.outcome === "A" ? ["L", "W"] : ["D", "D"];
    assert.deepEqual([h.result, a.result], want, `${m.matchup}: W/D/L agrees with the ledger's own outcome`);
  }
  /* the first graded Premier League match on this project, pinned literally (the hub's own receipt) */
  const ars = eplTeamResults({ teamName: "Arsenal", games: byName.get("Arsenal").games, ledger: LEDGER }).rows.find((r) => r.eventId === "soccer:epl:arsenal-v-coventry-city:20260821t1900");
  assert.deepEqual([ars.ha, ars.own, ars.opp, ars.result], ["H", 3, 0, "W"]);
});

test("coverage: a club with results says where they come from; with none, the stored no-results note stays", () => {
  const stored = TEAMS[0].coverage;
  assert.deepEqual(eplTeamCoverageWithResults(stored, 0), stored);
  const cov = eplTeamCoverageWithResults(stored, 3);
  assert.ok(!cov.notes.includes("EPL_TEAM_NO_RESULTS") && cov.notes.includes("EPL_TEAM_CURRENT_RESULTS"));
  assert.ok(cov.available.includes("CURRENT_RESULTS") && !cov.unavailable.includes("RESULTS_UNAVAILABLE") && cov.unavailable.includes("EARLIER_RESULTS"));
  assert.doesNotMatch(COVERAGE_COPY.EPL_TEAM_CURRENT_RESULTS, /career|all-time|complete history|espn|openfootball/i);
  assert.match(coverageNoteText("EPL_TEAM_CURRENT_RESULTS", cov), /Earlier seasons show fixtures only/);
});

test("the rendered club page lists its results newest first, keeps its fixtures, and drops the 'no results' copy", async () => {
  const { default: Page } = await import("../../../app/teams/[sport]/[slug]/page.tsx");
  const t = TEAMS.find((x) => x.slug === "arsenal");
  const out = eplTeamResults({ teamName: t.name, games: t.games, ledger: LEDGER });
  const html = renderToStaticMarkup(React.createElement(Page, { params: { sport: "epl", slug: "arsenal" } }));
  const body = text(html);
  assert.match(html, /data-epl-team-results=""/);
  const ids = [...html.matchAll(/data-result-id="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(ids, out.rows.map((r) => r.eventId), "every recorded result, newest first");
  assert.ok(body.includes(`${out.record.played} played · ${out.record.w} won, ${out.record.d} drawn, ${out.record.l} lost`));
  assert.ok(!body.includes(COVERAGE_COPY.EPL_TEAM_NO_RESULTS), "the page no longer says results are unavailable");
  assert.ok(body.includes(COVERAGE_COPY.EPL_TEAM_CURRENT_RESULTS));
  assert.match(body, /Upcoming fixtures/, "fixtures stay");
  assert.match(body, /Fixture history/);
  const first = out.rows[0];
  assert.ok(body.includes(`${first.own}–${first.opp}`));
});
