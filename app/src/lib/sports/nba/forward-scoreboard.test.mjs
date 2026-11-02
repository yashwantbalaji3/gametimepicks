/**
 * NBA FORWARD SCOREBOARD (app/scripts/nba/research/forward-scoreboard.mjs): recompute on a hand-worked fixture,
 * determinism, the claim words, forward vs seen, and game eligibility. Lives under src/ so the CI unit phase runs it.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { WORD, buildScoreboard, closerBootstrap, forbiddenOut, loadInputs, overallVerdict, participationOf, renderMarkdown, unconditionalMinutes, verdictOf } from "../../../../scripts/nba/research/forward-scoreboard.mjs";
import { stampReceipt } from "./forecast-receipt.mjs";

const q = (p10, p50, p90) => ({ p10, p50, p90 });
const cham = (id, expectedMinutes, ptsQ = q(5, 12, 20)) => ({ providerAthleteId: id, name: `P${id}`, expectedMinutes, availability: "active", minutes: q(expectedMinutes - 5, expectedMinutes, expectedMinutes + 5), pts: ptsQ, reb: q(1, 3, 6), ast: q(1, 2, 4) });
const chal = (id, expectedMinutes, playRate, ptsQ = q(5, 12, 20)) => ({ ...cham(id, expectedMinutes, ptsQ), playRate });
const boxRow = (id, team, minutes, pts, starter) => ({ providerAthleteId: id, name: `P${id}`, providerTeamId: team, starter, didNotPlay: minutes == null, minutes, pts, reb: minutes == null ? null : 3, ast: minutes == null ? null : 2 });

function game(family, id, date, players) {
  const g = { providerEventId: id, seasonType: 2, etDate: date, dateUtc: `${date}T23:30Z`, home: { abbr: "HOM", providerTeamId: "h" }, away: { abbr: "AWY", providerTeamId: "a" }, forecast: { players } };
  return stampReceipt(g, { family, modelVersion: family, now: `${date}T15:00:00Z`, inputs: {} });
}
const finalOf = (id, date, ftHome, ftAway) => ({ providerEventId: id, dateEt: date, ftHome, ftAway, winnerSide: ftHome > ftAway ? "home" : "away" });
const box = (id, players) => ({ providerEventId: id, phase: 2, status: "STATUS_FINAL", boxscoreAvailable: true, players });

/** One worked game: every expected number below is computed by hand from these rows. */
const WORKED = (id, date) => ({
  a: game("v0.1", id, date, { home: [cham("1", 30, q(10, 20, 30)), cham("2", 20, q(5, 10, 15))], away: [cham("3", 10)] }),
  b: game("v0.3", id, date, { home: [chal("1", 28, 1, q(10, 22, 30)), chal("2", 24, 0.5, q(0, 4, 8))], away: [chal("3", 12, 0.2), chal("4", 10, 1)] }),
  box: box(id, [boxRow("1", "h", 32, 25, true), boxRow("2", "h", 8, 2, false), boxRow("3", "a", null, null, false), boxRow("4", "a", 12, 3, true)]),
  final: finalOf(id, date, 27, 3),
});

function inputs(worked, extra = {}) {
  return {
    from: "2026-10-22", families: ["v0.1", "v0.3"],
    forecasts: { "v0.1": [{ games: worked.map((w) => w.a) }], "v0.3": [{ games: worked.map((w) => w.b) }] },
    boxscores: new Map(worked.filter((w) => w.box).map((w) => [w.a.providerEventId, w.box])),
    finalsDoc: { finals: worked.filter((w) => w.final).map((w) => w.final), conflicts: [] },
    ...extra,
  };
}
const metric = (block, key) => block.metrics.find((m) => m.key === key);

test("recompute: every metric equals the hand-worked value on a two-game fixture", () => {
  const rep = buildScoreboard(inputs([WORKED("100", "2026-10-22"), WORKED("101", "2026-10-23")]));
  const f = rep.comparisons[0].forward;
  assert.equal(f.evidence, "FORWARD");
  assert.equal(f.games, 2);
  const expected = {
    // played rows, listed by both: player 1 |30−32| |28−32|, player 2 |20−8| |24−8|
    minutesMae: [7, 10, 3], largeError: [0, 0.5, 0.5],
    // all rows: 1 (2, 4), 2 (12, |12−8|), 3 DNP (10, 2.4), 4 unlisted by v0.1 (12, 2)
    minutesMaeAll: [9, 3.1, -5.9], largeErrorAll: [0, 0, 0],
    // |20−25| |10−2| ; |22−25| |4−2|
    ptsMae: [6.5, 2.5, -4],
    // P(played): 1 (1, 1) played, 2 (1, .5) played, 3 (1, .2) DNP, 4 (0, 1) played
    participationBrier: [0.5, 0.0725, -0.4275],
    starterListed: [0.5, 1, 0.5], starterRotation: [0.5, 1, 0.5], sixthListed: [1, 1, 0], sixthRotation: [1, 1, 0],
  };
  for (const [k, [champion, challenger, diff]] of Object.entries(expected)) {
    const m = metric(f, k);
    assert.equal(m.champion, champion, `${k} champion`);
    assert.equal(m.challenger, challenger, `${k} challenger`);
    assert.equal(m.diff, diff, `${k} diff`);
  }
  // bias 5 vs 6, so the distance from 0 grew by 1; pts coverage 0.5 vs 1, so its distance from 0.80 fell by 0.1
  assert.deepEqual([metric(f, "minutesBias").champion, metric(f, "minutesBias").challenger, metric(f, "minutesBias").diff], [5, 6, 1]);
  assert.deepEqual([metric(f, "ptsRange").champion, metric(f, "ptsRange").challenger, metric(f, "ptsRange").diff], [0.5, 1, -0.1]);
  assert.deepEqual([metric(f, "minutesMae").n, metric(f, "minutesMae").games, metric(f, "minutesMaeAll").n, metric(f, "sixthListed").n], [4, 2, 8, 2]);
  assert.deepEqual(f.rows, { playedRows: 6, listedByBoth: 4, listedChampionOnly: 0, listedChallengerOnly: 2, listedByNeither: 0, allRows: 8, nullMinutes: 0 });
});

test("participation and unconditional minutes: an unlisted player is 0, an IMPLIED family is 1 when listed", () => {
  assert.equal(participationOf(null), 0);
  assert.equal(participationOf({ expectedMinutes: 20 }), 1);
  assert.equal(participationOf({ expectedMinutes: 20, playRate: 0.4 }), 0.4);
  assert.equal(participationOf({ expectedMinutes: 20, playRate: 0.4, availability: "out" }), 0);
  assert.equal(unconditionalMinutes({ expectedMinutes: 20, playRate: 0.5 }), 10);
});

test("words: few games never claims, 'improves' needs an interval excluding 0, and no single metric carries the overall", () => {
  assert.equal(verdictOf({ lo: -2, hi: -1, clusters: 2 }, "loss"), WORD.FEW);
  assert.equal(verdictOf({ lo: -2, hi: -1, clusters: 10 }, "loss"), WORD.IMPROVES);
  assert.equal(verdictOf({ lo: -2, hi: 0, clusters: 10 }, "loss"), WORD.NOT_ESTABLISHED);
  assert.equal(verdictOf({ lo: 1, hi: 2, clusters: 10 }, "loss"), WORD.WORSE);
  assert.equal(verdictOf({ lo: 1, hi: 2, clusters: 10 }, "gain"), WORD.IMPROVES);
  assert.equal(verdictOf({ lo: null, hi: null, clusters: 1 }, "loss"), WORD.NONE);

  const m = (group, word, games = 20) => ({ group, word, games });
  assert.equal(overallVerdict([m("minutes", WORD.IMPROVES), m("minutes", WORD.IMPROVES), m("medians", WORD.NOT_ESTABLISHED)]).word, "AHEAD ON ONE GROUP ONLY, NO OVERALL CLAIM");
  assert.equal(overallVerdict([m("minutes", WORD.IMPROVES), m("medians", WORD.IMPROVES)]).word, "AHEAD ON SEVERAL GROUPS, BEHIND ON NONE");
  assert.equal(overallVerdict([m("minutes", WORD.IMPROVES), m("medians", WORD.WORSE)]).word, "MIXED");
  assert.equal(overallVerdict([m("minutes", WORD.NOT_ESTABLISHED)]).word, "NOT ESTABLISHED");
  assert.equal(overallVerdict([m("minutes", WORD.IMPROVES, 9), m("medians", WORD.IMPROVES, 9)]).word, "NO CLAIM");
});

test("a two-game fixture prints no direction, whatever the gap", () => {
  const rep = buildScoreboard(inputs([WORKED("100", "2026-10-22"), WORKED("101", "2026-10-23")]));
  const f = rep.comparisons[0].forward;
  assert.equal(f.overall.word, "NO CLAIM");
  assert.ok(f.metrics.every((m) => m.word === WORD.FEW), "every metric withheld below the floor");
  const md = renderMarkdown(rep);
  assert.doesNotMatch(md, /\| IMPROVES \|/);
  assert.doesNotMatch(md, /\| WORSE \|/);
});

test("over enough games a real gap reads IMPROVES, and no gap reads NOT ESTABLISHED", () => {
  const dates = Array.from({ length: 12 }, (_, i) => `2026-10-${String(22 + (i % 8)).padStart(2, "0")}`);
  const worked = (gap) => dates.map((d, i) => {
    const id = String(200 + i);
    const act = 26 + (i % 5);
    return {
      a: game("v0.1", id, d, { home: [cham("1", 30)], away: [cham("3", 30)] }),
      b: game("v0.3", id, d, { home: [chal("1", 30 - gap - (i % 3), 1)], away: [chal("3", 30 - gap - (i % 3), 1)] }),
      box: box(id, [boxRow("1", "h", act, 10, true), boxRow("3", "a", act, 9, true)]),
      final: finalOf(id, d, 10, 9),
    };
  });
  const f = buildScoreboard(inputs(worked(1))).comparisons[0].forward;
  assert.equal(metric(f, "minutesMae").word, WORD.IMPROVES);
  assert.equal(metric(f, "ptsMae").word, WORD.NOT_ESTABLISHED, "identical medians: nothing to claim");
});

test("closerBootstrap: distance from the target, resampling games, deterministic", () => {
  const clusters = [[[0.5, 0.8]], [[0.6, 0.8]], [[0.7, 0.9]]];
  const a = closerBootstrap(clusters, 0.8, { B: 500, seed: 7 });
  assert.deepEqual(a, closerBootstrap(clusters, 0.8, { B: 500, seed: 7 }));
  assert.equal(a.a, 0.6);
  assert.equal(a.b, 0.8333);
  assert.equal(a.mean, Number((Math.abs(2.5 / 3 - 0.8) - Math.abs(0.6 - 0.8)).toFixed(4)));
  assert.equal(a.clusters, 3);
});

test("forward vs seen: a slate before the pair's armed date is its own block, never pooled", () => {
  const rep = buildScoreboard(inputs([WORKED("100", "2026-10-22"), WORKED("101", "2026-10-23")], { armed: { "v0.1": "2026-10-20", "v0.3": "2026-10-23" } }));
  const c = rep.comparisons[0];
  assert.equal(c.forwardFrom, "2026-10-23");
  assert.deepEqual([c.forward.games, c.seen.games, c.seen.evidence], [1, 1, "SEEN"]);
  assert.match(renderMarkdown(rep), /v0\.3 vs v0\.1: SEEN, 1 games/);
});

test("eligibility: a broken receipt, a disputed final, a box score that disagrees and a missing final never score", () => {
  const broken = WORKED("100", "2026-10-22");
  broken.b = structuredClone(broken.b);
  broken.b.forecast.players.home[0].expectedMinutes = 99;
  const disputed = WORKED("101", "2026-10-22");
  const wrongBox = WORKED("102", "2026-10-22");
  wrongBox.final = finalOf("102", "2026-10-22", 28, 3);
  const pending = { ...WORKED("103", "2026-10-22"), box: null, final: null };
  const good = WORKED("104", "2026-10-22");
  const preseason = WORKED("105", "2026-10-22");
  preseason.a = { ...preseason.a, seasonType: 1 };
  const c = buildScoreboard(inputs([broken, disputed, wrongBox, pending, good, preseason], {
    finalsDoc: { finals: [broken.final, disputed.final, wrongBox.final, good.final, preseason.final], conflicts: [{ providerEventId: "101" }] },
  })).comparisons[0];
  assert.deepEqual(c.excluded, { BOX_POINTS_DISAGREE_WITH_FINAL: 1, CHALLENGER_ONLY: 1, FINAL_UNDER_REVIEW: 1, RECEIPT_NOT_VERIFIED: 1 });
  assert.equal(c.pendingGames, 1);
  assert.equal(c.forward.games, 1);
});

function writeFixture(root) {
  const put = (rel, doc) => { const abs = path.join(root, rel); fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, JSON.stringify(doc)); };
  const worked = [WORKED("100", "2026-10-22"), WORKED("101", "2026-10-23")];
  for (const [fam, key] of [["v0.1", "a"], ["v0.3", "b"]]) for (const w of worked) put(`data/internal/research/nba/experimental-${fam}/forecasts/${w.a.etDate}.json`, { date: w.a.etDate, games: [w[key]] });
  for (const w of worked) put(`data/internal/research/nba/experimental/boxscores/${w.a.providerEventId}.json`, w.box);
  put("app/public/data/nba/results/finals-2026-27.json", { finals: worked.map((w) => w.final), conflicts: [] });
}

test("determinism: same bytes in, same bytes out; document order does not matter", () => {
  const worked = [WORKED("100", "2026-10-22"), WORKED("101", "2026-10-23")];
  const a = inputs(worked);
  const b = inputs(worked.slice().reverse());
  assert.equal(JSON.stringify(buildScoreboard(a)), JSON.stringify(buildScoreboard(b)));
  assert.equal(renderMarkdown(buildScoreboard(a)), renderMarkdown(buildScoreboard(b)));
  const md = renderMarkdown(buildScoreboard(a));
  assert.doesNotMatch(md, /generatedAt/, "no wall-clock field");
});

test("CLI: two runs over a fixture root are byte-identical, write beside --out, and refuse data/ and app/public/", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "forward-scoreboard-"));
  try {
    writeFixture(tmp);
    const loaded = loadInputs(tmp, { from: "2026-10-22", families: ["v0.1", "v0.3"] });
    assert.equal(Object.keys(loaded.sources).length, 7, "every file read is hashed");
    const script = path.resolve("scripts/nba/research/forward-scoreboard.mjs");
    const run = (name) => spawnSync("npx", ["tsx", script, "--families", "v0.1,v0.3", "--root", tmp, "--out", path.join(tmp, name)], { encoding: "utf8" });
    const one = run("one.md"), two = run("two.md");
    assert.equal(one.status, 0, one.stderr);
    assert.equal(one.stdout, two.stdout);
    assert.equal(fs.readFileSync(path.join(tmp, "one.md"), "utf8"), one.stdout);
    assert.equal(fs.readFileSync(path.join(tmp, "one.json"), "utf8"), fs.readFileSync(path.join(tmp, "two.json"), "utf8"));
    assert.ok(forbiddenOut("/repo/data/internal/x.md", ["/repo"]));
    assert.ok(forbiddenOut("/repo/app/public/data/x.md", ["/repo"]));
    assert.ok(!forbiddenOut("/repo/docs/x.md", ["/repo"]));
    assert.ok(!forbiddenOut("/elsewhere/x.md", ["/repo"]));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
