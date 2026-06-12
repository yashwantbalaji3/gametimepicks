import Link from "next/link";
import type { MlbPendingGame } from "@/lib/types-mlb-results";

/**
 * MlbPendingGames — list of games still awaiting a final score. These are
 * intentionally NEVER folded into the audit's hit-rate denominator.
 *
 * Each row tells the user the game state (In Progress / Pre-Game) and
 * deep-links into the MLB board section for that game's props.
 */
interface Props {
  games: MlbPendingGame[];
}

export default function MlbPendingGames({ games }: Props) {
  if (games.length === 0) return null;
  return (
    <section className="mt-8">
      <div className="flex items-center gap-2 mb-3">
        <span
          aria-hidden
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{
            background: "var(--vault-warn)",
            boxShadow: "0 0 8px rgba(212, 175, 55, 0.55)",
          }}
        />
        <span
          className="font-mono uppercase tracking-[0.16em]"
          style={{ color: "var(--vault-warn)", fontSize: 11 }}
        >
          Pending games · {games.length} awaiting grade
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {games.map((g) => (
          <Link
            key={g.gamePk}
            href={`/mlb/board#game-${g.gamePk}`}
            className="vault-glow-hover flex items-center justify-between gap-3 rounded-[3px]"
            style={{
              paddingTop: 10,
              paddingBottom: 10,
              paddingLeft: 14,
              paddingRight: 14,
              border: "1px solid var(--vault-border)",
              background: "rgba(26, 16, 11, 0.45)",
              minWidth: 0,
              overflow: "hidden",
              color: "inherit",
              textDecoration: "none",
            }}
            aria-label={`Pending game ${g.matchup} — view props`}
          >
            <div className="flex flex-col gap-0.5 min-w-0">
              <span
                style={{
                  color: "var(--vault-text)",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {g.matchup}
              </span>
              <span
                className="font-mono uppercase tracking-[0.12em]"
                style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
              >
                {g.detailedState}
              </span>
            </div>
            <span
              className="font-mono uppercase tracking-[0.14em]"
              style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
            >
              View props →
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
