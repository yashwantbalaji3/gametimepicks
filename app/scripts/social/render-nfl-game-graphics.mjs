#!/usr/bin/env node
/* global document, window -- the page.evaluate callback below runs in the Playwright browser page, not in node */
/**
 * NFL PER-GAME PLAYER PROJECTION GRAPHICS — renderer CLI (Week 8 Sunday/Monday slate, 2026-11-01/02).
 *
 *   cd app && npx tsx scripts/social/render-nfl-game-graphics.mjs --season-type 2 --week 8 --as-of <ISO instant> \
 *       --purpose founder-review [--event <id>] [--out ~/gtp-private/graphics/nfl-w08/] [--scales 1,2] [--no-png]
 *
 * Flow per game (Sunday and Monday ET kickoffs of the week): the game page's view (forecast-view-load.mjs
 * loadForecastViews: the official snapshot nflOfficialSnapshot) + the committed player board + the roster capture's
 * positions → `gtp-graphics-export@1` NFL_GAME_PLAYERS document (lib/social/nfl-game-graphics-export.mjs) → HARD
 * VALIDATION against the official snapshot rebuilt here independently of the view (scripts/social/nfl-game-cards.mjs
 * verifyAgainstSources) and the @1 contract validator → card HTML, each verified to carry exactly its export cells →
 * captions (no em or en dash) → a layout pass over every card → only then PNGs at 1080×1350 and every --scales factor
 * (default 1 and 2 → "@2x"). A game that has kicked off at --as-of is REFUSED (listed in the slate manifest, nothing
 * written for it). Any validation failure refuses the whole run before a file is written.
 *
 * GATING: NFL social display is not authorized and no NFL family is direction-qualified, so no line, price or colour
 * can reach a card (nfl-game-cards.mjs marketSlot). --purpose social refuses while social is not authorized;
 * --purpose founder-review writes a private review set: every card carries the gold "FOUNDER REVIEW ONLY" banner and the
 * output directory must be outside every git repository (default ~/gtp-private/graphics/nfl-w<week>/).
 *
 * Reads no key and makes no network call. Exit: 0 rendered; 1 refused.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assertPrivateOutDir, DEFAULT_PRIVATE_ROOT, APP } from "./nba-line-graphics-io.mjs";
import { SIZE, paginate, renderGameCardHtml, verifyCardHtml, verifyAgainstSources, gameCaption, captionViolations } from "./nfl-game-cards.mjs";
import { buildNflGameGraphicsExport, serializeNflGameGraphicsExport, etWeekday, PURPOSE } from "../../src/lib/social/nfl-game-graphics-export.mjs";
import { loadForecastViews, officialSnapshotFor } from "../../src/lib/sports/nfl/forecast-view-load.mjs";
import { unionFrozenForecasts } from "../../src/lib/sports/nfl/public-forecast-union.mjs";
import { nflPublicRecordResolver } from "../../src/lib/sports/nfl/public-record.mjs";
import { readWorldModelArtifacts } from "../../src/lib/sports/nfl/world-model-v2/read.mjs";
import { displayAuthorization } from "../../src/lib/odds/display-authorization.mjs";
import { instantMs } from "../../src/lib/social/graphics-export.mjs";

const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
export const SLATE_DAYS = Object.freeze(["Sun", "Mon"]);
export const PURPOSE_ARG = Object.freeze({ "founder-review": PURPOSE.FOUNDER_REVIEW, social: PURPOSE.SOCIAL });

export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith("--")) throw new Error(`unexpected argument ${a}`);
    if (a === "--no-png") { out["no-png"] = true; continue; }
    out[a.slice(2)] = argv[i + 1];
    i += 1;
  }
  return out;
}

/** Roster positions keyed by ESPN athlete id (the game page's all-players table reads the same file the same way). */
export function rosterPositions(publicDir) {
  const file = path.join(publicDir, "data", "nfl", "rosters", "latest.json");
  const doc = readJson(file);
  const m = new Map();
  for (const t of doc?.teams ?? []) for (const p of t.players ?? []) if (p.id && p.position?.abbreviation) m.set(String(p.id), p.position.abbreviation);
  return { positions: m, ref: { ref: "app/public/data/nfl/rosters/latest.json", sha256: fs.existsSync(file) ? sha(fs.readFileSync(file)) : null } };
}

/**
 * The canonical inputs of the week's games: views (the site's accessor), raw boards, and the official snapshot of each
 * game rebuilt here from the same committed files (for the independent check).
 */
export function loadCanonical({ publicDir = path.join(APP, "public"), seasonType, week }) {
  const data = path.join(publicDir, "data", "nfl");
  const views = loadForecastViews(publicDir).filter((v) => v.seasonType === seasonType && v.week === week);
  const union = unionFrozenForecasts(readJson(path.join(data, "forecasts/latest.json")), readJson(path.join(data, "forecasts/frozen-latest.json")), { resolve: nflPublicRecordResolver(path.resolve(publicDir, "..", "..")) });
  const forecasts = new Map((union?.forecasts ?? []).map((f) => [String(f.providerEventId), f]));
  const worlds = new Map(readWorldModelArtifacts(publicDir).map((a) => [String(a.identity.providerEventId), a]));
  const games = views.map((view) => {
    const id = String(view.providerEventId);
    const file = path.join(data, "player-board", `${id}.json`);
    const bytes = fs.existsSync(file) ? fs.readFileSync(file) : null;
    const board = bytes ? JSON.parse(bytes.toString("utf8")) : null;
    const f = forecasts.get(id);
    const { snapshot, refusal } = f ? officialSnapshotFor(f, board, worlds.get(id) ?? null) : { snapshot: null, refusal: "NO_FORECAST" };
    return { view, board, boardSha256: bytes ? sha(bytes) : null, snapshot, snapshotRefusal: refusal };
  });
  return { games, ...rosterPositions(publicDir) };
}

/**
 * Everything up to (not including) the PNGs, for every Sunday/Monday game of the week. Throws on any validation
 * failure; a started game is refused (listed), not thrown, unless it was asked for with --event.
 */
export function prepareNflGameGraphics({ seasonType = 2, week, asOf, purpose = PURPOSE.FOUNDER_REVIEW, eventId = null, publicDir, authorizationRecord }) {
  if (!Number.isInteger(week)) throw new Error("--week <n> is required");
  if (!asOf || !Number.isFinite(Date.parse(asOf)) || !/T.*(Z|[+-]\d\d:\d\d)$/.test(asOf)) throw new Error("--as-of <ISO instant with zone> is required (no clock is read)");
  if (purpose === PURPOSE.SOCIAL && !displayAuthorization("nfl", "social", authorizationRecord).ok) {
    throw new Error("NFL graphics are not authorized for social posting (socialDisplay false). For a private review set use --purpose founder-review. Nothing written.");
  }
  const { games, positions, ref: rosterRef } = loadCanonical({ publicDir, seasonType, week });
  let slate = games.filter((g) => SLATE_DAYS.includes(etWeekday(g.view.kickoffUtc)));
  if (eventId) {
    slate = slate.filter((g) => String(g.view.providerEventId) === String(eventId));
    if (!slate.length) throw new Error(`event ${eventId} is not a Sunday/Monday game of week ${week}. Nothing written.`);
  }
  if (!slate.length) throw new Error(`no Sunday/Monday games in season type ${seasonType} week ${week}. Nothing written.`);
  const t = Date.parse(asOf);
  const refused = [];
  const out = [];
  for (const g of slate) {
    const id = String(g.view.providerEventId);
    if (!(instantMs(g.view.kickoffUtc) > t)) {
      refused.push({ eventId: id, matchup: g.view.matchup, kickoffUtc: g.view.kickoffUtc, reason: "GAME_STARTED" });
      continue;
    }
    const doc = buildNflGameGraphicsExport({
      view: g.view, board: g.board, positions, asOf, purpose, boardSha256: g.boardSha256, authorizationRecord,
      inputs: [{ ref: `app/public/data/nfl/player-board/${id}.json`, sha256: g.boardSha256 }, rosterRef],
    });
    const srcErrs = verifyAgainstSources({ doc, snapshot: g.snapshot, board: g.board });
    if (srcErrs.length) throw new Error(`${id} ${g.view.matchup}: validation against the official snapshot failed:\n  - ${srcErrs.slice(0, 20).join("\n  - ")}\nNothing written.`);
    const cards = paginate(doc).map((page) => {
      const html = renderGameCardHtml({ doc, page, record: authorizationRecord });
      const errs = verifyCardHtml(html, doc, page, authorizationRecord);
      if (errs.length) throw new Error(`card ${id} ${page.page}/${page.pages} failed validation:\n  - ${errs.join("\n  - ")}\nNothing written.`);
      return { name: `nfl-w${String(week).padStart(2, "0")}-${id}-${page.page}of${page.pages}`, page: page.page, pages: page.pages, html, rowIds: page.teams.flatMap((x) => x.players.flatMap((p) => p.rowIds)) };
    });
    const caption = gameCaption(doc);
    const cv = captionViolations(caption);
    if (cv.length) throw new Error(`${id} caption failed validation (${cv.join("; ")}): ${caption}\nNothing written.`);
    out.push({ eventId: id, doc, cards, caption, snapshotId: g.snapshot.snapshotId });
  }
  if (eventId && refused.length) throw new Error(`${eventId} ${refused[0].matchup}: the game has started at ${asOf}. Nothing written.`);
  return { games: out, refused };
}

async function withBrowser(fn) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  try { return await fn(browser); } finally { await browser.close(); }
}
async function layoutErrors(browser, cards) {
  const ctx = await browser.newContext({ deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errs = [];
  await page.setViewportSize({ width: SIZE.width, height: SIZE.height });
  for (const c of cards) {
    await page.setContent(c.html, { waitUntil: "load" });
    const m = await page.evaluate(() => {
      const foot = document.querySelector(".foot");
      const clipped = [...document.querySelectorAll(".team")].filter((t) => t.scrollHeight > t.clientHeight + 1).length;
      const ellipsis = [...document.querySelectorAll(".pname")].filter((n) => n.scrollWidth > n.clientWidth + 1).map((n) => n.textContent);
      return { footBottom: foot.getBoundingClientRect().bottom, h: window.innerHeight, clipped, ellipsis };
    });
    if (m.footBottom > m.h - 10) errs.push(`${c.name}: content overflows the frame (footer bottom ${Math.round(m.footBottom)}px)`);
    if (m.clipped) errs.push(`${c.name}: ${m.clipped} team panel(s) clip their rows`);
    if (m.ellipsis.length) errs.push(`${c.name}: player names truncated: ${m.ellipsis.join(", ")}`);
  }
  await ctx.close();
  return errs;
}
async function screenshot(browser, cards, scales) {
  const files = [];
  for (const scale of scales) {
    const ctx = await browser.newContext({ deviceScaleFactor: scale });
    const page = await ctx.newPage();
    await page.setViewportSize({ width: SIZE.width, height: SIZE.height });
    for (const c of cards) {
      await page.setContent(c.html, { waitUntil: "load" });
      const file = path.join(c.dir, `${c.name}${scale === 1 ? "" : `@${scale}x`}.png`);
      await page.screenshot({ path: file, clip: { x: 0, y: 0, width: SIZE.width, height: SIZE.height } });
      files.push(file);
    }
    await ctx.close();
  }
  return files;
}

/**
 * The whole run. Validates everything first; writes only after every check (and the layout pass) passed.
 * @param {Record<string, any>} args  CLI args
 */
export async function renderNflGameGraphics(args, { publicDir, authorizationRecord } = {}) {
  const purpose = PURPOSE_ARG[args.purpose ?? "social"];
  if (!purpose) throw new Error("--purpose founder-review|social");
  const week = Number(args.week);
  const seasonType = Number(args["season-type"] ?? 2);
  const outRoot = assertPrivateOutDir(args.out ?? path.join(DEFAULT_PRIVATE_ROOT, `nfl-w${String(week).padStart(2, "0")}`));
  const scales = String(args.scales ?? "1,2").split(",").map(Number);
  if (!scales.length || scales.some((s) => !Number.isInteger(s) || s < 1 || s > 3)) throw new Error("--scales: comma-separated integers 1..3");
  const { games, refused } = prepareNflGameGraphics({ seasonType, week, asOf: args["as-of"], purpose, eventId: args.event ?? null, publicDir, authorizationRecord });
  if (!games.length) throw new Error(`every Sunday/Monday game has started at ${args["as-of"]}. Nothing written.`);
  const allCards = games.flatMap((g) => g.cards.map((c) => ({ ...c, dir: path.join(outRoot, g.eventId) })));

  const writeAll = async (browser) => {
    if (browser) {
      const errs = await layoutErrors(browser, allCards);
      if (errs.length) throw new Error(`layout check failed:\n  - ${errs.join("\n  - ")}\nNothing written.`);
    }
    const perGame = [];
    for (const g of games) {
      const dir = path.join(outRoot, g.eventId);
      fs.mkdirSync(path.join(dir, "html"), { recursive: true });
      const written = [];
      const write = (rel, text) => { const f = path.join(dir, rel); fs.writeFileSync(f, text); written.push(f); };
      write(`export-nfl-${g.eventId}${purpose === PURPOSE.FOUNDER_REVIEW ? "-founder-review" : ""}.json`, serializeNflGameGraphicsExport(g.doc));
      for (const c of g.cards) write(path.join("html", `${c.name}.html`), c.html);
      write("captions.json", `${JSON.stringify({ purpose, socialAuthorized: false, eventId: g.eventId, matchup: g.doc.game.matchup, caption: g.caption, images: g.cards.map((c) => c.name) }, null, 2)}\n`);
      perGame.push({ g, dir, written });
    }
    const pngs = browser ? await screenshot(browser, allCards, scales) : [];
    return { perGame, pngs };
  };
  const { perGame, pngs } = args["no-png"] ? await writeAll(null) : await withBrowser(writeAll);

  const gameManifests = perGame.map(({ g, dir, written }) => {
    const mine = pngs.filter((f) => path.dirname(f) === dir);
    const manifest = {
      schema: "gtp-nfl-game-graphics-manifest@1",
      export: { schemaVersion: g.doc.schemaVersion, edition: g.doc.edition, asOf: g.doc.asOf, purpose: g.doc.purpose, socialAuthorized: false, snapshotId: g.snapshotId, families: g.doc.families, playersPerTeam: g.doc.scope.playersPerTeam, belowTarget: g.doc.scope.belowTarget, excluded: g.doc.excluded, rows: g.doc.rows.length, officialCells: g.doc.rows.filter((r) => r.model.status === "OFFICIAL").length, estimateCells: g.doc.rows.filter((r) => r.model.status === "OFFICIAL_ESTIMATE" && r.model.label).length, estimateLabels: g.doc.estimateDisplay.labels },
      cards: g.cards.map((c) => ({ name: c.name, page: c.page, pages: c.pages, size: SIZE.key, rowIds: c.rowIds, htmlSha256: sha(c.html) })),
      files: [...written, ...mine].map((f) => ({ file: path.relative(dir, f), sha256: sha(fs.readFileSync(f)) })),
    };
    fs.writeFileSync(path.join(dir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    return { eventId: g.eventId, matchup: g.doc.game.matchup, kickoffUtc: g.doc.game.kickoffUtc, etWeekday: g.doc.game.etWeekday, playersPerTeam: g.doc.scope.playersPerTeam, images: g.cards.length, manifestSha256: sha(fs.readFileSync(path.join(dir, "manifest.json"))) };
  });
  const slate = { schema: "gtp-nfl-game-graphics-slate@1", seasonType, week, asOf: args["as-of"], purpose, socialAuthorized: false, games: gameManifests, refused };
  fs.writeFileSync(path.join(outRoot, "slate-manifest.json"), `${JSON.stringify(slate, null, 2)}\n`);
  return { outRoot, games, refused, pngs, slate };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  renderNflGameGraphics(parseArgs(process.argv.slice(2))).then(({ outRoot, games, refused, pngs }) => {
    for (const g of games) console.log(`${g.eventId} ${g.doc.game.matchup} ${g.doc.game.etWeekday} · ${Object.entries(g.doc.scope.playersPerTeam).map(([k, n]) => `${k} ${n}`).join(" / ")} · ${g.cards.length} image(s)`);
    for (const r of refused) console.log(`REFUSED ${r.eventId} ${r.matchup}: ${r.reason}`);
    console.log(`${games.length} games · ${pngs.length} PNGs → ${outRoot}`);
    process.exit(0);
  }, (e) => {
    console.error(`REFUSED: ${e.message}`);
    process.exit(1);
  });
}
