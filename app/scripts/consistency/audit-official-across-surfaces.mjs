#!/usr/bin/env node
/**
 * ONE OFFICIAL VALUE ACROSS SURFACES — report only, read-only over committed files. Run from app/ (surface accessors read
 * the app's own public directory through process.cwd()).
 *
 *   npx tsx scripts/consistency/audit-official-across-surfaces.mjs --date 2026-11-02 --event 401873036 \
 *       [--social-dir <dir of packages, never committed>] [--json <path outside the repo>]
 *
 * `--date` audits that NBA slate; `--event` adds an NFL event, or narrows the slate when the id is on it.
 *
 * For each player and market it holds every surface against the official snapshot (official-snapshot.mjs) and lists each
 * disagreement by surface, event, player, market and value. Nothing is rewritten and nothing is hidden: a mismatch that
 * has a legitimate cause keeps its row and gets a class.
 *
 * WHO CHECKS WHAT.
 *   runConsistencyAudit (audit.mjs)  NBA lane pts/reb/ast/3PM + minutes + side + receipt, private top boards, v1 sim side
 *                                    and stored runs. NFL game page, /nfl top boards, weekly boards, frozen live props,
 *                                    World Model V2, sim-v2 and the Theater anchor. Its row-level items are expanded here.
 *   this file                        what audit.mjs does not read. NBA: lane combos and Elo pHome, /nba hub side,
 *                                    /nba/projections, public lane Top Boards, Theater panel and public payload, settled
 *                                    game page, /results/nba record. NFL: nfl/index.json, week page, End Zone Vault,
 *                                    Results V2 frozen Top Boards. Either sport: a passed social directory.
 *
 * COMPARISON. Exact stored numbers, at the surface's own stated precision: NBA public surfaces print one decimal
 * (experimental-public-lane.mjs), so they are held to the official median rounded the same way; Results boards frozen
 * before 2026-10-29T23:20:41Z keep whole numbers (founder ruling, cross-surface-canonical.test.mjs).
 *
 * CLASSES.
 *   FROZEN_BEFORE_FINAL   a write-once surface froze an earlier official revision. Legitimate; which is the record is a
 *                         founder decision (November ledger). Rows are never edited.
 *   LABELLED_SIMULATION   a simulation or supporting engine labelled as not the official forecast. Different by design.
 *   UNEXPLAINED           no recorded reason. This is the class a person should read.
 *
 * Exit code 0 always unless --strict, which exits 1 on any UNEXPLAINED row.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { runConsistencyAudit } from "../../src/lib/consistency/audit.mjs";
import { nbaOfficialSnapshot, NBA_OFFICIAL_FAMILY, NBA_SUPPORTING_FAMILY, SnapshotRefusal, playerOf } from "../../src/lib/consistency/official-snapshot.mjs";
import { TOLERANCE } from "../../src/lib/consistency/checks.mjs";
import { eloWinProbabilityOf } from "../../src/lib/sports/nba/elo-win-probability.mjs";
import { COMBO_STATS, PROJECTION_BOARD_STATS, STATS } from "../../src/lib/sports/nba/experimental-public-lane.mjs";
import { boardRows } from "../../src/lib/sports/nba/projection-board-ops.mjs";
import { gateLaneTopBoards } from "../../src/lib/sports/nba/lane-top-boards.mjs";
import { nbaForecastVsActual } from "../../src/lib/results/nba-forecast-vs-actual.mjs";
import { isInsideRepo } from "../nba/research/report-nba-model-disagreement.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, "../../..");
export const AUDIT_SCHEMA = "gtp.consistency.across-surfaces@1";
export const CLASS = Object.freeze({ FROZEN_BEFORE_FINAL: "FROZEN_BEFORE_FINAL", LABELLED_SIMULATION: "LABELLED_SIMULATION", UNEXPLAINED: "UNEXPLAINED" });
/** Results boards frozen after this instant keep exact values; earlier ones keep whole numbers (founder 2026-10-29, 3087ea8d11). */
export const RESULTS_EXACT_FROM = "2026-10-29T23:20:41Z";

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const r1 = (x) => (isNum(x) ? Math.round(x * 10) / 10 : null);
const ms = (s) => Date.parse(String(s ?? "").replace(/T(\d\d):(\d\d)Z$/, "T$1:$2:00Z"));
const sameInstant = (a, b) => Number.isFinite(ms(a)) && ms(a) === ms(b);
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

/** Tallies one run: comparisons per surface, mismatch rows, absent surfaces. */
export function newLedger() {
  const coverage = new Map();
  const mismatches = [];
  const key = (surface, sport) => `${sport}|${surface}`;
  const cov = (surface, sport) => { const k = key(surface, sport); if (!coverage.has(k)) coverage.set(k, { surface, sport, events: new Set(), compared: 0, absent: new Map() }); return coverage.get(k); };
  return {
    mismatches,
    count(surface, sport, eventId, n = 1) { const c = cov(surface, sport); c.events.add(eventId); c.compared += n; },
    absent(surface, sport, eventId, reason) { cov(surface, sport).absent.set(eventId, reason); },
    add(row) { mismatches.push({ classification: CLASS.UNEXPLAINED, note: null, ...row }); },
    coverageRows: () => [...coverage.values()].map((c) => ({
      surface: c.surface, sport: c.sport, eventsChecked: c.events.size, compared: c.compared,
      eventsAbsent: c.absent.size, absentReasons: [...new Set(c.absent.values())].sort(),
    })).sort((a, b) => a.sport.localeCompare(b.sport) || a.surface.localeCompare(b.surface)),
  };
}

/** One value on one surface against the official value. tol is the surface's own precision. */
export function check(led, { surface, sport, eventId, playerId = null, player = null, market, field = null, official, value, tol = TOLERANCE.exact, classification, note, source = null }) {
  if (official == null && value == null) return;
  led.count(surface, sport, eventId);
  const bothNum = isNum(official) && isNum(value);
  if (bothNum ? Math.abs(value - official) <= tol : official === value) return;
  led.add({ surface, sport, eventId, playerId, player, market, field, official: official ?? null, value: value ?? null, diff: bothNum ? Number((value - official).toFixed(6)) : null, source, ...(classification ? { classification } : {}), ...(note ? { note } : {}) });
}

const sideAbbr = (snap) => (snap.game.winner.side === "HOME" ? snap.home.abbr : snap.game.winner.side === "AWAY" ? snap.away.abbr : null);

/* ═════════════════════════ audit.mjs records → rows ═════════════════════════ */

/** The class of an audit.mjs record. Anything not named here stays UNEXPLAINED. */
export function classifyAuditRecord(d) {
  const s = d.surface ?? "";
  if (s === "nfl-game-page.supporting-simulation") return { classification: CLASS.LABELLED_SIMULATION, note: "World Model V2, labelled not official and not graded" };
  if (/^SHADOW:/.test(d.identity?.field ?? "")) return { classification: CLASS.LABELLED_SIMULATION, note: `labelled, but built on an older input: ${d.detail ?? "input differs from the record"}` };
  if (/^nfl-simulation-v2/.test(s) || s === "simulation-theater.anchor") return { classification: CLASS.LABELLED_SIMULATION, note: "sim-v2 drive engine, a separate page labelled EXPERIMENTAL; the Theater stays non-public until re-anchored" };
  if (d.sport === "NBA" && s === "simulation-theater.default") return { classification: CLASS.LABELLED_SIMULATION, note: "stored run choice; LABELLED_SUPPORTING_RUNS policy, no run is shown as the official representative" };
  if (d.sport === "NBA" && s === "simulation-theater.supporting") return { classification: CLASS.LABELLED_SIMULATION, note: "v1 supporting simulation favours the other side; it never feeds an official value" };
  if (s === "nfl-live-props.frozen" && d.severity === "WARN") return { classification: CLASS.FROZEN_BEFORE_FINAL, note: d.detail ?? null };
  return { classification: CLASS.UNEXPLAINED, note: d.detail ?? null };
}

/**
 * Surfaces audit.mjs checks whose comparisons this file counts from the same documents, because audit.mjs reports only
 * what failed. Without these a clean surface would simply be missing from the coverage table.
 */
export const AUDIT_COUNTED_SURFACES = Object.freeze(["nba-lane", "nba-public-lane", "nba-top-board.v0.1", "nfl-game-page.players", "nfl-top-boards", "nfl-weekly-boards", "nfl-live-props.frozen", "nfl-public-forecast", "world-model-v2.forecastOfRecord"]);

/** Expand audit.mjs discrepancy records into rows. A record with no row-level items stays one row with its count. */
export function auditRows(led, discrepancies) {
  for (const d of discrepancies) {
    const base = { surface: d.surface, sport: d.sport, eventId: d.eventId, source: (d.sources ?? []).filter(Boolean).join(" · ") || null, ...classifyAuditRecord(d) };
    if (!AUDIT_COUNTED_SURFACES.includes(d.surface)) led.count(d.surface, d.sport, d.eventId, d.allItems?.length ?? d.count ?? 1);
    if (d.allItems?.length) {
      for (const i of d.allItems) led.add({ ...base, playerId: i.subjectId === d.eventId ? null : i.subjectId ?? null, player: i.label ?? null, market: i.family ?? d.identity?.family ?? null, field: i.field ?? null, official: i.expected ?? null, value: i.actual ?? null, diff: isNum(i.diff) ? Number(i.diff.toFixed(6)) : null });
    } else {
      led.add({ ...base, playerId: null, player: null, market: d.identity?.family ?? d.code, field: d.identity?.field ?? null, official: d.expected ?? null, value: d.actual ?? null, diff: null, ...(d.count > 1 ? { count: d.count } : {}) });
    }
  }
}

/* ═════════════════════════ NBA ═════════════════════════ */

/**
 * Pure: one NBA event's non-audit surfaces, from loaded documents. A surface passed as null is recorded as absent.
 * @param {{ snapshot: object, date: string, laneGame: object|null, hubGame?: object|null, boardRowsOf?: object[], topBoards?: object|null,
 *           theater?: {panel: object, freezeSha: string|null}|null, publicPayload?: {ok: boolean, official?: object, reason?: string}|null,
 *           settled?: object|null, record?: object|null }} i
 */
export function nbaSurfaces(led, { snapshot, laneGame, hubGame = null, boardRowsOf = [], topBoards = null, theater = null, publicPayload = null, settled = null, record = null }) {
  const eventId = snapshot.eventId;
  const sport = "NBA";
  const offSide = sideAbbr(snapshot);
  const receipt = snapshot.sources.find((s) => s.role === "OFFICIAL")?.inputRef ?? null;
  const official = (pid, fam) => playerOf(snapshot, pid)?.families?.[fam] ?? null;
  const missing = (surface, pid, name, market) => led.add({ surface, sport, eventId, playerId: pid, player: name, market, field: "noOfficialCounterpart", official: null, value: "shown", diff: null });

  if (!laneGame) led.absent("nba-lane", sport, eventId, "no lane game");
  else {
    const surface = "nba-lane";
    const laneRows = (laneGame.players?.away?.length ?? 0) + (laneGame.players?.home?.length ?? 0);
    led.count(surface, sport, eventId, laneRows * (STATS.length + 1) + 1); // audit.mjs holds the 4 medians, minutes and the side
    for (const s of ["away", "home"]) for (const row of laneGame.players?.[s] ?? []) {
      const pid = String(row.providerAthleteId);
      for (const [k] of COMBO_STATS) check(led, { surface, sport, eventId, playerId: pid, player: row.name, market: k, field: "median1dp", official: r1(official(pid, k)?.median), value: row.comboMedians?.[k] ?? null });
    }
    const elo = eloWinProbabilityOf(laneGame);
    if (elo) {
      check(led, { surface, sport, eventId, market: "game", field: "eloHome", official: snapshot.game.pHome, value: elo.home, tol: TOLERANCE.fourDp });
      check(led, { surface, sport, eventId, market: "game", field: "eloAway", official: snapshot.game.pAway, value: elo.away, tol: TOLERANCE.fourDp });
    }
  }

  if (!hubGame) led.absent("nba-hub", sport, eventId, "no hub game");
  else {
    check(led, { surface: "nba-hub", sport, eventId, market: "game", field: "favoured", official: offSide, value: hubGame.favoured?.abbr ?? null });
    led.count("nba-hub", sport, eventId);
    if (!sameInstant(hubGame.frozenAt, snapshot.frozenAt)) led.add({ surface: "nba-hub", sport, eventId, playerId: null, player: null, market: "game", field: "frozenAt", official: snapshot.frozenAt, value: hubGame.frozenAt ?? null, diff: null });
  }

  if (!boardRowsOf.length) led.absent("nba-projections", sport, eventId, "no board rows");
  for (const r of boardRowsOf) {
    const pid = r.id.split(":")[1];
    if (!playerOf(snapshot, pid)) { missing("nba-projections", pid, r.name, "player"); continue; }
    check(led, { surface: "nba-projections", sport, eventId, playerId: pid, player: r.name, market: "minutes", field: "expectedMinutes1dp", official: r1(playerOf(snapshot, pid).expectedMinutes), value: r.min });
    PROJECTION_BOARD_STATS.forEach(([k], i) => check(led, { surface: "nba-projections", sport, eventId, playerId: pid, player: r.name, market: k, field: "median1dp", official: r1(official(pid, k)?.median), value: r.v[i] }));
  }

  if (!topBoards) led.absent("nba-top-boards.public", sport, eventId, "no published lane boards");
  else {
    const rows = topBoards.rows.filter((r) => String(r.providerEventId) === eventId);
    if (!rows.length) led.absent("nba-top-boards.public", sport, eventId, "event has no ranked row");
    for (const r of rows) {
      const pid = String(r.providerAthleteId);
      if (!official(pid, r.market)) { missing("nba-top-boards.public", pid, r.name, r.market); continue; }
      check(led, { surface: "nba-top-boards.public", sport, eventId, playerId: pid, player: r.name, market: r.market, field: "median1dp", official: r1(official(pid, r.market).median), value: r.value });
    }
  }

  if (!theater) led.absent("theater.artifact", sport, eventId, "no possession artifact for this event");
  else {
    const surface = "theater.artifact";
    const p = theater.panel;
    check(led, { surface, sport, eventId, market: "game", field: "snapshotId", official: snapshot.snapshotId, value: p.snapshotId ?? null });
    check(led, { surface, sport, eventId, market: "game", field: "favouredSide", official: snapshot.game.winner.side, value: p.favouredSide ?? null });
    check(led, { surface, sport, eventId, market: "game", field: "freezeReceipt", official: receipt, value: theater.freezeSha });
    for (const row of p.players ?? []) {
      const pid = String(row.playerId);
      if (!playerOf(snapshot, pid)) { missing(surface, pid, row.displayName, "player"); continue; }
      check(led, { surface, sport, eventId, playerId: pid, player: row.displayName, market: "minutes", field: "expectedMinutes", official: playerOf(snapshot, pid).expectedMinutes, value: row.expectedMinutes });
      for (const [f, v] of Object.entries(row.medians ?? {})) check(led, { surface, sport, eventId, playerId: pid, player: row.displayName, market: f, field: "median", official: official(pid, f)?.median ?? null, value: v });
    }
  }

  if (!publicPayload) led.absent("theater.public-payload", sport, eventId, "payload not built");
  else if (!publicPayload.ok) led.absent("theater.public-payload", sport, eventId, publicPayload.reason ?? "loader refused");
  else {
    const surface = "theater.public-payload";
    const p = publicPayload.official;
    if (p.elo) check(led, { surface, sport, eventId, market: "game", field: "eloHome", official: snapshot.game.pHome, value: p.elo.home, tol: TOLERANCE.fourDp });
    for (const row of p.players ?? []) {
      const pid = String(row.playerId);
      for (const [f, v] of Object.entries(row.medians ?? {})) check(led, { surface, sport, eventId, playerId: pid, player: row.displayName, market: f, field: "median1dp", official: r1(official(pid, f)?.median), value: v });
    }
  }

  if (!settled) led.absent("nba-game-page.settled", sport, eventId, "no settled page view");
  else {
    const surface = "nba-game-page.settled";
    check(led, { surface, sport, eventId, market: "game", field: "favoured", official: offSide, value: settled.game?.elo?.favoured ?? null });
    check(led, { surface, sport, eventId, market: "game", field: "freezeReceipt", official: receipt, value: settled.game?.receipt?.payloadSha256 ?? null });
    const same = JSON.stringify(settled.game?.players ?? null) === JSON.stringify(laneGame?.players ?? null);
    led.count(surface, sport, eventId);
    if (!same) led.add({ surface, sport, eventId, playerId: null, player: null, market: "players", field: "sameAsLane", official: true, value: false, diff: null });
  }

  if (!record) led.absent("results-v2.nba-record", sport, eventId, "no record row");
  else check(led, { surface: "results-v2.nba-record", sport, eventId, market: "game", field: "side", official: offSide, value: record.side ?? null });
}

function nbaSlate(ctx, led, date, onlyIds) {
  const { repoRoot, app } = ctx;
  const dayRel = (fam) => `data/internal/research/nba/experimental-${fam}/forecasts/${date}.json`;
  const officialDoc = readJson(path.join(repoRoot, dayRel(NBA_OFFICIAL_FAMILY)));
  if (!officialDoc) return { ids: [], snapshots: [], refusals: [{ sport: "NBA", eventId: date, code: "NO_ARTIFACT", message: `no v0.1 forecasts for ${date}` }] };
  const supportingDoc = readJson(path.join(repoRoot, dayRel(NBA_SUPPORTING_FAMILY)));
  const lane = readJson(path.join(app.dataDir, `nba/experimental-public/${date}.json`));
  const ids = officialDoc.games.map((g) => String(g.providerEventId)).filter((id) => !onlyIds.length || onlyIds.includes(id)).sort();
  const nowIso = `${date}T16:30:00Z`;
  const rowsAll = lane ? boardRows(lane, PROJECTION_BOARD_STATS) : [];
  const gate = lane ? gateLaneTopBoards(lane, { dated: lane, nowIso: lane.generatedAt }) : null;
  const laneBoardRows = gate?.state === "PUBLISHED" ? gate.doc.boards.flatMap((b) => b.rows.map((r) => ({ ...r, market: b.key }))) : null;
  const hub = lane ? app.nbaHubSlate({ nowIso, lane }) : null;
  const theaterDoc = app.possession(date);
  const privateBoard = readJson(path.join(repoRoot, `data/internal/research/nba/top-boards/${NBA_OFFICIAL_FAMILY}/${date}.json`));
  const results = lane ? nbaForecastVsActual([lane], readJson(path.join(app.dataDir, "nba/results/finals-2026-27.json"))) : null;
  const nextDay = new Date(Date.parse(`${date}T12:00:00Z`) + 864e5).toISOString().slice(0, 10);
  const snapshots = [], refusals = [];
  for (const id of ids) {
    let snapshot;
    try {
      snapshot = nbaOfficialSnapshot(id, { official: { doc: officialDoc, path: dayRel(NBA_OFFICIAL_FAMILY), sha256: null }, supporting: supportingDoc ? { doc: supportingDoc, path: dayRel(NBA_SUPPORTING_FAMILY), sha256: null } : null });
    } catch (e) {
      if (!(e instanceof SnapshotRefusal)) throw e;
      refusals.push({ sport: "NBA", eventId: id, code: e.code, message: e.message });
      continue;
    }
    snapshots.push(snapshot);
    const laneGame = (lane?.games ?? []).find((g) => String(g.providerEventId) === id) ?? null;
    const tg = (theaterDoc?.games ?? []).find((g) => String(g.providerEventId) === id) ?? null;
    const pl = app.publicPayload(id, date);
    const boardValues = (privateBoard?.editions ?? []).flatMap((ed) => Object.values(ed.boards ?? {}).flatMap((b) => b.rows ?? [])).filter((r) => String(r.eventId) === id).length * 2; // p50 + mean
    if (boardValues) led.count(`nba-top-board.${NBA_OFFICIAL_FAMILY}`, "NBA", id, boardValues); else led.absent(`nba-top-board.${NBA_OFFICIAL_FAMILY}`, "NBA", id, "no private board row for this event");
    nbaSurfaces(led, {
      snapshot, date, laneGame,
      hubGame: hub?.games?.find((g) => String(g.id) === id) ?? null,
      boardRowsOf: rowsAll.filter((r) => r.game === id),
      topBoards: laneBoardRows ? { rows: laneBoardRows } : null,
      theater: tg?.official?.panel ? { panel: tg.official.panel, freezeSha: tg.inputs?.officialFreeze?.payloadSha256 ?? null } : null,
      publicPayload: pl.ok ? { ok: true, official: pl.payload.official } : { ok: false, reason: pl.error?.code ?? "refused" },
      settled: app.settled(id, nextDay),
      record: (results?.games ?? []).find((g) => String(g.providerEventId) === id) ?? null,
    });
  }
  return { ids, snapshots, refusals };
}

/* ═════════════════════════ NFL ═════════════════════════ */

/**
 * Pure: one NFL event's non-audit surfaces. `frozenBoards` is one Results V2 day file, `boardGeneratedAt` the official
 * board's revision instant: a row frozen from an earlier revision that differs is FROZEN_BEFORE_FINAL.
 */
export function nflSurfaces(led, { snapshot, record, boardGeneratedAt, index = null, week = null, hubRead = null, vault = null, frozenBoards = null }) {
  const eventId = snapshot.eventId;
  const sport = "NFL";
  const g = snapshot.game;
  const fam = (pid, f) => playerOf(snapshot, pid)?.families?.[f] ?? null;
  const pair = (surface, field, official, value) => check(led, { surface, sport, eventId, market: "game", field, official, value });
  if (!index) led.absent("nfl-index", sport, eventId, "event not in nfl/index.json");
  else {
    const s = "nfl-index";
    pair(s, "pHome", g.pHomePublished, index.winProbability?.home ?? null); pair(s, "pAway", g.pAway, index.winProbability?.away ?? null);
    pair(s, "projectedHome", g.projectedScore.home, index.projectedScore?.home ?? null); pair(s, "projectedAway", g.projectedScore.away, index.projectedScore?.away ?? null);
    pair(s, "totalMedian", g.total.median, index.total?.median ?? null); pair(s, "inputHash", record?.model?.inputHash ?? null, index.receipt?.inputHash ?? null);
  }
  if (!week) led.absent("nfl-week-page", sport, eventId, "event not on its week page");
  else {
    const s = "nfl-week-page", f = week.forecastSummary ?? {};
    pair(s, "pHome", g.pHomePublished, f.winProbability?.home ?? null); pair(s, "pAway", g.pAway, f.winProbability?.away ?? null);
    pair(s, "projectedHome", g.projectedScore.home, f.projectedScore?.home ?? null); pair(s, "projectedAway", g.projectedScore.away, f.projectedScore?.away ?? null);
  }
  if (!hubRead) led.absent("nfl-hub", sport, eventId, "no pregame hub read for this event");
  else { pair("nfl-hub", "pHome", g.pHomePublished, hubRead.home ?? null); pair("nfl-hub", "pAway", g.pAway, hubRead.away ?? null); }
  if (!vault) led.absent("nfl-end-zone-vault", sport, eventId, "no vault file");
  else {
    const rows = [...(vault.selections ?? []), ...(vault.watchlist ?? [])].filter((x) => String(x.providerEventId) === eventId);
    if (!rows.length) led.absent("nfl-end-zone-vault", sport, eventId, "no vault row for this event");
    for (const r of rows) check(led, { surface: "nfl-end-zone-vault", sport, eventId, playerId: r.playerId, player: r.name, market: "anytime_td", field: "probability", official: fam(r.playerId, "anytime_td")?.distribution?.p ?? null, value: r.tdProbability ?? null });
  }
  if (!frozenBoards) led.absent("results-v2.top-boards", sport, eventId, "no frozen Results board for this ET day");
  else {
    const surface = "results-v2.top-boards";
    const exact = ms(frozenBoards.publishedAt) > ms(RESULTS_EXACT_FROM);
    const rows = (frozenBoards.boards ?? []).flatMap((b) => (b.rows ?? []).filter((r) => String(r.providerEventId) === eventId).map((r) => ({ ...r, market: b.propFamily })));
    if (!rows.length) led.absent(surface, sport, eventId, "no row for this event");
    for (const r of rows) {
      const o = fam(r.playerId, r.market);
      const earlier = ms(r.boardGeneratedAt) < ms(boardGeneratedAt);
      const label = earlier ? { classification: CLASS.FROZEN_BEFORE_FINAL, note: `frozen from board ${r.boardGeneratedAt}; final pregame board ${boardGeneratedAt}` } : {};
      if (!o) { led.add({ surface, sport, eventId, playerId: r.playerId, player: r.name, market: r.market, field: "noOfficialCounterpart", official: null, value: r.projection?.median ?? r.projection?.probability ?? null, diff: null, ...label }); continue; }
      if ("probability" in (r.projection ?? {})) check(led, { surface, sport, eventId, playerId: r.playerId, player: r.name, market: r.market, field: "probability", official: o.distribution?.p ?? null, value: r.projection.probability, ...label });
      else check(led, { surface, sport, eventId, playerId: r.playerId, player: r.name, market: r.market, field: "median", official: exact ? o.median : Math.round(o.median), value: r.projection?.median ?? null, ...label });
    }
  }
}

function nflEvent(ctx, led, id) {
  const { app } = ctx;
  const view = app.nflOfficial(id);
  if (!view.snapshot) return { refusals: [{ sport: "NFL", eventId: id, code: view.refusal ?? "NO_SNAPSHOT", message: `no official snapshot for ${id}` }], snapshots: [] };
  const { snapshot, record, board } = view;
  const idx = readJson(path.join(app.dataDir, "nfl/index.json"));
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms(snapshot.lockAt)));
  const weekKey = `${board.seasonType}-${String(board.week).padStart(2, "0")}`;
  for (const [surface, n] of Object.entries(app.nflAuditCounts(id, weekKey, snapshot))) {
    if (n) led.count(surface, "NFL", id, n); else led.absent(surface, "NFL", id, "nothing committed for this event on this surface");
  }
  nflSurfaces(led, {
    snapshot, record, boardGeneratedAt: board.generatedAt,
    index: (idx?.events ?? []).find((e) => String(e.providerEventId) === id) ?? null,
    week: app.weekGame(weekKey, id),
    hubRead: app.nflHubRead(board.generatedAt, id, record),
    vault: readJson(path.join(app.dataDir, "nfl/end-zone-vault/latest.json")),
    frozenBoards: readJson(path.join(app.dataDir, `results/top-boards/${day}.json`)),
  });
  return { refusals: [], snapshots: [snapshot] };
}

/* ═════════════════════════ social packages ═════════════════════════ */

const decimalsOf = (v) => { const s = String(v); return s.includes(".") ? s.length - s.indexOf(".") - 1 : 0; };
const NFL_MARKET = /^(player_|anytime_td)/;

/**
 * Value claims in a directory of packages (any JSON nesting). A record is an object under an event id (eventId,
 * providerEventId) that names a player (playerId, providerAthleteId) with `medians`, `comboMedians`, or a market + value.
 * Game-level `favoured` claims are read too. An event-scoped player object with no readable value is counted, not passed.
 */
export function readSocialDir(dir) {
  const claims = [];
  let files = 0, unreadable = 0, unparsedPlayers = 0;
  const walkFiles = (d) => fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap((e) => (e.isDirectory() ? walkFiles(path.join(d, e.name)) : e.name.endsWith(".json") ? [path.join(d, e.name)] : []));
  const visit = (o, eventId, file) => {
    if (Array.isArray(o)) { for (const x of o) visit(x, eventId, file); return; }
    if (!o || typeof o !== "object") return;
    const ev = String(o.providerEventId ?? o.eventId ?? eventId ?? "") || null;
    const pid = o.providerAthleteId ?? o.playerId ?? null;
    if (ev && o.favoured && typeof (o.favoured.abbr ?? o.favoured) === "string") claims.push({ file, eventId: ev, playerId: null, market: "game", field: "favoured", value: o.favoured.abbr ?? o.favoured });
    if (ev && pid != null) {
      const before = claims.length;
      const name = o.name ?? o.displayName ?? o.player ?? null;
      const base = { file, eventId: ev, playerId: String(pid), player: typeof name === "string" ? name : null };
      for (const block of [o.medians, o.comboMedians]) for (const [k, v] of Object.entries(block ?? {})) if (isNum(v)) claims.push({ ...base, market: k, field: "median", value: v });
      const market = o.market ?? o.family ?? o.propFamily ?? o.stat ?? null;
      const value = [o.value, o.median, o.probability, o.projection?.median, o.projection?.probability, o.projection].find(isNum);
      if (market && value != null) claims.push({ ...base, market, field: isNum(o.probability) || isNum(o.projection?.probability) ? "probability" : "median", value });
      if (claims.length === before) unparsedPlayers += 1;
    }
    for (const v of Object.values(o)) if (v && typeof v === "object") visit(v, ev, file);
  };
  for (const f of walkFiles(dir)) {
    files += 1;
    const doc = readJson(f);
    if (!doc) { unreadable += 1; continue; }
    visit(doc, null, path.relative(dir, f));
  }
  return { claims, files, unreadable, unparsedPlayers };
}

/** Each claim against the snapshot of its event, at the precision the claim itself is printed at. */
export function socialSurfaces(led, read, snapshots) {
  const byId = new Map(snapshots.map((s) => [s.eventId, s]));
  let outOfScope = 0;
  for (const c of read.claims) {
    const snap = byId.get(c.eventId);
    if (!snap) { outOfScope += 1; continue; }
    const surface = "social-package", sport = snap.sport, eventId = c.eventId;
    if (c.market === "game") { check(led, { surface, sport, eventId, market: "game", field: c.field, official: sideAbbr(snap), value: c.value, source: c.file }); continue; }
    const fam = playerOf(snap, c.playerId)?.families?.[c.market] ?? null;
    if (!fam) { led.add({ surface, sport, eventId, playerId: c.playerId, player: c.player ?? null, market: c.market, field: "noOfficialCounterpart", official: null, value: c.value, diff: null, source: c.file }); continue; }
    const official = c.field === "probability" ? fam.distribution?.p ?? null : fam.median;
    const dp = decimalsOf(c.value);
    const rounded = isNum(official) ? Number(official.toFixed(dp)) : null;
    check(led, { surface, sport, eventId, playerId: c.playerId, player: c.player ?? null, market: c.market, field: c.field, official: rounded, value: c.value, source: c.file });
  }
  return { files: read.files, claims: read.claims.length, outOfScopeClaims: outOfScope, unreadableFiles: read.unreadable, playerObjectsWithNoReadableValue: read.unparsedPlayers };
}

/* ═════════════════════════ run + render ═════════════════════════ */

/** Accessors the surfaces are read through. All read app/public through process.cwd(), so they run from app/. */
async function defaultAccessors(repoRoot) {
  const app = path.join(repoRoot, "app");
  const dataDir = path.join(app, "public/data");
  const publicDir = path.join(app, "public");
  const { nbaTodaySlateFrom } = await import("../../src/lib/sport-hub/nba-hub.ts");
  const { readPossessionArtifact } = await import("../../src/lib/simulation-theater/nba/possession/stored-run.mjs");
  const { loadPublicPossessionTheater } = await import("../../src/lib/simulation-theater/nba/possession/public-loader.mjs");
  const { loadSettledSimulation } = await import("../../src/components/nba/settled-simulation-data.ts");
  const { officialSnapshotFor, loadForecastView } = await import("../../src/lib/sports/nfl/forecast-view-load.mjs");
  const { topBoards } = await import("../../src/lib/sports/nfl/forecast-view.mjs");
  const { unionFrozenForecasts } = await import("../../src/lib/sports/nfl/public-forecast-union.mjs");
  const { nflPublicRecordResolver } = await import("../../src/lib/sports/nfl/public-record.mjs");
  const { readWorldModelArtifacts } = await import("../../src/lib/sports/nfl/world-model-v2/read.mjs");
  const { weekGames } = await import("../../src/lib/sports/nfl/week-games.ts");
  const { nflHub } = await import("../../src/lib/sport-hub/adapters.ts");
  return {
    dataDir,
    nbaHubSlate: ({ nowIso, lane }) => nbaTodaySlateFrom({ nowIso, schedule: readJson(path.join(dataDir, "nba/schedule/latest.json")), finals: null, lane }),
    possession: (date) => readPossessionArtifact(repoRoot, date).doc ?? null,
    publicPayload: (id, date) => loadPublicPossessionTheater(repoRoot, id, { date }),
    settled: (id, today) => loadSettledSimulation(id, today),
    nflOfficial: (id) => {
      const union = unionFrozenForecasts(readJson(path.join(dataDir, "nfl/forecasts/latest.json")), readJson(path.join(dataDir, "nfl/forecasts/frozen-latest.json")), { resolve: nflPublicRecordResolver(repoRoot) });
      const record = union.forecasts.find((f) => String(f.providerEventId) === id) ?? null;
      const board = readJson(path.join(dataDir, "nfl/player-board", `${id}.json`));
      if (!record || !board) return { snapshot: null, refusal: record ? "NO_PLAYER_BOARD" : "NO_PUBLIC_RECORD" };
      const world = readWorldModelArtifacts(publicDir).find((a) => String(a.identity.providerEventId) === id) ?? null;
      const { snapshot, refusal } = officialSnapshotFor(record, board, world);
      return { snapshot, refusal, record, board };
    },
    weekGame: (key, id) => { try { return weekGames(dataDir, key).games.find((g) => String(g.providerEventId) === id) ?? null; } catch { return null; } },
    nflAuditCounts: (id, weekKey, snapshot) => {
      const view = loadForecastView(publicDir, id);
      const rowsOf = (doc) => (doc?.boards ?? []).flatMap((b) => b.rows ?? []).filter((r) => String(r.providerEventId) === id).length;
      const families = view ? view.players.reduce((n, r) => n + Object.keys(r.families).length, 0) : 0;
      const top = view ? topBoards([view], { now: snapshot.generatedAt, size: 10 }) : null;
      return {
        "nfl-game-page.players": families,
        "nfl-top-boards": top ? Object.values(top.boards).reduce((n, b) => n + b.rows.length, 0) : 0,
        "nfl-weekly-boards": rowsOf(readJson(path.join(dataDir, `nfl/weekly-boards/${weekKey}.json`))),
        "nfl-live-props.frozen": (readJson(path.join(dataDir, `nfl/live-props/${id}.json`))?.rows ?? []).length,
        "nfl-public-forecast": view ? 5 : 0,
        "world-model-v2.forecastOfRecord": readJson(path.join(dataDir, `nfl/world-model-v2/${id}.json`)) ? 5 : 0,
      };
    },
    nflHubRead: (nowIso, id, record) => {
      const row = (nflHub(nowIso).rows ?? []).find((r) => r.id === `nfl:${id}`);
      if (!row?.read?.split) return null;
      const split = Object.fromEntries(row.read.split.map((x) => [x.label, x.p]));
      return { home: split[record.home?.abbr] ?? null, away: split[record.away?.abbr] ?? null };
    },
  };
}

export async function auditAcrossSurfaces({ repoRoot = REPO_ROOT, date = null, events = [], socialDir = null, accessors = null } = {}) {
  const app = accessors ?? (await defaultAccessors(repoRoot));
  const led = newLedger();
  const ctx = { repoRoot, app };
  const dayIds = date ? (readJson(path.join(repoRoot, `data/internal/research/nba/experimental-${NBA_OFFICIAL_FAMILY}/forecasts/${date}.json`))?.games ?? []).map((g) => String(g.providerEventId)) : [];
  const nbaOnly = events.filter((e) => dayIds.includes(e));
  const nflIds = events.filter((e) => !dayIds.includes(e));
  const nba = date ? nbaSlate(ctx, led, date, nbaOnly) : { ids: [], snapshots: [], refusals: [] };
  const audit = runConsistencyAudit({ repoRoot, nflEvents: nflIds, nbaDates: date ? [date] : [], includeStatic: false });
  const scope = new Set([...nba.ids, ...nflIds]);
  auditRows(led, audit.discrepancies.filter((d) => scope.has(String(d.eventId))));
  const nfl = nflIds.map((id) => nflEvent(ctx, led, id));
  const snapshots = [...nba.snapshots, ...nfl.flatMap((n) => n.snapshots)];
  const social = socialDir ? socialSurfaces(led, readSocialDir(socialDir), snapshots) : null;
  const order = (r) => [r.classification === CLASS.UNEXPLAINED ? 0 : 1, r.sport, r.surface, r.eventId, r.market ?? "", r.field ?? "", String(r.playerId ?? "")].join("|");
  const mismatches = led.mismatches.slice().sort((a, b) => order(a).localeCompare(order(b)));
  const byClass = Object.fromEntries(Object.values(CLASS).map((c) => [c, mismatches.filter((m) => m.classification === c).length]));
  return {
    schema: AUDIT_SCHEMA, readOnly: true, date, events: { NBA: nba.ids, NFL: nflIds },
    snapshots: snapshots.map((s) => ({ sport: s.sport, eventId: s.eventId, matchup: s.matchup, snapshotId: s.snapshotId, frozenAt: s.frozenAt, lockAt: s.lockAt })),
    refusals: [...nba.refusals, ...nfl.flatMap((n) => n.refusals), ...audit.refusals],
    researchBoards: audit.researchBoards.filter((b) => scope.has(String(b.eventId))).length,
    coverage: led.coverageRows(), social, summary: { mismatches: mismatches.length, byClass }, mismatches,
  };
}

const cell = (v) => (v == null ? "—" : typeof v === "number" ? String(v) : String(v).length > 28 ? `${String(v).slice(0, 25)}…` : String(v));
const row = (cells) => `| ${cells.join(" | ")} |`;
const table = (head, rows) => [row(head), row(head.map(() => "---")), ...rows.map(row)].join("\n");

export function renderMarkdown(rep) {
  const out = [];
  const matchup = new Map(rep.snapshots.map((s) => [s.eventId, s.matchup]));
  out.push(`# Official value across surfaces: ${[rep.date ? `NBA ${rep.date} (${rep.events.NBA.length} games)` : null, ...rep.events.NFL.map((id) => `NFL ${matchup.get(id) ?? id} ${id}`)].filter(Boolean).join(", ")}`);
  out.push("");
  const c = rep.summary.byClass;
  out.push(`${rep.summary.mismatches} mismatch rows: ${c.UNEXPLAINED} UNEXPLAINED, ${c.FROZEN_BEFORE_FINAL} FROZEN_BEFORE_FINAL, ${c.LABELLED_SIMULATION} LABELLED_SIMULATION. ${rep.refusals.length} snapshot refusals. Nothing was rewritten.`);
  for (const r of rep.refusals) out.push(`- REFUSED ${r.sport} ${r.eventId}: ${r.message}`);
  out.push("");
  out.push("## Coverage");
  out.push("");
  const byKey = new Map();
  for (const m of rep.mismatches) { const k = `${m.sport}|${m.surface}`; byKey.set(k, (byKey.get(k) ?? 0) + 1); }
  out.push(table(["sport", "surface", "events", "values compared", "mismatches", "events absent", "why absent"], rep.coverage.map((x) => [x.sport, x.surface, x.eventsChecked, x.compared, byKey.get(`${x.sport}|${x.surface}`) ?? 0, x.eventsAbsent, x.absentReasons.join("; ") || "—"])));
  out.push("");
  if (rep.researchBoards) { out.push(`${rep.researchBoards} challenger research board entries were inventoried and not compared (labelled research only).`); out.push(""); }
  if (rep.social) { out.push(`Social directory: ${rep.social.files} files, ${rep.social.claims} claims, ${rep.social.outOfScopeClaims} on other events, ${rep.social.unreadableFiles} unreadable, ${rep.social.playerObjectsWithNoReadableValue} player objects with no readable value.`); out.push(""); }
  out.push("## Mismatches");
  out.push("");
  if (!rep.mismatches.length) out.push("None on the values compared above.");
  else out.push(table(["class", "surface", "sport", "event", "player", "market", "field", "official", "surface value", "diff"], rep.mismatches.map((m) => [m.classification, m.surface, m.sport, `${matchup.get(m.eventId) ?? ""} ${m.eventId}`.trim(), m.player ?? (m.playerId ?? "—"), m.market ?? "—", m.field ?? "—", cell(m.official), cell(m.value), m.diff ?? "—"])));
  out.push("");
  const notes = [...new Set(rep.mismatches.filter((m) => m.note).map((m) => `${m.classification} · ${m.surface}: ${m.note}`))].sort();
  if (notes.length) { out.push("## Why each class"); out.push(""); for (const n of notes) out.push(`- ${n}`); out.push(""); }
  return out.join("\n");
}

async function main(argv) {
  const values = (n) => argv.flatMap((a, i) => (a === n && argv[i + 1] ? [argv[i + 1]] : []));
  const refuse = (m) => { console.error(`REFUSED: ${m}`); process.exit(2); };
  const [date = null] = values("--date");
  const events = values("--event").map(String);
  if (!date && !events.length) refuse("--date YYYY-MM-DD and/or --event <id> required");
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) refuse("--date takes YYYY-MM-DD");
  const [socialDir = null] = values("--social-dir");
  if (socialDir && !fs.existsSync(socialDir)) refuse(`no directory ${socialDir}`);
  const [jsonOut = null] = values("--json");
  if (jsonOut && isInsideRepo(jsonOut)) refuse(`--json ${path.resolve(jsonOut)} is inside the repository`);
  const rep = await auditAcrossSurfaces({ date, events, socialDir });
  if (jsonOut) { fs.mkdirSync(path.dirname(path.resolve(jsonOut)), { recursive: true }); fs.writeFileSync(jsonOut, `${JSON.stringify(rep, null, 2)}\n`); }
  process.stdout.write(renderMarkdown(rep));
  if (argv.includes("--strict") && rep.summary.byClass.UNEXPLAINED > 0) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main(process.argv.slice(2));
