/**
 * An accepted soccer league's model-only forecast page (P257). Server component; every number is read
 * from the league's public artifact (lib/sports/soccer/forecast-view.ts).
 *
 * The page leads with the fixtures and states, beside them, exactly how good the model was when it was
 * tested on a season it had never seen — including that the sportsbook closing line and a plain Elo
 * rating were both more accurate. Model-only forecasts; not betting advice.
 */
import SportSwitcher from "@/components/sports/sport-switcher";
import MoreDisclosure from "@/components/ui/more-disclosure";
import TeamLogo from "@/components/team-logo";
import { loadLeagueForecasts, loadLeagueGraded, type LeagueForecastRow } from "@/lib/sports/soccer/forecast-view";
import { gradedCaption } from "@/lib/sports/soccer/grading.mjs";
import { HubSlipBar, HubSlipButton, hubSlipLegs, type HubSlipLeg } from "@/components/products/hub-slip";
import { LeagueDataFreshness, LeagueFixtureBoard } from "@/components/soccer/league-fixture-board";
import { partitionFixtures } from "@/lib/sports/soccer/fixture-timing.mjs";

const pct = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? "—" : `${Math.round(n * 1000) / 10}%`);
const ET_TIME = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
const ET_STAMP = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });


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

function FixtureRow({ r, slip = null }: { r: LeagueForecastRow; slip?: HubSlipLeg | null }) {
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
      {/* Vehicle N: a Level A leg only (hub-slip) */}
      {slip ? <div className="mt-2"><HubSlipButton leg={slip} /></div> : null}
    </li>
  );
}

export default async function LeagueForecastPage({ leagueKey }: { leagueKey: string }) {
  const set = loadLeagueForecasts(leagueKey);
  /*
   * P0 10-28 · U7: A KICKED-OFF MATCH IS NEVER LISTED AS UPCOMING. When the soccer-leagues run failed (10-26) this page
   * listed played matches as upcoming for two days. Every row is now split at the build clock here (the static HTML) and
   * again at the viewer's clock in the browser (LeagueFixtureBoard); a started match without a recorded final says
   * "Kicked off — result pending", and stale league data gets a banner with its last update time (LeagueDataFreshness).
   * Rules: lib/sports/soccer/fixture-timing.mjs. This serves every league the registry publishes here (today Ligue 1).
   */
  const serverNowMs = Date.now();
  const graded = loadLeagueGraded(leagueKey);
  const finals: Record<string, { home: number; away: number }> = Object.fromEntries(
    (graded?.matches ?? []).filter((m) => m.final).map((m) => [String(m.eventId), { home: m.final.home, away: m.final.away }]),
  );
  const rows = [...(set?.rows ?? [])].sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc));
  const upcomingAtBuild = partitionFixtures(rows, serverNowMs, finals).upcoming;
  /* Vehicle N: Ligue 1 is a Level A sport — its rows' exact legs (none for any other league: the helper knows no other
     key), and one bar, only when a button renders. Only fixtures still to play at build time are offered. */
  const slip = leagueKey === "ligue-1" ? await hubSlipLegs("ligue-1", upcomingAtBuild.map((r) => String(r.eventId))) : new Map<string, HubSlipLeg>();
  const name = set?.competition ?? "League";
  const v = set?.validation;
  const recent = [...(graded?.matches ?? [])].sort((a, b) => b.kickoffUtc.localeCompare(a.kickoffUtc)).slice(0, 5);
  const OUTCOME = { H: "home win", D: "draw", A: "away win" } as const;
  return (
    <div data-sport="soccer" className="vault-page-shell px-4 sm:px-8 py-8 sm:py-14 overflow-x-hidden">
      <SportSwitcher current={leagueKey} />
      <header className="mb-5">
        <p className="font-mono uppercase" style={{ margin: 0, fontSize: 11, letterSpacing: "0.08em", color: "var(--vault-text-faint)" }}>Soccer · model-only forecasts</p>
        <h1 style={{ margin: "6px 0 0", fontSize: 28, lineHeight: 1.15, color: "var(--vault-text)", textWrap: "balance" }}>{name} match forecasts</h1>
        <p style={{ margin: "8px 0 0", maxWidth: "65ch", fontSize: 14.5, color: "var(--vault-text-mute)" }}>
          Win, draw or win, expected goals, over 2.5, both teams to score and the likeliest scorelines for every {name} fixture in the next eight days — from the same model as our Premier League page.
        </p>
        {set ? <p className="font-mono" style={{ margin: "8px 0 0", fontSize: 11, color: "var(--vault-text-faint)" }}>Updated {ET_STAMP.format(new Date(set.generatedAt))} ET · fit on {set.model.matchesFitted.toLocaleString("en-US")} {name} matches</p> : null}
        {set ? <LeagueDataFreshness leagueName={name} generatedAt={set.generatedAt} serverNowMs={serverNowMs} /> : null}
        <p data-hub-disclosure="" style={{ margin: "10px 0 0", maxWidth: "75ch", fontSize: 12.5, color: "var(--vault-text-mute)" }}>
          Model-only forecasts for research and entertainment — not betting advice.
          {v?.limitations?.closingMarketBetterBy != null ? " On a season it had never seen, the sportsbook closing line was more accurate than this model." : ""}
        </p>
      </header>

      {!set ? (
        <p role="status" style={{ fontSize: 14, color: "var(--vault-text-mute)" }}>The {leagueKey} forecast file isn&rsquo;t available right now.</p>
      ) : (
        <LeagueFixtureBoard
          leagueName={name}
          serverNowMs={serverNowMs}
          rows={rows.map((r) => ({ eventId: String(r.eventId), kickoffUtc: r.kickoffUtc, homeClub: r.homeClub, awayClub: r.awayClub }))}
          finals={finals}
          rowNodes={Object.fromEntries(upcomingAtBuild.map((r) => [String(r.eventId), <FixtureRow key={r.eventId} r={r} slip={slip.get(String(r.eventId))} />]))}
        />
      )}

      {set && set.refused.length > 0 ? (
        <section aria-labelledby="not-forecast" className="mt-6">
          <h2 id="not-forecast" style={{ margin: 0, fontSize: 14, color: "var(--vault-text)" }}>Fixtures we did not forecast</h2>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 12.5, color: "var(--vault-text-mute)" }}>
            {set.refused.map((r) => <li key={r.eventId}>{r.matchup ?? "A fixture"}: {r.reason}</li>)}
          </ul>
        </section>
      ) : null}

      {/* Overnight W8 (2026-10-28): the shared hub order — header and one disclosure line, the fixtures, then the record.
          The season-holdout test folds behind "How it was tested" (verbatim); its market comparison is in the line above. */}
      <section aria-labelledby="graded-so-far" className="mt-6">
        <h2 id="graded-so-far" style={{ margin: 0, fontSize: 15, color: "var(--vault-text)" }}>How it&rsquo;s doing now</h2>
        <p style={{ margin: "6px 0 0", fontSize: 13.5, color: "var(--vault-text-mute)", maxWidth: "75ch" }}>
          {graded && graded.summary.matches > 0
            ? `${graded.summary.matches} ${graded.summary.matches === 1 ? "match" : "matches"} graded · average log loss ${graded.summary.logLoss} (a one-in-three guess scores ${graded.summary.uniformLogLoss}) — ${gradedCaption(graded.summary)}.`
            : "No forecast match has finished yet. Each result is graded once, against the forecast published before kick-off."}
        </p>
        {/* SAY WHAT THE RECORD COVERS. graded.json grades the win/draw/win forecast only; the over 2.5, both-score
            and scoreline numbers on this page are published and not yet graded. Change this line when the
            graded file carries those families (Results owns the grading). */}
        <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--vault-text-faint)", maxWidth: "75ch" }}>
          Only the win/draw/win forecast is graded so far. Over 2.5, both teams to score and the likeliest score are published here but not yet graded.
        </p>
        {recent.length ? (
          <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 12.5, color: "var(--vault-text-mute)" }}>
            {recent.map((m) => (
              <li key={m.eventId}>
                {m.homeClub} {m.final.home}–{m.final.away} {m.awayClub}: the forecast gave the {OUTCOME[m.result]} {pct(m.probabilityOfResult)}.
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {v ? (
        <MoreDisclosure className="mt-6" title="How it was tested" summary="Its result on a full season it had never seen, against a no-information guess, a plain rating and the sportsbook closing line.">
        <section aria-labelledby="how-it-tested">
          <h2 id="how-it-tested" style={{ margin: 0, fontSize: 15, color: "var(--vault-text)" }}>How this model did on a season it had never seen</h2>
          <ul className="mt-2 flex flex-col gap-1.5" style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 13.5, color: "var(--vault-text-mute)", maxWidth: "75ch" }}>
            <li>Across {v.holdout.matches} matches of the {v.holdout.season} season it was more accurate than knowing nothing about the clubs (log loss {v.holdout.logLoss} against {v.holdout.empiricalLogLoss}).</li>
            <li>Its draw probabilities were calibrated: stated and observed draw rates differed by {(v.holdout.drawEceAllScored * 100).toFixed(1)} percentage points on average.</li>
            {v.limitations.closingMarketBetterBy != null ? <li>The sportsbook closing line was more accurate than this model, by {v.limitations.closingMarketBetterBy} log loss, and so was a plain Elo rating{v.limitations.eloBetterBy != null ? ` (by ${v.limitations.eloBetterBy})` : ""}.</li> : null}
          </ul>
          <p style={{ margin: "10px 0 0", fontSize: 12.5, color: "var(--vault-text-faint)" }}>Model-only forecasts for research and entertainment — not betting advice.</p>
        </section>
        </MoreDisclosure>
      ) : null}

      {set ? (
        <p style={{ margin: "24px 0 0", fontSize: 11.5, color: "var(--vault-text-faint)" }}>
          Fixtures: {set.sources.fixtures}. Results history: {set.sources.history}. Kick-off times in Eastern Time.
        </p>
      ) : null}
      <HubSlipBar legs={slip} />
    </div>
  );
}
