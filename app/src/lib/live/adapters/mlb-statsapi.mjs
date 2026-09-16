/**
 * MLB LIVE ADAPTER — pure normalization of a StatsAPI schedule payload. NO network, NO fs.
 *
 * The fetcher hands parsed JSON here (and tests hand fixtures), exactly as
 * `mlb/product-settlement/statsapi-linescore.ts` already does for settlement. This module is the ONLY
 * place StatsAPI's field names appear on the live path; everything downstream sees LiveEventEnvelope.
 *
 * VERIFIED 2026-09-15 against `schedule?sportId=1&date=D&hydrate=linescore,team` (200, 86 KB, 15
 * games, 10 of them Live): gamePk · status.{abstractGameState,codedGameState,detailedState} ·
 * gameDate · linescore.{currentInning,currentInningOrdinal,inningState,outs,balls,strikes} ·
 * linescore.teams.{home,away}.{runs,hits,errors} · linescore.offense.{batter,pitcher}.
 *
 * ⚠ THE POSTPONED TRAP, ALREADY PAID FOR ONCE. StatsAPI reports a postponed game as
 * abstractGameState "Final" with no scores (observed PIT/MIL 2026-07-10; encoded in settlement since).
 * Live must not repeat it: coded states C/D/U are mapped to CANCELLED/POSTPONED/DELAYED BEFORE the
 * abstract state is consulted, so a postponed game can never render as a 0-0 final.
 *
 * ⚠ THIS ADAPTER NEVER SETTLES ANYTHING. A FINAL envelope is a live-feed observation, not a graded
 * result. Settlement stays owned by the settlement path — §11's rule, kept by having no exit here.
 */
import { makeCompetitor, makeEnvelope } from "../contract.mjs";

/** StatsAPI coded states decided BEFORE the abstract state. */
const CODED_STATE_MAP = Object.freeze({
  C: "CANCELLED",
  D: "POSTPONED",
  U: "DELAYED", // suspended — the game exists and may resume; never a final
  /*
   * ⚠ PRE-GAME AND WARMUP ARE NOT LIVE. StatsAPI reports detailedState "Warmup" with abstractGameState
   * "Live" but codedGameState "P" — the same coded state as "Pre-Game". Observed in production
   * 2026-09-16: LAD @ CIN (824467) read LIVE · "Top 1st" · 0–0 at 22:14Z for a 22:40Z first pitch, so
   * /live, the game page and Since Your Last Visit ("Now live") all claimed a game was under way before
   * a pitch was thrown. The coded state is the provider's own statement that play has not begun.
   */
  P: "PRE",
  S: "PRE", // Scheduled
});

const num = (x) => (typeof x === "number" && Number.isFinite(x) ? x : null);

/** "Top"/"Bottom"/"Middle"/"End" → the half-inning phase, normalized, or null when absent. */
function inningPhase(inningState) {
  if (typeof inningState !== "string" || inningState.length === 0) return null;
  return inningState;
}

/** Map StatsAPI status to a LIVE_STATES member. Coded non-result states win over abstract Final. */
export function mapMlbState(status) {
  const coded = CODED_STATE_MAP[status?.codedGameState];
  if (coded) return coded;
  switch (status?.abstractGameState) {
    case "Live":
      return "LIVE";
    case "Final":
      return "FINAL";
    case "Preview":
      return "PRE";
    default:
      return "UNKNOWN";
  }
}

/**
 * Normalize ONE StatsAPI `game` object.
 *
 * A game with no gamePk is refused (null) rather than given a synthetic id — an event we cannot name
 * is an event we cannot join, and guessing the join is the one thing §13 forbids outright.
 */
export function normalizeMlbGame(game, fetchedAt) {
  const gamePk = num(game?.gamePk);
  if (gamePk === null) return null;

  const state = mapMlbState(game?.status);
  const ls = game?.linescore ?? {};
  /*
   * WHICH STATES MAY CARRY A SCORE AT ALL.
   *
   * ⚠ PRE IS EXCLUDED, and that is not cosmetic. StatsAPI populates `linescore.teams.*.runs` and
   * `teams.*.score` with 0 as soon as a game reaches detailedState "Pre-Game" — roughly an hour
   * before first pitch. Observed in production 2026-09-16: two scheduled games rendered "CWS 0 @
   * CLE 0" on the hub while the rest correctly showed an em dash, which reads as a game under way
   * and scoreless rather than a game that has not started.
   *
   * A postponed or cancelled game is likewise given no score however the payload is shaped.
   *
   * A genuine 0 during play is NOT suppressed: a scoreless third inning is a fact the feed is
   * entitled to report, and LIVE/FINAL keep their zeroes. Only states that cannot have a score yet
   * are stripped of one.
   */
  const scored = state !== "POSTPONED" && state !== "CANCELLED" && state !== "PRE";
  const homeRuns = scored ? (num(ls?.teams?.home?.runs) ?? num(game?.teams?.home?.score)) : null;
  const awayRuns = scored ? (num(ls?.teams?.away?.runs) ?? num(game?.teams?.away?.score)) : null;

  // A game that has not started has no inning either (a Warmup payload already says "Top 1st").
  const inning = state === "PRE" ? null : num(ls?.currentInning);
  const phase = state === "PRE" ? null : inningPhase(ls?.inningState);
  const period =
    inning === null && phase === null
      ? null
      : {
          number: inning,
          // "Top 7th" reads as the scoreboard reads. Absent parts are simply omitted, not invented.
          label: [phase, ls?.currentInningOrdinal].filter(Boolean).join(" ") || null,
          clock: null, // baseball has no clock; null is the truthful answer, not "0:00"
          phase,
        };

  // The situation block is optional everywhere: a Preview game has none, and a finished one is over.
  const outs = num(ls?.outs);
  const situation =
    state === "LIVE" && (outs !== null || ls?.offense?.batter || ls?.offense?.pitcher)
      ? {
          outs,
          balls: num(ls?.balls),
          strikes: num(ls?.strikes),
          batter: ls?.offense?.batter?.fullName ?? null,
          pitcher: ls?.defense?.pitcher?.fullName ?? ls?.offense?.pitcher?.fullName ?? null,
          basesOccupied: [
            ls?.offense?.first ? 1 : null,
            ls?.offense?.second ? 2 : null,
            ls?.offense?.third ? 3 : null,
          ].filter((b) => b !== null),
        }
      : null;

  return makeEnvelope({
    eventId: String(gamePk),
    sport: "MLB",
    provider: "mlb-statsapi",
    providerEventId: String(gamePk),
    startTime: typeof game?.gameDate === "string" ? game.gameDate : null,
    state,
    stateDetail: game?.status?.detailedState ?? null,
    sourceUpdatedAt: null, // the schedule payload publishes none — never fabricated
    fetchedAt,
    period,
    competitors: {
      home: makeCompetitor({
        teamId: num(game?.teams?.home?.team?.id) === null ? null : String(game.teams.home.team.id),
        abbr: game?.teams?.home?.team?.abbreviation ?? null,
        name: game?.teams?.home?.team?.name ?? null,
        score: homeRuns,
      }),
      away: makeCompetitor({
        teamId: num(game?.teams?.away?.team?.id) === null ? null : String(game.teams.away.team.id),
        abbr: game?.teams?.away?.team?.abbreviation ?? null,
        name: game?.teams?.away?.team?.name ?? null,
        score: awayRuns,
      }),
    },
    situation,
    // No MLB player stats in v1.1: the schedule payload carries none and the per-game feed was not
    // verified this session, so the field stays null rather than half-populated.
    playerStats: null,
  });
}

/** Normalize a whole schedule payload: `dates[].games[]`. Unparseable games are dropped, not faked. */
export function normalizeMlbSchedule(payload, fetchedAt) {
  const games = Array.isArray(payload?.dates) ? payload.dates.flatMap((d) => d?.games ?? []) : [];
  return games.map((g) => normalizeMlbGame(g, fetchedAt)).filter((e) => e !== null);
}
