/**
 * NBA DAILY TOP BOARDS (lane-top-boards.mjs) on the COMMITTED lane files (every date, incl. 2026-10-29; 10-30 when it is
 * committed): every ranked row's value == the lane median == the /nba/projections row == the official snapshot median
 * (1 dp, same receipt payload hash); order is the stated method; pregame only; a missing median is never a zero.
 * PUBLICATION (§13 amendment B, founder 2026-10-29/30): public on /nba/projections ONLY through gateLaneTopBoards — the
 * provenance gate (receipt structure, latest == dated file; here also the receipt-hash RE-DERIVATION against the official
 * v0.1 forecast for every committed date) and the cross-page gate; a failure is one explicit unavailable state.
 *
 * Run (from app/): npx tsx --test src/lib/sports/nba/lane-top-boards.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { buildLaneTopBoards, laneValue, laneDisplay, laneProvenance, crossPageProblems, gateLaneTopBoards, NBA_LANE_TOP_BOARDS_PUBLICATION, NBA_LANE_BOARD_METHOD, NBA_LANE_TOP_BOARD_SIZE, NBA_TOP_BOARDS_UNAVAILABLE_TEXT } from "./lane-top-boards.mjs";
import { PROJECTION_BOARD_STATS, AMENDMENT_B, snapshotMatchesSource } from "./experimental-public-lane.mjs";
import { receiptIntegrity } from "./forecast-receipt.mjs";
import { loadRosterIndex } from "./roster-index.mjs";
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

test("PUBLICATION · amendment B records the founder decisions; public only through the gate; titles name the metric; no line/odds/probability field", () => {
  assert.equal(NBA_LANE_TOP_BOARDS_PUBLICATION.public, true);
  assert.equal(NBA_LANE_TOP_BOARDS_PUBLICATION.state, "PUBLIC_GATED");
  assert.equal(NBA_LANE_TOP_BOARDS_PUBLICATION.amendment, AMENDMENT_B.id);
  assert.equal(AMENDMENT_B.surface, "/nba/projections");
  assert.deepEqual(AMENDMENT_B.decisions.map((d) => d.date), ["2026-10-29", "2026-10-30"]);
  assert.match(AMENDMENT_B.decisions[0].text, /^I approve preparing NBA daily Top Boards from official canonical forecasts, provided the rankings are explicitly labeled by their actual metric .* not misrepresented as sportsbook OVER probabilities\. Before enabling their public publication, verify snapshot provenance and cross-page consistency\.$/);
  assert.match(AMENDMENT_B.decisions[1].text, /publish valid boards through the standard gated release process/);
  // The committed lane files are untouched: they still carry their own "no rankings" text; the amendment is code-side.
  assert.match(laneOf("2026-10-29").withheld.markets, /rankings/);
  const lane = laneOf("2026-10-29");
  const doc = buildLaneTopBoards(lane, { nowIso: preTip(lane) });
  for (const b of doc.boards) {
    assert.equal(b.publication, "PUBLIC_GATED");
    assert.match(b.title, new RegExp(`^Highest projected ${b.label.toLowerCase().replace(/[+]/g, "\\+")} \\(model median\\)$`));
    assert.match(b.methodText, new RegExp(`^Ranked by projected median ${b.label.toLowerCase().replace(/[+]/g, "\\+")} `), `${b.key}: the method names its metric`);
    assert.doesNotMatch(b.title + b.methodText, /chance to (go )?over(?! any line)|probability|odds/i);
    for (const r of b.rows) for (const k of Object.keys(r)) assert.doesNotMatch(k, /prob|over|under|edge|\bev\b|side|lean|direction|line|odds|price/i, `${b.key} row key ${k}`);
  }
  for (const k of Object.keys(doc)) assert.doesNotMatch(k, /prob|edge|line|odds|price/i, `doc key ${k}`);
  for (const [k, m] of Object.entries(NBA_LANE_BOARD_METHOD)) assert.equal(m.metric, "median", k);
  const strip = (f) => fs.readFileSync(path.join(APP, f), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  const src = strip("src/lib/sports/nba/lane-top-boards.mjs");
  assert.doesNotMatch(src, /compareToLine|line-comparison|evaluateMarket|odds|forecast-receipt\.mjs|experimental-v0\.1|game-sim/);
  /* No odds / line / market module anywhere in the import graph of the module or its component. */
  const graph = (start) => {
    const seen = new Set(), todo = [start];
    while (todo.length) {
      const f = todo.pop();
      if (seen.has(f)) continue;
      seen.add(f);
      const text = fs.readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      for (const [, spec] of text.matchAll(/(?:from|import)\s*\(?\s*"([^"]+)"/g)) {
        const abs = spec.startsWith("@/") ? path.join(APP, "src", spec.slice(2)) : spec.startsWith(".") ? path.resolve(path.dirname(f), spec) : null;
        if (!abs) continue;
        const hit = [abs, `${abs}.tsx`, `${abs}.ts`].find((x) => fs.existsSync(x) && fs.statSync(x).isFile());
        if (hit) todo.push(hit);
      }
    }
    return [...seen].map((f) => path.relative(APP, f));
  };
  for (const f of [...graph(path.join(APP, "src/lib/sports/nba/lane-top-boards.mjs")), ...graph(path.join(APP, "src/components/nba/lane-top-boards.tsx"))]) {
    assert.doesNotMatch(f, /odds|line-|prop-|market|price|parlay/, `the Top Boards import graph reaches ${f}`);
  }
  /* Exactly the approved importers: the current /nba/projections page and the section component (and the view that
     renders it, by type and component only). The dated page never builds a board. */
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  const importers = [...walk(path.join(APP, "src/app")), ...walk(path.join(APP, "src/components"))]
    .filter((f) => /\.(tsx?|mjs)$/.test(f) && !/\.test\./.test(f) && /lane-top-boards/.test(strip(path.relative(APP, f))))
    .map((f) => path.relative(APP, f)).sort();
  assert.deepEqual(importers, ["src/app/nba/projections/page.tsx", "src/components/nba/lane-top-boards.tsx", "src/components/nba/projections-view.tsx"]);
  assert.match(strip("src/components/nba/projections-view.tsx"), /import NbaLaneTopBoards, \{ type LaneTopBoardsGate \} from "@\/components\/nba\/lane-top-boards";/);
  assert.doesNotMatch(strip("src/app/nba/projections/[date]/page.tsx"), /topBoards|lane-top-boards/);
  assert.match(strip("src/app/nba/projections/page.tsx"), /ctx\.lane && ctx\.role === "current"\s*\? \(gateLaneTopBoards\(ctx\.lane, \{ dated: loadLaneForDate\(ctx\.lane\.date \?\? ""\), nowIso: now\.toISOString\(\), startedIds: ctx\.games\.filter\(\(g\) => g\.status !== "upcoming"\)\.map\(\(g\) => g\.id\) \}\)/);
});

test("PROVENANCE · every committed date: each lane game's receipt re-derives from the official v0.1 forecast (the publisher's check) and the gate publishes", () => {
  const rosters = loadRosterIndex(REPO);
  let games = 0;
  for (const date of dates) {
    const lane = laneOf(date);
    if (!lane.games?.length) continue;
    const off = JSON.parse(fs.readFileSync(path.join(REPO, "data/internal/research", lane.source.file), "utf8"));
    const byId = new Map(off.games.map((g) => [String(g.providerEventId), g]));
    for (const g of lane.games) {
      const src = byId.get(String(g.providerEventId));
      assert.ok(src, `${date} ${g.providerEventId}: in the official forecast`);
      assert.equal(receiptIntegrity(src).state, "OK", `${date} ${g.providerEventId}: receipt integrity`);
      assert.ok(snapshotMatchesSource(g, src, { rosters }), `${date} ${g.providerEventId}: lane game re-derives from its receipt`);
      games += 1;
    }
    assert.deepEqual(laneProvenance(lane, laneOf(date)), [], `${date}: provenance`);
    const gate = gateLaneTopBoards(lane, { dated: laneOf(date), nowIso: preTip(lane) });
    assert.equal(gate.state, "PUBLISHED", `${date}: ${JSON.stringify(gate.problems)}`);
  }
  assert.ok(games >= 60, `re-derived ${games} games`);
  // latest.json is the newest dated file, byte for byte
  const latest = JSON.parse(fs.readFileSync(path.join(LANE_DIR, "latest.json"), "utf8"));
  assert.deepEqual(laneProvenance(latest, laneOf(latest.date)), []);
});

test("PROVENANCE FAILS → one explicit unavailable state, never a partial or fabricated board", () => {
  const lane = laneOf("2026-10-29");
  const at = preTip(lane);
  const cases = {
    "no dated file": [lane, null],
    "latest drifted from the dated file": [lane, (() => { const d = structuredClone(lane); d.games[0].players.home[0].medians.pts += 1; return d; })()],
    "broken payload hash": (() => { const l = structuredClone(lane); l.games[1].receipt.payloadSha256 = "not-a-hash"; return [l, l]; })(),
    "frozen after tip-off": (() => { const l = structuredClone(lane); l.games[0].frozenAt = "2026-10-30T00:01:00Z"; return [l, l]; })(),
    "wrong receipt family": (() => { const l = structuredClone(lane); l.games[2].receipt.family = "v1"; return [l, l]; })(),
    "wrong source file": (() => { const l = structuredClone(lane); l.source.file = "nba/elsewhere/2026-10-29.json"; return [l, l]; })(),
    "no source commit": (() => { const l = structuredClone(lane); l.source.commit = null; return [l, l]; })(),
    "not the lane schema": (() => { const l = structuredClone(lane); l.lane = "other@1"; return [l, l]; })(),
  };
  for (const [name, [l, dated]] of Object.entries(cases)) {
    const g = gateLaneTopBoards(l, { dated, nowIso: at });
    assert.equal(g.state, "UNAVAILABLE", name);
    assert.equal(g.reason, "PROVENANCE", name);
    assert.equal(g.text, NBA_TOP_BOARDS_UNAVAILABLE_TEXT.PROVENANCE, name);
    assert.ok(g.problems.length >= 1, name);
    assert.equal("doc" in g, false, `${name}: no board travels with a failed gate`);
  }
});

test("CROSS-PAGE FAILS: a doctored value, name, team or receipt is caught against the lane and /nba/projections", () => {
  const lane = laneOf("2026-10-29");
  const doc = buildLaneTopBoards(lane, { nowIso: preTip(lane) });
  assert.deepEqual(crossPageProblems(doc, lane), []);
  const tamper = (fn) => { const d = structuredClone(doc); fn(d.boards[3].rows[0]); return crossPageProblems(d, lane); };
  assert.ok(tamper((r) => { r.value += 0.1; }).some((p) => /≠ lane/.test(p)));
  assert.ok(tamper((r) => { r.value += 0.1; }).some((p) => /≠ \/nba\/projections/.test(p)));
  assert.ok(tamper((r) => { r.team = "XXX"; }).some((p) => /team/.test(p)));
  assert.ok(tamper((r) => { r.name = "Someone Else"; }).some((p) => /name/.test(p)));
  assert.ok(tamper((r) => { r.receiptPayloadSha256 = "0".repeat(64); }).some((p) => /receipt/.test(p)));
  assert.ok(tamper((r) => { r.providerAthleteId = "999999999"; }).some((p) => /not on the lane/.test(p)));
  // display digits are the lane's own (String), never re-rounded or padded
  for (const b of doc.boards) for (const r of b.rows) assert.equal(laneDisplay(r.value), String(r.value));
  assert.equal(laneDisplay(null), "—");
});

test("GATE scope: switch off or no lane → no section; started / postponed games (schedule) leave the pregame scope; all tipped → unavailable", () => {
  const lane = laneOf("2026-10-29");
  const at = preTip(lane);
  assert.equal(gateLaneTopBoards(lane, { dated: lane, nowIso: at, enabled: false }), null, "switch off");
  assert.equal(gateLaneTopBoards(null, { dated: null, nowIso: at }), null, "no current lane");
  assert.equal(gateLaneTopBoards({ ...lane, games: [] }, { dated: null, nowIso: at }), null, "an empty slate");
  const first = String(lane.games[0].providerEventId);
  const g = gateLaneTopBoards(lane, { dated: lane, nowIso: at, startedIds: [first] });
  assert.equal(g.state, "PUBLISHED");
  assert.deepEqual(g.doc.scope.eventsStarted, [first]);
  for (const b of g.doc.boards) for (const r of b.rows) assert.notEqual(r.providerEventId, first, `${b.key}: ${r.name} is from a started game`);
  const late = gateLaneTopBoards(lane, { dated: lane, nowIso: "2026-10-30T00:05:00Z" });
  for (const b of late.doc.boards) for (const r of b.rows) assert.equal(lane.games.find((x) => String(x.providerEventId) === r.providerEventId).tipUtc, "2026-10-30T02:00Z");
  const done = gateLaneTopBoards(lane, { dated: lane, nowIso: "2026-10-30T06:00:00Z" });
  assert.deepEqual([done.state, done.reason, done.text], ["UNAVAILABLE", "NO_PREGAME_GAMES", NBA_TOP_BOARDS_UNAVAILABLE_TEXT.NO_PREGAME_GAMES]);
});
