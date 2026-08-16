/**
 * WcMatchOutlookCard — World Cup 90-minute MARKET OUTLOOK from real sportsbook
 * prices (de-vigged Home/Draw/Away + totals). Clearly labeled market-implied, NOT a
 * GameTime Picks model pick; regulation-time only (Draw included; no extra
 * time/penalties). When odds aren't ready it renders a friendly unavailable state.
 */
import type { WcOutlookMatch } from "@/lib/world-cup/market-outlook";
import FlagBadge from "@/components/flag-badge";

function fmtOdds(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}
function pct(p: number): string {
  return `${Math.round(p * 100)}%`;
}

export default function WcMatchOutlookCard({
  match,
  homeCode,
  awayCode,
  homeName,
  awayName,
  kickoff,
  group,
  venue,
}: {
  match: WcOutlookMatch | null;
  homeCode: string;
  awayCode: string;
  homeName: string;
  awayName: string;
  kickoff?: string | null;
  group?: string | null;
  venue?: string | null;
}) {
  const ready = match?.status === "ready" && match.result;
  return (
    <article
      className="rounded-[8px] px-4 py-4 flex flex-col gap-3"
      style={{ background: "rgba(11, 18, 14,0.55)", border: "1px solid var(--vault-border)" }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono uppercase tracking-[0.16em]" style={{ color: "var(--vault-gold)", fontSize: 10 }}>
          {group ? `Group ${group}` : "World Cup"}
        </span>
        <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>
          {kickoff ?? ""}{venue ? ` · ${venue}` : ""}
        </span>
      </div>

      {/* Matchup */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <FlagBadge code={homeCode} size="md" />
          <span className="font-display tracking-tight truncate" style={{ color: "var(--vault-text)", fontSize: 15, fontWeight: 600 }}>
            {homeName}
          </span>
        </div>
        <span className="font-mono shrink-0" style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>vs</span>
        <div className="flex items-center gap-2 min-w-0 justify-end">
          <span className="font-display tracking-tight truncate text-right" style={{ color: "var(--vault-text)", fontSize: 15, fontWeight: 600 }}>
            {awayName}
          </span>
          <FlagBadge code={awayCode} size="md" />
        </div>
      </div>

      {ready && match.result ? (
        <>
          {/* 90-minute 3-way — Draw clearly visible */}
          <div>
            <span className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>
              90-min result · market implied
            </span>
            <div className="mt-1.5 grid grid-cols-3 gap-2">
              {[
                { label: homeName, p: match.result.homeWinPct, o: match.result.homeOdds, accent: "var(--vault-success)" },
                { label: "Draw", p: match.result.drawPct, o: match.result.drawOdds, accent: "var(--vault-gold-bright)" },
                { label: awayName, p: match.result.awayWinPct, o: match.result.awayOdds, accent: "var(--vault-text)" },
              ].map((c) => (
                <div
                  key={c.label}
                  className="rounded-[6px] px-2 py-2 flex flex-col items-center gap-0.5"
                  style={{ background: "rgba(0,0,0,0.30)", border: "1px solid var(--vault-rule)" }}
                >
                  <span className="font-mono uppercase truncate w-full text-center" style={{ color: "var(--vault-text-mute)", fontSize: 10, letterSpacing: "0.04em" }}>
                    {c.label}
                  </span>
                  <span className="font-display tabular" style={{ color: c.accent, fontSize: 18, fontWeight: 700 }}>
                    {pct(c.p)}
                  </span>
                  <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>
                    {fmtOdds(c.o)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Totals */}
          {match.totals ? (
            <div className="flex items-center justify-between gap-2 pt-1" style={{ borderTop: "1px solid var(--vault-rule)" }}>
              <span className="font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>
                Total {match.totals.line}
              </span>
              <span className="font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 11 }}>
                Over {pct(match.totals.overPct)} ({fmtOdds(match.totals.overOdds)}) · Under {pct(match.totals.underPct)} ({fmtOdds(match.totals.underOdds)})
              </span>
            </div>
          ) : null}

          <p style={{ color: "var(--vault-text-faint)", fontSize: 10, lineHeight: 1.4 }}>
            Market outlook — implied by current sportsbook prices ({match.result.bookmaker}), not a
            GameTime Picks model pick. 90-minute regulation market; extra time/penalties not included.
          </p>
        </>
      ) : (
        <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>
          {match?.status === "unavailable_bad_market_shape"
            ? "Market not in a usable 3-way shape yet"
            : "90-minute market not posted yet"}
        </span>
      )}
    </article>
  );
}
