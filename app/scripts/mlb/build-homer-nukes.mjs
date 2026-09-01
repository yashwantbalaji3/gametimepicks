#!/usr/bin/env node
/**
 * HOMER NUKES — the model's home-run board for a slate.
 *
 * ── What this is ────────────────────────────────────────────────────────────────────────────────
 * A ranked list of the batters most likely to hit a home run today, each with the model's own
 * probability and the numbers that produced it. NOT a parlay: the retired 2026-06 product bundled
 * five longshots into a single +3547 ticket that could only pay if all five landed, which made it a
 * lottery ticket rather than a read. A list of five independent probabilities is a stronger claim
 * and a much more honest one, because each pick settles on its own.
 *
 * ── Why it had to be built rather than read ─────────────────────────────────────────────────────
 * Nothing in this repository carries a home-run probability. The board covers four markets
 * (strikeouts, hits, total bases, hits+runs+RBIs) and none of them is a home run; the Power Board
 * artifact has sat at `state: "pending"` with its inputs unwired. The retired loader read a
 * provider anytime-HR feed that no longer exists. So this computes one, from data that is free.
 *
 * ── The model ───────────────────────────────────────────────────────────────────────────────────
 * Three season rates from the MLB Stats API, combined per batter-vs-starter pairing:
 *
 *   λ_batter   = batter's HR per plate appearance, regressed to the league rate
 *   pitchMult  = opposing probable starter's HR allowed per batter faced, regressed, ÷ league rate
 *   λ          = λ_batter × pitchMult
 *   P(≥1 HR)   = 1 − (1 − λ) ^ expectedPA
 *
 * Regression to the mean is the load-bearing part. A hitter with 3 homers in 40 trips is at 7.5%,
 * roughly double the league rate, and that number is mostly noise — HR rate needs a few hundred
 * plate appearances before it means much. Shrinking toward the league rate with a ~200-PA prior
 * keeps small samples from dominating a board whose whole point is ranking.
 *
 * ── What is NOT in it, and is therefore not claimed ─────────────────────────────────────────────
 * Park factor, weather, handedness splits and batting-order slot all move home-run rates and none
 * of them is modelled here. Expected plate appearances is a league average, not this batter's
 * lineup slot, because lineups are not published this early. The artifact records these as
 * `notModelled` and the page states them. They are the honest next version, not a silent gap.
 *
 * This is a PREDICTION, not an edge claim: no home-run market price is fetched or compared, so it
 * makes no assertion about beating a sportsbook, and it never feeds a money product.
 *
 *   node app/scripts/mlb/build-homer-nukes.mjs --now <ISO> [--date YYYY-MM-DD] [--write]
 */
import { homerNukesHonestLimit } from "../../src/lib/mlb/homer-nukes-honesty.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }
const write = process.argv.includes("--write");

const etDay = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
const DATE = arg("--date", etDay(NOW));
const SEASON = DATE.slice(0, 4);

/** Prior strength, in plate appearances / batters faced, for regressing a rate to the league mean. */
const BATTER_PRIOR_PA = 200;
const PITCHER_PRIOR_BF = 300;
/** A batter needs a real sample before he can be ranked at all. */
const MIN_PA = 120;
/** How many picks the board publishes. */
const TOP_N = 5;

const get = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
};
const pct = (v) => `${(v * 100).toFixed(1)}%`;
/** The honest-limits sentence, from the ONE rule the page also renders (lib/mlb/homer-nukes-honesty.mjs). */
function honestLimitSentence() {
  let rec = null;
  try {
    rec = JSON.parse(fs.readFileSync(path.join(APP, "public/data/mlb/homer-nukes/record.json"), "utf8"));
  } catch { rec = null; }
  return homerNukesHonestLimit(rec);
}

const round = (v, n = 4) => Number(v.toFixed(n));

/** Regress an observed rate toward the league rate; `prior` is the sample size at which they weigh equally. */
const shrink = (events, trials, league, prior) => (events + league * prior) / (trials + prior);

async function main() {
  const powerPath = path.join(APP, "public", "data", "mlb", "power", `${DATE}.json`);
  if (!fs.existsSync(powerPath)) { console.log(`NO_SLATE: no MLB schedule artifact for ${DATE}`); return; }
  const power = JSON.parse(fs.readFileSync(powerPath, "utf8"));
  const games = power.games ?? [];
  if (games.length === 0) { console.log(`NO_SLATE: ${DATE} has no games`); return; }

  // Two league-wide calls rather than a request per player: season lines for every hitter and
  // every pitcher, which is all the model needs and keeps this cheap enough to run every morning.
  const [hitRaw, pitRaw, teamRaw] = await Promise.all([
    get(`https://statsapi.mlb.com/api/v1/stats?stats=season&group=hitting&season=${SEASON}&playerPool=All&limit=2000&sportId=1`),
    get(`https://statsapi.mlb.com/api/v1/stats?stats=season&group=pitching&season=${SEASON}&playerPool=All&limit=2000&sportId=1`),
    get(`https://statsapi.mlb.com/api/v1/teams/stats?stats=season&group=hitting&season=${SEASON}&sportId=1`),
  ]);

  const teamSplits = teamRaw?.stats?.[0]?.splits ?? [];
  const leagueHR = teamSplits.reduce((n, s) => n + (s.stat.homeRuns ?? 0), 0);
  const leaguePA = teamSplits.reduce((n, s) => n + (s.stat.plateAppearances ?? 0), 0);
  if (!leaguePA) { console.error("REFUSED: no league plate appearances — cannot form a baseline"); process.exit(2); }
  const leagueRate = leagueHR / leaguePA;
  const teamGames = teamSplits.reduce((n, s) => n + (s.stat.gamesPlayed ?? 0), 0);
  // A lineup slot's league-average trips to the plate. Derived, not assumed: total PA ÷ team-games ÷ 9.
  const expectedPA = teamGames ? leaguePA / teamGames / 9 : 4.1;

  const batters = new Map();
  for (const s of hitRaw?.stats?.[0]?.splits ?? []) {
    const pa = s.stat.plateAppearances ?? 0;
    if (pa < MIN_PA) continue;
    batters.set(s.player.id, {
      id: s.player.id, name: s.player.fullName,
      teamId: s.team?.id ?? null, teamName: s.team?.name ?? null,
      hr: s.stat.homeRuns ?? 0, pa,
    });
  }
  const pitchers = new Map();
  for (const s of pitRaw?.stats?.[0]?.splits ?? []) {
    pitchers.set(s.player.id, { id: s.player.id, name: s.player.fullName, hr: s.stat.homeRuns ?? 0, bf: s.stat.battersFaced ?? 0 });
  }

  const byTeam = new Map();
  for (const b of batters.values()) if (b.teamId) (byTeam.get(b.teamId) ?? byTeam.set(b.teamId, []).get(b.teamId)).push(b);

  const candidates = [];
  const skipped = [];
  for (const g of games) {
    // A batter faces the OPPOSING probable starter. No starter published → no pairing, and the game
    // is recorded as skipped rather than quietly scored against a league-average phantom pitcher.
    for (const [side, oppSide] of [["away", "home"], ["home", "away"]]) {
      const teamId = g[`${side}TeamId`];
      const oppPitcherId = g[`${oppSide}ProbablePitcherId`];
      const oppPitcherName = g[`${oppSide}ProbablePitcherName`];
      if (!teamId || !oppPitcherId) {
        skipped.push({ game: `${g.awayTeamAbbr} @ ${g.homeTeamAbbr}`, side, reason: oppPitcherId ? "no team id" : "opposing starter not announced" });
        continue;
      }
      const p = pitchers.get(oppPitcherId);
      const pitchRate = p && p.bf > 0 ? shrink(p.hr, p.bf, leagueRate, PITCHER_PRIOR_BF) : leagueRate;
      const pitchMult = pitchRate / leagueRate;

      for (const b of byTeam.get(teamId) ?? []) {
        const battRate = shrink(b.hr, b.pa, leagueRate, BATTER_PRIOR_PA);
        const lambda = battRate * pitchMult;
        const probability = 1 - Math.pow(1 - lambda, expectedPA);
        candidates.push({
          playerId: b.id, player: b.name,
          teamId, teamAbbr: g[`${side}TeamAbbr`], teamName: g[`${side}TeamName`],
          opponentAbbr: g[`${oppSide}TeamAbbr`], opponentTeamId: g[`${oppSide}TeamId`],
          matchup: `${g.awayTeamAbbr} @ ${g.homeTeamAbbr}`,
          gamePk: g.gamePk, gameDate: g.gameDate, venue: g.venue,
          opposingPitcher: oppPitcherName, opposingPitcherId: oppPitcherId,
          probability: round(probability),
          seasonHr: b.hr, seasonPa: b.pa,
          seasonRate: round(b.hr / b.pa, 5),
          adjustedRate: round(lambda, 5),
          pitcherHrAllowed: p?.hr ?? null, pitcherBattersFaced: p?.bf ?? null,
          pitcherMultiplier: round(pitchMult, 3),
          reason: buildReason({ b, p, pitchMult, leagueRate, probability, oppPitcherName }),
        });
      }
    }
  }

  candidates.sort((a, b) => b.probability - a.probability);
  const picks = candidates.slice(0, TOP_N);

  const artifact = {
    schemaVersion: 1,
    artifact: "mlb-homer-nukes",
    dataClass: "PUBLIC_DERIVED",
    date: DATE,
    generatedAt: NOW,
    model: {
      id: "mlb-homer-nukes-v1",
      state: "PUBLIC_EXPERIMENTAL",
      method: "Season HR per plate appearance, regressed to the league rate, scaled by the opposing probable starter's regressed HR-allowed rate, over a league-average number of trips to the plate.",
      leagueHrPerPa: round(leagueRate, 5),
      expectedPlateAppearances: round(expectedPA, 2),
      batterPriorPa: BATTER_PRIOR_PA,
      pitcherPriorBf: PITCHER_PRIOR_BF,
      minimumPa: MIN_PA,
      notModelled: [
        "park factor",
        "weather and wind",
        "batter/pitcher handedness split",
        "batting-order slot (trips to the plate are a league average, not this batter's lineup spot)",
        "bullpen faced after the starter leaves",
      ],
      /*
       * P224: DERIVED, because the first half of this sentence expired.
       *
       * It was typed as "This board has no settled track record yet" when none existed, and stayed
       * that way through fourteen graded slates — sitting on the same page as a track-record table.
       * The second half is still true and stays: no home-run market price is fetched, so the board
       * makes no claim about a sportsbook.
       */
      honestLimit: honestLimitSentence(),
    },
    slate: { games: games.length, candidatesRanked: candidates.length, skipped },
    picks,
  };

  console.log(`homer nukes ${DATE}: ${candidates.length} batter-vs-starter pairings ranked from ${games.length} games · league ${pct(leagueRate)}/PA · ${round(expectedPA, 2)} PA per slot`);
  for (const [i, p] of picks.entries()) console.log(`  ${i + 1}. ${pct(p.probability)}  ${p.player} (${p.teamAbbr}) vs ${p.opposingPitcher} — ${p.seasonHr} HR in ${p.seasonPa} PA`);
  if (skipped.length) console.log(`  ${skipped.length} side(s) skipped: ${[...new Set(skipped.map((s) => s.reason))].join("; ")}`);

  if (!write) { console.log("\ndry-run — nothing written. Re-run with --write."); return; }
  const outDir = path.join(APP, "public", "data", "mlb", "homer-nukes");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, `${DATE}.json`), JSON.stringify(artifact, null, 1) + "\n");
  console.log(`\nwrote mlb/homer-nukes/${DATE}.json`);
}

/** One line naming the actual drivers — the numbers a reader could check, never an adjective. */
function buildReason({ b, p, pitchMult, leagueRate, probability, oppPitcherName }) {
  const own = `${b.hr} HR in ${b.pa} plate appearances (${pct(b.hr / b.pa)} of trips, league ${pct(leagueRate)})`;
  if (!p || !p.bf) return `${own}. ${oppPitcherName} has no season line yet, so only the batter's own rate moves this ${pct(probability)}.`;
  const dir = pitchMult > 1.08 ? `${oppPitcherName} has been more homer-prone than average (${p.hr} allowed in ${p.bf} batters faced), lifting it`
    : pitchMult < 0.92 ? `${oppPitcherName} has suppressed homers (${p.hr} in ${p.bf} batters faced), pulling it down`
    : `${oppPitcherName} sits near league average for homers allowed (${p.hr} in ${p.bf}), so the matchup barely moves it`;
  return `${own}. ${dir} to ${pct(probability)}.`;
}

main().catch((e) => { console.error(`FAILED: ${e.message}`); process.exit(1); });
