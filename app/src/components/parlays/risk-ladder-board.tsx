import PlayerAvatar from "@/components/ui/player-avatar";
import TeamLogo from "@/components/team-logo";
import { mlbHeadshotUrl } from "@/lib/player-headshots";

/**
 * THE RISK LADDER — today's card at each risk level, each shown with that tier's own record.
 *
 * The record is not a footnote here, it is part of the card. Every tier of this stream is negative
 * over 48 graded days (low −1.9%, medium −6.6%, high −3.9%, longshot −25.0%), and a page that showed
 * a +2968 Longshot without "14-224, −25%" beside it would be the most flattering possible framing of
 * the worst-performing thing on the site.
 *
 * That is also why the tier record sits on the SAME row as the price rather than below the legs:
 * whichever number catches the eye first, the other is already in view.
 */

export interface LadderLeg {
  readonly player: string;
  readonly team: string | null;
  readonly opponent: string | null;
  readonly playerId: number | null;
  readonly marketLabel: string;
  readonly side: string;
  readonly line: number | null;
  readonly odds: number | null;
  readonly result: string | null;
}

export interface LadderCard {
  readonly tier: string;
  readonly tierLabel: string;
  readonly slipId: string;
  readonly combinedAmerican: number;
  readonly legs: readonly LadderLeg[];
  readonly status: string;
  readonly tierRecord: {
    readonly wins: number;
    readonly losses: number;
    readonly hitRate: number | null;
    readonly roi: number | null;
  };
}

export interface LadderSkip { readonly tier: string; readonly reason: string }

const american = (n: number | null) => (n == null ? "—" : `${n > 0 ? "+" : ""}${n}`);
const signedPct = (v: number | null) => (v == null ? "—" : `${v > 0 ? "+" : ""}${(v * 100).toFixed(1)}%`);

/** Tier accent — a ramp from steady to volatile, never green-for-good (these are all negative). */
const TIER_TONE: Record<string, string> = {
  low: "var(--vault-text-mute)",
  medium: "var(--sport-theme-ink)",
  high: "var(--vault-warn)",
  longshot: "var(--vault-danger)",
};

function LegRow({ leg }: { leg: LadderLeg }) {
  return (
    <li className="flex items-center gap-2 min-w-0">
      <span className="relative shrink-0">
        <PlayerAvatar name={leg.player} photo={leg.playerId ? mlbHeadshotUrl(leg.playerId) : null} size={22} />
        {leg.team ? <span className="absolute -bottom-1 -right-1"><TeamLogo team={leg.team} sport="mlb" size="sm" /></span> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold leading-tight" style={{ color: "var(--vault-text)", fontSize: 12 }}>
          {leg.player}
        </span>
        <span className="block font-mono truncate" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
          {leg.side} {leg.line} {leg.marketLabel}
          {leg.opponent ? ` · vs ${leg.opponent}` : ""}
        </span>
      </span>
      <span className="shrink-0 font-mono tabular-nums" style={{ color: "var(--vault-text-mute)", fontSize: 11 }}>
        {american(leg.odds)}
      </span>
    </li>
  );
}

export default function RiskLadderBoard({
  cards, skipped, overallRoi, gradedDays,
}: {
  cards: readonly LadderCard[];
  skipped: readonly LadderSkip[];
  overallRoi: number | null;
  gradedDays: number;
}) {
  if (cards.length === 0 && skipped.length === 0) return null;

  return (
    <section aria-labelledby="risk-ladder-heading" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className="font-mono uppercase tracking-[0.16em]" style={{ color: "var(--sport-theme-ink)", fontSize: 9.5 }}>
          Risk ladder · paper
        </span>
        <h2 id="risk-ladder-heading" className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 18, fontWeight: 800 }}>
          Today&rsquo;s card at each risk level
        </h2>
        <p className="m-0 max-w-[70ch]" style={{ color: "var(--vault-text-mute)", fontSize: 12.5, lineHeight: 1.6 }}>
          The highest-scoring card the optimizer built in each price band. Every tier is tracked on
          its own and every tier is <strong style={{ color: "var(--vault-text)" }}>losing money on
          paper</strong> — {gradedDays} graded days, {signedPct(overallRoi)} overall. Shown so the
          record is visible, not because the model beats these prices.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 items-start">
        {cards.map((c) => (
          <article key={c.slipId} className="flex flex-col gap-2.5 rounded-[14px] p-3.5"
            style={{ background: "rgba(11,18,14,0.5)", border: "1px solid var(--vault-border)" }}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono uppercase tracking-[0.14em]" style={{ color: TIER_TONE[c.tier] ?? "var(--vault-text-mute)", fontSize: 9.5 }}>
                {c.tierLabel}
              </span>
              <span className="font-display tabular-nums" style={{ color: "var(--vault-text)", fontSize: 17, fontWeight: 800 }}>
                {american(c.combinedAmerican)}
              </span>
            </div>

            {/* The tier's history, on the same row as its price. */}
            <div className="flex items-center justify-between gap-2 rounded-[8px] px-2.5 py-1.5"
              style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--vault-rule)" }}>
              <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>
                This tier
              </span>
              <span className="font-mono tabular-nums" style={{ color: "var(--vault-text-mute)", fontSize: 10.5 }}>
                {c.tierRecord.wins}&ndash;{c.tierRecord.losses} ·{" "}
                <span style={{ color: (c.tierRecord.roi ?? 0) < 0 ? "var(--vault-danger)" : "var(--vault-success)" }}>
                  {signedPct(c.tierRecord.roi)}
                </span>
              </span>
            </div>

            <ul className="flex flex-col gap-2 list-none m-0 p-0">
              {c.legs.map((l, i) => <LegRow key={`${l.player}:${i}`} leg={l} />)}
            </ul>

            <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>
              {c.legs.length} legs · all must land
            </span>
          </article>
        ))}

        {skipped.map((s) => (
          <article key={s.tier} className="flex flex-col gap-1.5 rounded-[14px] p-3.5"
            style={{ background: "rgba(255,255,255,0.015)", border: "1px dashed var(--vault-rule)" }}>
            <span className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
              {s.tier} risk
            </span>
            <span style={{ color: "var(--vault-text-mute)", fontSize: 12 }}>No card today</span>
            <span style={{ color: "var(--vault-text-faint)", fontSize: 11, lineHeight: 1.5 }}>{s.reason}</span>
          </article>
        ))}
      </div>

      <p className="m-0 font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9, lineHeight: 1.6 }}>
        Paper stream with its own ledger · never part of the Bank Builder / Moonshot bankroll or the settled product record
      </p>
    </section>
  );
}
