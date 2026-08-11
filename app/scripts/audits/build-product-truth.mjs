/** Product-truth audit wrapper (Program 160 · Release A). Run: node scripts/audits/build-product-truth.mjs --now <ISO> */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildProductTruthAudit } from "../../src/lib/audits/product-truth.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const arg = (n) => { const i = process.argv.indexOf(n); return i !== -1 ? process.argv[i + 1] : null; };
const NOW = arg("--now");
if (!NOW) { console.error("REFUSED: --now required"); process.exit(1); }

const audit = buildProductTruthAudit({ now: NOW, appRoot: APP });
const dest = path.resolve(APP, "..", "data", "internal", "audits", "product-truth-v1.json");
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, JSON.stringify(audit, null, 1));
console.log(`product-truth-v1.json: ${audit.totals.facts} facts · ${audit.totals.contradictions} contradictions (P0 ${audit.totals.p0}) · ${audit.totals.exceptions} documented exceptions applied`);
for (const c of audit.contradictions) console.log(` ${c.severity} ${c.id}: ${c.summary}`);
for (const e of audit.exceptionsApplied) console.log(` EXCEPTION ${e.id}: ${e.detail}`);
