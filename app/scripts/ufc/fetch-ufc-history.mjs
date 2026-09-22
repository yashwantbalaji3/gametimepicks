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
import { fetchScoreboardWindowEvents, isProviderRefusal, utcDayStart, utcDayEnd } from "../../src/lib/sports/espn-scoreboard-window.mjs";

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
  windows.push({ file: `espn-${y}-${mm}.json`, d0: utcDayStart(`${y}-${mm}-01T00:00:00Z`), d1: utcDayEnd(`${y}-${mm}-${String(end).padStart(2, "0")}T00:00:00Z`) });
}

fs.mkdirSync(RAW, { recursive: true });
let ok = 0, fetched = 0, failed = [];
for (const w of windows) {
  const p = path.join(RAW, w.file);
  try { const d = JSON.parse(fs.readFileSync(p, "utf8")); if (Array.isArray(d.events)) { ok++; continue; } } catch { /* fetch below */ }
  // v1.8 B4: month-window transport via the one shared owner (limit=1000 lives there). The raw file keeps
  // the same shape ({ events }) and the same day-bounded window as the old range request.
  let good = false, events = null;
  try { ({ events } = await fetchScoreboardWindowEvents("mma/ufc", w.d0, w.d1)); good = Array.isArray(events); } catch { good = false; }
  if (good) { fs.writeFileSync(p, JSON.stringify({ events })); ok++; fetched++; }
  else { failed.push(w.file); try { fs.unlinkSync(p); } catch { /* no stub */ } }
  await new Promise((r) => setTimeout(r, SPACING));
}
console.log(`windows ok ${ok}/${windows.length} (fetched ${fetched} this pass); failed: ${failed.length ? failed.join(",") : "none"}`);
if (ok === windows.length) console.log("complete");
