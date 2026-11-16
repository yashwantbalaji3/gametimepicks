/**
 * SIMULATION THEATER DEFAULT VIEW == THE OFFICIAL FORECAST, EVERYWHERE (P0-A, founder requirement 2026-10-30) — an
 * extension of cross-surface-canonical.test.mjs to the Theater's Default view.
 *
 *   "When a user first opens Simulation Theater, its Default mode must correspond directly to the official game and
 *    player predictions published elsewhere."
 *
 * For real committed data, every value the RENDERED Default view prints is compared, as a STRING and as the underlying
 * NUMBER, with each public consumer's own accessor on the same key:
 *
 *   NBA 2026-10-29 lane, every game — the Default view is the game page's own Official Forecast section, rendered inside
 *       the full Theater game page (NbaPossessionGamePage over the public loader). == official snapshot
 *       (nbaOfficialSnapshot, 1 dp) == public lane file == /nba/projections (boardRows) == Top Boards
 *       (buildLaneTopBoards) == graphics export (buildNbaGraphicsExport model.display) · Elo text == the accessor.
 *   NFL week 8 PINNED (__fixtures__/week8-pre-tnf: BAL @ BUF, CHI @ SEA, CAR @ GB) and the CURRENT committed boards
 *       (two Sunday games) — the Default view (NflOfficialDefault over forecast-view gameView). == official snapshot ==
 *       game page (gameTabs) == player page (nflPlayerMarkets, includeEstimates) == Top Board (buildTopBoards /
 *       committed weekly-boards topBoards) == graphics export (buildNflGraphicsExport · buildNflGameGraphicsExport) ·
 *       winner, win chance and projected score == the forecast of record · ESTIMATE families carry the site's label.
 *
 * Plus: scenario selection never changes the Default view (NBA: rendered once per run kind, byte-identical; NFL: the
 * section inside the public Theater section is byte-identical to the Default rendered from the view alone), the Default
 * comes first, and a rounding/format difference ("5" vs "5.0", "250" vs "250.0") fails the comparator.
 *
 * Read-only over committed files. Run (from app/): npx tsx --test src/lib/consistency/theater-default-canonical.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;
// the Theater sections import their stylesheets (Next handles them); a no-op loader lets the test render them
createRequire(import.meta.url).extensions[".css"] = (m) => { m.exports = {}; };

const { nbaOfficialSnapshot } = await import("./official-snapshot.mjs");
const { playerOf } = await import("./official-snapshot.mjs");
const { eloWinProbabilityOf, eloWinProbabilityText } = await import("../sports/nba/elo-win-probability.mjs");
const { boardRows } = await import("../sports/nba/projection-board-ops.mjs");
const { STATS, COMBO_STATS, PROJECTION_BOARD_STATS } = await import("../sports/nba/experimental-public-lane.mjs");
const { buildLaneTopBoards, laneDisplay } = await import("../sports/nba/lane-top-boards.mjs");
const { buildNbaGraphicsExport, buildNflGraphicsExport, graphicsExportViolations } = await import("../social/graphics-export.mjs");
const { buildNflGameGraphicsExport } = await import("../social/nfl-game-graphics-export.mjs");
const { loadPublicPossessionTheater } = await import("../simulation-theater/nba/possession/public-loader.mjs");
const { nflOfficialDefault, heroPct, NFL_DEFAULT_FAMILIES, positionsFromRoster } = await import("../simulation-theater/official-default.mjs");
const { gameView, gameTabs, formatValue, MARKET_KEY } = await import("../sports/nfl/forecast-view.mjs");
const { officialSnapshotFor } = await import("../sports/nfl/forecast-view-load.mjs");
const { buildTopBoards } = await import("../sports/nfl/top-boards.mjs");
const { estimateLabel } = await import("../sports/nfl/family-publication.mjs");
const { nflPlayerMarkets } = await import("../my/read-model.ts");
const { loadCanonical } = await import("../../../scripts/social/render-nfl-game-graphics.mjs");
const { default: NbaPossessionGamePage } = await import("../../components/simulation-theater/nba/possession/NbaPossessionGamePage.tsx");
const { default: NflOfficialDefault } = await import("../../components/simulation-theater/NflOfficialDefault.tsx");
const { officialStatText } = await import("../../components/nba/official-predictions.tsx");

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const DATA = path.join(APP, "public/data");
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const r1 = (x) => (typeof x === "number" && Number.isFinite(x) ? Math.round(x * 10) / 10 : null);
const unescape = (s) => s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const text = (h) => unescape(h.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

/** THE comparator: the printed string AND the number behind it must both be equal. A format or rounding difference fails. */
function sameCell(got, want, wantNumber, msg) {
  assert.equal(got, want, `${msg}: printed "${got}" ≠ "${want}"`);
  if (wantNumber != null) assert.equal(Number(String(got).replace(/%$/, "")), Number(String(want).replace(/%$/, "")), `${msg}: number`);
}

test("the comparator fails on a rounding or format difference (5 vs 5.0, 250 vs 250.0, 29.1 vs 29.2)", () => {
  assert.throws(() => sameCell("5.0", "5", 5, "x"));
  assert.throws(() => sameCell("250.0", "250", 250, "x"));
  assert.throws(() => sameCell("29.2", "29.1", 29.1, "x"));
  assert.doesNotThrow(() => sameCell("29.1", "29.1", 29.1, "x"));
  // the NBA Default formatter IS the lane formatter (Top Boards, /nba/projections, the /nba cards, the export)
  for (const v of [5, 29.1, 0, 0.4, 12.35, null]) assert.equal(officialStatText(v), laneDisplay(r1(v)));
});

/* ───────────────────────────────────────────── NBA ───────────────────────────────────────────── */

const NBA_DATE = "2026-10-29";
const NBA_NOW = `${NBA_DATE}T16:30:00Z`; // before every tip of the slate
const LANE = readJson(path.join(DATA, `nba/experimental-public/${NBA_DATE}.json`));
const NBA_COLS = [["expectedMinutes", "MIN"], ...STATS, ...COMBO_STATS];

/** The Default section of the rendered game page: from the official section to the simulated-scenarios section. */
const defaultSlice = (h) => {
  const a = h.indexOf('<section id="official-predictions"');
  const b = h.indexOf('<section id="simulated-scenarios"');
  assert.ok(a >= 0 && b > a, "the Default view (official projected game) comes before the simulated scenarios");
  return h.slice(a, b);
};
/** name → printed cells, per side, from the Default view's two official tables. */
function nbaTables(sec) {
  const out = {};
  for (const side of ["away", "home"]) {
    const t = sec.slice(sec.indexOf(`data-nba-official-table="${side}"`));
    const body = t.slice(t.indexOf("<tbody>"), t.indexOf("</tbody>"));
    out[side] = new Map([...body.matchAll(/<tr><th scope="row">([^<]*)<\/th>((?:<td>[^<]*<\/td>)+)<\/tr>/g)].map((m) => [unescape(m[1]), [...m[2].matchAll(/<td>([^<]*)<\/td>/g)].map((c) => c[1])]));
  }
  return out;
}

test(`NBA ${NBA_DATE}: the Theater opens on the Default view, and every value it prints == official snapshot == lane == /nba/projections == Top Boards == graphics export`, () => {
  const offPath = path.join(REPO, "data/internal/research/nba/experimental-v0.1/forecasts", `${NBA_DATE}.json`);
  const official = { doc: readJson(offPath), path: offPath, sha256: null };
  const board = new Map(boardRows(LANE, PROJECTION_BOARD_STATS).map((r) => [r.id, r]));
  const top = buildLaneTopBoards(LANE, { nowIso: NBA_NOW });
  const snapshots = new Map(LANE.games.map((g) => [String(g.providerEventId), { snapshot: nbaOfficialSnapshot(String(g.providerEventId), { official, supporting: null }), refusal: null }]));
  const exp = buildNbaGraphicsExport({ date: NBA_DATE, asOf: NBA_NOW, lane: LANE, snapshots, eloEnabled: true });
  assert.deepEqual(graphicsExportViolations(exp), []);
  let cells = 0; let topChecked = 0; let exportChecked = 0; let games = 0;

  for (const g of LANE.games) {
    const id = String(g.providerEventId);
    const load = loadPublicPossessionTheater(REPO, id, { date: NBA_DATE });
    assert.ok(load.ok, `${id}: the public Theater loads (${load.error?.code})`);
    const html = renderToStaticMarkup(React.createElement(NbaPossessionGamePage, { load, nowIso: NBA_NOW }));
    // first screen: title, the view nav, then the Default view, then the scenarios holding the playback
    const iNav = html.indexOf('data-nba-theater-views=""'), iDef = html.indexOf('data-theater-default=""'), iScen = html.indexOf('data-nba-simulated-scenarios=""'), iPlay = html.indexOf("data-nbp-theater=");
    assert.ok(iNav > 0 && iNav < iDef && iDef < iScen && iScen < iPlay, `${id}: nav → Default → scenarios → playback (${[iNav, iDef, iScen, iPlay]})`);
    assert.equal((html.match(/<h1[ >]/g) ?? []).length, 1, `${id}: one h1`);
    const sec = defaultSlice(html);
    const snap = snapshots.get(id).snapshot;

    // game: favoured side (Elo) + the Elo estimate text from THE accessor; team scores withheld, said in words
    const side = snap.game.winner.side === "HOME" ? g.home : g.away;
    assert.equal(g.elo.favoured, side.abbr);
    assert.match(text(sec), new RegExp(`Favoured side ${side.name} \\(${side.abbr}\\)`), `${id}: Default favoured side == snapshot`);
    const elo = eloWinProbabilityOf(g);
    assert.ok(elo, `${id}: Elo estimate published`);
    assert.equal(elo.home, snap.game.pHome);
    assert.ok(text(sec).includes(eloWinProbabilityText(elo)), `${id}: Default Elo text == accessor text`);
    assert.match(sec, /data-nba-official-score="withheld"/, `${id}: no projected team score is invented`);
    const sx = exp.rows.find((r) => r.identity.eventId === id && r.model.kind === "probability_home");
    assert.equal(sx.model.value, elo.home, `${id}: export Elo == accessor`);

    // players: every lane row is on the Default view, every printed cell is the canonical string and number
    const tables = nbaTables(sec);
    for (const s of ["away", "home"]) {
      const rows = g.players[s] ?? [];
      assert.equal(tables[s].size, rows.length, `${id} ${s}: Default lists exactly the official players`);
      for (const row of rows) {
        const pid = String(row.providerAthleteId);
        const printed = tables[s].get(row.name);
        assert.ok(printed, `${id} ${row.name}: on the Default view`);
        const sp = snap.players.find((x) => String(x.playerId) === pid);
        assert.ok(sp, `${row.name}: official`);
        NBA_COLS.forEach(([k], i) => {
          const laneV = k === "expectedMinutes" ? row.expectedMinutes : (row.medians?.[k] ?? row.comboMedians?.[k] ?? null);
          const want = laneDisplay(laneV ?? null);
          sameCell(printed[i], want, laneV, `${id} ${row.name} ${k}: Default == lane`);
          // official snapshot (the four per-player medians; 1 dp is the lane's publication rule)
          if (STATS.some(([x]) => x === k)) sameCell(printed[i], laneDisplay(r1(sp.families?.[k]?.median)), laneV, `${id} ${row.name} ${k}: Default == official snapshot`);
          // /nba/projections
          const bi = PROJECTION_BOARD_STATS.findIndex(([x]) => x === k);
          if (bi >= 0) sameCell(printed[i], laneDisplay(board.get(`${id}:${pid}`)?.v[bi] ?? null), laneV, `${id} ${row.name} ${k}: Default == /nba/projections`);
          // Top Boards (top 5 per stat)
          const tb = top.boards.find((b) => b.key === k)?.rows.find((r) => r.providerEventId === id && r.providerAthleteId === pid);
          if (tb) { sameCell(printed[i], laneDisplay(tb.value), laneV, `${id} ${row.name} ${k}: Default == Top Boards`); topChecked += 1; }
          // graphics export
          const er = exp.rows.find((r) => r.identity.eventId === id && r.identity.playerId === pid && r.identity.market === k);
          if (er) { sameCell(printed[i], er.model.display ?? "—", laneV, `${id} ${row.name} ${k}: Default == graphics export`); exportChecked += 1; }
          cells += 1;
        });
      }
    }

    // scenario selection never changes the Default view: open the page on every stored run kind
    for (const r of load.payload.runs) {
      const alt = { ...load, payload: { ...load.payload, selection: { ...load.payload.selection, defaultKind: r.kind } } };
      const h2 = renderToStaticMarkup(React.createElement(NbaPossessionGamePage, { load: alt, nowIso: NBA_NOW }));
      assert.match(h2, new RegExp(`data-nbp-run="${r.kind}"`), `${id}: the playback opened on ${r.kind}`);
      assert.equal(defaultSlice(h2), sec, `${id}: Default view unchanged with scenario ${r.kind}`);
    }
    games += 1;
  }
  assert.equal(games, LANE.games.length, "every game of the slate");
  assert.ok(cells >= 300 && topChecked >= 10 && exportChecked >= 200, `checked ${cells} cells, ${topChecked} Top Board, ${exportChecked} export`);
});

/* ───────────────────────────────────────────── NFL ───────────────────────────────────────────── */

const LABEL = "Estimate · calibration standard not yet met";
const FAM_OF_MARKET = Object.fromEntries(Object.entries(MARKET_KEY).map(([fam, mk]) => [mk, fam]));
const KIND = Object.fromEntries(NFL_DEFAULT_FAMILIES.map((f) => [f.key, f.kind]));

/** playerId → { fam → printed } from the rendered Default view; plus the section's game lines. */
function nflDefault(view) {
  const model = nflOfficialDefault(view);
  const html = renderToStaticMarkup(React.createElement(NflOfficialDefault, { model, gameHref: `/nfl/game/${view.providerEventId}/` }));
  const cells = new Map();
  for (const m of html.matchAll(/<tr data-default-player="([^"]+)">([\s\S]*?)<\/tr>/g)) {
    cells.set(m[1], Object.fromEntries([...m[2].matchAll(/<td data-k="([^"]+)">([^<]*)<\/td>/g)].map((c) => [c[1], c[2]])));
  }
  return { model, html, cells };
}

/** Every family of every official view row is printed on the Default view with the game page's digits. */
function checkGame(view, snapshot, board, { label }) {
  const { html, cells } = nflDefault(view);
  const s = view.record;
  // game: winner, win chance and projected score exactly as the game page hero prints them
  const fav = s.favourite === view.home.abbr ? view.home : view.away;
  const favP = s.favourite === view.home.abbr ? s.winProbability.home : s.winProbability.away;
  assert.ok(text(html).includes(`${fav.name} , ${heroPct(favP)} to win`) || text(html).includes(`${fav.name}, ${heroPct(favP)} to win`), `${label}: winner line`);
  assert.equal(snapshot.game.pHomePublished, s.winProbability.home, `${label}: hero win chance == snapshot`);
  assert.ok(text(html).includes(`${view.away.abbr} ${heroPct(s.winProbability.away)} · ${view.home.abbr} ${heroPct(s.winProbability.home)}`), `${label}: win chance`);
  assert.deepEqual([snapshot.game.projectedScore.away, snapshot.game.projectedScore.home], [s.projectedScore.away, s.projectedScore.home], `${label}: projected score == snapshot`);
  assert.ok(text(html).includes(`${view.away.abbr} ${s.projectedScore.away} – ${s.projectedScore.home} ${view.home.abbr}`), `${label}: projected score as published`);
  const tabs = gameTabs(view);
  let n = 0;
  for (const p of view.players) {
    const printed = cells.get(p.playerId);
    assert.ok(printed, `${label} ${p.name}: on the Default view`);
    for (const f of NFL_DEFAULT_FAMILIES) {
      const e = p.families[f.key];
      if (!e) { if (f.key in printed) assert.equal(printed[f.key], "—", `${label} ${p.name} ${f.key}: no official value → "—"`); continue; }
      const mk = MARKET_KEY[f.key];
      const want = formatValue(f.kind, e.value);
      // official snapshot
      const sf = playerOf(snapshot, p.playerId)?.families?.[mk];
      assert.ok(sf, `${label} ${p.name} ${mk}: in the snapshot`);
      const snapV = f.kind === "probability" ? sf.expected : sf.median;
      assert.equal(e.value, snapV, `${label} ${p.name} ${mk}: view value == snapshot`);
      sameCell(printed[f.key], formatValue(f.kind, snapV), snapV, `${label} ${p.name} ${f.key}: Default == official snapshot`);
      // game page (the family tabs' own entry)
      const tr = tabs.lists[f.key].find((r) => r.player.playerId === p.playerId);
      assert.ok(tr, `${label} ${p.name} ${f.key}: on the game page`);
      sameCell(printed[f.key], formatValue(f.kind, tr.entry.value), snapV, `${label} ${p.name} ${f.key}: Default == game page`);
      // player page / My GameTime (range families; anytime TD is the game page's own formatter there too)
      const bp = board.players.find((x) => x.playerId === p.playerId);
      if (f.kind !== "probability") {
        const pm = nflPlayerMarkets(board, bp, { includeEstimates: true }).find((m) => m.key === mk);
        assert.ok(pm, `${label} ${p.name} ${mk}: on the player page`);
        sameCell(printed[f.key], pm.display.value, snapV, `${label} ${p.name} ${f.key}: Default == player page`);
        if (e.familyState === "ESTIMATE") assert.equal(pm.estimate, e.estimateLabel, `${label} ${p.name} ${mk}: same estimate label`);
      }
      if (e.familyState === "ESTIMATE") {
        assert.equal(e.estimateLabel, LABEL);
        assert.equal(view.estimates[f.key]?.label, LABEL);
      }
      assert.equal(printed[f.key], want);
      n += 1;
    }
  }
  // ESTIMATE families printed on the Default view carry the site's one label
  for (const [fam, est] of Object.entries(view.estimates ?? {})) {
    if (!view.players.some((p) => p.families[fam])) continue;
    assert.equal(est.label, estimateLabel(board.families[MARKET_KEY[fam]].reason));
    assert.match(html, /data-default-estimates=""/, `${label}: estimate footnote`);
    assert.ok(text(html).includes(est.label), `${label} ${fam}: "${est.label}" on the Default view`);
  }
  return { cells, n };
}

const PIN = path.join(APP, "src/lib/sports/nfl/__fixtures__/week8-pre-tnf");
const PIN_BOARDS = fs.readdirSync(path.join(PIN, "player-board")).filter((f) => /^\d+\.json$/.test(f)).map((f) => readJson(path.join(PIN, "player-board", f)));
const PIN_FORECASTS = readJson(path.join(PIN, "forecasts-week8.json")).forecasts;
const BEFORE_TNF = "2026-10-29T23:00:00Z";

test("NFL week 8 PINNED (BAL @ BUF, CHI @ SEA, CAR @ GB): Default == snapshot == game page == player page == Top Board == graphics export, estimates labelled", () => {
  const views = [];
  let total = 0; let topChecked = 0; let exportChecked = 0;
  const per = new Map();
  for (const id of ["401873026", "401873036", "401873023"]) {
    const forecast = PIN_FORECASTS.find((f) => String(f.providerEventId) === id);
    const board = PIN_BOARDS.find((b) => String(b.providerEventId) === id);
    const { snapshot, refusal } = officialSnapshotFor(forecast, board);
    assert.ok(snapshot, `${id}: snapshot (${refusal})`);
    const view = gameView({ forecast, board, official: snapshot });
    views.push(view);
    const r = checkGame(view, snapshot, board, { label: `${forecast.matchup} pinned` });
    per.set(id, r.cells);
    total += r.n;
    assert.ok(Object.keys(view.estimates).includes("passingYards") && Object.keys(view.estimates).includes("rushingYards"), `${id}: pass/rush are ESTIMATE on the pinned boards`);
  }
  // Top Board (the ONE ranking owner, pregame scope) and the weekly graphics export, for rows from these games
  const top = buildTopBoards({ weekBoards: PIN_BOARDS, now: BEFORE_TNF, slotFor: () => ({ pricingState: "NOT_PROBED" }) });
  const exp = buildNflGraphicsExport({ seasonType: 2, week: 8, asOf: BEFORE_TNF, boards: PIN_BOARDS, views });
  assert.deepEqual(graphicsExportViolations(exp), []);
  for (const b of top.weekly.boards) for (const r of b.rows ?? []) {
    const cells = per.get(String(r.providerEventId));
    if (!cells) continue;
    const fam = FAM_OF_MARKET[b.family];
    sameCell(cells.get(r.playerId)?.[fam], formatValue(KIND[fam], r.value), r.value, `${r.name} ${fam}: Default == Top Board`);
    topChecked += 1;
    const er = exp.rows.find((x) => x.identity.playerId === r.playerId && x.identity.market === b.family);
    if (er?.model?.display != null) { sameCell(cells.get(r.playerId)?.[fam], er.model.display, r.value, `${r.name} ${fam}: Default == graphics export`); exportChecked += 1; }
  }
  assert.ok(total >= 60 && topChecked >= 5 && exportChecked >= 5, `checked ${total} cells, ${topChecked} Top Board rows, ${exportChecked} export rows`);
});

/* The CURRENT boards drop a game once it starts, so "current" is read from them at their own generated instant: up
   to two games still to kick off. Week 8 is pinned above; this case follows the committed week. */
const LATEST_BOARDS = readJson(path.join(DATA, "nfl/weekly-boards/latest.json"));
const AS_OF = LATEST_BOARDS.generatedAt;
const CANON_NOW = loadCanonical({ seasonType: LATEST_BOARDS.period.seasonType, week: LATEST_BOARDS.period.week });
const CURRENT = CANON_NOW.games
  .filter((g) => Date.parse(g.view.kickoffUtc) > Date.parse(AS_OF))
  .map((g) => String(g.view.providerEventId))
  .slice(0, 2);

test("NFL CURRENT committed boards (games still to kick off): Default == snapshot == game page == player page == Top Board == graphics export", { skip: CURRENT.length === 0 && "no game left to kick off on the committed boards" }, () => {
  const canon = CANON_NOW;
  const weekly = LATEST_BOARDS.topBoards;
  let total = 0; let topChecked = 0; let exportChecked = 0;
  for (const id of CURRENT) {
    const g = canon.games.find((x) => String(x.view.providerEventId) === id);
    assert.ok(g?.snapshot, `${id}: current committed forecast + board + snapshot (${g?.snapshotRefusal})`);
    const { cells, n } = checkGame(g.view, g.snapshot, g.board, { label: `${g.view.matchup} current` });
    total += n;
    // Top Board: the committed weekly artifact's full-week boards (the hub / week page / social feed read it)
    for (const b of weekly.fullWeek.boards) for (const r of b.rows ?? []) {
      if (String(r.providerEventId) !== id) continue;
      const fam = FAM_OF_MARKET[b.family];
      sameCell(cells.get(r.playerId)?.[fam], formatValue(KIND[fam], r.value), r.value, `${r.name} ${fam}: Default == committed Top Board`);
      topChecked += 1;
    }
    // graphics export: the per-game player cards
    const doc = buildNflGameGraphicsExport({ view: g.view, board: g.board, positions: canon.positions, asOf: AS_OF });
    for (const r of doc.rows) {
      if (r.model.display == null) continue;
      const fam = FAM_OF_MARKET[r.identity.market];
      sameCell(cells.get(r.identity.playerId)?.[fam], r.model.display, r.model.value, `${r.identity.playerName} ${fam}: Default == game graphics export`);
      exportChecked += 1;
    }
  }
  assert.ok(total >= 20 * CURRENT.length && topChecked >= 1 && exportChecked >= 10 * CURRENT.length, `checked ${total} cells, ${topChecked} Top Board rows, ${exportChecked} export rows`);
});

test("NFL: the Default view inside the public Theater section comes first and is byte-identical to the Default from the view alone (no run input)", async () => {
  const { default: PublicTheaterSection } = await import("../../components/simulation-theater/PublicTheaterSection.tsx");
  const { readShadowReceipts, simulationOfRecord } = await import("../sports/nfl/sim-v2/public-receipt.mjs");
  const { loadForecastView } = await import("../sports/nfl/forecast-view-load.mjs");
  const entries = readShadowReceipts(REPO);
  const id = CURRENT.find((x) => simulationOfRecord(entries, x)?.showable);
  if (!id) return; // no showable receipt of record committed for these games: nothing to render (the route 404s)
  const rec = simulationOfRecord(entries, id);
  const h = renderToStaticMarkup(React.createElement(PublicTheaterSection, { rec }));
  const iDef = h.indexOf('id="official-projected-game"'), iScen = h.indexOf('data-stp-scenarios=""'), iLabels = h.indexOf('data-stp-labels=""');
  assert.ok(iDef > 0 && iDef < iScen && iScen < iLabels, `Default → scenarios (${[iDef, iScen, iLabels]})`);
  const positions = positionsFromRoster(readJson(path.join(DATA, "nfl/rosters/latest.json")));
  const alone = renderToStaticMarkup(React.createElement(NflOfficialDefault, { model: nflOfficialDefault(loadForecastView(path.join(APP, "public"), id), { positions }), gameHref: `/nfl/game/${id}/` }));
  assert.ok(h.includes(alone), "the section's Default view is exactly the view-only render");
  assert.match(text(h.slice(iScen)), /Simulated scenario \(hypothetical\)/);
});

test("SOURCE: the Default views are server components fed no run, and no island imports them", () => {
  const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");
  for (const rel of ["src/components/simulation-theater/NflOfficialDefault.tsx", "src/components/nba/official-predictions.tsx", "src/lib/simulation-theater/official-default.mjs"]) {
    assert.doesNotMatch(read(rel), /^"use client"/m, `${rel} is server-only`);
    assert.doesNotMatch(read(rel), /from "[^"]*(sim-v2|possession|TheaterIsland|world-model)[^"]*"/, `${rel} imports no simulation`);
  }
  for (const rel of ["src/components/simulation-theater/TheaterIsland.tsx", "src/components/simulation-theater/nba/possession/NbaPossessionTheater.tsx"]) {
    assert.doesNotMatch(read(rel), /from "[^"]*(NflOfficialDefault|official-default|official-predictions)[^"]*"/, `${rel} (client island) never imports the Default view`);
  }
});

/* ──────────────────────── NFL simulation page · every player number is official (ledger N14) ──────────────────────── */

/* Founder rule (2026-10-20, reaffirmed 11-11): one official forecast for a player everywhere; a what-if simulation never
   presents a competing number. On production the /nfl/simulation/<id>/ report printed SIMULATED player lines (Week 10:
   Burrow 228 pass yds vs the board's 271, Goff 222 vs 244, Maye 223 vs 242) plus simulated rushing, receiving and
   touchdown-scorer tables and team passing/rushing totals. For every committed Week 10 game with a showable receipt of
   record, every number in the rendered report's player sections must be the official board value for that player and
   family (game page digits + Estimate label), or be absent; the team box carries no passing/rushing statistic. */
const FX10 = path.join(APP, "src/lib/sports/nfl/__fixtures__/week10-sim-page");
const FX10_PUBLIC = path.join(FX10, "public");
const FX10_MANIFEST = readJson(path.join(FX10, "manifest.json"));
const WEEK10 = fs.readdirSync(path.join(FX10_PUBLIC, "data/nfl/player-board"))
  .filter((f) => /^\d+\.json$/.test(f)).sort()
  .map((f) => readJson(path.join(FX10_PUBLIC, "data/nfl/player-board", f)));
/** The fixture's receipt of record per game (content-addressed shadow files); null = no page is built. */
const fx10Receipt = (id) => {
  const file = FX10_MANIFEST.receipts[id];
  return file ? { file, receipt: readJson(path.join(REPO, file)) } : null;
};

/** The board's own value for (player, family): median for yards/receptions, probability for anytime TD. */
const boardValue = (board, playerId, fam) => {
  const m = board.players.find((p) => p.playerId === playerId)?.markets?.[MARKET_KEY[fam]];
  const v = KIND[fam] === "probability" ? m?.probability : m?.median;
  return Number.isFinite(v) ? v : null;
};
const sliceSection = (html, id) => {
  const at = html.indexOf(`<section aria-labelledby="${id}"`);
  assert.ok(at >= 0, `section ${id}`);
  return html.slice(at, html.indexOf("</section>", at));
};
const signedTxt = (x) => `${x > 0 ? "+" : ""}${x}`;

/**
 * The official game section of a rendered report == the game page's hero for the same forecast of record `f` (the
 * hero rendered here with the game page's own record expression). Returns the tiles and the count of numbers checked.
 */
async function checkOfficialGame(html, f, view, label) {
  const { default: GameHero } = await import("../../components/nfl/forecast/game-hero.tsx");
  const s = f.forecastSummary;
  // src/app/nfl/game/[eventId]/page.tsx: record={{ ...(view?.record ?? { favourite, generatedAt }), winProbability: s.winProbability, … }}
  const record = { ...(view?.record ?? { favourite: s.winProbability.home >= s.winProbability.away ? f.home.abbr : f.away.abbr, generatedAt: f.generatedAt }), winProbability: s.winProbability, projectedScore: s.projectedScore, margin: s.margin, total: s.total };
  const hero = text(renderToStaticMarkup(React.createElement(GameHero, { away: f.away, home: f.home, kickoffLabel: "x", venue: f.venue, record, likeliest: null, started: false })));
  const off = sliceSection(html, "s2-official");
  const g = Object.fromEntries([...off.matchAll(/data-s2-g="([^"]+)">([^<]*)</g)].map((m) => [m[1], unescape(m[2])]));
  const want = {
    winAway: `${(s.winProbability.away * 100).toFixed(1)}%`, winHome: `${(s.winProbability.home * 100).toFixed(1)}%`,
    scoreAway: String(s.projectedScore.away), scoreHome: String(s.projectedScore.home),
    margin: `${f.home.abbr} ${signedTxt(s.margin.median)}`,
    marginRange: `${signedTxt(s.margin.p10)} and ${signedTxt(s.margin.p90)}`,
    total: String(s.total.median), totalP10: String(s.total.p10), totalP90: String(s.total.p90),
    favourite: `${((record.favourite === f.home.abbr ? s.winProbability.home : s.winProbability.away) * 100).toFixed(1)}%`,
  };
  assert.deepEqual(g, want, `${label}: official game tiles == the game page's forecast`);
  let n = 0;
  for (const [k, v] of Object.entries(want)) {
    if (k === "marginRange") assert.ok(hero.includes(`between ${v}`), `${label} ${k}: "${v}" as the game hero prints it`);
    else if (k.startsWith("score")) continue;
    else assert.ok(hero.includes(v), `${label} ${k}: "${v}" as the game hero prints it`);
    n += 1;
  }
  assert.ok(hero.includes(`${want.favourite} to win`), `${label}: projected winner as the hero prints it`);
  assert.ok(hero.includes(`${s.projectedScore.away} – ${s.projectedScore.home}`), `${label}: projected score as the hero prints it`);
  // no other number in the official game section (the hero's "8 in 10" wording aside)
  const offRest = text(off.replace(/<span data-s2-g="[^"]*">[^<]*<\/span>|<b data-s2-g="[^"]*">[^<]*<\/b>/g, "")).replace(/8 in 10/g, "").split(f.away.name).join("").split(f.home.name).join("");
  assert.doesNotMatch(offRest, /\d/, `${label}: official section prints only official numbers ("${offRest}")`);
  return { g, n, hero };
}

/** The hypothetical block: visible heading, after every official number, no competing headline. */
function checkHypothetical(html, receipt, s, label) {
  const hAt = html.indexOf('data-s2-hypothetical=""');
  assert.ok(hAt > html.indexOf('aria-labelledby="s2-td"') && hAt > html.indexOf('aria-labelledby="s2-official"'), `${label}: the hypothetical block sits after every official number`);
  const hypo = text(html.slice(html.indexOf(">", hAt) + 1, html.indexOf('aria-labelledby="s2-prov"')));
  assert.match(hypo, /^[^\d]*Hypothetical simulation — not the forecast/, `${label}: the block opens on its visible heading`);
  assert.doesNotMatch(hypo, /win chance|median score|median total|median margin|projected|median like/i, `${label}: no competing headline in the block`);
  const a = receipt.aggregate;
  assert.ok(!text(html).includes(`${receipt.away.abbr} ${a.score.away.p50} – ${a.score.home.p50} ${receipt.home.abbr}`) || (a.score.away.p50 === s.projectedScore.away && a.score.home.p50 === s.projectedScore.home), `${label}: the simulated median score is not printed`);
  assert.doesNotMatch(text(html), /engine batch|% of runs/i, `${label}: no simulated win share anywhere`);
}

/* N14 (ledger, founder rule 2026-10-20 / 11-11: one official forecast for a player everywhere; a what-if simulation never
   presents a competing number). On production the /nfl/simulation/<id>/ report printed SIMULATED player lines (Week 10:
   Burrow 228 pass yds vs the board's 271, Goff 222 vs 244, Maye 223 vs 242), simulated rushing, receiving and
   touchdown-scorer tables, team passing/rushing totals and a simulated game headline. Driven by a FROZEN fixture
   (__fixtures__/week10-sim-page: the 14 committed Week 10 boards + forecast rows and each game's receipt of record), so
   a data commit or a pregame refresh of the live week never turns this red. For every game with a showable receipt,
   every number in the official sections == the game page's value for the same forecast of record, or is absent. */
test("NFL Week 10 simulation pages (frozen fixture): every game-level and player number == the official forecast / board value, or is absent; simulated figures only in the hypothetical block", async () => {
  const { default: SimulationV2Report } = await import("../../components/nfl/simulation-v2-report.tsx");
  const { STARTER_UNCONFIRMED } = await import("../sports/nfl/sim-v2/official-player-lines.mjs");
  const { officialSimInputs } = await import("../sports/nfl/sim-v2/official-sim-inputs.ts");
  const { unionFrozenForecasts } = await import("../sports/nfl/public-forecast-union.mjs");
  const { nflPublicRecordResolver } = await import("../sports/nfl/public-record.mjs");
  const { loadForecastView } = await import("../sports/nfl/forecast-view-load.mjs");
  // the game page's own forecast source (forecastArtifact → f.forecastSummary), over the fixture
  const fxData = path.join(FX10_PUBLIC, "data");
  const union = unionFrozenForecasts(readJson(path.join(fxData, "nfl/forecasts/latest.json")), readJson(path.join(fxData, "nfl/forecasts/frozen-latest.json")), { resolve: nflPublicRecordResolver(REPO) });
  assert.equal(WEEK10.length, 14, "14 Week 10 boards in the fixture");
  let games = 0; let numbers = 0; let gameNumbers = 0; const fams = new Set(); const pass = new Map(); const pinned = {};
  for (const board of WEEK10) {
    const id = String(board.providerEventId);
    const rec = fx10Receipt(id);
    if (!rec) continue; // no page is built for this game (dynamicParams=false → 404)
    games += 1;
    const view = loadForecastView(FX10_PUBLIC, id, { repoRoot: REPO });
    // exactly what the page passes (src/app/nfl/simulation/[eventId]/page.tsx officialFor → officialSimInputs)
    const { lines, game, source } = officialSimInputs(rec.receipt, id, { publicDir: FX10_PUBLIC, repoRoot: REPO });
    assert.equal(source, "live", `${board.matchup}: the live union holds the game`);
    const html = renderToStaticMarkup(React.createElement(SimulationV2Report, { r: rec.receipt, file: rec.file, gameHref: `/nfl/game/${id}/`, lines, game }));

    /* GAME LEVEL: every official game number == the game page's forecast summary, printed with the game hero's digits */
    const f = union.forecasts.find((x) => String(x.providerEventId) === id);
    assert.ok(f, `${board.matchup}: on the game page`);
    const s = f.forecastSummary;
    const { g, n } = await checkOfficialGame(html, f, view, board.matchup);
    gameNumbers += n;
    checkHypothetical(html, rec.receipt, s, board.matchup);
    pinned[id] = [g.winAway, g.winHome, g.scoreAway, g.scoreHome, g.margin, g.total];
    const sections = [sliceSection(html, "s2-players"), sliceSection(html, "s2-td")];
    for (const sec of sections) {
      for (const m of sec.matchAll(/<span data-s2-v="([^"|]+)\|([^"]+)">([^<]*)<\/span>(<span class="f"> · ([^<]*)<\/span>)?/g)) {
        const [, playerId, fam, printed, , label] = m;
        const v = boardValue(board, playerId, fam);
        assert.ok(v != null, `${board.matchup} ${playerId} ${fam}: printed "${printed}" but the board has no value`);
        sameCell(printed, formatValue(KIND[fam], v), v, `${board.matchup} ${playerId} ${fam}: simulation page == official board`);
        const state = board.families[MARKET_KEY[fam]]?.state;
        assert.ok(state === "ESTIMATE" || state === "PUBLISHED", `${board.matchup} ${fam}: family ${state} is never printed`);
        assert.equal(label ?? null, state === "ESTIMATE" ? LABEL : null, `${board.matchup} ${playerId} ${fam}: Estimate label iff ESTIMATE`);
        if (fam === "passingYards") pass.set(board.players.find((p) => p.playerId === playerId).name, printed);
        fams.add(fam); numbers += 1;
      }
      // no other number anywhere in the player sections: no simulated line, count, average or percentage
      const rest = text(sec.replace(/<span data-s2-v="[^"]*">[^<]*<\/span>/g, "").replace(/<[^>]+>/g, " "));
      assert.doesNotMatch(rest, /\d/, `${board.matchup}: no number besides official values ("${rest.match(/.{0,40}\d.{0,40}/)?.[0]}")`);
    }
    // completeness: every official passer and every official anytime-TD row is printed (rush/rec tables are top-N)
    for (const t of [view.away, view.home]) {
      const passers = view.players.filter((p) => p.team === t.abbr && p.families.passingYards);
      for (const p of passers) assert.ok(html.includes(`data-s2-v="${p.playerId}|passingYards"`), `${board.matchup} ${p.name}: official passer printed`);
      if (!passers.length) assert.ok(text(sections[0]).includes(`${STARTER_UNCONFIRMED} for ${t.abbr}`), `${board.matchup} ${t.abbr}: starter not confirmed, no simulated QB named`);
    }
    for (const p of view.players.filter((x) => x.families.anytimeTd)) assert.ok(html.includes(`data-s2-v="${p.playerId}|anytimeTd"`), `${board.matchup} ${p.name}: official anytime TD printed`);
    // the team box: game-flow counts only, no simulated passing / rushing statistic
    assert.doesNotMatch(text(sliceSection(html, "s2-team")), /Pass attempts|Completions|Passing yards|Passing TDs|Interceptions|Rush attempts|Rushing yards|Rushing TDs/, `${board.matchup}: team box`);
    assert.match(text(sliceSection(html, "s2-team")), /Simulated team box · hypothetical, not the forecast/);
  }
  assert.ok(games >= 12 && numbers >= 200 && gameNumbers >= 7 * games, `checked ${games} games, ${numbers} player numbers, ${gameNumbers} game numbers`);
  assert.deepEqual([...fams].sort(), ["anytimeTd", "passingYards", "receivingYards", "receptions", "rushingYards"], "every official family is exercised");
  // the production examples of ledger N14, pinned to the FROZEN fixture (it never follows the live week)
  assert.equal(pass.get("Jared Goff"), "244");
  assert.equal(pass.get("Drake Maye"), "242");
  assert.equal(pass.get("Joe Burrow"), "271");
  assert.deepEqual(pinned["401873064"], ["41.9%", "55.1%", "23", "25", "CIN +1", "48"], "PIT @ CIN official headline (fixture)");
});

/* N14 · WEEK ROLLOVER. After the week rolls, latest.json / frozen-latest.json carry the next week and /nfl/game/<id>/
   reads the ARCHIVED pre-kickoff revision named by the graded record (archived-forecast.ts). The simulation page must
   read the same record (never "No official forecast" beside a game page that shows one), and — like the game page,
   which has no forecast view then — print no player projection. The rolled state is built from the frozen fixture in a
   temp dir: next-week live files without these games, a graded Week 10 record, and each game's revision as a receipt. */
test("NFL simulation pages after the week rolls: the headline is the game page's ARCHIVED forecast; no player number is invented", async () => {
  const os = await import("node:os");
  const { default: SimulationV2Report } = await import("../../components/nfl/simulation-v2-report.tsx");
  const { officialSimInputs } = await import("../sports/nfl/sim-v2/official-sim-inputs.ts");
  const { archivedForecastFor } = await import("../sports/nfl/archived-forecast.ts");
  const { unionFrozenForecasts } = await import("../sports/nfl/public-forecast-union.mjs");
  const fxData = path.join(FX10_PUBLIC, "data");
  const week10 = unionFrozenForecasts(readJson(path.join(fxData, "nfl/forecasts/latest.json")), readJson(path.join(fxData, "nfl/forecasts/frozen-latest.json"))).forecasts;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "n14-rolled-"));
  try {
    const pub = path.join(tmp, "public"); const data = path.join(pub, "data"); const receiptsRoot = path.join(tmp, "forecast-receipts");
    const w = (rel, doc) => { fs.mkdirSync(path.dirname(path.join(data, rel)), { recursive: true }); fs.writeFileSync(path.join(data, rel), JSON.stringify(doc)); };
    w("nfl/forecasts/latest.json", { generatedAt: "2026-11-17T12:00:00Z", forecasts: [] }); // the next week: none of these games
    w("nfl/reconciliation/index.json", { weeks: [{ key: "2-10", label: "Week 10" }] });
    w("nfl/reconciliation/2-10.json", { games: week10.map((f) => ({ providerEventId: f.providerEventId, matchup: f.matchup, kickoffUtc: f.kickoffUtc, state: "FINAL", published: { generatedAt: f.generatedAt } })) });
    for (const f of week10) {
      fs.mkdirSync(path.join(receiptsRoot, "2026-11-15"), { recursive: true });
      fs.writeFileSync(path.join(receiptsRoot, "2026-11-15", `${f.providerEventId}.json`), JSON.stringify(f));
    }
    let games = 0;
    for (const board of WEEK10) {
      const id = String(board.providerEventId);
      const rec = fx10Receipt(id);
      if (!rec) continue;
      games += 1;
      const archived = archivedForecastFor(data, id, { receiptsRoot });
      assert.ok(archived, `${board.matchup}: the game page's archive holds the game`);
      const { lines, game, source } = officialSimInputs(rec.receipt, id, { publicDir: pub, repoRoot: REPO, receiptsRoot });
      assert.equal(source, "archive", `${board.matchup}: read from the archive`);
      assert.ok(game, `${board.matchup}: the official headline is present (the game page shows the archived forecast)`);
      assert.equal(lines.available, false, `${board.matchup}: no forecast view → no official player rows (as on the game page)`);
      const html = renderToStaticMarkup(React.createElement(SimulationV2Report, { r: rec.receipt, file: rec.file, gameHref: `/nfl/game/${id}/`, lines, game }));
      await checkOfficialGame(html, archived.forecast, null, `${board.matchup} archived`);
      checkHypothetical(html, rec.receipt, archived.forecast.forecastSummary, `${board.matchup} archived`);
      assert.doesNotMatch(html, /No official forecast is available/, `${board.matchup}: never "no official forecast" beside the archived game page`);
      for (const sec of [sliceSection(html, "s2-players"), sliceSection(html, "s2-td")]) {
        assert.doesNotMatch(text(sec), /\d/, `${board.matchup}: no player number after rollover`);
      }
      assert.match(text(sliceSection(html, "s2-players")), /No official player projection is available for this game/);
    }
    assert.ok(games >= 12, `checked ${games} rolled games`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

/* N14 · THEATER FLAG ON (CI builds GTP_NFL_THEATER_PUBLIC=1). (a) The Theater's Distribution panel (the desktop tab and
   phone sheet the island opens) for EVERY game of the frozen Week 10 fixture: it must load and print no simulated win
   share or distribution, and its only percentages are the official win chances. Never passes having checked nothing. */
test("NFL Theater Distribution panel (frozen Week 10 fixture): no simulated win share or histogram; only the official win chances", async () => {
  const { nflGameForecastOfRecord } = await import("../sports/nfl/sim-v2/official-sim-inputs.ts");
  const { publicTheaterLoad, defaultSample } = await import("../simulation-theater/public-theater.mjs");
  const { nflTheaterOfficial } = await import("../simulation-theater/loader.mjs");
  const { DistributionPanel } = await import("../../components/simulation-theater/panels.tsx");
  let panels = 0;
  for (const board of WEEK10) {
    const id = String(board.providerEventId);
    const rec = fx10Receipt(id);
    if (!rec) continue;
    const load = publicTheaterLoad({ eventId: id, file: rec.file, receipt: rec.receipt, showable: true, refusals: [] }, nflTheaterOfficial(REPO, id));
    assert.ok(load.ok, `${board.matchup}: the Theater loads the fixture receipt (${load.error?.code ?? ""})`);
    const h = renderToStaticMarkup(React.createElement(DistributionPanel, { manifest: load.manifest, sample: defaultSample(load.manifest) }));
    const panel = text(h);
    assert.match(panel, /Drive-engine batch · [\d,]+ runs/, `${board.matchup}: the panel rendered`);
    assert.doesNotMatch(panel, /won \(|% of runs|this run:|Home margin, /, `${board.matchup}: the panel prints no simulated win share or distribution`);
    assert.doesNotMatch(h, /st-hist/, `${board.matchup}: no total / margin histogram`);
    // the official card's win chances (the game page's forecast of record, live or archived); none when there is none
    const s = nflGameForecastOfRecord(id, { publicDir: path.join(APP, "public"), repoRoot: REPO })?.forecast?.forecastSummary;
    const official = s ? [s.winProbability.away, s.winProbability.home].map((x) => `${(x * 100).toFixed(1)}%`) : [];
    for (const p of [...panel.matchAll(/\d+\.\d%/g)].map((m) => m[0])) assert.ok(official.includes(p), `${board.matchup}: panel percentage ${p} is an official win chance`);
    panels += 1;
  }
  assert.ok(panels >= 12, `checked ${panels} Distribution panels`);
});

/* (b) The WHOLE page rendered with the flag ON, for up to three games in the live union. Live data: between a week
   rollover and the next week's receipts there is no such game, so the test is SKIPPED (reported), never a silent pass. */
const LIVE_THEATER_IDS = await (async () => {
  const { readShadowReceipts, simulationOfRecord } = await import("../sports/nfl/sim-v2/public-receipt.mjs");
  const { nflGameForecastOfRecord } = await import("../sports/nfl/sim-v2/official-sim-inputs.ts");
  const entries = readShadowReceipts(REPO);
  return [...new Set(entries.map((e) => String(e.receipt?.eventId ?? "")))]
    .filter((id) => simulationOfRecord(entries, id)?.showable && nflGameForecastOfRecord(id, { publicDir: path.join(APP, "public"), repoRoot: REPO })?.source === "live")
    .slice(0, 3);
})();
test("NFL simulation page, Theater flag ON (live games): the whole page prints no simulated win share or histogram, and the official win chances", { skip: LIVE_THEATER_IDS.length === 0 && "no live-union game has a simulation page in this checkout (week rollover gap)" }, async () => {
  const { nflGameForecastOfRecord } = await import("../sports/nfl/sim-v2/official-sim-inputs.ts");
  const prev = process.env.GTP_NFL_THEATER_PUBLIC;
  process.env.GTP_NFL_THEATER_PUBLIC = "1";
  try {
    const { default: Page } = await import("../../app/nfl/simulation/[eventId]/page.tsx");
    // the page holds async server components (the replay section): resolve them as the server renderer does
    const resolve = async (el) => {
      if (Array.isArray(el)) return Promise.all(el.map(resolve));
      if (!React.isValidElement(el)) return el;
      if (typeof el.type === "function" && !(el.type.prototype && el.type.prototype.isReactComponent)) {
        const out = el.type(el.props);
        if (out && typeof out.then === "function") return resolve(await out);
      }
      const kids = el.props?.children;
      return kids === undefined ? el : React.cloneElement(el, undefined, ...(Array.isArray(kids) ? await resolve(kids) : [await resolve(kids)]));
    };
    assert.ok(LIVE_THEATER_IDS.length >= 1);
    for (const id of LIVE_THEATER_IDS) {
      const html = renderToStaticMarkup(await resolve(Page({ params: { eventId: id } })));
      assert.ok(html.includes('data-stp-labels=""'), `${id}: the Theater section is mounted with the flag ON`);
      const h = text(html);
      assert.doesNotMatch(h, /engine batch, not the forecast|% of runs/i, `${id}: no simulated win share on the page`);
      assert.doesNotMatch(html, /class="st-hist"/, `${id}: no simulated score histogram on the page`);
      const s = nflGameForecastOfRecord(id, { publicDir: path.join(APP, "public"), repoRoot: REPO }).forecast.forecastSummary;
      for (const p of [s.winProbability.away, s.winProbability.home]) assert.ok(h.includes(`${(p * 100).toFixed(1)}%`), `${id}: official win chance on the page`);
    }
  } finally {
    if (prev === undefined) delete process.env.GTP_NFL_THEATER_PUBLIC; else process.env.GTP_NFL_THEATER_PUBLIC = prev;
  }
});

test("SOURCE: the simulation page feeds the report the game page's official sources, and neither the report nor the Theater panel reads a simulated headline", () => {
  const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8").replace(/\s+/g, "");
  const page = read("src/app/nfl/simulation/[eventId]/page.tsx");
  assert.match(page, /officialSimInputs\(rec\.receipt,eventId,\{publicDir:path\.join\(process\.cwd\(\),"public"\)/, "the official inputs from the app's public data");
  assert.match(page, /<SimulationV2Report[^>]*\{\.\.\.officialFor\(rec,params\.eventId\)\}/, "the report is handed both");
  const inputs = read("src/lib/sports/nfl/sim-v2/official-sim-inputs.ts");
  assert.match(inputs, /constview=loadForecastView\(/, "one forecast view (the game page's accessor)");
  assert.match(inputs, /officialPlayerLines\(receipt,nflOfficialDefault\(view\)\)/, "player rows from the Default view");
  assert.match(inputs, /archivedForecastFor\(/, "after rollover: the game page's archive");
  assert.match(inputs, /winProbability:s\.winProbability,projectedScore:s\.projectedScore,margin:s\.margin,total:s\.total/, "the game hero's record expression");
  const report = read("src/components/nfl/simulation-v2-report.tsx");
  assert.doesNotMatch(report, /playerStatDistributions|firstTdScorer|teamFirstTd|\.anytimeTd\b(?!")/, "the report reads no simulated player line");
  assert.doesNotMatch(report, /a\.winProbability\.(home|away)|a\.score\b|a\.total\b|a\.margin\b|calibratedMean|totalHistogram/, "the report prints no simulated win chance, score, total or margin");
  const panels = read("src/components/simulation-theater/panels.tsx");
  assert.doesNotMatch(panels, /b\.winProbability|batch\.winProbability|totalHistogram|marginHistogram/, "the Theater Distribution panel prints no engine win share or histogram");
});
