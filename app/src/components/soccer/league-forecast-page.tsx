/**
 * An accepted soccer league's model-only forecast page (P257). Server component; every number is read
 * from the league's public artifact (lib/sports/soccer/forecast-view.ts).
 *
 * The page leads with the fixtures and states, beside them, exactly how good the model was when it was
 * tested on a season it had never seen — including that the sportsbook closing line and a plain Elo
 * rating were both more accurate. Model-only forecasts; not betting advice.
 */
import TeamLogo from "@/components/team-logo";
import { loadLeagueForecasts, type LeagueForecastRow } from "@/lib/sports/soccer/forecast-view";

const pct = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? "—" : `${Math.round(n * 1000) / 10}%`);
const ET_DAY = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric" });
const ET_TIME = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
const ET_KEY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
const ET_STAMP = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function byDay(rows: LeagueForecastRow[]) {
  const days = new Map<string, LeagueForecastRow[]>();
  for (const r of [...rows].sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc))) {
    const k = ET_KEY.format(new Date(r.kickoffUtc));
    days.set(k, [...(days.get(k) ?? []), r]);
  }
  return [...days].map(([key, rs]) => ({ key, label: ET_DAY.format(new Date(rs[0].kickoffUtc)), rows: rs }));
}

function OutcomeBar({ r }: { r: LeagueForecastRow }) {
  const segs = [
    { label: r.homeClub, p: r.probs.home, color: "var(--vault-accent)" },
    { label: "Draw", p: r.probs.draw, color: "var(--vault-text-faint)" },
    { label: r.awayClub, p: r.probs.away, color: "var(--sport-soccer)" },
  ];
  return (
    <div>
      <div
        role="img"
        aria-label={`${r.homeClub} ${pct(r.probs.home)}, draw ${pct(r.probs.draw)}, ${r.awayClub} ${pct(r.probs.away)}`}
        className="flex h-2 w-full overflow-hidden rounded-full"
        style={{ background: "var(--vault-rule)" }}
      >
        {segs.map((s) => <span key={s.label} style={{ width: `${s.p * 100}%`, background: s.color }} />)}
      </div>
      <div className="mt-1.5 grid grid-cols-3 gap-2 font-mono tabular" style={{ fontSize: 12.5 }}>
        <span style={{ color: "var(--vault-accent)" }}>{pct(r.probs.home)} <span style={{ color: "var(--vault-text-faint)" }}>home</span></span>
        <span className="text-center" style={{ color: "var(--vault-text-mute)" }}>{pct(r.probs.draw)} <span style={{ color: "var(--vault-text-faint)" }}>draw</span></span>
        <span className="text-right" style={{ color: "var(--sport-soccer)" }}>{pct(r.probs.away)} <span style={{ color: "var(--vault-text-faint)" }}>away</span></span>
      </div>
    </div>
  );
}

function FixtureRow({ r }: { r: LeagueForecastRow }) {
  const top = r.topScorelines?.[0];
  return (
    <li className="px-3 py-3" style={{ borderTop: "1px solid var(--vault-rule)" }}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <TeamLogo team={r.homeClub} sport="soccer" size="sm" ariaLabel={`${r.homeClub} crest`} />
          <span className="truncate" style={{ fontWeight: 600 }}>{r.homeClub}</span>
          <span style={{ color: "var(--vault-text-faint)" }}>v</span>
          <span className="truncate" style={{ fontWeight: 600 }}>{r.awayClub}</span>
          <TeamLogo team={r.awayClub} sport="soccer" size="sm" ariaLabel={`${r.awayClub} crest`} />
        </div>
        <span className="shrink-0 font-mono" style={{ fontSize: 11, color: "var(--vault-text-faint)" }}>{ET_TIME.format(new Date(r.kickoffUtc))} ET</span>
      </div>
      <div className="mt-2"><OutcomeBar r={r} /></div>
      <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 font-mono" style={{ fontSize: 11.5, color: "var(--vault-text-mute)", margin: "8px 0 0" }}>
        <div className="flex gap-1.5"><dt>Expected goals</dt><dd style={{ margin: 0, color: "var(--vault-text)" }}>{r.expectedGoals?.toFixed(2) ?? "—"}</dd></div>
        <div className="flex gap-1.5"><dt>Over 2.5</dt><dd style={{ margin: 0, color: "var(--vault-text)" }}>{pct(r.over25)}</dd></div>
        <div className="flex gap-1.5"><dt>Both score</dt><dd style={{ margin: 0, color: "var(--vault-text)" }}>{pct(r.btts?.yes)}</dd></div>
        {top ? <div className="flex gap-1.5"><dt>Likeliest score</dt><dd style={{ margin: 0, color: "var(--vault-text)" }}>{top.score.replace("-", "–")} ({pct(top.p)})</dd></div> : null}
      </dl>
      {r.coldStart?.home || r.coldStart?.away ? (
        <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--vault-text-faint)" }}>A newly promoted side with no league history runs at the league-average baseline.</p>
      ) : null}
      {r.sparseInput?.note ? <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--vault-text-faint)" }}>{r.sparseInput.note}</p> : null}
    </li>
  );
}

export default function LeagueForecastPage({ leagueKey }: { leagueKey: string }) {
  const set = loadLeagueForecasts(leagueKey);
  const name = set?.competition ?? "League";
  const days = byDay(set?.rows ?? []);
  const v = set?.validation;
  return (
    <div data-sport="soccer" className="mx-auto w-full max-w-[1100px] px-4 py-6">
      <header className="mb-5">
        <p className="font-mono uppercase" style={{ margin: 0, fontSize: 11, letterSpacing: "0.08em", color: "var(--vault-text-faint)" }}>Soccer · model-only forecasts</p>
        <h1 style={{ margin: "6px 0 0", fontSize: 28, lineHeight: 1.15, color: "var(--vault-text)", textWrap: "balance" }}>{name} match forecasts</h1>
        <p style={{ margin: "8px 0 0", maxWidth: "65ch", fontSize: 14.5, color: "var(--vault-text-mute)" }}>
          Win, draw or win, expected goals and the likeliest scorelines for every {name} fixture in the next eight days — from the same model as our Premier League page.
        </p>
        {set ? <p className="font-mono" style={{ margin: "8px 0 0", fontSize: 11, color: "var(--vault-text-faint)" }}>Updated {ET_STAMP.format(new Date(set.generatedAt))} ET · fit on {set.model.matchesFitted.toLocaleString("en-US")} {name} matches</p> : null}
      </header>

      {v ? (
        <section aria-labelledby="how-it-tested" className="mb-6 rounded-[12px] p-4" style={{ background: "var(--vault-panel)", border: "1px solid var(--vault-rule)" }}>
          <h2 id="how-it-tested" style={{ margin: 0, fontSize: 15, color: "var(--vault-text)" }}>How this model did on a season it had never seen</h2>
          <ul className="mt-2 flex flex-col gap-1.5" style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 13.5, color: "var(--vault-text-mute)", maxWidth: "75ch" }}>
            <li>Across {v.holdout.matches} matches of the {v.holdout.season} season it was more accurate than knowing nothing about the clubs (log loss {v.holdout.logLoss} against {v.holdout.empiricalLogLoss}).</li>
            <li>Its draw probabilities were calibrated: stated and observed draw rates differed by {(v.holdout.drawEceAllScored * 100).toFixed(1)} percentage points on average.</li>
            {v.limitations.closingMarketBetterBy != null ? <li>The sportsbook closing line was more accurate than this model, by {v.limitations.closingMarketBetterBy} log loss, and so was a plain Elo rating{v.limitations.eloBetterBy != null ? ` (by ${v.limitations.eloBetterBy})` : ""}.</li> : null}
          </ul>
          <p style={{ margin: "10px 0 0", fontSize: 12.5, color: "var(--vault-text-faint)" }}>Model-only forecasts for research and entertainment — not betting advice.</p>
        </section>
      ) : null}

      {!set ? (
        <p role="status" style={{ fontSize: 14, color: "var(--vault-text-mute)" }}>The {leagueKey} forecast file isn&rsquo;t available right now.</p>
      ) : days.length === 0 ? (
        <p role="status" style={{ fontSize: 14, color: "var(--vault-text-mute)" }}>No {name} fixtures in the next eight days. Forecasts appear here once the next round is scheduled.</p>
      ) : (
        <div className="flex flex-col gap-5">
          {days.map((d) => (
            <section key={d.key} aria-labelledby={`day-${d.key}`} className="rounded-[12px]" style={{ border: "1px solid var(--vault-rule)", background: "var(--vault-panel)" }}>
              <h2 id={`day-${d.key}`} className="px-3 pt-3 pb-2" style={{ margin: 0, fontSize: 14, color: "var(--vault-text)" }}>{d.label}</h2>
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>{d.rows.map((r) => <FixtureRow key={r.eventId} r={r} />)}</ul>
            </section>
          ))}
        </div>
      )}

      {set && set.refused.length > 0 ? (
        <section aria-labelledby="not-forecast" className="mt-6">
          <h2 id="not-forecast" style={{ margin: 0, fontSize: 14, color: "var(--vault-text)" }}>Fixtures we did not forecast</h2>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 12.5, color: "var(--vault-text-mute)" }}>
            {set.refused.map((r) => <li key={r.eventId}>{r.matchup ?? "A fixture"}: {r.reason}</li>)}
          </ul>
        </section>
      ) : null}

      {set ? (
        <p style={{ margin: "24px 0 0", fontSize: 11.5, color: "var(--vault-text-faint)" }}>
          Fixtures: {set.sources.fixtures}. Results history: {set.sources.history}. Kick-off times in Eastern Time.
        </p>
      ) : null}
    </div>
  );
}
