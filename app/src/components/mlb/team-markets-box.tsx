import TeamLogo from "@/components/team-logo";

/**
 * TEAM MARKETS — the third prop column, beside batters and pitchers.
 *
 * /mlb had player props twice over (batters, pitchers) and no team view at all, even though the
 * de-vigged moneyline / run line / total for every game were already committed and already powering
 * the per-game report. A reader who wanted "who wins, and how many runs" had to open a game.
 *
 * This is explicitly the MARKET's read, not ours. The coverage matrix on this page states that team
 * outcomes are market-implied and that no independent full-game score model is published, so the
 * card says so in its own words rather than leaving a win probability to be mistaken for a forecast.
 */

export interface TeamMarketRow {
  readonly gameId: string;
  readonly homeTeam: string;
  readonly awayTeam: string;
  /* Abbreviations are RESOLVED BY THE CALLER from the board's own homeTeamName/homeTeamAbbr pairs,
     never guessed here from the name. The team-markets feed carries full names only, and a
     name→abbr table hand-written in a component is the kind of thing that silently rots when a
     club rebrands. Null simply renders the crest fallback. */
  readonly homeAbbr: string | null;
  readonly awayAbbr: string | null;
  readonly firstPitch: string | null;
  readonly homeWinProb: number | null;
  readonly awayWinProb: number | null;
  readonly totalLine: number | null;
  readonly totalLean: "over" | "under" | "balanced" | null;
  readonly runLine: number | null;
  readonly runLineFavorite: "home" | "away" | null;
  readonly reportHref: string | null;
}

const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);

const etTime = (iso: string | null) => {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York", hour: "numeric", minute: "2-digit",
    }).format(new Date(iso));
  } catch { return null; }
};

function Side({ team, abbr, prob, favoured }: { team: string; abbr: string | null; prob: number | null; favoured: boolean }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <TeamLogo team={abbr ?? undefined} sport="mlb" size="sm" />
      <span className="truncate" style={{
        color: favoured ? "var(--vault-text)" : "var(--vault-text-mute)",
        fontWeight: favoured ? 700 : 500, fontSize: 12.5,
      }}>{team}</span>
      <span className="ml-auto font-mono tabular-nums shrink-0" style={{
        color: favoured ? "var(--sport-theme-ink)" : "var(--vault-text-faint)", fontSize: 12.5,
      }}>{pct(prob)}</span>
    </div>
  );
}

export default function TeamMarketsBox({ rows }: { rows: readonly TeamMarketRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-[10px] px-3.5 py-4 text-center" style={{ background: "rgba(255,255,255,0.015)", border: "1px dashed var(--vault-rule)" }}>
        <p className="m-0 font-semibold" style={{ color: "var(--vault-text-mute)", fontSize: 12.5 }}>
          Team markets post when the sportsbooks put them up
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {rows.map((r) => {
        const homeFav = (r.homeWinProb ?? 0) >= (r.awayWinProb ?? 0);
        const time = etTime(r.firstPitch);
        const body = (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>
                {time ? `${time} ET` : "TBD"}
              </span>
              {/* Name the favourite instead of leaving two percentages to be compared. "Reds
                  favoured" is the answer; the split below is the evidence for it. */}
              {(r.homeWinProb != null || r.awayWinProb != null) && (
                <span className="font-mono uppercase tracking-[0.1em] truncate" style={{ color: "var(--sport-theme-ink)", fontSize: 9 }}>
                  {Math.abs((r.homeWinProb ?? 0) - (r.awayWinProb ?? 0)) < 0.04
                    ? "Coin flip"
                    : `${homeFav ? (r.homeAbbr ?? r.homeTeam) : (r.awayAbbr ?? r.awayTeam)} favoured`}
                </span>
              )}
              {r.totalLine != null && (
                <span className="font-mono tabular-nums" style={{ color: "var(--vault-text-mute)", fontSize: 10.5 }}>
                  O/U {r.totalLine}
                  {r.totalLean && r.totalLean !== "balanced" ? ` · leans ${r.totalLean}` : ""}
                </span>
              )}
            </div>
            <Side team={r.awayTeam} abbr={r.awayAbbr} prob={r.awayWinProb} favoured={!homeFav} />
            <Side team={r.homeTeam} abbr={r.homeAbbr} prob={r.homeWinProb} favoured={homeFav} />
            {/*
             * The run line, in the notation people actually read.
             *
             * This said "Run line 1.5 · Cincinnati Reds", which does not say which side of the 1.5
             * Cincinnati is on — a reader cannot tell whether they are giving or getting the runs.
             * The FAVOURITE lays them, so it renders as "CIN −1.5" and the underdog as "STL +1.5",
             * which is how every book prints it and needs no explanation.
             */}
            {r.runLine != null && r.runLineFavorite && (
              <div className="flex items-center justify-between gap-2 pt-1" style={{ borderTop: "1px solid var(--vault-rule)" }}>
                <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>
                  Run line
                </span>
                <span className="font-mono tabular-nums" style={{ color: "var(--vault-text-mute)", fontSize: 10.5 }}>
                  <strong style={{ color: "var(--vault-text)" }}>
                    {r.runLineFavorite === "home" ? (r.homeAbbr ?? r.homeTeam) : (r.awayAbbr ?? r.awayTeam)}
                  </strong>{" "}
                  −{Math.abs(r.runLine)}
                  <span style={{ color: "var(--vault-text-faint)" }}>
                    {" · "}
                    {r.runLineFavorite === "home" ? (r.awayAbbr ?? r.awayTeam) : (r.homeAbbr ?? r.homeTeam)}
                    {" +"}{Math.abs(r.runLine)}
                  </span>
                </span>
              </div>
            )}
          </>
        );
        const style = {
          background: "rgba(255,255,255,0.02)",
          border: "1px solid var(--vault-rule)",
        } as const;
        return r.reportHref ? (
          <a key={r.gameId} href={r.reportHref}
            className="gtp-team-row flex flex-col gap-1.5 rounded-[10px] px-3 py-2.5 no-underline"
            style={style}>
            {body}
          </a>
        ) : (
          <div key={r.gameId} className="flex flex-col gap-1.5 rounded-[10px] px-3 py-2.5" style={style}>
            {body}
          </div>
        );
      })}
      <p className="m-0 font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-faint)", fontSize: 9, lineHeight: 1.5 }}>
        De-vigged sportsbook prices · the market&rsquo;s read, not a model pick
      </p>
    </div>
  );
}
