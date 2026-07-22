/**
 * capture-mlb-pregame-batter-vs-pitcher.mjs — INTERNAL pregame BATTER vs OPPOSING-STARTER history.
 *
 * For each batter-market player, the CAREER head-to-head totals vs the opposing team's probable starter (previous
 * meetings only — captured pregame, so strictly before this game). Sample size is gated: below MIN_PA the record
 * is marked `sufficientSample: false` (never dropped, never fabricated). No modeling, no prediction.
 *
 * Batter universe = batter-market playerIds from committed join files. Opposing starter is resolved via the two
 * team rosters (playerId → teamId) + the schedule's probable pitchers. Fields: PA/H/TB/HR/RBI/K/BB/AVG.
 *
 * Output: data/internal/mlb/pregame-archive/pregame-features/batter-vs-pitcher/<date>/<playerId>.json (internal).
 *
 *   node app/scripts/capture-mlb-pregame-batter-vs-pitcher.mjs --date 2026-07-22            # dry-run
 *   node app/scripts/capture-mlb-pregame-batter-vs-pitcher.mjs --date 2026-07-22 --write    # persist
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { batterUniverse } from "./capture-mlb-pregame-batter-splits.mjs";

const APP = process.cwd().endsWith("/app") ? process.cwd() : path.join(process.cwd(), "app");
const REPO = path.dirname(APP);
const ARCH = path.join(REPO, "data/internal/mlb/pregame-archive");
const OUT = path.join(ARCH, "pregame-features/batter-vs-pitcher");
const HOST = "https://statsapi.mlb.com";
const SCHEMA_VERSION = "mlb-pregame-batter-vs-pitcher-1";
const MIN_PA = 10; // below this the head-to-head sample is flagged insufficient
const sha = (s) => crypto.createHash("sha256").update(typeof s === "string" ? s : JSON.stringify(s)).digest("hex");
const numf = (x) => (x == null || x === "" || Number.isNaN(Number(x)) ? null : Number(x));

async function fetchJson(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const ctl = new AbortController();
      const to = setTimeout(() => ctl.abort(), 15000);
      const res = await fetch(url, { signal: ctl.signal, headers: { "User-Agent": "gtp-pregame-bvp/1" } });
      clearTimeout(to);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) { if (i === tries - 1) throw e; await new Promise((r) => setTimeout(r, 500 * (i + 1))); }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const WRITE = args.includes("--write");
  const di = args.indexOf("--date");
  const date = di >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(args[di + 1] || "") ? args[di + 1] : new Date().toISOString().slice(0, 10);
  const capturedAt = new Date().toISOString();

  const universe = batterUniverse(path.join(ARCH, "settlement-joins", date));
  if (!universe.size) { console.log(`[bvp] no batter-market players for ${date}`); return; }

  // game → { homeTeamId, awayTeamId, homeSP, awaySP, eventStartTime }
  let sched;
  try { sched = await fetchJson(`${HOST}/api/v1/schedule?sportId=1&date=${date}&hydrate=probablePitcher`); }
  catch (e) { console.error(`[bvp] schedule fetch failed (${String(e).slice(0, 60)})`); return; }
  const game = new Map();
  const teamIds = new Set();
  for (const g of sched?.dates?.[0]?.games || []) {
    game.set(g.gamePk, { homeTeamId: g.teams?.home?.team?.id, awayTeamId: g.teams?.away?.team?.id, homeSP: g.teams?.home?.probablePitcher, awaySP: g.teams?.away?.probablePitcher, eventStartTime: g.gameDate });
    teamIds.add(g.teams?.home?.team?.id); teamIds.add(g.teams?.away?.team?.id);
  }
  // playerId → teamId (active rosters, cached)
  const playerTeam = new Map();
  for (const tid of teamIds) { if (!tid) continue; try { const r = await fetchJson(`${HOST}/api/v1/teams/${tid}/roster?rosterType=active`); for (const e of r.roster || []) playerTeam.set(e.person?.id, tid); } catch { /* skip */ } }

  const outDir = path.join(OUT, date);
  let wrote = 0, skipped = 0, eligible = 0, sufficient = 0, noOpp = 0;
  for (const b of universe.values()) {
    if (fs.existsSync(path.join(outDir, `${b.playerId}.json`)) && !args.includes("--force")) { skipped++; continue; }
    const gm = game.get(b.gamePk);
    const teamId = playerTeam.get(b.playerId);
    // opposing starter = SP of the team the batter is NOT on
    let oppSP = null;
    if (gm && teamId) oppSP = teamId === gm.homeTeamId ? gm.awaySP : teamId === gm.awayTeamId ? gm.homeSP : null;
    if (!oppSP?.id) { noOpp++; }
    let h2h = null;
    if (oppSP?.id) {
      try { const j = await fetchJson(`${HOST}/api/v1/people/${b.playerId}/stats?stats=vsPlayerTotal&group=hitting&opposingPlayerId=${oppSP.id}`); const s = j.stats?.[0]?.splits?.[0]?.stat; if (s) h2h = { pa: numf(s.plateAppearances) ?? 0, h: numf(s.hits) ?? 0, tb: numf(s.totalBases) ?? 0, hr: numf(s.homeRuns) ?? 0, rbi: numf(s.rbi) ?? 0, k: numf(s.strikeOuts) ?? 0, bb: numf(s.baseOnBalls) ?? 0, avg: numf(s.avg) }; } catch { /* missing */ }
    }
    const sufficientSample = !!(h2h && h2h.pa >= MIN_PA);
    const researchEligible = b.eventStartTime ? capturedAt < b.eventStartTime : false;
    const record = {
      schemaVersion: SCHEMA_VERSION, public: false, approvedForProduction: false, productEligible: false,
      family: "batter_vs_pitcher", playerId: b.playerId, name: b.name, gamePk: b.gamePk, date, capturedAt, availableAt: capturedAt, eventStartTime: b.eventStartTime,
      researchEligible, eligibilityReason: researchEligible ? "captured pregame; career head-to-head totals precede this game" : "captured at/after first pitch",
      opposingStarter: oppSP?.id ? { id: oppSP.id, name: oppSP.fullName } : null,
      headToHead: h2h, minPlateAppearances: MIN_PA, sufficientSample,
      availability: !oppSP?.id ? "no opposing starter resolved" : !h2h ? "no prior meetings" : sufficientSample ? "sufficient" : `insufficient (${h2h.pa} PA < ${MIN_PA})`,
      leakageRule: "career head-to-head totals are prior meetings only, captured pregame (before this game); doubleheader edge noted",
      provenance: { source: `${HOST}/api/v1/people/<batterId>/stats?stats=vsPlayerTotal&opposingPlayerId=<spId>`, roster: `${HOST}/api/v1/teams/<id>/roster`, capturedAt },
    };
    record.recordHash = sha({ ...record, capturedAt: undefined, availableAt: undefined, provenance: undefined, recordHash: undefined });
    if (researchEligible) eligible++;
    if (sufficientSample) sufficient++;
    if (WRITE && researchEligible) { fs.mkdirSync(outDir, { recursive: true }); fs.writeFileSync(path.join(outDir, `${b.playerId}.json`), JSON.stringify(record, null, 2)); wrote++; }
  }
  console.log(`[bvp] ${WRITE ? "WROTE" : "DRY-RUN"} ${date}: ${universe.size} batters · eligible ${eligible} · sufficient-sample ${sufficient} · no-opposing-SP ${noOpp} · skipped(existing) ${skipped}${WRITE ? ` · wrote ${wrote}` : ""}`);
  if (!WRITE) console.log(`[bvp] dry-run — pass --write to persist pregame-features/batter-vs-pitcher/${date}/`);
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (invoked) main().catch((e) => { console.error("[bvp] fatal:", e); process.exit(1); });
