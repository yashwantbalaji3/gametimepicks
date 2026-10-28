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
 * PLAYER PREDICTIONS. Anytime-scorer and shot-on-target projections publish from their own player head
 * (P251), conditional on the posted or assumed lineup. When no upcoming fixture carries player rows the
 * section says so in words rather than leaving a hole a reader has to notice. (This header used to say
 * there was no player data at all; that stopped being true on 2026-08-21.)
 *
 * NOT VALIDATED OUT OF SAMPLE. The graded record to date renders dynamically from its own artifact
 * (never a hand-typed count — those drift the moment the next match settles), and the validation
 * state sits above the first number rather than in a footer a later edit can drop.
 *
 * Cold-start clubs are flagged on the row they affect. Coventry City and Hull City are newly promoted
 * with no top-flight history, so they run at the league-average baseline.
 */
import { HubSlipBar, HubSlipButton, hubSlipLegs, type HubSlipLeg } from "@/components/products/hub-slip";
import type { Metadata } from "next";
import { formatUpdatedEt } from "@/lib/format";
import HubHeader, { HubTitle } from "@/components/sport-hub/hub-header";
import SportSwitcher from "@/components/sports/sport-switcher";
import { eplHub } from "@/lib/sport-hub/adapters";
import Link from "next/link";
import { sourceDisplayName } from "@/lib/sports/source-registry.mjs";

import SectionHeader from "@/components/section-header";
import MoreDisclosure from "@/components/ui/more-disclosure";
import SportHubNav from "@/components/sports/sport-hub-nav";
import TeamLogo from "@/components/team-logo";
import { ScheduleList } from "@/components/sports/sport-schedule-page";
import { allUpcoming } from "@/lib/sports/upcoming/adapters.mjs";
import {
  loadEplForecasts,
  loadEplForecastArchive,
  forecastRows,
  unpricedRows,
  eplMatchHref,
  type EplForecastRow,
  type EplForecastSet,
} from "@/lib/sports/epl/forecast-view";
import { gradedRecordCaption, loadEplGradedRecord } from "@/lib/sports/epl/graded-record";
import SportLabCards from "@/components/sport-lab-cards";
import GradedPicksSection from "@/components/sports/graded-picks-section";
import { loadGradedPicks } from "@/lib/sports/graded-picks-loader";
import { loadCurrentSportLabLadder, ladderDayLabel, loadSportLabStreamRecord } from "@/lib/parlays/sport-lab-cards";
import { loadEplPlayerProjections, topScorersAcross } from "@/lib/sports/epl/forecast-view";
import { withRouteMetadata } from "@/lib/seo/route-metadata";
import path from "node:path";
import ModelStatusPanel from "@/components/command-center/model-status-panel";
import { modelStatusFor } from "@/lib/command-center/model-status";

export const metadata: Metadata = withRouteMetadata("/epl/", {
  title: "Premier League — Simulation Center · GameTime Picks",
  description:
    "Premier League model simulations: match-result probabilities, scorelines, goals and margin for every fixture we can price. Distributions only — not picks. The model's graded record to date is shown on the page.",
});

const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;

/** "Sat, Oct 31" — an ET day in words for a reader; the archive used to print the ISO key. */
const ET_DAY_SHORT = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric" });

/**
 * The expected-total-goals figure when it is the SAME for every priced fixture, else null. The team model sets each
 * match's total from the league's recent scoring rate and only splits it between the sides, so on a normal matchweek
 * every fixture carries one identical total and one identical over-2.5 chance. Printed on every row it read as a
 * broken binding (audit 2026-10-27, "2.79 xG / 52.9% on every match"); it is a real property of the model, so the
 * hub states it ONCE, with the reason, read from the artifact — never typed here.
 */
function sharedTotal(rows: EplForecastRow[]): { xg: string; over25: string | null } | null {
  const xgs = new Set(rows.map((r) => (typeof r.expectedGoals === "number" ? r.expectedGoals.toFixed(2) : null)));
  if (rows.length < 2 || xgs.size !== 1 || xgs.has(null)) return null;
  const overs = new Set(rows.map((r) => (typeof r.totals?.over25 === "number" ? pct(r.totals.over25) : null)));
  return { xg: [...xgs][0] as string, over25: overs.size === 1 && !overs.has(null) ? ([...overs][0] as string) : null };
}

export default async function EplPage() {
  type Feed = { sport?: string; events?: unknown[]; totals?: { upcoming?: number }; sourceVerdict?: { sourceId?: string | null; fetchedAt?: string | null } };
  const feed = (allUpcoming({ nowIso: new Date().toISOString() }) as unknown as Feed[]).find((x) => x.sport === "epl");
  const set: EplForecastSet | null = loadEplForecasts();
  /*
   * PLAYED fixtures, newest first. The archive holds every fixture ever forecast; the live set holds
   * the ones still ahead. The difference is the history, and it had no page linking to it.
   */
  const liveSlugs = new Set((set?.rows ?? []).map((r) => r.slug).filter(Boolean));
  const archived: EplForecastRow[] = loadEplForecastArchive()
    .filter((r: EplForecastRow) => Boolean(r.slug) && Boolean(r.probs) && !liveSlugs.has(r.slug as string))
    .sort((a: EplForecastRow, b: EplForecastRow) => String(b.kickoffUtc ?? "").localeCompare(String(a.kickoffUtc ?? "")));
  const priced = forecastRows(set);
  const unpriced = unpricedRows(set);
  const nowIso = new Date().toISOString();
  const gradedRecord = loadEplGradedRecord();
  /* One statement of the shared total (see sharedTotal), and the cold-start clubs named once under the list. */
  const shared = sharedTotal(priced);
  const cold = [...new Set(priced.flatMap((r) => [
    ...(r.coldStart?.home ? [r.homeClub ?? r.matchup.split(" v ")[0]] : []),
    ...(r.coldStart?.away ? [r.awayClub ?? r.matchup.split(" v ")[1]] : []),
  ]))];
  /* Past matches: one row per played fixture — its pre-kickoff forecast link and, once graded, the result. */
  const gradedById = new Map((gradedRecord?.team.matchesList ?? []).map((m) => [String(m.eventId), m]));
  /* Vehicle N: the priced rows' Level A legs (exact leg or none); the bar renders once, and only when a button does. */
  const slip = await hubSlipLegs("epl", priced.map((r) => String(r.eventId)));
  const players = loadEplPlayerProjections();
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
  const topScorers = topScorersAcross(players, 12, nowIso);
  /* Every fixture still awaiting its XI ⇒ the whole board reads as conditional. */
  const awaitingLineup = (players?.counts.withLineup ?? 0) === 0;
  const capturedAt = feed?.sourceVerdict?.fetchedAt ?? null;

  const __hubModel = eplHub(nowIso);

  // A DIV, not <main>: the app layout already provides the single main landmark (P250 · A13; the
  // same fix /nfl and /mlb already carry — two <main> landmarks fail the accessibility contract).
  return (
    <div data-sport="epl" className="vault-page-shell px-4 sm:px-8 py-8 sm:py-14 overflow-x-hidden">
      {/* Program 237: the events come first on every sport page. */}

      {/* P208 · Release C — shared section nav; every hub capability one action from here. */}
      <div className="mb-4">
        {/* UX-001 phase 2: the shared sport switcher — every hub links to every other sport. */}
        <SportSwitcher current="epl" />
        <HubTitle model={__hubModel} />
      <SportHubNav
          sport="epl"
          anchors={[
            /* Session 5 · B8: the Fixtures section always renders (HubHeader below), so its strip item must too. */
            "epl-games",
            ...(archived.length > 0 || (gradedRecord && gradedRecord.team.matches > 0) ? ["record"] : []),
            "schedule",
          ]}
        />
      </div>
      {/*
        THE LIMITATION LEADS, above the first number — now as the hub's ONE disclosure line (overnight W8, 2026-10-28).
        SCOPE THE CLAIM TO ITS HEAD (P241 · A07): the headline is about the TEAM match model; the player head carries
        its own line further down. The full test description and the graded-record sentence (both read from the
        artifact, never typed here) are one tap away in "What these numbers are" — shortened, not removed.
      */}
      <section
        className="mb-5 rounded-[12px] px-4 py-3"
        style={{ background: "var(--vault-panel)", border: "1px solid color-mix(in srgb, var(--sport-soccer) 40%, var(--vault-rule))" }}
      >
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6 }}>
          {set?.validation === "VALIDATED_OUT_OF_SAMPLE_HISTORY" && set.validationNote ? (
            <strong style={{ color: "var(--sport-soccer)" }}>Team match model — tested blind on past seasons.</strong>
          ) : (
            <strong style={{ color: "var(--sport-soccer)" }}>Team match model — not validated out of sample.</strong>
          )}{" "}
          Probability distributions, not picks. Paper-only and educational.
        </p>
        <details className="mt-1">
          <summary className="cursor-pointer font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 10.5, minHeight: 32 }}>
            What these numbers are
          </summary>
          <p className="mt-1.5" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, color: "var(--vault-text-mute)" }}>
            {set?.validation === "VALIDATED_OUT_OF_SAMPLE_HISTORY" && set.validationNote ? <>{set.validationNote}{" "}</> : null}
            {/* The FALLBACK fires only when the artifact is unreadable, so it must not assert a record either way. */}
            {set?.trackRecord ?? "The graded record could not be read, so no accuracy claim is made here."}
          </p>
          <p className="mt-1.5" style={{ margin: "6px 0 0", fontSize: 12.5, lineHeight: 1.6, color: "var(--vault-text-mute)" }}>
            These are the model&rsquo;s own probability distributions, published so you can see what it
            says — not picks, not advice, and not compared against any price.
          </p>
        </details>
      </section>
      {/* Overnight W8 (2026-10-28): the hub's ONE listing of the matchweek. The mid-page hero, the "Team predictions"
          list, the "Every simulation report" cards and the "model reads" panel each listed the same ten fixtures (or
          their scorers) again — removed; every fixture's full distribution is one tap away on its report. The
          Add-to-slip buttons the predictions list carried ride on these cards instead (HubHeader extras). */}
      <section id="epl-games" className="scroll-mt-24">
        <HubHeader model={__hubModel} extras={new Map([...slip].map(([id, leg]) => [id, <HubSlipButton key={id} leg={leg} />]))} />
        {shared ? (
          <p data-shared-total="" className="m-0 mt-3 text-[12.5px]" style={{ color: "var(--vault-text-mute)", lineHeight: 1.6 }}>
            Expected total goals is {shared.xg} in every match{shared.over25 ? ` (over 2.5 goals: ${shared.over25})` : ""}: the model sets
            each match&rsquo;s total from the league&rsquo;s recent scoring rate and splits it between the two sides by strength. Each
            report shows its own scorelines and each side&rsquo;s goals.
          </p>
        ) : null}
        {cold.length > 0 ? (
          <p className="m-0 mt-2 text-[12px]" style={{ color: "var(--vault-text-faint)" }}>
            Newly promoted, with no top-flight history, so running at the league-average baseline: {cold.join(", ")}.
          </p>
        ) : null}
        {unpriced.length > 0 ? (
          <p className="m-0 mt-2 text-[12.5px]" style={{ color: "var(--vault-text-mute)" }}>
            {/* Naming what we could NOT price. Dropping it would make 9 of 10 read as 10 of 10. */}
            <strong>Not forecast:</strong>{" "}
            {unpriced.map((r) => `${r.matchup} (${r.unavailableReason ?? "unavailable"})`).join(" · ")}
          </p>
        ) : null}
      </section>
      {/* P257: the same model, applied to Ligue 1 after its own preregistered backtest accepted it. */}
      <p className="text-[13px]" style={{ color: "var(--vault-text-mute)", margin: "12px 0 0" }}>
        Also forecast with this model: <Link href="/soccer/ligue-1/" className="inline-flex items-center" style={{ color: "var(--vault-accent)", minHeight: 44 }}>Ligue 1 match forecasts →</Link>
      </p>


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
            // P213 R-C2: one line per state; the allocation mechanics live in the validation
            // disclosure below. The conditional-on-starting caveat is the state truth — it stays.
            sub={
              awaitingLineup
                ? "Shot-on-goal and scoring chances — conditional on STARTING until lineups post (~1h before kickoff)."
                : "Shot-on-goal and scoring chances, read off the posted lineups."
            }
          />
          <div className="rounded-[12px] overflow-hidden" style={{ background: "var(--vault-panel)", border: "1px solid var(--vault-rule)" }}>
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {topScorers.map((p) => (
                <li key={`${p.slug}-${p.playerId}`} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2.5" style={{ borderTop: "1px solid var(--vault-rule)" }}>
                  {/*
                    THE CLUB CREST, NOT A PORTRAIT.
                    These rows named a player with no identity beside them at all. A face would be
                    better and is not available: ESPN's soccer headshot CDN answers for 2 of the 30
                    likeliest scorers on this matchday — 7% — so wiring it in would render 93%
                    initials discs and read as broken rather than sparse. The club crest resolves for
                    all 20 clubs, so it is the identity we can actually carry, on every row.
                  */}
                  {/* UXR1-05 (DS-001 §9): at 320 px the figures column left this side ~60 px, so the club and fixture
                      ran one word per line underneath "127 apps". The row wraps; this side keeps a 12rem basis. */}
                  <div className="min-w-0 flex items-center gap-2" style={{ flex: "1 1 12rem" }}>
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
                    {/* P251-F8: both figures are labelled. The row read "81.3% SOG 52.9%" — the
                        trailing label attached to the wrong number by eye, and the headline
                        probability had no label at all. */}
                    <span className="font-mono" title="chance of a shot on goal" style={{ fontSize: 12, color: "var(--sport-soccer)" }}>
                      {p.shotsOnGoalOver05 != null ? `SOG ${pct(p.shotsOnGoalOver05)}` : ""}
                    </span>
                    <span className="font-mono" title="chance of scoring" style={{ fontSize: 13, fontWeight: 700, color: "var(--vault-accent)" }}>
                      <span style={{ fontSize: 10, fontWeight: 400, color: "var(--vault-text-faint)" }}>Score </span>{pct(p.probability)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* P213 R-C2: the receipt stays beside the numbers — behind one disclosure. Founder decision
              2026-10-06: the summary makes no validation claim ("Player model · not validated"); the
              holdout numbers below are the test it was given, not a stamp of approval. */}
          <details className="mt-3">
            <summary className="cursor-pointer font-mono uppercase tracking-[0.1em]" style={{ fontSize: 10.5, color: "var(--vault-text-faint)" }}>
              Player model · not validated — the holdout test
            </summary>
            <p className="mt-1.5" style={{ fontSize: 12, lineHeight: 1.6, color: "var(--vault-text-faint)" }}>
              Fitted on {players.model.fittedAppearances.toLocaleString("en-US")} appearances,
              then tested on a season it had never seen — {players.validation.holdout.n.toLocaleString("en-US")} player-matches,
              log loss {players.validation.holdout.logLoss} against {players.validation.holdout.positionalBaseline} for a
              position-only baseline, and it predicted {Math.round(players.validation.holdout.predictedScorers)} scorers
              where {players.validation.holdout.observedScorers} actually scored. Once an eleven is named, a side&rsquo;s
              goals are shared across the men actually playing — the rows add back to what the match simulation
              expects that team to score.
            </p>
            <ul className="mt-2" style={{ margin: 0, paddingLeft: 16, fontSize: 12, lineHeight: 1.65, color: "var(--vault-text-faint)" }}>
              {/* "see rejectedMarkets" names a data field, not a place a reader can go: the sentence before it already says
                  the rejected markets are absent, so the pointer is dropped from the display (the artifact is unchanged). */}
              {players.limitations.map((l) => <li key={l}>{l.replace(/;\s*see rejectedMarkets\.?$/, ".")}</li>)}
            </ul>
          </details>
        </section>
      ) : (
        <section className="mt-8">
          <SectionHeader eyebrow="Player predictions" title="Not available for this slate" />
          <div className="rounded-[12px] p-4" style={{ background: "var(--vault-panel)", border: "1px solid var(--vault-rule)" }}>
            {/* This used to print player-markets.mjs's August refusal ("no model… nothing about an individual
                player is published") while the player head was publishing. The fallback only means no
                upcoming fixture carries player rows right now, or the file could not be read — say which. */}
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.65, color: "var(--vault-text-mute)" }}>
              {players
                ? "No upcoming fixture has player predictions yet. Anytime-scorer and shot-on-target projections appear here once the next matchweek's forecasts are built."
                : "The player prediction file could not be read, so no player numbers are shown."}
            </p>
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
      {/* Overnight W8 (2026-10-28): CONSOLIDATED. The hub carried two folded 76-row lists of the same played fixtures —
          "Played fixtures" (links to each pre-kickoff forecast) and "Settled record" (result and the probability the
          model gave it). One table now carries both: every archived fixture still links to its own page (the
          archive-reachability guard), and every graded result and its sample caveat stay. */}
      {archived.length > 0 || (gradedRecord && gradedRecord.team.matches > 0) ? (
        <MoreDisclosure className="mt-8" title="Past matches" summary="Each played fixture: the forecast published before kickoff, and the result once graded.">
        <section className="scroll-mt-24" id="record">
          <SectionHeader
            eyebrow={`Archive · ${archived.length} played${gradedRecord ? ` · ${gradedRecord.team.matches} graded` : ""}`}
            title="Every fixture we published a forecast for"
            sub={`What the model said before each kickoff, kept exactly as it was published. These are past fixtures; nothing here is a current read. ${
              /* The record line must not contradict the banner: when the artifact says the team model was tested blind
                 on past seasons, say that is where its test lives; otherwise say none has been run. Either way this log
                 is a count, never an accuracy claim. */
              set?.validation === "VALIDATED_OUT_OF_SAMPLE_HISTORY"
                ? "Results are read against the official score after full time — a log far too short to say anything about accuracy; the model's test is the blind run on past seasons."
                : "Results are read against the official score after full time — a log of what has been checked, not evidence the model works; that is a preregistered backtest, and it has not been run for this competition."}`}
          />
          <div className="mt-3 overflow-x-auto">
            <table className="gtp-epl-rec" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--vault-text-mute)" }}>
                  <th style={{ padding: "6px 10px", fontWeight: 600 }}>Match</th>
                  <th style={{ padding: "6px 10px", fontWeight: 600 }}>Date</th>
                  <th style={{ padding: "6px 10px", fontWeight: 600 }}>Result</th>
                  <th style={{ padding: "6px 10px", fontWeight: 600 }}>Model gave the actual outcome</th>
                </tr>
              </thead>
              <tbody>
                {archived.map((r) => {
                  const m = gradedById.get(String(r.eventId));
                  return (
                    /* Row rule and cell padding: .gtp-epl-rec (globals.css). */
                    <tr key={r.slug as string}>
                      <td><Link href={eplMatchHref(r.slug as string)} style={{ color: "var(--vault-text)" }}>{r.matchup}</Link></td>
                      <td className="font-mono" style={{ fontSize: 11.5, color: "var(--vault-text-faint)", whiteSpace: "nowrap" }}>
                        {/* The ET day, never the UTC instant's date. */}
                        {r.kickoffUtc ? ET_DAY_SHORT.format(new Date(r.kickoffUtc)) : ""}
                      </td>
                      <td>{m?.actual ? `${m.actual.homeGoalsFT}-${m.actual.awayGoalsFT}` : "not graded yet"}</td>
                      <td>{typeof m?.probabilityOfActual === "number" ? `${(m.probabilityOfActual * 100).toFixed(1)}%` : "—"}</td>
                    </tr>
                  );
                })}
                {(gradedRecord?.team.matchesList ?? []).filter((m) => !archived.some((r) => String(r.eventId) === String(m.eventId))).map((m) => (
                  <tr key={`g-${m.eventId}`}>
                    <td>{m.matchup}</td>
                    <td />
                    <td>{m.actual ? `${m.actual.homeGoalsFT}-${m.actual.awayGoalsFT}` : "—"}</td>
                    <td>{typeof m.probabilityOfActual === "number" ? `${(m.probabilityOfActual * 100).toFixed(1)}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {gradedRecord && gradedRecord.player.rows > 0 && (
            <p style={{ margin: "10px 0 0", fontSize: 13, lineHeight: 1.65, color: "var(--vault-text-mute)" }}>
              {`Player markets: ${gradedRecord.player.rows} projection${gradedRecord.player.rows === 1 ? "" : "s"} graded`}
              {gradedRecord.player.voided > 0
                ? `, ${gradedRecord.player.voided} void because the player did not take the field the projection assumed — a condition that did not hold is never scored as a miss.`
                : "."}
            </p>
          )}
        </section>
        </MoreDisclosure>
      ) : null}

      {labLadder ? <SportLabCards ladder={labLadder} eyebrow={ladderDayLabel(labLadder.date)} tierRecords={loadSportLabStreamRecord("epl")?.byTier} /> : null}

      {/*
        WHAT THE MODEL SAID, AND WHAT ACTUALLY HAPPENED — the same section on every sport.
        Forecasts were published continuously here and results were published almost nowhere, an
        asymmetry that always flatters. The rows come from this sport's own graded ledger and the
        sample note travels with them, so a small record cannot be read as a track record.
      */}
      {eplGraded ? <GradedPicksSection record={eplGraded} href="/results/picks/epl" /> : null}
      {/* Phase A-2: model health follows results on every hub — collapsed, every family's state in its summary line. */}
      <ModelStatusPanel collapsed sportLabel="Premier League" items={modelStatusFor("epl", { dataRoot: path.join(process.cwd(), "public", "data"), repoRoot: path.join(process.cwd(), ".."), nowIso: new Date().toISOString(), eplValidation: set?.validation ?? null })} />


      {/* ── 4 · SCHEDULE — reference, deliberately last ────────────────────────────────────────── */}
      {/* GTP-20: reference list, folded; #schedule still lands (MoreDisclosure opens on hash). */}
      <MoreDisclosure className="mt-8" title="Full 2026-27 fixture list" summary="Every fixture, whether or not the model can price it.">
      <section className="mt-8 scroll-mt-24" id="schedule">
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
          Source: {sourceDisplayName(feed?.sourceVerdict?.sourceId, "openfootball (public domain)")}
          {capturedAt ? ` · captured ${new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(capturedAt))} ET` : ""}
          {feed?.totals?.upcoming ? ` · showing the next ${(feed.events ?? []).length} of ${feed.totals.upcoming}` : ""}
        </p>
      </section>
      </MoreDisclosure>

      {/* Overnight W8 (2026-10-28): the page's one "Technical details" — internal model ids, RELOCATED from the reading path. */}
      {players ? (
        <MoreDisclosure className="mt-8" title="Technical details" summary="Internal model identifiers behind the numbers on this page.">
          <p className="m-0 font-mono" style={{ fontSize: 11.5, color: "var(--vault-text-faint)" }} data-player-model-id="">
            Player model: {players.model.id}
          </p>
        </MoreDisclosure>
      ) : null}

      <p className="mt-6" style={{ fontSize: 12, lineHeight: 1.6, color: "var(--vault-text-faint)" }}>
        Paper-only and educational. Not betting advice. Updated {formatUpdatedEt(set?.generatedAt)} from pregame inputs
        only; the model never sees a result from a match it is forecasting.
      </p>
      <HubSlipBar legs={slip} />
    </div>
  );
}
