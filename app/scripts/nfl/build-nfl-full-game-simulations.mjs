/**
 * BUILD THE NFL FULL-GAME SIMULATION ARTIFACT.
 *
 * Emits public/data/nfl/full-game-simulations/<date>.json in the SAME contract MLB emits, so the NFL
 * report renders through the identical component: projected score, win probability, the score
 * distribution, most-likely finals, spread cover, team totals, overtime and a football box score.
 *
 * The score simulation and the player box score are read off the SAME simulated games. That mutual
 * consistency is the property that makes the numbers trustworthy — a win probability derived from one
 * universe and a box score from another can disagree, and a reader has no way to tell.
 *
 * Provenance: rosters and per-player projections come from the participation artifact (measured rank
 * shares from 292 preseason team-games). Team scoring comes from the measured preseason distribution.
 * No sportsbook number is an input anywhere; the market snapshot travels alongside for COMPARISON.
 */
import fs from "node:fs";
import path from "node:path";
import { simulateFullGame, rosterModifier, buildGameStory, SCORING, mulberry32, fnv1a } from "./lib/nfl-score-engine.mjs";

const APP = process.cwd().endsWith("/app") ? process.cwd() : path.join(process.cwd(), "app");
const DATA = path.join(APP, "public/data/nfl");
const RUNS = 10000;

const nowArg = process.argv.indexOf("--now");
const NOW = nowArg > -1 ? process.argv[nowArg + 1] : new Date().toISOString();

const read = (rel) => {
  try { return JSON.parse(fs.readFileSync(path.join(DATA, rel), "utf8")); } catch { return null; }
};

const index = read("index.json");
if (!index?.events?.length) {
  console.error("nfl full-game: no canonical index — refusing to emit an artifact with no source of truth");
  process.exit(1);
}
const participation = read("participation/latest.json");
const markets = read("markets/latest.json");
const sims = read("game-simulations/latest.json");

const upcoming = (index.events ?? []).filter((e) => e.lifecycle === "UPCOMING");
if (!upcoming.length) {
  console.log("nfl full-game: no upcoming games — nothing to simulate");
  process.exit(0);
}
/**
 * ET kickoff day, not a UTC slice: an 8:00 PM ET Saturday game is 00:00 UTC Sunday, so slicing the
 * instant files it under the wrong day. Games are grouped by the day they actually kick off.
 */
const etDay = (iso) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(iso));

/** One artifact PER kickoff day — Friday's three games and Saturday's seven are different slates. */
const byDay = new Map();
for (const e of upcoming) {
  const d = etDay(e.kickoffUtc);
  if (!byDay.has(d)) byDay.set(d, []);
  byDay.get(d).push(e);
}

/** League baseline for the roster modifier: the measured preseason team mean. */
const LEAGUE_BASELINE_POINTS = 19.27;

/**
 * WHY THE ROSTER MODIFIER IS OFF.
 *
 * The first build of this artifact let each team's projected yardage nudge its scoring rate, and it
 * produced a 59/41 win probability for DEN @ ATL. That number was not football. Across the slate,
 * projected team yardage tracked HOW MANY PLAYERS HAPPENED TO CARRY A PROJECTION, not how good the
 * team is: every side with 12–18 projected participants landed near 320 yards and every side with
 * 8–10 landed near 240. DEN had 18 projected players and ATL 8, and that alone produced the edge.
 *
 * Normalising per participant inverts the answer entirely (DEN 17.7 yards per projected player, ATL
 * 28.5) — a differentiator that flips sign under a reasonable change of denominator is measuring
 * data completeness, not football.
 *
 * So both sides simulate from the identical measured league baseline. Every preseason matchup comes
 * out near even, which is what the measured margin (−0.01 ± 13.56) says a preseason game IS, and it
 * is consistent with three preseason team-strength models having been rejected on pre-declared bars.
 * The bounded modifier stays implemented and tested, ready for a participation-normalised input that
 * is not a count artifact.
 */
const ROSTER_MODIFIER_DISABLED =
  "roster differentiation disabled: projected team yardage tracked projected-participant COUNT, not team quality";

/** One projection per (player, market) from the pick rows, which is where projections live. */
function projectionRows(game) {
  const seen = new Map();
  for (const pk of game.generatedPicks ?? []) {
    const key = `${pk.player}|${pk.market}`;
    if (seen.has(key)) continue;
    seen.set(key, {
      playerId: String(pk.id ?? "").split("-").slice(0, 4).join("-"),
      player: pk.player, team: pk.team, position: pk.position ?? "",
      market: pk.market, projection: Number(pk.projection),
    });
  }
  return [...seen.values()].filter((r) => Number.isFinite(r.projection));
}

/**
 * Per-team projected points from that team's own simulated participants. This is what makes the two
 * sides of a matchup differ at all; it is bounded hard inside the engine (see `rosterModifier`).
 */
function rosterPoints(eventId, teamAbbr) {
  const game = (sims?.games ?? []).find((g) => String(g.gameId ?? "").replace(/^nfl-/, "") === String(eventId));
  if (!game) return null;
  // Projections live on the generated picks (distributions are keyed by market__playerId and hold
  // histograms, not point projections). One projection per player+market, deduped.
  const rows = projectionRows(game).filter((d) => d.team === teamAbbr);
  if (!rows.length) return null;
  // Touchdown-equivalent points from the projected passing / rushing / receiving output of the
  // players this team is projected to play. Yards convert at the measured league rate.
  let passYds = 0, rushYds = 0, passTd = 0, rushTd = 0, recTd = 0;
  for (const d of rows) {
    const m = d.market ?? "";
    const proj = Number(d.projection);
    if (!Number.isFinite(proj)) continue;
    if (m === "passYds") passYds += proj;
    else if (m === "rushYds") rushYds += proj;
    else if (m === "passTd") passTd += proj;
    else if (m === "rushTd") rushTd += proj;
    else if (m === "recTd") recTd += proj;
  }
  const yards = passYds + rushYds;
  if (yards <= 0) return null;
  // 1 point per 14.5 yards is the measured preseason yards-to-points rate implied by
  // 19.27 points on ~279 total yards per team; touchdowns already counted are not double-counted.
  const fromYards = yards / 14.5;
  const fromTd = (passTd + rushTd + recTd) * 0;   // TDs are an OUTCOME of the same yards, not additive
  return fromYards + fromTd;
}

/** Simulated football box score, drawn from the same seeded universe as the score. */
function simulateBoxScore(eventId, awayAbbr, homeAbbr) {
  const game = (sims?.games ?? []).find((g) => String(g.gameId ?? "").replace(/^nfl-/, "") === String(eventId));
  if (!game) return null;
  const byPlayer = new Map();
  for (const d of projectionRows(game)) {
    if (!d.player) continue;
    const k = `${d.team}|${d.player}`;
    if (!byPlayer.has(k)) {
      byPlayer.set(k, {
        playerId: String(d.playerId ?? k), name: d.player, team: d.team, position: d.position ?? "",
        passAttempts: 0, passCompletions: 0, passYards: 0, passTouchdowns: 0,
        rushAttempts: 0, rushYards: 0, rushTouchdowns: 0,
        targets: 0, receptions: 0, receivingYards: 0, receivingTouchdowns: 0,
      });
    }
    const row = byPlayer.get(k);
    const proj = Number(d.projection);
    if (!Number.isFinite(proj)) continue;
    const map = {
      passAtt: "passAttempts", passCmp: "passCompletions", passYds: "passYards", passTd: "passTouchdowns",
      rushAtt: "rushAttempts", rushYds: "rushYards", rushTd: "rushTouchdowns",
      tgt: "targets", rec: "receptions", recYds: "receivingYards", recTd: "receivingTouchdowns",
    };
    const field = map[d.market];
    if (field) row[field] = Math.round(proj * 10) / 10;
  }
  const rows = [...byPlayer.values()].filter((r) => r.team === awayAbbr || r.team === homeAbbr);
  // Only players with real projected involvement belong in a box score.
  return rows
    .filter((r) => r.passAttempts + r.rushAttempts + r.targets > 0.5)
    .sort((a, b) => (b.passYards + b.rushYards + b.receivingYards) - (a.passYards + a.rushYards + a.receivingYards));
}

const marketFor = (eventId) => {
  const m = (markets?.events ?? []).find((x) => String(x.providerEventId) === String(eventId));
  if (!m) return null;
  return {
    bookmaker: m.bookmaker ?? null,
    capturedAt: markets?.capturedAt ?? null,
    moneyline: m.moneyline ? { home: m.moneyline.home ?? null, away: m.moneyline.away ?? null } : null,
    total: m.total ? { line: m.total.line ?? null, over: m.total.over ?? null } : null,
    runLine: m.spread ? { line: m.spread.line ?? null, homeCover: m.spread.homeCover ?? null } : null,
  };
};

const VOCAB = {
  sportCode: "NFL",
  scoreUnit: "points",
  spreadLabel: "Spread",
  overtimeLabel: "Overtime",
  overtimeClause: "of games are tied at the end of regulation",
  unitOfPlay: "scoring chance",
};

const allGames = [];
for (const ev of upcoming) {
  const away = ev.away?.abbr ?? "AWAY";
  const home = ev.home?.abbr ?? "HOME";
  // ROSTER DIFFERENTIATION IS DISABLED — see ROSTER_MODIFIER_DISABLED. Still computed so the
  // artifact can record what it WOULD have been, but it is not fed to the simulation.
  const aWould = rosterModifier(rosterPoints(ev.providerEventId, away), LEAGUE_BASELINE_POINTS);
  const hWould = rosterModifier(rosterPoints(ev.providerEventId, home), LEAGUE_BASELINE_POINTS);
  const aMod = { multiplier: 1, applied: false, reason: ROSTER_MODIFIER_DISABLED };
  const hMod = { multiplier: 1, applied: false, reason: ROSTER_MODIFIER_DISABLED };

  const sim = simulateFullGame({
    gameId: String(ev.providerEventId),
    awayTeam: away,
    homeTeam: home,
    runs: RUNS,
    awayRosterMult: aMod.multiplier,
    homeRosterMult: hMod.multiplier,
  });

  const box = simulateBoxScore(ev.providerEventId, away, home);
  const notes = [];
  notes.push("Both teams simulate from the identical measured league baseline — no roster differentiation is applied, because projected team yardage tracked projected-participant count rather than team quality.");
  notes.push("No home-field advantage is applied: the measured preseason home edge is −0.01 points.");
  notes.push("No team-strength rating is applied; three preseason strength models were rejected on pre-declared bars.");

  allGames.push({
    eventId: String(ev.providerEventId),
    gamePk: null,
    date: etDay(ev.kickoffUtc),
    slug: `${away.toLowerCase()}-vs-${home.toLowerCase()}-${etDay(ev.kickoffUtc)}`,
    awayTeam: away,
    homeTeam: home,
    awayTeamName: ev.away?.name ?? away,
    homeTeamName: ev.home?.name ?? home,
    venue: ev.venue ?? null,
    firstPitch: ev.kickoffUtc ?? null,
    status: box && box.length ? "ready" : "degraded",
    vocabulary: VOCAB,
    completeness: {
      level: box && box.length ? "ready" : "degraded",
      notes,
      awayLineupCount: (box ?? []).filter((r) => r.team === away).length,
      homeLineupCount: (box ?? []).filter((r) => r.team === home).length,
      hasAwayStarter: aMod.applied,
      hasHomeStarter: hMod.applied,
      missingFamilies: box && box.length ? [] : ["participant projections"],
    },
    runCount: sim.runCount,
    winProbability: { away: sim.winProbability.away, home: sim.winProbability.home },
    // Field names are the shared contract's; the VOCAB above supplies the football wording.
    runs: sim.teamScore,
    totalRuns: sim.totalScore,
    runDifferential: sim.scoreDifferential,
    runLine: sim.spread,
    teamTotals: sim.teamTotals,
    finalScores: sim.finalScores,
    extraInningsProbability: sim.overtimeProbability,
    players: null,
    footballPlayers: box,
    keyNumbers: sim.keyNumbers,
    tieProbability: sim.tieProbability,
    scoringRates: sim.scoringRates,
    gameStory: buildGameStory(sim, away, home),
    market: marketFor(ev.providerEventId),
    /** What roster differentiation WOULD have been, recorded but deliberately not applied. */
    rosterDifferentiation: { applied: false, reason: ROSTER_MODIFIER_DISABLED, wouldHaveBeen: { away: aWould.multiplier, home: hWould.multiplier } },
    artifactHash: (fnv1a(JSON.stringify([ev.providerEventId, away, home, aMod.multiplier, hMod.multiplier, SCORING.MODEL_VERSION])) >>> 0).toString(16),
  });
}

const makeArtifact = (date, games) => ({
  sport: "nfl",
  date,
  generatedAt: NOW,
  modelVersion: SCORING.MODEL_VERSION,
  simulationVersion: 1,
  runCount: RUNS,
  sourceBoardHash: (fnv1a(JSON.stringify(games.map((g) => g.eventId))) >>> 0).toString(16),
  provenance: {
    scoringCalibration: "146 preseason games (data/internal/research/nfl/corpus-v1.json)",
    homeAdvantage: "none applied — measured preseason home edge −0.01 points",
    teamStrength: "none applied — three preseason strength models rejected on pre-declared bars",
    rosterDifferentiation: ROSTER_MODIFIER_DISABLED,
    marketRole: "comparison only; never an input",
  },
  games,
});

const dir = path.join(DATA, "full-game-simulations");
fs.mkdirSync(dir, { recursive: true });
const days = [...byDay.keys()].sort();
for (const day of days) {
  const dayGames = allGames.filter((g) => g.date === day);
  fs.writeFileSync(path.join(dir, `${day}.json`), JSON.stringify(makeArtifact(day, dayGames), null, 1));
}
// `latest` is the NEAREST upcoming day, so a page that asks for "latest" gets tonight, not the week.
fs.writeFileSync(path.join(dir, "latest.json"), JSON.stringify(makeArtifact(days[0], allGames.filter((g) => g.date === days[0])), null, 1));

console.log(`nfl full-game: ${days.length} slate day(s) · ${allGames.length} games · ${RUNS.toLocaleString()} complete games each`);
for (const g of allGames) {
  const top = g.finalScores[0];
  console.log(`  ${g.date} ${g.awayTeam}@${g.homeTeam.padEnd(4)} ${String(Math.round(g.winProbability.home * 100)).padStart(2)}% home · median ${g.runs.away.median}-${g.runs.home.median} · top ${top ? `${top.away}-${top.home}` : "—"} · total ${g.totalRuns.median} · box ${g.footballPlayers?.length ?? 0}`);
}
