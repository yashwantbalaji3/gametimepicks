/**
 * BOARD → ENGINE INPUT ADAPTER (Sprint 008). Turns the public pregame board (`boards/<date>.json`) into
 * leakage-safe `GameInput`s. Every field comes from the board (generated before first pitch); nothing is
 * read from the market or the internal research archive.
 *
 * Lineups are the batters the book posts a hits line for (~9/team = the implied starters). When fewer than
 * nine are posted, the lineup is padded to nine with a documented REPLACEMENT-LEVEL fallback (below-average,
 * clearly named "Lineup fallback", not a real player) and the game is marked DEGRADED with the exact reason
 * — never a fabricated high-confidence projection. A game with no probable starter still simulates against a
 * league bullpen aggregate, also marked DEGRADED.
 */

import type { BatterInput, FullGameCompleteness, GameInput, MarketComparison, PitcherInput } from "./types";
import type { ConfirmedSide } from "./confirmed-lineup";

/** Documented replacement-level filler used when the board posts fewer than nine batters for a team. */
const FALLBACK_BATTER = (slot: number): BatterInput => ({
  playerId: -slot, // negative sentinel → never collides with a real StatsAPI id
  name: "Lineup fallback",
  team: "",
  expHits: 0.7,
  expTotalBases: 1.1,
  expHrr: 1.5,
});

const LINEUP_SIZE = 9;

interface BoardLean {
  gamePk: number;
  playerId: number;
  playerName: string;
  playerTeamAbbr: string;
  playerRole: string;
  marketKey: string;
  projection: number | null;
  [k: string]: unknown;
}
interface BoardGame {
  gamePk: number;
  date: string;
  venue: string | null;
  gameDate: string | null;
  awayTeamAbbr: string;
  homeTeamAbbr: string;
  awayTeamName: string;
  homeTeamName: string;
  awayProbablePitcherId: number | null;
  awayProbablePitcherName: string | null;
  homeProbablePitcherId: number | null;
  homeProbablePitcherName: string | null;
  /**
   * Stamped by the board generator: this game's first pitch was at or before the board's own
   * generatedAt. Deterministic — it is a fact about two timestamps in the committed bytes, not a
   * reading of the wall clock at simulation time.
   */
  startedBeforeGeneration?: boolean;
}
export interface Board {
  date: string;
  games: BoardGame[];
  leans: BoardLean[];
}

/** Rates for one batter, from whichever prop lines the board carries for him. Null where absent. */
function ratesFor(leans: BoardLean[], playerId: number): { expHits: number | null; expTotalBases: number | null; expHrr: number | null } {
  const hit = leans.find((l) => l.marketKey === "batter_hits" && l.playerId === playerId);
  const tb = leans.find((l) => l.marketKey === "batter_total_bases" && l.playerId === playerId);
  const hrr = leans.find((l) => l.marketKey === "batter_hits_runs_rbis" && l.playerId === playerId);
  return {
    expHits: (hit?.projection as number | undefined) ?? null,
    expTotalBases: (tb?.projection as number | undefined) ?? null,
    expHrr: (hrr?.projection as number | undefined) ?? null,
  };
}

/**
 * Build one team's batting lineup.
 *
 * TWO SOURCES, AND THEY ANSWER DIFFERENT QUESTIONS. The confirmed order says WHO is batting and in
 * WHAT SLOT; the board's prop lines say how well each of them hits. Before this, the prop lines were
 * asked to answer both — a batter existed only if a book had posted a line for him, and "batting
 * order" was really prop-listing order. At board time books post six to eight per side, so a real
 * lineup's back third was replacement-level padding in the wrong slots.
 *
 * With a confirmed order, a batter with no posted line keeps his real identity and his real slot and
 * takes replacement-level RATES. That is a strictly smaller assumption than inventing a whole
 * replacement batter, and it is stated per game rather than implied.
 */
function buildLineup(
  leans: BoardLean[],
  team: string,
  confirmed: ConfirmedSide | null,
): { lineup: BatterInput[]; realCount: number; source: "confirmed" | "prop-derived"; ratedCount: number } {
  if (confirmed) {
    const lineup: BatterInput[] = confirmed.batters.map((b, i) => {
      const r = ratesFor(leans, b.playerId);
      // No posted line for this batter: keep him, keep his slot, price him as replacement level.
      if (r.expHits == null) return { ...FALLBACK_BATTER(i + 1), team, playerId: b.playerId, name: b.name };
      return { playerId: b.playerId, name: b.name, team, ...r };
    });
    const ratedCount = confirmed.batters.filter((b) => ratesFor(leans, b.playerId).expHits != null).length;
    return { lineup, realCount: LINEUP_SIZE, source: "confirmed", ratedCount };
  }

  const hitters = leans.filter((l) => l.marketKey === "batter_hits" && l.playerTeamAbbr === team && l.projection != null);
  const real: BatterInput[] = hitters.map((h) => ({
    playerId: h.playerId,
    name: h.playerName,
    team,
    ...ratesFor(leans, h.playerId),
    expHits: h.projection,
  }));
  const lineup = real.slice(0, LINEUP_SIZE);
  for (let s = lineup.length; s < LINEUP_SIZE; s += 1) lineup.push({ ...FALLBACK_BATTER(s + 1), team });
  return { lineup, realCount: real.length, source: "prop-derived", ratedCount: real.length };
}

function buildStarter(
  leans: BoardLean[],
  pitcherId: number | null,
  pitcherName: string | null,
  team: string,
): PitcherInput | null {
  if (pitcherId == null || !pitcherName) return null;
  const k = leans.find((l) => l.marketKey === "pitcher_strikeouts" && l.playerId === pitcherId);
  return { playerId: pitcherId, name: pitcherName, team, expStrikeouts: (k?.projection as number | undefined) ?? null };
}

/** Convert one board game into a leakage-safe engine `GameInput`, with completeness + optional market layer. */
export function gameInputFromBoard(
  board: Board,
  game: BoardGame,
  market: MarketComparison | null,
  confirmed?: { away: ConfirmedSide | null; home: ConfirmedSide | null } | null,
): GameInput {
  const leans = board.leans.filter((l) => l.gamePk === game.gamePk);
  const away = buildLineup(leans, game.awayTeamAbbr, confirmed?.away ?? null);
  const home = buildLineup(leans, game.homeTeamAbbr, confirmed?.home ?? null);
  const awayStarter = buildStarter(leans, game.awayProbablePitcherId, game.awayProbablePitcherName, game.awayTeamAbbr);
  const homeStarter = buildStarter(leans, game.homeProbablePitcherId, game.homeProbablePitcherName, game.homeTeamAbbr);

  const notes: string[] = [];
  const missingFamilies: string[] = [];
  for (const [abbr, side] of [[game.awayTeamAbbr, away], [game.homeTeamAbbr, home]] as const) {
    if (side.source === "confirmed") {
      // The real nine, in their real slots. Some may still lack a posted line and be priced at
      // replacement level — said plainly, because it is a different and smaller gap than padding.
      notes.push(side.ratedCount < LINEUP_SIZE
        ? `${abbr} confirmed batting order used; ${LINEUP_SIZE - side.ratedCount} of 9 have no posted prop line and are priced at replacement level.`
        : `${abbr} confirmed batting order used, all 9 with posted prop lines.`);
    } else if (side.realCount < LINEUP_SIZE) {
      /*
       * TWO DIFFERENT FACTS, AND THE NOTE USED TO STATE ONLY THE WORSE ONE.
       *
       * This read "no confirmed order was available before first pitch" for every padded side. For
       * an evening game simulated at lunchtime that is a claim about a past that has not happened
       * yet: the order is not missing, it has simply not been posted, and the hourly refresh will
       * pick it up. Ten of today's fifteen games carried that sentence at 13:44 ET.
       *
       * A game that HAS started and was never given a confirmed order is the genuinely degraded
       * case, and it keeps the original wording. The two are told apart by the clock against first
       * pitch, which is the only thing that distinguishes them.
       */
      const firstPitchMs = game.gameDate ? Date.parse(game.gameDate) : NaN;
      // An unreadable first pitch is not evidence the game has started, so it stays on the
      // pregame wording — the padded count is stated either way and nothing is overclaimed.
      const started = Number.isFinite(firstPitchMs) && Date.now() >= firstPitchMs;
      notes.push(started
        ? `${abbr} lineup padded: ${side.realCount}/9 batters posted pregame (replacement-level fallback for the rest); no confirmed order was available before first pitch.`
        : `${abbr} lineup padded: ${side.realCount}/9 batters have a posted line and the rest are at replacement level; ${abbr} have not posted a batting order yet, and this refreshes hourly until they do.`);
    }
  }
  if (!awayStarter) { notes.push(`${game.awayTeamAbbr} has no posted probable starter — simulated vs a league bullpen aggregate.`); missingFamilies.push("away_probable_starter"); }
  else if (awayStarter.expStrikeouts == null) notes.push(`${game.awayTeamAbbr} starter ${awayStarter.name} has no strikeout projection — league starter rate used.`);
  if (!homeStarter) { notes.push(`${game.homeTeamAbbr} has no posted probable starter — simulated vs a league bullpen aggregate.`); missingFamilies.push("home_probable_starter"); }
  else if (homeStarter.expStrikeouts == null) notes.push(`${game.homeTeamAbbr} starter ${homeStarter.name} has no strikeout projection — league starter rate used.`);
  /*
   * `confirmed_batting_order` used to be listed here unconditionally, with the comment that it
   * "never exists pregame on the public surface". True of the public surface, and it had been
   * captured internally eight times a day the whole time — free, from StatsAPI, before first pitch.
   * It is now missing only when it is genuinely missing, per side.
   */
  if (away.source !== "confirmed" || home.source !== "confirmed") missingFamilies.push("confirmed_batting_order");
  missingFamilies.push("park_run_factors", "weather", "batter_handedness_splits");

  const enoughToSimulate = away.realCount >= 6 && home.realCount >= 6;
  const fullyReady = away.realCount >= LINEUP_SIZE && home.realCount >= LINEUP_SIZE && !!awayStarter && !!homeStarter;
  /*
   * ── THE PRE-EVENT BOUNDARY, ENFORCED IN THE ADAPTER ──────────────────────────────────────────
   *
   * A game already under way when the board was generated cannot receive a pregame simulation, and
   * the refusal belongs HERE rather than in the calling script: forcing `unavailable` means
   * `simulateFullGame` takes its null-probability path, so the artifact structurally cannot carry a
   * win probability, a score distribution or a player line for that game. A filter in the script
   * would leave the same forecast one careless caller away.
   *
   * The game still produces an entry, so the day's array length continues to reconcile against the
   * board — a refused game is visible, not missing.
   */
  const startedBeforeGeneration = game.startedBeforeGeneration === true;
  if (startedBeforeGeneration) {
    notes.push(
      `First pitch was at or before this slate's generation time, so no pregame simulation exists for this game. It stays counted as scheduled.`,
    );
    missingFamilies.push("pre_event_window");
  }
  const level: FullGameCompleteness["level"] =
    startedBeforeGeneration || !enoughToSimulate ? "unavailable" : fullyReady ? "ready" : "degraded";

  const completeness: FullGameCompleteness = {
    level,
    notes,
    /*
     * WHICH LINEUP THIS SIMULATION ACTUALLY RAN ON. Reported per side, because the two teams post at
     * different times and one can be confirmed while the other is still prop-derived. Without this a
     * reader cannot tell a real batting order from prop-listing order, and neither can a later audit.
     */
    awayLineupSource: away.source,
    homeLineupSource: home.source,
    awayRatedCount: away.ratedCount,
    homeRatedCount: home.ratedCount,
    awayLineupCount: away.realCount,
    homeLineupCount: home.realCount,
    hasAwayStarter: !!awayStarter,
    hasHomeStarter: !!homeStarter,
    startedBeforeGeneration,
    missingFamilies,
  };

  const slug = `${game.awayTeamAbbr.toLowerCase()}-vs-${game.homeTeamAbbr.toLowerCase()}-${game.date}`;

  return {
    gamePk: game.gamePk,
    date: game.date,
    slug,
    awayTeam: game.awayTeamAbbr,
    homeTeam: game.homeTeamAbbr,
    awayTeamName: game.awayTeamName,
    homeTeamName: game.homeTeamName,
    venue: game.venue,
    firstPitch: game.gameDate,
    awayLineup: away.lineup,
    homeLineup: home.lineup,
    awayStarter,
    homeStarter,
    completeness,
    market,
  };
}

/** All games on the board as engine inputs. */
export function gameInputsFromBoard(
  board: Board,
  marketByGamePk?: Map<number, MarketComparison>,
  confirmedByGamePk?: Map<number, { away: ConfirmedSide | null; home: ConfirmedSide | null }>,
): GameInput[] {
  return board.games.map((g) => gameInputFromBoard(board, g, marketByGamePk?.get(g.gamePk) ?? null, confirmedByGamePk?.get(g.gamePk) ?? null));
}
