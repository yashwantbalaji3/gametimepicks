/**
 * SIMULATION THEATER · RECONCILIATION ON COMMITTED FIXTURES (Track C, 2026-10-29). Deterministic; reads committed files only.
 *
 *   NBA 2026-10-29 (CLE @ ATL, SAC @ NO, MEM @ POR): the possession artifact's 1,000-seed pool and its stored runs, the
 *     lane app/public/data/nba/experimental-public/2026-10-29.json, and the page the public loader builds from them.
 *   NFL week 8 (all 14 games incl. CAR @ GB 401873023): the drive engine (nfl-drive-sim-v2) re-run over SEEDS seeds per
 *     game with the receipt of record's calibration, and the Theater's Official Forecast card beside the game page's view.
 *
 * INVARIANTS (every seed checked, not sampled):
 *   NBA  Σ player PTS = team PTS = Σ periods (stored runs, folded from their own event logs; P1–P11 re-checked); the
 *        simulated winner is the side with more points and no NBA final is tied (all 1,000 pool seeds); a player the lane
 *        lists RULED_OUT is on no simulated roster and in no event (0 minutes, 0 stats).
 *   NFL  the full per-run contract of sim-v2/coherence.mjs, plus, stated here explicitly:
 *          completions = Σ receptions; passing yards = Σ receiving yards = Σ passer yards (GROSS passing yards: a sack is
 *          not a pass attempt, its yards go to team sackYds and to no player; NET passing = passYds − sackYds);
 *          team rushing yards = Σ player rushing yards with tolerance 0 (scrambles are carries credited to the scrambling
 *          QB, or OTHER when no passer is named); targets = attempts; carries = rush attempts;
 *          winner = higher score, a tie only after overtime; a player the build excludes (blocking injury status, or not
 *          on the active roster) holds no slot, so he has no stat in any run; every remaining stat sits on a named slot or
 *          the explicit OTHER bucket. Same seed ⇒ identical run (determinism).
 *   OFFICIAL  every value the Theater prints under "Official Forecast" equals the canonical accessor's: NBA — the lane row
 *        (medians and expected minutes at 1 dp, favoured side) and the Elo accessor's text; NFL — the game page's
 *        forecast view (win probability, projected score, median margin and total) and the same snapshotId.
 *   LABELS  no stored run is titled "official"; the opening NBA run is chosen without the official side.
 * Run: cd app && npx tsx --test src/components/simulation-theater/theater-reconciliation.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;
const { OfficialProjectionPanel, PossessionBoxScore } = await import("./nba/possession/possession-parts.tsx");
const { BOX_COLUMNS, boxRows, fmtMinutes } = await import("../../lib/simulation-theater/nba/possession/box.mjs");
const { OfficialComparison, OfficialForecastCard } = await import("./RepresentativeParts.tsx");
const { drawFromStoredRun, readPossessionArtifact, storedRunProblems, rostersOfGame } = await import("../../lib/simulation-theater/nba/possession/stored-run.mjs");
const { loadPublicPossessionTheater, readLaneDay } = await import("../../lib/simulation-theater/nba/possession/public-loader.mjs");
const { centralScenario } = await import("../../lib/simulation-theater/nba/possession/payload.mjs");
const { eloWinProbabilityOf, eloWinProbabilityText } = await import("../../lib/sports/nba/elo-win-probability.mjs");
const { loadTheater } = await import("../../lib/simulation-theater/loader.mjs");
const { loadForecastView } = await import("../../lib/sports/nfl/forecast-view-load.mjs");
const { formatValue } = await import("../../lib/sports/nfl/forecast-view.mjs");
const L = await import("../../lib/simulation-theater/representative-labels.mjs");
const { compileParams, prepareTeamPlayers, runRng, simulateGame, tiltedTable, N_PERIODS, N_PSTAT, N_TSTAT, PSTAT, TEAM_STAT } = await import("../../lib/sports/nfl/sim-v2/engine.mjs");
const { checkRun } = await import("../../lib/sports/nfl/sim-v2/coherence.mjs");
const { playersFromRoleShares } = await import("../../lib/sports/nfl/sim-v2/receipt.mjs");
const { readShadowReceipts, simulationOfRecord } = await import("../../lib/sports/nfl/sim-v2/public-receipt.mjs");
const { isBlockingStatus } = await import("../../lib/sports/injuries/contract.mjs");
const { activeRosterIndex } = await import("../../lib/sports/nfl/board-roster-integrity.mjs");

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO, rel), "utf8"));
const html = (el) => renderToStaticMarkup(el);
const unescape = (s) => s.replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, "\"");
const fmt1 = (v) => (typeof v === "number" && Number.isFinite(v) ? v.toFixed(1) : "—");

// ── NBA 2026-10-29 ──────────────────────────────────────────────────────────────────────────────────────────────────
const NBA_DATE = "2026-10-29";
const NBA_IDS = ["401909893", "401909894", "401909895"];
const ART = readPossessionArtifact(REPO, NBA_DATE);
const LANE = readLaneDay(REPO, NBA_DATE);
const gameOf = (id) => ART.doc.games.find((g) => String(g.providerEventId) === id);
const laneOf = (id) => LANE.games.find((g) => String(g.providerEventId) === id);

test("NBA 10-29 fixtures are committed: 3 games, 1,000-seed pools fully checked, 5 stored runs each", () => {
  assert.ok(ART.doc, ART.error);
  assert.deepEqual(ART.doc.games.map((g) => String(g.providerEventId)).sort(), NBA_IDS);
  for (const g of ART.doc.games) {
    assert.equal(g.pool.checkedDraws, 1000);
    assert.equal(g.pool.violations, 0);
    assert.equal(g.pool.features.length, 1000);
    assert.equal(g.runs.length, 5);
  }
});

test("NBA invariants, every stored run: Σ player PTS = team PTS = Σ periods = final; winner = higher score; P1–P11 + box digest", () => {
  let runs = 0;
  for (const id of NBA_IDS) {
    const g = gameOf(id);
    const rosters = rostersOfGame(g);
    for (const r of g.runs) {
      assert.deepEqual(storedRunProblems(r, rosters), [], `${id} run ${r.runIndex}`);
      const { box } = drawFromStoredRun(r, rosters); // the fold of the run's own event log (the Theater library's reader)
      for (const t of [0, 1]) {
        let pts = 0, mins = 0;
        for (const pid of rosters[t]) { const l = box.players[t].get(pid); pts += l?.pts ?? 0; mins += (l?.ds ?? 0) / 600; }
        const periods = r.periods[t].reduce((a, b) => a + b, 0);
        assert.equal(pts, r.final[t], `${id} run ${r.runIndex} side ${t}: Σ player PTS ${pts} ≠ final ${r.final[t]}`);
        assert.equal(periods, r.final[t], `${id} run ${r.runIndex} side ${t}: Σ periods ≠ final`);
        assert.ok(Math.abs(mins - 5 * (48 + 5 * r.overtimePeriods)) < 1e-6, `${id} run ${r.runIndex} side ${t}: ${mins} minutes`);
      }
      assert.notEqual(r.final[0], r.final[1], "an NBA final is never tied");
      const winner = r.final[0] > r.final[1] ? "HOME" : "AWAY";
      if (r.kind === "upset") assert.notEqual(winner, g.official.winnerSide);
      runs += 1;
    }
  }
  assert.equal(runs, 15);
});

test("NBA displayed box score, every stored run: every column the Theater prints (MIN, PTS, REB, AST, …) sums over players to the printed team line; REB = OREB + DREB; team rebounds are separate", () => {
  const COUNT = BOX_COLUMNS.map(([k]) => k).filter((k) => k !== "min");
  assert.ok(COUNT.includes("reb") && COUNT.includes("ast"), "rebounds and assists are displayed");
  let runs = 0;
  for (const id of NBA_IDS) {
    const g = gameOf(id);
    const rosters = rostersOfGame(g);
    const names = new Map(["home", "away"].flatMap((s) => g.rosters[s].map((p) => [String(p.providerAthleteId), p.displayName ?? p.name ?? null])));
    for (const r of g.runs) {
      const { box } = drawFromStoredRun(r, rosters);
      const rows = boxRows(box, rosters, names);
      const teams = { home: { abbr: "H", name: "Home" }, away: { abbr: "A", name: "Away" } };
      const h = html(React.createElement(PossessionBoxScore, { rows, teams, final: true, idBase: "t" }));
      for (const side of ["home", "away"]) {
        const t = rows.totals[side];
        for (const k of COUNT) assert.equal(rows[side].reduce((a, p) => a + p[k], 0), t[k], `${id} run ${r.runIndex} ${side}: Σ player ${k} = team ${k}`);
        assert.equal(t.reb, t.oreb + t.dreb, `${id} run ${r.runIndex} ${side}: REB = OREB + DREB`);
        assert.ok(Number.isInteger(t.teamRebounds) && t.teamRebounds >= 0, "team rebounds are their own number, not in any player line");
        assert.equal(t.pts, r.final[side === "home" ? 0 : 1], `${id} run ${r.runIndex} ${side}: team PTS = final`);
        // the printed table: each player's cells, and the footer = the column sums
        const tbl = h.slice(h.indexOf(`data-nbp-box-team="${side}"`));
        const foot = tbl.slice(tbl.indexOf("<tfoot>"), tbl.indexOf("</tfoot>"));
        const footCells = [...foot.matchAll(/<td>([^<]*)<\/td>/g)].map((m) => m[1]).slice(1);
        assert.deepEqual(footCells, BOX_COLUMNS.map(([k]) => (k === "min" ? String(Math.round(t.ds / 600)) : String(t[k]))), `${id} run ${r.runIndex} ${side}: printed team line`);
        for (const p of rows[side]) {
          const m = tbl.match(new RegExp(`<tr data-nbp-player="${p.providerAthleteId}">([\\s\\S]*?)</tr>`));
          assert.ok(m, `${id}: row ${p.providerAthleteId}`);
          const cells = [...m[1].matchAll(/<td[^>]*>([^<]*)<\/td>/g)].map((x) => x[1]).slice(1);
          const want = p.ds === 0 ? ["did not play in this run"] : BOX_COLUMNS.map(([k]) => (k === "min" ? fmtMinutes(p.ds) : String(p[k])));
          assert.deepEqual(cells, want, `${id} run ${r.runIndex} ${p.providerAthleteId}: printed cells`);
        }
      }
      runs += 1;
    }
  }
  assert.equal(runs, 15);
});

test("NBA invariants, all 3,000 pool seeds: no tied final, and the pool's home-win share is the one the artifact states", () => {
  for (const id of NBA_IDS) {
    const g = gameOf(id);
    for (const [h, a, ot] of g.pool.features) {
      assert.ok(Number.isInteger(h) && Number.isInteger(a) && h >= 0 && a >= 0);
      assert.notEqual(h, a, `${id}: a pool final is tied`);
      assert.ok(ot >= 0);
    }
    const share = g.pool.features.filter(([h, a]) => h > a).length / g.pool.features.length;
    assert.equal(share, g.pool.homeWinShare, `${id}: pool home-win share`);
  }
});

test("NBA inactive players: every RULED_OUT player on the lane is on no simulated roster and in no event of any stored run", () => {
  let out = 0;
  for (const id of NBA_IDS) {
    const g = gameOf(id);
    const ros = new Set(rostersOfGame(g).flat());
    const ruled = ["home", "away"].flatMap((s) => (laneOf(id).players.unavailable?.[s] ?? []).filter((u) => u.reason === "RULED_OUT").map((u) => String(u.providerAthleteId)));
    for (const pid of ruled) {
      out += 1;
      assert.ok(!ros.has(pid), `${id}: ruled-out ${pid} is on a simulated roster`);
      for (const r of g.runs) assert.ok(!JSON.stringify(r.events).includes(`"${pid}"`), `${id} run ${r.runIndex}: ruled-out ${pid} appears in an event`);
    }
  }
  assert.equal(out, 9, "2 + 5 + 2 ruled-out players on the 10-29 lane");
});

test("NBA central scenario: chosen from the engine's own pool WITHOUT the official side (never forced to agree with the favourite)", () => {
  // CLE @ ATL: ATL is the official (Elo) favourite at 55.3%, but the engine's own 1,000 games give ATL 44.1%; the page used
  // to open on run 388, ATL 107–87. The central scenario is run 121, CLE 130–103 (pool medians ATL 115, CLE 118).
  const expected = { "401909893": [121, "upset", 0.441], "401909894": [13, "default", 0.643], "401909895": [829, "default", 0.656] };
  for (const id of NBA_IDS) {
    const g = gameOf(id);
    const c = centralScenario(g);
    assert.deepEqual([c.runIndex, c.kind, c.poolHomeWinShare], expected[id], id);
    const flipped = { ...g, official: { ...g.official, winnerSide: g.official.winnerSide === "HOME" ? "AWAY" : "HOME" } };
    assert.deepEqual(centralScenario(flipped), c, `${id}: the official side does not move the central scenario`);
    assert.deepEqual(centralScenario({ ...g, runs: [...g.runs].reverse() }), c, `${id}: order-independent`);
    const load = loadPublicPossessionTheater(REPO, id, { date: NBA_DATE });
    assert.equal(load.ok, true, JSON.stringify(load.error));
    assert.equal(load.payload.selection.defaultKind, c.kind, `${id}: the page opens on the central scenario`);
    assert.ok(load.payload.runs.every((r) => r.hypothetical === true), `${id}: every run is a hypothetical scenario`);
    assert.ok(load.payload.runs.every((r) => !/official/i.test(r.title) && !/official/i.test(r.role)), `${id}: no run is titled official`);
  }
});

test("NBA one official forecast: every number the in-Theater Official Forecast panel prints is the lane's (canonical accessor), incl. the Elo estimate", () => {
  for (const id of NBA_IDS) {
    const load = loadPublicPossessionTheater(REPO, id, { date: NBA_DATE });
    const o = load.payload.official;
    const lg = laneOf(id);
    assert.equal(o.favouredSide === "HOME" ? lg.home.abbr : lg.away.abbr, lg.elo.favoured);
    const rows = new Map(["home", "away"].flatMap((s) => lg.players[s].map((p) => [String(p.providerAthleteId), p])));
    assert.equal(o.players.length, rows.size);
    for (const p of o.players) {
      const l = rows.get(p.playerId);
      assert.ok(l, `${id}: ${p.playerId} is a lane row`);
      for (const f of ["pts", "reb", "ast", "threePm"]) assert.equal(p.medians[f], l.medians[f], `${id} ${p.playerId} ${f}`);
      assert.equal(p.expectedMinutes, l.expectedMinutes, `${id} ${p.playerId} minutes`);
    }
    const elo = eloWinProbabilityOf(lg);
    assert.ok(elo, `${id}: the 10-29 lane carries the Elo estimate`);
    const teams = load.payload.teams;
    const h = html(React.createElement(OfficialProjectionPanel, { official: o, teams }));
    const t = unescape(h.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
    assert.ok(t.includes(eloWinProbabilityText(elo)), `${id}: the panel prints the accessor's Elo text`);
    assert.match(h, new RegExp(`data-nba-elo-wp="${id}:${elo.home}"`));
    assert.ok(!/Win probability Withheld/.test(t), `${id}: no "Withheld" beside a shown Elo estimate`);
    // every printed player cell is the lane's number at 1 dp
    for (const side of ["away", "home"]) {
      const tbl = h.slice(h.indexOf(`data-nbp-official-players="${side}"`));
      const body = tbl.slice(tbl.indexOf("<tbody>"), tbl.indexOf("</tbody>"));
      const printed = [...body.matchAll(/<tr><td>[^<]*<\/td><td>([^<]*)<\/td><td>([^<]*)<\/td><td>([^<]*)<\/td><td>([^<]*)<\/td><td>([^<]*)<\/td><\/tr>/g)].map((m) => m.slice(1));
      const want = o.players.filter((p) => p.team === side).map((p) => { const l = rows.get(p.playerId); return [fmt1(l.expectedMinutes), fmt1(l.medians.pts), fmt1(l.medians.reb), fmt1(l.medians.ast), fmt1(l.medians.threePm)]; });
      assert.deepEqual(printed, want, `${id} ${side}: printed official cells`);
    }
  }
});

// ── NFL week 8 ──────────────────────────────────────────────────────────────────────────────────────────────────────
const NFL_WEEK8 = ["401873023", "401873024", "401873025", "401873026", "401873027", "401873028", "401873029", "401873030", "401873031", "401873032", "401873033", "401873034", "401873035", "401873036"];
const SEEDS = 300;
const SHADOW = readShadowReceipts(REPO);
const COMPILED = compileParams(readJson("data/internal/research/nfl/sim-v2/drive-params-2015-2025.json"));
const ROLE = readJson("data/internal/research/nfl/role-shares-v1/current.json");
const INJ = readJson("data/internal/research/injuries/nfl/latest.json");
const BLOCKED = new Set((INJ.entries ?? []).filter((e) => e?.athleteId && isBlockingStatus(e.status)).map((e) => `nfl-athlete-${e.athleteId}`));
const { active: ACTIVE } = activeRosterIndex(readJson("app/public/data/nfl/rosters/latest.json"));

/** The build script's own input recipe (build-nfl-sim-v2-shadow.mjs): blocked or off-roster players get no slot. */
function nflInputs(eventId, home, away) {
  const boardPath = path.join(REPO, `app/public/data/nfl/player-board/${eventId}.json`);
  const board = fs.existsSync(boardPath) ? JSON.parse(fs.readFileSync(boardPath, "utf8")) : null;
  const team = (abbr) => {
    const block = ROLE.teams?.[abbr] ?? null;
    const onRoster = ACTIVE.get(abbr);
    const excluded = new Set();
    for (const k of ["passAttempts", "targets", "rushAttempts"]) for (const p of block?.[k]?.players ?? []) if (BLOCKED.has(p.playerId) || (onRoster && !onRoster.has(p.playerId))) excluded.add(p.playerId);
    const qbs = (board?.players ?? []).filter((p) => p.team === abbr && p.markets?.player_pass_yds);
    return { input: playersFromRoleShares(block, excluded, { starterQb: qbs.length === 1 ? qbs[0].playerId : null }), excluded };
  };
  return [team(home), team(away)];
}

test(`NFL week 8 (14 games incl. CAR @ GB): ${SEEDS} seeds per game — full coherence contract, explicit accounting identities, inactive players, determinism`, () => {
  let checked = 0, excludedTotal = 0;
  for (const id of NFL_WEEK8) {
    const rec = simulationOfRecord(SHADOW, id);
    assert.ok(rec, `${id}: a receipt of record exists`);
    const r = rec.receipt;
    assert.equal(r.validation.failedRuns, 0, `${id}: the committed receipt reports 0 incoherent runs of ${r.runCount}`);
    const sides = nflInputs(id, r.home.abbr, r.away.abbr);
    const prep = sides.map((s) => prepareTeamPlayers(s.input));
    for (const [i, s] of sides.entries()) {
      excludedTotal += s.excluded.size;
      for (const pid of s.excluded) assert.ok(!prep[i].slots.some((x) => x.playerId === pid), `${id}: excluded ${pid} holds a slot`);
    }
    const tables = [tiltedTable(COMPILED, r.calibration.thetas[0]), tiltedTable(COMPILED, r.calibration.thetas[1])];
    const mkOut = () => ({ team: [new Float64Array(N_TSTAT), new Float64Array(N_TSTAT)], period: [new Float64Array(N_PERIODS), new Float64Array(N_PERIODS)], players: [new Float64Array((prep[0].n + 1) * N_PSTAT), new Float64Array((prep[1].n + 1) * N_PSTAT)] });
    const out = mkOut(), again = mkOut();
    const postseason = false;
    for (let i = 0; i < SEEDS; i++) {
      const run = simulateGame({ compiled: COMPILED, tables, players: prep, rng: runRng(r.baseSeed, i), postseason, out });
      assert.deepEqual(checkRun({ team: out.team, period: out.period, players: out.players, slots: [prep[0].n, prep[1].n], run }), [], `${id} seed ${i}`);
      for (const side of [0, 1]) {
        const T = (k) => out.team[side][TEAM_STAT[k]];
        const PL = out.players[side];
        const sum = (s) => { let a = 0; for (let p = 0; p <= prep[side].n; p++) a += PL[p * N_PSTAT + s]; return a; };
        assert.equal(sum(PSTAT.rec), T("cmp"), "completions = Σ receptions");
        assert.equal(sum(PSTAT.recYds), T("passYds"), "gross passing yards = Σ receiving yards");
        assert.equal(sum(PSTAT.passYds), T("passYds"), "gross passing yards = Σ passer yards");
        assert.equal(sum(PSTAT.rushYds) - T("rushYds"), 0, "team rushing yards = Σ player rushing yards (tolerance 0)");
        assert.equal(sum(PSTAT.rushAtt), T("rushAtt"), "carries (incl. scrambles) = rush attempts");
        assert.ok(T("scrambles") <= T("rushAtt"), "every scramble is a carry");
        assert.ok(T("sacks") >= 0 && T("sackYds") >= 0 && (T("sacks") > 0 || T("sackYds") === 0), "sack yards only with sacks");
        assert.equal(sum(PSTAT.targets), T("passAtt"), "a sack is not a pass attempt: targets = attempts");
        assert.equal(T("pts"), run.score[side]);
      }
      if (run.score[0] !== run.score[1]) assert.equal(run.tie, false, "a decided game is not a tie");
      else assert.equal(run.ot, true, "a tie only after overtime");
      const winner = run.score[0] > run.score[1] ? 0 : run.score[1] > run.score[0] ? 1 : null;
      assert.equal(winner === null, run.tie);
      if (i % 50 === 0) {
        const run2 = simulateGame({ compiled: COMPILED, tables, players: prep, rng: runRng(r.baseSeed, i), postseason, out: again });
        assert.deepEqual(run2, run, `${id} seed ${i}: same seed, same run`);
        assert.deepEqual([...again.team[0], ...again.team[1]], [...out.team[0], ...out.team[1]]);
      }
      checked += 1;
    }
  }
  assert.equal(checked, NFL_WEEK8.length * SEEDS);
  assert.ok(excludedTotal > 0, "the week has excluded (inactive) players, and none of them is simulated");
});

test("NFL week 8 one official forecast: every number the Theater prints under 'Official Forecast' is the game page's, from the same snapshot", () => {
  let compared = 0;
  for (const id of NFL_WEEK8) {
    const t = loadTheater(REPO, id, SHADOW);
    const view = loadForecastView(path.join(APP, "public"), id);
    assert.ok(view, `${id}: the game page has a view`);
    if (!t.ok || !t.manifest?.representative?.official) continue;
    const rep = t.manifest.representative;
    assert.equal(rep.snapshotId, view.official.snapshotId, `${id}: one snapshot id on both pages`);
    const teams = t.manifest.teams;
    const card = html(React.createElement(OfficialForecastCard, { manifest: t.manifest, teams }));
    const cell = (attr) => { const m = card.match(new RegExp(`${attr}="">([^<]*)<`)); return m ? unescape(m[1]) : null; };
    const rec = view.record;
    assert.equal(cell("data-st-official-win"), `${teams.away.abbr} ${L.fmtPct(rec.winProbability.away)} · ${teams.home.abbr} ${L.fmtPct(rec.winProbability.home)}`, `${id}: win probability`);
    assert.equal(formatValue("probability", rec.winProbability.home), L.fmtPct(rec.winProbability.home), "same rounding as the game page");
    assert.equal(cell("data-st-official-score"), `${teams.away.abbr} ${rec.projectedScore.away} – ${rec.projectedScore.home} ${teams.home.abbr}`, `${id}: projected score`);
    assert.equal(cell("data-st-official-margin"), L.fmtExpectation(rec.margin.median), `${id}: margin median`);
    assert.equal(cell("data-st-official-total"), L.fmtExpectation(rec.total.median), `${id}: total median`);
    // the comparison's Official Forecast column: the same published numbers, for the central run
    const cmp = html(React.createElement(OfficialComparison, { manifest: t.manifest, final: { home: 30, away: 10 }, teams, hypothetical: false }));
    const col = [...cmp.matchAll(/data-st-official-exp="">([^<]*)</g)].map((m) => m[1]);
    assert.deepEqual(col, [rec.projectedScore.away, rec.projectedScore.home, rec.margin.median, rec.total.median].map((v) => L.fmtExpectation(v)), `${id}: comparison column`);
    // and no run is titled official
    assert.ok(!/official representative/i.test(unescape(card + cmp).replace(/<[^>]+>/g, " ")));
    compared += 1;
  }
  assert.ok(compared >= 1, "at least one week-8 Theater compared");
  assert.ok(loadTheater(REPO, "401873023", SHADOW).ok, "CAR @ GB is among them");
});
