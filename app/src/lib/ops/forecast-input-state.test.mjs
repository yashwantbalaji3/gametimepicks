/**
 * DO THE TEAM FORECAST AND THE PLAYER BOARD SEE THE SAME WORLD? (Phase 3B · 2026-09-25)
 *
 * They do not, and the point of these guards is that the gap stays MEASURED rather than becoming
 * folklore. The NFL player boards read participation, injuries, rosters and role shares; the NFL
 * public team forecast reads calibration, schedule, markets and history, and opens no availability
 * artifact at all. So one game can be published from two worlds: Jayden Daniels is Out in our own
 * capture, removed from our own board, and the Washington win probability was computed without it.
 *
 * ⚠ THESE GUARDS DO NOT DEMAND THE GAP BE CLOSED. The team heads are validated Elo models with
 * replay receipts, and giving them an availability term is a model change that needs its own
 * evidence. What they demand is that the exposure is reported honestly — and, if someone later
 * wires availability in, that the report stops claiming blindness.
 *
 * Run: npx tsx --test src/lib/ops/forecast-input-state.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO = path.resolve(process.cwd(), "..");
function run(nowIso) {
  const out = path.join(os.tmpdir(), `fis-${Date.now()}.json`);
  execFileSync("node", [path.join(REPO, "app/scripts/ops/forecast-input-state.mjs"), "--now", nowIso, "--json", path.relative(REPO, out)], { cwd: REPO, encoding: "utf8" });
  return JSON.parse(fs.readFileSync(out, "utf8"));
}

test("the report's claim about each producer matches what that producer actually reads", () => {
  /* The claim is derived from the source, not hardcoded, so it cannot drift from reality. If
     someone gives the team forecast an injuries input, this flips on its own. */
  const r = run(new Date().toISOString());
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
  const AVAIL = /participation|injuries\/|rosters\/latest|role-shares/;

  const team = strip(fs.readFileSync(path.join(REPO, "app/scripts/nfl/build-nfl-public-forecasts.mjs"), "utf8"));
  assert.equal(r.nfl.teamForecastConsumesAvailability, AVAIL.test(team),
    "the report must describe the producer as it is, not as it was when this was written");

  const boards = strip(fs.readFileSync(path.join(REPO, "app/scripts/nfl/build-nfl-player-board.mjs"), "utf8"));
  assert.equal(r.nfl.playerBoardsConsumeAvailability, AVAIL.test(boards));
});

test("a forecast blind to an exclusion is COUNTED, never rounded to coherent", () => {
  const r = run(new Date().toISOString());
  if (!r.events.length) return;
  for (const e of r.events) {
    if (e.availability.consumedByTeamForecast) continue;
    assert.equal(e.coherent, e.availability.excludedCount === 0,
      `${e.matchup}: a team forecast that cannot see availability is coherent ONLY when nothing was excluded`);
  }
  const blind = r.events.filter((e) => !e.coherent).length;
  assert.equal(r.nfl.eventsWhereTeamForecastIsBlindToAnExclusion, blind, "the headline count must equal the rows behind it");
});

test("materiality is derived from the excluded FAMILY, never from a name", () => {
  /*
   * ⚠ A hand-kept list of important players is an opinion that rots. "A quarterback is out" matters
   * because passAttempts is the input the whole offence is projected through, and that is exactly
   * the evidence the participation artifact already carries.
   */
  const src = fs.readFileSync(path.join(REPO, "app/scripts/ops/forecast-input-state.mjs"), "utf8");
  assert.match(src, /MATERIAL_FAMILIES/, "materiality must be a family rule");
  const r = run(new Date().toISOString());
  for (const e of r.events) {
    for (const m of e.availability.materialExclusions) {
      assert.ok(m.families.includes("passAttempts"),
        `${m.name} was called material without holding a material family — materiality must come from the artifact`);
      assert.ok(m.state && m.statedAt, "a material exclusion must carry its status and when it was stated");
    }
  }
});

test("every reported event is genuinely upcoming — a played game is not an exposure", () => {
  /*
   * ⚠ MY FIRST VERSION OF THIS WAS VACUOUS and the probe caught it: the committed forecast artifact
   * only holds the current week, so deleting the kickoff filter changed nothing and the test stayed
   * green. Advancing the CLOCK past the whole slate tests the filter itself rather than the data —
   * if a played game can still be reported, this now fails regardless of what the artifact holds.
   */
  const now = new Date().toISOString();
  const r = run(now);
  for (const e of r.events) {
    assert.ok(Date.parse(e.kickoffUtc) > Date.parse(now),
      `${e.matchup} has already kicked off; reporting it would inflate the exposure with games nobody can act on`);
  }
  if (!r.events.length) return;
  const latest = Math.max(...r.events.map((e) => Date.parse(e.kickoffUtc)));
  const after = run(new Date(latest + 24 * 3600_000).toISOString());
  assert.deepEqual(after.events, [],
    "with the clock past every kickoff the exposure is empty — a report that still lists them is counting games that have been played");
  assert.equal(after.nfl.eventsWhereTeamForecastIsBlindToAnExclusion, 0);
});

test("the forecast snapshot is identified, so a reader can tell WHICH forecast was blind", () => {
  const r = run(new Date().toISOString());
  if (!r.events.length) return;
  for (const e of r.events) {
    const s = e.forecastSnapshot;
    assert.ok(s.model, "a forecast must name its model");
    assert.ok(s.inputHash, "a forecast must carry its input hash, or the audit cannot be tied to a run");
    assert.ok(s.generatedAt, "a forecast must carry when it was generated");
  }
});

test("the audit runs beside the forecast, and its output is already carried by the commit step", () => {
  /*
   * ⚠ A MEASUREMENT OLDER THAN WHAT IT DESCRIBES IS WORSE THAN NONE. If this ran on its own cadence
   * it would eventually report yesterday's exposure against today's forecast, which is the shape of
   * every stale-artifact incident in this repo. It runs inside the step that builds the forecast.
   *
   * And the output path must be inside something the commit step adds — a report generated and
   * discarded every run is the 62-hour-outage shape.
   */
  const wf = fs.readFileSync(path.join(REPO, ".github/workflows/nfl-event-window.yml"), "utf8");
  const m = /- name: Generate public-beta NFL forecasts[\s\S]*?\n      - name:/.exec(wf);
  assert.ok(m, "the forecast generation step must still exist");
  /* ⚠ SHELL COMMENTS OUT FIRST. Commenting the invocation left the filename in the file, so the
     naive match stayed green while the audit no longer ran — the same mention-versus-call trap that
     tripped sync-guards earlier today, in the other direction. */
  const runnable = m[0].split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
  assert.match(runnable, /node .*forecast-input-state\.mjs/,
    "the audit must be INVOKED in the same step as the forecast it describes, not merely named there");
  assert.match(m[0], /data\/internal\/research\/nfl\/reports\/forecast-input-state\.json/,
    "it must write under reports/, which the window's commit step already adds");
  const add = /git add ([^\n]*data\/internal\/research\/nfl\/reports\/[^\n]*)/.exec(wf);
  assert.ok(add, "the commit step must still carry data/internal/research/nfl/reports/");
});
