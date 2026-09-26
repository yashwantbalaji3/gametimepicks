/**
 * NFL ADAPTER — the weekly top boards and the Endzone Vault, expressed in one presentation contract.
 *
 * NORMALISATION ONLY. Nothing here ranks, selects, rounds a model number or decides what publishes.
 * The weekly-board builder (`scripts/nfl/build-nfl-weekly-boards.mjs`) remains THE ranking owner and
 * already applies the family's display precision; this reads its output and names the parts.
 *
 * THE MARKET SLOT COMES FROM THE ROW, NOT FROM A SECOND ARTIFACT. Every weekly-board row carries its own
 * `pricingState`, stamped by the builder ("PRICING STATE, NEVER A PRICE CLAIM"). Reading that field is
 * what keeps this honest and joinless: no identity is minted to reach across to the odds capture, and a
 * renderer cannot end up showing one game's price beside another game's forecast.
 *
 * MEASURED, FOR THE RECORD — AND THEN MEASURED AGAIN, WHICH IS THE POINT:
 *
 *   2026-09-23  the NFL odds lane owned game-level h2h/spreads/totals and NO player props. Twenty of
 *               forty-seven committed captures had run the prop probe and every one recorded
 *               `offeredMarkets: []` with all five published families in `absentMarkets`. So the
 *               market half of every card here was a typed absence, correctly.
 *   2026-09-24  the founder authorized the five families, the probe ran, and DraftKings returned
 *               real lines. Nothing in this file changed to make that happen — the market half
 *               started carrying numbers the day an owner started producing them, which is what the
 *               sentence above promised.
 *
 * ⚠ A MEASUREMENT IS TRUE ON ITS DATE. The first reading was quoted in three places as though it
 * were a property of the provider, and each of those places had to be found and corrected when the
 * world moved. Dates are on the readings above for that reason.
 */
import type {
  GameContext,
  ModelForecast,
  ModelStatus,
  PlayerIdentity,
  PredictionKind,
  PredictionPresentation,
} from "./contract";
import { marketFromFrozenCapture, marketFromPricingState } from "./contract";

/**
 * ESPN athlete id out of the canonical player key ("nfl-athlete-4430807" -> 4430807).
 * Returns null for anything that is not that shape, so a schema change degrades to the portrait
 * owner's initials disc rather than requesting a nonsense URL.
 *
 * ONE OWNER. This rule used to live as a private helper inside the /nfl hub; the weekly boards needed
 * the same rule, and a second copy is how two surfaces start disagreeing about who a player is.
 */
export const espnAthleteId = (playerId: string): number | null => {
  const m = /^nfl-athlete-(\d+)$/.exec(playerId ?? "");
  return m ? Number(m[1]) : null;
};

/**
 * The published families, with the two things a renderer cannot guess: what kind of number this is, and
 * what the number is IN. A family absent from this table is not rendered — fail-closed, because a
 * yardage value printed with no unit beside a probability is exactly the confusion this release removes.
 */
export const NFL_FAMILIES: Record<string, { label: string; kind: PredictionKind; unit?: string }> = {
  anytime_td: { label: "Anytime touchdown", kind: "PROBABILITY" },
  player_receptions: { label: "Receptions", kind: "NUMERIC", unit: "rec" },
  player_rush_yds: { label: "Rushing yards", kind: "NUMERIC", unit: "yds" },
  player_reception_yds: { label: "Receiving yards", kind: "NUMERIC", unit: "yds" },
  player_pass_yds: { label: "Passing yards", kind: "NUMERIC", unit: "yds" },
};

/** A weekly-board row, exactly as the builder writes it. */
export interface WeeklyBoardRow {
  playerId: string;
  name: string;
  team: string;
  opponent: string;
  providerEventId: string;
  kickoffUtc: string;
  participation: string;
  value: number;
  p10?: number;
  median?: number;
  p90?: number;
  probability?: number;
  pricingState?: string;
  /*
   * A REAL CAPTURED PRICE, when the owner has one for this exact player, family and event.
   *
   * Present only when the reference sportsbook posted the market and the row joined a durable
   * player id. Its absence is not a gap to be filled — it falls back to the TYPED `pricingState`,
   * which is how a reader learns we hold no market rather than seeing a blank that reads as zero.
   *
   * The shape is FrozenMarket's, and `marketFromFrozenCapture` refuses it without a named book and
   * a capture instant, so an unattributed price cannot reach a row even by mistake.
   */
  market?: {
    line?: number;
    overOdds?: number;
    underOdds?: number;
    yesOdds?: number;
    sportsbook: string;
    capturedAt: string;
  };
}

export interface WeeklyBoard {
  id: string;
  family: string;
  title: string;
  state: string;
  reason?: string;
  caveat?: string;
  rows?: WeeklyBoardRow[];
}

export interface WeeklyBoardsArtifact {
  generatedAt: string;
  model?: { id?: string; version?: number | string; launchState?: string } | null;
  /** Optional: the row adapters need only the stamp and the model, so a caller that already holds
   *  one board (a filtered client view) need not ship the whole artifact across the boundary. */
  boards?: WeeklyBoard[];
}

/**
 * One row of a weekly board as a presentation.
 *
 * Returns null when the family is unknown or the board is not in a rendering state — a caller that
 * filters on null renders nothing, which is the right outcome and is why this does not throw.
 */
export function presentWeeklyBoardRow(
  artifact: WeeklyBoardsArtifact,
  board: WeeklyBoard,
  row: WeeklyBoardRow,
): PredictionPresentation | null {
  const family = NFL_FAMILIES[board.family];
  if (!family) return null;
  if (board.state !== "PUBLISHED" && board.state !== "ESTIMATE") return null;

  const player: PlayerIdentity = {
    playerId: row.playerId,
    name: row.name,
    teamAbbr: row.team,
    portraitId: espnAthleteId(row.playerId),
  };

  const game: GameContext = {
    opponentAbbr: row.opponent,
    providerEventId: row.providerEventId,
    startTimeUtc: row.kickoffUtc,
    participation: row.participation,
  };

  /*
   * The band publishes only when BOTH ends do. A one-sided band is not a range, and rendering one end
   * as though it bounded the forecast would be a claim the owner never made.
   */
  const hasBand = row.p10 != null && row.p90 != null;

  const model: ModelForecast = {
    kind: family.kind,
    ...(family.kind === "PROBABILITY"
      ? { probability: row.probability ?? row.value }
      : { predictedValue: row.median ?? row.value, unit: family.unit }),
    ...(hasBand ? { p10: row.p10, p90: row.p90 } : {}),
    status: board.state as ModelStatus,
    ...(board.caveat ? { caveat: board.caveat } : {}),
    ...(board.reason ? { reason: board.reason } : {}),
    modelId: artifact.model?.id ?? "nfl-regular-season-public-v1",
    modelVersion: artifact.model?.version ?? 0,
    forecastAt: artifact.generatedAt,
  };

  return {
    sport: "nfl",
    predictionId: `${board.family}:${row.playerId}:${row.providerEventId}`,
    marketFamily: board.family,
    marketLabel: family.label,
    player,
    game,
    /* A captured price wins over a typed absence; an absence is never rendered as a price. */
    market: row.market ? marketFromFrozenCapture(row.market) : marketFromPricingState(row.pricingState),
    model,
  };
}

/** Every renderable row of a board, in the board's own order. */
export function presentWeeklyBoard(artifact: WeeklyBoardsArtifact, board: WeeklyBoard): PredictionPresentation[] {
  return (board.rows ?? [])
    .map((r) => presentWeeklyBoardRow(artifact, board, r))
    .filter((p): p is PredictionPresentation => p !== null);
}

// ── ENDZONE VAULT (anytime touchdown, the /nfl hub) ─────────────────────────────────────────────────

/** A Vault selection/watchlist entry, as the artifact already writes it. */
export interface VaultCandidate {
  playerId: string;
  name: string;
  team: string;
  position?: string | null;
  opponent?: string | null;
  event: string;
  providerEventId?: string | null;
  kickoffUtc?: string | null;
  tdProbability: number;
  roleState: string;
  /**
   * The Vault's own price slot, filled by its producer from the canonical capture.
   *
   * ⚠ IT WAS THE LITERAL `null` UNTIL 2026-09-24, and nothing here could tell that apart from a
   * genuine absence — which is why the branch below used to hardcode one.
   */
  marketPrice?: { yesOdds?: number; sportsbook?: string; capturedAt?: string } | null;
  /** The producer's typed absence for a row with no price. Null when a price IS held; never both. */
  pricingState?: string | null;
}

/**
 * The Vault's anytime-touchdown card in the same grammar as the weekly boards.
 *
 * NO JOIN. The Vault artifact carries its own `opponent`, `providerEventId` and `kickoffUtc`, so the
 * game context is read from the row rather than reconstructed by parsing the rendered `event` string
 * or matched against the forecast set — the kind of UI join that ends in a minted identity.
 *
 * And it carries its own `marketPrice`, which is `null`. That null is the reason this renders a typed
 * absence rather than nothing: the Vault has a price slot and the slot is empty, which is a fact worth
 * printing. A price appears here only if the artifact starts carrying one, with its book and the
 * instant it was captured — both required by `marketFromFrozenCapture`.
 */
export function presentVaultCandidate(
  c: VaultCandidate,
  ctx: { forecastAt: string; modelId: string; modelVersion: number | string },
): PredictionPresentation {
  /*
   * ⚠ THE ABSENCE USED TO BE HARDCODED `NOT_AUTHORIZED`, AND IT BECAME A FALSE STATEMENT.
   *
   * That constant was defensible while the Vault's `marketPrice` was a literal `null` and the NFL
   * odds authorization genuinely excluded props: there was no typed state on the row to read, and
   * "we hold no authorization for this" was the true reason. Both halves changed on 2026-09-24 —
   * the founder authorized the five families, and the Vault's producer now fills the slot from the
   * canonical capture — so every unpriced Vault row was telling readers we lack an authorization we
   * hold, ON THE SAME PAGE as weekly-board rows showing a DraftKings price for the same player.
   *
   * The row's own `pricingState` is read instead, exactly as a weekly-board row's is. The fallback
   * stays the least-claiming state rather than the most convenient one: with no typed state on the
   * row we do not know that we asked, so `marketFromPricingState` resolves it to NOT_PROBED.
   */
  const price = c.marketPrice;
  const market =
    price && price.sportsbook && price.capturedAt
      ? marketFromFrozenCapture({ yesOdds: price.yesOdds, sportsbook: price.sportsbook, capturedAt: price.capturedAt })
      : marketFromPricingState(c.pricingState);

  return {
    sport: "nfl",
    predictionId: `anytime_td:${c.playerId}:${c.providerEventId ?? c.event}`,
    marketFamily: "anytime_td",
    marketLabel: NFL_FAMILIES.anytime_td.label,
    player: { playerId: c.playerId, name: c.name, teamAbbr: c.team, portraitId: espnAthleteId(c.playerId) },
    game: {
      opponentAbbr: c.opponent ?? "",
      providerEventId: c.providerEventId ?? "",
      startTimeUtc: c.kickoffUtc ?? "",
      participation: c.roleState,
    },
    market,
    model: {
      kind: "PROBABILITY",
      probability: c.tdProbability,
      status: "PUBLISHED",
      modelId: ctx.modelId,
      modelVersion: ctx.modelVersion,
      forecastAt: ctx.forecastAt,
    },
  };
}

// ── GAME REPORT (the per-event player board, /nfl/game/[eventId]) ───────────────────────────────────

/** One player's row on a per-game board, exactly as `build-nfl-player-board.mjs` writes it. */
export interface PlayerBoardMarket {
  mean?: number;
  p10?: number;
  median?: number;
  p90?: number;
  probability?: number;
  /** A real captured price for this player, family and event. Never present beside `pricingState`. */
  market?: { line?: number; overOdds?: number; underOdds?: number; yesOdds?: number; sportsbook: string; capturedAt: string };
  /** The producer's typed absence. Never present beside `market`. */
  pricingState?: string;
}

export interface PlayerBoardPlayer {
  playerId: string;
  name: string;
  team: string;
  participation: string;
  markets: Record<string, PlayerBoardMarket>;
}

export interface PlayerBoardContext {
  providerEventId: string;
  kickoffUtc: string;
  /** The two clubs, so the opponent is READ rather than parsed out of a rendered matchup string. */
  teams: [string, string];
  families: Record<string, { label?: string; state?: string; reason?: string; caveat?: string }>;
  generatedAt: string;
  model?: { id?: string; version?: number | string } | null;
}

/**
 * One family of one player on a game report, in the SAME grammar the weekly boards use.
 *
 * ⚠ WHY THIS EXISTS: THE GAME REPORT WAS THE ONE NFL SURFACE WITH NO MARKET HALF AT ALL. The hub and
 * the week route rendered "DraftKings · O/U 78.5 · O -111 · U -113" beside a model number; the game
 * page — same player, same family, same game, one click away — rendered the model number alone.
 * Silence is not a neutral default here: a reader who has just seen the price on the board and does
 * not see it on the report reasonably concludes it does not apply to this game. That is the same
 * error as the hub printing "Not checked" over a priced row, said a quieter way.
 *
 * NORMALISATION ONLY, and NO JOIN. The producer already stamped each family row with a price or a
 * typed absence through `lib/sports/nfl/prop-price-lookup.mjs`; this names the parts. The opponent
 * comes from the board's own two clubs, never from parsing the rendered matchup label.
 *
 * Returns null for a family this contract does not publish — fail-closed, for the same reason the
 * weekly-board adapter does: a number with no unit beside a probability is the confusion the whole
 * presentation contract exists to remove.
 */
/**
 * The live rows for one game, indexed for the adapter below.
 *
 * ⚠ KEYED EXPLICITLY, NOT BY STRING EQUALITY. The live artifact's own predictionId is
 * `event:player:family` and the presentation's is `family:player:event` — the same three parts in a
 * different order. Comparing them directly would silently match nothing, and a live panel that is
 * simply always empty is the hardest kind of bug to notice.
 */
export type LivePropRow = {
  playerId: string;
  family: string;
  live?: { phase: string; statValue: number | null; clock: string | null; period: number | null; score: { home: number; away: number } | null } | null;
  settlement?: { state: string; finalStat: number | null; line: number | null; lineResult: string | null; forecastResult: string | null } | null;
};
export function indexLiveProps(artifact: { rows?: LivePropRow[] } | null | undefined): Map<string, LivePropRow> {
  const out = new Map<string, LivePropRow>();
  for (const r of artifact?.rows ?? []) if (r?.playerId && r?.family) out.set(`${r.playerId}|${r.family}`, r);
  return out;
}

/**
 * ONE ROW TYPE, ONE PHASE VOCABULARY — whichever source built the row.
 *
 * `LivePropRow.live.phase` is the producer's vocabulary (`PRE | IN_PROGRESS | FINAL`). The live
 * gateway's envelope speaks a wider one (`PRE | LIVE | FINAL | POSTPONED | CANCELLED | DELAYED |
 * UNKNOWN`). Two words for "in play" reaching one field is how a consumer ends up checking for the
 * one its own author happened to know, so the translation happens HERE, once, and the row type goes
 * on having a single phase language.
 *
 * A state we cannot express as a factual in-play observation — postponed, cancelled, unknown —
 * produces NO ROW. The alternative is choosing a phase for it, and that is a claim about a game
 * rather than a reading of one.
 *
 * ⚠ THE GATEWAY IS THE CANONICAL FACTUAL OWNER, and this adapter is the only door in. It does not
 * compute a stat, fill a gap, or carry a default: `statValue` is `null` where the box score had no
 * number, exactly as the gateway read it, because a blank cell is not a zero.
 */
type LiveEnvelope = {
  state?: string | null;
  /** `clock` is already null unless the game is LIVE — the gateway refuses to show 0:00 on a final. */
  period?: { number?: number | null; clock?: string | null } | null;
  /** An OBJECT, not an array: the gateway resolves the sides by homeAway and hands them over named. */
  competitors?: { home?: { score?: number | null } | null; away?: { score?: number | null } | null } | null;
  playerStats?: Array<{ playerId?: string | null; market?: string | null; value?: number | null }> | null;
};

const PHASE_BY_LIVE_STATE: Record<string, "IN_PROGRESS" | "FINAL"> = {
  LIVE: "IN_PROGRESS",
  DELAYED: "IN_PROGRESS",
  FINAL: "FINAL",
};

export function liveRowsFromEnvelope(envelope: LiveEnvelope | null | undefined): LivePropRow[] {
  const phase = PHASE_BY_LIVE_STATE[String(envelope?.state ?? "")];
  if (!phase) return [];

  /*
   * The score comes from the sides the gateway already resolved by homeAway — never by array
   * position. A side without a stated score leaves the WHOLE score null: "21 - null" is not a
   * scoreline, and half a score is worse than none.
   */
  const home = envelope?.competitors?.home?.score;
  const away = envelope?.competitors?.away?.score;
  const score = typeof home === "number" && typeof away === "number" ? { home, away } : null;

  // A clock and a period are a "now", and only a game in play has one. The gateway already nulls the
  // clock outside LIVE; this does not reinstate it from the period label on a finished game.
  const clock = phase === "IN_PROGRESS" ? envelope?.period?.clock ?? null : null;
  const period = phase === "IN_PROGRESS" ? envelope?.period?.number ?? null : null;

  const rows: LivePropRow[] = [];
  for (const s of envelope?.playerStats ?? []) {
    // An unmapped player keeps a null playerId upstream and is honest live fact there — but it cannot
    // be joined to a forecast, and a row that cannot be joined has nothing to say on a prop line.
    if (!s?.playerId || !s?.market) continue;
    rows.push({
      playerId: s.playerId,
      family: s.market,
      live: { phase, statValue: typeof s.value === "number" ? s.value : null, clock, period, score },
    });
  }
  return rows;
}

export function presentPlayerBoardRow(
  ctx: PlayerBoardContext,
  player: PlayerBoardPlayer,
  familyKey: string,
  liveIndex?: Map<string, LivePropRow>,
): PredictionPresentation | null {
  const family = NFL_FAMILIES[familyKey];
  if (!family) return null;
  const m = player.markets?.[familyKey];
  if (!m) return null;
  const famState = ctx.families?.[familyKey]?.state;
  if (famState !== "PUBLISHED" && famState !== "ESTIMATE") return null;

  const hasBand = m.p10 != null && m.p90 != null;
  const opponent = ctx.teams.find((t) => t !== player.team) ?? "";

  return {
    sport: "nfl",
    predictionId: `${familyKey}:${player.playerId}:${ctx.providerEventId}`,
    marketFamily: familyKey,
    marketLabel: family.label,
    player: {
      playerId: player.playerId,
      name: player.name,
      teamAbbr: player.team,
      portraitId: espnAthleteId(player.playerId),
    },
    game: {
      opponentAbbr: opponent,
      providerEventId: ctx.providerEventId,
      startTimeUtc: ctx.kickoffUtc,
      participation: player.participation,
    },
    /* A captured price wins over a typed absence, and the two never coexist on a producer row. */
    market: m.market ? marketFromFrozenCapture(m.market) : marketFromPricingState(m.pricingState),
    model: {
      kind: family.kind,
      ...(family.kind === "PROBABILITY"
        ? { probability: m.probability }
        : { predictedValue: m.median != null ? Math.round(m.median) : undefined, unit: family.unit }),
      ...(hasBand ? { p10: Math.round(m.p10 as number), p90: Math.round(m.p90 as number) } : {}),
      status: (famState === "ESTIMATE" ? "ESTIMATE" : "PUBLISHED") as ModelStatus,
      ...(ctx.families[familyKey]?.caveat ? { caveat: ctx.families[familyKey].caveat } : {}),
      ...(ctx.families[familyKey]?.reason ? { reason: ctx.families[familyKey].reason } : {}),
      modelId: ctx.model?.id ?? "nfl-regular-season-public-v1",
      modelVersion: ctx.model?.version ?? 0,
      forecastAt: ctx.generatedAt,
    },
    /*
     * ⚠ THE LIVE SLOT IS FILLED FROM THE CANONICAL LIVE ARTIFACT AND FROM NOTHING ELSE. It is not
     * derived here, not inferred from the model, and not defaulted — a row with no live artifact has
     * no live slot at all, which is how a pregame board stays a pregame board.
     */
    ...(liveSlotFor(liveIndex, player.playerId, familyKey, famState) ?? {}),
  };
}

/** The live slot for one row, or undefined. PRE is treated as no slot: it carries no observation. */
function liveSlotFor(index: Map<string, LivePropRow> | undefined, playerId: string, familyKey: string, famState?: string) {
  /*
   * ⚠ A LIVE VALUE ONLY ATTACHES TO A PUBLISHED FAMILY, AND THE STATE IS PER GAME.
   *
   * A row renders for PUBLISHED *and* ESTIMATE, because an estimate is a real number shown with the
   * bar it failed. A live stat beside it is a different claim: it invites the reader to compare an
   * actual against a forecast that did not clear, which is the comparison an ESTIMATE label exists to
   * withhold.
   *
   * `player_pass_yds` is kept out at the gateway because it is ESTIMATE everywhere (P318 is STOP).
   * That is a GLOBAL decision and it is not enough on its own: `player_rush_yds` is PUBLISHED on 32
   * committed boards and ESTIMATE on 16, so the same family is publishable in one game and not in the
   * next. Only a per-row check can tell those apart, and without it a live rushing number would have
   * appeared beside an estimate the first time a board downgraded that family.
   *
   * Unknown fails closed: a state we cannot read is not permission.
   */
  if (famState !== "PUBLISHED") return undefined;
  const r = index?.get(`${playerId}|${familyKey}`);
  if (!r) return undefined;
  const factual = r.live && r.live.phase !== "PRE" ? r.live : null;
  const settlement = r.settlement && r.settlement.state !== "PENDING" ? r.settlement : null;
  if (!factual && !settlement) return undefined;
  return { live: { ...(factual ? { factual } : {}), ...(settlement ? { settlement } : {}) } } as Partial<PredictionPresentation>;
}

/** Every renderable row of ONE family on a game report, in the board's own order. */
export function presentPlayerBoardFamily(
  ctx: PlayerBoardContext,
  players: PlayerBoardPlayer[],
  familyKey: string,
  liveIndex?: Map<string, LivePropRow>,
): PredictionPresentation[] {
  return players
    .map((p) => presentPlayerBoardRow(ctx, p, familyKey, liveIndex))
    .filter((p): p is PredictionPresentation => p !== null);
}
