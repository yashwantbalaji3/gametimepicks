/**
 * Contrast measurement sweep — a REPORTING tool, not a gate (Program 137).
 *
 * e2e/accessibility.spec.ts asserts contrast per route and fails the build. This script runs the
 * identical probe across every launch-critical route and aggregates by COLOUR, because that is the
 * unit a fix actually operates on: ~30 failing elements collapsed into two design tokens. Reading a
 * per-element list would have produced ~30 one-off overrides instead of two token corrections.
 *
 *   node scripts/measure-contrast.mjs            # serves out/ on :4319 and sweeps
 */
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 4319;
const ROUTES = ["/", "/today/", "/markets/", "/results/", "/methodology/", "/learn/", "/moonshot/", "/bank-builder/", "/mlb/"];
const VIEWPORTS = [{ name: "mobile", width: 390 }, { name: "tablet", width: 768 }, { name: "desktop", width: 1440 }];

// The probe is the single source of truth for the maths — read it out of the spec so this tool and
// the gate can never drift apart and disagree about what "failing" means.
const spec = fs.readFileSync(path.join(APP, "e2e/accessibility.spec.ts"), "utf8");
const PROBE = spec.slice(spec.indexOf("const CONTRAST_PROBE = `") + "const CONTRAST_PROBE = `".length, spec.indexOf("})()`") + 4)
  .replace(/\\`/g, "`").replace(/\\\\/g, "\\");

const server = spawn("node", ["scripts/serve-export.mjs", String(PORT), "out"], { cwd: APP, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 1200));

const browser = await chromium.launch();
const page = await browser.newPage();
const byColor = new Map();
let total = 0;

for (const route of ROUTES) {
  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: 900 });
    await page.goto(`http://localhost:${PORT}${route}`, { waitUntil: "domcontentloaded" });
    for (const f of await page.evaluate(PROBE)) {
      total++;
      const k = f.color;
      if (!byColor.has(k)) byColor.set(k, { color: k, worst: f.ratio, count: 0, routes: new Set(), samples: [] });
      const e = byColor.get(k);
      e.count++; e.worst = Math.min(e.worst, f.ratio); e.routes.add(route);
      if (!e.samples.some((s) => s.selector === f.selector)) e.samples.push({ selector: f.selector, text: f.text, ratio: f.ratio, size: f.size, route });
      e.samples.sort((x, y) => x.ratio - y.ratio);
      e.samples = e.samples.slice(0, 4);   // WORST four — the fix has to clear these, not the average
    }
  }
}

await browser.close();
server.kill();

const rows = [...byColor.values()].sort((a, b) => a.worst - b.worst);
console.log(`\n=== contrast failures by COLOUR — ${total} occurrence(s), ${rows.length} distinct colour(s) ===\n`);
for (const r of rows) {
  console.log(`${String(r.worst).padStart(5)}:1  ${r.color.padEnd(22)} ${String(r.count).padStart(3)}x  ${[...r.routes].join(" ")}`);
  for (const s of r.samples) console.log(`          ${s.ratio}:1 ${s.size}px ${s.selector} — "${s.text.slice(0, 44)}"`);
}
console.log(`\n${total} occurrence(s) across ${rows.length} colour(s). Fix the COLOUR, not the element.`);
process.exit(0);
