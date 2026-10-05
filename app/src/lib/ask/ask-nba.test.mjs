/**
 * ASK · NBA SCHEDULE AND FINALS (2026-10-05, NBA audit X3) — "who won Heat–Raptors?", "when do the Celtics play?".
 *
 * Facts only. The tool reads the schedule capture and the write-once finals record; it holds no forecast field, and a
 * game whose day has passed without a recorded final is pending, never a loss.
 *
 * Run: cd app && npx tsx --test src/lib/ask/ask-nba.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";

import { getNbaGames, matchNbaTeams } from "./tools/nba.mjs";
import { buildEvidence } from "./evidence.mjs";
import { verifyAnswer } from "./verifier.mjs";
import { ASK_ERROR, ASK_STATUS, askAssetPath, isApprovedLink } from "./contract.mjs";
import { ASK_TOOLS } from "./registry.mjs";

const T = (name, ...abbrs) => ({ name, abbrs });
const side = (name, abbr) => ({ name, abbr });
const DOC = {
  schemaVersion: 1, artifact: "ask-nba", available: true, season: "2026-27",
  scheduleAsOf: "2026-10-05T15:47:36Z", finalsAsOf: "2026-10-05T15:47:45Z",
  teams: [T("Boston Celtics", "BOS"), T("LA Clippers", "LAC"), T("Los Angeles Lakers", "LAL"), T("Miami Heat", "MIA"), T("Portland Trail Blazers", "POR"), T("Toronto Raptors", "TOR"), T("Utah Jazz", "UTA", "UTAH"), T("Sacramento Kings", "SAC")],
  finals: [
    { id: "401914127", dateEt: "2026-10-04", phase: "PRESEASON", away: side("Utah Jazz", "UTA"), home: side("Denver Nuggets", "DEN"), awayScore: 109, homeScore: 97 },
    { id: "401902644", dateEt: "2026-10-03", phase: "PRESEASON", away: side("Miami Heat", "MIA"), home: side("Toronto Raptors", "TOR"), awayScore: 129, homeScore: 105 },
  ],
  schedule: [
    { id: "1", dateEt: "2026-10-04", timeEt: "7:00 PM", phase: "PRESEASON", away: side("Boston Celtics", "BOS"), home: side("Toronto Raptors", "TOR"), venue: "Scotiabank Arena" },
    { id: "2", dateEt: "2026-10-08", timeEt: "7:30 PM", phase: "PRESEASON", away: side("Boston Celtics", "BOS"), home: side("Miami Heat", "MIA"), venue: null },
    { id: "3", dateEt: "2026-10-21", timeEt: "7:30 PM", phase: "REGULAR_SEASON", away: side("Utah Jazz", "UTAH"), home: side("LA Clippers", "LAC"), venue: "Intuit Dome" },
  ],
};
const ctx = (doc = DOC) => ({
  now: () => new Date("2026-10-05T16:00:00Z"),
  turn: { load: async (p) => (p === askAssetPath.nba() ? { ok: true, json: doc } : { ok: false }) },
});
const text = (env) => buildEvidence([{ tool: "getNbaGames", status: env.status, error: env.error, detail: env.detail, links: env.links, data: env }]).facts.map((f) => f.text).join(" | ");

test("team names match by full name, abbreviation, nickname or a longer form of the nickname", () => {
  const one = (q) => matchNbaTeams(q, DOC.teams).map((t) => t.name);
  assert.deepEqual(one("Celtics"), ["Boston Celtics"]);
  assert.deepEqual(one("BOS"), ["Boston Celtics"]);
  assert.deepEqual(one("trail blazers"), ["Portland Trail Blazers"]);
  assert.deepEqual(one("UTAH"), ["Utah Jazz"], "the schedule's abbreviation");
  assert.deepEqual(one("UTA"), ["Utah Jazz"], "and the finals record's");
  assert.deepEqual(one("Los Angeles Clippers"), ["LA Clippers"]);
  assert.deepEqual(one("Angeles"), [], "a fragment that is not a name ending matches nothing");
});

test("'who won Heat–Raptors?' returns the recorded final, written so no score reads as a W–L", async () => {
  const env = await getNbaGames({ team: "Heat", opponent: "Raptors", show: "finals" }, ctx());
  assert.equal(env.status, ASK_STATUS.OK);
  assert.equal(env.finalsMatched, 1);
  const t = text(env);
  assert.match(t, /2026-10-03 \(preseason\) — final: Miami Heat 129, Toronto Raptors 105 \(at Toronto Raptors\)/);
  assert.doesNotMatch(t, /129[–-]105/);
  assert.match(t, /the NBA has no GameTime forecast, pick or probability/);
  const ok = verifyAnswer("The Miami Heat beat the Toronto Raptors 129-105 in Toronto on Oct. 3, a preseason game.", buildEvidence([{ tool: "getNbaGames", status: env.status, data: env, links: env.links }]), {});
  assert.equal(ok.ok, true, JSON.stringify(ok.violations));
});

test("'when do the Celtics play?' lists upcoming games from the product date, and a passed game with no final is pending", async () => {
  const env = await getNbaGames({ team: "Celtics" }, ctx());
  assert.deepEqual(env.scheduled.map((g) => g.id), ["2"], "upcoming means on or after today (ET)");
  assert.deepEqual(env.pending.map((g) => g.id), ["1"], "Oct 4 passed with no recorded final");
  const t = text(env);
  assert.match(t, /2026-10-08 at 7:30 PM ET \(preseason\) — Boston Celtics at Miami Heat/);
  assert.match(t, /Boston Celtics at Toronto Raptors: no final is recorded yet, so it is pending \(not a loss\)/);
});

test("a date narrows to that ET day, and an empty day says so instead of inventing one", async () => {
  const env = await getNbaGames({ date: "2026-10-21", show: "schedule" }, ctx());
  assert.deepEqual(env.scheduled.map((g) => g.id), ["3"]);
  const none = await getNbaGames({ team: "Lakers", show: "finals" }, ctx());
  assert.equal(none.status, ASK_STATUS.OK);
  assert.match(text(none), /holds no final for Los Angeles Lakers.*pending, not a loss/);
});

test("FAIL CLOSED: an unknown team is not found, a shared word is a question, a missing record is not published", async () => {
  const unknown = await getNbaGames({ team: "Sonics" }, ctx());
  assert.equal(unknown.status, ASK_STATUS.UNSUPPORTED);
  assert.equal(unknown.error, ASK_ERROR.ENTITY_NOT_FOUND);
  const kings = { ...DOC, teams: [...DOC.teams, T("Kansas City Kings", "KCK")] };
  const amb = await getNbaGames({ team: "Kings" }, ctx(kings));
  assert.equal(amb.error, ASK_ERROR.AMBIGUOUS_ENTITY);
  assert.deepEqual(amb.candidates.sort(), ["Kansas City Kings", "Sacramento Kings"]);
  const off = await getNbaGames({ team: "Heat" }, ctx({ available: false }));
  assert.equal(off.status, ASK_STATUS.UNSUPPORTED);
});

test("the tool cannot carry a forecast: no argument and no returned field names one", async () => {
  const argNames = Object.keys(ASK_TOOLS.getNbaGames.args);
  assert.ok(!argNames.some((a) => /prob|odds|line|pick|forecast|projection|predict/i.test(a)), argNames.join(", "));
  const env = await getNbaGames({ team: "Heat" }, ctx());
  const keys = JSON.stringify(env).match(/"[A-Za-z]+":/g).map((k) => k.slice(1, -2));
  assert.ok(!keys.some((k) => /prob|odds|line|pick|forecast|projection|predict/i.test(k)), [...new Set(keys)].join(", "));
  assert.ok(env.links.every((l) => isApprovedLink(l.href)), "its /nba/ link is approved");
});
