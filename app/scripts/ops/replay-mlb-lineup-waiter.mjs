#!/usr/bin/env node
/**
 * HISTORICAL REPLAY of the MLB pregame lineup waiter — READ-ONLY.
 *
 *   node app/scripts/ops/replay-mlb-lineup-waiter.mjs --from 2026-10-08 --to 2026-10-18 --out <dir>
 *
 * For each ET slate it reconstructs, from free and committed sources only:
 *   UPSTREAM   when each side's nine was posted (and changed) — StatsAPI `feed/live/timestamps` + `feed/live?timecode=`
 *              (the feed as it stood at each recorded change), merged with the committed lineup-capture archive
 *              (data/internal/mlb/pregame-archive/pregame-features/lineup/<date>/, each file stamped `capturedAt`).
 *              LIMITATION: StatsAPI keeps no "posted at" field; the first recorded timecode showing a nine is an UPPER
 *              bound on the post time (the feed may have carried it earlier), so detection times here are conservative.
 *   TODAY      when GTP actually published a simulation built from that lineup — git history of
 *              app/public/data/mlb/full-game-simulations/<date>.json (commit time; Vercel adds its build time).
 *   WAITER     what the waiter WOULD have done — the real decider (src/lib/ops/mlb-lineup-waiter.mjs) driven every
 *              10 minutes with the reconstructed upstream, a committed state that evolves with the actual scheduled
 *              refresh runs plus the waiter's own dispatches, the actual writer-queue runs (gh run list), and the
 *              board's first commit. Manual human dispatches of the refresh are REMOVED in this counterfactual (the
 *              waiter exists to replace them). The waiter starts at the first delivered trigger of the day
 *              (publication-watchdog / mlb-daily-production completions on main), or the window open if later.
 *
 * Writes only under --out (refused under app/public/data or data/). Never dispatches, never commits.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { decideLineupWaiter, lineupFingerprint, committedLineups, normalizeSchedule, WAITER, WAITER_LIMITS, etDate } from "../../src/lib/ops/mlb-lineup-waiter.mjs";
import { writerWorkflowFiles } from "./mlb-lineup-waiter.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const FROM = arg("--from", "2026-10-08");
const TO = arg("--to", "2026-10-18");
const OUT = path.resolve(arg("--out", path.join(process.cwd(), "waiter-replay")));
const REF = arg("--ref", "origin/main");
const MAX_CALLS = Number(arg("--max-calls", 300));
const LIMITS = { HORIZON_MIN: Number(arg("--horizon-min", WAITER_LIMITS.HORIZON_MIN)) };
for (const forbidden of [path.join(REPO, "app/public/data"), path.join(REPO, "data")]) {
  if (OUT === forbidden || OUT.startsWith(forbidden + path.sep)) { console.error(`REFUSED: --out ${OUT} is under ${forbidden}`); process.exit(2); }
}
const RAW = path.join(OUT, "raw");
fs.mkdirSync(RAW, { recursive: true });
const MIN = 60_000;
const iso = (ms) => (Number.isFinite(ms) ? new Date(ms).toISOString().replace(".000Z", "Z") : "—");
const hm = (ms) => (Number.isFinite(ms) ? new Date(ms).toISOString().slice(11, 16) + "Z" : "—");

// ── read-only sources, cached under --out/raw ─────────────────────────────────────────────────────────────────
let calls = 0;
async function statsapi(url, cacheName) {
  const f = path.join(RAW, "statsapi", cacheName);
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8"));
  if (calls >= MAX_CALLS) throw new Error(`StatsAPI call cap (${MAX_CALLS}) reached`);
  calls++;
  const res = await fetch(url, { headers: { "User-Agent": "gtp-mlb-lineup-waiter-replay/1" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  const j = await res.json();
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(j));
  return j;
}
function ghJson(args, cacheName) {
  const f = path.join(RAW, "gh", cacheName);
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8"));
  const j = JSON.parse(execFileSync("gh", args, { cwd: REPO, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(j));
  return j;
}
const git = (args) => execFileSync("git", args, { cwd: REPO, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
const runList = (wf) => ghJson(["run", "list", "--workflow", wf, "--limit", "400", "--json", "databaseId,createdAt,startedAt,updatedAt,status,conclusion,event,headBranch"], `${wf}.json`);

function dates(from, to) {
  const out = [];
  for (let t = Date.parse(`${from}T12:00:00Z`); t <= Date.parse(`${to}T12:00:00Z`); t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}
const tc = (s) => Date.parse(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}Z`);

/** Every observation of the posted orders before first pitch: StatsAPI change points + committed capture archive. */
async function upstreamObservations(date, g) {
  const first = Date.parse(g.firstPitch);
  const obs = [];
  let stamps = [];
  try { stamps = await statsapi(`https://statsapi.mlb.com/api/v1.1/game/${g.gamePk}/feed/live/timestamps`, `ts-${g.gamePk}.json`); } catch (e) { console.log(`  ${g.gamePk}: timestamps unavailable (${e.message})`); }
  const pre = (stamps ?? []).filter((s) => tc(s) < first);
  for (const s of pre.slice(0, 12)) {
    try {
      const f = await statsapi(`https://statsapi.mlb.com/api/v1.1/game/${g.gamePk}/feed/live?timecode=${s}`, `feed-${g.gamePk}-${s}.json`);
      const t = f?.liveData?.boxscore?.teams;
      obs.push({ t: tc(s), src: "statsapi-timecode", away: t?.away?.battingOrder ?? [], home: t?.home?.battingOrder ?? [] });
    } catch (e) { console.log(`  ${g.gamePk} ${s}: ${e.message}`); }
  }
  const dir = path.join(REPO, "data/internal/mlb/pregame-archive/pregame-features/lineup", date);
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir).filter((x) => x.startsWith(`${g.gamePk}-`)) : []) {
    try {
      const s = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      const t = Date.parse(s.capturedAt);
      if (!(t < first)) continue;
      const ord = (side) => (side?.posted ? (side.lineup ?? []).slice().sort((a, b) => a.battingOrderSlot - b.battingOrderSlot).map((b) => b.playerId) : []);
      obs.push({ t, src: "gtp-capture-archive", away: ord(s.away), home: ord(s.home) });
    } catch { /* torn */ }
  }
  return obs.sort((a, b) => a.t - b.t);
}
/** Per side, the latest observation at or before t (an observation may cover one side only). */
const stateAt = (obs, t) => {
  const cur = { away: null, home: null };
  for (const o of obs) { if (o.t > t) break; for (const s of ["away", "home"]) if (Array.isArray(o[s])) cur[s] = o[s]; }
  return cur;
};
/** The nine a committed simulation used for one side, in slot order (only when the side is confirmed). */
function simIds(sim, pk, side) {
  const g = (sim?.games ?? []).find((x) => x.gamePk === Number(pk));
  if (!g || g.completeness?.[`${side}LineupSource`] !== "confirmed") return null;
  const team = side === "away" ? g.awayTeam : g.homeTeam;
  const ids = (g.players?.batters ?? []).filter((b) => b.team === team).sort((a, b) => a.battingOrder - b.battingOrder).map((b) => b.playerId);
  return ids.length === 9 ? ids : null;
}

/** The committed simulation's per-side fingerprints at every commit of the day's file (actual history). */
function simHistory(date) {
  const p = `app/public/data/mlb/full-game-simulations/${date}.json`;
  const lines = git(["log", REF, "--format=%H %cI", "--", p]).trim().split("\n").filter(Boolean).reverse();
  const out = [];
  let prevKey = null;
  for (const l of lines) {
    const [sha, when] = l.split(" ");
    let sim = null;
    try { sim = JSON.parse(git(["show", `${sha}:${p}`])); } catch { continue; }
    const c = committedLineups({ simulation: sim });
    const key = JSON.stringify(Object.entries(c).map(([pk, v]) => [pk, v.away.fingerprint, v.home.fingerprint]));
    const ids = {};
    for (const pk of Object.keys(c)) ids[pk] = { away: simIds(sim, pk, "away"), home: simIds(sim, pk, "home") };
    // A lineup BUILD: a commit whose committed nines differ from the previous commit's (the file's creation is not one).
    out.push({ sha: sha.slice(0, 10), t: Date.parse(when), committed: c, ids, lineupChange: prevKey !== null && key !== prevKey });
    prevKey = key;
  }
  return out;
}
function firstCommitTime(p) {
  const l = git(["log", REF, "--diff-filter=A", "--format=%cI", "--", p]).trim().split("\n").filter(Boolean).pop();
  return l ? Date.parse(l) : NaN;
}

// ── the counterfactual ────────────────────────────────────────────────────────────────────────────────────────
function simulateWaiter({ date, games, obs, boardAt, boardFirstPitch, refreshRuns, writerRuns, arrivals, initialCommitted, dur, noWaiter = false }) {
  const scheduled = refreshRuns.filter((r) => r.event !== "workflow_dispatch" && r.conclusion === "success");
  const firstPitches = games.map((g) => Date.parse(g.firstPitch)).filter(Number.isFinite);
  const open = Math.min(...firstPitches) - WAITER_LIMITS.MONITOR_LEAD_MIN * MIN;
  const lastPitch = Math.max(...firstPitches);
  const dayArrivals = arrivals.filter((t) => t >= Date.parse(`${date}T08:00:00Z`) && t <= lastPitch);
  const arrival = dayArrivals[0] ?? NaN;
  let start = NaN;
  let activeMs = 0;
  let shortRuns = 0;
  const events = []; // refresh landings that changed the committed state
  const dispatches = [];
  const ledger = { dispatches: [], alerted: [] };
  const alerts = [];
  // committed state per (pk, side) at time t, from refresh landings (scheduled runs + waiter dispatches)
  const landings = scheduled.map((r) => ({ start: Date.parse(r.startedAt ?? r.createdAt), land: Date.parse(r.updatedAt), kind: "scheduled", id: r.databaseId }));
  const committedAt = (t) => {
    const c = structuredClone(initialCommitted);
    for (const l of landings.filter((x) => x.land <= t).sort((a, b) => a.land - b.land)) {
      if (Number.isFinite(boardAt) && l.start < boardAt) continue; // no board → the refresh no-ops
      for (const g of games) {
        const fpT = Date.parse(boardFirstPitch[g.gamePk] ?? g.firstPitch);
        if (l.start >= fpT) continue; // started by the refresh's own clock → frozen, never regenerated
        const s = stateAt(obs[g.gamePk] ?? [], l.start + 40_000);
        c[g.gamePk] ??= { away: { fingerprint: null }, home: { fingerprint: null } };
        for (const side of ["away", "home"]) { const f = lineupFingerprint(s?.[side]); if (f) c[g.gamePk][side] = { source: "confirmed", fingerprint: f }; }
      }
    }
    return c;
  };
  const runsAt = (t) => [
    ...scheduled.filter((r) => Date.parse(r.createdAt) <= t).map((r) => ({ ...r, status: Date.parse(r.updatedAt) <= t ? "completed" : "in_progress" })),
    ...landings.filter((l) => l.kind === "waiter" && l.created <= t).map((l) => ({ databaseId: l.id, createdAt: iso(l.created), updatedAt: iso(l.land), event: "workflow_dispatch", status: l.land <= t ? "completed" : "in_progress", conclusion: l.land <= t ? "success" : null })),
  ];
  const writersAt = (t) => writerRuns.filter((r) => Date.parse(r.createdAt) <= t && Date.parse(r.updatedAt) > t).map((r) => ({ workflowName: r.wf, status: "in_progress" }));
  let t = Number.isFinite(arrival) ? arrival : open;
  let cycles = 0;
  let last = null;
  while (!noWaiter && cycles < 400) {
    cycles++;
    const tPrev = t;
    const upstream = {};
    for (const g of games) { const s = stateAt(obs[g.gamePk] ?? [], t); upstream[g.gamePk] = { away: s?.away ?? [], home: s?.home ?? [] }; }
    const schedGames = games.map((g) => ({ ...g, abstractGameState: t >= Date.parse(g.firstPitch) ? "Live" : "Preview" }));
    const d = decideLineupWaiter({ nowIso: iso(t), slateDate: date, games: schedGames, upstream, committed: committedAt(t), boardFirstPitch, boardPresent: Number.isFinite(boardAt) && boardAt <= t, refreshRuns: runsAt(t), activeWriters: writersAt(t), ledger, limits: LIMITS });
    last = d;
    for (const a of d.alerts) { ledger.alerted.push(a.key); alerts.push({ t, ...a }); }
    const next = d.decision === WAITER.ALERT ? d.next : d.decision;
    if (next === WAITER.DONE) break;
    if (d.leaveToLaterTrigger) { // this run exits; the next delivered trigger starts a new one
      shortRuns++;
      const na = dayArrivals.find((x) => x > t);
      if (!Number.isFinite(na)) break;
      t = na;
      continue;
    }
    if (!Number.isFinite(start)) start = t;
    if (d.decision === WAITER.DISPATCH) {
      // The refresh joins gtp-generated-artifacts: it starts when the queue is free (the decider already waited out
      // writers in flight at t), runs for the measured median duration, and captures ~40 s in.
      const created = t + 5_000;
      const startR = created + 15_000;
      const land = startR + dur;
      const id = `W${dispatches.length + 1}`;
      landings.push({ start: startR, land, kind: "waiter", id, created });
      ledger.dispatches.push({ at: iso(t), fingerprint: d.fingerprint, sides: d.owed });
      dispatches.push({ t, owed: d.owed, land });
      t = land + 60_000; // the runner waits for the refresh, then re-decides
      activeMs += t - tPrev;
      continue;
    }
    t += Math.max(30, Math.min(d.waitSeconds || WAITER_LIMITS.POLL_SECONDS, 6 * 3600)) * 1000;
    activeMs += t - tPrev;
    if (t > lastPitch + 3 * 3600_000) break;
  }
  // builds: landings that changed the committed state
  let prev = JSON.stringify(initialCommitted);
  const changing = [];
  for (const l of landings.slice().sort((a, b) => a.land - b.land)) {
    const now = JSON.stringify(committedAt(l.land));
    if (now !== prev) changing.push(l);
    prev = now;
  }
  return { start, arrival, open, cycles, dispatches, alerts, changing, committedAt, landings, last, activeMin: activeMs / MIN, shortRuns };
}

// ── main ──────────────────────────────────────────────────────────────────────────────────────────────────────
const refreshRunsAll = runList("mlb-lineup-refresh.yml");
const durs = refreshRunsAll.filter((r) => r.conclusion === "success" && r.startedAt && r.updatedAt).map((r) => Date.parse(r.updatedAt) - Date.parse(r.startedAt)).sort((a, b) => a - b);
const DUR = durs[Math.floor(durs.length / 2)] ?? 100_000;
const DUR_P90 = durs[Math.floor(durs.length * 0.9)] ?? DUR;
const arrivalsAll = [...runList("publication-watchdog.yml"), ...runList("mlb-daily-production.yml")]
  .filter((r) => r.headBranch === "main" && r.status === "completed").map((r) => Date.parse(r.updatedAt)).sort((a, b) => a - b);
const writerRuns = writerWorkflowFiles(path.join(REPO, ".github/workflows")).flatMap((wf) => runList(wf).filter((r) => r.startedAt && r.updatedAt).map((r) => ({ ...r, wf })));

const report = [];
for (const date of dates(FROM, TO)) {
  const sched = await statsapi(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}`, `schedule-${date}.json`);
  const { games: all } = normalizeSchedule(sched);
  const games = all.filter((g) => (!g.officialDate || g.officialDate === date) && !/postponed|cancel/i.test(g.detailedState ?? ""));
  const day = { date, games: [], scheduledRefreshRuns: 0, manualDispatches: 0 };
  report.push(day);
  if (!games.length) { day.note = "no MLB games"; console.log(`${date}: no games`); continue; }
  const obs = {};
  for (const g of games) obs[g.gamePk] = await upstreamObservations(date, g);
  const hist = simHistory(date);
  // What GTP's own refreshes captured is also an observation of upstream (at ≈ its in-run capture, before the commit).
  for (const g of games) for (const h of hist) {
    const t = h.t - DUR - 30_000;
    if (!(t < Date.parse(g.firstPitch))) continue;
    for (const side of ["away", "home"]) if (h.ids[g.gamePk]?.[side]) obs[g.gamePk].push({ t, src: "gtp-sim-commit", [side]: h.ids[g.gamePk][side] });
  }
  for (const g of games) obs[g.gamePk].sort((a, b) => a.t - b.t);
  const boardAt = firstCommitTime(`app/public/data/mlb/boards/${date}.json`);
  let boardFirstPitch = {};
  try { const b = JSON.parse(git(["show", `${REF}:app/public/data/mlb/boards/${date}.json`])); for (const g of b.games ?? []) boardFirstPitch[g.gamePk] = g.gameDate; } catch { /* none */ }
  const runsDay = refreshRunsAll.filter((r) => etDate(Date.parse(r.createdAt)) === date);
  day.scheduledRefreshRuns = runsDay.filter((r) => r.event === "schedule").length;
  day.manualDispatches = runsDay.filter((r) => r.event === "workflow_dispatch").length;
  day.firstScheduledRefresh = runsDay.filter((r) => r.event === "schedule").map((r) => Date.parse(r.createdAt)).filter((t) => t >= Date.parse(`${date}T12:00:00Z`)).sort((a, b) => a - b)[0];
  // the committed state when the slate's first window opens (from history), the waiter's starting point
  const open = Math.min(...games.map((g) => Date.parse(g.firstPitch))) - WAITER_LIMITS.MONITOR_LEAD_MIN * MIN;
  const initial = structuredClone(hist.filter((h) => h.t <= open).at(-1)?.committed ?? {});
  for (const pk of Object.keys(initial)) for (const s of ["away", "home"]) if (initial[pk][s]?.fingerprint) initial[pk][s] = { ...initial[pk][s] };
  const sim = simulateWaiter({ date, games, obs, boardAt, boardFirstPitch, refreshRuns: runsDay, writerRuns, arrivals: arrivalsAll, initialCommitted: initial, dur: DUR });
  day.waiter = { start: sim.start, arrival: sim.arrival, open: sim.open, dispatches: sim.dispatches, alerts: sim.alerts, cycles: sim.cycles, activeMin: sim.activeMin, shortRuns: sim.shortRuns };
  // builds today: commits of the simulation file that day that changed a lineup fingerprint (and all commits)
  const dayCommits = hist.filter((h) => etDate(h.t) === date || (h.t <= Math.max(...games.map((g) => Date.parse(g.firstPitch))) + 6 * 3600_000 && h.t >= Date.parse(`${date}T08:00:00Z`)));
  day.simCommits = dayCommits.length;
  day.lineupChangingCommits = dayCommits.filter((h) => h.lineupChange).length;
  day.waiterLineupBuilds = sim.changing.length;
  day.waiterLineupBuildsFromDispatch = sim.changing.filter((l) => l.kind === "waiter").length;
  // the same model with NO waiter (scheduled runs only) — validates the model against git
  const cronOnly = simulateWaiter({ date, games, obs, boardAt, boardFirstPitch, refreshRuns: runsDay, writerRuns: [], arrivals: [], initialCommitted: initial, dur: DUR, noWaiter: true });
  for (const g of games) {
    const first = Date.parse(g.firstPitch);
    const fpT = Date.parse(boardFirstPitch[g.gamePk] ?? g.firstPitch);
    const o = obs[g.gamePk];
    const row = { gamePk: g.gamePk, firstPitch: first, sides: {} };
    for (const side of ["away", "home"]) {
      const postedObs = o.find((x) => lineupFingerprint(x[side]));
      const final = stateAt(o, first - 1);
      const finalFp = lineupFingerprint(final?.[side]);
      const fps = [...new Set(o.map((x) => lineupFingerprint(x[side])).filter(Boolean))];
      // TODAY (git): first commit before first pitch whose committed fingerprint equals the final pre-pitch nine
      const actualHit = hist.find((h) => h.t < first && finalFp && h.committed[g.gamePk]?.[side]?.fingerprint === finalFp);
      const actualAny = hist.find((h) => h.t < first && h.committed[g.gamePk]?.[side]?.fingerprint);
      // WAITER: first landing before first pitch after which the committed state carries the final nine
      const wl = sim.landings.filter((l) => l.land < first).sort((a, b) => a.land - b.land).find((l) => finalFp && sim.committedAt(l.land)[g.gamePk]?.[side]?.fingerprint === finalFp);
      const cl = cronOnly.landings.filter((l) => l.land < first).sort((a, b) => a.land - b.land).find((l) => finalFp && cronOnly.committedAt(l.land)[g.gamePk]?.[side]?.fingerprint === finalFp);
      row.sides[side] = {
        postedAt: postedObs?.t ?? NaN, postedSrc: postedObs?.src ?? null, lineupVersions: fps.length, finalFp,
        actualAt: actualHit?.t ?? NaN, actualAnyAt: actualAny?.t ?? NaN, modelCronOnlyAt: cl?.land ?? NaN,
        waiterAt: wl?.land ?? NaN, boardFirstPitch: fpT,
      };
    }
    day.games.push(row);
  }
  console.log(`${date}: ${games.length} game(s) · waiter dispatches ${sim.dispatches.length} · cycles ${sim.cycles} · StatsAPI calls so far ${calls}`);
}

// ── REPLAY.md ─────────────────────────────────────────────────────────────────────────────────────────────────
const sides = report.flatMap((d) => d.games.flatMap((g) => ["away", "home"].map((s) => ({ date: d.date, gamePk: g.gamePk, side: s, first: g.firstPitch, ...g.sides[s] }))));
const covered = (k) => sides.filter((s) => s.finalFp && Number.isFinite(s[k]) && s[k] < s.first).length;
const posted = sides.filter((s) => s.finalFp).length;
const lagMin = (k) => sides.filter((s) => Number.isFinite(s[k]) && Number.isFinite(s.postedAt)).map((s) => (s[k] - s.postedAt) / MIN).sort((a, b) => a - b);
const med = (a) => (a.length ? a[Math.floor(a.length / 2)] : NaN);
const leadMin = (k) => sides.filter((s) => Number.isFinite(s[k])).map((s) => (s.first - s[k]) / MIN).sort((a, b) => a - b);
const tot = (f) => report.reduce((n, d) => n + (f(d) ?? 0), 0);
const lines = [];
const P = (s = "") => lines.push(s);
P(`# MLB lineup waiter — historical replay ${FROM} → ${TO}`);
P();
P(`Generated ${iso(Date.now())} by \`app/scripts/ops/replay-mlb-lineup-waiter.mjs\` (read-only; git ref \`${REF}\`). StatsAPI calls this run: ${calls} (responses cached under \`raw/\`).`);
P();
P("## Summary");
P();
P(`| | today (git history) | with the waiter (replayed) |`);
P(`|---|---|---|`);
P(`| sides with a confirmed nine posted before first pitch | ${posted} | ${posted} |`);
P(`| …published in a simulation built from the FINAL pre-pitch nine, before first pitch | **${covered("actualAt")} / ${posted}** | **${covered("waiterAt")} / ${posted}** |`);
P(`| median minutes from upstream post (upper bound) to that simulation | ${Math.round(med(lagMin("actualAt")))} | ${Math.round(med(lagMin("waiterAt")))} |`);
P(`| median minutes of lead before first pitch | ${Math.round(med(leadMin("actualAt")))} | ${Math.round(med(leadMin("waiterAt")))} |`);
P(`| refresh dispatches | ${tot((d) => d.manualDispatches)} manual | ${tot((d) => d.waiter?.dispatches.length)} by the waiter (manual removed) |`);
P(`| waiter runner-minutes per slate day (mean; excludes ≤1-min early exits) | — | ${Math.round(tot((d) => d.waiter?.activeMin) / Math.max(1, report.filter((d) => d.games.length).length))} |`);
P(`| lineup-driven simulation builds (commits that changed a committed nine) | ${tot((d) => d.lineupChangingCommits)} of ${tot((d) => d.simCommits)} simulation commits | ${tot((d) => d.waiterLineupBuilds)} (${tot((d) => d.waiterLineupBuildsFromDispatch)} landed by a waiter dispatch) |`);
P();
P(`Model check: replaying the SCHEDULED runs alone (no waiter) through the same model puts the final nine in the simulation before first pitch for ${covered("modelCronOnlyAt")} / ${posted} sides, against ${covered("actualAt")} / ${posted} in git (manual dispatches account for the difference where they exist).`);
P();
P(`Waiter horizon: ${LIMITS.HORIZON_MIN} min (an arrival further than this before the first window exits and leaves the watch to a later trigger).`);
P();
P(`Refresh duration used for a dispatched run: median ${Math.round(DUR / 1000)} s (p90 ${Math.round(DUR_P90 / 1000)} s) over ${durs.length} successful mlb-lineup-refresh runs.`);
P();
P("## Per slate");
P();
P("| date | games | first trigger | waiter watch starts | sched. refresh runs (first ≥12Z) | manual | waiter dispatches (UTC) | alerts | sim commits / lineup builds | waiter lineup builds | waiter runner-min (+ short runs) |");
P("|---|---|---|---|---|---|---|---|---|---|---|");
for (const d of report) {
  if (!d.games.length) { P(`| ${d.date} | 0 | | | | | | | | | ${d.note ?? ""} |`); continue; }
  P(`| ${d.date} | ${d.games.length} | ${hm(d.waiter.arrival)} | ${hm(d.waiter.start)} | ${d.scheduledRefreshRuns} (${hm(d.firstScheduledRefresh)}) | ${d.manualDispatches} | ${d.waiter.dispatches.map((x) => hm(x.t)).join(", ") || "—"} | ${d.waiter.alerts.length} | ${d.simCommits} / ${d.lineupChangingCommits} | ${d.waiterLineupBuilds} | ${Math.round(d.waiter.activeMin)} (+${d.waiter.shortRuns}) |`);
}
P();
P("## Per side");
P();
P("Times UTC. *posted* = earliest observation of a full nine (StatsAPI change timecode or GTP capture archive) — an upper bound on the real post time. *today* = first commit of the simulation carrying the final pre-pitch nine. *waiter* = when the replayed waiter's (or a scheduled) refresh would have landed it. *versions* = distinct nines seen pregame (>1 = a late change).");
P();
P("| date | game | side | first pitch | posted (source) | versions | today | lead today | waiter | lead waiter |");
P("|---|---|---|---|---|---|---|---|---|---|");
for (const s of sides) {
  const lead = (k) => (Number.isFinite(s[k]) && s[k] < s.first ? `${Math.round((s.first - s[k]) / MIN)} min` : "**missed**");
  P(`| ${s.date} | ${s.gamePk} | ${s.side} | ${hm(s.first)} | ${hm(s.postedAt)} (${s.postedSrc ?? "never"}) | ${s.lineupVersions} | ${hm(s.actualAt)} | ${s.finalFp ? lead("actualAt") : "n/a"} | ${hm(s.waiterAt)} | ${s.finalFp ? lead("waiterAt") : "n/a"} |`);
}
P();
P("## Alerts the waiter would have raised");
P();
const allAlerts = report.flatMap((d) => (d.waiter?.alerts ?? []).map((a) => `- ${d.date} ${hm(a.t)} — ${a.message}`));
P(allAlerts.length ? allAlerts.join("\n") : "- none");
fs.writeFileSync(path.join(OUT, "replay.json"), JSON.stringify({ from: FROM, to: TO, ref: REF, durMs: DUR, report, sides }, null, 1));
fs.writeFileSync(path.join(OUT, "REPLAY.generated.md"), lines.join("\n") + "\n");
console.log(`wrote ${path.join(OUT, "REPLAY.generated.md")} and replay.json · StatsAPI calls ${calls}`);
