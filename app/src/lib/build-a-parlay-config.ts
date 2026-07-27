/**
 * build-a-parlay-config — pure, testable config for the redesigned Build a
 * Parlay surface (Quick Generate / Manual Build). Keeps the build-type switch,
 * status chips, and sport-scope options out of the JSX so they can be unit
 * tested and so the sport scope is DERIVED from the capability registry
 * (modeled sports only — never a schedule-only/coming-soon sport).
 *
 * No fabrication, no performance claims. Mixed = custom only (NBA + MLB).
 */
import { MODELED_SPORT_KEYS, getSportCapabilities } from "./sport-capabilities";

export type BuildType = "quick" | "manual";

export interface BuildTypeOption {
  key: BuildType;
  label: string;
  sub: string;
}

/** The two ways to build a custom card. Only ONE renders at a time. */
export const BUILD_TYPES: ReadonlyArray<BuildTypeOption> = [
  {
    key: "quick",
    label: "Quick Generate",
    sub: "Generate custom cards from available model legs",
  },
  {
    key: "manual",
    label: "Manual Build",
    sub: "Pick legs yourself and score the card",
  },
];

/** Honest status chips shown in the Build a Parlay header. */
export const BUILD_STATUS_CHIPS: ReadonlyArray<string> = [
  "Custom",
  "Modeled sports only",
  "Not officially tracked",
];

export interface BuildSportScopeOption {
  /** A modeled sport key, or "mixed" for a cross-modeled-sport scope. */
  key: string;
  label: string;
  /** True for the cross-sport ("mixed") scope. */
  mixed: boolean;
}

/**
 * Sport scopes available to Build a Parlay, derived from the capability registry: each
 * Build-Your-Own-eligible sport, plus a "Mixed" scope when ≥2 such sports exist.
 * Schedule-only / coming-soon / historical-only sports are never returned.
 *
 * Deliberately NOT a hardcoded list. A sport appears here the moment its capability state
 * says it may enter prediction products, and disappears the moment it may not — the "Mixed"
 * scope likewise appears on its own once a second sport qualifies.
 */
export function buildSportScopeOptions(): BuildSportScopeOption[] {
  const modeled = MODELED_SPORT_KEYS.filter(
    (k) => getSportCapabilities(k).hasBuildYourOwn,
  );
  const out: BuildSportScopeOption[] = modeled.map((k) => ({
    key: k,
    label: k.toUpperCase(),
    mixed: false,
  }));
  if (modeled.length >= 2) {
    out.push({
      key: "mixed",
      label: `Mixed ${modeled.map((k) => k.toUpperCase()).join(" + ")}`,
      mixed: true,
    });
  }
  return out;
}
