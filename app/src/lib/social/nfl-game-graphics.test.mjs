/**
 * NFL per-game player projection graphics (`gtp-graphics-export@1` NFL_GAME_PLAYERS + scripts/social renderer), on the
 * COMMITTED Week 8 boards, forecasts and roster capture:
 *   exact values (every printed cell = the official snapshot rebuilt here independently of the view, at formatValue),
 *   passing/rushing yards as LABELLED ESTIMATES (founder P0 2026-10-30: the game page's value + "est." marker + the
 *   policy label in the footnote; never direction-qualified, never a price),
 *   position-aware columns, ruled-out players excluded and questionable flagged, no sportsbook slot while unauthorized
 *   (and the slot opens only on an authorized + qualified SHOWN line), determinism, refusals (started game, social mode,
 *   output inside a repo, tampered values), no em dash in captions or exports, and no public route reaching any of it.
 * Run: cd app && npx tsx --test src/lib/social/nfl-game-graphics.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { buildNflGameGraphicsExport, serializeNflGameGraphicsExport, GROUPS, ESTIMATE_DISPLAY, PURPOSE } from "./nfl-game-graphics-export.mjs";
import { graphicsExportViolations, MODEL_STATUS } from "./graphics-export.mjs";
import { DISPLAY_AUTHORIZATION } from "../odds/display-authorization.mjs";
import { formatValue, MARKET_KEY, PLAYER_FAMILIES } from "../sports/nfl/forecast-view.mjs";
import { estimateLabel } from "../sports/nfl/family-publication.mjs";
import { officialSnapshotFor } from "../sports/nfl/forecast-view-load.mjs";
import { unionFrozenForecasts } from "../sports/nfl/public-forecast-union.mjs";
import { nflPublicRecordResolver } from "../sports/nfl/public-record.mjs";
import { readWorldModelArtifacts } from "../sports/nfl/world-model-v2/read.mjs";
import { loadCanonical, prepareNflGameGraphics, renderNflGameGraphics } from "../../../scripts/social/render-nfl-game-graphics.mjs";
import {
  paginate, renderGameCardHtml, verifyCardHtml, verifyAgainstSources, gameCaption, captionViolations, marketSlot, cellMarkup, estimateFootnote, SLOTS, MISSING, REVIEW_BANNER, ROWS_PER_TEAM_PAGE, FOOTER,
} from "../../../scripts/social/nfl-game-cards.mjs";

const APP = process.cwd();
const PUBLIC = path.join(APP, "public");
const WEEK = 8;
const AS_OF = "2026-10-30T08:30:00Z"; // before every Sunday/Monday kickoff of week 8
const SUNDAY_LATE = "2026-11-01T19:00:00Z"; // the 18:00Z games have kicked off; 21:05Z / 21:25Z / night games have not
const EVENTS = ["401873036", "401873024", "401873032"]; // CHI @ SEA (Mon), ARI @ DAL (Sun early), LAC @ LAR (13 LAC players)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-nfl-game-graphics-"));

const prepared = prepareNflGameGraphics({ week: WEEK, asOf: AS_OF, purpose: PURPOSE.FOUNDER_REVIEW });
const canon = loadCanonical({ seasonType: 2, week: WEEK });
const game = (id) => prepared.games.find((g) => g.eventId === id);

/* The official snapshot of each game, rebuilt here from the committed files WITHOUT the view or the renderer's loader. */
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const union = unionFrozenForecasts(readJson(path.join(PUBLIC, "data/nfl/forecasts/latest.json")), readJson(path.join(PUBLIC, "data/nfl/forecasts/frozen-latest.json")), { resolve: nflPublicRecordResolver(path.resolve(APP, "..")) });
const worlds = new Map(readWorldModelArtifacts(PUBLIC).map((a) => [String(a.identity.providerEventId), a]));
const snapshotOf = (id) => {
  const f = union.forecasts.find((x) => String(x.providerEventId) === id);
  const board = readJson(path.join(PUBLIC, "data/nfl/player-board", `${id}.json`));
  return { snapshot: officialSnapshotFor(f, board, worlds.get(id) ?? null).snapshot, board };
};
const KIND = Object.fromEntries(PLAYER_FAMILIES.filter((f) => MARKET_KEY[f.key]).map((f) => [MARKET_KEY[f.key], f.kind]));
const cellsOf = (html) => [...html.matchAll(/<div class="v( na| est)?" data-row-id="([^"]+)" data-status="([A-Z_]+)">([^<]*)(<span class="em">([^<]*)<\/span>)?<\/div>/g)].map((m) => ({ rowId: m[2], status: m[3], text: m[4], cls: m[1]?.trim() ?? "", marker: m[6] ?? null }));
const EST_LABEL = "Estimate · calibration standard not yet met";

/* ───────────────────────────── scope ───────────────────────────── */

test("scope: the 13 Sunday/Monday games of week 8, none refused before kickoff, Thursday excluded", () => {
  assert.equal(prepared.games.length, 13);
  assert.deepEqual(prepared.refused, []);
  assert.ok(!prepared.games.some((g) => g.eventId === "401873023"), "Thursday CAR @ GB is not on the Sunday/Monday slate");
  for (const g of prepared.games) {
    assert.ok(["Sun", "Mon"].includes(g.doc.game.etWeekday));
    assert.deepEqual(graphicsExportViolations(g.doc), [], g.eventId);
    for (const t of g.doc.teams) assert.ok(t.players.length >= 5, `${g.eventId} ${t.team}: ${t.players.length} players (target 5)`);
  }
});

/* ───────────────────────────── exact values ───────────────────────────── */

test("every printed cell equals the official snapshot (rebuilt independently) at formatValue, on three games", () => {
  for (const id of EVENTS) {
    const g = game(id);
    const { snapshot, board } = snapshotOf(id);
    assert.equal(snapshot.snapshotId, g.doc.publication.snapshotId);
    const sp = new Map(snapshot.players.map((p) => [p.playerId, p]));
    const byId = new Map(g.doc.rows.map((r) => [r.rowId, r]));
    let printed = 0; let official = 0; let estimates = 0;
    for (const c of g.cards) {
      for (const cell of cellsOf(c.html)) {
        printed += 1;
        const r = byId.get(cell.rowId);
        const mk = r.identity.market;
        const o = sp.get(r.identity.playerId)?.families?.[mk];
        const published = o?.state === "PUBLISHED" && board.families[mk].state === "PUBLISHED";
        const estimate = mk !== "anytime_td" && o?.state === "ESTIMATE" && board.families[mk].state === "ESTIMATE";
        if (cell.status === MODEL_STATUS.OFFICIAL) {
          official += 1;
          const stored = mk === "anytime_td" ? o.expected : o.median;
          assert.ok(published, `${cell.rowId}: printed but not published`);
          assert.equal(cell.text, formatValue(KIND[mk], stored), cell.rowId);
          assert.equal(r.model.value, stored, cell.rowId);
          assert.equal(cell.marker, null, `${cell.rowId}: an official cell carries no estimate marker`);
          if (mk === "anytime_td") assert.match(cell.text, /^\d+\.\d%$/);
        } else if (cell.status === MODEL_STATUS.OFFICIAL_ESTIMATE) {
          estimates += 1;
          assert.ok(estimate, `${cell.rowId}: printed as an estimate but not ESTIMATE in the snapshot and on the board`);
          assert.equal(cell.text, formatValue(KIND[mk], o.median), cell.rowId);
          assert.equal(r.model.value, o.median, cell.rowId);
          assert.equal(r.model.value, board.players.find((p) => p.playerId === r.identity.playerId).markets[mk].median, `${cell.rowId}: raw board`);
          assert.equal([cell.cls, cell.marker].join("|"), "est|est.", `${cell.rowId}: printed with the estimate marker`);
          assert.equal(r.model.label, estimateLabel(board.families[mk].reason), cell.rowId);
          assert.equal(r.model.label, EST_LABEL, cell.rowId);
        } else {
          assert.equal(cell.text, MISSING, cell.rowId);
          assert.ok(!(published && Number.isFinite(mk === "anytime_td" ? o.expected : o.median)), `${cell.rowId}: the snapshot publishes it but the card withholds it`);
          assert.ok(!(estimate && Number.isFinite(o.median)), `${cell.rowId}: the snapshot carries a labelled estimate but the card withholds it`);
        }
      }
    }
    assert.equal(printed, g.doc.rows.length, `${id}: every export cell is printed exactly once`);
    assert.ok(official > 20, `${id}: ${official} official cells`);
    assert.ok(estimates >= 2, `${id}: ${estimates} labelled estimate cells (both QBs' passing yards at least)`);
    assert.deepEqual(verifyAgainstSources({ doc: g.doc, snapshot, board }), []);
  }
});

test("passing and rushing yards (ESTIMATE on every week-8 board) print the game page's digits with the est. marker and the label footnote, never as a pick", () => {
  /* founder P0 2026-10-30: the written policy (family-publication.mjs ESTIMATE DISPLAY POLICY) allows public display
     WITH the one label, never as a pick — the game page shows them so, and the cards follow the game page */
  assert.equal(ESTIMATE_DISPLAY.allowed, true);
  assert.equal(ESTIMATE_DISPLAY.marker, "est.");
  let shown = 0;
  for (const g of prepared.games) {
    assert.equal(g.doc.families.player_pass_yds, "ESTIMATE");
    assert.equal(g.doc.families.player_rush_yds, "ESTIMATE");
    assert.deepEqual(g.doc.estimateDisplay.labels, { player_pass_yds: EST_LABEL, player_rush_yds: EST_LABEL });
    const view = canon.games.find((x) => String(x.view.providerEventId) === g.eventId).view;
    for (const r of g.doc.rows.filter((x) => ["player_pass_yds", "player_rush_yds"].includes(x.identity.market))) {
      const vf = view.players.find((p) => p.playerId === r.identity.playerId)?.families?.[r.identity.market === "player_pass_yds" ? "passingYards" : "rushingYards"] ?? null;
      if (!vf) {
        /* the game page has no estimate for this player: the card prints the missing mark, never another source */
        assert.equal(r.model.status, MODEL_STATUS.UNAVAILABLE, r.rowId);
        assert.equal(r.model.reason, "NO_ESTIMATE_FOR_PLAYER", r.rowId);
        assert.equal(r.model.value, null);
        assert.equal(r.graphicEligibility.eligible, false);
        continue;
      }
      shown += 1;
      assert.equal(vf.familyState, "ESTIMATE", r.rowId);
      assert.equal(r.model.status, MODEL_STATUS.OFFICIAL_ESTIMATE, r.rowId);
      assert.equal(r.model.value, vf.value, `${r.rowId}: the game page's value`);
      assert.equal(r.model.display, formatValue("yards", vf.value), `${r.rowId}: the game page's digits`);
      assert.equal(r.model.label, vf.estimateLabel, `${r.rowId}: the game page's label`);
      assert.equal(r.model.label, EST_LABEL);
      assert.deepEqual(r.graphicEligibility, { eligible: true, reasons: [] }, r.rowId);
      assert.equal(r.marketEligibility.directionQualified, false, `${r.rowId}: an estimate is never direction-qualified`);
      for (const k of ["line", "price", "direction"]) assert.ok(["WITHHELD", "NOT_APPLICABLE"].includes(r.market[k].state));
      assert.equal(marketSlot(r), null);
    }
    for (const c of g.cards) {
      const ids = new Set(c.rowIds);
      const rows = g.doc.rows.filter((r) => ids.has(r.rowId));
      const note = estimateFootnote(rows);
      if (rows.some((r) => r.model.status === MODEL_STATUS.OFFICIAL_ESTIMATE)) {
        assert.ok(note.startsWith(`est. ${EST_LABEL}. `), note);
        assert.ok(c.html.includes(`<p class="est">${note}</p>`), `${c.name}: the estimate footnote with the label text`);
      } else assert.ok(!c.html.includes(`<p class="est">`), `${c.name}: no estimate footnote without an estimate`);
      assert.doesNotMatch(c.html.replace(/<style>[\s\S]*?<\/style>/, ""), /\b(OVER|UNDER|lean|pick of)\b/);
    }
    assert.match(g.caption, /Passing yards and rushing yards are shown as estimates \(Estimate · calibration standard not yet met\), never as a pick\./);
  }
  assert.ok(shown >= 26, `${shown} labelled estimate cells (every starting QB's passing yards at least)`);
  assert.equal(estimateFootnote([]), "");
});

/* ───────────────────────────── position-aware columns ───────────────────────────── */

test("position-aware columns: QB pass/rush/TD, RB rush/rec/rec yds/TD, WR-TE rec/rec yds/TD; one QB per team", () => {
  const want = Object.fromEntries(GROUPS.map((g) => [g.key, g.columns.map((c) => MARKET_KEY[c])]));
  assert.deepEqual(want, {
    QB: ["player_pass_yds", "player_rush_yds", "anytime_td"],
    RB: ["player_rush_yds", "player_receptions", "player_reception_yds", "anytime_td"],
    WRTE: ["player_receptions", "player_reception_yds", "anytime_td"],
  });
  for (const g of prepared.games) {
    const byId = new Map(g.doc.rows.map((r) => [r.rowId, r]));
    for (const t of g.doc.teams) {
      assert.equal(t.players.filter((p) => p.group === "QB").length, 1, `${g.eventId} ${t.team}: one QB`);
      const order = t.players.map((p) => ["QB", "RB", "WRTE"].indexOf(p.group));
      assert.deepEqual(order, [...order].sort((a, b) => a - b), "grouped QB, RB, WR/TE");
      for (const p of t.players) {
        assert.ok({ QB: ["QB"], RB: ["RB", "FB"], WRTE: ["WR", "TE"] }[p.group].includes(p.position));
        assert.deepEqual(p.rowIds.map((id) => byId.get(id).identity.market), want[p.group]);
      }
    }
    for (const c of g.cards) {
      assert.match(c.html, /<div class="ghdr"><div>QB<\/div><div>Pass yds<\/div><div>Rush yds<\/div><div><\/div><div>Anytime TD<\/div><\/div>|more players/);
      assert.doesNotMatch(c.html, /\b(OVER|UNDER)\b/);
    }
  }
  assert.deepEqual(SLOTS.WRTE, [null, "receptions", "receivingYards", "anytimeTd"]);
});

test("pagination: every player on exactly one image; image 1 leads with QB, two backs, four receivers", () => {
  for (const g of prepared.games) {
    const pages = paginate(g.doc);
    for (const t of g.doc.teams) {
      const seen = pages.flatMap((p) => p.teams.find((x) => x.team === t.team).players.map((x) => x.playerId));
      assert.deepEqual([...seen].sort(), t.players.map((p) => p.playerId).sort());
      const first = pages[0].teams.find((x) => x.team === t.team).players;
      assert.ok(first.length === Math.min(ROWS_PER_TEAM_PAGE, t.players.length));
      assert.equal(first[0].group, "QB");
      for (const p of pages) assert.ok(p.teams.every((x) => x.players.length <= ROWS_PER_TEAM_PAGE));
    }
    assert.equal(g.cards.length, pages.length);
  }
});

/* ───────────────────────────── availability ───────────────────────────── */

test("OUT / INACTIVE players are excluded; questionable players are flagged with the site's label", () => {
  const src = canon.games.find((x) => String(x.view.providerEventId) === "401873036");
  const swift = "nfl-athlete-4259545"; const jsn = "nfl-athlete-4430878";
  const view = { ...src.view, players: src.view.players.map((p) => (p.playerId === swift ? { ...p, availability: [{ source: "playerBoard", state: "OUT" }], availabilityLabel: "Out" } : p)) };
  const board = { ...src.board, players: src.board.players.map((p) => (p.playerId === jsn ? { ...p, participation: "INACTIVE" } : p)) };
  const doc = buildNflGameGraphicsExport({ view, board, positions: canon.positions, asOf: AS_OF });
  const ids = doc.teams.flatMap((t) => t.players.map((p) => p.playerId));
  assert.ok(!ids.includes(swift) && !ids.includes(jsn));
  assert.deepEqual(doc.excluded.filter((x) => x.reason.startsWith("AVAILABILITY_")).map((x) => [x.playerId, x.reason]).sort(), [[swift, "AVAILABILITY_OUT"], [jsn, "AVAILABILITY_INACTIVE"]].sort());
  assert.ok(!doc.rows.some((r) => [swift, jsn].includes(r.identity.playerId)));
  for (const page of paginate(doc)) {
    const html = renderGameCardHtml({ doc, page });
    assert.ok(!html.includes("D&#39;Andre Swift") && !html.includes("D'Andre Swift") && !html.includes("Jaxon Smith-Njigba"));
    assert.deepEqual(verifyCardHtml(html, doc, page), []);
  }
  // Questionable: Zach Charbonnet (committed board) carries the site's label.
  const g = game("401873036");
  const z = g.doc.teams.flatMap((t) => t.players).find((p) => p.name === "Zach Charbonnet");
  assert.equal(z.availability, "Questionable");
  assert.ok(g.cards.some((c) => /Zach Charbonnet<\/span><span class="ppos">RB<\/span><span class="flag">Questionable<\/span>/.test(c.html)));
});

/* ───────────────────────────── sportsbook gating ───────────────────────────── */

test("no line, price or colour on any NFL card: social unauthorized, families unqualified; the slot opens only when both hold", () => {
  for (const g of prepared.games) {
    for (const r of g.doc.rows) {
      assert.equal(marketSlot(r), null);
      for (const k of ["line", "price", "direction"]) assert.ok(["WITHHELD", "NOT_APPLICABLE"].includes(r.market[k].state));
      if (r.identity.market === "anytime_td") assert.equal(r.market.direction.state, "NOT_APPLICABLE");
    }
    for (const c of g.cards) assert.doesNotMatch(c.html.replace(/<style>[\s\S]*?<\/style>/, ""), /class="mk"|style="color:/);
  }
  // Authorized + qualified record, but contract @1 still carries no line → still no slot.
  const q = (e) => ({ qualified: true, evidence: e, approvedBy: "test", approvedAt: "2026-10-30" });
  const rec = { ...DISPLAY_AUTHORIZATION, nfl: { ...DISPLAY_AUTHORIZATION.nfl, socialDisplay: true, directionQualified: { receptions: q("t"), reception_yds: q("t"), pass_yds: q("t"), rush_yds: q("t") } } };
  const g = game("401873036");
  const src = canon.games.find((x) => String(x.view.providerEventId) === "401873036");
  const authed = buildNflGameGraphicsExport({ view: src.view, board: src.board, positions: canon.positions, asOf: AS_OF, authorizationRecord: rec });
  for (const r of authed.rows) assert.equal(marketSlot(r, rec), null, "contract @1 never carries a SHOWN line");
  // A future row carrying a SHOWN line opens the slot ONLY with authorization + qualification, never for anytime TD.
  const rec0 = g.doc.rows.find((r) => r.identity.market === "player_receptions" && r.model.status === "OFFICIAL");
  const shown = { ...rec0, marketEligibility: { ...rec0.marketEligibility, directionQualified: true }, market: { line: { state: "SHOWN", text: "4.5" }, direction: { state: "SHOWN", side: "UNDER" }, price: { state: "WITHHELD" } } };
  assert.equal(marketSlot(shown), null, "committed record: closed");
  assert.deepEqual(marketSlot(shown, rec), { line: "4.5", side: "UNDER", color: "#F87171" });
  assert.match(cellMarkup(shown, rec), /style="color:#F87171".*<span class="mk">4\.5<\/span>/);
  const atd = g.doc.rows.find((r) => r.identity.market === "anytime_td");
  assert.equal(marketSlot({ ...atd, marketEligibility: { ...atd.marketEligibility, directionQualified: true }, market: shown.market }, rec), null);
});

/* ───────────────────────────── captions / dashes ───────────────────────────── */

test("captions and exports: no em or en dash, no promotional words; review banner on every card", () => {
  for (const g of prepared.games) {
    assert.deepEqual(captionViolations(g.caption), [], g.caption);
    assert.ok(!g.caption.includes("—") && !g.caption.includes("–"));
    assert.ok(!serializeNflGameGraphicsExport(g.doc).includes("—"), `${g.eventId}: export carries an em dash`);
    for (const c of g.cards) assert.ok(c.html.includes(REVIEW_BANNER));
  }
  assert.match(game("401873036").caption, /^Chicago Bears at Seattle Seahawks, Mon, Nov 2, 8:15 PM ET\./);
  assert.ok(captionViolations("A — B. Not betting advice. 1-800-GAMBLER").some((x) => /em dash/.test(x)));
});

/* ───────────────────────────── determinism ───────────────────────────── */

test("determinism: same inputs give byte-identical exports, card HTML and captions", () => {
  const again = prepareNflGameGraphics({ week: WEEK, asOf: AS_OF, purpose: PURPOSE.FOUNDER_REVIEW });
  assert.deepEqual(again.games.map((g) => serializeNflGameGraphicsExport(g.doc)), prepared.games.map((g) => serializeNflGameGraphicsExport(g.doc)));
  assert.deepEqual(again.games.map((g) => g.cards.map((c) => c.html)), prepared.games.map((g) => g.cards.map((c) => c.html)));
  assert.deepEqual(again.games.map((g) => g.caption), prepared.games.map((g) => g.caption));
});

/* ───────────────────────────── refusals ───────────────────────────── */

test("refusals: started games, social purpose, output inside the repo, tampered values or cards", async () => {
  const late = prepareNflGameGraphics({ week: WEEK, asOf: SUNDAY_LATE, purpose: PURPOSE.FOUNDER_REVIEW });
  assert.equal(late.refused.length, 8, "the eight 18:00Z games have kicked off");
  assert.ok(late.refused.every((r) => r.reason === "GAME_STARTED" && r.kickoffUtc === "2026-11-01T18:00Z"));
  assert.equal(late.games.length, 5);
  assert.throws(() => prepareNflGameGraphics({ week: WEEK, asOf: SUNDAY_LATE, purpose: PURPOSE.FOUNDER_REVIEW, eventId: "401873024" }), /has started/);
  const src = canon.games.find((x) => String(x.view.providerEventId) === "401873024");
  assert.throws(() => buildNflGameGraphicsExport({ view: src.view, board: src.board, positions: canon.positions, asOf: "2026-11-01T18:00:00Z" }), /has started/);
  assert.throws(() => prepareNflGameGraphics({ week: WEEK, asOf: AS_OF, purpose: PURPOSE.SOCIAL }), /not authorized for social/);
  assert.throws(() => prepareNflGameGraphics({ week: WEEK, asOf: "2026-10-30" }), /as-of/);
  await assert.rejects(renderNflGameGraphics({ week: "8", "as-of": AS_OF, purpose: "founder-review", out: path.join(APP, ".graphics-export", "nfl"), "no-png": true }), /inside the repository/);
  // no official snapshot
  assert.throws(() => buildNflGameGraphicsExport({ view: { ...src.view, official: { snapshotId: null, refusal: "NO_PRE_LOCK_RECORD" } }, board: src.board, positions: canon.positions, asOf: AS_OF }), /no official snapshot/);
  // a view value that is not the board's
  const lamb = src.view.players.find((p) => p.families.receivingYards);
  const bent = { ...src.view, players: src.view.players.map((p) => (p === lamb ? { ...p, families: { ...p.families, receivingYards: { ...p.families.receivingYards, value: p.families.receivingYards.value + 1 } } } : p)) };
  assert.throws(() => buildNflGameGraphicsExport({ view: bent, board: src.board, positions: canon.positions, asOf: AS_OF }), /≠ player board/);
  // a tampered export or card is caught before any PNG
  const g = game("401873024");
  const { snapshot, board } = snapshotOf("401873024");
  const r0 = g.doc.rows.find((r) => r.model.status === "OFFICIAL" && r.identity.market === "player_reception_yds");
  const tampered = { ...g.doc, rows: g.doc.rows.map((r) => (r === r0 ? { ...r, model: { ...r.model, value: r.model.value + 3, display: formatValue("yards", r.model.value + 3) } } : r)) };
  assert.ok(verifyAgainstSources({ doc: tampered, snapshot, board }).some((x) => x.includes(r0.rowId)));
  const page = paginate(g.doc)[0];
  const html = renderGameCardHtml({ doc: g.doc, page });
  const re = new RegExp(`(data-row-id="${r0.rowId}" data-status="OFFICIAL">)${r0.model.display}<`);
  assert.ok(re.test(html) || !page.teams.some((t) => t.players.some((p) => p.rowIds.includes(r0.rowId))));
  const firstOfficial = cellsOf(html).find((c) => c.status === "OFFICIAL");
  const badHtml = html.replace(`data-row-id="${firstOfficial.rowId}" data-status="OFFICIAL">${firstOfficial.text}<`, `data-row-id="${firstOfficial.rowId}" data-status="OFFICIAL">999<`);
  assert.ok(verifyCardHtml(badHtml, g.doc, page).length > 0);
  assert.ok(verifyCardHtml(html.replace(`<div class="review">`, `<div class="x">`), g.doc, page).some((x) => /banner/.test(x)));
  // estimates: a tampered value, a lost label, a lost marker or footnote, and a state disagreement are all caught
  const e0 = g.doc.rows.find((r) => r.model.status === "OFFICIAL_ESTIMATE" && page.teams.some((t) => t.players.some((p) => p.rowIds.includes(r.rowId))));
  assert.ok(e0, "image 1 carries an estimate cell");
  const bump = { ...g.doc, rows: g.doc.rows.map((r) => (r === e0 ? { ...r, model: { ...r.model, value: r.model.value + 3, display: formatValue("yards", r.model.value + 3) } } : r)) };
  assert.ok(verifyAgainstSources({ doc: bump, snapshot, board }).some((x) => x.includes(e0.rowId) && /snapshot estimate/.test(x)));
  const unlabelled = { ...g.doc, rows: g.doc.rows.map((r) => (r === e0 ? { ...r, model: { ...r.model, label: "Projection" } } : r)) };
  assert.ok(verifyAgainstSources({ doc: unlabelled, snapshot, board }).some((x) => x.includes(e0.rowId) && /policy label/.test(x)));
  const hidden = { ...g.doc, rows: g.doc.rows.map((r) => (r === e0 ? { ...r, model: { ...r.model, status: "UNAVAILABLE", value: null, display: null, label: undefined }, graphicEligibility: { eligible: false, reasons: ["MODEL_STATUS_UNAVAILABLE", "NO_VALUE"] } } : r)) };
  assert.ok(verifyAgainstSources({ doc: hidden, snapshot, board }).some((x) => x.includes(e0.rowId) && /withholds/.test(x)));
  assert.ok(verifyCardHtml(html.replace(`>${e0.model.display}<span class="em">est.</span>`, `>${e0.model.display}`), g.doc, page).some((x) => x.includes(e0.rowId)));
  assert.ok(verifyCardHtml(html.replace(/<p class="est">[^<]*<\/p>/, ""), g.doc, page).some((x) => /estimate footnote absent/.test(x)));
  assert.ok(html.includes(FOOTER.missing) || !cellsOf(html).some((c) => c.text === MISSING));
  const qb = src.view.players.find((p) => p.families.passingYards);
  const promoted = { ...src.board, families: { ...src.board.families, player_pass_yds: { ...src.board.families.player_pass_yds, state: "PUBLISHED" } } };
  assert.throws(() => buildNflGameGraphicsExport({ view: src.view, board: promoted, positions: canon.positions, asOf: AS_OF }), /view row is ESTIMATE but the board family is PUBLISHED/);
  const relabelled = { ...src.view, players: src.view.players.map((p) => (p === qb ? { ...p, families: { ...p.families, passingYards: { ...p.families.passingYards, estimateLabel: "Projection" } } } : p)) };
  assert.throws(() => buildNflGameGraphicsExport({ view: relabelled, board: src.board, positions: canon.positions, asOf: AS_OF }), /game page label/);
  const qbBent = { ...src.view, players: src.view.players.map((p) => (p === qb ? { ...p, families: { ...p.families, passingYards: { ...p.families.passingYards, value: p.families.passingYards.value + 1 } } } : p)) };
  assert.throws(() => buildNflGameGraphicsExport({ view: qbBent, board: src.board, positions: canon.positions, asOf: AS_OF }), /≠ player board/);
});

/* The PNG step needs a Playwright browser binary. CI's unit phase installs none (browsers are installed only for the
   e2e/a11y phases), so this one raster test is skipped there with the reason printed; every exact-value, gating and
   refusal test above runs without a browser. Locally (or anywhere chromium is installed) it always runs. */
const { chromium } = await import("playwright");
const NO_BROWSER = (() => { try { return fs.existsSync(chromium.executablePath()) ? false : "playwright chromium is not installed in this environment"; } catch (e) { return `playwright chromium unavailable: ${e.message}`; } })();

test("end to end: validated files and 1080×1350 PNGs outside the repo, manifest sha256s", { skip: NO_BROWSER }, async () => {
  const out = path.join(tmp, "render");
  const { pngs, games } = await renderNflGameGraphics({ week: "8", "as-of": AS_OF, purpose: "founder-review", out, scales: "1", event: "401873036" });
  assert.equal(games.length, 1);
  assert.equal(pngs.length, games[0].cards.length);
  const dims = (f) => { const b = fs.readFileSync(f); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
  for (const f of pngs) assert.deepEqual(dims(f), [1080, 1350], f);
  const dir = path.join(out, "401873036");
  const manifest = readJson(path.join(dir, "manifest.json"));
  assert.equal(manifest.export.purpose, "FOUNDER_REVIEW_ONLY");
  for (const f of manifest.files) assert.equal(f.sha256, (await import("node:crypto")).createHash("sha256").update(fs.readFileSync(path.join(dir, f.file))).digest("hex"));
  const caps = readJson(path.join(dir, "captions.json"));
  assert.ok(!JSON.stringify(caps).includes("—"));
});

/* ───────────────────────────── not reachable from any public route ───────────────────────────── */

test("no non-test source module imports the NFL graphics edition, cards or renderer", () => {
  const walk = (d, out = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p, out); else if (/\.(tsx?|mjs|jsx?)$/.test(p) && !/\.test\./.test(p)) out.push(p); } return out; };
  const importers = walk(path.join(APP, "src")).filter((f) => /nfl-game-graphics-export|nfl-game-cards|render-nfl-game-graphics/.test(fs.readFileSync(f, "utf8")) && !f.endsWith("nfl-game-graphics-export.mjs"));
  assert.deepEqual(importers.map((f) => path.relative(APP, f)), []);
});
