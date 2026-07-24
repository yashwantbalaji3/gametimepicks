/**
 * MlbSlateAvailability — the /mlb hub's compact availability lens, built from the SAME shared availability
 * contract (`slateGames` → `deriveGameAvailability`) that powers the /today board, so the two pages can
 * never disagree on what analysis is available. This is deliberately NOT a clone of the /today full board:
 * it shows the factual summary + a short capped list + a bridge to the complete /today board. The daily
 * operational destination stays /today; /mlb just mirrors the availability truth and links across.
 *
 * Presentational only; every label/explanation/action/tier comes from the contract. Fabricates nothing.
 */
import Link from "next/link";
import MatchupIdentity from "@/components/ui/matchup-identity";
import { formatEtTime } from "@/lib/mlb/public-provenance";
import type { SlateGameRow, SlateSummary } from "@/lib/today/slate-games";

const CHIP: Record<SlateGameRow["tone"], { color: string; bg: string }> = {
  success: { color: "var(--vault-success)", bg: "var(--vault-success-dim)" },
  gold: { color: "var(--vault-gold-bright)", bg: "var(--vault-gold-dim)" },
  mute: { color: "var(--vault-text-mute)", bg: "rgba(255,255,255,0.05)" },
};

function CompactRow({ g }: { g: SlateGameRow }) {
  const chip = CHIP[g.tone];
  const time = formatEtTime(g.firstPitchIso);
  return (
    <Link
      href={g.href}
      aria-label={`${g.teams.away} at ${g.teams.home} — ${g.label}. ${g.explanation}`}
      className="vault-glow-hover vault-press flex items-center justify-between gap-3 rounded-[10px] px-3 py-2"
      style={{ background: "rgba(26,16,11,0.5)", border: "1px solid var(--vault-border)", textDecoration: "none" }}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <MatchupIdentity homeName={g.teams.home} awayName={g.teams.away} homeLogo={g.homeLogo} awayLogo={g.awayLogo} size="sm" />
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="truncate font-semibold" style={{ color: "var(--vault-text)", fontSize: 12 }}>{g.teams.away} @ {g.teams.home}</span>
          {time ? <span className="truncate font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>First pitch {time}</span> : null}
        </div>
      </div>
      <span className="rounded-full px-2 py-0.5 font-mono uppercase tracking-[0.08em] whitespace-nowrap shrink-0" style={{ fontSize: 8, color: chip.color, background: chip.bg }}>
        {g.label}
      </span>
    </Link>
  );
}

export default function MlbSlateAvailability({
  summary,
  games,
  slateDate,
  cap = 4,
}: {
  summary: SlateSummary;
  games: SlateGameRow[];
  slateDate: string;
  cap?: number;
}) {
  if (games.length === 0) return null;
  const shown = games.slice(0, cap);
  const more = games.length - shown.length;
  return (
    <section aria-label="MLB slate availability" className="flex flex-col gap-2.5 rounded-[14px] px-4 py-4" style={{ border: "1px solid var(--vault-border)", background: "rgba(26,16,11,0.5)" }}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 13.5, fontWeight: 700 }}>Today&rsquo;s MLB availability</h3>
        <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>{slateDate}</span>
      </div>
      {/* Factual count line — the SAME availability language as /today, never a performance claim. */}
      <p className="font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 10.5, lineHeight: 1.35 }}>{summary.text}</p>
      <div className="flex flex-col gap-1.5">
        {shown.map((g) => (
          <CompactRow key={g.slug} g={g} />
        ))}
      </div>
      <Link href="/today" className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-gold-bright)", fontSize: 10, textDecoration: "none" }}>
        See every game on Today{more > 0 ? ` (${more} more)` : ""} →
      </Link>
    </section>
  );
}
