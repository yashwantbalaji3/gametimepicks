/**
 * CROSS-SURFACE CONSISTENCY — NFL Top boards (founder requirement 2026-10-29: one canonical value everywhere).
 *
 * For every row the committed week's weekly-boards artifact ranks (weekly + daily `topBoards`, plus the legacy `boards`
 * the Command Center reads), and for every published player × family on that week's official player boards:
 *
 *   board artifact value (weekly-boards JSON = the social / Command Center source)
 *     == per-game official player board value            (public/data/nfl/player-board/<event>.json)
 *     == official forecast snapshot headline              (official-snapshot.mjs via forecast-view-load)
 *     == game page value and its rendered digits          (gameView → gameTabs → FamilyTabs/PlayerRow formatValue)
 *     == hub / week page Top-board entry and its digits    (topBoardTabs, what both pages hand FamilyTabs)
 *
 * And an ENGINE guard: no surface's "official" slot may carry another engine's number. A doctored artifact whose row
 * carries the World Model V2 (supporting simulation) number must be caught by the same checker, and the adapter refuses
 * a board whose declared source is not the official player board.
 *
 * Run (from app/): npx tsx --test src/lib/sports/nfl/top-boards-consistency.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { gameTabs, topBoardTabs, formatValue, MARKET_KEY, PLAYER_FAMILIES } from "./forecast-view.mjs";
import { loadForecastViews, officialSnapshotFor } from "./forecast-view-load.mjs";
import { readWorldModelArtifacts } from "./world-model-v2/read.mjs";
import { BOARD_METRIC } from "./board-ranking.mjs";

const APP = process.cwd();
const PUB = path.join(APP, "public");
const readJson = (rel) => { try { return JSON.parse(fs.readFileSync(path.join(PUB, "data", rel), "utf8")); } catch { return null; } };

const wb = readJson("nfl/weekly-boards/latest.json");
const views = new Map(loadForecastViews(PUB).map((v) => [v.providerEventId, v]));
const forecasts = new Map((readJson("nfl/forecasts/latest.json")?.forecasts ?? []).map((f) => [String(f.providerEventId), f]));
const worlds = new Map(readWorldModelArtifacts(PUB).map((a) => [String(a.identity.providerEventId), a]));
const VIEW_KEY = Object.fromEntries(Object.entries(MARKET_KEY).map(([k, v]) => [v, k]));
const KIND = Object.fromEntries(PLAYER_FAMILIES.map((f) => [f.key, f.kind]));
const playerBoard = (id) => readJson(`nfl/player-board/${id}.json`);
const snapshotFor = (() => {
  const memo = new Map();
  return (id) => {
    if (!memo.has(id)) { const f = forecasts.get(id); memo.set(id, f ? officialSnapshotFor(f, playerBoard(id), worlds.get(id) ?? null).snapshot : null); }
    return memo.get(id);
  };
})();
const officialHeadline = (fam, o) => (BOARD_METRIC[fam] === "median" ? o.median : o.expected);

/**
 * Every disagreement between the artifact's ranked rows and the other surfaces. Pure over its inputs, so the engine
 * guard below can run it on a doctored artifact.
 */
function mismatches(artifact) {
  const out = [];
  const scopes = artifact.topBoards ? [["weekly", artifact.topBoards.weekly], ...artifact.topBoards.daily.map((d) => [`daily ${d.etDate}`, d])] : [];
  const checkRow = (where, family, method, r, tabEntry) => {
    const key = `${where} · ${family} · ${r.name} (${r.providerEventId})`;
    const vk = VIEW_KEY[family];
    const pb = playerBoard(r.providerEventId)?.players?.find((p) => p.playerId === r.playerId)?.markets?.[family];
    if (!pb || pb[method] !== r.value) out.push(`${key}: artifact ${r.value} ≠ player board ${pb?.[method]}`);
    /* topBoards carry the exact range; the legacy boards print it rounded (their documented display rounding). */
    const rng = (x) => (tabEntry === undefined ? Math.round(x) : x);
    if (pb && method !== "probability" && "p10" in r && (rng(pb.p10) !== r.p10 || rng(pb.p90) !== r.p90)) out.push(`${key}: range ≠ player board`);
    const o = snapshotFor(r.providerEventId)?.players?.find((p) => p.playerId === r.playerId)?.families?.[family];
    if (!o || officialHeadline(family, o) !== r.value) out.push(`${key}: artifact ${r.value} ≠ official snapshot ${o ? officialHeadline(family, o) : "—"}`);
    const view = views.get(String(r.providerEventId));
    const vrow = view?.players?.find((p) => p.playerId === r.playerId)?.families?.[vk];
    if (!vrow || vrow.value !== r.value) out.push(`${key}: artifact ${r.value} ≠ game page ${vrow?.value}`);
    if (vrow && !["playerBoard", "opportunityTd"].includes(vrow.source)) out.push(`${key}: game page source ${vrow.source} is not official`);
    const gt = view ? gameTabs(view).lists[vk]?.find((x) => x.player.playerId === r.playerId)?.entry : null;
    if (!gt || formatValue(KIND[vk], gt.value) !== formatValue(KIND[vk], r.value)) out.push(`${key}: rendered digits differ from the game page (${gt ? formatValue(KIND[vk], gt.value) : "—"} vs ${formatValue(KIND[vk], r.value)})`);
    if (tabEntry !== undefined && (!tabEntry || tabEntry.value !== r.value || formatValue(KIND[vk], tabEntry.value) !== formatValue(KIND[vk], gt?.value))) out.push(`${key}: hub/week page entry ≠ artifact`);
  };
  for (const [where, scope] of scopes) {
    const tabs = topBoardTabs(scope);
    for (const b of scope.boards) {
      if (b.state !== "PUBLISHED") continue;
      const list = tabs.lists[VIEW_KEY[b.family]] ?? [];
      b.rows.forEach((r, i) => checkRow(where, b.family, b.method, r, list[i]?.player.playerId === r.playerId && list[i]?.rank === r.rank ? list[i].entry : null));
    }
  }
  /* The legacy `boards` (the Command Center's frozen top-board source): its published rows hold the same value. */
  for (const b of artifact.boards ?? []) {
    if (b.state !== "PUBLISHED") continue;
    for (const r of b.rows ?? []) checkRow("boards", b.family, b.metric, r, undefined);
  }
  return out;
}

test("every Top-board row: artifact == player board == official snapshot == game page == hub/week page (exact, same digits)", () => {
  if (!wb?.topBoards) return; // an artifact written before the founder Top boards
  const rows = [wb.topBoards.weekly, ...wb.topBoards.daily].flatMap((s) => s.boards).flatMap((b) => b.rows ?? []);
  assert.ok(rows.length >= 15, `the committed week ranks ${rows.length} rows`);
  assert.deepEqual(mismatches(wb), []);
});

test("every published player × family in the committed week: player board == official snapshot == game page", () => {
  if (!wb) return;
  const { seasonType, week } = wb.period;
  let checked = 0;
  for (const [id, f] of forecasts) {
    if (f.seasonType !== seasonType || f.week !== week) continue;
    const pb = playerBoard(id); const snap = snapshotFor(id); const view = views.get(id);
    if (!pb || !snap || !view) continue;
    for (const p of pb.players ?? []) for (const [fam, m] of Object.entries(p.markets ?? {})) {
      if (!(fam in BOARD_METRIC) || pb.families?.[fam]?.state !== "PUBLISHED") continue;
      const method = BOARD_METRIC[fam];
      const o = snap.players.find((x) => x.playerId === p.playerId)?.families?.[fam];
      const v = view.players.find((x) => x.playerId === p.playerId)?.families?.[VIEW_KEY[fam]];
      assert.ok(o, `${p.name} ${fam}: in the official snapshot`);
      assert.equal(officialHeadline(fam, o), m[method], `${p.name} ${fam}: snapshot == player board`);
      if (v) assert.equal(v.value, m[method], `${p.name} ${fam}: game page == player board`);
      checked += 1;
    }
  }
  assert.ok(checked > 200, `checked ${checked} published player × family values`);
});

test("ENGINE GUARD · a World Model V2 number in an official Top-board slot is caught; a non-official source is refused", () => {
  if (!wb?.topBoards) return;
  /* Find a ranked row whose player World Model V2 also simulates, with a different number for the same family. */
  const WM_FAMILY = { player_receptions: "receptions", player_reception_yds: "receivingYards", player_rush_yds: "rushingYards", player_pass_yds: "passingYards" };
  let doctored = null;
  for (const b of wb.topBoards.weekly.boards) {
    if (b.state !== "PUBLISHED" || !WM_FAMILY[b.family]) continue;
    for (const [i, r] of b.rows.entries()) {
      const wmv = worlds.get(String(r.providerEventId))?.players?.find((p) => p.playerId === r.playerId)?.families?.[WM_FAMILY[b.family]]?.median;
      if (typeof wmv === "number" && wmv !== r.value) {
        doctored = structuredClone(wb);
        doctored.topBoards.weekly.boards.find((x) => x.id === b.id).rows[i].value = wmv;
        break;
      }
    }
    if (doctored) break;
  }
  assert.ok(doctored, "the committed week has a ranked player World Model V2 simulates differently (the probe needs one)");
  const found = mismatches(doctored);
  for (const re of [/≠ player board/, /≠ official snapshot/, /≠ game page/]) assert.ok(found.some((m) => re.test(m)), `the checker flags the simulated number (${re})`);
  const foreign = { boards: [{ ...wb.topBoards.weekly.boards.find((b) => b.state === "PUBLISHED"), source: "WORLD_MODEL_V2" }] };
  assert.throws(() => topBoardTabs(foreign), /not from the official player board/);
  for (const b of [wb.topBoards.weekly, ...wb.topBoards.daily].flatMap((s) => s.boards)) assert.equal(b.source, "OFFICIAL_PLAYER_BOARD", `${b.id}`);
});

test("SOURCE · the hub and the week page render the artifact's topBoards through topBoardTabs, and rank nothing themselves", () => {
  const hub = fs.readFileSync(path.join(APP, "src/app/nfl/page.tsx"), "utf8");
  const week = fs.readFileSync(path.join(APP, "src/app/nfl/week/[key]/page.tsx"), "utf8");
  assert.deepEqual([...hub.matchAll(/topBoardTabs\(([^)]*)\)/g)].map((m) => m[1]).sort(), ["fullWeekBoards", "todayLive", "topBoardsBlock.weekly"]);
  /* The week page renders the same rows in the V3 PredictionBoard layout (presentTopBoard); see the digits test below. */
  assert.deepEqual([...week.matchAll(/<TopBoardsList artifact=\{wb\} scope=\{([^}]*)\} \/>/g)].map((m) => m[1]).sort(), ["todayBoards", "weeklyPregame"]);
  assert.match(week, /const rows = presentTopBoard\(artifact, b\);/);
  assert.match(hub, /weeklyBoards\?\.topBoards/, "the hub reads the one ranking owner's artifact");
  for (const [name, src] of [["hub", hub], ["week page", week]]) {
    assert.doesNotMatch(src, /\btopBoards\(\s*(loadForecastViews|views)/, `${name}: no second ranking from the forecast view`);
    assert.doesNotMatch(src, /rows\.sort\(/, `${name}: never re-ranks rows`);
  }
  /* founder P0 2026-10-30: an ESTIMATE family's rows render again, under the one estimate label (never unlabelled). */
  assert.match(week, /\(b\.state === "PUBLISHED" \|\| b\.state === "ESTIMATE"\) && b\.rows\?\.length \?/);
  assert.match(week, /<strong>\{estimateLabel\(b\.reason\)\}<\/strong>/);
  assert.match(week, /<strong>\{b\.estimate\.label\}<\/strong>/);
});

test("week page (V3 PredictionBoard): every presented Top-board row prints the game page's digits", async () => {
  if (!wb?.topBoards) return;
  const { presentTopBoard } = await import("../../prediction-presentation/nfl.ts");
  let n = 0;
  for (const scope of [wb.topBoards.weekly, ...wb.topBoards.daily]) for (const b of scope.boards) {
    const pres = presentTopBoard(wb, b);
    if (b.state !== "PUBLISHED") { assert.equal(pres.length, 0, `${b.id}: a not-qualified family presents no row`); continue; }
    assert.equal(pres.length, b.rows.length);
    const vk = VIEW_KEY[b.family];
    pres.forEach((p, i) => {
      const r = b.rows[i];
      assert.equal(p.player.playerId, r.playerId, "artifact order");
      const view = views.get(String(r.providerEventId));
      const gt = gameTabs(view).lists[vk].find((x) => x.player.playerId === r.playerId).entry;
      const shown = p.model.kind === "PROBABILITY" ? `${(p.model.probability * 100).toFixed(1)}%` : p.model.displayValue;
      assert.equal(shown, formatValue(KIND[vk], gt.value), `${r.name} ${b.family}: week page digits == game page digits`);
      if (p.model.p10 != null) assert.deepEqual([String(p.model.p10), String(p.model.p90)], [formatValue("yards", gt.p10), formatValue("yards", gt.p90)], `${r.name}: range digits`);
      n += 1;
    });
  }
  assert.ok(n >= 15, `checked ${n} presented rows`);
});

/* ── Track D (2026-10-29): the PLAYER PAGE and the snapshot's identity, for every Top-board row of the committed week ── */

test("every Top-board row: player page value == artifact value (at the player page's precision); a missing one is explicit", async () => {
  if (!wb?.topBoards) return;
  const { buildMyPlayerRows } = await import("../../my/read-model.ts");
  const pageRows = buildMyPlayerRows();
  const round1 = (v) => Math.round(v * 10) / 10;
  const missing = []; let n = 0;
  for (const scope of [wb.topBoards.weekly, ...wb.topBoards.daily]) for (const b of scope.boards) {
    if (b.state !== "PUBLISHED") continue;
    for (const r of b.rows) {
      const pr = pageRows.find((x) => x.playerId === r.playerId && x.href === `/nfl/game/${r.providerEventId}/`);
      assert.ok(pr, `${r.name} (${r.providerEventId}): the player page reads this player's forecast`);
      if (b.method === "probability") {
        /* The player page's forecast join carries the TD probability (Ask/My read it); the research page does not print it. */
        assert.equal(pr.anytimeTd, r.value, `${r.name} anytime TD: player page join == artifact`);
      } else {
        const m = pr.markets.find((x) => x.key === b.family);
        if (!m) { missing.push(`${r.name} ${b.family}`); continue; }
        assert.equal(m.median, round1(r.value), `${r.name} ${b.family}: player page median == artifact (1 dp)`);
        assert.deepEqual([m.p10, m.p90], [round1(r.p10), round1(r.p90)], `${r.name} ${b.family}: player page range`);
      }
      n += 1;
    }
  }
  assert.deepEqual(missing, [], "a ranked published family missing from the player page");
  assert.ok(n >= 15, `checked ${n} rows`);
});

test("every Top-board row comes from the same per-game board edition the official snapshot records (same model version)", () => {
  if (!wb?.topBoards) return;
  let n = 0;
  for (const scope of [wb.topBoards.weekly, ...wb.topBoards.daily]) for (const b of scope.boards) {
    if (b.state !== "PUBLISHED") continue;
    for (const r of b.rows) {
      const pb = playerBoard(r.providerEventId);
      const snap = snapshotFor(r.providerEventId);
      assert.ok(snap?.snapshotId, `${r.providerEventId}: an official snapshot exists`);
      const src = snap.sources.find((x) => x.path === `app/public/data/nfl/player-board/${r.providerEventId}.json`);
      assert.ok(src, `${r.providerEventId}: the snapshot names the per-game board`);
      assert.equal(src.alignedWithOfficial, true, `${r.providerEventId}: per-game board aligned with the forecast of record`);
      assert.equal(src.generatedAt, pb.generatedAt, `${r.providerEventId}: snapshot read this board edition`);
      assert.equal(pb.generatedAt, wb.generatedAt, `${r.providerEventId}: the Top board was ranked from the same board edition`);
      const fam = snap.players.find((p) => p.playerId === r.playerId)?.families?.[b.family];
      assert.equal(fam?.state, "PUBLISHED", `${r.name} ${b.family}: published in the snapshot`);
      assert.equal(fam.modelVersion, snap.modelVersions.players[b.family], `${r.name} ${b.family}: one model version`);
      if (pb.families?.[b.family]?.model) assert.ok(fam.modelVersion.startsWith(`${pb.families[b.family].model}@`), `${b.family}: snapshot model == board model`);
      n += 1;
    }
  }
  assert.ok(n >= 15);
});

test("MISMATCH FAILS · a one-unit change to a ranked value is caught by the cross-surface checker", () => {
  if (!wb?.topBoards) return;
  const doctored = structuredClone(wb);
  const b = doctored.topBoards.weekly.boards.find((x) => x.state === "PUBLISHED" && x.method === "median");
  b.rows[0].value += 1;
  const found = mismatches(doctored);
  for (const re of [/≠ player board/, /≠ official snapshot/, /≠ game page/]) assert.ok(found.some((m) => re.test(m)), String(re));
});

test("UNAVAILABLE · a row whose player the game page does not project renders the explicit unavailable state", async () => {
  if (!wb?.topBoards) return;
  const { NO_OFFICIAL_PROJECTION } = await import("./forecast-view.mjs");
  assert.equal(formatValue("yards", null), "—");
  assert.equal(formatValue("probability", undefined), "—");
  assert.equal(NO_OFFICIAL_PROJECTION, "No official projection");
  const doctored = structuredClone(wb);
  const b = doctored.topBoards.weekly.boards.find((x) => x.state === "PUBLISHED");
  b.rows[0].playerId = "nfl-athlete-0";
  assert.ok(mismatches(doctored).some((m) => /≠ player board undefined|≠ official snapshot —|≠ game page undefined/.test(m)), "a row with no canonical value is a failure, never a silent pass");
});
