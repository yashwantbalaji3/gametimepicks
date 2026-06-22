/**
 * TeamIdentity — flag(s) + matchup + kickoff ET, shared across ticket leg rows.
 * Renders a country flag via FlagBadge when a code is supplied, else an initials fallback.
 * Never fabricates a logo/portrait — falls back to a neutral glyph.
 */
import FlagBadge from "@/components/flag-badge";

export default function TeamIdentity({
  flagHome, flagAway, homeTeam, awayTeam, matchup, kickoffEt, fallbackGlyph = "⚽",
}: {
  flagHome?: string | null;
  flagAway?: string | null;
  homeTeam?: string | null;
  awayTeam?: string | null;
  matchup?: string | null;
  kickoffEt?: string | null;
  fallbackGlyph?: string;
}) {
  const hasFlag = !!(flagHome || flagAway);
  return (
    <span className="flex items-start gap-2">
      <span className="mt-0.5 flex shrink-0 items-center gap-0.5">
        {flagHome ? <FlagBadge code={flagHome} size="sm" ariaLabel={homeTeam ?? ""} /> : null}
        {flagAway ? <FlagBadge code={flagAway} size="sm" ariaLabel={awayTeam ?? ""} /> : null}
        {!hasFlag ? (
          <span className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-[5px] text-[11px]"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid var(--vault-border)" }} aria-hidden>{fallbackGlyph}</span>
        ) : null}
      </span>
      {(matchup || kickoffEt) ? (
        <span className="min-w-0">
          {matchup ? <span className="block truncate text-[11px] font-semibold" style={{ color: "var(--vault-text)" }}>{matchup}</span> : null}
          {kickoffEt ? <span className="block font-mono text-[10px]" style={{ color: "var(--vault-text-faint)" }}>{kickoffEt}</span> : null}
        </span>
      ) : null}
    </span>
  );
}
