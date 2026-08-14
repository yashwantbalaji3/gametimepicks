/**
 * Which sports may contribute a leg to a paper product — as a CONTRACT, not an accident.
 *
 * Program 177 · Release C. Until now NFL was absent from the paper products for a purely
 * incidental reason: `buildPersistedDailyPortfolio` composes its pool from a World Cup loader and
 * an MLB loader, and nobody ever wrote an NFL one. Nothing in the money path actually said "an
 * experimental NFL forecast is not allowed to be a leg". The day someone adds an NFL loader —
 * reasonably, while wiring something else — experimental output would flow straight into a paper
 * ladder, silently, and the two-tier truth contract would be broken by omission rather than by
 * decision.
 *
 * This module makes the omission explicit. Every sport is REGISTERED, and each registration says
 * whether its output may become a leg and why. NFL is registered and refused, naming the gate that
 * refuses it (`permitsProductLeg`, which is true only for VALIDATED_PICK — a state the NFL
 * public-beta engine cannot emit). The refusal is therefore evidence-shaped: it names what would
 * change it, and it disappears on its own the day a validated NFL model exists.
 *
 * Pure: no fs, no fetch, no clock. Callable from a server component, a script, or a test.
 */

/** The canonical sport key carried on a `ModelPick`. Absent means World Cup, per ModelPick's own contract. */
export type LegSportKey = "WORLD_CUP" | "MLB" | "NFL" | "NBA" | "UFC";

export interface SportLegRule {
  sport: LegSportKey;
  label: string;
  /** May a pick from this sport become a leg in Bank Builder or Moonshot? */
  eligible: boolean;
  /** Why — in the words a reader would need, never a code. */
  reason: string;
  /** What would have to become true for an ineligible sport to qualify. Empty when already eligible. */
  whatWouldQualify: string[];
}

/**
 * The registry. A sport missing from this table is refused by `legSportEligibility` — unknown is
 * never treated as allowed, because "we did not think about it" must not read as "it is fine".
 */
export const SPORT_LEG_RULES: Readonly<Record<LegSportKey, SportLegRule>> = Object.freeze({
  WORLD_CUP: {
    sport: "WORLD_CUP",
    label: "World Cup",
    eligible: true,
    reason: "team and game-market legs from the de-vigged consensus pool — the original paper-product source",
    whatWouldQualify: [],
  },
  MLB: {
    sport: "MLB",
    label: "MLB",
    eligible: true,
    reason: "model-qualified MLB legs from the daily board",
    whatWouldQualify: [],
  },
  NFL: {
    sport: "NFL",
    label: "NFL",
    eligible: false,
    reason:
      "the NFL model is an explicitly experimental preseason beta. Its outputs classify as PUBLIC_EXPERIMENTAL or EXPERIMENTAL_LEAN, and only a VALIDATED_PICK may become a product leg — so no NFL forecast can enter a paper card today, however large its difference from the market looks",
    whatWouldQualify: [
      "an NFL model version that meets its own preregistered promotion bar on held-out data",
      "a settled experimental record with enough graded games to measure calibration",
      "an explicit `validated` block on the forecast — the classifier requires one and the beta engine never emits it",
    ],
  },
  NBA: {
    sport: "NBA",
    label: "NBA",
    eligible: false,
    reason: "the NBA adapter is historical-only; no current NBA model output is published",
    whatWouldQualify: ["a current NBA board with published model output", "a validated NBA model version"],
  },
  UFC: {
    sport: "UFC",
    label: "UFC",
    eligible: false,
    reason: "the UFC surface is a settled archive; no current fight output is produced",
    whatWouldQualify: ["a current UFC board", "a validated UFC model version"],
  },
});

/** Normalise whatever a pick carries into a registry key. Absent = World Cup, per ModelPick. */
export function normalizeLegSport(sport: string | null | undefined): string {
  return (sport ?? "WORLD_CUP").toString().trim().toUpperCase().replace(/[\s-]+/g, "_");
}

export interface LegSportVerdict {
  sport: string;
  eligible: boolean;
  reason: string;
  /** True when the sport is not in the registry at all — refused, and reported as unregistered. */
  unregistered: boolean;
}

/**
 * Decide whether one leg's sport may enter a paper product. Fail-closed: an unregistered sport is
 * refused and says so, rather than inheriting the permissive default that made NFL's exclusion
 * accidental in the first place.
 */
export function legSportEligibility(pick: { sport?: string | null }): LegSportVerdict {
  const key = normalizeLegSport(pick?.sport);
  const rule = (SPORT_LEG_RULES as Record<string, SportLegRule>)[key];
  if (!rule) {
    return {
      sport: key,
      eligible: false,
      reason: `${key} is not a registered paper-product sport — an unregistered sport is refused, never allowed by default`,
      unregistered: true,
    };
  }
  return { sport: key, eligible: rule.eligible, reason: rule.reason, unregistered: false };
}

/** The sports currently allowed to contribute legs — derived from the registry, never hand-listed. */
export function eligibleLegSports(): LegSportKey[] {
  return (Object.keys(SPORT_LEG_RULES) as LegSportKey[]).filter((k) => SPORT_LEG_RULES[k].eligible);
}
