/**
 * THE BUILDER POOL'S WIRE FORMAT — atoms in, display derived at the point of use.
 *
 * Program 230 · Release 0. Node-free by construction: the server projects atoms and the client
 * hydrates them, so both runtimes must be able to load this module. (P229 learned this the hard
 * way — a shared contract placed in a module that reads the filesystem pulled `node:fs` into the
 * browser bundle and webpack refused the build, correctly.)
 *
 * WHY THIS EXISTS. `/build/custom` truncated the builder pool at 180 legs — `out.slice(0, 180)` —
 * with no disclosure anywhere on the page. On the 2026-09-01 slate that silently dropped 193 of 373
 * eligible legs while the marketplace heading beside it said "Legs (373)".
 *
 * The cap was compensating for a wasteful row. 61% of every `BuildLeg` was DERIVED STRINGS shipped
 * next to the atoms they derive from:
 *
 *     slipLeg      57.6 KB   re-ships player/market/side/line/odds/matchup — all already present
 *     photo        26.0 KB   MLB headshot URLs, a pure function of playerId
 *     label         7.7 KB   `${participant} · ${market} ${Side} ${line}`
 *     searchKey     7.4 KB   the same string, lowercased
 *     sublabel      4.4 KB   `${sportLabel} · ${market}`
 *     marketLabel   3.1 KB   byte-identical to `market`
 *     sportLabel    1.1 KB   a four-entry lookup on `sport`
 *     gameLabel     0.9 KB   `${team} vs ${opponent}`
 *
 * Carrying atoms costs 294 B/leg against 1010, so the FULL 373-leg pool serializes to 107 KB where
 * the capped 180-leg pool cost 177 KB. Removing the waste removes the reason for the cap: the
 * payload goes DOWN by 70 KB and 193 more legs become reachable.
 *
 * DERIVATION IS NOT COMPRESSION. Every field below is reconstructed by a pure total function of the
 * atoms — same atoms in, byte-identical `BuildLeg` out. Nothing is approximated, rounded or dropped:
 * a projection that changed a displayed value would be a different page, not a smaller one.
 */
import type { SportKey, RiskTier } from "@/lib/normalize";
import type { BuildLeg } from "@/lib/build-legs";
import { mlbHeadshotUrl, nbaHeadshotUrl } from "@/lib/player-headshots";
import { tierFromOdds as tierFromOddsShared } from "@/lib/build/risk-tier.mjs";

const tierFromOdds = tierFromOddsShared as (o: number) => RiskTier;

export const SPORT_LABEL: Record<SportKey, string> = {
  world_cup: "World Cup",
  mlb: "MLB",
  nba: "NBA",
  ufc: "UFC",
};

/**
 * One buildable leg, reduced to what cannot be recomputed.
 *
 * Optional fields are OMITTED rather than sent as null: across a 373-leg MLB slate `countryCode`,
 * `photoUrl` and the World Cup flags are absent on every row, and `"key":null` costs the same bytes
 * as a value. Absence and null mean the same thing here — the hydrator treats a missing key as null.
 */
export interface BuildLegAtoms {
  id: string;
  sport: SportKey;
  gameId?: string | number | null;
  participant: string;
  market: string;
  side?: string | null;
  line?: number | null;
  team?: string | null;
  opponent?: string | null;
  americanOdds: number;
  modelProbability?: number | null;
  survivalScore?: number | null;
  /** Headshot source. `photo` is derived from this for MLB/NBA; World Cup carries an explicit URL. */
  playerId?: number | null;
  photoUrl?: string | null;
  /** Identity kind. Omitted for the common "player" case. */
  kind?: "player" | "team" | "fighter";
  sourceDate?: string | null;
  prelineup?: boolean;
  regulationOnly?: boolean;
  bankBuilderEligible?: boolean;
}

/** Sentence-case the pick side exactly as the label and slip have always rendered it. */
function sideLabel(side: string | null | undefined): string {
  return side ? `${side[0].toUpperCase()}${side.slice(1)}` : "";
}

/** The headshot URL for a leg, or null. MLB/NBA derive from the id; World Cup carries its own. */
function photoFor(a: BuildLegAtoms): string | null {
  if (a.sport === "world_cup") return a.photoUrl ?? null;
  if (a.sport === "mlb") return mlbHeadshotUrl(a.playerId ?? null);
  if (a.sport === "nba") return nbaHeadshotUrl(a.playerId ?? null);
  return null;
}

/**
 * Reconstruct the full display leg. Pure and total — every branch returns a complete `BuildLeg`.
 */
export function hydrateBuildLeg(a: BuildLegAtoms): BuildLeg {
  const side = sideLabel(a.side);
  const lineStr = a.line != null ? ` ${a.line}` : "";
  const photo = photoFor(a);
  const matchup = a.team && a.opponent ? `${a.team} vs ${a.opponent}` : (a.team ?? null);
  return {
    id: a.id,
    sport: a.sport,
    sportLabel: SPORT_LABEL[a.sport],
    gameId: a.gameId ?? null,
    gameLabel: matchup ?? undefined,
    label: `${a.participant} · ${a.market}${side ? ` ${side}` : ""}${lineStr}`.trim(),
    sublabel: `${SPORT_LABEL[a.sport]} · ${a.market}`,
    market: a.market,
    marketLabel: a.market,
    riskTier: tierFromOdds(a.americanOdds),
    americanOdds: a.americanOdds,
    modelProbability: a.modelProbability ?? null,
    sourceDate: a.sourceDate ?? null,
    photo,
    prelineup: a.prelineup ?? false,
    regulationOnly: a.regulationOnly ?? false,
    bankBuilderEligible: a.bankBuilderEligible ?? false,
    searchKey: `${a.participant} ${a.team ?? ""} ${a.market} ${side} ${a.line ?? ""}`.toLowerCase(),
    slipLeg: {
      sport: a.sport,
      player: a.participant,
      marketLabel: a.market,
      side: side || (a.side ?? ""),
      line: a.line ?? null,
      americanOdds: a.americanOdds,
      matchup,
      photoUrl: photo,
      teamAbbr: a.team ?? null,
      opponentAbbr: a.opponent ?? null,
    },
  };
}

/** Hydrate a pool. Order is preserved — the pool arrives survival-sorted and must stay that way. */
export function hydrateBuildLegs(atoms: BuildLegAtoms[]): BuildLeg[] {
  return atoms.map(hydrateBuildLeg);
}
