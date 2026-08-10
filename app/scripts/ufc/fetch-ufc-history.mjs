/**
 * Resumable UFC history fetcher (Program 153 · Release A1) — ESPN MMA monthly windows.
 *
 * The MMA scoreboard endpoint rate-limits sustained bursts (mechanical receipt 2026-08-10:
 * singles OK, 74-request burst → HTTP 400 "Failed to get events endpoint" on every window).
 * So this fetcher is RESUMABLE by design: a window whose file already holds a valid events
 * array is skipped; failures are recorded and left for the next pass; spacing is generous.
 *
 * Run (repeat until "complete"): node scripts/ufc/fetch-ufc-history.mjs --spacing-ms 15000
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const RAW = path.resolve(APP, "..", "data", "internal", "research", "ufc", "raw");
const arg = (n, f) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const SPACING = Number(arg("--spacing-ms", "15000"));

const windows = [];
for (let y = 2023; y <= 2026; y++) for (let m = 1; m <= 12; m++) {
  if (y === 2023 && m < 8) continue;
  if (y === 2026 && m > 8) continue;
  const mm = String(m).padStart(2, "0");
  let end = [4, 6, 9, 11].includes(m) ? 30 : m === 2 ? (y % 4 === 0 ? 29 : 28) : 31;
  if (y === 2026 && m === 8) end = 9;
  windows.push({ file: `espn-${y}-${mm}.json`, range: `${y}${mm}01-${y}${mm}${end}` });
}

fs.mkdirSync(RAW, { recursive: true });
let ok = 0, fetched = 0, failed = [];
for (const w of windows) {
  const p = path.join(RAW, w.file);
  try { const d = JSON.parse(fs.readFileSync(p, "utf8")); if (Array.isArray(d.events)) { ok++; continue; } } catch { /* fetch below */ }
  const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard?dates=${w.range}&limit=1000`);
  const body = await res.text();
  let good = false;
  try { good = Array.isArray(JSON.parse(body).events); } catch { good = false; }
  if (good) { fs.writeFileSync(p, body); ok++; fetched++; }
  else { failed.push(w.file); try { fs.unlinkSync(p); } catch { /* no stub */ } }
  await new Promise((r) => setTimeout(r, SPACING));
}
console.log(`windows ok ${ok}/${windows.length} (fetched ${fetched} this pass); failed: ${failed.length ? failed.join(",") : "none"}`);
if (ok === windows.length) console.log("complete");
