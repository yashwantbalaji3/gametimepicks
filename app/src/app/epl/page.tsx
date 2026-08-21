/**
 * /epl — the Premier League SIMULATION CENTER.
 *
 * WHAT THIS PAGE USED TO DO WRONG. It opened with an <h1> reading "Schedule", a source line, and a
 * twelve-fixture list — and the model forecasts, the thing we actually compute, sat below all of it.
 * A reader landing here saw a fixture list and concluded there were no EPL simulations. That is the
 * correct conclusion to draw from that page and the wrong fact about the product.
 *
 * So the order now mirrors /mlb, for the reason /mlb is ordered that way: THE MODEL'S OWN READ COMES
 * FIRST. Signature product, then the predictions for the matchday in question, then the per-fixture
 * simulations, and only then the schedule — which is reference material, not the point.
 *
 * WHAT IS DELIBERATELY ABSENT, AND SAID OUT LOUD. There are no player markets. Not "coming soon" —
 * there is no player-level Premier League data in this system at all, so any player number would be
 * invented. That refusal is RENDERED rather than left as a hole a reader has to notice, because an
 * absence with no explanation reads as an oversight and invites someone to quietly fill it in.
 *
 * NOTHING HERE IS VALIDATED. Zero Premier League matches have been graded under this model. That
 * statement sits above the first number and is not a footer a later edit can drop.
 *
 * Cold-start clubs are flagged on the row they affect. Coventry City and Hull City are newly promoted
 * with no top-flight history, so they run at the league-average baseline.
 */
import type { Metadata } from "next";
import Link from "next/link";

import SportOverviewHero from "@/components/sport-overview-hero";
import SectionHeader from "@/components/section-header";
import TeamLogo from "@/components/team-logo";
import { ScheduleList } from "@/components/sports/sport-schedule-page";
import { allUpcoming } from "@/lib/sports/upcoming/adapters.mjs";
import {
  loadEplForecasts,
  forecastRows,
  unpricedRows,
  eplMatchHref,
  type EplForecastRow,
  type EplForecastSet,
} from "@/lib/sports/epl/forecast-view";
import { eplPlayerMarketStatus } from "@/lib/sports/epl/player-markets.mjs";

export const metadata: Metadata = {
  title: "Premier League — Simulation Center · GameTime Picks",
  description:
    "Premier League model simulations: match-result probabilities, scorelines, goals and margin for every fixture we can price. Distributions only — not picks. No match has been graded under this model yet.",
};

const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;
const ET_DAY = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric" });
const ET_TIME = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
const ET_KEY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });

/** Group priced fixtures by ET matchday, soonest first. "That specific day" is the unit here. */
function byMatchday(rows: EplForecastRow[]): Array<{ key: string; label: string; rows: EplForecastRow[] }> {
  const days = new Map<string, EplForecastRow[]>();
  for (const r of [...rows].sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc))) {
    const k = ET_KEY.format(new Date(r.kickoffUtc));
    days.set(k, [...(days.get(k) ?? []), r]);
  }
  return [...days].map(([key, rs]) => ({ key, label: ET_DAY.format(new Date(rs[0].kickoffUtc)), rows: rs }));
}

/** One fixture's team prediction. Every figure is read from the artifact; none is recomputed here. */
function PredictionRow({ r }: { r: EplForecastRow }) {
  const home = r.homeClub ?? r.matchup.split(" v ")[0];
  const away = r.awayClub ?? r.matchup.split(" v ")[1];
  const cold = Boolean(r.coldStart?.home || r.coldStart?.away);
  const body = (
    <>
      <div className="flex items-center gap-2 min-w-0">
        <TeamLogo team={home} sport="soccer" size="sm" ariaLabel={`${home} crest`} />
        <span className="truncate" style={{ fontWeight: 600 }}>{home}</span>
        <span style={{ color: "var(--vault-text-faint)" }}>v</span>
        <span className="truncate" style={{ fontWeight: 600 }}>{away}</span>
        <TeamLogo team={away} sport="soccer" size="sm" ariaLabel={`${away} crest`} />
      </div>
      <div className="flex items-center gap-3 font-mono shrink-0" style={{ fontSize: 12.5 }}>
        <span title={`${home} win`} style={{ color: "var(--vault-accent)" }}>{pct(r.probs!.home)}</span>
        <span title="Draw" style={{ color: "var(--vault-text-mute)" }}>{pct(r.probs!.draw)}</span>
        <span title={`${away} win`} style={{ color: "var(--sport-soccer)" }}>{pct(r.probs!.away)}</span>
        <span style={{ color: "var(--vault-text-faint)" }}>·</span>
        <span title="Expected total goals" style={{ color: "var(--vault-text-mute)" }}>{r.expectedGoals?.toFixed(2) ?? "—"} xG</span>
      </div>
    </>
  );
  return (
    <li style={{ borderTop: "1px solid var(--vault-rule)" }}>
      {r.slug ? (
        <Link href={eplMatchHref(r.slug)} className="flex items-center justify-between gap-4 px-3 py-3" style={{ color: "var(--vault-text)" }}>
          {body}
        </Link>
      ) : (
        <div className="flex items-center justify-between gap-4 px-3 py-3">{body}</div>
      )}
      {cold ? (
        <p className="px-3 pb-2" style={{ margin: 0, fontSize: 11, color: "var(--vault-text-faint)" }}>
          Newly promoted side with no top-flight history — running at the league-average baseline.
        </p>
      ) : null}
    </li>
  );
}

/** A per-fixture simulation card: what the reader opens to see the full distribution. */
function SimulationCard({ r }: { r: EplForecastRow }) {
  const home = r.homeClub ?? r.matchup.split(" v ")[0];
  const away = r.awayClub ?? r.matchup.split(" v ")[1];
  const top = r.topScorelines?.[0];
  return (
    <Link
      href={eplMatchHref(r.slug as string)}
      className="block rounded-[12px] p-4"
      style={{ background: "var(--vault-panel)", border: "1px solid var(--vault-rule)", color: "var(--vault-text)" }}
    >
      <div className="flex items-center gap-2 mb-2">
        <TeamLogo team={home} sport="soccer" size="sm" ariaLabel={`${home} crest`} />
        <TeamLogo team={away} sport="soccer" size="sm" ariaLabel={`${away} crest`} />
        <span className="font-mono ml-auto" style={{ fontSize: 10, color: "var(--vault-text-faint)" }}>
          {ET_TIME.format(new Date(r.kickoffUtc))} ET
        </span>
      </div>
      <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700 }}>{home} v {away}</p>
      <p className="font-mono mt-1" style={{ margin: 0, fontSize: 11.5, color: "var(--vault-text-mute)" }}>
        {top ? `likeliest ${top.score.replace("-", "–")} at ${pct(top.p)}` : "distribution published"}
        {r.totals ? ` · over 2.5 ${pct(r.totals.over25)}` : ""}
      </p>
      <p className="font-mono mt-2" style={{ margin: 0, fontSize: 10.5, color: "var(--vault-accent)" }}>Open the simulation →</p>
    </Link>
  );
}

export default function EplPage() {
  type Feed = { sport?: string; events?: unknown[]; totals?: { upcoming?: number }; sourceVerdict?: { sourceId?: string | null; fetchedAt?: string | null } };
  const feed = (allUpcoming({ nowIso: new Date().toISOString() }) as unknown as Feed[]).find((x) => x.sport === "epl");
  const set: EplForecastSet | null = loadEplForecasts();
  const priced = forecastRows(set);
  const unpriced = unpricedRows(set);
  const days = byMatchday(priced);
  const next = days[0] ?? null;
  const reportable = priced.filter((r) => r.slug);
  /** The matchweek every priced fixture belongs to, or null when they straddle more than one. */
  const weeks = new Set(priced.map((r) => r.matchweek).filter((w) => w != null));
  const matchweek = weeks.size === 1 ? [...weeks][0] : null;
  const player = eplPlayerMarketStatus();
  const capturedAt = feed?.sourceVerdict?.fetchedAt ?? null;

  return (
    <main className="mx-auto w-full max-w-[1100px] px-4 py-6">
      <SportOverviewHero
        compact
        icon="⚽"
        eyebrow={next ? `Simulation Center · ${next.label}` : "Simulation Center"}
        sport="Premier League"
        tagline="match result · scorelines · goals · margin"
        statusKind={priced.length > 0 ? "live" : "linesPending"}
        statusCaption={priced.length > 0 ? `${priced.length} fixture${priced.length === 1 ? "" : "s"} simulated` : "no priced fixtures"}
        matchupLine={next ? `Next matchday · ${next.label}` : "Between matchweeks"}
        accent="wc"
        stats={[
          { label: "Fixtures simulated", value: String(priced.length), sub: `of ${priced.length + unpriced.length} in the window` },
          { label: "Matches graded", value: "0", sub: "no track record yet" },
          { label: "Season", value: "2026-27", sub: "380 fixtures" },
        ]}
        ctas={[
          ...(reportable[0] ? [{ href: eplMatchHref(reportable[0].slug as string), label: "Open the next simulation", primary: true }] : []),
          { href: "/simulate/", label: "All simulations" },
          { href: "#schedule", label: "Full schedule" },
        ]}
      />

      {/*
        THE LIMITATION LEADS, above the first number. A reader who stops after the headline has still
        been told that nothing here has been checked against a result.
      */}
      <section
        className="mt-5 rounded-[12px] p-4"
        style={{ background: "var(--vault-panel)", border: "1px solid color-mix(in srgb, var(--sport-soccer) 40%, var(--vault-rule))" }}
      >
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6 }}>
          <strong style={{ color: "var(--sport-soccer)" }}>Not validated out of sample.</strong>{" "}
          {set?.trackRecord ?? "No Premier League match has been graded under this model."} These are the model&rsquo;s
          own probability distributions, published so you can see what it says — not picks, not advice, and not
          compared against any price.
        </p>
      </section>

      {/* ── 1 · TEAM PREDICTIONS for the matchday ──────────────────────────────────────────────── */}
      {days.length > 0 ? (
        <section className="mt-8">
          {/*
            The title must cover what the SECTION contains, not just its first group. It read
            "Friday, August 21" above a list that also held Saturday, Sunday and Monday fixtures —
            a heading describing one day while four were rendered under it. Where every priced
            fixture shares a matchweek, that is the honest unit; otherwise the span is stated.
          */}
          <SectionHeader
            eyebrow="Team predictions"
            title={
              days.length === 1
                ? days[0].label
                : matchweek != null
                  ? `Matchweek ${matchweek}`
                  : `Next ${days.length} matchdays`
            }
            sub="Match-result probabilities and expected goals for every fixture the model can price. Open any fixture for its full distribution."
          />
          {days.map((d) => (
            <div key={d.key} className="mt-4">
              {days.length > 1 ? (
                <p className="font-mono uppercase tracking-[0.1em]" style={{ margin: "0 0 6px", fontSize: 10, color: "var(--sport-soccer)" }}>{d.label}</p>
              ) : null}
              <ul
                className="rounded-[12px] overflow-hidden"
                style={{ listStyle: "none", margin: 0, padding: 0, background: "var(--vault-panel)", border: "1px solid var(--vault-rule)" }}
              >
                {d.rows.map((r) => <PredictionRow key={r.eventId} r={r} />)}
              </ul>
            </div>
          ))}
          <p className="font-mono mt-2" style={{ fontSize: 10.5, color: "var(--vault-text-faint)" }}>
            home · draw · away, then expected total goals. Read left to right.
          </p>
          {unpriced.length > 0 ? (
            <p className="mt-3" style={{ fontSize: 12.5, color: "var(--vault-text-mute)" }}>
              {/* Naming what we could NOT price. Dropping it would make 9 of 10 read as 10 of 10. */}
              <strong>Not forecast:</strong>{" "}
              {unpriced.map((r) => `${r.matchup} (${r.unavailableReason ?? "unavailable"})`).join(" · ")}
            </p>
          ) : null}
        </section>
      ) : (
        <section className="mt-8">
          <SectionHeader
            eyebrow="Team predictions"
            title="No fixtures inside the forecast window"
            sub="Between matchweeks the model publishes nothing, which is the honest state rather than a stale card left up."
          />
        </section>
      )}

      {/* ── 2 · SIMULATIONS ────────────────────────────────────────────────────────────────────── */}
      {reportable.length > 0 ? (
        <section className="mt-8">
          <SectionHeader
            eyebrow={`Simulations · ${reportable.length} live`}
            title="Open a fixture's full distribution"
            sub="Ten likeliest scorelines, the goal-total ladder, each side's own goal curve, both teams to score, clean sheets and the winning margin — every figure an exact sum over one score matrix."
          />
          <div className="mt-4 grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
            {reportable.map((r) => <SimulationCard key={r.eventId} r={r} />)}
          </div>
          <p className="mt-3" style={{ fontSize: 12, color: "var(--vault-text-faint)", lineHeight: 1.6 }}>
            {/* The honest method note. EPL must never borrow a run-count claim: nothing is sampled. */}
            These are evaluated exactly rather than sampled, so there is no run count to quote — the same fixture
            returns the same numbers for every visitor, every time.
          </p>
        </section>
      ) : null}

      {/* ── 3 · PLAYER MARKETS — the refusal, rendered ─────────────────────────────────────────── */}
      <section className="mt-8">
        {/*
          The state changed on 2026-08-21: the data arrived, the model did not. The old copy said the
          history did not exist, which is now false, and a stale refusal is exactly as misleading as a
          stale claim. What must NOT change is that nothing about a player is published until a
          backtest clears a preregistered bar.
        */}
        <SectionHeader eyebrow="Player markets" title="Data in hand — nothing published yet" />
        <div className="rounded-[12px] p-4" style={{ background: "var(--vault-panel)", border: "1px solid var(--vault-rule)" }}>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.65, color: "var(--vault-text-mute)" }}>{player.reason}</p>
          <p className="mt-2" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.65, color: "var(--vault-text-faint)" }}>
            Goalscorer, shots, shots on target, assists and cards are all candidates. Each one waits on the same
            thing: a model fitted to this history and measured against a season it has not seen. Five model
            changes have been tested that way on this site and rejected; if a player model fails the same test,
            nothing here will appear.
          </p>
        </div>
      </section>

      {/* ── 4 · SCHEDULE — reference, deliberately last ────────────────────────────────────────── */}
      <section className="mt-8" id="schedule">
        <SectionHeader eyebrow="Schedule" title="2026-27 fixture list" sub="Every fixture, whether or not the model can price it." />
        <div className="mt-3">
          <ScheduleList
            events={(feed?.events ?? []) as never[]}
            sides={["home", "away"]}
            joiner="at"
            logoSport="soccer"
            accent="var(--sport-soccer)"
          />
        </div>
        <p className="font-mono mt-3" style={{ fontSize: 10.5, color: "var(--vault-text-faint)" }}>
          Source: {feed?.sourceVerdict?.sourceId ?? "openfootball (public domain)"}
          {capturedAt ? ` · captured ${new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(capturedAt))} ET` : ""}
          {feed?.totals?.upcoming ? ` · showing the next ${(feed.events ?? []).length} of ${feed.totals.upcoming}` : ""}
        </p>
      </section>

      <p className="mt-6" style={{ fontSize: 12, lineHeight: 1.6, color: "var(--vault-text-faint)" }}>
        Paper-only and educational. Not betting advice. Generated {set?.generatedAt ?? "—"} from pregame inputs only;
        the model never sees a result from a match it is forecasting.
      </p>
    </main>
  );
}
