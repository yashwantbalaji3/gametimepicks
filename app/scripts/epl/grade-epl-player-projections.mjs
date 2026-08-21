#!/usr/bin/env node
/**
 * GRADE EPL PLAYER PROJECTIONS — record what each published player probability was worth.
 *
 *   node scripts/epl/grade-epl-player-projections.mjs [--write]
 *
 * Player projections went live publishing and never learning: the team forecasts have been graded
 * since they existed, and the player side had none of it. That is the exact shape this repo keeps
 * finding, and I introduced it myself a few commits ago.
 *
 * THE RULE THAT MAKES THIS HONEST rather than flattering: a conditional prediction is VOID when its
 * condition did not hold. "If he starts" against a substitute is not a miss — the model said nothing
 * about that situation, and scoring it would punish the model for refusing to guess a lineup. Voids
 * are recorded with their reason so the population always reconciles; they are never dropped.
 *
 * Results come from ESPN, the same free host the projections and the corpus already use, and only a
 * match ESPN reports COMPLETED is read. Append-only: a graded row is immutable, because this runs
 * daily against a cumulative record.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { indexProjections, gradePlayerProjections, classifyEmptyRun, summarisePlayerGrades } from "../../src/lib/sports/epl/grade-player-projections.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PUBLIC_EPL = path.join(APP, "public/data/soccer/epl");
const PROJ_DIR = path.join(PUBLIC_EPL, "player-projections");
const LEDGER = path.join(PUBLIC_EPL, "results/graded-player-projections.jsonl");
const WRITE = process.argv.includes("--write");

const SITE = "https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1";
const get = async (url) => {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

/* ── Every immutable snapshot. `latest.json` is deliberately NOT read: it is a moving pointer, and a
      graded row must cite a file whose contents cannot change under it. ─────────────────────────── */
if (!fs.existsSync(PROJ_DIR)) { console.error("no projection snapshots — nothing to grade"); process.exit(2); }
const snapshots = fs.readdirSync(PROJ_DIR)
  .filter((f) => /^snapshot-\d{12}\.json$/.test(f))
  .sort()
  .map((f) => {
    const doc = JSON.parse(fs.readFileSync(path.join(PROJ_DIR, f), "utf8"));
    return { file: f, generatedAt: doc.generatedAt, fixtures: doc.fixtures ?? [] };
  });
if (snapshots.length === 0) { console.error("no immutable snapshots yet — nothing to grade"); process.exit(2); }

const { byFixture, refused } = indexProjections(snapshots);
console.log(`${snapshots.length} snapshot(s) · ${byFixture.size} fixture(s) with a pre-kickoff projection of record`);
if (refused.length > 0) console.log(`  ${refused.length} refused (at/after kickoff or unparseable)`);

/** Already-graded keys. Append-only: these are never recomputed. */
const alreadyGraded = new Set();
if (fs.existsSync(LEDGER)) {
  for (const line of fs.readFileSync(LEDGER, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { alreadyGraded.add(JSON.parse(line).key); } catch { /* a malformed line is not a grade */ }
  }
}

/* ── Actual results, per fixture, from ESPN ──────────────────────────────────────────────────── */
const now = Date.now();
const actuals = new Map();
let finishedFixtures = 0;

for (const [slug, rec] of byFixture) {
  /* Nothing to fetch before kickoff — this is the common case and costs no request. */
  if (Date.parse(rec.fixture.kickoffUtc) > now) continue;

  const date = String(rec.fixture.kickoffUtc).slice(0, 10).replace(/-/g, "");
  let eventId = rec.fixture.espnEventId ?? null;
  if (!eventId) {
    try {
      const board = await get(`${SITE}/scoreboard?dates=${date}`);
      const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z]/g, "");
      const hit = (board.events ?? []).find((ev) => {
        const c = ev.competitions?.[0];
        const h = norm(c?.competitors?.find((x) => x.homeAway === "home")?.team?.displayName);
        const a = norm(c?.competitors?.find((x) => x.homeAway === "away")?.team?.displayName);
        return (h.includes(norm(rec.fixture.homeClub)) || norm(rec.fixture.homeClub).includes(h))
          && (a.includes(norm(rec.fixture.awayClub)) || norm(rec.fixture.awayClub).includes(a));
      });
      eventId = hit ? String(hit.id) : null;
    } catch { /* an unreachable board is an ungraded fixture, never a guessed one */ }
  }
  if (!eventId) continue;

  let sum;
  try { sum = await get(`${SITE}/summary?event=${eventId}`); } catch { continue; }

  /* Only a match ESPN reports COMPLETED. Anything else quarantines by simply not being recorded. */
  const completed = sum.header?.competitions?.[0]?.status?.type?.completed === true;
  if (!completed) continue;
  finishedFixtures += 1;

  const players = [];
  for (const t of sum.rosters ?? []) {
    for (const p of t.roster ?? []) {
      const st = {};
      for (const s of p.stats ?? []) st[s.abbreviation ?? s.name] = Number(s.value ?? 0);
      players.push({
        playerId: String(p.athlete?.id ?? ""),
        name: p.athlete?.displayName ?? null,
        started: p.starter === true,
        subbedIn: p.subbedIn === true,
        goals: st.G ?? 0,
      });
    }
  }
  if (players.length === 0) continue;                       // completed but no roster ⇒ nothing to grade
  actuals.set(slug, { status: "FULL_TIME", players });
}

/* ── Grade ───────────────────────────────────────────────────────────────────────────────────── */
const { graded, voided, skipped } = gradePlayerProjections({ projections: byFixture, actuals, alreadyGraded });

console.log(`\nfinished fixtures with results: ${finishedFixtures}`);
console.log(`  NEWLY GRADED: ${graded.length}   VOIDED: ${voided.length}   skipped: ${JSON.stringify(skipped)}`);

if (graded.length > 0) {
  const s = summarisePlayerGrades(graded);
  console.log(`  this run — n ${s.n} · hits ${s.hits} · logLoss ${s.logLoss} · brier ${s.brier}`);
  console.log(`  predicted ${s.predictedScorers} scorers, observed ${s.observedScorers}`);
  for (const g of graded.filter((g) => g.outcome === "HIT").slice(0, 8)) {
    console.log(`    HIT  ${String(g.playerName).padEnd(24)} ${(g.probability * 100).toFixed(1)}% · ${g.matchup}`);
  }
}

if (graded.length === 0) {
  const state = classifyEmptyRun({ finishedFixtures, gradedCount: 0, voidedCount: voided.length, alreadyGradedCount: alreadyGraded.size });
  const say = {
    NO_FINISHED_FIXTURES: "no projected fixture has finished yet — the correct answer before a matchday completes",
    NOTHING_NEW: "every finished fixture is already in the ledger",
    ALL_VOID: "fixtures finished but no projection's condition held — legitimate before lineups, since only the eleven who start can be graded",
  }[state];
  if (say) {
    console.log(`\n  ${state} — ${say}`);
  } else {
    console.error(`\n  REFUSED — ${finishedFixtures} fixture(s) finished and NOTHING joined: no grades and no voids.`);
    console.error(`  That is a broken join, not a quiet matchday. Check playerId agreement between the`);
    console.error(`  projection snapshots and the ESPN result rosters before trusting any player record.`);
    process.exit(3);
  }
}

if (WRITE && (graded.length > 0 || voided.length > 0)) {
  fs.mkdirSync(path.dirname(LEDGER), { recursive: true });
  /* Voids are written too: a population that only records its scorable half never reconciles. */
  const rows = [...graded, ...voided].filter((r) => !alreadyGraded.has(r.key));
  fs.appendFileSync(LEDGER, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  console.log(`\nappended ${rows.length} row(s) (${graded.length} graded, ${voided.length} void) to ${path.relative(APP, LEDGER)}`);
} else if (!WRITE) {
  console.log(`\ndry run — pass --write to append.`);
}
