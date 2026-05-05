/**
 * Display formatters. Pure, side-effect free, null-safe.
 *
 * Phase 7B-3.1 hotfix: every numeric formatter now accepts
 * `number | null | undefined` and returns the EM_DASH placeholder for any
 * non-finite value (null, undefined, NaN, ±Infinity). This lets components
 * safely pass model-output fields that may be null when a player's recent
 * game logs are unavailable (the "insufficient_data" path), without
 * fabricating zeros, negative signs, or "+0.0%".
 */

/** Universal placeholder for "no value" — keep in sync with prop-card UX. */
export const EM_DASH = "—";

/**
 * Type guard: true only for actual finite numbers.
 * Rejects null, undefined, NaN, +Infinity, -Infinity.
 */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function formatPercent(
  value: number | null | undefined,
  digits = 1,
): string {
  if (!isFiniteNumber(value)) return EM_DASH;
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatSignedPct(
  value: number | null | undefined,
  digits = 1,
): string {
  if (!isFiniteNumber(value)) return EM_DASH;
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

export function formatOdds(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) return EM_DASH;
  if (value > 0) return `+${value}`;
  return `${value}`;
}

export function formatStat(
  value: number | null | undefined,
  digits = 1,
): string {
  if (!isFiniteNumber(value)) return EM_DASH;
  return value.toFixed(digits);
}

export function formatDate(iso: string): string {
  // YYYY-MM-DD → "Apr 30"
  const [, m, d] = iso.split("-").map(Number);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[m - 1]} ${d}`;
}

export function formatDateLong(iso: string): string {
  // YYYY-MM-DD → "Thursday, April 30"
  const date = new Date(iso + "T12:00:00Z");
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function formatTimestamp(iso: string): string {
  // ISO → "Apr 30, 11:00 AM ET" (use UTC for stability)
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const time = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
    timeZoneName: "short",
  });
  return `${date}, ${time}`;
}

export function marketLabel(market: "PTS" | "REB" | "AST"): string {
  return { PTS: "Points", REB: "Rebounds", AST: "Assists" }[market];
}
