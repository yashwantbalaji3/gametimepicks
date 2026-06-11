/**
 * BankBuilderFinalsSpotlight — a FEATURED NBA Finals same-game card on the Bank
 * Builder page, rendered OUTSIDE the tracked $100→$3,000 paper ladder.
 *
 * Why outside the ladder: the canonical ledger is settled-only and never
 * fabricated — we do not swap the tracked Daily Builder Pick. This is an
 * illustrative spotlight for tonight's Finals game, drawn from the same real
 * model leans + book odds. It is clearly labeled as featured / illustrative and
 * does not affect bankroll history.
 */
import type { FinalsCard } from "@/lib/nba-finals-cards";
import { fmtAmerican } from "@/lib/nba-finals-cards";
import PlayerAvatar from "./player-avatar";

function usd(n: number): string {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export default function BankBuilderFinalsSpotlight({
  card,
  illustrativeStake,
}: {
  card: FinalsCard | null;
  illustrativeStake: number;
}) {
  if (!card) return null;
  const ret = Math.round(illustrativeStake * card.combinedDecimal);

  return (
    <section
      aria-label="Featured NBA Finals card"
      className="mt-6 rounded-[10px] p-4 sm:p-5"
      style={{
        background:
          "linear-gradient(180deg, rgba(20,24,35,0.92) 0%, rgba(7,11,26,0.62) 100%)",
        border: "1px solid var(--sport-nba, var(--vault-border))",
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <span
          className="font-mono uppercase tracking-[0.16em]"
          style={{ color: "var(--sport-nba)", fontSize: 10 }}
        >
          Featured · NBA Finals Game 4
        </span>
        <span
          className="font-mono uppercase tracking-[0.12em] px-2 py-0.5 rounded-[4px]"
          style={{ color: "var(--vault-text-faint)", border: "1px solid var(--vault-rule)", fontSize: 9.5 }}
        >
          Outside the tracked ladder
        </span>
      </div>
      <h2
        className="font-display tracking-tight"
        style={{ color: "var(--vault-text)", fontSize: 18, fontWeight: 700 }}
      >
        NBA Finals same-game spotlight
      </h2>
      <p className="text-[12px] leading-snug mt-0.5 mb-3" style={{ color: "var(--vault-text-mute)", maxWidth: 600 }}>
        An illustrative {card.legs.length}-leg same-game card from tonight&apos;s game — real
        model leans, real book odds. This is a featured example, not the tracked Daily
        Builder Pick, so it doesn&apos;t change bankroll history.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Legs */}
        <div className="flex flex-col gap-2">
          {card.legs.map((l, i) => {
            const isOver = (l.side || "").toLowerCase().startsWith("o");
            return (
              <div key={i} className="flex items-center gap-3 min-w-0">
                <PlayerAvatar
                  playerId={l.playerId ?? null}
                  playerName={l.playerName}
                  team={l.team ?? undefined}
                  sport="nba"
                  size="lg"
                />
                <div className="flex flex-col min-w-0 flex-1">
                  <span
                    className="font-display truncate"
                    style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 600 }}
                  >
                    {l.playerName}
                  </span>
                  <span className="font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 11 }}>
                    {(l.marketLabel || l.market)} {l.side}{" "}
                    {l.line != null ? l.line.toFixed(1) : "—"}
                    {l.oddsForSide != null ? ` · ${fmtAmerican(l.oddsForSide)}` : ""}
                  </span>
                </div>
                <span
                  className="font-mono uppercase shrink-0"
                  style={{ color: isOver ? "var(--vault-success)" : "var(--vault-warn)", fontSize: 10 }}
                >
                  {l.confidence ?? ""}
                </span>
              </div>
            );
          })}
        </div>

        {/* Paper math */}
        <div
          className="flex flex-col justify-center gap-1 rounded-[8px] px-4 py-3"
          style={{ background: "rgba(0,0,0,0.35)", border: "1px solid var(--vault-rule)" }}
        >
          <div className="flex items-baseline justify-between gap-2">
            <span style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>Combined odds</span>
            <span className="font-display" style={{ color: "var(--vault-gold-bright)", fontSize: 20, fontWeight: 700 }}>
              {fmtAmerican(card.combinedAmerican)}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>Paper stake</span>
            <span className="font-display tabular" style={{ color: "var(--vault-text)", fontSize: 15 }}>
              {usd(illustrativeStake)}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>Potential paper return</span>
            <span className="font-display tabular" style={{ color: "var(--vault-success)", fontSize: 17, fontWeight: 700 }}>
              {usd(ret)}
            </span>
          </div>
          <span style={{ color: "var(--vault-text-faint)", fontSize: 9.5, marginTop: 2 }}>
            {card.combinedDecimal.toFixed(2)}× · paper only, no real money
          </span>
        </div>
      </div>

      <p style={{ color: "var(--vault-text-faint)", fontSize: 10, lineHeight: 1.4, marginTop: 12 }}>
        {card.correlationNote}
      </p>
    </section>
  );
}
