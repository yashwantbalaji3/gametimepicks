/**
 * Display formatters. Keep pure and side-effect free.
 */

export function formatPercent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatSignedPct(value: number, digits = 1): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

export function formatOdds(value: number): string {
  if (value > 0) return `+${value}`;
  return `${value}`;
}

export function formatStat(value: number, digits = 1): string {
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
