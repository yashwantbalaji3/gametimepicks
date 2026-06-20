#!/usr/bin/env node
/**
 * World Cup lineup watcher — for each game on the active slate, decides whether it is inside its
 * lineup-refresh window (kickoff −60′ … −15′; preferred target −45′) and whether the official starting
 * XI has posted yet (API-Football). Writes a status artifact + GitHub Action outputs so the workflow
 * can decide whether to run a lineup-aware refresh. Never fabricates: when the API key is absent or
 * lineups are not posted, it reports that honestly (refresh may still run with projected roles).
 *
 * Usage:
 *   node scripts/watch-worldcup-lineups.mjs --date 2026-06-20 [--now 2026-06-20T16:20:00Z]
 * Env: API_FOOTBALL_KEY (optional — without it, lineup state is "unknown", windows still computed).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "app", "public", "data");
const AF_LEAGUE = process.env.WC_API_FOOTBALL_LEAGUE ?? "1";
const AF_SEASON = process.env.WC_API_FOOTBALL_SEASON ?? "2026";

const WINDOW_OPEN_MIN = 60;   // window opens at kickoff − 60 min
const WINDOW_CLOSE_MIN = 15;  // window closes at kickoff − 15 min (don't generate new cards after)
const REFRESH_TARGET_MIN = 45;

const norm = (s) => (s ?? "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]/g, "");
const slugify = (h, a, d) => `${norm(h)}-vs-${norm(a)}-${d}`.replace(/-vs-/, "-vs-"); // simple, stable

/** PURE: classify each game's refresh window relative to `now`. Exported for tests. */
export function computeRefreshWindows(games, nowIso) {
  const now = Date.parse(nowIso);
  return games.map((g) => {
    const ko = Date.parse(g.kickoffUtc);
    const minsToKo = Number.isFinite(ko) ? (ko - now) / 60000 : null;
    const windowOpen = minsToKo != null && minsToKo <= WINDOW_OPEN_MIN && minsToKo > WINDOW_CLOSE_MIN;
    const windowClosed = minsToKo != null && minsToKo <= WINDOW_CLOSE_MIN; // ≤15′ to KO or started
    const refreshTarget = Number.isFinite(ko) ? new Date(ko - REFRESH_TARGET_MIN * 60000).toISOString() : null;
    return { ...g, minsToKickoff: minsToKo == null ? null : Math.round(minsToKo), windowOpen, windowClosed, refreshTarget };
  });
}

function loadGames(date) {
  // Read the date-specific WC team projections (fixtures + kickoffs).
  for (const f of [path.join(DATA, "world-cup", "projections", `${date}.json`), path.join(DATA, "world-cup", "projections", "latest.json")]) {
    try {
      const doc = JSON.parse(fs.readFileSync(f, "utf8"));
      if (doc.date && doc.date !== date) continue;
      const seen = new Set();
      const games = [];
      for (const m of doc.matches ?? []) {
        const fixture = `${m.homeTeam} vs ${m.awayTeam}`;
        if (seen.has(fixture)) continue;
        seen.add(fixture);
        games.push({ gameId: String(m.matchId), home: m.homeTeam, away: m.awayTeam, game: fixture, slug: slugify(m.homeTeam, m.awayTeam, date), kickoffUtc: m.kickoffUtc ?? null });
      }
      if (games.length) return games;
    } catch { /* try next */ }
  }
  return [];
}

async function afLineupCount(home, away, date, key) {
  if (!key) return { fixtureId: null, homeStartXI: 0, awayStartXI: 0, lineupsPosted: false, source: "unavailable" };
  const af = async (p) => {
    const r = await fetch(`https://v3.football.api-sports.io/${p}`, { headers: { "x-apisports-key": key } });
    return r.json();
  };
  try {
    const fx = await af(`fixtures?league=${AF_LEAGUE}&season=${AF_SEASON}&date=${date}`);
    const match = (fx.response ?? []).find((f) => norm(f.teams.home.name).includes(norm(home).slice(0, 5)) || norm(f.teams.away.name).includes(norm(away).slice(0, 5)));
    if (!match) return { fixtureId: null, homeStartXI: 0, awayStartXI: 0, lineupsPosted: false, source: "api_football_no_fixture" };
    const fid = match.fixture.id;
    const lu = await af(`fixtures/lineups?fixture=${fid}`);
    const teams = lu.response ?? [];
    const xi = teams.map((t) => (t.startXI ?? []).length);
    const total = xi.reduce((a, b) => a + b, 0);
    return { fixtureId: fid, homeStartXI: xi[0] ?? 0, awayStartXI: xi[1] ?? 0, lineupsPosted: total >= 22, source: "api_football" };
  } catch (e) {
    return { fixtureId: null, homeStartXI: 0, awayStartXI: 0, lineupsPosted: false, source: `error:${String(e).slice(0, 40)}` };
  }
}

function ghOutput(kv) {
  const f = process.env.GITHUB_OUTPUT;
  const line = Object.entries(kv).map(([k, v]) => `${k}=${v}`).join("\n") + "\n";
  if (f) fs.appendFileSync(f, line);
  process.stdout.write(line);
}

async function main() {
  const args = process.argv.slice(2);
  const get = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
  const date = get("date", new Date().toISOString().slice(0, 10));
  const nowIso = get("now", new Date().toISOString());
  const mode = get("mode", "preview_only");
  const key = (process.env.API_FOOTBALL_KEY ?? "").trim();

  const games = computeRefreshWindows(loadGames(date), nowIso);
  const enriched = [];
  for (const g of games) {
    let lineup = { fixtureId: null, homeStartXI: 0, awayStartXI: 0, lineupsPosted: false, source: g.kickoffUtc ? "not_checked_out_of_window" : "no_kickoff" };
    if (g.windowOpen && !g.windowClosed) lineup = await afLineupCount(g.home, g.away, date, key);
    const status = g.windowClosed ? "window_closed" : !g.windowOpen ? "pre_window" : lineup.lineupsPosted ? "lineups_posted" : "waiting_for_lineups";
    const action = g.windowClosed ? "no_new_cards" : !g.windowOpen ? "wait" : lineup.lineupsPosted ? "refresh_confirmed" : "refresh_projected";
    enriched.push({ gameId: g.gameId, fixtureId: lineup.fixtureId, slug: g.slug, game: g.game, kickoff: g.kickoffUtc, refreshTarget: g.refreshTarget, minsToKickoff: g.minsToKickoff, windowOpen: g.windowOpen, windowClosed: g.windowClosed, lineupsPosted: lineup.lineupsPosted, homeStartXI: lineup.homeStartXI, awayStartXI: lineup.awayStartXI, lineupSource: lineup.source, status, action });
  }

  const inWindow = enriched.filter((g) => g.windowOpen && !g.windowClosed);
  const refreshNeeded = inWindow.length > 0;
  const status = { date, checkedAt: nowIso, mode, apiFootball: key ? "configured" : "absent", games: enriched };
  fs.mkdirSync(path.join(DATA, "automation"), { recursive: true });
  fs.writeFileSync(path.join(DATA, "automation", "lineup-refresh-status.json"), JSON.stringify(status, null, 2) + "\n");

  ghOutput({
    refresh_needed: String(refreshNeeded),
    lineups_posted_any: String(inWindow.some((g) => g.lineupsPosted)),
    lineups_posted_all: String(inWindow.length > 0 && inWindow.every((g) => g.lineupsPosted)),
    games_to_refresh: inWindow.map((g) => g.slug).join(",") || "none",
  });
  return 0;
}

// Only run main when invoked directly (not when imported by a test).
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().then((c) => process.exit(c)).catch((e) => { console.error(e); process.exit(1); });
}
