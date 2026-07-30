/**
 * PER-SPORT MARKET CENTER CONFIGURATION — the three seams, and only three.
 *
 * `lib/markets/` was written for MLB and is MLB-hardcoded at exactly three points (audited in
 * docs/NBA_RESEARCH_ADAPTER_READINESS.md §3.3):
 *
 *   1. FAMILY VOCABULARY   which game and player families a sport offers (types.ts is the union of
 *                          everything representable; this decides what each sport actually posts)
 *   2. DATA ROOT           `load.ts` read `public/data/mlb` as a module constant
 *   3. CALIBRATION SOURCE  `pairing.ts` imported `../mlb/model-calibration-status` directly
 *
 * Parameterising those three is the whole change. Nothing is copied: there is one Market Center, one
 * pairing registry, one loader, and a second sport supplies a config instead of a second stack. A
 * forked MLB stack would drift, and the drift would show up as two surfaces disagreeing about the
 * same market — the failure the pairing registry exists to prevent.
 *
 * MLB'S CONFIG IS A RESTATEMENT, NOT A REDESIGN. Every value below is what the code already did.
 * `sport-config.test.mjs` asserts that directly, because "we parameterised it and MLB is fine" is a
 * claim, and the point of the seam is that it costs MLB nothing.
 *
 * NBA IS MARKET INTELLIGENCE WITH NO MODEL. Game markets only (moneyline / spread / total), de-vig
 * as the first-class output, movement only where several real captures exist. `model: NONE` is not
 * a placeholder for a model arriving later — the historical NBA model is below coin-flip with
 * `publicApproved:false`, and the honest product is the market layer. `NoModelOutput` types the
 * model-derived fields as `never` so a no-model sport cannot carry one even by accident.
 */
import {
  MLB_MARKET_CALIBRATION,
  modelBeatsMarket,
} from "../mlb/model-calibration-status";
import type { GameMarketFamily, PlayerMarketFamily } from "./types";
import { PLAYER_FAMILY_BY_PROVIDER_KEY } from "./types";

export const MLB_SPORT_KEY = "mlb";
export const NBA_SPORT_KEY = "nba";

/**
 * The fields a no-model sport may never carry.
 *
 * `never` rather than "omit them by convention": a convention is enforced by whoever remembers it,
 * and the thing being prevented — a lean or a probability appearing on an NBA row — is exactly what
 * the ratified strategy forbids publishing. A row typed with this cannot be constructed with any of
 * them, so the guard is the compiler rather than a reviewer.
 */
export interface NoModelOutput {
  readonly modelProbability?: never;
  readonly simulationProbability?: never;
  readonly projection?: never;
  readonly lean?: never;
  readonly pick?: never;
  readonly edgePct?: never;
  readonly confidence?: never;
}

/** A sport with no model. The reason is required — "none yet" and "measured and rejected" differ. */
export interface NoSportModel {
  readonly kind: "NONE";
  readonly reason: string;
  readonly evidence: readonly string[];
}

/** A sport whose model produces simulations and player-prop projections. */
export interface SimulationSportModel {
  readonly kind: "SIMULATION_AND_PROPS";
  readonly modeledGameFamilies: ReadonlySet<GameMarketFamily>;
  /** Model-artifact keys, not canonical families — the registry is keyed the artifact's way. */
  readonly modeledPlayerFamilyKeys: ReadonlySet<string>;
  /**
   * Has this family been VALIDATED to out-predict the de-vigged market? False for every MLB family
   * today. Carried as a function so pairing reads the registry rather than a copy of it.
   */
  readonly beatsMarket: (modelKey: string) => boolean;
}

export type SportModel = NoSportModel | SimulationSportModel;

/** How a sport's line movement may be described. */
export type MovementPolicy =
  /** Movement is only real when several captures of the same event exist. Never inferred from one. */
  | "ONLY_WITH_MULTIPLE_CAPTURES"
  /** No snapshot history at all — movement is unbuildable, not unbuilt. */
  | "UNAVAILABLE_NO_HISTORY";

export interface SportMarketConfig {
  readonly sport: string;
  readonly league: string;
  /** SEAM 2 — directory under `public/data` holding this sport's artifacts. */
  readonly dataDir: string;
  /** SEAM 1 — game families this sport's book actually posts. */
  readonly gameFamilies: ReadonlySet<GameMarketFamily>;
  /** SEAM 1 — player families this sport's book actually posts. Empty is a real answer. */
  readonly playerFamilies: ReadonlySet<PlayerMarketFamily>;
  /** SEAM 1 — provider market string → canonical player family, for this sport's feed. */
  readonly playerFamilyByProviderKey: Readonly<Record<string, PlayerMarketFamily>>;
  /** SEAM 3 — what, if anything, this sport models. */
  readonly model: SportModel;
  /**
   * Whether de-vigged probability is a first-class output for this sport. MLB's artifacts already
   * carry `noVigProb` for game markets and the domain carries it through rather than recomputing.
   */
  readonly deVigIsFirstClass: boolean;
  readonly movement: MovementPolicy;
}

/**
 * MLB — a restatement of the behaviour that was hardcoded across the three seams.
 *
 * `modeledPlayerFamilyKeys` is derived from `MLB_MARKET_CALIBRATION` rather than listed, preserving
 * the existing rule that the calibration registry is the single source for what is modeled. A second
 * hand-maintained list would eventually disagree with it, and one of the two would be silently wrong.
 */
export const MLB_MARKET_CONFIG: SportMarketConfig = {
  sport: MLB_SPORT_KEY,
  league: "MLB",
  dataDir: "mlb",
  gameFamilies: new Set<GameMarketFamily>(["MONEYLINE", "RUN_LINE", "TOTAL"]),
  playerFamilies: new Set<PlayerMarketFamily>([
    "PITCHER_STRIKEOUTS",
    "PITCHER_OUTS",
    "PITCHER_EARNED_RUNS",
    "BATTER_HITS",
    "BATTER_TOTAL_BASES",
    "BATTER_HOME_RUNS",
    "BATTER_RBIS",
    "BATTER_RUNS_SCORED",
    "BATTER_HITS_RUNS_RBIS",
  ]),
  playerFamilyByProviderKey: PLAYER_FAMILY_BY_PROVIDER_KEY,
  model: {
    kind: "SIMULATION_AND_PROPS",
    modeledGameFamilies: new Set<GameMarketFamily>(["MONEYLINE", "RUN_LINE", "TOTAL"]),
    modeledPlayerFamilyKeys: new Set(Object.keys(MLB_MARKET_CALIBRATION)),
    beatsMarket: modelBeatsMarket,
  },
  deVigIsFirstClass: true,
  movement: "UNAVAILABLE_NO_HISTORY",
};

/**
 * NBA — market intelligence, no model.
 *
 * Game markets only. Player props are absent rather than empty-for-now: they require proven per-row
 * lineage and capture history over real season weeks, and the settlement whitelist that made a fifth
 * of the historical rows unsettleable was only expanded forward this sprint. Adding a prop family
 * here would make the surface show an empty prop section, which reads as breakage rather than scope.
 */
export const NBA_MARKET_CONFIG: SportMarketConfig = {
  sport: NBA_SPORT_KEY,
  league: "NBA",
  dataDir: "nba",
  gameFamilies: new Set<GameMarketFamily>(["MONEYLINE", "SPREAD", "TOTAL"]),
  playerFamilies: new Set<PlayerMarketFamily>(),
  playerFamilyByProviderKey: Object.freeze({}),
  model: {
    kind: "NONE",
    reason:
      "The historical NBA model is below coin-flip overall; its one above-0.5 family (REB, 0.5454) is still Brier +0.0069 worse than the de-vigged market, and it is publicApproved:false. Nothing model-derived is surfaced — no probability, no lean, no pick.",
    evidence: [
      "status/nba-first-market-recommendation.json",
      "docs/NBA_RESEARCH_ADAPTER_READINESS.md",
      "app/src/lib/sport-capability-registry.ts",
    ],
  },
  deVigIsFirstClass: true,
  movement: "ONLY_WITH_MULTIPLE_CAPTURES",
};

const BY_SPORT: ReadonlyMap<string, SportMarketConfig> = new Map([
  [MLB_SPORT_KEY, MLB_MARKET_CONFIG],
  [NBA_SPORT_KEY, NBA_MARKET_CONFIG],
]);

/** Config for a sport, or null. FAIL-CLOSED: an unregistered sport gets no market surface at all. */
export function marketConfigFor(sport: string | null | undefined): SportMarketConfig | null {
  return BY_SPORT.get(String(sport ?? "").trim().toLowerCase()) ?? null;
}

/** Does this sport model anything at all? */
export function hasModel(sport: string | null | undefined): boolean {
  return marketConfigFor(sport)?.model.kind === "SIMULATION_AND_PROPS";
}

/** The reason a sport publishes no model output, or null when it has one. */
export function noModelReason(sport: string | null | undefined): string | null {
  const model = marketConfigFor(sport)?.model;
  return model && model.kind === "NONE" ? model.reason : null;
}

/** Does this sport's book offer the family? Representable (types.ts) is a weaker claim than offered. */
export function sportOffersGameFamily(
  sport: string | null | undefined,
  family: GameMarketFamily | null,
): boolean {
  const config = marketConfigFor(sport);
  return Boolean(config && family && config.gameFamilies.has(family));
}
