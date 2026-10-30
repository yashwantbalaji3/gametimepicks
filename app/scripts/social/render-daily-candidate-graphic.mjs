#!/usr/bin/env node
/* global document, window -- the page.evaluate callback below runs in the Playwright browser page, not in node */
/**
 * DAILY CANDIDATE BETSLIP GRAPHIC · renderer CLI (founder review only).
 *
 *   cd app && npx tsx scripts/social/render-daily-candidate-graphic.mjs --receipt <receipt.json> \
 *       [--out ~/gtp-private/graphics/daily-candidates/<day>/] [--scales 1,2] [--no-png]
 *
 * Reads one written daily-candidate receipt (scripts/products/record-daily-candidate.mjs), validates it
 * (daily-candidate-cards.mjs receiptViolations + textViolations), runs a layout pass, and only then writes the HTML and
 * PNGs (1080×1350, every --scales factor) to a directory OUTSIDE every git repository (prices never enter the repo).
 * There is no social purpose: every card carries the FOUNDER REVIEW banner. Reads no key, makes no network call.
 * Exit: 0 rendered; 1 refused.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertPrivateOutDir, DEFAULT_PRIVATE_ROOT } from "./nba-line-graphics-io.mjs";
import { SIZE, renderCandidateCardHtml, textViolations } from "./daily-candidate-cards.mjs";

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

/** Validate and build the card (no writes). */
export function prepareCandidateGraphic(receipt) {
  const html = renderCandidateCardHtml(receipt);
  const v = textViolations(html);
  if (v.length) throw new Error(`card text refused:\n  - ${v.join("\n  - ")}`);
  return { name: `${receipt.product}-${receipt.productDay}-${receipt.receiptId}`, html, size: SIZE };
}

async function layoutAndShoot(card, scales, outDir) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.setViewportSize({ width: SIZE.width, height: SIZE.height });
    await page.setContent(card.html, { waitUntil: "load" });
    const m = await page.evaluate(() => ({ foot: document.querySelector(".foot").getBoundingClientRect().bottom, h: window.innerHeight }));
    if (m.foot > m.h - 12) throw new Error(`layout check failed: footer bottom ${Math.round(m.foot)}px overflows the ${SIZE.key} frame. Nothing written.`);
    await ctx.close();
    const files = [];
    for (const scale of scales) {
      const c2 = await browser.newContext({ deviceScaleFactor: scale });
      const p2 = await c2.newPage();
      await p2.setViewportSize({ width: SIZE.width, height: SIZE.height });
      await p2.setContent(card.html, { waitUntil: "load" });
      const file = path.join(outDir, `${card.name}${scale === 1 ? "" : `@${scale}x`}.png`);
      await p2.screenshot({ path: file, clip: { x: 0, y: 0, width: SIZE.width, height: SIZE.height } });
      files.push(file);
      await c2.close();
    }
    return files;
  } finally { await browser.close(); }
}

export async function renderDailyCandidateGraphic(args) {
  if (!args.receipt) throw new Error("--receipt <file> is required");
  const receipt = JSON.parse(fs.readFileSync(args.receipt, "utf8"));
  const card = prepareCandidateGraphic(receipt);
  const outDir = assertPrivateOutDir(args.out ?? path.join(DEFAULT_PRIVATE_ROOT, "daily-candidates", receipt.productDay));
  const scales = String(args.scales ?? "1,2").split(",").map(Number);
  if (!scales.length || scales.some((s) => !Number.isInteger(s) || s < 1 || s > 3)) throw new Error("--scales: comma-separated integers 1..3");
  fs.mkdirSync(outDir, { recursive: true });
  const pngs = args["no-png"] ? [] : await layoutAndShoot(card, scales, outDir);
  const htmlFile = path.join(outDir, `${card.name}.html`);
  fs.writeFileSync(htmlFile, card.html);
  return { outDir, html: htmlFile, pngs };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  renderDailyCandidateGraphic(parseArgs(process.argv.slice(2)))
    .then((r) => { process.stdout.write(`${JSON.stringify(r, null, 2)}\n`); })
    .catch((e) => { process.stderr.write(`refused: ${e.message}\n`); process.exit(1); });
}
