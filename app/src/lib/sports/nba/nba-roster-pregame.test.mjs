/**
 * NBA pregame roster re-capture (founder 11-11, NBA operations): its place in nba-forecast-window, the alert, one commit
 * per capture, no new trigger — and freshness: on a fixture slate every pregame build reads a roster younger than
 * eligibility@1's build window. SYNTHETIC fixtures for the freshness half.
 *
 * Run: cd app && npx tsx --test src/lib/sports/nba/nba-roster-pregame.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { rosterRecaptureDecision, slateInProgress } from "./roster-recapture.mjs";
import { BUILD_MAX_AGE_HOURS, resolveEligibility } from "../../availability/eligibility.mjs";

const WINDOW = path.resolve(process.cwd(), "..", ".github", "workflows", "nba-forecast-window.yml");
const body = fs.readFileSync(WINDOW, "utf8").replace(/^\s*#.*$/gm, "");
const step = (name) => { const i = body.indexOf(`- name: ${name}`); assert.ok(i > 0, `step "${name}"`); const j = body.indexOf("\n      - name:", i + 1); return body.slice(i, j < 0 ? undefined : j); };
const ROSTER = step("Pregame NBA roster re-capture (slate days)");
const BUILD = step("Capture injuries, build the owed forecasts, verify, commit");
const COMMIT = step("Commit the pregame NBA roster (runs with no forecast commit)");
const ALERT = step("Alert when the pregame roster re-capture failed");
const at = (s) => body.indexOf(`- name: ${s}`);

test("placement: inside nba-forecast-window, after the decision and before the forecast build; every tick, slate days decided in code", () => {
  assert.ok(at("Is a pre-tip NBA forecast owed?") < at("Pregame NBA roster re-capture (slate days)"));
  assert.ok(at("Pregame NBA roster re-capture (slate days)") < at("Capture injuries, build the owed forecasts, verify, commit"));
  assert.match(ROSTER, /if: github\.event\.inputs\.dry_run != 'true'\n\s+continue-on-error: true/, "never fails the window");
  assert.match(ROSTER, /DUE="\$\(node scripts\/nba\/roster-recapture-due\.mjs --now "\$NOW"\)"/);
  assert.match(ROSTER, /if \[ "\$\{DUE%% \*\}" != "due" \]; then exit 0; fi\n\s+node scripts\/nba\/capture-nba-rosters\.mjs --now "\$NOW"/);
  assert.doesNotMatch(ROSTER, /git (add|commit|push)/, "the capture step commits nothing itself");
  // the build step restores it after every reset, before injuries and every forecast build, and never re-captures
  const reset = BUILD.indexOf("git reset -q --hard origin/main"), restore = BUILD.indexOf('cp "$RUNNER_TEMP/nba-roster/latest.json"');
  assert.ok(reset > 0 && restore > reset && restore < BUILD.indexOf("capture-injuries.mjs") && restore < BUILD.indexOf("build-nba-experimental-forecasts.mjs"));
  assert.doesNotMatch(BUILD, /capture-nba-rosters\.mjs|ROSTER_AGE_H|-gt 30/, "no second capture; the old 30 h backstop is gone");
});

test("one commit per capture: the forecast commit carries it; a run with no forecast commit commits the roster files alone", () => {
  assert.equal((BUILD.match(/git commit /g) ?? []).length, 1);
  const staged = BUILD.indexOf('if [ "$ROSTER_CAPTURED" = "1" ]; then');
  assert.ok(staged > BUILD.indexOf("verify-nba-forecast-receipts.mjs --against HEAD") && staged < BUILD.indexOf("git commit "));
  assert.match(BUILD, /echo "committed=1" >> "\$GITHUB_OUTPUT"; exit 0; fi/);
  assert.match(COMMIT, /if: \$\{\{ !cancelled\(\) && steps\.roster\.outputs\.captured == '1' && steps\.build\.outputs\.committed != '1' && github\.event\.inputs\.dry_run != 'true' \}\}/, "only when no forecast commit carried it");
  assert.equal((COMMIT.match(/git add /g) ?? []).length, 1);
  assert.match(COMMIT, /git add \.\.\/data\/internal\/research\/nba\/rosters\/latest\.json "\.\.\/data\/internal\/research\/nba\/rosters\/\$ROSTER_DATED"\n/, "roster files only");
  assert.equal((COMMIT.match(/git commit /g) ?? []).length, 1);
  // the triggers are the window's own (no cron, no workflow added)
  const triggers = body.slice(body.indexOf("\non:"), body.indexOf("\nconcurrency:"));
  assert.deepEqual([...triggers.matchAll(/cron: "([^"]+)"/g)].map((m) => m[1]), ["17 * * * *", "4,34 10,11 * * *"]);
});

test("alert: a failed capture raises ops_alert.sh (warning) and commits nothing; the build reads the committed roster", () => {
  assert.match(ALERT, /if: \$\{\{ !cancelled\(\) && steps\.roster\.outcome == 'failure' \}\}/);
  assert.match(ALERT, /OPS_WEBHOOK_URL: \$\{\{ secrets\.OPS_WEBHOOK_URL \}\}/);
  assert.match(ALERT, /OPS_ALERT_KIND: warning/);
  assert.match(ALERT, /bash scripts\/ops_alert\.sh/);
  assert.doesNotMatch(ALERT, /git (add|commit|push)/);
  assert.ok(at("Alert when the pregame roster re-capture failed") > at("Pregame NBA roster re-capture (slate days)"));
});

/** SYNTHETIC roster capture (the research capture's shape) with one active player, and a fixture slate. */
const roster = (capturedAt) => ({ capturedAt, asOf: capturedAt, teams: [{ providerTeamId: "1", players: [{ providerAthleteId: "p1", status: { type: "active" } }] }] });
const SLATE = [
  { dateUtc: "2026-11-12T00:00Z", statusRaw: "STATUS_SCHEDULED" },
  { dateUtc: "2026-11-12T00:30Z", statusRaw: "STATUS_SCHEDULED" },
  { dateUtc: "2026-11-12T03:00Z", statusRaw: "STATUS_SCHEDULED" },
  { dateUtc: "2026-11-12T03:30Z", statusRaw: "STATUS_SCHEDULED" }, // late West Coast game (ET 2026-11-11)
  { dateUtc: "2026-11-13T00:00Z", statusRaw: "STATUS_SCHEDULED" }, // next slate
];

test("slate in progress: today's ET slate and its last tip; none on an off day", () => {
  assert.deepEqual(slateInProgress(SLATE, "2026-11-11T22:17:00Z"), { date: "2026-11-11", lastTipUtc: "2026-11-12T03:30Z" });
  assert.deepEqual(slateInProgress(SLATE, "2026-11-12T02:00:00Z"), { date: "2026-11-11", lastTipUtc: "2026-11-12T03:30Z" });
  assert.deepEqual(slateInProgress(SLATE, "2026-11-12T12:00:00Z"), { date: "2026-11-12", lastTipUtc: "2026-11-13T00:00Z" }, "a game tips this ET evening");
  const offDay = SLATE.slice(0, 4); // no game on ET 2026-11-12
  assert.equal(slateInProgress(offDay, "2026-11-12T12:00:00Z"), null, "no game on today's ET date: not a slate day");
  assert.equal(rosterRecaptureDecision({ roster: roster("2026-11-11T00:00:00Z"), now: "2026-11-12T12:00:00Z", scheduleRows: offDay }).reason, "NOT_A_SLATE_DAY");
});

test("freshness on a fixture slate: the window's build reads < 6 h at every tick, and from the daily capture to the last tip", () => {
  assert.equal(BUILD_MAX_AGE_HOURS, 6);
  let committed = roster("2026-11-11T09:00:00Z"); // an early capture, before the window's first tick
  const captures = [];
  const ticks = Array.from({ length: 11 }, (_, i) => `2026-11-11T${String(12 + i).padStart(2, "0")}:17:00Z`); // 12:17 … 22:17 (dependable)
  const events = [...ticks.map((t) => ({ t, kind: "tick" })), { t: "2026-11-11T17:00:00Z", kind: "daily" }].sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
  const held = []; // [from, capturedAt]
  for (const e of events) {
    if (e.kind === "daily") { committed = roster(e.t); held.push([e.t, e.t]); continue; }
    const d = rosterRecaptureDecision({ roster: committed, now: e.t, scheduleRows: SLATE });
    if (d.due) { committed = roster(e.t); captures.push(`${e.t} ${d.reason}`); held.push([e.t, e.t]); }
    const ageAtBuild = (Date.parse(e.t) - Date.parse(committed.capturedAt)) / 3600e3;
    assert.ok(ageAtBuild < BUILD_MAX_AGE_HOURS, `the window's build at ${e.t} reads a ${ageAtBuild.toFixed(2)} h roster`);
  }
  // from the daily capture to the slate's last tip, every instant (any Production build) reads < 6 h — no tick needed after 22:17Z
  for (let ms = Date.parse("2026-11-11T17:00:00Z"); ms <= Date.parse("2026-11-12T03:30:00Z"); ms += 15 * 60e3) {
    const cap = held.filter(([t]) => Date.parse(t) <= ms).at(-1)[1];
    const age = (ms - Date.parse(cap)) / 3600e3;
    assert.ok(age < BUILD_MAX_AGE_HOURS, `${new Date(ms).toISOString()}: roster ${age.toFixed(2)} h old`);
  }
  assert.deepEqual(captures, ["2026-11-11T15:17:00Z STALE_NOW", "2026-11-11T22:17:00Z LAST_TIP_COVER"], "two extra captures on this slate day");
});

test("the point of it: eligibility@1 verifies the player with the re-captured roster and not with the daily one", () => {
  const base = { sport: "nba", playerId: "p1", teamId: "1", asOf: "2026-11-11T23:30:00Z", injuries: { generatedAt: "2026-11-11T23:30:00Z", entries: [] } };
  const stale = resolveEligibility({ ...base, roster: roster("2026-11-11T17:00:00Z") });
  const fresh = resolveEligibility({ ...base, roster: roster("2026-11-11T22:17:00Z") });
  assert.notEqual(stale.state, "ELIGIBLE");
  assert.ok(JSON.stringify(stale).includes("ROSTER_STALE"));
  assert.equal(fresh.state, "ELIGIBLE");
});
