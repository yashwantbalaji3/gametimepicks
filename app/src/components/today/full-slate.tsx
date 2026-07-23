/**
 * TodayFullSlate — the "every game on the slate" board on the Daily Model Hub. Where the featured-sim row
 * is a CAPPED highlight reel (top 5), this lists EVERY game on the presented slate so none is stranded:
 * each row carries the matchup (real logos → flag → monogram via MatchupIdentity), an honest availability
 * chip (Simulation ready / Model read / Market read / Report), the real scheduled first pitch when the
 * team markets carry it, a NON-PREDICTIVE subline, and a clear per-game action — the whole row links to the
 * canonical game report (one distinct slug per game, both ends of a doubleheader included). That is the
 * point: "every game has a clear action."
 *
 * Presentational only: it renders the `SlateGameRow[]` the server page derived via slateGames(details,
 * today). It reads no data and fabricates nothing — a game with no ready artifact still links to its
 * report, which renders its OWN honest unavailable state.
 */
import Link from "next/link";
import MatchupIdentity from "@/components/ui/matchup-identity";
import { formatEtTime } from "@/lib/mlb/public-provenance";
import type { SlateGameRow } from "@/lib/today/slate-games";

const CHIP: Record<SlateGameRow["tone"], { color: string; bg: string }> = {
  success: { color: "var(--vault-success)", bg: "var(--vault-success-dim)" },
  gold: { color: "var(--vault-gold-bright)", bg: "var(--vault-gold-dim)" },
  mute: { color: "var(--vault-text-mute)", bg: "rgba(255,255,255,0.05)" },
};

function SlateRow({ g }: { g: SlateGameRow }) {
  const chip = CHIP[g.tone];
  const time = formatEtTime(g.firstPitchIso);
  // Subline: real first pitch (honest game status) + the non-predictive availability detail; fall back to
  // the sport label so the line is never empty.
  const detail = [time ? `First pitch ${time}` : null, g.subline].filter(Boolean).join(" · ") || g.sportLabel;
  return (
    <Link
      href={g.href}
      className="vault-glow-hover vault-press flex items-center justify-between gap-3 rounded-[12px] px-3.5 py-3"
      style={{ background: "rgba(26,16,11,0.55)", border: "1px solid var(--vault-border)", textDecoration: "none" }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <MatchupIdentity homeName={g.teams.home} awayName={g.teams.away} homeLogo={g.homeLogo} awayLogo={g.awayLogo} size="sm" />
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="truncate font-semibold" style={{ color: "var(--vault-text)", fontSize: 12.5 }}>
            {g.teams.away} @ {g.teams.home}
          </span>
          <span className="truncate font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>{detail}</span>
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className="rounded-full px-2 py-0.5 font-mono uppercase tracking-[0.08em] whitespace-nowrap" style={{ fontSize: 8.5, color: chip.color, background: chip.bg }}>
          {g.statusLabel}
        </span>
        <span className="font-mono uppercase tracking-[0.1em] whitespace-nowrap" style={{ color: "var(--vault-gold-bright)", fontSize: 9.5 }}>
          {g.actionLabel}
        </span>
      </div>
    </Link>
  );
}

export default function TodayFullSlate({ games, simReadyCount }: { games: SlateGameRow[]; simReadyCount: number }) {
  if (games.length === 0) return null; // no slate today → the slate header / liveness banner already says so
  const readyNote =
    simReadyCount > 0
      ? `${simReadyCount} of ${games.length} ${games.length === 1 ? "game has" : "games have"} a ready simulation — the rest link to their model or market read.`
      : "No simulation is ready yet — every game still links to its model or market read.";
  return (
    <section aria-label="Every game on the slate" className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 15, fontWeight: 700 }}>
          Every game on the slate
        </h2>
        <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
          {games.length} {games.length === 1 ? "game" : "games"}
        </span>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <p className="font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 10.5, lineHeight: 1.35 }}>{readyNote}</p>
        {/* Trust: a first-timer seeing the availability chips can learn what each tier means in one tap. */}
        <Link href="/learn" className="font-mono uppercase tracking-[0.1em] whitespace-nowrap" style={{ color: "var(--vault-gold-bright)", fontSize: 9.5 }}>
          How these reads are built →
        </Link>
      </div>
      <div className="flex flex-col gap-2">
        {games.map((g) => (
          <SlateRow key={g.slug} g={g} />
        ))}
      </div>
    </section>
  );
}
