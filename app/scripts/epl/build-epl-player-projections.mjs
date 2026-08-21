#!/usr/bin/env node
/**
 * BUILD EPL PLAYER PROJECTIONS — the anytime-goalscorer product, from the model that cleared its bars.
 *
 *   node scripts/epl/build-epl-player-projections.mjs --now <iso> [--write]
 *
 * WHAT MAY BE PUBLISHED, AND WHY IT IS EXACTLY THIS.
 *
 * The preregistration's population is players who APPEARED — every bar was measured on that
 * population, conditioned on participation state. So the quantity this model is licensed to publish
 * is P(scores | he plays in this state), and NOT "will he play". Two lineup states follow, and the
 * difference between them is stated on the artifact rather than smoothed over:
 *
 *   PUBLISHED       ESPN has posted the XI (roughly an hour before kickoff). Each named player gets
 *                   his actual state — START for the eleven, SUB for the bench — and the projection
 *                   is a straight application of the validated model.
 *   AWAITING_LINEUP The XI is not out. Every row is explicitly CONDITIONAL ON STARTING, which is the
 *                   validated quantity with its condition attached, and the artifact says so. What is
 *                   NOT done is assume a starting eleven: that is a participation claim the model was
 *                   never tested on, and inventing one is how a validated model starts lying.
 *
 * SQUAD MEMBERSHIP COMES FROM THE CURRENT SEASON, not from history. A striker's fitted rate is a fact
 * about matches he played; whether he is still at this club after a transfer window is not, and
 * projecting a departed player onto his old side is the simplest way to be confidently wrong in
 * public. ESPN athlete ids join the squad file to the corpus exactly — no name matching.
 *
 * WHAT IS DELIBERATELY ABSENT: injuries and suspensions. No feed for either exists here, so an
 * unavailable player will appear in the conditional list. That is a real limitation, stated on the
 * artifact and rendered on the page, not hidden.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fitPlayerRates, predictPlayer, fitCountRates, predictCount, positionGroup } from "../../src/lib/sports/epl/player-rates.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO = path.resolve(APP, "..");
const RESEARCH = path.join(REPO, "data/internal/research/epl");
const PUBLIC_EPL = path.join(APP, "public/data/soccer/epl");

const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const NOW = arg("--now", new Date().toISOString());
const WRITE = process.argv.includes("--write");
if (!Number.isFinite(Date.parse(NOW))) { console.error("usage: build-epl-player-projections.mjs --now <iso>"); process.exit(1); }

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const SITE = "https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1";

/* ── The model, and the configuration its backtest locked ────────────────────────────────────── */
const backtest = readJson(path.join(RESEARCH, "reports/player-model-v2-backtest.json"));
if (backtest.verdict !== "ACCEPTED") {
  console.error(`REFUSED — the player model's recorded verdict is ${backtest.verdict}. Nothing player-level publishes without a cleared bar.`);
  process.exit(2);
}
const K = backtest.locked.k;

const corpusRows = fs.readFileSync(path.join(RESEARCH, "players/espn-players-v1.jsonl"), "utf8")
  .split("\n").filter(Boolean).map((l) => JSON.parse(l))
  /* Never fit on a match at or after the run clock — the same leakage rule the team model lives under. */
  .filter((r) => Date.parse(r.dateUtc ?? "") < Date.parse(NOW));
const fit = fitPlayerRates(corpusRows);
console.log(`goal model k=${K} · fitted on ${fit.appearancesFitted} appearances from ${corpusRows.length} player-match rows`);

/*
 * SHOTS ON GOAL — a SECOND market with its own preregistration and its own cleared bars, so it is
 * loaded the same way: from the recorded verdict, refusing anything not ACCEPTED.
 *
 * PLAIN SHOTS IS ABSENT AND STAYS ABSENT. It was measured under the same bars and REJECTED on
 * calibration (holdout ECE 0.02765 against a 0.020 bar) despite beating its baseline comfortably on
 * log loss. The stopping rule says a rejected target is not re-specified on this corpus, so there is
 * no shots field anywhere in this artifact — a market that failed its bar must be absent, not
 * present-but-flagged, because a flag is something a later surface can drop.
 */
const shotsReport = readJson(path.join(RESEARCH, "reports/shots-model-v1-backtest.json"));
const sogTarget = shotsReport.targets.find((t) => t.target === "sog_over_0_5");
const sogAccepted = sogTarget?.verdict === "ACCEPTED";
if (!sogAccepted) console.log("shots on goal: recorded verdict is not ACCEPTED — omitted from this artifact");
const sogFit = sogAccepted ? fitCountRates(corpusRows, "shotsOnGoal") : null;
if (sogAccepted) {
  console.log(`shots-on-goal model ${sogTarget.locked.distribution} k=${sogTarget.locked.k} · line ${sogTarget.line}`);
}

const squads = readJson(path.join(RESEARCH, "players/squads-2026-27.json"));
const squadByClub = new Map(squads.squads.map((s) => [s.teamName, s]));

/* ── The fixtures to project: the same priced set the team forecasts publish ──────────────────── */
const forecasts = readJson(path.join(PUBLIC_EPL, "forecasts/latest.json"));
const priced = (forecasts.rows ?? []).filter((r) => r.state === "CURRENT_PRE_EVENT" && r.probs && r.slug);
if (priced.length === 0) { console.error("no priced fixtures — nothing to project"); process.exit(2); }

const get = async (url) => {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

/** ESPN's event id for a fixture, matched on club identity within the kickoff date. */
async function espnEventFor(row) {
  const date = String(row.kickoffUtc).slice(0, 10).replace(/-/g, "");
  try {
    const board = await get(`${SITE}/scoreboard?dates=${date}`);
    const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z]/g, "");
    for (const ev of board.events ?? []) {
      const c = ev.competitions?.[0];
      const h = c?.competitors?.find((x) => x.homeAway === "home")?.team?.displayName;
      const a = c?.competitors?.find((x) => x.homeAway === "away")?.team?.displayName;
      if (!h || !a) continue;
      if (norm(h) === norm(row.homeClub) && norm(a) === norm(row.awayClub)) return { id: String(ev.id), home: h, away: a };
      /* Club naming differs between feeds ("Bournemouth" vs "AFC Bournemouth"); accept containment. */
      if (norm(h).includes(norm(row.homeClub)) || norm(row.homeClub).includes(norm(h))) {
        if (norm(a).includes(norm(row.awayClub)) || norm(row.awayClub).includes(norm(a))) return { id: String(ev.id), home: h, away: a };
      }
    }
  } catch { /* a failed lookup is an absent lineup, never a guessed one */ }
  return null;
}

/** The posted XI, or null when ESPN has not published it yet. */
async function lineupFor(eventId) {
  try {
    const sum = await get(`${SITE}/summary?event=${eventId}`);
    const rosters = sum.rosters ?? [];
    const entries = rosters.reduce((n, t) => n + (t.roster?.length ?? 0), 0);
    if (entries === 0) return null;
    return rosters.map((t) => ({
      teamName: t.team?.displayName ?? null,
      players: (t.roster ?? []).map((p) => ({
        playerId: String(p.athlete?.id ?? ""),
        name: p.athlete?.displayName ?? null,
        position: p.position?.abbreviation ?? null,
        started: p.starter === true,
      })),
    }));
  } catch { return null; }
}

/* ── Project ─────────────────────────────────────────────────────────────────────────────────── */
const pct = (n) => Number(n.toFixed(4));
const out = [];
let withLineup = 0;

for (const row of priced) {
  const ev = await espnEventFor(row);
  const lineup = ev ? await lineupFor(ev.id) : null;
  const clubs = [row.homeClub, row.awayClub];

  const players = [];
  if (lineup) {
    withLineup += 1;
    for (const t of lineup) {
      for (const p of t.players) {
        if (!p.playerId) continue;
        const state = p.started ? "START" : "SUB";
        const pred = predictPlayer(fit, { playerId: p.playerId, position: p.position, state }, { k: K });
        if (!pred) continue;
        const sog = sogFit ? predictCount(sogFit, { playerId: p.playerId, position: p.position, state }, { k: sogTarget.locked.k, distribution: sogTarget.locked.distribution }) : null;
        players.push({
          playerId: p.playerId, name: p.name, teamName: t.teamName,
          position: p.position, group: pred.group,
          state, conditional: false,
          appearances: pred.appearances,
          probability: pct(pred.probability),
          shotsOnGoalOver05: sog ? pct(sog.probability) : null,
        });
      }
    }
  } else {
    /* No XI yet. Every row is the VALIDATED quantity with its condition attached, never an assumed XI. */
    for (const club of clubs) {
      const squad = squadByClub.get(club)
        ?? [...squadByClub.values()].find((s) => s.teamName.toLowerCase().includes(String(club).toLowerCase()));
      if (!squad) continue;
      for (const p of squad.players) {
        const pred = predictPlayer(fit, { playerId: p.playerId, position: p.position, state: "START" }, { k: K });
        if (!pred) continue;
        const sog = sogFit ? predictCount(sogFit, { playerId: p.playerId, position: p.position, state: "START" }, { k: sogTarget.locked.k, distribution: sogTarget.locked.distribution }) : null;
        players.push({
          playerId: p.playerId, name: p.name, teamName: squad.teamName,
          position: p.position, group: pred.group,
          state: "START", conditional: true,
          appearances: pred.appearances,
          probability: pct(pred.probability),
          shotsOnGoalOver05: sog ? pct(sog.probability) : null,
        });
      }
    }
  }

  players.sort((a, b) => b.probability - a.probability || String(a.name).localeCompare(String(b.name)));
  out.push({
    eventId: row.eventId,
    slug: row.slug,
    matchup: row.matchup,
    homeClub: row.homeClub,
    awayClub: row.awayClub,
    kickoffUtc: row.kickoffUtc,
    lineupState: lineup ? "PUBLISHED" : "AWAITING_LINEUP",
    espnEventId: ev?.id ?? null,
    players,
  });
  console.log(`  ${row.matchup.padEnd(40)} ${lineup ? "LINEUP PUBLISHED" : "awaiting lineup"} · ${players.length} player(s)`);
}

const artifact = {
  schemaVersion: 1,
  artifact: "epl-player-projections",
  dataClass: "FORECAST_PUBLIC",
  public: true,
  competition: "epl",
  /* Every market on the artifact has cleared its own preregistered bars. Plain shots is not here. */
  markets: sogAccepted
    ? [{ id: "anytime_goalscorer", field: "probability" }, { id: "shots_on_goal_over_0_5", field: "shotsOnGoalOver05", line: 0.5 }]
    : [{ id: "anytime_goalscorer", field: "probability" }],
  market: "anytime_goalscorer",
  rejectedMarkets: [
    { id: "shots_over_0_5", verdict: "REJECTED", reason: "holdout calibration error 0.02765 against a 0.020 bar — it beat its baseline on log loss and is still not calibrated enough to publish" },
  ],
  generatedAt: NOW,
  model: { id: "epl-player-v2-shrunk-rate", k: K, fittedAppearances: fit.appearancesFitted },
  /* The receipt, carried WITH the numbers so a reader never has to take the validation on trust. */
  validation: {
    state: "VALIDATED_OUT_OF_SAMPLE",
    protocol: "walk-forward; warm-up 2022-23, development 2023-24, holdout 2024-25 scored once",
    holdout: {
      n: backtest.model.holdout.n,
      logLoss: backtest.model.holdout.logLoss,
      positionalBaseline: backtest.baselines.positional.holdout.logLoss,
      calibrationError: backtest.model.holdout.ece,
      predictedScorers: backtest.model.holdout.predictedScorers,
      observedScorers: backtest.model.holdout.observedScorers,
    },
    note: "Validated for ANYTIME GOALSCORER only, on players who appeared. It does not predict whether a player will play, and it has never been compared against a price.",
  },
  limitations: [
    "Plain shots (over 0.5) was measured under identical bars and REJECTED on calibration. It is deliberately absent rather than shown with a warning.",
    "No injury or suspension feed exists here, so an unavailable player can still appear in a conditional list.",
    "The source carries no minutes — participation is a discrete state (started or substitute), not an expected-minutes term.",
    "Conditional rows state P(scores | he starts). They are not a claim that he will start.",
  ],
  counts: { fixtures: out.length, withLineup, awaitingLineup: out.length - withLineup },
  fixtures: out,
};

console.log(`\n${out.length} fixture(s) · ${withLineup} with a published lineup · ${out.length - withLineup} awaiting`);

if (WRITE) {
  const dir = path.join(PUBLIC_EPL, "player-projections");
  fs.mkdirSync(dir, { recursive: true });
  const payload = JSON.stringify(artifact, null, 1) + "\n";
  fs.writeFileSync(path.join(dir, "latest.json"), payload);
  /*
   * SNAPSHOTS ARE TIMESTAMPED TO THE MINUTE, not the date. Six crons fire on a matchday, and a
   * date-named file would let a later run overwrite the pre-kickoff snapshot the grader needs — the
   * 14:00 conditional set replaced by the 18:00 lineup set is fine, but any run landing after
   * kickoff would destroy the only gradeable record of what was actually published beforehand.
   * Immutable snapshots make "what did we say before the match" answerable forever.
   */
  const stamp = NOW.slice(0, 16).replace(/[:T]/g, "").replace(/-/g, "");   // 202608211800
  fs.writeFileSync(path.join(dir, `snapshot-${stamp}.json`), payload);
  console.log(`wrote public/data/soccer/epl/player-projections/latest.json + snapshot-${stamp}.json`);
} else {
  console.log(`dry run — pass --write to persist.`);
}
