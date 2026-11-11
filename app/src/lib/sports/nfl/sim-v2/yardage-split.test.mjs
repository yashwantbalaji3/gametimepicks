/**
 * NFL sim-v2 · MKT-02 yardage-split challenger (yardage-split.mjs): walk-forward, no leakage, deterministic.
 * Uses the committed team-games / player-events files only as fit inputs (a pass share, never a graded outcome of a
 * receipt). Small FIT runs keep the test fast; the rule and its constants are the production ones.
 * Run (from app/): npx tsx --test src/lib/sports/nfl/sim-v2/yardage-split.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { compileParams } from "./engine.mjs";
import { ALPHA_HI, ALPHA_LO, FIRST_SEASON, FIT_RUNS, FIT_TOLERANCE, MKT02_CHALLENGER, fitYardageSplit, simPassShare, targetPassShare, teamGameRows, weekKey } from "./yardage-split.mjs";

const ROOT = path.resolve(process.cwd(), "..");
const compiled = compileParams(JSON.parse(fs.readFileSync(path.join(ROOT, "data/internal/research/nfl/sim-v2/drive-params-2015-2025.json"), "utf8")));
const RUNS = 300;

const row = (season, wk, team, passYds, rushYds, st = "REG") => ({ s: season, st, wk, tm: team, passYds, rushYds });

test("week keys order preseason < regular < postseason, and ESPN season types 2 / 3 map to REG / POST", () => {
  assert.ok(weekKey(2025, "REG", 18) < weekKey(2025, "POST", 1));
  assert.ok(weekKey(2025, "POST", 4) < weekKey(2026, "REG", 1));
  assert.equal(weekKey(2026, 2, 11), weekKey(2026, "REG", 11));
  assert.equal(weekKey(2026, 3, 1), weekKey(2026, "POST", 1));
});

test("target share: only team-games strictly before the target week; same-week and later games never enter", () => {
  const tg = [row(2025, 1, "A", 200, 100), row(2025, 2, "A", 300, 100), row(2025, 3, "A", 900, 0), row(2025, 4, "A", 0, 900)];
  const rows = teamGameRows({ teamGames: tg });
  const t = targetPassShare(rows, weekKey(2025, "REG", 3));
  assert.deepEqual(t, { share: 500 / 700, teamGames: 2, lastWeekKey: weekKey(2025, "REG", 2) });
  assert.equal(targetPassShare(rows, weekKey(2025, "REG", 1)), null, "nothing precedes week 1");
  assert.equal(teamGameRows({ teamGames: [row(FIRST_SEASON - 1, 1, "A", 1, 1)] }).length, 0, "pre-2015 rows are outside the window");
});

test("player-events seasons: Σ passer passYds and Σ rusher rushYds per team; a season already in team-games is not double counted", () => {
  const pe = [{ season: 2026, seasonType: 2, week: 1, players: [{ teamAbbr: "A", passYds: 250, rushYds: 10 }, { teamAbbr: "A", rushYds: 80 }, { teamAbbr: "B", passYds: 180 }, { teamAbbr: "B", rushYds: 120 }] },
    { season: 2025, seasonType: 2, week: 1, players: [{ teamAbbr: "A", passYds: 999 }] }];
  const rows = teamGameRows({ teamGames: [row(2025, 1, "A", 200, 100)], playerEventGames: pe });
  assert.deepEqual(rows.map((r) => [r.season, r.team, r.passYds, r.rushYds]), [[2025, "A", 200, 100], [2026, "A", 250, 90], [2026, "B", 180, 120]]);
});

test("the simulated pass share rises with α, and α = 1 is the incumbent", () => {
  const s = [0.75, 1, 1.5, 2].map((a) => simPassShare(compiled, a, { runs: RUNS }));
  for (let i = 1; i < s.length; i++) assert.ok(s[i] > s[i - 1], `S(α) increasing: ${s}`);
});

test("LEAKAGE: the fit for week W is identical whatever happens in week W or later; an earlier change moves it", () => {
  const base = [];
  for (const s of [2023, 2024]) for (let w = 1; w <= 18; w++) for (const t of ["A", "B"]) base.push(row(s, w, t, 240 + ((w * 7) % 30), 115 + ((w * 3) % 20)));
  const key = weekKey(2024, "REG", 10);
  const fit = (tg) => fitYardageSplit({ compiled, rows: teamGameRows({ teamGames: tg }), asOfKey: key, runs: RUNS });
  const a = fit(base);
  const later = base.map((r) => (weekKey(r.s, r.st, r.wk) >= key ? { ...r, passYds: 5, rushYds: 500 } : r));
  assert.deepEqual(fit(later), a, "rows at or after the target week change nothing");
  assert.deepEqual(fit([...base, row(2024, 10, "C", 900, 0), row(2025, 1, "C", 900, 0)]), a, "adding same-week / later rows changes nothing");
  const earlier = base.map((r) => (r.s === 2023 && r.wk === 1 ? { ...r, passYds: 2000 } : r));
  assert.notDeepEqual(fit(earlier).targetPassShare, a.targetPassShare, "an earlier row does move the target (the fit is sensitive)");
  assert.equal(a.lastWeekKey, weekKey(2024, "REG", 9));
});

test("deterministic: the same inputs give the same α; the solved share meets the tolerance inside the bracket", () => {
  const rows = teamGameRows({ teamGames: [row(2025, 1, "A", 260, 100), row(2025, 2, "A", 250, 110)] });
  const key = weekKey(2025, "REG", 3);
  const a = fitYardageSplit({ compiled, rows, asOfKey: key, runs: RUNS });
  assert.deepEqual(fitYardageSplit({ compiled, rows, asOfKey: key, runs: RUNS }), a);
  assert.ok(a.alpha > ALPHA_LO && a.alpha < ALPHA_HI);
  assert.ok(Math.abs(a.simPassShareAtAlpha - a.targetPassShare) <= FIT_TOLERANCE + 1e-6, JSON.stringify(a));
  assert.equal(a.challengerId, MKT02_CHALLENGER.challengerId);
});

test("on the committed history (2015 on, before 2026 week 11): the incumbent's pass share is below the actual — the MKT-02 direction — and α > 1", () => {
  const tg = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ROOT, "data/internal/research/nfl/sim-v2/team-games-v1.json.gz"))));
  const pe = JSON.parse(fs.readFileSync(path.join(ROOT, "data/internal/research/nfl/player-events-v1/2026.json"), "utf8")).games;
  const a = fitYardageSplit({ compiled, rows: teamGameRows({ teamGames: tg, playerEventGames: pe }), asOfKey: weekKey(2026, "REG", 11), runs: FIT_RUNS });
  assert.ok(a.simPassShareIncumbent < a.targetPassShare, JSON.stringify(a));
  assert.ok(a.alpha > 1, JSON.stringify(a));
  assert.ok(a.lastWeekKey < weekKey(2026, "REG", 11));
});
