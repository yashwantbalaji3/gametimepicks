/**
 * capture-mlb-pregame-pitcher-workload.mjs — INTERNAL pregame feature capture: probable-starter REST + RECENT
 * WORKLOAD, derived STRICTLY from starts BEFORE the slate date (leakage-safe) via the free StatsAPI game log.
 *
 * This adds the `pitcher_workload` family to the pregame research archive. It NEVER uses postgame information:
 *   • Only game-log starts with date < boardDate are aggregated (a start on the slate date is excluded).
 *   • researchEligible requires capturedAt < eventStartTime AND every source start strictly earlier than the slate.
 * No modeling, no prediction, no probability — just the pregame feature values + provenance + timestamps.
 *
 * Output: data/internal/mlb/pregame-archive/pregame-features/pitcher-workload/<date>/<gamePk>.json (internal).
 * Pure node builtins + fetch (no Odds credits). Dry-run by default; --write persists.
 *
 *   node app/scripts/capture-mlb-pregame-pitcher-workload.mjs --date 2026-07-22            # dry-run
 *   node app/scripts/capture-mlb-pregame-pitcher-workload.mjs --date 2026-07-22 --write    # persist
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const APP = process.cwd().endsWith("/app") ? process.cwd() : path.join(process.cwd(), "app");
const REPO = path.dirname(APP);
const OUT = path.join(REPO, "data/internal/mlb/pregame-archive/pregame-features/pitcher-workload");
const HOST = "https://statsapi.mlb.com";
const SCHEMA_VERSION = "mlb-pregame-pitcher-workload-1";

const parseIP = (s) => { const [w, f] = String(s ?? "0").split("."); return Number(w || 0) + (f === "1" ? 1 / 3 : f === "2" ? 2 / 3 : 0); };
const round = (x, n = 2) => (Number.isFinite(x) ? +x.toFixed(n) : null);
const sha = (s) => crypto.createHash("sha256").update(typeof s === "string" ? s : JSON.stringify(s)).digest("hex");

async function fetchJson(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const ctl = new AbortController();
      const to = setTimeout(() => ctl.abort(), 15000);
      const res = await fetch(url, { signal: ctl.signal, headers: { "User-Agent": "gtp-pregame-pitcher-workload/1" } });
      clearTimeout(to);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) { if (i === tries - 1) throw e; await new Promise((r) => setTimeout(r, 500 * (i + 1))); }
  }
}

// aggregate a pitcher's workload from ONLY the starts strictly before `boardDate` (leakage-safe).
export function aggregateWorkload(gameLogSplits, boardDate, season) {
  const starts = (gameLogSplits || [])
    .map((s) => ({ date: s.date, gs: Number(s.stat?.gamesStarted || 0), ip: parseIP(s.stat?.inningsPitched), k: Number(s.stat?.strikeOuts || 0), bb: Number(s.stat?.baseOnBalls || 0), er: Number(s.stat?.earnedRuns || 0), hr: Number(s.stat?.homeRuns || 0), bf: Number(s.stat?.battersFaced || 0) }))
    .filter((r) => r.date && r.date < boardDate && r.gs > 0) // STRICTLY earlier starts only
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!starts.length) return { hasHistory: false, seasonStarts: 0, restDays: null, lastStartDate: null, last5: null, seasonToDate: null };
  const lastStartDate = starts[starts.length - 1].date;
  const restDays = Math.round((Date.parse(`${boardDate}T00:00:00Z`) - Date.parse(`${lastStartDate}T00:00:00Z`)) / 86400000);
  const last5 = starts.slice(-5);
  const sum = (arr, k) => arr.reduce((a, r) => a + r[k], 0);
  const ip5 = sum(last5, "ip");
  const mk = (arr) => ({ starts: arr.length, ipSum: round(sum(arr, "ip")), ipAvg: round(sum(arr, "ip") / arr.length), kAvg: round(sum(arr, "k") / arr.length), bbAvg: round(sum(arr, "bb") / arr.length), erAvg: round(sum(arr, "er") / arr.length), hrAvg: round(sum(arr, "hr") / arr.length), kPer9: round(ipFor(arr) ? (sum(arr, "k") * 9) / ipFor(arr) : 0) });
  function ipFor(arr) { return sum(arr, "ip"); }
  return {
    hasHistory: true, season, seasonStarts: starts.length, restDays, lastStartDate,
    last5: { ...mk(last5), workloadIpLast5: round(ip5) },
    seasonToDate: { starts: starts.length, ip: round(sum(starts, "ip")), k: sum(starts, "k"), bb: sum(starts, "bb"), er: sum(starts, "er"), hr: sum(starts, "hr") },
  };
}

async function main() {
  const args = process.argv.slice(2);
  const WRITE = args.includes("--write");
  const di = args.indexOf("--date");
  const date = di >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(args[di + 1] || "") ? args[di + 1] : new Date().toISOString().slice(0, 10);
  const season = date.slice(0, 4);
  const capturedAt = new Date().toISOString();

  let sched;
  try { sched = await fetchJson(`${HOST}/api/v1/schedule?sportId=1&date=${date}&hydrate=probablePitcher`); }
  catch (e) { console.error(`[workload] schedule fetch failed (${String(e).slice(0, 60)}) — nothing written`); return; }
  const games = sched?.dates?.[0]?.games || [];
  if (!games.length) { console.log(`[workload] no games on ${date}`); return; }

  const logCache = new Map();
  async function workloadFor(pp) {
    if (!pp?.id) return null;
    if (!logCache.has(pp.id)) {
      try { const j = await fetchJson(`${HOST}/api/v1/people/${pp.id}/stats?stats=gameLog&season=${season}&group=pitching`); logCache.set(pp.id, j.stats?.[0]?.splits || []); }
      catch { logCache.set(pp.id, null); }
    }
    const splits = logCache.get(pp.id);
    if (splits == null) return { id: pp.id, name: pp.fullName, error: "gameLog fetch failed" };
    return { id: pp.id, name: pp.fullName, ...aggregateWorkload(splits, date, season) };
  }

  let wrote = 0, eligible = 0, withHistory = 0, missingProbable = 0;
  for (const g of games) {
    const eventStartTime = g.gameDate;
    const home = await workloadFor(g.teams?.home?.probablePitcher);
    const away = await workloadFor(g.teams?.away?.probablePitcher);
    if (!home || !away) missingProbable++;
    // researchEligible: captured before first pitch AND every source start strictly earlier than the slate date.
    const startsBeforeSlate = [home, away].every((p) => !p || p.hasHistory === undefined || p.lastStartDate == null || p.lastStartDate < date);
    const pregame = eventStartTime ? capturedAt < eventStartTime : false;
    const researchEligible = pregame && startsBeforeSlate;
    if (home?.hasHistory || away?.hasHistory) withHistory++;
    const record = {
      schemaVersion: SCHEMA_VERSION, public: false, approvedForProduction: false, productEligible: false,
      family: "pitcher_workload", gamePk: g.gamePk, date, capturedAt, availableAt: capturedAt, eventStartTime,
      researchEligible, eligibilityReason: researchEligible ? "captured pregame; all source starts strictly earlier than slate" : (!pregame ? "captured at/after first pitch" : "a source start is not strictly earlier than the slate"),
      pitchers: { home, away },
      leakageRule: "only game-log starts with date < boardDate are aggregated; capturedAt < eventStartTime",
      provenance: { schedule: `${HOST}/api/v1/schedule?date=${date}&hydrate=probablePitcher`, gameLog: `${HOST}/api/v1/people/<id>/stats?stats=gameLog&season=${season}&group=pitching`, capturedAt },
    };
    record.recordHash = sha({ ...record, capturedAt: undefined, availableAt: undefined, provenance: undefined, recordHash: undefined });
    if (researchEligible) eligible++;
    // Multi-cadence, eligible-only (like lineup/batter-form): key by gamePk+capturedAt so a LATE (post-start,
    // ineligible) run can never overwrite an earlier ELIGIBLE pregame capture. Only persist researchEligible records.
    if (WRITE && researchEligible) { const dir = path.join(OUT, date); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, `${g.gamePk}-${capturedAt.replace(/[:.]/g, "-")}.json`), JSON.stringify(record, null, 2)); wrote++; }
  }
  console.log(`[workload] ${WRITE ? "WROTE" : "DRY-RUN"} ${date}: ${games.length} games · ${withHistory} with prior-start history · eligible ${eligible} · missing-probable ${missingProbable}${WRITE ? ` · wrote ${wrote}` : ""}`);
  if (!WRITE) console.log(`[workload] dry-run — pass --write to persist pregame-features/pitcher-workload/${date}/`);
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (invoked) main().catch((e) => { console.error("[workload] fatal:", e); process.exit(1); });
