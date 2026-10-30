/**
 * NFL forecast view guards (founder directive 2026-10-08 — one NFL forecast experience; founder decision 2026-10-20 —
 * the NFL player board is the OFFICIAL player projection, World Model V2 a labelled SUPPORTING simulation only):
 *   - every board row IS the game page's row (same object values, same official snapshot, same rounding)
 *   - each family has exactly one source — the official board; World Model V2 never supplies a row or a rank
 *   - the supporting simulation carries its label, version, input hash and the older-revision notice
 *   - no official projection => "No official projection", never a World Model V2 stand-in; joins by nfl-athlete-* id only
 *   - Out / Questionable / Doubtful never rank; started games drop off; fewer than ten rather than fill
 *   - unsupported families (passing TDs, first TD) carry a reason and never a number
 *   - the game outcome is the forecast of record, shown as itself; the simulation keeps its own counted win share
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { topBoards, gameView, gameTabs, boardTabs, formatValue, PLAYER_FAMILIES, CLEARED, SOURCES, SUPPORTING_LABEL, MARKET_KEY, ESTIMATE_NOTE, NOT_CLEARED_GAME, notClearedBoardNote, simulatedShareNote } from "./forecast-view.mjs";
import { loadForecastViews, officialSnapshotFor, publicRecordOf } from "./forecast-view-load.mjs";
import { unionFrozenForecasts } from "./public-forecast-union.mjs";
import { readWorldModelArtifacts } from "./world-model-v2/read.mjs";
import { PUBLIC_BOARD_CLEARED } from "./board-ranking.mjs";

const APP = process.cwd();
const views = loadForecastViews(path.join(APP, "public"));
const before = views.length ? new Date(Date.parse(views[0].kickoffUtc) - 60_000).toISOString() : new Date().toISOString();

test("every published game has a view; the game outcome is the forecast of record, shown as itself", () => {
  const forecasts = JSON.parse(fs.readFileSync(path.join(APP, "public/data/nfl/forecasts/latest.json"), "utf8")).forecasts;
  for (const f of forecasts) {
    const v = views.find((x) => x.providerEventId === f.providerEventId);
    assert.ok(v, `${f.matchup} has a view`);
    assert.deepEqual(v.record.projectedScore, f.forecastSummary.projectedScore);
    assert.equal(v.record.winProbability.home, f.forecastSummary.winProbability.home, "win chance is the forecast of record, never the simulated share");
    assert.equal(v.record.source.key, "record");
    if (v.simulation) {
      assert.equal(v.simulation.source.key, "worldModel");
      assert.equal(v.simulation.role, "SUPPORTING_SIMULATION");
      assert.equal(v.simulation.label, SUPPORTING_LABEL);
      assert.equal(v.simulation.official, false);
      assert.equal(v.simulation.graded, false);
      assert.ok(!("forecastOfRecord" in v.simulation), "World Model V2's embedded copy of the record is never carried into the view");
      const w = v.simulation.winProbability;
      assert.ok(Math.abs(w.home + w.away + w.tie - 1) < 2e-4, "the simulated share is its own count");
    }
  }
});

test("each family has exactly one source, and unsupported families carry a reason instead of a number", () => {
  const keys = PLAYER_FAMILIES.map((f) => f.key);
  assert.deepEqual(keys, ["passingYards", "rushingYards", "receivingYards", "receptions", "anytimeTd", "passingTd", "firstTd"]);
  for (const f of PLAYER_FAMILIES) {
    if (f.source) assert.ok(SOURCES[f.source], `${f.key} names a known source`);
    else assert.ok(f.withheld && f.withheld.length > 40, `${f.key} explains why it is not published`);
  }
  for (const f of PLAYER_FAMILIES) if (f.source) assert.equal(SOURCES[f.source].role, "OFFICIAL", `${f.key}: the source of record is official`);
  for (const v of views) for (const p of v.players) {
    assert.match(p.playerId, /^nfl-athlete-\d+$/, "rows are keyed by owner id");
    for (const [k, e] of Object.entries(p.families)) {
      const fam = PLAYER_FAMILIES.find((f) => f.key === k);
      assert.ok(fam?.source, `${p.name} carries ${k}, which has no source`);
      assert.equal(e.source, fam.source, `${p.name} ${k} comes from ${e.source}, not its source of record ${fam.source}`);
      assert.notEqual(e.source, "worldModel", "World Model V2 never supplies an official row");
      assert.equal(e.snapshotId, v.official.snapshotId, "every row reads the game's one official snapshot");
    }
    assert.ok(!("passingTd" in p.families) && !("firstTd" in p.families), "no number for an unsupported family");
  }
});

test("board rows ARE the game-page rows — same values, same run, same rounding", () => {
  const { boards } = topBoards(views, { now: before });
  let checked = 0;
  for (const fam of PLAYER_FAMILIES) {
    const b = boards[fam.key];
    if (!fam.source) { assert.equal(b.rows.length, 0); assert.ok(b.withheld); continue; }
    assert.ok(b.rows.length <= 10, "a board is at most ten rows");
    b.rows.forEach((r, i) => {
      assert.equal(r.rank, i + 1);
      if (i) assert.ok(b.rows[i - 1].entry.value >= r.entry.value, "ranked by the projected value shown");
      const v = views.find((x) => x.providerEventId === r.providerEventId);
      const onPage = gameTabs(v).lists[fam.key].find((x) => x.player.playerId === r.playerId);
      assert.ok(onPage, `${r.name} is on his game page's ${fam.key} list`);
      assert.deepEqual(boardTabs(boards).lists[fam.key][i].entry, onPage.entry, `${r.name} ${fam.key}: board number = game-page number`);
      assert.equal(formatValue(fam.kind, r.entry.value), formatValue(fam.kind, onPage.entry.value), "same rounding");
      assert.equal(r.entry.snapshotId, v.official.snapshotId, "same official snapshot");
      assert.notEqual(r.entry.source, "worldModel", "no supporting-simulation number ranks");
      checked += 1;
    });
  }
  assert.ok(checked >= 20, `parity checked on ${checked} rows`);
});

test("only cleared players rank: Out, Inactive, Questionable and Doubtful never appear on a board", () => {
  assert.deepEqual(CLEARED, [...PUBLIC_BOARD_CLEARED, "ACTIVE"], "the shared allowlist, extended only by World Model V2's ACTIVE");
  const { boards } = topBoards(views, { now: before });
  for (const b of Object.values(boards)) for (const r of b.rows) {
    assert.equal(r.cleared, true);
    for (const a of r.availability) assert.ok(CLEARED.includes(a.state), `${r.name} ranked while ${a.state} (${a.source})`);
    assert.equal(r.availabilityLabel, null);
  }
  // probe: a questionable player on the official board is not cleared
  const probe = view({ board: board({ families: { anytime_td: { state: "PUBLISHED" } }, players: [{ playerId: "nfl-athlete-1", name: "Q", team: "A", participation: "QUESTIONABLE", markets: { anytime_td: { probability: 0.5 } } }] }) });
  assert.equal(probe.players[0].cleared, false);
  assert.equal(topBoards([probe], { now: "2098-01-01T00:00Z" }).boards.anytimeTd.rows.length, 0, "fewer than ten rather than fill — here none");
});

test("a game that has kicked off drops off every board", () => {
  if (!views.length) return;
  const first = views[0];
  const { boards } = topBoards(views, { now: new Date(Date.parse(first.kickoffUtc) + 1000).toISOString() });
  for (const b of Object.values(boards)) assert.ok(!b.rows.some((r) => r.providerEventId === first.providerEventId));
});

test("anytime touchdown comes only from the published touchdown model, never from the simulated games", () => {
  for (const v of views) for (const p of v.players) {
    if (p.families.anytimeTd) assert.equal(p.families.anytimeTd.source, "opportunityTd");
  }
  const src = fs.readFileSync(path.join(APP, "src/lib/sports/nfl/forecast-view.mjs"), "utf8");
  assert.ok(!/anytimeTd_NOT_VALIDATED|recTd|rushTd/.test(src.slice(src.indexOf("export function playerRows"), src.indexOf("function availabilityLabel"))), "no world touchdown marginal is read");
});

test("one rounding rule: yards whole, receptions one decimal, probabilities one decimal percent", () => {
  assert.equal(formatValue("yards", 84.6), "85");
  assert.equal(formatValue("count", 7.43), "7.4");
  assert.equal(formatValue("probability", 0.7251), "72.5%");
  assert.equal(formatValue("yards", null), "—");
});

test("the view is deterministic: the same documents give the same view", () => {
  const again = loadForecastViews(path.join(APP, "public"));
  assert.deepEqual(JSON.parse(JSON.stringify(again)), JSON.parse(JSON.stringify(views)));
});

test("a game without a simulation shows the official board's families; a withheld board family stays withheld", () => {
  const v = view({ board: board({ families: { player_rush_yds: { state: "PUBLISHED" }, player_pass_yds: { state: "WITHHELD" }, anytime_td: { state: "PUBLISHED" } }, players: [{ playerId: "nfl-athlete-9", name: "R", team: "A", participation: "AVAILABLE_ROLE_UNCERTAIN", markets: { player_rush_yds: { mean: 60, median: 55, p10: 20, p90: 100 }, player_pass_yds: { mean: 200, median: 210, p10: 100, p90: 300 }, anytime_td: { probability: 0.4 } } }] }) });
  assert.equal(v.simulation, null);
  assert.equal(v.players[0].families.rushingYards.source, "playerBoard");
  assert.ok(!v.players[0].families.passingYards, "a withheld board family stays withheld");
  const tabs = gameTabs(v);
  assert.match(tabs.families.find((x) => x.key === "rushingYards").sourceLabel, /Official player board/, "the list names its official source");
});

/* ── founder decision 2026-10-20 · the official board wins; World Model V2 is supporting only ─────────────────────── */

test("OFFICIAL · every committed row equals the official snapshot's stored headline, exactly (no rounding in the view)", () => {
  const pub = path.join(APP, "public");
  const data = path.join(pub, "data/nfl");
  const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
  const art = unionFrozenForecasts(readJson(path.join(data, "forecasts/latest.json")), readJson(path.join(data, "forecasts/frozen-latest.json")));
  const worlds = new Map(readWorldModelArtifacts(pub).map((a) => [a.identity.providerEventId, a]));
  let checked = 0;
  for (const pubF of art?.forecasts ?? []) {
    // the record the page stands on: an excluded public copy is replaced by its recordInstead (record-exclusions.mjs)
    const f = publicRecordOf(pubF, path.resolve(APP, "..")) ?? pubF;
    const v = views.find((x) => x.providerEventId === f.providerEventId);
    const { snapshot } = officialSnapshotFor(f, readJson(path.join(data, "player-board", `${f.providerEventId}.json`)), worlds.get(String(f.providerEventId)) ?? null);
    if (!snapshot) { assert.equal(v.players.length, 0, `${f.matchup}: no official snapshot means no official rows`); continue; }
    assert.equal(v.official.snapshotId, snapshot.snapshotId);
    for (const p of v.players) for (const [k, e] of Object.entries(p.families)) {
      const o = snapshot.players.find((x) => x.playerId === p.playerId).families[MARKET_KEY[k]];
      const want = k === "anytimeTd" ? o.expected : o.median; // receptions headline the median since 2026-10-29 (one definition everywhere)
      assert.equal(e.value, want, `${p.name} ${k}: the view carries the snapshot's stored number exactly`);
      checked += 1;
    }
  }
  assert.ok(checked > 50, `checked ${checked} official values`);
});

test("OFFICIAL · World Model V2 never becomes the official number, even when it projects the same player higher", () => {
  const v = view({
    board: board({ players: [bp(1, "A", { player_rush_yds: { mean: 61.3, median: 55.37, p10: 20, p90: 100 } }), bp(2, "B", { player_rush_yds: { mean: 40, median: 41, p10: 10, p90: 80 } })] }),
    world: world({ players: [wp(1, "A", { rushingYards: { median: 300, mean: 310, p10: 200, p90: 400 } }), wp(3, "A", { rushingYards: { median: 250, mean: 255, p10: 150, p90: 350 } })] }),
  });
  const r1 = v.players.find((p) => p.playerId === "nfl-athlete-1");
  assert.equal(r1.families.rushingYards.value, 55.37, "the board's median, unrounded — not World Model V2's 300");
  assert.equal(r1.families.rushingYards.source, "playerBoard");
  assert.equal(formatValue("yards", r1.families.rushingYards.value), "55", "rounded at render only");
  assert.ok(!v.players.some((p) => p.playerId === "nfl-athlete-3"), "a player only World Model V2 simulates gets no official row");
  const { boards } = topBoards([v], { now: "2098-01-01T00:00Z" });
  assert.deepEqual(boards.rushingYards.rows.map((r) => [r.playerId, r.entry.value]), [["nfl-athlete-1", 55.37], ["nfl-athlete-2", 41]], "ranked by the official projection only");
  for (const p of v.players) assert.equal(Object.values(p.families).every((e) => e.source !== "worldModel"), true, "no row mixes in a World Model V2 number");
});

test("OFFICIAL · a player or family the board does not project reads 'No official projection', never a World Model V2 stand-in", () => {
  const v = view({
    board: board({ players: [bp(1, "A", { player_rush_yds: { mean: 50, median: 48, p10: 20, p90: 90 } })] }),
    world: world({ players: [wp(1, "A", { rushingYards: { median: 60, mean: 62 }, receivingYards: { median: 12, mean: 14 } }), wp(3, "B", { rushingYards: { median: 250, mean: 255 } })] }),
  });
  const tabs = gameTabs(v);
  assert.deepEqual(tabs.unprojected.rushingYards.map((x) => x.playerId), ["nfl-athlete-3"]);
  assert.deepEqual(tabs.unprojected.receivingYards.map((x) => x.playerId), ["nfl-athlete-1"], "the board has no receiving projection for him: named, not numbered");
  assert.equal(tabs.lists.receivingYards.length, 0);
  assert.ok(!JSON.stringify(tabs.unprojected).includes("250"), "no simulated number travels with the absence");
  // no official snapshot at all (board written after kickoff) => no official rows, the refusal is recorded
  const late = view({ board: board({ generatedAt: "2099-01-01T00:30:00Z", players: [bp(1, "A", { player_rush_yds: { mean: 50, median: 48 } })] }), world: world({ players: [wp(1, "A", { rushingYards: { median: 60, mean: 62 } })] }) });
  assert.equal(late.official.refusal, "BOARD_AFTER_LOCK");
  assert.equal(late.players.length, 0);
  assert.equal(topBoards([late], { now: "2098-01-01T00:00Z" }).boards.rushingYards.rows.length, 0, "and nothing ranks");
  const page = fs.readFileSync(path.join(APP, "src/app/nfl/game/[eventId]/page.tsx"), "utf8");
  assert.match(page, /emptyText="No official projection for this statistic in this game\."/);
  assert.match(fs.readFileSync(path.join(APP, "src/components/nfl/forecast/family-tabs.tsx"), "utf8"), /No official projection: \{none\.map/);
});

test("OFFICIAL · joins are by nfl-athlete-* id only — a matching name never joins, a row without an id is excluded", () => {
  const v = view({
    board: board({ players: [bp(1, "A", { player_rush_yds: { mean: 50, median: 48 } }, "Same Name"), { name: "No Id", team: "A", participation: "AVAILABLE_ROLE_UNCERTAIN", markets: { player_rush_yds: { mean: 99, median: 99 } } }] }),
    world: world({ players: [wp(7, "A", { rushingYards: { median: 70, mean: 71 } }, "Same Name")] }),
  });
  assert.deepEqual(v.players.map((p) => p.playerId), ["nfl-athlete-1"], "the id-less board row never becomes a row");
  assert.equal(v.players[0].families.rushingYards.value, 48, "the same-named simulated player is not merged in");
  assert.deepEqual(gameTabs(v).unprojected.rushingYards.map((x) => x.playerId), ["nfl-athlete-7"], "he is a different player (by id) with no official projection");
});

test("SUPPORTING · World Model V2 is labelled, versioned, hashed, and says when it was built on an older forecast revision", () => {
  const stale = view({ board: board({ players: [] }), world: world({ inputHash: "aaaa1111", forecastGeneratedAt: "2098-12-31T20:00:00Z" }) });
  assert.equal(stale.simulation.label, SUPPORTING_LABEL);
  /* REPOINTED overnight W8 (2026-10-28): the label pinned the internal engine name in the public reading path. The two
     claims that matter — not the official projection, not graded — are still required verbatim (the consistency audit
     keys its "labelled supporting simulation" check on the phrase "not the official projection"); the engine name moved to the
     panel's Technical details (asserted below). */
  assert.equal(SUPPORTING_LABEL, "Supporting simulation (not the official projection · not graded)");
  assert.equal(stale.simulation.version, "2.2.0");
  assert.equal(stale.simulation.inputHash, "aaaa1111");
  assert.equal(stale.simulation.recordInputHash, "rec00001");
  assert.equal(stale.simulation.alignedWithRecord, false);
  assert.match(stale.simulation.revisionNotice, /^Built on an older forecast revision: these simulated games used forecast input aaaa1111, not the forecast of record's rec00001\./);
  assert.ok(!("forecastOfRecord" in stale.simulation), "its embedded record copy is not displayed");
  const fresh = view({ board: board({ players: [] }), world: world({ inputHash: "rec00001" }) });
  assert.equal(fresh.simulation.alignedWithRecord, true);
  assert.equal(fresh.simulation.revisionNotice, null);
  const panel = fs.readFileSync(path.join(APP, "src/components/nfl/forecast/simulation-panel.tsx"), "utf8");
  assert.match(panel, /\{sim\.label\}/, "the panel prints the shared label");
  assert.match(panel, /sim\.revisionNotice \?/, "and the notice when there is one");
  assert.match(panel, /\{sim\.inputHash \?\? "not recorded"\}/, "and its input hash");
  assert.match(panel, /<MoreDisclosure title="Technical details"[\s\S]*World Model V2 \{sim\.version\}[\s\S]*\{sim\.inputHash \?\? "not recorded"\}[\s\S]*<\/MoreDisclosure>/, "engine name, version and input hash sit inside Technical details");
  const page = fs.readFileSync(path.join(APP, "src/app/nfl/game/[eventId]/page.tsx"), "utf8");
  assert.ok(page.indexOf('<section id="players"') < page.indexOf("<SimulationPanel"), "the official projections come before the supporting simulation");
});

/*
 * Founder P0 2026-10-30 — restore the established ESTIMATE pathway. From 2026-10-28 an ESTIMATE family carried no row
 * ("Not published yet"); the written policy (family-publication.mjs ESTIMATE DISPLAY POLICY) is display WITH the failed bar
 * and caveat, never as a pick. The family's rows render again, each `familyState: "ESTIMATE"`, under the ONE label, with
 * no captured price beside them; PUBLISHED families are untouched.
 */
test("ESTIMATE · a family the board marks ESTIMATE renders its rows under the one label, no price, never promoted", () => {
  const reason = "SECOND_LOOK_REJECTED — failed bar: threshold calibration";
  const v = view({ board: board({ families: { player_pass_yds: { state: "ESTIMATE", reason, caveat: "read the range, not a precise over/under chance." }, player_rush_yds: { state: "PUBLISHED" } }, players: [bp(1, "A", { player_pass_yds: { mean: 230, median: 228, p10: 150, p90: 300, market: { sportsbook: "draftkings", line: 224.5, overOdds: -110, underOdds: -110, capturedAt: "2026-10-01T00:00:00Z" } }, player_rush_yds: { mean: 20, median: 18 } })] }) });
  const e = v.players[0].families.passingYards;
  assert.equal(e.value, 228, "the board's median, exact");
  assert.equal(e.familyState, "ESTIMATE", "never relabelled PUBLISHED");
  assert.equal(e.estimateLabel, "Estimate · calibration standard not yet met");
  assert.equal(e.market, null, "no sportsbook line beside an estimate (no side can be read)");
  assert.equal(v.players[0].families.rushingYards.value, 18, "a published family is untouched");
  assert.equal(v.players[0].families.rushingYards.estimateLabel, undefined);
  assert.deepEqual(v.estimates.passingYards.label, "Estimate · calibration standard not yet met");
  assert.deepEqual(v.notCleared, {});
  const tabs = gameTabs(v);
  const pass = tabs.families.find((x) => x.key === "passingYards");
  assert.equal(tabs.lists.passingYards.length, 1);
  assert.equal(pass.withheld, null);
  assert.equal(pass.estimate, "Estimate · calibration standard not yet met");
  assert.match(pass.estimateDetail, /^Read the range, not a precise over\/under chance\. Evaluation: /);
  assert.equal(tabs.families.find((x) => x.key === "rushingYards").estimate, null);
  const bt = boardTabs(topBoards([v], { now: "2098-01-01T00:00Z" }).boards);
  assert.equal(bt.lists.passingYards.length, 1, "the view's Top board ranks the same estimate row");
  assert.equal(bt.families.find((x) => x.key === "passingYards").estimate, "Estimate · calibration standard not yet met");
  assert.equal(bt.families.find((x) => x.key === "passingYards").notCleared, null);
  assert.ok(ESTIMATE_NOTE.some.length > 20);
  assert.ok(NOT_CLEARED_GAME && notClearedBoardNote(1, 2));
});

test("ESTIMATE · the supporting simulation's players are not listed under a family that is not published", () => {
  const w = world({ players: [wp(1, "A", { passingYards: { median: 240 } }), wp(2, "A", { receivingYards: { median: 50 } })] });
  const b = board({ families: { player_pass_yds: { state: "ESTIMATE" }, player_reception_yds: { state: "PUBLISHED" }, anytime_td: { state: "PUBLISHED" } }, players: [bp(1, "A", { player_pass_yds: { mean: 230, median: 228 } })] });
  const v = view({ board: b, world: w });
  assert.equal(v.unprojected.passingYards, undefined, "the family as a whole is Not published yet — naming players under it would contradict that");
  assert.deepEqual(v.unprojected.receivingYards.map((x) => x.playerId), ["nfl-athlete-2"], "a published family still names who it does not project");
});

test("committed data · every official row is PUBLISHED or a board ESTIMATE carrying the one label; CHI @ SEA shows its passing and rushing estimates", () => {
  for (const v of views) {
    const board = JSON.parse(fs.readFileSync(path.join(APP, `public/data/nfl/player-board/${v.providerEventId}.json`), "utf8"));
    for (const p of v.players) for (const [k, e] of Object.entries(p.families)) {
      assert.ok(e.familyState === "PUBLISHED" || e.familyState === "ESTIMATE", `${v.matchup} ${p.name} ${k}: ${e.familyState}`);
      if (e.familyState === "ESTIMATE") {
        assert.equal(board.families[MARKET_KEY[k]].state, "ESTIMATE", `${v.matchup} ${k}: the board itself says ESTIMATE`);
        assert.match(e.estimateLabel, /^Estimate · (calibration|publication) standard not yet met$/);
        assert.equal(e.market, null);
      }
    }
    const tabs = gameTabs(v);
    for (const k of Object.keys(v.estimates)) {
      const f = tabs.families.find((x) => x.key === k);
      assert.equal(f.withheld, null, `${v.matchup} ${k}: not "Not published yet"`);
      if (tabs.lists[k].length) assert.equal(f.estimate, v.estimates[k].label, `${v.matchup} ${k}: one label`);
    }
  }
  const chiSea = views.find((v) => v.providerEventId === "401873036");
  if (!chiSea) return; // once CHI @ SEA leaves the union the generic loop above still holds
  const states = JSON.parse(fs.readFileSync(path.join(APP, "public/data/nfl/player-board/401873036.json"), "utf8")).families;
  for (const [k, mk] of [["passingYards", "player_pass_yds"], ["rushingYards", "player_rush_yds"]]) {
    if (states[mk]?.state !== "ESTIMATE") continue;
    assert.ok(chiSea.estimates[k], `CHI @ SEA ${k} is an estimate`);
    assert.ok(chiSea.players.some((p) => p.families[k]?.familyState === "ESTIMATE"), `CHI @ SEA ${k}: its estimates are on the page`);
  }
});

test("the simulated share says 'matches' only when both sides print the same; otherwise both pairs and the tie-mass reason", () => {
  const same = simulatedShareNote({ home: 0.6561, away: 0.3439, tie: 0 }, { home: 0.6564, away: 0.3436 }, { away: "CHI", home: "SEA" });
  assert.equal(same, "This share is counted from the simulated games and matches the headline win chance.");
  // the Production case: home within half a point, away 2.5 points apart, ~3% tie mass unallocated by the official forecast
  const chiSea = simulatedShareNote({ home: 0.657, away: 0.341, tie: 0.002 }, { home: 0.656, away: 0.316, tieMass: 0.028 }, { away: "CHI", home: "SEA" });
  assert.doesNotMatch(chiSea, /matches/);
  assert.match(chiSea, /CHI 34\.1% · SEA 65\.7%/);
  assert.match(chiSea, /CHI 31\.6% · SEA 65\.6%/);
  assert.match(chiSea, /leaves the 2\.8% chance of a tie after regulation unallocated/);
  assert.match(chiSea, /differ by 2\.5 points for CHI and 0\.1 points for SEA\.$/);
  const noTie = simulatedShareNote({ home: 0.6, away: 0.4 }, { home: 0.62, away: 0.38, tieMass: 0 }, { away: "A", home: "B" });
  assert.doesNotMatch(noTie, /tie after regulation/, "no tie-mass claim when the forecast states none");
  const panel = fs.readFileSync(path.join(APP, "src/components/nfl/forecast/simulation-panel.tsx"), "utf8");
  assert.match(panel, /\{simulatedShareNote\(w, recordWin, \{ away, home \}\)\}/, "the panel prints this sentence and no other");
  assert.doesNotMatch(panel, /matches the headline win chance/, "the claim lives in one place");
  for (const v of views.filter((x) => x.simulation)) {
    const r = v.record.winProbability;
    const n = simulatedShareNote(v.simulation.winProbability, { home: r.home, away: r.away, tieMass: r.tieAfterRegulation }, { away: v.away.abbr, home: v.home.abbr });
    const pct = (p) => `${(p * 100).toFixed(1)}%`;
    if (/matches/.test(n)) assert.ok(pct(v.simulation.winProbability.home) === pct(r.home) && pct(v.simulation.winProbability.away) === pct(r.away), `${v.matchup}: "matches" printed for shares that differ`);
  }
});

test("RESULTS INTEGRITY · every surface that shows World Model V2 player numbers says the existing results do not grade them", () => {
  const note = fs.readFileSync(path.join(APP, "src/lib/sports/nfl/results-coverage.mjs"), "utf8");
  assert.match(note, /not graded in these results, so none of these results describe them/);
  assert.doesNotMatch(note, /were on each page/, "from Week 5 the board's ranges are not what the game pages show");
  for (const rel of ["src/app/results/nfl/page.tsx", "src/components/nfl/forecast/methodology.tsx", "src/components/nfl/forecast/model-status.tsx"]) {
    assert.match(fs.readFileSync(path.join(APP, rel), "utf8"), /\{NFL_RESULTS_COVERAGE_NOTE\}/, `${rel} renders the shared results-coverage note`);
  }
  // and the historical grades are untouched: the results page still grades the player board's own published ranges
  assert.match(fs.readFileSync(path.join(APP, "src/app/results/nfl/page.tsx"), "utf8"), /each graded exactly as we published it before kickoff/);
});

test("ONE MARKET TRUTH · a captured sportsbook price reaches the row unchanged, whichever model supplies the projection", () => {
  let priced = 0;
  for (const v of views) {
    const board = JSON.parse(fs.readFileSync(path.join(APP, "public/data/nfl/player-board", `${v.providerEventId}.json`), "utf8"));
    for (const p of v.players) for (const [k, e] of Object.entries(p.families)) {
      const m = board.players.find((x) => x.playerId === p.playerId)?.markets?.[e.marketKey]?.market ?? null;
      assert.ok(e.marketKey, `${p.name} ${k} names its canonical market key`);
      if (!m) { assert.equal(e.market, null, `${p.name} ${k}: no captured price, none invented`); continue; }
      priced += 1;
      assert.deepEqual({ book: e.market.sportsbook, line: e.market.line, over: e.market.overOdds, under: e.market.underOdds, yes: e.market.yesOdds },
        { book: m.sportsbook, line: m.line ?? null, over: m.overOdds ?? null, under: m.underOdds ?? null, yes: m.yesOdds ?? null }, `${p.name} ${k}: same book, line and prices as the artifact`);
    }
  }
  assert.ok(priced >= 0);
  const row = fs.readFileSync(path.join(APP, "src/components/nfl/forecast/player-row.tsx"), "utf8");
  assert.match(row, /className=\{`gtp-pred-row nf-row/, "a forecast row is a prediction row");
  assert.match(row, /data-family=\{e\.marketKey \?\? f\.key\} data-view-family=\{f\.key\} data-event=\{p\.providerEventId\}/, "with its canonical identity");
  assert.match(row, /bookmakerLabel\(e\.market\.sportsbook\)/, "and its book named");
});

/* ── fixtures: an official snapshot is built exactly as the loader builds it (officialSnapshotFor) ─────────────────── */
function forecastDoc() {
  return {
    providerEventId: "900001", matchup: "A @ B", kickoffUtc: "2099-01-01T00:15:00Z", generatedAt: "2098-12-31T23:00:00Z",
    home: { abbr: "B", name: "B" }, away: { abbr: "A", name: "A" },
    forecastSummary: { winProbability: { home: 0.5, away: 0.5 }, projectedScore: { home: 20, away: 20 }, margin: { median: 0, p10: -10, p90: 10 }, total: { median: 40, p10: 30, p90: 50 } },
    model: { id: "nfl-regular-season-public-v1", version: 2, inputHash: "rec00001" },
  };
}
function board({ families = { player_pass_yds: { state: "PUBLISHED" }, player_rush_yds: { state: "PUBLISHED" }, player_reception_yds: { state: "PUBLISHED" }, player_receptions: { state: "PUBLISHED" }, anytime_td: { state: "PUBLISHED" } }, players = [], generatedAt = "2098-12-31T23:30:00Z" } = {}) {
  return { providerEventId: "900001", schemaVersion: 1, generatedAt, families, players };
}
function bp(n, team, markets, name = `P${n}`) {
  return { playerId: `nfl-athlete-${n}`, name, team, position: "RB", participation: "AVAILABLE_ROLE_UNCERTAIN", markets };
}
function wp(n, team, families, name = `W${n}`) {
  return { playerId: `nfl-athlete-${n}`, name, team, availability: "ACTIVE", families };
}
function world({ players = [], inputHash = "aaaa1111", forecastGeneratedAt = "2098-12-31T20:00:00Z" } = {}) {
  return {
    identity: { providerEventId: "900001" }, model: { id: "nfl-world-model-v2", version: "2.2.0" }, simulationId: "sim1",
    run: { generatedAt: "2098-12-31T21:00:00Z", runs: 10000, inputs: { forecastInputHash: inputHash, forecastGeneratedAt } },
    forecastOfRecord: { winProbability: { home: 0.9 } },
    game: { winProbability: { home: 0.6, away: 0.38, tie: 0.02 }, overtime: { levelAfterRegulation: 0.05 }, margin: { median: 3 }, total: { median: 44 }, away: {}, home: {} },
    sampledWorlds: [], availability: [], unsupported: [], limitations: [], diagnostics: { teamWorldsChecked: 1, invariantViolations: 0 }, players,
  };
}
function view({ board: b, world: w = null }) {
  const f = forecastDoc();
  const { snapshot, refusal } = officialSnapshotFor(f, b, w);
  return gameView({ forecast: f, world: w, board: b, official: snapshot, officialRefusal: refusal });
}
