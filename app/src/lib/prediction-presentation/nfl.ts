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
 * MEASURED, FOR THE RECORD (2026-09-23 capture): the NFL odds lane owns game-level h2h/spreads/totals
 * and NO player props. Twenty of the forty-seven committed captures ran the prop probe, and every one
 * recorded `absentMarkets: [player_anytime_td, player_pass_yds, player_rush_yds, player_reception_yds,
 * player_receptions]` with `offeredMarkets: []` — all five families these boards publish. So the market
 * half of every card below is a typed absence today, and it will start carrying numbers the moment an
 * owner starts producing them, without a renderer change.
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
  /** The Vault's own price slot. It is `null` today and has never been anything else. */
  marketPrice?: { yesOdds?: number; sportsbook?: string; capturedAt?: string } | null;
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
  const price = c.marketPrice;
  const market =
    price && price.sportsbook && price.capturedAt
      ? marketFromFrozenCapture({ yesOdds: price.yesOdds, sportsbook: price.sportsbook, capturedAt: price.capturedAt })
      : marketFromPricingState("NOT_AUTHORIZED");

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
