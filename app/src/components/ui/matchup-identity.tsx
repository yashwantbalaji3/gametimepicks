/**
 * MatchupIdentity — an away-vs-home team identity pair for the simulate lobby's featured cards.
 *
 * Renders the AWAY team's mark, a neutral "@" separator, then the HOME team's mark, using the shared
 * TeamMark fallback chain (real provider logo → country flag → initials monogram). No fabricated or
 * licensed art: only real artifact `logoUrl`s render as images; everything else degrades to a monogram.
 * MLB passes real mlbstatic logo URLs; World Cup passes ISO flag codes. Static-export compatible
 * (pure, presentational, no fs/fetch).
 */
import TeamMark from "@/components/ui/team-mark";

export default function MatchupIdentity({
  homeName,
  awayName,
  homeLogo,
  awayLogo,
  homeFlag,
  awayFlag,
  size = "md",
}: {
  homeName?: string | null;
  awayName?: string | null;
  homeLogo?: string | null;
  awayLogo?: string | null;
  homeFlag?: string | null;
  awayFlag?: string | null;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <span className="inline-flex items-center gap-2 shrink-0" aria-hidden>
      <TeamMark name={awayName} logoUrl={awayLogo} flagCode={awayFlag} size={size} />
      <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>@</span>
      <TeamMark name={homeName} logoUrl={homeLogo} flagCode={homeFlag} size={size} />
    </span>
  );
}
