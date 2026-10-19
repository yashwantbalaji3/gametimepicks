#!/usr/bin/env node
/**
 * REPLAY of the NBA post-final waiter against RECORDED FIXTURES — read-only, offline, no network, no gh.
 *
 *   node app/scripts/ops/replay-nba-finals-waiter.mjs                      # opening night, waiter from 22:05Z
 *   node app/scripts/ops/replay-nba-finals-waiter.mjs --start 2026-10-20T19:00:00Z --out <dir>
 *
 * THE WORLD (fixtures under app/scripts/ops/fixtures/nba-finals-waiter/):
 *   ESPN      the REAL day scoreboard for 2026-10-20 (recorded 2026-10-19: BOS@DET 19:00Z, PHI@NY 23:00Z, OKC@SA
 *             01:30Z) driven through a SYNTHETIC in-game timeline (statuses, final times, scores) — the day form the
 *             waiter polls, and the month form the refresh reads, lagging per game by `monthLagSec`.
 *   CRONS     the nba-results-refresh runs GitHub ACTUALLY delivered on the night of 2026-10-17 (gh run list), shifted
 *             +3 days onto opening night: the cron/watchdog-only counterfactual, and the background in both worlds.
 *   REFRESH   a run in the `nba-results-refresh` group starts when the group is free, captures the month scoreboard
 *             ~20 s in and lands (commits) at its measured duration; a capture that shows a game FINAL records it.
 *   WAITER    the real decider + the runner's own gather/confirm/observation code (scripts/ops/nba-finals-waiter.mjs)
 *             with injected ESPN/gh/committed-state seams, polling on its own waits, relaying at the 330-min budget
 *             (a 60 s gap). The ledger carries across the relay (as the runner recovers it from run logs).
 *
 * Prints a markdown report (and writes it with replay.json under --out, refused under app/public/data or data/).
 * Exits 1 if any game drew more than one waiter dispatch.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { WAITER, committedFinals, finalFingerprint, isFinalStatus, normalizeScoreboard } from "../../src/lib/ops/nba-finals-waiter.mjs";
import { gatherInputs, decideWith, recordObservations, emptyLedger } from "./nba-finals-waiter.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../..");
export const FIXTURES = path.join(HERE, "fixtures/nba-finals-waiter");
const MIN = 60_000;
const iso = (t) => new Date(t).toISOString().replace(".000Z", "Z");
const hm = (t) => (Number.isFinite(t) ? new Date(t).toISOString().slice(11, 16) + "Z" : "—");

export function loadFixtures(dir = FIXTURES) {
  const read = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  return {
    scheduled: read("espn-nba-day-20261020.recorded.json"),
    timeline: read("synthetic-opening-night-2026-10-20.json"),
    cronNight: read("nba-results-refresh-runs-2026-10-17-night.recorded.json"),
  };
}

/** ESPN's payload at instant t (day form: lag 0; month form: each game's monthLagSec). */
export function snapshotAt(scheduled, timeline, t, { month = false } = {}) {
  const out = structuredClone(scheduled);
  for (const e of out.events ?? []) {
    const g = timeline.games?.[String(e.id)];
    if (!g) continue;
    const lag = month ? (g.monthLagSec ?? 0) * 1000 : 0;
    const st = g.states.filter((s) => Date.parse(s.at) + lag <= t).at(-1);
    if (!st) continue;
    const final = isFinalStatus(st.status);
    e.status = { ...(e.status ?? {}), type: { ...(e.status?.type ?? {}), name: st.status, state: final ? "post" : "in", completed: final } };
    for (const c of e.competitions?.[0]?.competitors ?? []) c.score = String(c.homeAway === "home" ? st.home : st.away);
  }
  return out;
}

/**
 * Replay one night. Returns per-game publish times (cron-only vs with the waiter), the waiter's dispatches, alerts,
 * ESPN calls and the commits (= Vercel builds) in each world.
 */
export async function replayNight({ fixtures = loadFixtures(), start = "2026-10-20T22:05:00Z", shiftDays = 3, refreshSeconds = 70, budgetMin = 330, withWaiter = true, maxCycles = 2000, failDispatched = 0 } = {}) {
  const { scheduled, timeline } = fixtures;
  const night = timeline.night;
  const shift = shiftDays * 86_400_000;
  const startMs = Date.parse(start);
  // ── the refresh group: every run, in creation order, one at a time ──
  const runs = []; // { databaseId, created, started, end, event, conclusion, captureAt }
  const addRun = (created, event, conclusion = "success") => {
    const prevEnd = Math.max(0, ...runs.map((r) => r.end));
    const started = Math.max(created + 10_000, prevEnd + 5_000);
    const r = { databaseId: `${event === "workflow_dispatch" ? "W" : "C"}${runs.length + 1}`, created, started, end: started + refreshSeconds * 1000, event, conclusion, captureAt: started + 20_000 };
    runs.push(r);
    return r;
  };
  for (const r of fixtures.cronNight.runs) addRun(Date.parse(r.createdAt) + shift, r.event);
  runs.sort((a, b) => a.created - b.created);
  // recompute starts in order (the group serialises them)
  const reflow = () => { let free = 0; for (const r of runs.sort((a, b) => a.created - b.created)) { r.started = Math.max(r.created + 10_000, free + 5_000); r.end = r.started + refreshSeconds * 1000; r.captureAt = r.started + 20_000; free = r.end; } };
  reflow();
  const recordedAt = () => {
    const out = {};
    for (const r of runs.slice().sort((a, b) => a.end - b.end)) {
      if (r.conclusion !== "success") continue;
      for (const g of normalizeScoreboard(snapshotAt(scheduled, timeline, r.captureAt, { month: true }))) {
        if (isFinalStatus(g.statusName) && out[g.eventId] == null) out[g.eventId] = { at: r.end, by: r.databaseId };
      }
    }
    return out;
  };
  const committedAt = (t) => {
    const rec = recordedAt();
    const finals = Object.entries(rec).filter(([, v]) => v.at <= t).map(([id]) => ({ providerEventId: id }));
    return committedFinals({ finals, conflicts: [], refused: [] });
  };
  const runsAt = (t) => runs.filter((r) => r.created <= t).map((r) => ({
    databaseId: r.databaseId, createdAt: iso(r.created), updatedAt: iso(Math.min(r.end, t)), event: r.event,
    status: r.end <= t ? "completed" : (r.started <= t ? "in_progress" : "queued"), conclusion: r.end <= t ? r.conclusion : null,
  }));
  const cronOnly = recordedAt();

  // ── the waiter ──
  let calls = { day: 0, month: 0 };
  const dispatches = [];
  const alerts = [];
  const log = [];
  const ledger = emptyLedger();
  let t = startMs;
  let runStart = startMs;
  let relays = 0;
  let stop = "NO_WAITER";
  if (withWaiter) {
    stop = "CYCLES";
    for (let cycle = 0; cycle < maxCycles; cycle++) {
      if (t - runStart >= budgetMin * MIN) { relays++; t += MIN; runStart = t; log.push(`${iso(t)} relay → fresh run`); }
      const api = {
        day: async () => { calls.day++; return snapshotAt(scheduled, timeline, t); },
        refreshWindow: async () => { calls.month++; return snapshotAt(scheduled, timeline, t, { month: true }); },
      };
      const gh = { refreshRuns: () => runsAt(t) };
      const base = await gatherInputs({ nowIso: iso(t), date: night, api, gh, readCommitted: () => ({ committed: committedAt(t), scheduleTips: null }) });
      const d = await decideWith(base, { api, ledger });
      recordObservations(d, ledger, { dryRun: true });
      for (const a of d.alerts) { ledger.alerted.push(a.key); alerts.push({ t, ...a }); }
      log.push(`${iso(t)} ${d.decision}${d.next ? `→${d.next}` : ""} · ${d.reasons.join("; ")}`);
      const next = d.decision === WAITER.ALERT ? d.next : d.decision;
      if (next === WAITER.DONE) { stop = "DONE"; break; }
      if (d.leaveToLaterTrigger) { stop = "LATER"; break; }
      if (d.decision === WAITER.DISPATCH) {
        const r = addRun(t + 5_000, "workflow_dispatch", dispatches.length < failDispatched ? "cancelled" : "success");
        reflow();
        ledger.dispatches.push({ at: iso(t), fingerprint: d.fingerprint, sides: d.owed });
        dispatches.push({ t, owed: d.owed, run: r.databaseId });
        // waitForRefresh: 45 s to register, then a poll each minute until the refresh completes.
        let w = t + 45_000;
        while (w < r.end) w += MIN;
        t = w;
        continue;
      }
      t += Math.max(30, d.waitSeconds || 300) * 1000;
    }
  }
  const withW = recordedAt();
  const games = scheduled.events.map((e) => {
    const id = String(e.id);
    const tl = timeline.games[id];
    const fin = tl?.states.find((s) => isFinalStatus(s.status));
    const espnFinal = fin ? Date.parse(fin.at) : NaN;
    const g = normalizeScoreboard(snapshotAt(scheduled, timeline, espnFinal + 1)).find((x) => x.eventId === id);
    const key = g ? `${id}:${finalFingerprint(g)}` : null;
    return {
      eventId: id, label: tl?.label ?? e.shortName, tip: e.date, espnFinal, monthFinal: espnFinal + (tl?.monthLagSec ?? 0) * 1000,
      cronOnly: cronOnly[id]?.at ?? NaN, cronOnlyBy: cronOnly[id]?.by ?? null,
      withWaiter: withW[id]?.at ?? NaN, withWaiterBy: withW[id]?.by ?? null,
      waiterDispatches: dispatches.filter((x) => x.owed.includes(key)).length,
    };
  });
  const commits = (rec) => new Set(Object.values(rec).map((v) => v.by)).size;
  return { night, start, stop, relays, games, dispatches, alerts, calls, log, commitsCronOnly: commits(cronOnly), commitsWithWaiter: commits(withW), runs: runs.length };
}

export function renderReport(r) {
  const L = [];
  const P = (s = "") => L.push(s);
  const lag = (a, b) => (Number.isFinite(a) && Number.isFinite(b) ? `${Math.round((a - b) / MIN)} min` : "never");
  P(`# NBA finals waiter — replay of a synthetic opening night (${r.night})`);
  P();
  P(`Waiter starts ${r.start}; stopped ${r.stop} after ${r.relays} relay(s). ESPN calls: ${r.calls.day} day + ${r.calls.month} month. Waiter dispatches: ${r.dispatches.length} (${r.dispatches.map((d) => hm(d.t)).join(", ") || "none"}).`);
  P(`Commits that recorded a final (each is one Vercel Production build — app/public/data is a build input): cron/watchdog only ${r.commitsCronOnly} · with the waiter ${r.commitsWithWaiter}.`);
  P();
  P("| game | tip | final on ESPN | recorded, crons only | after final | recorded, with waiter | after final | waiter dispatches |");
  P("|---|---|---|---|---|---|---|---|");
  for (const g of r.games) P(`| ${g.eventId} ${g.label} | ${hm(Date.parse(g.tip))} | ${hm(g.espnFinal)} | ${hm(g.cronOnly)} (${g.cronOnlyBy ?? "—"}) | ${lag(g.cronOnly, g.espnFinal)} | ${hm(g.withWaiter)} (${g.withWaiterBy ?? "—"}) | ${lag(g.withWaiter, g.espnFinal)} | ${g.waiterDispatches} |`);
  P();
  P("## Alerts the waiter would have raised");
  P();
  P(r.alerts.length ? r.alerts.map((a) => `- ${hm(a.t)} ${a.message}`).join("\n") : "- none");
  return L.join("\n") + "\n";
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
  const out = arg("--out", null);
  const r = await replayNight({ start: arg("--start", "2026-10-20T22:05:00Z") });
  const md = renderReport(r);
  process.stdout.write(md);
  if (out) {
    const OUT = path.resolve(out);
    for (const forbidden of [path.join(REPO, "app/public/data"), path.join(REPO, "data")]) {
      if (OUT === forbidden || OUT.startsWith(forbidden + path.sep)) { console.error(`REFUSED: --out ${OUT} is under ${forbidden}`); process.exit(2); }
    }
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, "REPLAY.generated.md"), md);
    fs.writeFileSync(path.join(OUT, "replay.json"), JSON.stringify(r, null, 1));
  }
  const over = r.games.filter((g) => g.waiterDispatches > 1);
  if (over.length) { console.error(`FAIL: more than one dispatch for ${over.map((g) => g.eventId).join(", ")}`); process.exit(1); }
}
