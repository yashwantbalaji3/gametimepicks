#!/usr/bin/env node
/**
 * THE SUNDAY OPERATOR TRACE — one command, one question:
 *
 *   "Did the real game move cleanly from pregame → live → provisional final → canonical final
 *    → Results?"
 *
 * Usage:
 *   node app/scripts/ops/nfl-lifecycle-trace.mjs                      # today (ET)
 *   node app/scripts/ops/nfl-lifecycle-trace.mjs --date 2026-09-27
 *   node app/scripts/ops/nfl-lifecycle-trace.mjs --event 401872953
 *   node app/scripts/ops/nfl-lifecycle-trace.mjs --date 2026-09-27 --json
 *   node app/scripts/ops/nfl-lifecycle-trace.mjs --now 2026-09-27T21:30:00Z   # trace AS of an instant
 *
 * ⚠ READ-ONLY. No provider call, no write, no refetch. It reads the committed artifacts and nothing
 * else — because a harness that refetches can quietly make a recorded result agree with the present,
 * and that is the one thing an acceptance harness must never do.
 *
 * EXIT CODES
 *   0  CLEAN or IN_FLIGHT or NO_GAMES — nothing for an operator to do
 *   1  ATTENTION — at least one stage is MISSING or INCONSISTENT
 *   2  the trace itself could not run (a path that should exist does not)
 *
 * The stage logic lives in app/src/lib/sports/nfl/lifecycle-trace.mjs and is tested there against
 * synthetic slates, so the rules are exercised without waiting for a Sunday.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { traceGame, foldTraces, STAGES } from "../../src/lib/sports/nfl/lifecycle-trace.mjs";

// Node 20.4 has no import.meta.dirname.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..", "..");
const P = {
  schedule: path.join(ROOT, "app/public/data/nfl/schedule/latest.json"),
  results: path.join(ROOT, "app/public/data/nfl/results/latest.json"),
  boards: path.join(ROOT, "app/public/data/nfl/player-board"),
  live: path.join(ROOT, "app/public/data/nfl/live-props"),
  settlement: path.join(ROOT, "data/internal/nfl/prop-settlement"),
  graded: path.join(ROOT, "app/public/data/nfl/graded-picks.json"),
};

const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const flag = (k) => argv.includes(`--${k}`);

const NOW = arg("now") ?? new Date().toISOString();
const JSON_OUT = flag("json");
const ONE_EVENT = arg("event");

/**
 * The set of live-props artifacts git actually TRACKS, as `<eventId>` strings.
 *
 * ⚠ WHY THIS COMMAND AND NOT A `fs.existsSync`. This trace's contract is "committed artifacts only",
 * and a local producer run leaves files on disk that satisfy `existsSync` while belonging to no
 * commit. `git ls-files` is the only reading of "committed" that the contract's wording can mean.
 *
 * Returns null — meaning "not determined" — when git cannot answer (no repository, no git binary, a
 * tarball checkout). Null is NOT false: an unanswerable question must not accuse a real artifact.
 */
function trackedLiveEventIds() {
  const tracked = gitList(["ls-files", "-z", "--", "app/public/data/nfl/live-props"]);
  return tracked === null ? null : new Set(tracked.map((f) => path.basename(f, ".json")));
}

/** A git plumbing read that answers null — "not determined" — rather than throwing or guessing. */
function gitList(args) {
  try {
    const out = execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return out.split("\0").filter(Boolean);
  } catch {
    return null;
  }
}

/**
 * Files present under a trace input path that belong to no commit.
 *
 * The same shadow class as `liveCommitted`, reported as a banner rather than a stage because these
 * paths feed stages whose semantics are settlement's, not this trace's, to change.
 */
function untrackedUnder(repoRelDir) {
  return gitList(["ls-files", "-z", "--others", "--exclude-standard", "--", repoRelDir]);
}

function readJson(p, fallback = null) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return fallback; }
}

/** The ET calendar day an instant falls on, which is how this product dates a slate. */
function etDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

const DATE = arg("date") ?? etDate(NOW);

const schedule = readJson(P.schedule);
const resultRows = readJson(P.results)?.rows ?? [];
if (!schedule?.rows && resultRows.length === 0) {
  console.error(`cannot trace: no schedule at ${path.relative(ROOT, P.schedule)}`);
  process.exit(2);
}

// ── WHICH GAMES ──────────────────────────────────────────────────────────────────────────────────
// The PROVIDER decides the slate, not our boards. If the slate came from our own boards, a game we
// never built a board for would be invisible — and that is precisely the failure this is for.
//
// ⚠ AND IT TAKES BOTH FEEDS. `schedule/latest.json` is a FORWARD window: the first draft of this
// read it alone, asked about Thursday's completed game, and answered NO_GAMES — the game had simply
// aged out of the capture. A rolling window is not a season. `results/latest.json` carries the
// backward tail, so the slate is the union and a game cannot hide in the gap between them.
const byId = new Map();
for (const r of [...(schedule?.rows ?? []), ...resultRows]) {
  const k = String(r.providerEventId);
  // Later wins: the results capture carries the final score and the terminal status.
  byId.set(k, { ...(byId.get(k) ?? {}), ...r });
}
const allEvents = [...byId.values()];
let events = allEvents.filter((r) => etDate(r.dateUtc) === DATE);
if (ONE_EVENT) events = allEvents.filter((r) => String(r.providerEventId) === ONE_EVENT);
events.sort((a, b) => String(a.dateUtc).localeCompare(String(b.dateUtc)) || String(a.shortName).localeCompare(String(b.shortName)));

/* With --event the slate label must be the EVENT's date, not today's — a header naming the wrong day
   is the kind of small lie that makes an operator distrust the rest of the output. */
const LABEL_DATE = ONE_EVENT ? (etDate(events[0]?.dateUtc) ?? DATE) : DATE;

const graded = readJson(P.graded)?.picks ?? [];
const inResults = new Set([
  ...resultRows.filter((r) => r.statusRaw === "STATUS_FINAL").map((r) => String(r.providerEventId)),
  ...graded.map((p) => String(p.eventId ?? "").replace(/^nfl-/, "")),
]);

const settlementByEvent = new Map();
if (fs.existsSync(P.settlement)) {
  for (const f of fs.readdirSync(P.settlement).filter((f) => f.endsWith(".json"))) {
    for (const r of readJson(path.join(P.settlement, f))?.rows ?? []) {
      const k = String(r.eventId);
      if (!settlementByEvent.has(k)) settlementByEvent.set(k, []);
      settlementByEvent.get(k).push(r);
    }
  }
}

const trackedLive = trackedLiveEventIds();

/*
 * ⚠ THE SHADOW BANNER. This trace promises "committed artifacts only" and then reads a filesystem.
 * A local producer run leaves artifacts that are indistinguishable on disk from the bot's, and they
 * are worse than cosmetic: the bot commits these exact filenames, so an untracked one makes the next
 * `git pull` abort with "untracked working tree files would be overwritten" — on Sunday morning,
 * reproduced 2026-09-26. The live-props case is a per-game stage; the settlement ledger is here.
 */
const shadowSettlement = untrackedUnder("data/internal/nfl/prop-settlement") ?? [];
if (shadowSettlement.length > 0 && !JSON_OUT) {
  console.log(`\n!! ${shadowSettlement.length} UNCOMMITTED file(s) under data/internal/nfl/prop-settlement/ —`);
  console.log(`   a local shadow, not committed evidence. Remove them before the next pull:`);
  for (const f of shadowSettlement.slice(0, 5)) console.log(`     ${f}`);
}

const traces = events.map((ev) => traceGame({
  providerEventId: ev.providerEventId,
  matchup: ev.shortName,
  kickoffUtc: ev.dateUtc,
  board: readJson(path.join(P.boards, `${ev.providerEventId}.json`)),
  live: readJson(path.join(P.live, `${ev.providerEventId}.json`)),
  liveCommitted: trackedLive === null ? null : trackedLive.has(String(ev.providerEventId)),
  settlementRows: settlementByEvent.get(String(ev.providerEventId)) ?? [],
  inResults: inResults.has(String(ev.providerEventId)),
  now: NOW,
}));

const fold = foldTraces(traces);

if (JSON_OUT) {
  console.log(JSON.stringify({ artifact: "nfl-lifecycle-trace", date: LABEL_DATE, now: NOW, ...fold }, null, 2));
} else {
  const MARK = { OK: "✓", NOT_YET: "·", MISSING: "✗", INCONSISTENT: "!" };
  console.log(`NFL LIFECYCLE TRACE · slate ${LABEL_DATE} · as of ${NOW}`);
  console.log(`(✓ done  · not yet  ✗ missing  ! inconsistent)\n`);
  if (fold.state === "NO_GAMES") {
    console.log(`NO_GAMES — the schedule has no NFL game on ${LABEL_DATE}. Nothing to trace; this is a result, not a gap.`);
  } else {
    const w = Math.max(...STAGES.map((s) => s.length));
    for (const t of traces) {
      console.log(`${t.matchup ?? t.providerEventId}  (${t.providerEventId})  kickoff ${t.kickoffUtc}  → ${t.verdict}`);
      for (const s of t.stages) console.log(`   ${MARK[s.state]} ${s.stage.padEnd(w)}  ${s.note}`);
      console.log();
    }
    console.log(`SLATE: ${fold.state} — ${fold.games} game(s): ${fold.clean} clean, ${fold.inFlight} in flight, ${fold.attention} needing attention`);
    if (fold.attention > 0) {
      console.log(`\nACT ON THESE:`);
      for (const t of traces.filter((x) => x.verdict === "ATTENTION")) {
        for (const s of t.stages.filter((x) => x.state === "MISSING" || x.state === "INCONSISTENT")) {
          console.log(`  ${t.matchup} · ${s.stage} · ${s.state}: ${s.note}`);
        }
      }
    }
  }
}

process.exit(fold.state === "ATTENTION" ? 1 : 0);
