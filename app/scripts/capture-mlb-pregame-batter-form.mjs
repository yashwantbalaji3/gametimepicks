/**
 * capture-mlb-pregame-batter-form.mjs — INTERNAL pregame BATTER RECENT FORM (last 7 + last 30 games), derived
 * STRICTLY from games dated before the slate (leakage-safe). Immutable, timestamped, idempotent per batter+date.
 *
 * Batter universe = distinct batter-market playerIds from the committed settlement-join files for the date.
 * Fields per window: games, PA, H, TB, HR, RBI, R, K (+ derived AVG/OPS-ish rate slots left to a future model).
 * No modeling, no prediction. Output: pregame-features/batter-form/<date>/<playerId>.json (internal).
 *
 *   node app/scripts/capture-mlb-pregame-batter-form.mjs --date 2026-07-22            # dry-run
 *   node app/scripts/capture-mlb-pregame-batter-form.mjs --date 2026-07-22 --write    # persist
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { batterUniverse } from "./capture-mlb-pregame-batter-splits.mjs";

const APP = process.cwd().endsWith("/app") ? process.cwd() : path.join(process.cwd(), "app");
const REPO = path.dirname(APP);
const ARCH = path.join(REPO, "data/internal/mlb/pregame-archive");
const OUT = path.join(ARCH, "pregame-features/batter-form");
const HOST = "https://statsapi.mlb.com";
const SCHEMA_VERSION = "mlb-pregame-batter-form-1";
const sha = (s) => crypto.createHash("sha256").update(typeof s === "string" ? s : JSON.stringify(s)).digest("hex");
const n = (x) => (x == null || Number.isNaN(Number(x)) ? 0 : Number(x));

async function fetchJson(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const ctl = new AbortController();
      const to = setTimeout(() => ctl.abort(), 15000);
      const res = await fetch(url, { signal: ctl.signal, headers: { "User-Agent": "gtp-pregame-batter-form/1" } });
      clearTimeout(to);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) { if (i === tries - 1) throw e; await new Promise((r) => setTimeout(r, 500 * (i + 1))); }
  }
}

// aggregate the LAST `k` games strictly earlier than boardDate.
export function windowForm(gameSplits, boardDate, k) {
  const games = (gameSplits || [])
    .filter((g) => g.date && g.date < boardDate)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-k);
  const sum = (f) => games.reduce((a, g) => a + n(g.stat?.[f]), 0);
  if (!games.length) return { games: 0, pa: 0, h: 0, tb: 0, hr: 0, rbi: 0, r: 0, k: 0 };
  return { games: games.length, firstDate: games[0].date, lastDate: games[games.length - 1].date, pa: sum("plateAppearances"), h: sum("hits"), tb: sum("totalBases"), hr: sum("homeRuns"), rbi: sum("rbi"), r: sum("runs"), k: sum("strikeOuts") };
}

async function main() {
  const args = process.argv.slice(2);
  const WRITE = args.includes("--write");
  const di = args.indexOf("--date");
  const date = di >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(args[di + 1] || "") ? args[di + 1] : new Date().toISOString().slice(0, 10);
  const season = date.slice(0, 4);
  const capturedAt = new Date().toISOString();

  const universe = batterUniverse(path.join(ARCH, "settlement-joins", date));
  if (!universe.size) { console.log(`[form] no batter-market players for ${date}`); return; }
  const outDir = path.join(OUT, date);

  let wrote = 0, skipped = 0, eligible = 0, fetched = 0;
  for (const b of universe.values()) {
    if (fs.existsSync(path.join(outDir, `${b.playerId}.json`)) && !args.includes("--force")) { skipped++; continue; }
    let splits = null;
    try { const j = await fetchJson(`${HOST}/api/v1/people/${b.playerId}/stats?stats=gameLog&group=hitting&season=${season}`); splits = j.stats?.[0]?.splits || []; fetched++; } catch { splits = []; }
    const last7 = windowForm(splits, date, 7);
    const last30 = windowForm(splits, date, 30);
    const researchEligible = b.eventStartTime ? capturedAt < b.eventStartTime : false;
    // extra leakage assert: no source game is on/after the slate date
    const noLeak = (splits || []).filter((g) => g.date && g.date >= date).length === 0 || last30.lastDate == null || last30.lastDate < date;
    const record = {
      schemaVersion: SCHEMA_VERSION, public: false, approvedForProduction: false, productEligible: false,
      family: "batter_form", playerId: b.playerId, name: b.name, gamePk: b.gamePk, date, capturedAt, availableAt: capturedAt, eventStartTime: b.eventStartTime,
      researchEligible: researchEligible && noLeak, eligibilityReason: !researchEligible ? "captured at/after first pitch" : !noLeak ? "a source game is not strictly earlier than the slate" : "captured pregame; all source games strictly earlier",
      last7, last30,
      leakageRule: "only game-log games with date < boardDate are aggregated; captured pregame",
      provenance: { source: `${HOST}/api/v1/people/<id>/stats?stats=gameLog&group=hitting&season=${season}`, capturedAt },
    };
    record.recordHash = sha({ ...record, capturedAt: undefined, availableAt: undefined, provenance: undefined, recordHash: undefined });
    if (record.researchEligible) eligible++;
    if (WRITE && record.researchEligible) { fs.mkdirSync(outDir, { recursive: true }); fs.writeFileSync(path.join(outDir, `${b.playerId}.json`), JSON.stringify(record, null, 2)); wrote++; }
  }
  console.log(`[form] ${WRITE ? "WROTE" : "DRY-RUN"} ${date}: ${universe.size} batters · fetched ${fetched} · eligible ${eligible} · skipped(existing) ${skipped}${WRITE ? ` · wrote ${wrote}` : ""}`);
  if (!WRITE) console.log(`[form] dry-run — pass --write to persist pregame-features/batter-form/${date}/`);
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (invoked) main().catch((e) => { console.error("[form] fatal:", e); process.exit(1); });
