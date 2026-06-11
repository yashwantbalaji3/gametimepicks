/**
 * BankBuilderFinalsSlip — today's TRACKED active Builder Slip when a user-approved
 * NBA Finals event override is in effect.
 *
 * This is a pre-tip, user-approved replacement of today's NEXT rung (the slip is
 * still PENDING — no settled history is touched; the June 9 win is unchanged). The
 * MLB candidate it supersedes is preserved in a collapsed audit note by the caller.
 *
 * Honesty: real model leans + real book odds; combined odds = exact product of the
 * per-leg decimals; paper stake = the exact current ladder bankroll. Never implies a
 * result before the game finishes.
 */
import type { FinalsCard } from "@/lib/nba-finals-cards";
import { fmtAmerican } from "@/lib/nba-finals-cards";
import PlayerAvatar from "./player-avatar";

function usd(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function BankBuilderFinalsSlip({
  card,
  stake,
  stepNumber,
  stepGoal,
}: {
  card: FinalsCard | null;
  stake: number;
  stepNumber: number;
  stepGoal: number;
}) {
  if (!card) return null;
  const ret = stake * card.combinedDecimal;
  const profit = ret - stake;

  return (
    <section
      aria-label="Today's NBA Finals Builder Slip"
      className="rounded-[10px] p-4 sm:p-5 flex flex-col gap-3"
      style={{
        background:
          "linear-gradient(180deg, rgba(20,24,35,0.92) 0%, rgba(7,11,26,0.62) 100%)",
        border: "1px solid var(--sport-nba, var(--vault-border))",
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          className="font-mono uppercase tracking-[0.16em]"
          style={{ color: "var(--sport-nba)", fontSize: 10 }}
        >
          Today&apos;s Builder Slip · NBA Finals Game 4
        </span>
        <span
          className="font-mono uppercase tracking-[0.12em] px-2 py-0.5 rounded-[4px]"
          style={{ color: "var(--vault-gold-bright)", border: "1px solid var(--vault-gold-bright)", fontSize: 9.5 }}
        >
          Step {stepNumber} · pending
        </span>
      </div>

      <p className="text-[12px] leading-snug" style={{ color: "var(--vault-text-mute)", maxWidth: 620 }}>
        A {card.legs.length}-leg same-game card from tonight&apos;s game — real model leans,
        real book odds. Paper only; result posts after the game finishes.
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

        {/* Paper math — exact stake / projected return / profit / step target */}
        <div
          className="flex flex-col justify-center gap-1.5 rounded-[8px] px-4 py-3"
          style={{ background: "rgba(0,0,0,0.35)", border: "1px solid var(--vault-rule)" }}
        >
          <Row label="Combined odds" value={fmtAmerican(card.combinedAmerican)} big accent="var(--vault-gold-bright)" />
          <Row label="Paper stake" value={usd(stake)} />
          <Row label="Projected return" value={usd(ret)} accent="var(--vault-success)" big />
          <Row label="Projected profit" value={`+${usd(profit)}`} accent="var(--vault-success)" />
          <Row label="Step target" value={usd(stepGoal)} />
          <span style={{ color: "var(--vault-text-faint)", fontSize: 9.5, marginTop: 2 }}>
            {card.combinedDecimal.toFixed(2)}× · paper only, not betting advice
          </span>
        </div>
      </div>

      <p style={{ color: "var(--vault-text-faint)", fontSize: 10, lineHeight: 1.4 }}>
        {card.correlationNote}
      </p>
    </section>
  );
}

function Row({
  label,
  value,
  accent,
  big,
}: {
  label: string;
  value: string;
  accent?: string;
  big?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>{label}</span>
      <span
        className="font-display tabular"
        style={{ color: accent ?? "var(--vault-text)", fontSize: big ? 18 : 14, fontWeight: big ? 700 : 600 }}
      >
        {value}
      </span>
    </div>
  );
}
