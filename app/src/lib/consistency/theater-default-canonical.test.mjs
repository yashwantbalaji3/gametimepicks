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

const AS_OF = "2026-10-30T08:30:00Z"; // before every Sunday/Monday kickoff of week 8
const CURRENT = ["401873026", "401873027"]; // BAL @ BUF and a second Sunday game, from the CURRENT committed boards

test("NFL week 8 CURRENT committed boards (two Sunday games): Default == snapshot == game page == player page == Top Board == graphics export", () => {
  const canon = loadCanonical({ seasonType: 2, week: 8 });
  const weekly = readJson(path.join(DATA, "nfl/weekly-boards/2-08.json")).topBoards;
  let total = 0; let topChecked = 0; let exportChecked = 0;
  for (const id of CURRENT) {
    const g = canon.games.find((x) => String(x.view.providerEventId) === id);
    assert.ok(g?.snapshot, `${id}: current committed forecast + board + snapshot (${g?.snapshotRefusal})`);
    assert.ok(Date.parse(g.view.kickoffUtc) > Date.parse(AS_OF), `${id}: a Sunday game still to kick off`);
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
  assert.ok(total >= 40 && topChecked >= 1 && exportChecked >= 20, `checked ${total} cells, ${topChecked} Top Board rows, ${exportChecked} export rows`);
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
