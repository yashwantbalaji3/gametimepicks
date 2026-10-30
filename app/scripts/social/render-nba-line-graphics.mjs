#!/usr/bin/env node
/**
 * NBA OVER/UNDER COMPARISON GRAPHICS — renderer CLI (Friday 2026-10-30 content day).
 *
 *   cd app && GTP_ODDS_DISPLAY_KEY=… npx tsx scripts/social/render-nba-line-graphics.mjs \
 *       --date 2026-10-30 --as-of <ISO instant> --purpose founder-review [--out ~/gtp-private/graphics/2026-10-30/] [--scales 1,2] [--no-png]
 *
 * Flow: build the `gtp-graphics-export@2` NBA_LINE_COMPARISON document from the committed lane, the official receipts
 * and the encrypted line artifact (scripts/social/nba-line-graphics-io.mjs) → HARD VALIDATION (every number equals the
 * export row, the lane value and the artifact's compared row; no started game, stale line or unqualified family) → card
 * HTML (scripts/social/nba-line-cards.mjs) → verify every card's HTML carries exactly its rows' strings → captions (no em
 * dash, no promises) → only then PNGs through Playwright/Chromium: one card per game + a slate summary, at 1600×900 and
 * 1080×1350, each at every --scales factor (default 1 and 2 → "@2x"). Any failure refuses and writes NOTHING.
 *
 * GATING: default --purpose social renders only when the NBA social surface is authorized (not as of 2026-10-29: it
 * refuses). --purpose founder-review renders a private review set: every card carries the gold "FOUNDER REVIEW ONLY"
 * banner, the export says socialAuthorized:false, and the output directory must be outside every git repository
 * (default ~/gtp-private/graphics/<date>/). A synthetic test artifact (dataClass ≠ DISPLAY_ONLY_BUILD_INPUT) is
 * watermarked "TEST DATA — NOT LIVE ODDS" on every card.
 *
 * The key is read from the environment only (GTP_ODDS_DISPLAY_KEY) and never printed or written.
 * Exit: 0 rendered; 1 refused (nothing written).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadNbaLineGraphicsExport, assertPrivateOutDir, defaultOutDir, PURPOSE_ARG } from "./nba-line-graphics-io.mjs";
import { serializeLineGraphicsExport, PURPOSE } from "../../src/lib/social/nba-line-graphics-export.mjs";
import {
  SIZES, renderGameCardHtml, renderSummaryCardHtml, selectCardRows, verifyCardHtml, verifyAgainstSources, gameCaption, summaryCaption, captionViolations,
} from "./nba-line-cards.mjs";

const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");

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

/**
 * Everything up to (not including) the PNGs: validated export, card HTML, captions. Pure apart from reading inputs.
 * Throws on any refusal.
 */
export function prepareNbaLineGraphics({ date, asOf, purpose, env = process.env }) {
  const { doc, lane, artifact } = loadNbaLineGraphicsExport({ date, asOf, purpose, env });
  if (!doc.authorization.valuesIncluded) {
    throw new Error("NBA lines are not authorized for social display (socialDisplay false): no line, odds or OVER/UNDER graphic may be rendered for posting. For a private review set use --purpose founder-review. Nothing written.");
  }
  if (!doc.rows.length) throw new Error(`no comparison survives the rules for ${date} at ${asOf} (excluded: ${JSON.stringify(doc.scope.excludedByReason)}). Nothing written.`);
  const sourceErrors = verifyAgainstSources({ doc, lane, artifact });
  if (sourceErrors.length) throw new Error(`validation against the lane and the artifact failed:\n  - ${sourceErrors.slice(0, 20).join("\n  - ")}\nNothing written.`);
  const cards = [];
  for (const ev of doc.events.filter((e) => e.rows > 0)) {
    for (const size of Object.values(SIZES)) {
      const html = renderGameCardHtml({ doc, eventId: ev.eventId, size });
      const { rows } = selectCardRows(doc, ev.eventId, size.maxRows);
      const errs = verifyCardHtml(html, rows);
      if (errs.length) throw new Error(`card ${ev.eventId} ${size.key} failed validation:\n  - ${errs.join("\n  - ")}\nNothing written.`);
      cards.push({ name: `game-${ev.eventId}-${size.key}`, kind: "game", eventId: ev.eventId, matchup: ev.matchup, size, html, rowIds: rows.map((r) => r.rowId) });
    }
  }
  for (const size of Object.values(SIZES)) {
    const html = renderSummaryCardHtml({ doc, size });
    const errs = verifyCardHtml(html, [], { kind: "summary" });
    if (errs.length) throw new Error(`summary card ${size.key} failed validation:\n  - ${errs.join("\n  - ")}\nNothing written.`);
    cards.push({ name: `slate-summary-${size.key}`, kind: "summary", size, html, rowIds: [] });
  }
  const captions = {
    purpose: doc.purpose, socialAuthorized: doc.socialAuthorized, testData: doc.artifact?.testData === true,
    summary: summaryCaption(doc),
    games: Object.fromEntries(doc.events.filter((e) => e.rows > 0).map((e) => [e.eventId, { matchup: e.matchup, landscape: gameCaption(doc, e.eventId, SIZES.landscape), portrait: gameCaption(doc, e.eventId, SIZES.portrait) }])),
  };
  for (const t of [captions.summary, ...Object.values(captions.games).flatMap((g) => [g.landscape, g.portrait])]) {
    const errs = captionViolations(t);
    if (errs.length) throw new Error(`caption failed validation (${errs.join("; ")}): ${t}\nNothing written.`);
  }
  return { doc, cards, captions };
}

/**
 * PNGs with Playwright's Chromium (imported lazily so the validators never need a browser). A layout pass runs FIRST
 * over every card: any card whose content overflows its frame (footer below the edge, clipped rows) refuses the run
 * before a single file is written.
 */
async function withBrowser(fn) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  try { return await fn(browser); } finally { await browser.close(); }
}
async function layoutErrors(browser, cards) {
  const ctx = await browser.newContext({ deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errs = [];
  for (const c of cards) {
    await page.setViewportSize({ width: c.size.width, height: c.size.height });
    await page.setContent(c.html, { waitUntil: "load" });
    const m = await page.evaluate(() => {
      const card = document.querySelector(".card");
      const foot = document.querySelector(".foot");
      return { scroll: card.scrollHeight, client: card.clientHeight, footBottom: foot.getBoundingClientRect().bottom, h: window.innerHeight };
    });
    // The footer (the last block) must end inside the frame with a 12 px margin; anything taller pushes it out.
    if (m.footBottom > m.h - 12) errs.push(`${c.name}: content overflows the ${c.size.key} frame (content ${m.scroll}px, footer bottom ${Math.round(m.footBottom)}px)`);
  }
  await ctx.close();
  return errs;
}
async function screenshot(browser, cards, scales, outDir) {
  const files = [];
  for (const scale of scales) {
    const ctx = await browser.newContext({ deviceScaleFactor: scale });
    const page = await ctx.newPage();
    for (const c of cards) {
      await page.setViewportSize({ width: c.size.width, height: c.size.height });
      await page.setContent(c.html, { waitUntil: "load" });
      const file = path.join(outDir, `${c.name}${scale === 1 ? "" : `@${scale}x`}.png`);
      await page.screenshot({ path: file, clip: { x: 0, y: 0, width: c.size.width, height: c.size.height } });
      files.push(file);
    }
    await ctx.close();
  }
  return files;
}

/**
 * The whole run. Validates everything first; writes only after every check passed.
 * @param {Record<string, any>} args  CLI args (--date, --as-of, --purpose, --out, --scales, --no-png)
 */
export async function renderNbaLineGraphics(args, env = process.env) {
  const purpose = PURPOSE_ARG[args.purpose ?? "social"];
  if (!purpose) throw new Error("--purpose founder-review|social");
  const outDir = assertPrivateOutDir(args.out ?? defaultOutDir(args.date));
  const scales = String(args.scales ?? "1,2").split(",").map(Number);
  if (!scales.length || scales.some((s) => !Number.isInteger(s) || s < 1 || s > 3)) throw new Error("--scales: comma-separated integers 1..3");
  const { doc, cards, captions } = prepareNbaLineGraphics({ date: args.date, asOf: args["as-of"], purpose, env });

  const writeAll = async (browser) => {
    if (browser) {
      const errs = await layoutErrors(browser, cards);
      if (errs.length) throw new Error(`layout check failed:\n  - ${errs.join("\n  - ")}\nNothing written.`);
    }
    fs.mkdirSync(path.join(outDir, "html"), { recursive: true });
    const written = [];
    const write = (rel, text) => { const f = path.join(outDir, rel); fs.writeFileSync(f, text); written.push(f); };
    write(`export-nba-lines-${doc.edition.date}${purpose === PURPOSE.FOUNDER_REVIEW ? "-founder-review" : ""}.json`, serializeLineGraphicsExport(doc));
    for (const c of cards) write(path.join("html", `${c.name}.html`), c.html);
    write("captions.json", `${JSON.stringify(captions, null, 2)}\n`);
    return { written, pngs: browser ? await screenshot(browser, cards, scales, outDir) : [] };
  };
  const { written, pngs } = args["no-png"] ? await writeAll(null) : await withBrowser(writeAll);
  const manifest = {
    schema: "gtp-nba-line-graphics-manifest@1",
    export: { schemaVersion: doc.schemaVersion, edition: doc.edition, asOf: doc.asOf, purpose: doc.purpose, socialAuthorized: doc.socialAuthorized, testData: doc.artifact?.testData === true, artifactEncSha256: doc.artifact?.encSha256 ?? null, laneSha256: doc.publication.laneSha256, rows: doc.rows.length, excludedByReason: doc.scope.excludedByReason },
    cards: cards.map((c) => ({ name: c.name, kind: c.kind, eventId: c.eventId ?? null, matchup: c.matchup ?? null, size: c.size.key, rowIds: c.rowIds, htmlSha256: sha(c.html) })),
    files: [...written, ...pngs].map((f) => ({ file: path.relative(outDir, f), sha256: sha(fs.readFileSync(f)) })),
  };
  fs.writeFileSync(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return { outDir, doc, cards, pngs, manifest };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  renderNbaLineGraphics(parseArgs(process.argv.slice(2))).then(({ outDir, doc, cards, pngs }) => {
    console.log(`${doc.schemaVersion} ${doc.edition.kind} ${doc.edition.date} as of ${doc.asOf} · purpose ${doc.purpose} · socialAuthorized ${doc.socialAuthorized}${doc.artifact?.testData ? " · TEST DATA" : ""} · ${doc.rows.length} rows · ${cards.length} cards · ${pngs.length} PNGs · excluded ${JSON.stringify(doc.scope.excludedByReason)} → ${outDir}`);
    process.exit(0);
  }, (e) => {
    console.error(`REFUSED: ${e.message}`);
    process.exit(1);
  });
}
