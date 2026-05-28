/**
 * Lane-display map — UI-only rename of risk profiles.
 *
 * Internal `ParlayRiskProfile` keys stay unchanged everywhere (optimizer
 * payload, settlement, snapshots, tests). This module is the single
 * source of truth for the *displayed* names so the page header, slip
 * card, high-variance toggle, and any future surface all read the
 * same labels.
 *
 *   conservative → Anchor    · lower-variance builds
 *   balanced     → Core      · balanced profile
 *   star_power   → Spotlight · recognizable-player builds
 *   aggressive   → Swing     · high-variance, opt-in only
 *
 * Honest UI: no "safe", no "guaranteed", no certainty claims. The
 * Swing lane stays opt-in / hidden by default.
 */
import type { ParlayRiskProfile } from "./parlay-suggested";

export type LaneTone = "anchor" | "core" | "spotlight" | "swing";

export interface LaneDisplay {
  /** The human-readable label users see (e.g. "Anchor"). */
  name: string;
  /** Short subtitle clarifying the lane's profile. */
  subtitle: string;
  /** Tone key — drives a single accent token across surfaces. */
  tone: LaneTone;
  /** Monospaced glyph used as the lane's icon (single character so it
   *  renders consistently across desktop + mobile without an asset). */
  icon: string;
  /** CSS var name that callers should resolve to a colour. */
  accentVar: string;
}

const LANE_MAP: Record<ParlayRiskProfile, LaneDisplay> = {
  conservative: {
    name: "Anchor",
    subtitle: "Lower-variance builds",
    tone: "anchor",
    icon: "◆",
    accentVar: "var(--vault-success)",
  },
  balanced: {
    name: "Core",
    subtitle: "Balanced profile",
    tone: "core",
    icon: "◈",
    accentVar: "var(--vault-gold-bright)",
  },
  star_power: {
    name: "Spotlight",
    subtitle: "Recognizable-player builds",
    tone: "spotlight",
    icon: "★",
    accentVar: "var(--vault-gold-bright)",
  },
  aggressive: {
    name: "Swing",
    subtitle: "High-variance · opt-in only",
    tone: "swing",
    icon: "⟁",
    accentVar: "var(--vault-warn)",
  },
};

export function getLaneDisplay(profile: ParlayRiskProfile): LaneDisplay {
  return LANE_MAP[profile] ?? LANE_MAP.balanced;
}

/** All four lane display entries in canonical order — Anchor first,
 *  Swing last. Used by surfaces that want to render the full set
 *  (e.g. the high-variance toggle label). */
export const LANE_DISPLAY_ORDER: ReadonlyArray<{
  profile: ParlayRiskProfile;
  display: LaneDisplay;
}> = [
  { profile: "conservative", display: LANE_MAP.conservative },
  { profile: "balanced", display: LANE_MAP.balanced },
  { profile: "star_power", display: LANE_MAP.star_power },
  { profile: "aggressive", display: LANE_MAP.aggressive },
] as const;
