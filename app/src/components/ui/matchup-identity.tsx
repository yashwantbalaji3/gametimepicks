/**
 * MatchupIdentity — an away-vs-home team identity pair for the simulate lobby's featured cards.
 *
 * Renders the AWAY team's mark, a neutral "@" separator, then the HOME team's mark, using the shared
 * TeamMark fallback chain (real provider logo → country flag → initials monogram). No fabricated or
 * licensed art: only real artifact `logoUrl`s render as images; everything else degrades to a monogram.
 * MLB passes real mlbstatic logo URLs; World Cup passes ISO flag codes. Static-export compatible
 * (pure, presentational, no fs/fetch).
 *
 * Each mark sits on a subtle rounded "crest" plate so the logos read instantly as a sports matchup
 * pair (FreeSim-style) rather than two loose glyphs. `plate={false}` restores the bare-mark layout.
 */
import TeamMark from "@/components/ui/team-mark";

/** Crest-plate box size per mark size — the padded frame the logo sits inside. */
const PLATE_PX = { sm: 26, md: 34, lg: 44, xl: 60 } as const;

export default function MatchupIdentity({
  homeName,
  awayName,
  homeLogo,
  awayLogo,
  homeFlag,
  awayFlag,
  size = "md",
  plate = true,
}: {
  homeName?: string | null;
  awayName?: string | null;
  homeLogo?: string | null;
  awayLogo?: string | null;
  homeFlag?: string | null;
  awayFlag?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  /** Wrap each mark in a subtle crest plate (default). Set false for the bare inline pair. */
  plate?: boolean;
}) {
  const box = PLATE_PX[size];
  const sep = size === "xl" ? 13 : size === "lg" ? 12 : 11;
  const crest = (mark: React.ReactNode) =>
    plate ? (
      <span
        className="inline-flex items-center justify-center rounded-[10px] shrink-0"
        style={{
          width: box,
          height: box,
          background: "rgba(10,10,11,0.55)",
          border: "1px solid var(--vault-border)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
        }}
      >
        {mark}
      </span>
    ) : (
      mark
    );

  return (
    <span className={`inline-flex items-center shrink-0 ${size === "xl" ? "gap-2.5" : "gap-2"}`} aria-hidden>
      {crest(<TeamMark name={awayName} logoUrl={awayLogo} flagCode={awayFlag} size={size} />)}
      <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: sep }}>@</span>
      {crest(<TeamMark name={homeName} logoUrl={homeLogo} flagCode={homeFlag} size={size} />)}
    </span>
  );
}
