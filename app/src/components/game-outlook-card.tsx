/**
 * Market Outlook cards — game-level view IMPLIED BY SPORTSBOOK PRICES.
 *
 * This is deliberately NOT presented as a model pick: win probability is
 * de-vigged from the posted moneyline and team totals are derived from the
 * total ± spread. Every card carries the "Market outlook, not a model pick"
 * label. Games whose main markets aren't posted yet render a friendly
 * unavailable tile rather than inventing numbers.
 */
import type { GameOutlook, GameOutlookGame } from "@/lib/data-game-outlook";
import SectionHeader from "@/components/section-header";

function pct(p: number | null): string | null {
  return p == null ? null : `${Math.round(p * 100)}%`;
}

function signed(n: number | null | undefined): string | null {
  if (n == null) return null;
  return n > 0 ? `+${n}` : `${n}`;
}

function oddsAsOf(iso: string | null | undefined): string | null {
  if (!iso) return null;
  // Render a stable UTC timestamp (no client-locale drift during SSR).
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]} UTC`;
}

function GameCard({ g }: { g: GameOutlookGame }) {
  const matchup = `${g.awayTeam ?? "?"} @ ${g.homeTeam ?? "?"}`;
  const cardBase: React.CSSProperties = {
    padding: "14px 16px",
    border: "1px solid var(--vault-border)",
    borderRadius: 8,
    background: "rgba(7, 11, 26, 0.55)",
  };

  if (!g.hasMarket) {
    return (
      <div style={cardBase}>
        <div
          style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 600 }}
        >
          {matchup}
        </div>
        <div
          style={{ color: "var(--vault-text-faint)", fontSize: 12, marginTop: 8 }}
        >
          Main market not posted yet — check back closer to game time.
        </div>
      </div>
    );
  }

  const whp = pct(g.impliedWinProbHome);
  const wap = pct(g.impliedWinProbAway);
  const homeFav =
    g.impliedWinProbHome != null &&
    g.impliedWinProbAway != null &&
    g.impliedWinProbHome >= g.impliedWinProbAway;
  const spreadHome = signed(g.spread?.home);

  const Stat = ({ label, value }: { label: string; value: string }) => (
    <div className="flex flex-col gap-0.5">
      <span
        className="font-mono uppercase tracking-[0.12em]"
        style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
      >
        {label}
      </span>
      <span style={{ color: "var(--vault-text)", fontSize: 13, fontWeight: 600 }}>
        {value}
      </span>
    </div>
  );

  return (
    <div style={cardBase}>
      <div className="flex items-center justify-between gap-2">
        <span
          style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 600 }}
        >
          {matchup}
        </span>
        {g.bookmaker ? (
          <span
            className="font-mono uppercase tracking-[0.1em]"
            style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
          >
            {g.bookmaker}
          </span>
        ) : null}
      </div>

      {/* Implied win probability */}
      {whp && wap ? (
        <div className="mt-3 flex items-center gap-4">
          <Stat
            label="Implied win %"
            value={`${g.awayTeam ?? "Away"} ${wap}${!homeFav ? " ◂" : ""}`}
          />
          <Stat
            label=" "
            value={`${g.homeTeam ?? "Home"} ${whp}${homeFav ? " ◂" : ""}`}
          />
        </div>
      ) : null}

      {/* Spread / total / team totals */}
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        {spreadHome ? (
          <Stat label="Spread (home)" value={spreadHome} />
        ) : null}
        {g.total != null ? <Stat label="Total" value={String(g.total)} /> : null}
        {g.teamTotalAway != null ? (
          <Stat
            label={`${g.awayTeam ?? "Away"} total`}
            value={String(g.teamTotalAway)}
          />
        ) : null}
        {g.teamTotalHome != null ? (
          <Stat
            label={`${g.homeTeam ?? "Home"} total`}
            value={String(g.teamTotalHome)}
          />
        ) : null}
      </div>

      <div
        style={{ color: "var(--vault-text-faint)", fontSize: 10, marginTop: 12 }}
      >
        Market outlook, not a model pick.
      </div>
    </div>
  );
}

export default function GameOutlookSection({
  outlook,
}: {
  outlook: GameOutlook | null;
}) {
  if (!outlook || outlook.gameCount === 0) return null;

  const asOf = oddsAsOf(outlook.oddsGeneratedAt ?? outlook.generatedAt);

  return (
    <section className="mt-10" aria-label="Market outlook">
      <SectionHeader
        eyebrow="Market outlook"
        title="Implied by current sportsbook prices"
        sub="De-vigged moneyline win probability and total ± spread team totals. This is the market's view, not a GameTime Picks model pick."
      />
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        {outlook.games.map((g, i) => (
          <GameCard key={g.gameId ?? i} g={g} />
        ))}
      </div>
      {asOf ? (
        <p
          style={{ color: "var(--vault-text-faint)", fontSize: 10, marginTop: 10 }}
        >
          Odds as of {asOf} · source: The Odds API
          {outlook.bookmakersPreferred?.length
            ? ` · books: ${outlook.bookmakersPreferred.join(", ")}`
            : ""}
        </p>
      ) : null}
    </section>
  );
}
