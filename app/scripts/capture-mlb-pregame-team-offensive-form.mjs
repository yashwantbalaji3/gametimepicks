/**
 * capture-mlb-pregame-team-offensive-form.mjs — INTERNAL pregame TEAM RECENT OFFENSIVE FORM (last 5 + last 10 games),
 * aggregated STRICTLY from games dated before the slate (leakage-safe). Immutable, timestamped, idempotent per
 * gamePk+teamId+date. Free StatsAPI. No modeling, no prediction.
 *
 * Team universe = both teams of every game on the slate (from the official schedule). Per window: games, runs, hits,
 * doubles, triples, HR, TB, BB, SO, AB, PA + DERIVED obpProxy / slgProxy / opsProxy (rate slots for a future model).
 * Output: pregame-features/team-offensive-form/<date>/<gamePk>-<teamId>.json (internal).
 *
 *   node app/scripts/capture-mlb-pregame-team-offensive-form.mjs --date 2026-07-22            # dry-run
 *   node app/scripts/capture-mlb-pregame-team-offensive-form.mjs --date 2026-07-22 --write    # persist
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const APP = process.cwd().endsWith("/app") ? process.cwd() : path.join(process.cwd(), "app");
const REPO = path.dirname(APP);
const ARCH = path.join(REPO, "data/internal/mlb/pregame-archive");
const OUT = path.join(ARCH, "pregame-features/team-offensive-form");
const HOST = "https://statsapi.mlb.com";
const SCHEMA_VERSION = "mlb-pregame-team-offensive-form-1";
const sha = (s) => crypto.createHash("sha256").update(typeof s === "string" ? s : JSON.stringify(s)).digest("hex");
const n = (x) => (x == null || Number.isNaN(Number(x)) ? 0 : Number(x));
const round = (x, d = 4) => (Number.isFinite(x) ? Number(x.toFixed(d)) : null);

async function fetchJson(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const ctl = new AbortController();
      const to = setTimeout(() => ctl.abort(), 15000);
      const res = await fetch(url, { signal: ctl.signal, headers: { "User-Agent": "gtp-pregame-team-offense/1" } });
      clearTimeout(to);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) { if (i === tries - 1) throw e; await new Promise((r) => setTimeout(r, 500 * (i + 1))); }
  }
}

/** Team universe for a slate date, from the official schedule: one entry per (game, team) with the event start time. */
export async function teamUniverse(date) {
  const j = await fetchJson(`${HOST}/api/v1/schedule?sportId=1&date=${date}`);
  const out = [];
  for (const g of (j.dates?.[0]?.games || [])) {
    const start = g.gameDate || null;
    for (const side of ["home", "away"]) {
      const t = g.teams?.[side]?.team;
      if (t?.id) out.push({ gamePk: g.gamePk, teamId: t.id, name: t.name, side, eventStartTime: start });
    }
  }
  return out;
}

/** aggregate the LAST `k` team games strictly earlier than boardDate. */
export function windowOffense(splits, boardDate, k) {
  const games = (splits || [])
    .filter((g) => g.date && g.date < boardDate)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-k);
  if (!games.length) return { games: 0, runs: 0, hits: 0, doubles: 0, triples: 0, hr: 0, tb: 0, bb: 0, so: 0, ab: 0, pa: 0, obpProxy: null, slgProxy: null, opsProxy: null };
  const sum = (f) => games.reduce((a, g) => a + n(g.stat?.[f]), 0);
  const hits = sum("hits"), bb = sum("baseOnBalls"), ab = sum("atBats");
  const tb = sum("totalBases") || (hits + sum("doubles") + 2 * sum("triples") + 3 * sum("homeRuns"));
  const obpProxy = ab + bb > 0 ? round((hits + bb) / (ab + bb)) : null;   // approximation (excludes HBP/SF)
  const slgProxy = ab > 0 ? round(tb / ab) : null;
  return {
    games: games.length, firstDate: games[0].date, lastDate: games[games.length - 1].date,
    runs: sum("runs"), hits, doubles: sum("doubles"), triples: sum("triples"), hr: sum("homeRuns"),
    tb, bb, so: sum("strikeOuts"), ab, pa: sum("plateAppearances"),
    obpProxy, slgProxy, opsProxy: obpProxy != null && slgProxy != null ? round(obpProxy + slgProxy) : null,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const WRITE = args.includes("--write");
  const di = args.indexOf("--date");
  const date = di >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(args[di + 1] || "") ? args[di + 1] : new Date().toISOString().slice(0, 10);
  const season = date.slice(0, 4);
  const capturedAt = new Date().toISOString();

  let universe = [];
  try { universe = await teamUniverse(date); } catch (e) { console.log(`[team-offense] schedule fetch failed for ${date}: ${e.message}`); return; }
  if (!universe.length) { console.log(`[team-offense] no games scheduled for ${date}`); return; }
  const outDir = path.join(OUT, date);

  let wrote = 0, skipped = 0, eligible = 0, fetched = 0;
  for (const t of universe) {
    const key = `${t.gamePk}-${t.teamId}`;
    let splits = null;
    try { const j = await fetchJson(`${HOST}/api/v1/teams/${t.teamId}/stats?stats=gameLog&group=hitting&season=${season}`); splits = j.stats?.[0]?.splits || []; fetched++; } catch { splits = []; }
    const last5 = windowOffense(splits, date, 5);
    const last10 = windowOffense(splits, date, 10);
    const researchEligible = t.eventStartTime ? capturedAt < t.eventStartTime : false;
    // leakage assert: no source game is on/after the slate date
    const noLeak = (splits || []).filter((g) => g.date && g.date >= date).length === 0 || (last10.lastDate == null || last10.lastDate < date);
    const record = {
      schemaVersion: SCHEMA_VERSION, public: false, approvedForProduction: false, productEligible: false,
      family: "team_offensive_form", gamePk: t.gamePk, teamId: t.teamId, name: t.name, side: t.side, date, capturedAt, availableAt: capturedAt, eventStartTime: t.eventStartTime,
      researchEligible: researchEligible && noLeak,
      eligibilityReason: !researchEligible ? "captured at/after first pitch (or no start time)" : !noLeak ? "a source game is not strictly earlier than the slate" : "captured pregame; all source games strictly earlier",
      last5, last10,
      leakageRule: "only team game-log games with date < boardDate are aggregated; captured pregame",
      provenance: { source: `${HOST}/api/v1/teams/<id>/stats?stats=gameLog&group=hitting&season=${season}`, capturedAt },
    };
    record.recordHash = sha({ ...record, capturedAt: undefined, availableAt: undefined, provenance: undefined, recordHash: undefined });
    if (record.researchEligible) eligible++;
    // Multi-cadence, eligible-only (like pitcher-workload/lineup): key by gamePk+teamId+capturedAt so multiple
    // pregame captures are preserved and the assembler can pick the FRESHEST eligible one. Only persist eligible.
    if (WRITE && record.researchEligible) { fs.mkdirSync(outDir, { recursive: true }); fs.writeFileSync(path.join(outDir, `${key}-${capturedAt.replace(/[:.]/g, "-")}.json`), JSON.stringify(record, null, 2)); wrote++; }
  }
  console.log(`[team-offense] ${WRITE ? "WROTE" : "DRY-RUN"} ${date}: ${universe.length} team-slots · fetched ${fetched} · eligible ${eligible} · skipped(existing) ${skipped}${WRITE ? ` · wrote ${wrote}` : ""}`);
  if (!WRITE) console.log(`[team-offense] dry-run — pass --write to persist pregame-features/team-offensive-form/${date}/`);
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (invoked) main().catch((e) => { console.error("[team-offense] fatal:", e); process.exit(1); });
