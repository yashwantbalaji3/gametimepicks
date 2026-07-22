/**
 * capture-mlb-pregame-batter-splits.mjs — INTERNAL pregame BATTER SPLITS (vs RHP / vs LHP), season + previous
 * season. Leakage-safe: season splits reflect only games COMPLETED before the capture (captured pregame ⇒ before
 * this game); previous-season splits are static history. Immutable, timestamped, idempotent per batter+date.
 *
 * Batter universe = distinct batter-market playerIds from the committed settlement-join files for the date (the
 * research-relevant batters — those with a market line) ∪ any posted lineup batters.
 *
 * Fields per split: PA, AVG, OBP, SLG, OPS, HR, RBI, K, BB, K% (K/PA), BB% (BB/PA). No modeling, no prediction.
 * Output: data/internal/mlb/pregame-archive/pregame-features/batter-splits/<date>/<playerId>.json (internal).
 *
 *   node app/scripts/capture-mlb-pregame-batter-splits.mjs --date 2026-07-22            # dry-run
 *   node app/scripts/capture-mlb-pregame-batter-splits.mjs --date 2026-07-22 --write    # persist
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const APP = process.cwd().endsWith("/app") ? process.cwd() : path.join(process.cwd(), "app");
const REPO = path.dirname(APP);
const ARCH = path.join(REPO, "data/internal/mlb/pregame-archive");
const OUT = path.join(ARCH, "pregame-features/batter-splits");
const HOST = "https://statsapi.mlb.com";
const SCHEMA_VERSION = "mlb-pregame-batter-splits-1";
const BATTER_MARKETS = new Set(["batter_hits", "batter_total_bases", "batter_home_runs", "batter_rbis", "batter_runs_scored", "batter_hits_runs_rbis"]);
const sha = (s) => crypto.createHash("sha256").update(typeof s === "string" ? s : JSON.stringify(s)).digest("hex");
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const numf = (x) => (x == null || x === "" || x === "-.--" || Number.isNaN(Number(x)) ? null : Number(x));
const pct = (n, d) => (d ? +(100 * n / d).toFixed(1) : null);

async function fetchJson(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const ctl = new AbortController();
      const to = setTimeout(() => ctl.abort(), 15000);
      const res = await fetch(url, { signal: ctl.signal, headers: { "User-Agent": "gtp-pregame-batter-splits/1" } });
      clearTimeout(to);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) { if (i === tries - 1) throw e; await new Promise((r) => setTimeout(r, 500 * (i + 1))); }
  }
}

// distinct batter-market players for the date from committed join files ⇒ {playerId, name, gamePk, eventStartTime}
export function batterUniverse(joinDirForDate) {
  const out = new Map();
  if (!fs.existsSync(joinDirForDate)) return out;
  for (const f of fs.readdirSync(joinDirForDate).filter((x) => x.endsWith(".json"))) {
    const j = readJson(path.join(joinDirForDate, f));
    if (!j) continue;
    for (const r of j.marketRows || []) {
      if (BATTER_MARKETS.has(r.market) && r.playerId != null && !out.has(r.playerId)) out.set(r.playerId, { playerId: r.playerId, name: r.player ?? null, gamePk: j.gamePk, eventStartTime: j.eventStartTime ?? null });
    }
  }
  return out;
}

function splitStat(st) {
  if (!st) return null;
  const pa = numf(st.plateAppearances) ?? 0;
  return { pa, avg: numf(st.avg), obp: numf(st.obp), slg: numf(st.slg), ops: numf(st.ops), hr: numf(st.homeRuns) ?? 0, rbi: numf(st.rbi) ?? 0, k: numf(st.strikeOuts) ?? 0, bb: numf(st.baseOnBalls) ?? 0, kPct: pct(numf(st.strikeOuts) ?? 0, pa), bbPct: pct(numf(st.baseOnBalls) ?? 0, pa) };
}
function parseSplits(payload) {
  const splits = payload?.stats?.[0]?.splits || [];
  const byCode = {};
  for (const s of splits) byCode[s.split?.code] = splitStat(s.stat);
  return { vsRHP: byCode.vr ?? null, vsLHP: byCode.vl ?? null };
}

async function main() {
  const args = process.argv.slice(2);
  const WRITE = args.includes("--write");
  const di = args.indexOf("--date");
  const date = di >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(args[di + 1] || "") ? args[di + 1] : new Date().toISOString().slice(0, 10);
  const season = date.slice(0, 4);
  const prevSeason = String(Number(season) - 1);
  const capturedAt = new Date().toISOString();

  const universe = batterUniverse(path.join(ARCH, "settlement-joins", date));
  if (!universe.size) { console.log(`[splits] no batter-market players for ${date} (no committed join files yet)`); return; }
  const outDir = path.join(OUT, date);

  let wrote = 0, skipped = 0, eligible = 0, fetched = 0;
  for (const b of universe.values()) {
    // idempotent: season splits are static pregame — skip a batter already captured for this date
    if (fs.existsSync(path.join(outDir, `${b.playerId}.json`)) && !args.includes("--force")) { skipped++; continue; }
    let cur = null, prev = null;
    try { cur = parseSplits(await fetchJson(`${HOST}/api/v1/people/${b.playerId}/stats?stats=statSplits&group=hitting&season=${season}&sitCodes=vr,vl`)); fetched++; } catch { /* missing */ }
    try { prev = parseSplits(await fetchJson(`${HOST}/api/v1/people/${b.playerId}/stats?stats=statSplits&group=hitting&season=${prevSeason}&sitCodes=vr,vl`)); } catch { /* optional */ }
    const researchEligible = b.eventStartTime ? capturedAt < b.eventStartTime : false;
    const record = {
      schemaVersion: SCHEMA_VERSION, public: false, approvedForProduction: false, productEligible: false,
      family: "batter_splits", playerId: b.playerId, name: b.name, gamePk: b.gamePk, date, capturedAt, availableAt: capturedAt, eventStartTime: b.eventStartTime,
      researchEligible, eligibilityReason: researchEligible ? "captured pregame; season splits reflect games completed before this game" : "captured at/after first pitch",
      season, seasonSplits: cur, previousSeason: prev && (prev.vsRHP || prev.vsLHP) ? { season: prevSeason, ...prev } : null,
      leakageRule: "season splits are cumulative over COMPLETED games before capturedAt (captured pregame ⇒ before this game; doubleheader edge noted); previous season is static history",
      provenance: { source: `${HOST}/api/v1/people/<id>/stats?stats=statSplits&group=hitting&sitCodes=vr,vl (season ${season} + ${prevSeason})`, capturedAt },
    };
    record.recordHash = sha({ ...record, capturedAt: undefined, availableAt: undefined, provenance: undefined, recordHash: undefined });
    if (researchEligible) eligible++;
    if (WRITE && researchEligible) { fs.mkdirSync(outDir, { recursive: true }); fs.writeFileSync(path.join(outDir, `${b.playerId}.json`), JSON.stringify(record, null, 2)); wrote++; }
  }
  console.log(`[splits] ${WRITE ? "WROTE" : "DRY-RUN"} ${date}: ${universe.size} batters · fetched ${fetched} · eligible ${eligible} · skipped(existing) ${skipped}${WRITE ? ` · wrote ${wrote}` : ""}`);
  if (!WRITE) console.log(`[splits] dry-run — pass --write to persist pregame-features/batter-splits/${date}/`);
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (invoked) main().catch((e) => { console.error("[splits] fatal:", e); process.exit(1); });
