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
import TopReadsPanel from "@/components/top-reads-panel";
import { loadTopReads, topForSport } from "@/lib/top-reads";
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
import { gradedRecordCaption, loadEplGradedRecord } from "@/lib/sports/epl/graded-record";
import SportLabCards from "@/components/sport-lab-cards";
import GradedPicksSection from "@/components/sports/graded-picks-section";
import { loadGradedPicks } from "@/lib/sports/graded-picks-loader";
import { loadCurrentSportLabLadder, ladderDayLabel } from "@/lib/parlays/sport-lab-cards";
import { loadEplPlayerProjections, topScorersAcross } from "@/lib/sports/epl/forecast-view";

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
  const topReads = loadTopReads();
  const priced = forecastRows(set);
  const unpriced = unpricedRows(set);
  const days = byMatchday(priced);
  /*
   * THE NEXT MATCHDAY IS THE NEXT ONE, NOT THE EARLIEST ONE IN THE ARTIFACT.
   *
   * This was days[0] — the earliest priced day in the forecast set, whether or not it had already
   * been played. On a Saturday evening that made a finished afternoon the page's "Next matchday",
   * and because the Lab ladder is keyed to this day so a card built for another slate cannot appear
   * here, a ladder correctly built for Sunday was refused and the lane rendered nothing.
   *
   * The forecast set legitimately holds both — a played fixture's prediction is still a record of
   * what the model said. So the fixtures on the page are unchanged; only the day the page calls
   * NEXT moves to the first one with a kickoff still ahead of it. If every priced fixture has
   * kicked off, it falls back to the earliest rather than showing nothing, because "between
   * matchweeks" and "we have no forecasts" are different facts.
   */
  const nowIso = new Date().toISOString();
  const next = days.find((d) => d.rows.some((r) => Date.parse(r.kickoffUtc) > Date.parse(nowIso))) ?? days[0] ?? null;
  const reportable = priced.filter((r) => r.slug);
  /** The matchweek every priced fixture belongs to, or null when they straddle more than one. */
  const weeks = new Set(priced.map((r) => r.matchweek).filter((w) => w != null));
  const matchweek = weeks.size === 1 ? [...weeks][0] : null;
  const player = eplPlayerMarketStatus();
  const players = loadEplPlayerProjections();
  const gradedRecord = loadEplGradedRecord();
  /*
   * THE LADDER'S DAY IS THE LADDER'S, NOT THE HUB'S.
   *
   * This required the ladder to be dated exactly the hub's next matchday. Both derivations are
   * reasonable and they are not the same: the hub's next matchday is the first day with ANY fixture
   * still ahead, while the ladder needs a day with at least TWO, because two legs is the shortest
   * card any band accepts. This morning that made them disagree — the hub on Monday's single
   * fixture, a correctly-built ladder on next Saturday's eight — and a real three-band card reached
   * no page at all.
   *
   * The refusal that matters is staleness, and it is kept: loadCurrentSportLabLadder returns
   * nothing for a ladder dated before today. A ladder running AHEAD is a pregame product and is
   * labelled with its own day wherever it appears, so nothing is shown under the wrong date.
   */
  const labLadder = loadCurrentSportLabLadder("epl");
  const eplGraded = loadGradedPicks("epl");
  const topScorers = topScorersAcross(players, 12);
  /* Every fixture still awaiting its XI ⇒ the whole board reads as conditional. */
  const awaitingLineup = (players?.counts.withLineup ?? 0) === 0;
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
          // DERIVED, never a literal. This read "0 / no track record yet" as hard-coded text, which
          // was true until the first match was graded and false immediately afterwards. The caption
          // is owned by the loader so the small-sample warning cannot be dropped for a tidier hero.
          { label: "Matches graded", value: gradedRecord ? String(gradedRecord.team.matches) : "—", sub: gradedRecordCaption(gradedRecord) },
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
          {/* The FALLBACK fires only when the artifact is unreadable, so it must not assert a record
              either way. It used to claim no match had been graded, which was a statement about the
              world made from an inability to read a file — and it became false the night the first
              match settled. */}
          {set?.trackRecord ?? "The graded record could not be read, so no accuracy claim is made here."} These are the model&rsquo;s
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

      {/* ── 3 · PLAYER PREDICTIONS ─────────────────────────────────────────────────────────────── */}
      {players && topScorers.length > 0 ? (
        <section className="mt-8">
          {/*
            THE CONDITIONAL IS THE PRODUCT, not a caveat on it. The model was validated on players who
            APPEARED, so what it may publish is P(scores | he plays in this state). Until the XI is
            posted every row says "if he starts" — and that phrase is load-bearing, because assuming a
            starting eleven is a participation claim this model was never tested on.
          */}
          <SectionHeader
            eyebrow={`Player predictions · ${(players?.markets ?? []).length} market${(players?.markets ?? []).length === 1 ? "" : "s"}`}
            title={awaitingLineup ? "If he starts — likeliest scorers" : "Likeliest scorers"}
            sub={
              awaitingLineup
                ? "Two markets, each tested separately against its own bar: chance of a shot on goal, and chance of scoring. Lineups are posted about an hour before kickoff — until then both figures are conditional on that player STARTING, not a claim that he will. Rows update to the named eleven as soon as the teams are out."
                : "Two markets, each tested separately against its own bar. Read off the posted lineups: each figure is for the state the player is actually in. Once an eleven is named, a side's goals are shared out across the men actually playing — so these add back to exactly what the match simulation expects that team to score, rather than being a second opinion about the same game."
            }
          />
          <div className="rounded-[12px] overflow-hidden" style={{ background: "var(--vault-panel)", border: "1px solid var(--vault-rule)" }}>
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {topScorers.map((p) => (
                <li key={`${p.slug}-${p.playerId}`} className="flex items-center justify-between gap-3 px-3 py-2.5" style={{ borderTop: "1px solid var(--vault-rule)" }}>
                  {/*
                    THE CLUB CREST, NOT A PORTRAIT.
                    These rows named a player with no identity beside them at all. A face would be
                    better and is not available: ESPN's soccer headshot CDN answers for 2 of the 30
                    likeliest scorers on this matchday — 7% — so wiring it in would render 93%
                    initials discs and read as broken rather than sparse. The club crest resolves for
                    all 20 clubs, so it is the identity we can actually carry, on every row.
                  */}
                  <div className="min-w-0 flex items-center gap-2">
                    {p.teamName ? <TeamLogo team={p.teamName} sport="soccer" size="sm" ariaLabel={`${p.teamName} crest`} /> : null}
                    <div className="min-w-0">
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</span>
                      <span className="font-mono ml-2" style={{ fontSize: 10.5, color: "var(--vault-text-faint)" }}>
                        {p.teamName} · {p.matchup}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {/*
                      Appearances are shown because they are what the number rests on. A player with
                      none is sitting on his position's league rate, and a reader deserves to see the
                      difference between that and a rate earned over a hundred matches.
                    */}
                    <span className="font-mono" style={{ fontSize: 10, color: "var(--vault-text-faint)" }}>
                      {p.appearances > 0 ? `${p.appearances} apps` : "no history"}
                    </span>
                    {/* Two markets, each having cleared its OWN preregistered bars. Plain shots is
                        absent because it failed calibration — a rejected market is not shown with a
                        warning, it is not shown. */}
                    <span className="font-mono" title="chance of a shot on goal" style={{ fontSize: 12, color: "var(--sport-soccer)" }}>
                      {p.shotsOnGoalOver05 != null ? `${pct(p.shotsOnGoalOver05)} SOG` : ""}
                    </span>
                    <span className="font-mono" title="chance of scoring" style={{ fontSize: 13, fontWeight: 700, color: "var(--vault-accent)" }}>{pct(p.probability)}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* The receipt, beside the numbers. A reader never has to take the validation on trust. */}
          <p className="mt-3" style={{ fontSize: 12, lineHeight: 1.6, color: "var(--vault-text-faint)" }}>
            Validated out of sample: fitted on {players.model.fittedAppearances.toLocaleString()} appearances,
            then tested on a season it had never seen — {players.validation.holdout.n.toLocaleString()} player-matches,
            log loss {players.validation.holdout.logLoss} against {players.validation.holdout.positionalBaseline} for a
            position-only baseline, and it predicted {Math.round(players.validation.holdout.predictedScorers)} scorers
            where {players.validation.holdout.observedScorers} actually scored.
          </p>
          <ul className="mt-2" style={{ margin: 0, paddingLeft: 16, fontSize: 12, lineHeight: 1.65, color: "var(--vault-text-faint)" }}>
            {players.limitations.map((l) => <li key={l}>{l}</li>)}
          </ul>
        </section>
      ) : (
        <section className="mt-8">
          <SectionHeader eyebrow="Player predictions" title="Not available for this slate" />
          <div className="rounded-[12px] p-4" style={{ background: "var(--vault-panel)", border: "1px solid var(--vault-rule)" }}>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.65, color: "var(--vault-text-mute)" }}>{player.reason}</p>
          </div>
        </section>
      )}

      {/*
        ── THE RECORD — what was actually checked against a result ──────────────────────────────
        Rendered only once something has been graded, and framed as a LOG rather than a track
        record. Every figure here is read from the settler's append-only ledger; nothing on this
        page recomputes a score. The heading says "so far" and the caption says how little it means
        on purpose: a reader who sees one green row must not come away thinking the model has been
        shown to work, which is a separate question answered by a preregistered backtest that has
        not been run for this sport.
      */}
      {gradedRecord && gradedRecord.team.matches > 0 && (
        <section className="mt-8" id="record">
          <SectionHeader
            eyebrow="Settled"
            title={`Graded so far · ${gradedRecord.team.matches} match${gradedRecord.team.matches === 1 ? "" : "es"}`}
            sub="Read against the official result after full time. This is a log of what has been checked, not evidence the model works — that is a preregistered backtest, and it has not been run for this competition."
          />
          <div className="mt-3 overflow-x-auto">
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--vault-text-mute)" }}>
                  <th style={{ padding: "6px 10px", fontWeight: 600 }}>Match</th>
                  <th style={{ padding: "6px 10px", fontWeight: 600 }}>Result</th>
                  <th style={{ padding: "6px 10px", fontWeight: 600 }}>Model gave the actual outcome</th>
                </tr>
              </thead>
              <tbody>
                {gradedRecord.team.matchesList.map((m) => (
                  <tr key={m.eventId} style={{ borderTop: "1px solid var(--vault-rule)" }}>
                    <td style={{ padding: "8px 10px" }}>{m.matchup}</td>
                    <td style={{ padding: "8px 10px" }}>
                      {m.actual ? `${m.actual.homeGoalsFT}-${m.actual.awayGoalsFT}` : "—"}
                    </td>
                    <td style={{ padding: "8px 10px" }}>
                      {typeof m.probabilityOfActual === "number" ? `${(m.probabilityOfActual * 100).toFixed(1)}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {gradedRecord.player.rows > 0 && (
            <p style={{ margin: "10px 0 0", fontSize: 13, lineHeight: 1.65, color: "var(--vault-text-mute)" }}>
              {`Player markets: ${gradedRecord.player.rows} projection${gradedRecord.player.rows === 1 ? "" : "s"} graded`}
              {gradedRecord.player.voided > 0
                ? `, ${gradedRecord.player.voided} void because the player did not take the field the projection assumed — a condition that did not hold is never scored as a miss.`
                : "."}
            </p>
          )}
        </section>
      )}

      {labLadder ? <SportLabCards ladder={labLadder} eyebrow={ladderDayLabel(labLadder.date)} /> : null}

      {/*
        WHAT THE MODEL SAID, AND WHAT ACTUALLY HAPPENED — the same section on every sport.
        Forecasts were published continuously here and results were published almost nowhere, an
        asymmetry that always flatters. The rows come from this sport's own graded ledger and the
        sample note travels with them, so a small record cannot be read as a track record.
      */}
      {eplGraded ? <GradedPicksSection record={eplGraded} href="/results/picks/epl" /> : null}


      {/* The five reads this sport's model is most confident about today — team markets and player
          markets both, interleaved rather than sorted together, because a match favourite always
          outranks any single player and a plain sort would make the list all-team. */}
      {topReads ? (
        <TopReadsPanel
          set={topReads}
          reads={topForSport(topReads, "epl", 5)}
          eyebrow="Premier League · model reads"
          title="What the model is most confident about today"
        />
      ) : null}

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
