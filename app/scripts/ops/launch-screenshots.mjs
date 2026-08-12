/**
 * Operator-console screenshot set (Program 167 · Release I) — the four required widths against
 * the BUILT internal export served locally. Evidence files only; never committed (they carry the
 * console's internal content — output goes to the path given by --out).
 *
 * Usage: node scripts/ops/launch-screenshots.mjs --base http://localhost:4173 --out /tmp/shots
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const arg = (n, f = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const BASE = arg("--base", "http://localhost:4173");
const OUT = arg("--out");
if (!OUT) { console.error("--out <dir> required"); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });

const WIDTHS = [
  { w: 390, h: 844, name: "mobile-390" },
  { w: 768, h: 1024, name: "tablet-768" },
  { w: 1280, h: 800, name: "desktop-1280" },
  { w: 1440, h: 900, name: "desktop-1440" },
];

const browser = await chromium.launch();
for (const { w, h, name } of WIDTHS) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/launch/`, { waitUntil: "load", timeout: 60_000 });
  await page.waitForTimeout(1200); // hydration settle — networkidle never fires on pages with long-poll assets
  await page.screenshot({ path: path.join(OUT, `launch-${name}.png`), fullPage: false });
  await page.screenshot({ path: path.join(OUT, `launch-${name}-full.png`), fullPage: true });
  const hscroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  console.log(`${name}: captured · pageErrors=${errors.length} · horizontalScroll=${hscroll}`);
  if (errors.length) console.log(`  errors: ${errors.slice(0, 3).join(" | ")}`);
  await page.close();
}
await browser.close();
console.log(`wrote ${WIDTHS.length * 2} screenshots to ${OUT}`);
