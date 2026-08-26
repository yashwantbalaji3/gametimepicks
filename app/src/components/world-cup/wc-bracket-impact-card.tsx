/**
 * WorldCupBracketImpactCard — makes a single knockout game feel like it matters, honestly. For a semifinal
 * it shows what's at stake (winner → Final, loser → third-place playoff) without inventing the finalists:
 * the Final and third-place matchups stay TBD until both semifinals are played.
 *
 * Pure/presentational. Never fabricates a finalist or a matchup before it's decided.
 */

export interface WcBracketImpactProps {
  home: string;
  away: string;
  /** Stage code, e.g. "sf" (semifinal). Only "sf" gets the winner→final / loser→third framing today. */
  stage?: string | null;
  /** Public dates from the tournament calendar (dates only — no teams). */
  finalDateLabel?: string;
  thirdPlaceDateLabel?: string;
}

function Leg({ label, line, sub }: { label: string; line: string; sub?: string }) {
  return (
    <div className="rounded-[8px] px-3 py-2 flex flex-col gap-0.5" style={{ background: "color-mix(in srgb, var(--vault-scrim-base) 50%, transparent)", border: "1px solid var(--vault-border)" }}>
      <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>{label}</span>
      <span style={{ color: "var(--vault-text)", fontSize: 12.5, fontWeight: 600 }}>{line}</span>
      {sub ? <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>{sub}</span> : null}
    </div>
  );
}

export default function WorldCupBracketImpactCard({ home, away, stage, finalDateLabel, thirdPlaceDateLabel }: WcBracketImpactProps) {
  const isSemi = (stage ?? "").toLowerCase() === "sf" || (stage ?? "").toLowerCase().includes("semi");
  if (!isSemi) return null;

  return (
    <section aria-label="Bracket impact" className="rounded-[12px] px-4 py-4 flex flex-col gap-2.5" style={{ background: "color-mix(in srgb, var(--vault-scrim-base) 40%, transparent)", border: "1px solid var(--vault-gold-bright)", borderLeft: "3px solid var(--vault-gold-bright)" }}>
      <div className="flex flex-col gap-0.5">
        <span className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-gold-bright)", fontSize: 9.5 }}>Bracket impact · Semifinal</span>
        <span style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 700 }}>What&rsquo;s at stake in {home} vs {away}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Leg label="Winner" line="Advances to the World Cup Final" sub={`vs the other semifinal winner · TBD${finalDateLabel ? ` · ${finalDateLabel}` : ""}`} />
        <Leg label="Loser" line="Plays in the third-place game" sub={`vs the other semifinal loser · TBD${thirdPlaceDateLabel ? ` · ${thirdPlaceDateLabel}` : ""}`} />
      </div>
      <p className="text-[11.5px] leading-relaxed m-0" style={{ color: "var(--vault-text-mute)" }}>
        The Final and third-place matchups are <span style={{ color: "var(--vault-text)" }}>TBD until both semifinals are played</span> —
        no finalist is shown before it&rsquo;s decided.
      </p>
    </section>
  );
}
