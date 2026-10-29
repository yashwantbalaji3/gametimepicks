/**
 * NBA DAILY TOP BOARDS (lane-top-boards.mjs) on the COMMITTED lane files (every date, incl. 2026-10-29; 10-30 when it is
 * committed): every ranked row's value == the lane median == the /nba/projections row == the official snapshot median
 * (1 dp, same receipt payload hash); order is the stated method; pregame only; a missing median is never a zero; the
 * board is gated off public routes until the founder decides.
 *
 * Run (from app/): npx tsx --test src/lib/sports/nba/lane-top-boards.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { buildLaneTopBoards, laneValue, NBA_LANE_TOP_BOARDS_PUBLICATION, NBA_LANE_BOARD_METHOD, NBA_LANE_TOP_BOARD_SIZE } from "./lane-top-boards.mjs";
import { PROJECTION_BOARD_STATS } from "./experimental-public-lane.mjs";
import { boardRows } from "./projection-board-ops.mjs";
import { nbaOfficialSnapshot, SnapshotRefusal } from "../../consistency/official-snapshot.mjs";

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const LANE_DIR = path.join(APP, "public/data/nba/experimental-public");
const OFFICIAL_DIR = path.join(REPO, "data/internal/research/nba/experimental-v0.1/forecasts");
const r1 = (x) => (typeof x === "number" && Number.isFinite(x) ? Math.round(x * 10) / 10 : null);
const dates = fs.readdirSync(LANE_DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => f.slice(0, 10)).sort();
const laneOf = (d) => JSON.parse(fs.readFileSync(path.join(LANE_DIR, `${d}.json`), "utf8"));
/** Just before the slate's first tip: the whole slate is pregame. */
const preTip = (lane) => new Date(Math.min(...lane.games.map((g) => Date.parse(g.tipUtc.replace(/Z$/, ":00Z")))) - 60_000).toISOString();

test("fixture: the 2026-10-29 lane is committed (10-30 is checked when present)", () => {
  assert.ok(dates.includes("2026-10-29"));
});

test("every committed lane date: board value == lane == /nba/projections == official snapshot (same receipt), every row", () => {
  let rows = 0, snapChecked = 0;
  for (const date of dates) {
    const lane = laneOf(date);
    if (!lane.games?.length) continue;
    const doc = buildLaneTopBoards(lane, { nowIso: preTip(lane) });
    const proj = new Map(boardRows(lane, PROJECTION_BOARD_STATS).map((r) => [r.id, r]));
    const offPath = path.join(OFFICIAL_DIR, `${date}.json`);
    const official = fs.existsSync(offPath) ? { doc: JSON.parse(fs.readFileSync(offPath, "utf8")), path: offPath, sha256: null } : null;
    const snaps = new Map();
    const snapFor = (id) => {
      if (!official) return null;
      if (!snaps.has(id)) { try { snaps.set(id, nbaOfficialSnapshot(id, { official, supporting: null })); } catch (e) { if (!(e instanceof SnapshotRefusal)) throw e; snaps.set(id, null); } }
      return snaps.get(id);
    };
    assert.equal(doc.scope.eventsIncluded, lane.games.length, `${date}: all games pregame`);
    for (const b of doc.boards) {
      assert.equal(b.method, "median");
      assert.ok(b.rows.length <= NBA_LANE_TOP_BOARD_SIZE);
      if (b.state !== "RANKED") { assert.match(b.text, /: unavailable — /); continue; }
      const idx = PROJECTION_BOARD_STATS.findIndex(([k]) => k === b.key);
      for (const [i, r] of b.rows.entries()) {
        const g = lane.games.find((x) => String(x.providerEventId) === r.providerEventId);
        const lr = [...g.players.away, ...g.players.home].find((p) => String(p.providerAthleteId) === r.providerAthleteId);
        const key = `${date} ${b.key} #${r.rank} ${r.name}`;
        assert.equal(r.rank, i + 1);
        assert.equal(r.value, laneValue(lr, b.key), `${key}: board == lane`);
        assert.equal(proj.get(`${r.providerEventId}:${r.providerAthleteId}`)?.v[idx], r.value, `${key}: board == /nba/projections`);
        assert.equal(r.receiptPayloadSha256, g.receipt.payloadSha256, `${key}: same receipt`);
        const snap = snapFor(r.providerEventId);
        if (snap) {
          const sp = snap.players.find((p) => String(p.playerId) === r.providerAthleteId);
          assert.ok(sp, `${key}: in the official snapshot`);
          const fam = sp.families?.[b.key];
          if (fam) { assert.equal(r1(fam.median), r.value, `${key}: board == official snapshot (1 dp)`); snapChecked += 1; }
        }
        rows += 1;
      }
    }
  }
  assert.ok(rows >= 35, `checked ${rows} ranked rows`);
  assert.ok(snapChecked >= 20, `checked ${snapChecked} rows against the official snapshot`);
});

test("ranking: by the lane median, highest first; every cleared player below the cut has a lower-or-equal value", () => {
  const lane = laneOf("2026-10-29");
  const doc = buildLaneTopBoards(lane, { nowIso: preTip(lane) });
  for (const b of doc.boards) {
    for (let i = 1; i < b.rows.length; i += 1) assert.ok(b.rows[i - 1].value >= b.rows[i].value, `${b.key} order`);
    const listed = new Set(b.rows.map((r) => r.providerAthleteId));
    const cut = b.rows.at(-1)?.value;
    for (const g of lane.games) for (const p of [...g.players.away, ...g.players.home]) {
      if (p.injuryStatus != null || listed.has(String(p.providerAthleteId))) continue;
      const v = laneValue(p, b.key);
      if (v != null) assert.ok(v <= cut, `${b.key}: ${p.name} (${v}) would outrank the cut (${cut})`);
    }
    assert.match(b.methodText, /^Ranked by projected median .*Not a chance to go over any line\.$/);
  }
  assert.deepEqual(doc.boards.map((b) => b.key), ["pts", "reb", "ast", "threePm", "pra", "ptsReb", "ptsAst"]);
});

test("a player with an injury designation never ranks; he is listed as excluded with the reason", () => {
  const lane = laneOf("2026-10-29");
  const doc = buildLaneTopBoards(lane, { nowIso: preTip(lane) });
  const dtd = lane.games.flatMap((g) => [...g.players.away, ...g.players.home]).filter((p) => p.injuryStatus != null);
  assert.ok(dtd.length >= 1, "the committed 10-29 lane lists a Day-To-Day player (probe)");
  for (const p of dtd) {
    for (const b of doc.boards) assert.ok(!b.rows.some((r) => r.providerAthleteId === String(p.providerAthleteId)), `${p.name} ranked on ${b.key}`);
    assert.ok(doc.excluded.some((x) => x.providerAthleteId === String(p.providerAthleteId) && x.reason === `INJURY_DESIGNATION:${p.injuryStatus}`));
  }
});

test("pregame only: a tipped game leaves the scope; a slate fully tipped shows an explicit unavailable state", () => {
  const lane = laneOf("2026-10-29");
  const afterEarly = "2026-10-30T00:05:00Z"; // the two 00:00Z tips have happened; the 02:00Z game has not
  const doc = buildLaneTopBoards(lane, { nowIso: afterEarly });
  const late = lane.games.filter((g) => g.tipUtc === "2026-10-30T02:00Z").map((g) => String(g.providerEventId));
  assert.deepEqual(doc.scope.events, late);
  for (const b of doc.boards) for (const r of b.rows) assert.ok(late.includes(r.providerEventId), `${b.key}: ${r.name} is from a tipped game`);
  const done = buildLaneTopBoards(lane, { nowIso: "2026-10-30T06:00:00Z" });
  for (const b of done.boards) { assert.equal(b.state, "UNAVAILABLE"); assert.equal(b.reason, "NO_PREGAME_GAMES"); assert.deepEqual(b.rows, []); }
  assert.equal(buildLaneTopBoards(null, { nowIso: afterEarly }), null, "no lane file → no NBA board");
  assert.throws(() => buildLaneTopBoards(lane, { nowIso: "x" }), /nowIso/);
  assert.throws(() => buildLaneTopBoards({ schema: "nba-top-board@2" }, { nowIso: afterEarly }), /not a lane snapshot/);
});

test("a missing median is never a zero: that player is absent from that board only; all missing → explicit unavailable", () => {
  const lane = structuredClone(laneOf("2026-10-29"));
  const at = preTip(lane);
  const top = buildLaneTopBoards(lane, { nowIso: at }).boards.find((b) => b.key === "pts").rows[0];
  const p = lane.games.flatMap((g) => [...g.players.away, ...g.players.home]).find((x) => String(x.providerAthleteId) === top.providerAthleteId);
  delete p.medians.pts;
  const doc = buildLaneTopBoards(lane, { nowIso: at });
  assert.ok(!doc.boards.find((b) => b.key === "pts").rows.some((r) => r.providerAthleteId === top.providerAthleteId));
  assert.ok(doc.boards.find((b) => b.key === "reb").rows.every((r) => r.value !== 0 || laneValue(p, "reb") === 0));
  for (const g of lane.games) for (const x of [...g.players.away, ...g.players.home]) delete x.comboMedians;
  const noCombo = buildLaneTopBoards(lane, { nowIso: at }).boards.find((b) => b.key === "pra");
  assert.equal(noCombo.state, "UNAVAILABLE");
  assert.equal(noCombo.reason, "NO_PROJECTED_PLAYER");
  assert.match(noCombo.text, /^Points \+ rebounds \+ assists: unavailable — /);
});

test("MISMATCH FAILS · a doctored board value is caught against the lane and /nba/projections", () => {
  const lane = laneOf("2026-10-29");
  const doc = buildLaneTopBoards(lane, { nowIso: preTip(lane) });
  const r = structuredClone(doc.boards[0].rows[0]);
  r.value += 0.1;
  const g = lane.games.find((x) => String(x.providerEventId) === r.providerEventId);
  const lr = [...g.players.away, ...g.players.home].find((p) => String(p.providerAthleteId) === r.providerAthleteId);
  assert.notEqual(r.value, laneValue(lr, "pts"));
  const proj = boardRows(lane, PROJECTION_BOARD_STATS).find((x) => x.id === `${r.providerEventId}:${r.providerAthleteId}`);
  assert.notEqual(r.value, proj.v[0]);
});

test("GATE · no 'chance to beat the line' and no public NBA ranking until the founder decides", () => {
  assert.equal(NBA_LANE_TOP_BOARDS_PUBLICATION.public, false);
  assert.equal(NBA_LANE_TOP_BOARDS_PUBLICATION.state, "GATED_PENDING_FOUNDER_DECISION");
  const lane = laneOf("2026-10-29");
  const doc = buildLaneTopBoards(lane, { nowIso: preTip(lane) });
  for (const b of doc.boards) {
    assert.equal(b.publication, "GATED_PENDING_FOUNDER_DECISION");
    for (const r of b.rows) for (const k of Object.keys(r)) assert.doesNotMatch(k, /prob|over|under|edge|\bev\b|side|lean|direction|line|odds|price/i, `${b.key} row key ${k}`);
  }
  for (const [k, m] of Object.entries(NBA_LANE_BOARD_METHOD)) assert.equal(m.metric, "median", k);
  const src = fs.readFileSync(path.join(APP, "src/lib/sports/nba/lane-top-boards.mjs"), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  assert.doesNotMatch(src, /compareToLine|line-comparison|evaluateMarket|odds|forecast-receipt|experimental-v0\.1|game-sim/);
  /* No page or component imports it while the gate is closed. */
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  const importers = [...walk(path.join(APP, "src/app")), ...walk(path.join(APP, "src/components"))]
    .filter((f) => /\.(tsx?|mjs)$/.test(f) && !/\.test\./.test(f) && /lane-top-boards/.test(fs.readFileSync(f, "utf8")));
  assert.deepEqual(importers, [], "a public route imports the gated NBA Top boards");
});
