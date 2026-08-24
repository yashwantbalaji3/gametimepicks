#!/usr/bin/env node
/**
 * P200 route screenshots — mobile 390 + laptop 1440 over the built export (baseline and
 * after-evidence for the page-by-page polish). Serves out/ on a scratch port, captures, exits.
 *
 *   npx tsx scripts/uiux/p200-screenshots.mjs --out <dir> [--routes /a,/b]
 */
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import fs from "node:fs";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const OUT = arg("--out", "../data/internal/uiux/p200-baseline");
const routes = arg("--routes", "/,/today,/simulate,/mlb,/epl,/ufc,/nfl,/markets,/build,/results,/results/picks,/cards/epl").split(",");
fs.mkdirSync(OUT, { recursive: true });

const server = spawn("node", ["scripts/serve-export.mjs", "4199", "out"], { stdio: "ignore" });
// poll readiness instead of hoping — a slow npx install once ate the whole timeout
for (let i = 0; i < 40; i += 1) {
  try { const res = await fetch("http://localhost:4199/"); if (res.ok) break; } catch { /* not up yet */ }
  await new Promise((r) => setTimeout(r, 250));
}
const browser = await chromium.launch();
let shot = 0;
// P201: --all-widths adds the tablet 768 and laptop 1280 bands the launch charter requires.
const VIEWPORTS = process.argv.includes("--all-widths")
  ? [["m390", { width: 390, height: 844 }], ["t768", { width: 768, height: 1024 }], ["l1280", { width: 1280, height: 800 }], ["l1440", { width: 1440, height: 900 }]]
  : [["m390", { width: 390, height: 844 }], ["l1440", { width: 1440, height: 900 }]];
for (const [name, vp] of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: vp });
  const page = await ctx.newPage();
  for (const r of routes) {
    try {
      await page.goto("http://localhost:4199" + r, { waitUntil: "domcontentloaded", timeout: 8000 });
      const slug = r === "/" ? "home" : r.slice(1).replace(/\//g, "-");
      await page.screenshot({ path: `${OUT}/${slug}-${name}.png` });
      shot += 1;
    } catch (e) { console.log("SKIP", r, String(e.message).slice(0, 60)); }
  }
  await ctx.close();
}
await browser.close();
server.kill();
console.log(`captured ${shot} screenshot(s) → ${OUT}`);
