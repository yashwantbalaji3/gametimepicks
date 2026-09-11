import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_PARAMS, SNAP_STATES, SNAP_COLUMNS, SNAP_SHARE_ID, buildSnapIndex, computeSnapShare, classifySnapState,
  normalizeSnapCsvRow, snapRowsFromTable, buildIdBridge, resolveBoardPlayer, auditIdJoin, canonicalJson, hashableContent,
} from "./snap-share.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..");
const PREREG = path.join(REPO, "data/internal/research/nfl/preregistration-participation-v1.json");

const row = (week, team, pfrId, snaps, pct, season = 2025) => ({
  gameId: `${season}_${String(week).padStart(2, "0")}_${team}`, season, week, player: pfrId, pfrId, position: "WR", team, opponent: "OPP", offenseSnaps: snaps, offensePct: pct,
});
/** A teammate on every listed week, so the team's sheet exists for that week. */
const sheet = (team, weeks, season = 2025) => weeks.map((w) => row(w, team, `QB_${team}`, 60, 1, season));
const game = (week, home, away, season = 2025, final = { home: 20, away: 17 }) => ({ gameId: `${season}_${week}_${away}_${home}`, season, week, home, away, final });

test("no lookahead: target-week and later rows cannot move the feature", () => {
  const past = [...sheet("KC", [1, 2, 3, 4]), row(1, "KC", "P1", 50, 0.8), row(2, "KC", "P1", 52, 0.85), row(3, "KC", "P1", 55, 0.9), row(4, "KC", "P1", 50, 0.8)];
  const future = [...sheet("KC", [5, 6, 7]), row(5, "KC", "P1", 3, 0.05), row(6, "KC", "P1", 1, 0.01), row(7, "KC", "P1", 0, 0)];
  const clean = computeSnapShare(buildSnapIndex(past), { pfrId: "P1", season: 2025, week: 5, team: "KC" });
  const leaky = computeSnapShare(buildSnapIndex([...past, ...future]), { pfrId: "P1", season: 2025, week: 5, team: "KC" });
  assert.deepEqual(leaky, clean);
  assert.equal(clean.meanShare, 0.8375);
  assert.ok(clean.window.games.every((g) => g.week < 5));
  // a later season is also invisible to an earlier target
  const nextSeason = computeSnapShare(buildSnapIndex([...past, ...sheet("KC", [1], 2026), row(1, "KC", "P1", 1, 0.01, 2026)]), { pfrId: "P1", season: 2025, week: 5, team: "KC" });
  assert.deepEqual(nextSeason, clean);
});

test("a missing week is not zero: absent-from-sheet lowers availability, never the share", () => {
  const rows = [...sheet("BUF", [1, 2, 3, 4]), row(1, "BUF", "P1", 60, 0.8), row(2, "BUF", "P1", 60, 0.8), row(4, "BUF", "P1", 60, 0.8)];
  const f = computeSnapShare(buildSnapIndex(rows), { pfrId: "P1", season: 2025, week: 5, team: "BUF" });
  assert.equal(f.meanShare, 0.8, "the absent week is not averaged in as 0");
  assert.equal(f.availability, 0.75);
  assert.deepEqual([f.window.teamGames, f.window.played, f.window.absent], [4, 3, 1]);
  assert.equal(f.window.games.find((g) => g.week === 3).share, null);
  assert.equal(f.state, "ESTABLISHED");

  // contrast: a special-teams-only row IS a real zero
  const st = computeSnapShare(buildSnapIndex([...rows, row(3, "BUF", "P1", 0, 0)]), { pfrId: "P1", season: 2025, week: 5, team: "BUF" });
  assert.equal(st.meanShare, 0.6);
  assert.equal(st.window.playedNoOffense, 1);

  // never seen at all: NO_HISTORY with null numbers, not 0
  const none = computeSnapShare(buildSnapIndex(rows), { pfrId: "NOBODY", season: 2025, week: 5, team: "BUF" });
  assert.equal(none.state, "NO_HISTORY");
  for (const k of ["meanShare", "lastShare", "shareSd", "trend", "availability", "roleStability"]) assert.equal(none[k], null, k);
});

test("a bye week is not a game; a scheduled game without a sheet is SOURCE_MISSING, skipped and counted", () => {
  const rows = [...sheet("DET", [1, 2, 4, 5]), ...[1, 2, 4, 5].map((w) => row(w, "DET", "P1", 50, 0.7))];
  // no schedule: the bye is invisible
  const a = computeSnapShare(buildSnapIndex(rows), { pfrId: "P1", season: 2025, week: 6, team: "DET" });
  assert.deepEqual(a.window.games.map((g) => g.week), [1, 2, 4, 5]);
  assert.equal(a.availability, 1);
  // with the schedule: bye (no game in week 3) still invisible
  const schedule = [1, 2, 4, 5].map((w) => game(w, "DET", "CHI"));
  const b = computeSnapShare(buildSnapIndex(rows, { schedule }), { pfrId: "P1", season: 2025, week: 6, team: "DET" });
  assert.deepEqual([b.window.absent, b.window.sourceMissing, b.availability], [0, 0, 1]);
  // week 3 scheduled and final but no sheet at all: skipped (not absent, not zero), and the window reaches back
  const withGap = computeSnapShare(
    buildSnapIndex([...rows, ...sheet("DET", [0]), row(0, "DET", "P1", 50, 0.5)], { schedule: [...schedule, game(3, "DET", "GB"), game(0, "DET", "GB")] }),
    { pfrId: "P1", season: 2025, week: 6, team: "DET" },
  );
  assert.equal(withGap.window.sourceMissing, 1);
  assert.equal(withGap.window.absent, 0);
  assert.deepEqual(withGap.window.games.map((g) => g.week), [1, 2, 4, 5]);
  // an unplayed (future, no final) scheduled game never enters a window
  const unplayed = computeSnapShare(buildSnapIndex(rows, { schedule: [...schedule, game(3, "DET", "GB", 2025, null)] }), { pfrId: "P1", season: 2025, week: 6, team: "DET" });
  assert.equal(unplayed.window.sourceMissing, 0);
});

test("team change mid-season: the new stint starts empty, old usage is carried as information only", () => {
  const rows = [
    ...sheet("NYJ", [1, 2, 3, 4, 5, 6, 7, 8]), ...sheet("MIA", [1, 2, 3, 4, 5, 6, 7, 8]),
    ...[1, 2, 3, 4, 5].map((w) => row(w, "NYJ", "P1", 60, 0.9)),
    row(7, "MIA", "P1", 20, 0.3), row(8, "MIA", "P1", 35, 0.5),
  ];
  const idx = buildSnapIndex(rows);
  const before = computeSnapShare(idx, { pfrId: "P1", season: 2025, week: 7, team: "MIA" });
  assert.equal(before.state, "NO_HISTORY");
  assert.equal(before.teamChanged, true);
  assert.equal(before.priorStint.team, "NYJ");
  assert.equal(before.meanShare, null, "0.9 at NYJ is never imported into MIA");

  const after = computeSnapShare(idx, { pfrId: "P1", season: 2025, week: 9, team: "MIA" });
  assert.equal(after.window.teamGames, 2, "MIA games before his first appearance are not counted as absences");
  assert.equal(after.window.absent, 0);
  assert.equal(after.meanShare, 0.4);
  assert.equal(after.state, "EMERGING");
  assert.equal(after.teamChanged, false);
  // default team = last observed team
  assert.equal(computeSnapShare(idx, { pfrId: "P1", season: 2025, week: 9 }).team, "MIA");
  // asking about the old team after he left: his NYJ stint is not the trailing one, so NYJ usage is unobserved
  const oldTeam = computeSnapShare(idx, { pfrId: "P1", season: 2025, week: 9, team: "NYJ" });
  assert.equal(oldTeam.state, "NO_HISTORY");
  assert.equal(oldTeam.priorStint.team, "MIA");
  // before the trade, NYJ: week 6 has him absent from the sheet (the week between teams)
  const w7 = computeSnapShare(idx, { pfrId: "P1", season: 2025, week: 7, team: "NYJ" });
  assert.equal(w7.window.absent, 1);
  assert.equal(w7.state, "ESTABLISHED");
});

test("thresholds classify correctly, with frozen precedence", () => {
  const c = (m) => classifySnapState(m, DEFAULT_PARAMS).state;
  assert.equal(c({ meanShare: 0.85, lastShare: 0.9, shareSd: 0.05, trend: 0.06, played: 4 }), "ESTABLISHED");
  assert.equal(c({ meanShare: 0.6, lastShare: 0.6, shareSd: 0.15, trend: 0, played: 3 }), "ESTABLISHED", "boundaries are inclusive");
  assert.equal(c({ meanShare: 0.77, lastShare: 0.3, shareSd: 0.27, trend: -0.62, played: 4 }), "ROTATION", "a high but unstable share is not a settled role");
  assert.equal(c({ meanShare: 0.9, lastShare: 0.9, shareSd: 0, trend: 0, played: 2 }), "EMERGING", "a real role on thin evidence");
  assert.equal(c({ meanShare: 0.35, lastShare: 0.55, shareSd: 0.13, trend: 0.27, played: 4 }), "EMERGING", "a rising role");
  assert.equal(c({ meanShare: 0.4, lastShare: 0.5, shareSd: 0.07, trend: 0.14, played: 4 }), "ROTATION", "a rise just under the bar");
  assert.equal(c({ meanShare: 0.1, lastShare: 0.1, shareSd: 0, trend: null, played: 1 }), "FRINGE");
  assert.equal(c({ meanShare: 0.249, lastShare: 0.2, shareSd: 0.05, trend: -0.05, played: 4 }), "FRINGE");
  assert.equal(c({ meanShare: 0.25, lastShare: 0.25, shareSd: 0, trend: 0, played: 4 }), "ROTATION");

  // IR class: history on the team, then the team keeps playing without him
  const rows = [...sheet("SF", [1, 2, 3, 4, 5, 6]), row(1, "SF", "P1", 60, 0.95), row(2, "SF", "P1", 60, 0.95)];
  const ir = computeSnapShare(buildSnapIndex(rows), { pfrId: "P1", season: 2025, week: 7, team: "SF" });
  assert.equal(ir.state, "ABSENT_RECENT");
  assert.equal(ir.availability, 0);
  assert.equal(ir.meanShare, null);

  // the two latest games lack a sheet: skipped and counted, never zeros; one observed game is thin evidence
  const sm = computeSnapShare(buildSnapIndex([...sheet("SF", [1]), row(1, "SF", "P1", 60, 0.9)], { schedule: [game(1, "SF", "LA"), game(2, "SF", "LA"), game(3, "SF", "LA")] }), { pfrId: "P1", season: 2025, week: 4, team: "SF" });
  assert.equal(sm.state, "EMERGING");
  assert.deepEqual([sm.window.sourceMissing, sm.window.teamGames, sm.availability], [2, 1, 1]);

  // every state the feature can emit is in the closed set
  for (const f of [ir, sm]) assert.ok(SNAP_STATES.includes(f.state));
  assert.equal(SNAP_SHARE_ID, "nfl-snap-share-v1-rolling-stint");
});

test("the window crosses the offseason only on the same team, and only maxSeasonsBack seasons", () => {
  const rows = [...sheet("GB", [15, 16, 17, 18], 2024), ...[15, 16, 17, 18].map((w) => row(w, "GB", "P1", 60, 0.9, 2024)), ...sheet("GB", [10], 2023), row(10, "GB", "P2", 60, 0.9, 2023)];
  const idx = buildSnapIndex(rows);
  const wk1 = computeSnapShare(idx, { pfrId: "P1", season: 2025, week: 1, team: "GB" });
  assert.equal(wk1.state, "ESTABLISHED");
  assert.equal(wk1.window.crossesSeason, true);
  const twoBack = computeSnapShare(idx, { pfrId: "P2", season: 2025, week: 1, team: "GB" });
  assert.equal(twoBack.state, "NO_HISTORY", "2023 is outside maxSeasonsBack = 1 for a 2025 target");
});

test("CSV normalization keeps blanks as null and the columnar table round-trips", () => {
  const ok = normalizeSnapCsvRow({ game_id: "2025_01_ARI_NO", season: "2025", week: "1", player: "X", pfr_player_id: "", position: "WR", team: "NO", opponent: "ARI", offense_snaps: "", offense_pct: "" });
  assert.equal(ok.ok, true);
  assert.equal(ok.row[4], null);
  assert.equal(ok.row[8], null, "a blank snap count is not 0");
  assert.equal(normalizeSnapCsvRow({ season: "2025", week: "1" }).ok, false);
  const [r] = snapRowsFromTable({ columns: [...SNAP_COLUMNS], rows: [ok.row] });
  assert.equal(r.gameId, "2025_01_ARI_NO");
  assert.throws(() => snapRowsFromTable({ columns: ["game_id"], rows: [] }), /do not match/);
});

test("id bridge: exact ids only; ESPN collisions resolve to nobody; the join audit checks team and name", () => {
  const bridge = buildIdBridge([
    { pfr_id: "AaaaAa00", gsis_id: "00-1", espn_id: "111", display_name: "Aaa Aaa" },
    { pfr_id: "BbbbBb00", gsis_id: "00-2", espn_id: "222", display_name: "Bbb Bbb" },
    { pfr_id: "CcccCc00", gsis_id: "00-3", espn_id: "222", display_name: "Ccc Ccc" },
    { pfr_id: "DdddDd00", gsis_id: "00-4", espn_id: "", display_name: "Ddd Ddd" },
  ]);
  assert.deepEqual(resolveBoardPlayer(bridge, "nfl-athlete-111"), { state: "RESOLVED", espnId: "111", pfrId: "AaaaAa00" });
  assert.equal(resolveBoardPlayer(bridge, "nfl-athlete-222").state, "AMBIGUOUS");
  assert.equal(resolveBoardPlayer(bridge, "nfl-athlete-999").state, "UNBRIDGED");
  assert.equal(bridge.collisions.length, 1);

  const snapRows = [
    { ...row(3, "WAS", "AaaaAa00", 40, 0.6), player: "Aaa Aaa Jr." },
    { ...row(3, "WAS", "DdddDd00", 10, 0.15), player: "Ddd Ddd" },
  ];
  const corpusGames = [{ season: 2025, seasonType: 2, week: 3, players: [
    { playerId: "nfl-athlete-111", name: "Aaa Aaa", teamAbbr: "WSH", targets: 5 },
    { playerId: "nfl-athlete-222", name: "Bbb Bbb", teamAbbr: "WSH", rushAtt: 3 },
    { playerId: "nfl-athlete-333", name: "Eee Eee", teamAbbr: "WSH", targets: 1 },
    { playerId: "nfl-athlete-444", name: "Kicker", teamAbbr: "WSH" },
  ] }];
  const a = auditIdJoin({ snapRows, bridge, corpusGames, season: 2025 });
  assert.deepEqual([a.forward.offenseRows, a.forward.withEspnId], [2, 1]);
  assert.deepEqual([a.reverse.playerGames, a.reverse.matched, a.reverse.ambiguous, a.reverse.unbridged], [3, 1, 1, 1], "no-involvement rows are outside the board population");
  assert.equal(a.reverse.teamAgreeRate, 1, "ESPN WSH is nflverse WAS");
  assert.equal(a.reverse.nameAgreeRate, 1, "suffixes normalize");
});

test("preregistration: frozen hash verifies and its frozen parameters are the module's", () => {
  assert.ok(fs.existsSync(PREREG), "preregistration-participation-v1.json must exist");
  const doc = JSON.parse(fs.readFileSync(PREREG, "utf8"));
  const digest = crypto.createHash("sha256").update(canonicalJson(hashableContent(doc))).digest("hex");
  assert.equal(doc.frozenHash?.algorithm, "sha256");
  assert.equal(doc.frozenHash?.value, digest, "the preregistration was edited after it was frozen");
  assert.deepEqual(doc.feature.params, { ...DEFAULT_PARAMS });
  assert.deepEqual(doc.feature.states, [...SNAP_STATES]);
  assert.equal(doc.feature.id, SNAP_SHARE_ID);
  assert.equal(doc.evaluation.mode, "FORWARD_ONLY");
});
