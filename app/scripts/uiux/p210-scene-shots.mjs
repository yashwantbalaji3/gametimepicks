#!/usr/bin/env node
/**
 * P210 · Release C — sport-scene evidence over the built export: for each target (route + card
 * matcher), open the SimulationStage and capture the dialog at 390 and 1280, normal AND
 * reduced-motion. Serves out/ on a scratch port, captures, exits.
 *
 *   npx tsx scripts/uiux/p210-scene-shots.mjs --out <dir>
 */
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import fs from "node:fs";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const OUT = arg("--out", "../data/internal/uiux/p210-scenes");
fs.mkdirSync(OUT, { recursive: true });

const server = spawn("node", ["scripts/serve-export.mjs", "4199", "out"], { stdio: "ignore" });
for (let i = 0; i < 40; i += 1) {
  try { const r = await fetch("http://localhost:4199/"); if (r.ok) break; } catch { /* not up yet */ }
  await new Promise((r) => setTimeout(r, 250));
}

// One representative stage-opening card per sport/state, by its visible action text.
const TARGETS = [
  { name: "ufc-ready", route: "/simulate/d/2026-08-29/", action: /bout reads|View Simulation/ },
  { name: "epl-schedule", route: "/simulate/d/2026-08-29/", action: /View event details/, sport: "epl" },
  { name: "nfl-schedule", route: "/simulate/d/2026-08-27/", action: /View event details/ },
];

const browser = await chromium.launch();
let shot = 0;
for (const reduced of [false, true]) {
  for (const [label, vp] of [["m390", { width: 390, height: 844 }], ["l1280", { width: 1280, height: 800 }]]) {
    for (const t of TARGETS) {
      const ctx = await browser.newContext({ viewport: vp, reducedMotion: reduced ? "reduce" : "no-preference" });
      const page = await ctx.newPage();
      await page.goto(`http://localhost:4199${t.route}`, { waitUntil: "networkidle" });
      if (t.sport) {
        const chip = page.getByRole("button", { name: new RegExp(t.sport, "i") }).first();
        if (await chip.count()) await chip.click();
      }
      const card = page.getByRole("button", { name: t.action }).first();
      if (!(await card.count())) { console.log(`skip ${t.name} (${label}) — no matching card`); await ctx.close(); continue; }
      await card.click();
      await page.waitForTimeout(reduced ? 250 : 900); // mid-flight for normal; settled fast for reduced
      const dialog = page.locator('[role="dialog"]');
      if (await dialog.count()) {
        await dialog.screenshot({ path: `${OUT}/${t.name}-${label}${reduced ? "-reduced" : ""}.png` });
        shot += 1;
      }
      await ctx.close();
    }
  }
}
await browser.close();
server.kill();
console.log(`captured ${shot} scene shot(s) → ${OUT}`);
