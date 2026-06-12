/**
 * BoardStatTile — scoreboard-style stat tile for premium hero strips
 * (Projections board, Bank Builder, etc.). Presentation only: renders the real
 * value handed to it; the left accent rail is purely decorative and implies a
 * board lane, never a likelihood of winning.
 *
 * Mirrors the homepage hero's StatTile so the scoreboard language is consistent
 * across surfaces. No data/model logic here.
 */
import * as React from "react";

/** "Jun 7" from an ISO date, locale-stable on the server (UTC noon avoids
 *  off-by-one across timezones). */
export function fmtShortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default function BoardStatTile({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent: string;
}) {
  return (
    <div
      className="relative flex flex-col gap-1 rounded-[10px] px-3 py-2.5 sm:px-3.5 sm:py-3 min-w-0 overflow-hidden"
      style={{ background: "rgba(7,11,26,0.55)", border: "1px solid var(--vault-border)" }}
    >
      <span
        aria-hidden
        className="absolute left-0 top-0 bottom-0 w-[3px]"
        style={{ background: accent }}
      />
      <span
        className="font-mono uppercase tracking-[0.14em] truncate"
        style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
      >
        {label}
      </span>
      <span
        className="font-display tabular truncate"
        style={{ color: "var(--vault-text)", fontSize: 22, fontWeight: 700, lineHeight: 1 }}
      >
        {value}
      </span>
      <span className="font-mono truncate" style={{ color: accent, fontSize: 11 }}>
        {sub}
      </span>
    </div>
  );
}
