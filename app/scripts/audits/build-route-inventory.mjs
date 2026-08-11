/**
 * Route-inventory generator wrapper (Program 159 · Release A).
 * Run: node scripts/audits/build-route-inventory.mjs --now <ISO> [--out out]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildRouteInventory } from "../../src/lib/audits/route-inventory.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const arg = (n, f) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const NOW = arg("--now");
if (!NOW) { console.error("REFUSED: --now required"); process.exit(1); }
const outDirArg = arg("--out", null);

const navSources = ["src/components/nav.tsx", "src/components/command-rail.tsx", "src/components/footer.tsx"]
  .map((rel) => ({ name: rel.split("/").pop(), source: fs.readFileSync(path.join(APP, rel), "utf8") }));

const inv = buildRouteInventory({
  now: NOW,
  appDir: path.join(APP, "src", "app"),
  outDir: outDirArg ? path.resolve(APP, outDirArg) : null,
  navSources,
});
const dest = path.resolve(APP, "..", "data", "internal", "audits", "route-inventory-v1.json");
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, JSON.stringify(inv, null, 1));
console.log(`route-inventory-v1.json: ${inv.totals.routes} routes (${inv.totals.public} public · ${inv.totals.redirects} redirects · ${inv.totals.internal} internal · ${inv.totals.archive} archive) · findings ${inv.totals.findings} (P0 ${inv.totals.p0})`);
for (const f of inv.findings.slice(0, 12)) console.log(` ${f.severity} ${f.id}: ${f.summary}`);
