/**
 * CompetitionBadge — a generated league/tournament identity mark.
 *
 * HONESTY: no licensed league logos exist in this repo and none are fabricated.
 * This badge is a clearly GENERATED identity treatment (sport glyph + competition
 * label in the sport's accent), documented in the asset audit as a fallback —
 * never presented as an official mark.
 */
import { getSportIdentity } from "@/lib/sport-identity";

const COMPETITION: Record<string, string> = {
  world_cup: "World Cup 2026",
  soccer: "World Cup 2026",
  mlb: "MLB · 2026 season",
  nba: "NBA",
  ufc: "UFC",
  mixed: "Cross-sport",
  bank_builder: "Bank Builder",
};

export default function CompetitionBadge({
  sport,
  size = "md",
}: {
  sport: string;
  size?: "sm" | "md";
}) {
  const id = getSportIdentity(sport);
  const label = COMPETITION[id.key] ?? id.label;
  const dims = size === "sm" ? { pad: "2px 8px", font: 10, icon: 11 } : { pad: "3px 10px", font: 11, icon: 13 };
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full font-semibold whitespace-nowrap"
      style={{
        padding: dims.pad,
        fontSize: dims.font,
        color: id.accentVar,
        border: `1px solid color-mix(in srgb, ${id.accentVar} 45%, transparent)`,
        background: id.gradient,
      }}
    >
      <span aria-hidden role="img" style={{ fontSize: dims.icon }}>{id.icon}</span>
      {label}
    </span>
  );
}
