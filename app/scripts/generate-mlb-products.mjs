/**
 * generate-mlb-products.mjs — reads the ingested MLB player props and writes the Diamond Specials
 * snapshot (`mlb/diamond-specials/<date>.json`) the app reads. Pure generation, no provider calls, no
 * money mutation. Run after ingest-mlb-slate.mjs.
 *   npx tsx app/scripts/generate-mlb-products.mjs --date 2026-06-23
 */
import fs from "node:fs";
import path from "node:path";
import { generateDiamondSpecials } from "../src/lib/mlb/diamond-specials-generator.ts";

const args = process.argv.slice(2);
const getArg = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const DATE = getArg("date", new Date().toISOString().slice(0, 10));
const DATA = path.join(process.cwd(), process.cwd().endsWith("app") ? "" : "app", "public", "data", "mlb");
const log = (...m) => console.log("[gen-mlb]", ...m);

const propsPath = path.join(DATA, "player-props", `${DATE}.json`);
let pp;
try { pp = JSON.parse(fs.readFileSync(propsPath, "utf8")); }
catch { log(`no player-props for ${DATE} — run ingest-mlb-slate.mjs first. Nothing generated.`); process.exit(0); }

const snap = generateDiamondSpecials(pp.props ?? [], DATE, new Date().toISOString());
log(`generated ${snap.cards.length} Diamond Specials cards from ${pp.props?.length ?? 0} props`);
for (const c of snap.cards) log(`  ${c.category}: ${c.legs.length} legs · combined ${c.combinedOdds > 0 ? "+" : ""}${c.combinedOdds} · $${c.stake} → $${c.projectedReturn}`);

const out = path.join(DATA, "diamond-specials", `${DATE}.json`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(snap, null, 2));
log(`wrote diamond-specials/${DATE}.json`);
