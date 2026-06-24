/**
 * Shared MLB confidence primitive — a 4-tier visual confidence system (Elite / Strong / Playable /
 * Avoid) used across the Homer Nukes board and the props board so the labels and colors are identical
 * everywhere. The tier is derived ONLY from the de-vigged market-implied probability — it is a market
 * confidence read, NOT a model edge claim (no model is wired yet). Honest by construction; no fabrication.
 *
 * Two calibrations because the markets live on different probability scales:
 *   • tierFromProb        — general props (favorites-heavy: hits/bases/RBI often −200 or shorter)
 *   • homerTierFromProb   — anytime-HR legs (inherently longer: top bats sit ~20–40%)
 */

export type ConfTier = "elite" | "strong" | "playable" | "avoid";

export interface TierMeta {
  tier: ConfTier;
  label: string;   // "Elite" | "Strong" | "Playable" | "Avoid"
  fg: string;      // text/icon color (CSS var or literal)
  bg: string;      // pill background
  bars: number;    // 1..4 filled bars for a meter
}

export const TIER_META: Record<ConfTier, TierMeta> = {
  elite:    { tier: "elite",    label: "Elite",    fg: "var(--vault-success)", bg: "color-mix(in srgb, var(--vault-success) 16%, transparent)", bars: 4 },
  strong:   { tier: "strong",   label: "Strong",   fg: "#7fd1a8",              bg: "rgba(127,209,168,0.13)",                                      bars: 3 },
  playable: { tier: "playable", label: "Playable", fg: "#e7b15a",              bg: "rgba(231,177,90,0.13)",                                       bars: 2 },
  avoid:    { tier: "avoid",    label: "Avoid",    fg: "var(--vault-text-faint)", bg: "rgba(255,255,255,0.05)",                                   bars: 1 },
};

/** General prop confidence from de-vigged implied probability (favorites-heavy markets). */
export function tierFromProb(prob: number): ConfTier {
  if (prob >= 0.62) return "elite";
  if (prob >= 0.48) return "strong";
  if (prob >= 0.34) return "playable";
  return "avoid";
}

/** Anytime-HR leg confidence — calibrated to the HR probability band (top bats ~20–40%). */
export function homerTierFromProb(prob: number): ConfTier {
  if (prob >= 0.32) return "elite";
  if (prob >= 0.26) return "strong";
  if (prob >= 0.20) return "playable";
  return "avoid";
}

export const tierMeta = (t: ConfTier): TierMeta => TIER_META[t];
