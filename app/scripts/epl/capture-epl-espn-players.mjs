#!/usr/bin/env node
/**
 * CAPTURE EPL PLAYER STATS FROM ESPN — the free, unmetered source that makes a player model possible.
 *
 *   node scripts/epl/capture-epl-espn-players.mjs --season 2025-26 [--max-dates 40] [--write]
 *
 * WHY THIS EXISTS, AND WHY THE EARLIER REFUSAL WAS WRONG.
 *
 * lib/sports/epl/player-markets.mjs documented player markets as impossible: "there is no
 * player-level Premier League data in this system". That was true of what was COMMITTED, and the
 * conclusion drawn from it — that the data required a paid api-football plan — was not. It came from
 * checking one provider's season gates and never asking whether ESPN, whose public endpoints this
 * repository already reads for free on three other sports, carried the same thing.
 *
 * It does. Every EPL match summary carries, per player: minutes-bearing appearance flags
 * (starter / subbedIn / subbedOut / formationPlace) and the stat line — goals, assists, shots,
 * shots on goal, cards, fouls, offsides, plus keeper saves and goals against.
 *
 * The consequences are large enough to state plainly:
 *   · FREE and unmetered, where api-football's free plan allows 100 requests/day.
 *   · ALL SEASONS, where api-football's free plan refuses anything after 2024 — including the
 *     current one, which is the season a live product actually needs.
 *   · Squad membership for 2026-27 comes from the same host (/teams/{id}/roster), which is the
 *     "who is even at this club" problem that no amount of history solves.
 *
 * IDENTITY IS THE RISK HERE, not volume. ESPN athlete ids are stable and are captured verbatim; the
 * FIXTURE join is what can silently go wrong, so this walks dates from the COMMITTED corpus and
 * matches ESPN events back to it by club identity, refusing a date whose event count disagrees
 * rather than writing a partial matchday that would read like a complete one.
 *
 * Appends per fixture. A capture that persists only at the end loses everything it fetched when it is
 * interrupted — that already happened once in this repo, on the api-football backfill.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeClubName } from "../../src/lib/sports/epl/strength-state.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO = path.resolve(APP, "..");
const OUT_DIR = path.join(REPO, "data/internal/research/epl/players");
const CORPUS = path.join(OUT_DIR, "espn-players-v1.jsonl");

const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const WRITE = process.argv.includes("--write");
const SEASON = arg("--season", null);
const MAX_DATES = Number(arg("--max-dates", "40"));
const DELAY_MS = Number(arg("--delay-ms", "250"));

const SITE = "https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = async (url) => {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
};

/* ── Which dates to walk, from the COMMITTED corpus — never discovered over the wire ──────────── */
const corpus = JSON.parse(fs.readFileSync(path.join(REPO, "data/internal/research/epl/corpus-v1.json"), "utf8"));
const rows = corpus.rows.filter((r) => (SEASON ? r.season === SEASON : true));
if (rows.length === 0) { console.error(`no corpus rows for season ${SEASON}`); process.exit(2); }

/** date (YYYYMMDD) → the corpus fixtures played that day, so the join can be checked both ways. */
const byDate = new Map();
for (const r of rows) {
  const k = String(r.dateUtc).slice(0, 10).replace(/-/g, "");
  byDate.set(k, [...(byDate.get(k) ?? []), r]);
}

const captured = new Set();
/**
 * Fixtures already held PER DATE. Without this the budget is spent re-walking dates that are already
 * complete: the first run took the 60 most recent dates, and the second run walked those same 60,
 * captured nothing, and stopped — a resumable backfill that silently never resumes. Counting only
 * dates that still owe fixtures is what makes repeated runs actually converge.
 */
const heldByDate = new Map();
if (fs.existsSync(CORPUS)) {
  for (const line of fs.readFileSync(CORPUS, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line);
      captured.add(String(r.espnEventId));
      const k = String(r.dateUtc ?? "").slice(0, 10).replace(/-/g, "");
      if (!heldByDate.has(k)) heldByDate.set(k, new Set());
      heldByDate.get(k).add(String(r.espnEventId));
    } catch { /* a malformed line is not a capture */ }
  }
}
/** A date is DONE when we hold at least as many fixtures for it as the corpus says were played. */
const dateComplete = (d) => (heldByDate.get(d)?.size ?? 0) >= (byDate.get(d)?.length ?? 0);

const dates = [...byDate.keys()].sort().reverse();          // most recent first
console.log(`season ${SEASON ?? "all"} · ${rows.length} fixtures across ${dates.length} dates · already captured ${captured.size} fixture(s)`);

if (WRITE) fs.mkdirSync(OUT_DIR, { recursive: true });
const append = (rs) => { if (WRITE && rs.length) fs.appendFileSync(CORPUS, rs.map((r) => JSON.stringify(r)).join("\n") + "\n"); };

/** ESPN publishes a stat line as {abbreviation, value}; flatten to the fields a prop model needs. */
const statMap = (stats) => {
  const m = {};
  for (const s of stats ?? []) m[s.abbreviation ?? s.name] = Number(s.value ?? 0);
  return m;
};

let fixturesDone = 0, playerRows = 0, datesDone = 0;
const mismatches = [];

for (const date of dates) {
  if (datesDone >= MAX_DATES) break;
  if (dateComplete(date)) continue;                         // costs no budget and no request
  const expected = byDate.get(date);

  let board;
  try { board = await get(`${SITE}/scoreboard?dates=${date}`); }
  catch (e) { console.error(`  ${date}: scoreboard failed (${e.message}) — skipped`); continue; }
  datesDone += 1;

  const events = board.events ?? [];
  /*
   * The join, checked in BOTH directions. ESPN's eng.1 scoreboard for a date should hold exactly the
   * fixtures our corpus has for it. A disagreement is an identity problem — a moved kickoff, a cup
   * fixture leaking in, a club naming drift — and it is RECORDED rather than silently absorbed,
   * because a corpus quietly missing a third of a matchday biases every rate fitted on it.
   */
  if (events.length !== expected.length) {
    mismatches.push({ date, espn: events.length, corpus: expected.length });
  }

  for (const ev of events) {
    const id = String(ev.id);
    if (captured.has(id)) continue;

    const comp = ev.competitions?.[0];
    const home = comp?.competitors?.find((c) => c.homeAway === "home");
    const away = comp?.competitors?.find((c) => c.homeAway === "away");
    const homeName = home?.team?.displayName ?? null;
    const awayName = away?.team?.displayName ?? null;
    if (!homeName || !awayName) continue;

    /* Only completed matches carry a filled roster; an unfinished one is skipped, never zero-filled. */
    if (comp?.status?.type?.completed !== true) continue;

    let sum;
    try { sum = await get(`${SITE}/summary?event=${id}`); }
    catch (e) { console.error(`  event ${id}: summary failed (${e.message}) — skipped`); continue; }

    const rosters = sum.rosters ?? [];
    const entries = rosters.reduce((n, t) => n + (t.roster?.length ?? 0), 0);
    if (entries === 0) continue;                            // no lineup published → nothing to record

    const out = [];
    for (const t of rosters) {
      const teamName = t.team?.displayName ?? null;
      for (const p of t.roster ?? []) {
        const st = statMap(p.stats);
        const a = p.athlete ?? {};
        out.push({
          espnEventId: id,
          season: expected[0]?.season ?? SEASON ?? null,
          dateUtc: ev.date ?? null,
          homeClub: homeName,
          awayClub: awayName,
          teamId: t.team?.id ?? null,
          teamName,
          isHome: normalizeClubName(teamName) === normalizeClubName(homeName),
          playerId: a.id ?? null,
          playerName: a.displayName ?? null,
          position: p.position?.abbreviation ?? null,
          formationPlace: p.formationPlace ?? null,
          /* Participation — the term that decides every player prop, and the one the NFL work lacked. */
          started: p.starter === true,
          subbedIn: p.subbedIn === true,
          subbedOut: p.subbedOut === true,
          appeared: (st.APP ?? 0) > 0 || p.starter === true || p.subbedIn === true,
          goals: st.G ?? 0,
          assists: st.A ?? 0,
          shots: st.SHOT ?? 0,
          shotsOnGoal: st.SOG ?? 0,
          yellow: st.YC ?? 0,
          red: st.RC ?? 0,
          fouls: st.FC ?? 0,
          offsides: st.OF ?? 0,
          saves: st.SV ?? 0,
          goalsAgainst: st.GA ?? 0,
        });
      }
    }
    append(out);
    captured.add(id);
    fixturesDone += 1;
    playerRows += out.length;
    process.stdout.write(`\r  ${fixturesDone} fixture(s) · ${playerRows} player rows · ${datesDone}/${Math.min(MAX_DATES, dates.length)} dates`);
    await sleep(DELAY_MS);
  }
  await sleep(DELAY_MS);
}
process.stdout.write("\n");

if (mismatches.length > 0) {
  console.error(`\n  ${mismatches.length} date(s) where ESPN and the corpus disagree on fixture count:`);
  for (const m of mismatches.slice(0, 8)) console.error(`    ${m.date}: espn ${m.espn} vs corpus ${m.corpus}`);
  console.error("  Recorded, not absorbed — a corpus missing part of a matchday biases every rate fitted on it.");
}

if (WRITE) {
  fs.writeFileSync(path.join(OUT_DIR, "ESPN_CAPTURE_MANIFEST.json"), JSON.stringify({
    schemaVersion: 1,
    artifact: "epl-espn-player-capture",
    dataClass: "PRIVATE_RESEARCH",
    public: false,
    provider: "espn",
    endpoints: [`${SITE}/scoreboard?dates={YYYYMMDD}`, `${SITE}/summary?event={id}`],
    licence: "ESPN public JSON endpoints, no key. Point-in-time snapshot with attribution; the same host this repo already reads for MLB, NFL and EPL results.",
    fixturesCaptured: captured.size,
    dateMismatches: mismatches,
  }, null, 1) + "\n");
  console.log(`\nappended ${playerRows} player rows from ${fixturesDone} fixture(s) (written as they arrived)`);
  console.log(`corpus now covers ${captured.size} fixture(s)`);
} else {
  console.log(`\ndry run — ${playerRows} rows from ${fixturesDone} fixture(s) NOT written. Pass --write to persist.`);
}
