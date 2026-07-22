/**
 * capture-mlb-pregame-bullpen.mjs — INTERNAL pregame BULLPEN-AVAILABILITY feature.
 *
 * Per team, reliever usage over the last 1 and 3 days, derived ONLY from COMPLETED (Final) games dated strictly
 * before the slate — never the slate's own games, never in-progress/postgame info from today. Reports appearances,
 * pitches thrown, and a derived `likelyUnavailable` research flag (recent high workload / back-to-back). No
 * prediction — a manager's actual availability is not knowable pregame; this is a workload signal only.
 *
 * Efficient: fetches the 3-day schedule window once, fetches each FINAL game's box score once (cached), then
 * aggregates per team. Free StatsAPI (no Odds credits). Output:
 *   data/internal/mlb/pregame-archive/pregame-features/bullpen/<date>/<gamePk>.json
 *
 *   node app/scripts/capture-mlb-pregame-bullpen.mjs --date 2026-07-22            # dry-run
 *   node app/scripts/capture-mlb-pregame-bullpen.mjs --date 2026-07-22 --write    # persist
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const APP = process.cwd().endsWith("/app") ? process.cwd() : path.join(process.cwd(), "app");
const REPO = path.dirname(APP);
const OUT = path.join(REPO, "data/internal/mlb/pregame-archive/pregame-features/bullpen");
const HOST = "https://statsapi.mlb.com";
const SCHEMA_VERSION = "mlb-pregame-bullpen-1";
const sha = (s) => crypto.createHash("sha256").update(typeof s === "string" ? s : JSON.stringify(s)).digest("hex");
const num = (x) => (x == null || Number.isNaN(Number(x)) ? 0 : Number(x));
const shiftDate = (d, days) => new Date(Date.parse(`${d}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

async function fetchJson(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const ctl = new AbortController();
      const to = setTimeout(() => ctl.abort(), 15000);
      const res = await fetch(url, { signal: ctl.signal, headers: { "User-Agent": "gtp-pregame-bullpen/1" } });
      clearTimeout(to);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) { if (i === tries - 1) throw e; await new Promise((r) => setTimeout(r, 500 * (i + 1))); }
  }
}

// derive a reliever-usage list for one team from one FINAL game's box (pitchers[1:] = non-starters).
function relieversFromGame(teamBox, gameDate) {
  const pitchers = teamBox?.pitchers || [];
  const players = teamBox?.players || {};
  return pitchers.slice(1).map((id) => {
    const p = players["ID" + id];
    const st = p?.stats?.pitching || {};
    return { id, name: p?.person?.fullName ?? null, pitches: num(st.numberOfPitches ?? st.pitchesThrown), outs: num(st.outs), date: gameDate };
  }).filter((r) => r.id);
}

function aggregate(usageRows) {
  const byRel = new Map();
  for (const r of usageRows) {
    const prev = byRel.get(r.id) || { id: r.id, name: r.name, appearances: 0, pitches: 0, outs: 0, dates: [] };
    prev.appearances++; prev.pitches += r.pitches; prev.outs += r.outs; prev.dates.push(r.date);
    byRel.set(r.id, prev);
  }
  return [...byRel.values()].sort((a, b) => b.pitches - a.pitches);
}

// research flag (NOT a hard "unavailable"): recent high workload / back-to-back.
function likelyUnavailable(last1, last3) {
  const flags = [];
  for (const r of last1) if (r.pitches >= 30) flags.push({ id: r.id, name: r.name, reason: `${r.pitches} pitches yesterday` });
  for (const r of last3) if (r.appearances >= 3 && !flags.find((f) => f.id === r.id)) flags.push({ id: r.id, name: r.name, reason: `${r.appearances} appearances in 3 days` });
  return flags;
}

async function main() {
  const args = process.argv.slice(2);
  const WRITE = args.includes("--write");
  const di = args.indexOf("--date");
  const date = di >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(args[di + 1] || "") ? args[di + 1] : new Date().toISOString().slice(0, 10);
  const capturedAt = new Date().toISOString();
  const windowDates = [shiftDate(date, -3), shiftDate(date, -2), shiftDate(date, -1)];

  // 1) gather all FINAL games in the 3-day window (strictly earlier than the slate)
  const finalGames = []; // {gamePk, gameDate, homeId, awayId}
  for (const d of windowDates) {
    let sched;
    try { sched = await fetchJson(`${HOST}/api/v1/schedule?sportId=1&date=${d}`); } catch { continue; }
    for (const g of sched?.dates?.[0]?.games || []) {
      if (g.status?.abstractGameState === "Final" && g.gameDate && Date.parse(g.gameDate) < Date.parse(capturedAt) && g.officialDate < date) {
        finalGames.push({ gamePk: g.gamePk, gameDate: g.officialDate || d, homeId: g.teams?.home?.team?.id, awayId: g.teams?.away?.team?.id });
      }
    }
  }
  // 2) fetch each final game's box once → per-team reliever usage
  const teamUsage = new Map(); // teamId → [usageRow]
  for (const fg of finalGames) {
    let feed;
    try { feed = await fetchJson(`${HOST}/api/v1.1/game/${fg.gamePk}/feed/live`); } catch { continue; }
    for (const [side, teamId] of [["home", fg.homeId], ["away", fg.awayId]]) {
      const rows = relieversFromGame(feed?.liveData?.boxscore?.teams?.[side], fg.gameDate);
      teamUsage.set(teamId, (teamUsage.get(teamId) || []).concat(rows));
    }
  }
  const teamName = new Map();

  // 3) attach to each of the slate's games
  let today;
  try { today = await fetchJson(`${HOST}/api/v1/schedule?sportId=1&date=${date}`); }
  catch (e) { console.error(`[bullpen] schedule fetch failed (${String(e).slice(0, 60)})`); return; }
  const games = today?.dates?.[0]?.games || [];
  const teamBlock = (teamId, teamNm) => {
    const rows = teamUsage.get(teamId) || [];
    const last1 = aggregate(rows.filter((r) => r.date === windowDates[2]));
    const last3 = aggregate(rows);
    return { teamId, teamName: teamNm, last1Day: { appearances: last1.reduce((a, r) => a + r.appearances, 0), pitches: last1.reduce((a, r) => a + r.pitches, 0), relievers: last1 }, last3Days: { appearances: last3.reduce((a, r) => a + r.appearances, 0), pitches: last3.reduce((a, r) => a + r.pitches, 0), relievers: last3 }, likelyUnavailable: likelyUnavailable(last1, last3) };
  };

  let wrote = 0, eligible = 0, withData = 0;
  for (const g of games) {
    const eventStartTime = g.gameDate;
    const researchEligible = eventStartTime ? capturedAt < eventStartTime : false;
    const home = teamBlock(g.teams?.home?.team?.id, g.teams?.home?.team?.name);
    const away = teamBlock(g.teams?.away?.team?.id, g.teams?.away?.team?.name);
    if (home.last3Days.relievers.length || away.last3Days.relievers.length) withData++;
    if (researchEligible) eligible++;
    const record = {
      schemaVersion: SCHEMA_VERSION, public: false, approvedForProduction: false, productEligible: false,
      family: "bullpen_availability", gamePk: g.gamePk, date, capturedAt, availableAt: capturedAt, eventStartTime,
      researchEligible, eligibilityReason: researchEligible ? "captured pregame; source games Final + strictly earlier" : "captured at/after first pitch",
      windowDates, home, away,
      leakageRule: "only Final games with officialDate < slate date and gameDate before capturedAt; a reliever flag is a workload signal, not a definitive availability claim",
      provenance: { source: `${HOST} schedule(${windowDates.join(",")}) + feed/live box scores`, capturedAt },
    };
    record.recordHash = sha({ ...record, capturedAt: undefined, availableAt: undefined, provenance: undefined, recordHash: undefined });
    if (WRITE && researchEligible) { const dir = path.join(OUT, date); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, `${g.gamePk}.json`), JSON.stringify(record, null, 2)); wrote++; }
  }
  console.log(`[bullpen] ${WRITE ? "WROTE" : "DRY-RUN"} ${date}: ${games.length} games · window ${windowDates.join(",")} · ${finalGames.length} prior finals · with-data ${withData} · eligible ${eligible}${WRITE ? ` · wrote ${wrote}` : ""}`);
  if (!WRITE) console.log(`[bullpen] dry-run — pass --write to persist pregame-features/bullpen/${date}/`);
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (invoked) main().catch((e) => { console.error("[bullpen] fatal:", e); process.exit(1); });
