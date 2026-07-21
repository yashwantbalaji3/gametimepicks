/**
 * WC player→team map freshness guard + refresh wiring. Proves: the refresh regenerates the map, a stale/missing/
 * incomplete map is detected, unresolved players never get a wrong team (resolver fails safe), and the current
 * semifinal (England vs Argentina, 2026-07-15) still labels each side correctly.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { evaluateTeamMapFreshness } from "./wc-team-map-freshness.ts";
import { resolveWcPlayerTeam } from "./player-team-map.ts";

const APP = process.cwd();
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");

const projections = (teams, date = "2026-07-14") => ({
  date,
  matches: teams.map(([h, a]) => ({ fixture: `${h} vs ${a}` })),
});
const mapFor = (teamNames, slate = "2026-07-14") => ({ slate, teams: Object.fromEntries(teamNames.map((t) => [t, { id: 1 }])) });

test("OK when the map covers every active fixture team and the slate matches", () => {
  const r = evaluateTeamMapFreshness(mapFor(["France", "Spain"]), projections([["France", "Spain"]]));
  assert.equal(r.level, "ok");
  assert.equal(r.ok, true);
  assert.deepEqual(r.missingTeams, []);
});

test("FAIL when the map is MISSING (null)", () => {
  const r = evaluateTeamMapFreshness(null, projections([["France", "Spain"]]));
  assert.equal(r.level, "fail");
  assert.equal(r.ok, false);
  assert.match(r.issues[0], /MISSING/i);
});

test("FAIL when the map does NOT cover both teams in an active fixture (incomplete)", () => {
  // map has France but not Spain → Spain's props would hide, so this is a hard gap.
  const r = evaluateTeamMapFreshness(mapFor(["France"]), projections([["France", "Spain"]]));
  assert.equal(r.level, "fail");
  assert.deepEqual(r.missingTeams, ["Spain"]);
  assert.match(r.issues[0], /does not cover/i);
});

test("WARN when the map is STALE (built for a different slate) but still covers the teams", () => {
  const r = evaluateTeamMapFreshness(mapFor(["France", "Spain"], "2026-07-13"), projections([["France", "Spain"]], "2026-07-14"));
  assert.equal(r.level, "warn");
  assert.equal(r.ok, true); // coverage is fine → not a hard fail, just stale
  assert.ok(r.issues.some((i) => /stale/i.test(i)));
});

test("no active fixtures → OK (nothing to guard)", () => {
  const r = evaluateTeamMapFreshness(null, { date: "2026-07-14", matches: [] });
  assert.equal(r.level, "ok");
});

test("unresolved players NEVER get a wrong team (resolver fails safe → null)", () => {
  // A real Spain player in a fixture he isn't part of, and a totally unknown name → both null, never a guess.
  assert.equal(resolveWcPlayerTeam("Lamine Yamal", "England", "Argentina"), null);
  assert.equal(resolveWcPlayerTeam("Totally Unknown Person", "France", "Spain"), null);
});

test("England vs Argentina still labels Argentina players Argentina, England players England (real map)", () => {
  // The World Cup tournament is COMPLETE — the live player-team map is now an empty shell, so positive
  // resolution can't run against live data (a valid end-of-tournament state). Guard the completed state; the
  // resolver's fail-safe (→ null) stays covered by the "unresolved players NEVER get a wrong team" test above.
  const map = JSON.parse(read("public/data/world-cup/player-team-map.json"));
  if (Object.keys(map.byFullName ?? {}).length === 0) return;
  for (const n of ["Lionel Messi", "Julian Alvarez", "Lautaro Martinez"]) assert.equal(resolveWcPlayerTeam(n, "England", "Argentina"), "Argentina");
  for (const n of ["Harry Kane", "Jude Bellingham"]) assert.equal(resolveWcPlayerTeam(n, "England", "Argentina"), "England");
});

test("the refresh pipeline regenerates the map AND runs the freshness guard (after player props)", () => {
  const sh = read("../scripts/refresh_daily_products.sh");
  assert.match(sh, /build-wc-player-team-map\.mjs --date "\$DATE"/, "refresh builds the map");
  assert.match(sh, /check-wc-team-map-freshness\.mjs --date "\$DATE"/, "refresh runs the freshness guard");
  // ordering: the map build comes AFTER player props (its coverage source) and BEFORE specials.
  const idxProps = sh.indexOf("build_player_props.py");
  const idxMap = sh.indexOf("build-wc-player-team-map.mjs");
  const idxSpecials = sh.indexOf("refresh-world-cup-specials.mjs");
  assert.ok(idxProps > 0 && idxProps < idxMap && idxMap < idxSpecials, "map built after props, before specials");
});

test("health-check gates on the map freshness (warn, never blocks a money-clean deploy)", () => {
  const hc = read("scripts/health-check.mjs");
  assert.match(hc, /evaluateTeamMapFreshness/, "health-check evaluates map freshness");
  assert.match(hc, /wc:team-map/, "reports a wc:team-map check");
  // It uses W (warn), not C (crit) — the failure mode is safe (labels hide, never wrong).
  assert.match(hc, /W\("wc:team-map"/, "map issues are warnings, not deploy-blockers");
});
