/**
 * /world-cup — FIFA World Cup 2026 command center, as a uniform tabbed sport page (SportShell).
 *
 * Tabs: Overview · Games · Projections · Player Props · Suggested Cards · Markets · Results ·
 * Methodology. Each tab shows ONE section at a time (true switcher, `?tab=` deep-links) and is
 * built from the shared UI kit (SuggestedCard / ProjectionCard / PlayerPropCard / StatusChip /
 * RiskTierBadge / StakePayoutInput). Long explanations live in the Methodology tab to reduce
 * density elsewhere. All data is real + fail-closed — no fabricated prices, lineups, or edges.
 */
import Link from "next/link";
import CompetitionBadge from "@/components/ui/competition-badge";
import { getSportIdentity } from "@/lib/sport-identity";

import {
  loadWorldCupMeta,
  loadWorldCupTeams,
  loadWorldCupGroups,
  loadWorldCupSchedule,
  matchesOnDate,
  daysUntilOpener,
} from "@/lib/data-world-cup";
import { currentEtDate } from "@/lib/freshness";

import {
  loadWorldCupMarketOutlook,
  loadWorldCupProjectionReadiness,
  loadWorldCupStatsReadiness,
  upcomingReadyOutlook,
  normTeamName,
} from "@/lib/world-cup/market-outlook";
import {
  loadWorldCupProjections,
  loadWorldCupParlays,
  loadWorldCupParlaysForDate,
  loadWorldCupSettlement,
  worldCupMethodologyReview,
  loadWorldCupTeamStrengthSummary,
  loadWorldCupMarketAvailability,
  loadWorldCupPlayerProjections,
} from "@/lib/world-cup/projections";
import {
  normalizeWcCards,
  normalizeWcProjections,
  normalizeWcPlayerProps,
  type PublicProjection,
} from "@/lib/normalize";
import WcMarketMatrix from "@/components/world-cup/wc-market-matrix";
import WcMatchOutlookCard from "@/components/world-cup/wc-match-outlook-card";
import { getDetailForTeams } from "@/lib/game-detail";
import WorldCupSectionTabs from "@/components/world-cup/world-cup-section-tabs";
import FlagBadge from "@/components/flag-badge";
import SportOverviewHero from "@/components/sport-overview-hero";
import SectionHeader from "@/components/section-header";
import OverviewFooterDisclosure from "@/components/overview-footer-disclosure";
import SportShell, { type ShellTab } from "@/components/ui/sport-shell";
import SuggestedCard from "@/components/ui/suggested-card";
import ProjectionCard from "@/components/ui/projection-card";
import PlayerPropCard from "@/components/ui/player-prop-card";
import StatusChip from "@/components/ui/status-chip";

export const metadata = {
  title: "FIFA World Cup 2026 · GameTime Picks",
  description:
    "FIFA World Cup 2026 command center — official schedule, groups, qualified teams, live market outlook, model projections, player props, and suggested paper cards. Educational, paper-only.",
};

const PLAYER_MARKET_ORDER = ["Shots", "Shots on target", "Assists", "Anytime goalscorer"];

export default function WorldCupLandingPage() {
  const meta = loadWorldCupMeta();
  const teams = loadWorldCupTeams();
  const groups = loadWorldCupGroups();
  const schedule = loadWorldCupSchedule();
  const daysOut = daysUntilOpener();
  const isLive = daysOut <= 0;
  const today = currentEtDate();
  const todayMatches = matchesOnDate(today);
  const nextMatch =
    todayMatches[0] ??
    schedule.find((m) => m.date >= today) ??
    schedule.find((m) => m.id === 1);
  const opener = schedule.find((m) => m.id === 1);
  const finalMatch = schedule.find((m) => m.id === 104);
  const upcomingMatches = schedule.filter((m) => m.stage === "group").slice(0, 6);

  const outlook = loadWorldCupMarketOutlook();
  const readiness = loadWorldCupProjectionReadiness();
  const stats = loadWorldCupStatsReadiness();
  const oddsReady = !!readiness?.oddsReady && (outlook?.readyCount ?? 0) > 0;
  const statsConnected = !!stats?.providerConfigured;
  const planBlock = stats?.providerPlanBlock;
  const projections = loadWorldCupProjections();
  const parlays = loadWorldCupParlays();
  const settlement = loadWorldCupSettlement();
  const projectionsLive = !!projections && projections.matches.length > 0;
  const parlaysLive = !!parlays && parlays.cards.length > 0;
  const methodologyReview = worldCupMethodologyReview();
  const statsNote = stats?.teamStatsReady
    ? "API-Football Pro · recent-form sample"
    : planBlock
      ? "API-Football connected · 2026 needs a paid plan"
      : statsConnected
        ? "API-Football connected · awaiting coverage"
        : "no provider connected";
  const strength = loadWorldCupTeamStrengthSummary();
  const availability = loadWorldCupMarketAvailability();
  const playerProjections = loadWorldCupPlayerProjections();
  const mkt = availability?.markets ?? {};
  const cornerOdds = mkt["match_total_corners"]?.oddsReady ?? false;
  const playerOdds = (mkt["player_shots_on_target"]?.oddsReady || mkt["anytime_goalscorer"]?.oddsReady) ?? false;
  const lineupsReady = mkt["player_shots_on_target"]?.lineupsReady ?? false;
  const dataStatus: Array<{ label: string; on: boolean; note: string }> = [
    { label: "Odds / Market outlook", on: oddsReady, note: "The Odds API · 3-way + totals" },
    { label: "Team strength", on: !!strength, note: strength ? `FIFA ranking · ${strength.teamCount} teams` : "no source" },
    { label: "Team stats", on: !!stats?.teamStatsReady, note: statsNote },
    { label: "xG / xGA", on: !!stats?.xgReady, note: "API-Football has no xG" },
    { label: "Corner-total odds", on: cornerOdds, note: cornerOdds ? "The Odds API · corners" : "not offered for WC" },
    { label: "Player-prop odds", on: playerOdds, note: playerOdds ? "shots · SOT · assists · scorer" : "not offered for WC" },
    { label: "Lineups / minutes", on: lineupsReady, note: lineupsReady ? "posted" : "posted ~1h before kickoff" },
    { label: "Model projections", on: projectionsLive, note: projectionsLive ? `${projections!.projectionCount} picks · 90-min` : methodologyReview ? "under methodology review" : "needs team stats + odds" },
    { label: "Suggested parlays", on: parlaysLive, note: parlaysLive ? `${parlays!.cardCount} cards` : methodologyReview ? "under methodology review" : "needs projections" },
  ];

  // Shared joins for the Games tab.
  const teamCodeByNorm = new Map(teams.map((t) => [normTeamName(t.name), t.code]));
  const scheduleByPair = new Map(
    schedule.map((m) => [[normTeamName(m.home), normTeamName(m.away)].sort().join("|"), m]),
  );
  const todayPairs = new Set(
    todayMatches.map((m) => [normTeamName(m.home), normTeamName(m.away)].sort().join("|")),
  );
  const upcomingOutlook = upcomingReadyOutlook(outlook, `${today}T00:00:00Z`, 16)
    .filter((m) => !todayPairs.has([normTeamName(m.homeTeam), normTeamName(m.awayTeam)].sort().join("|")))
    .slice(0, 8);

  // Normalized data for the shared kit.
  const wcCards = normalizeWcCards(parlays);
  const wcProjections = normalizeWcProjections(projections);
  const wcPlayers = normalizeWcPlayerProps(playerProjections);
  const playerByMarket = new Map<string, PublicProjection[]>();
  for (const p of wcPlayers) {
    const arr = playerByMarket.get(p.marketLabel) ?? [];
    arr.push(p);
    playerByMarket.set(p.marketLabel, arr);
  }
  const photoCount = wcPlayers.filter((p) => p.player?.photo).length;

  // ─────────────────────────── Tab content ───────────────────────────
  const overviewTab = (
    <div className="flex flex-col gap-8">
      <section>
        <SectionHeader eyebrow="Today" title="At a glance" sub="What's live for the World Cup right now. Use the tabs above to dive into any section." />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: "Today's games", value: todayMatches.length },
            { label: "Projection views", value: projections?.projectionCount ?? 0 },
            { label: "Player props", value: playerProjections?.projectionCount ?? 0 },
            { label: "Suggested cards", value: parlays?.cardCount ?? 0 },
          ].map((s) => (
            <div key={s.label} className="rounded-[8px] px-3 py-3" style={{ background: "rgba(26, 16, 11,0.55)", border: "1px solid var(--vault-border)" }}>
              <div className="font-display tabular" style={{ color: "var(--vault-text)", fontSize: 22, fontWeight: 700 }}>{s.value}</div>
              <div className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>
      {wcCards.length > 0 && (
        <section>
          <SectionHeader eyebrow={`Top cards · ${wcCards.length} live`} title="Suggested paper cards" sub="Enter any stake to see the projected paper return. Paper only — not betting advice." />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {wcCards.slice(0, 3).map((c) => <SuggestedCard key={c.id} card={c} />)}
          </div>
        </section>
      )}
      <section aria-label="Qualified nations">
        <SectionHeader eyebrow="Qualified nations · 48 teams" title="Every federation in the field" sub="Hosts marked in gold. Tap a flag for fixtures." />
        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
          {teams.map((t) => (
            <Link key={t.code + t.name} href={`/world-cup/team/${encodeURIComponent(t.code)}`}
              className="rounded-[6px] flex flex-col items-center gap-1 py-3 vault-glow-hover"
              style={{ background: "rgba(26, 16, 11,0.55)", border: t.isHost ? "1px solid rgba(242, 54, 69, 0.55)" : "1px solid var(--vault-border)", textDecoration: "none" }}
              title={`${t.name} · Group ${t.group}${t.isHost ? " · Host" : ""}`}>
              <FlagBadge code={t.code} size="lg" ariaLabel={`${t.name} flag`} />
              <span className="font-mono uppercase tracking-[0.10em]" style={{ color: t.isHost ? "var(--vault-gold-bright)" : "var(--vault-text-mute)", fontSize: 10 }}>{t.name}</span>
              <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>Group {t.group}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );

  const gamesTab = (
    <div className="flex flex-col gap-8">
      {isLive && todayMatches.length > 0 ? (
        <section aria-label="Today's matches">
          <SectionHeader eyebrow={`Today · ${todayMatches.length} match${todayMatches.length === 1 ? "" : "es"}`} title="Today's World Cup fixtures" sub="Tap a match for its projections, player props, and suggested cards — just like MLB and NBA." />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {todayMatches.map((m) => {
              const homeTeam = teams.find((t) => t.name === m.home);
              const awayTeam = teams.find((t) => t.name === m.away);
              const det = getDetailForTeams("world_cup", m.home ?? "", m.away ?? "");
              const detailHref = det ? `/games/world-cup/${det.slug}` : null;
              const grp = (m.stage === "group" ? `Group ${m.group}` : m.stage) ?? "";
              return (
                <article key={m.id} className="rounded-[10px] px-4 py-4 flex flex-col gap-3" style={{ background: "rgba(26, 16, 11,0.55)", border: "1px solid var(--vault-border)", borderLeft: "3px solid var(--vault-gold-bright)" }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono uppercase tracking-[0.12em] px-2 py-0.5 rounded-full" style={{ color: "var(--vault-gold-bright)", border: "1px solid var(--vault-gold-bright)", fontSize: 10 }}>World Cup</span>
                    <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>{m.kickoffLocal}{grp ? " · " + grp : ""}</span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2"><FlagBadge code={homeTeam?.code ?? ""} size="sm" /><span className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 15, fontWeight: 700 }}>{m.home}</span></div>
                    <div className="flex items-center gap-2"><FlagBadge code={awayTeam?.code ?? ""} size="sm" /><span className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 15, fontWeight: 700 }}>{m.away}</span></div>
                  </div>
                  {det ? (
                    <div className="flex items-center gap-3 font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 10.5 }}>
                      <span>{det.teamProjections.length} projections</span>
                      <span>{det.playerProps.length ? `${det.playerProps.length} player props` : "props pending"}</span>
                      {det.suggestedCards.length ? <span>{det.suggestedCards.length} cards</span> : null}
                    </div>
                  ) : (
                    <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10.5 }}>Team markets live · player props pending</span>
                  )}
                  <div className="flex items-center gap-2 pt-1" style={{ borderTop: "1px solid var(--vault-rule)" }}>
                    {detailHref ? (
                      <Link href={detailHref} className="vault-press flex-1 text-center rounded-[6px] py-1.5 font-mono uppercase tracking-[0.1em]" style={{ background: "var(--vault-gold-dim)", border: "1px solid var(--vault-gold-bright)", color: "var(--vault-gold-bright)", fontSize: 10.5, textDecoration: "none" }}>View game</Link>
                    ) : null}
                    <Link href={det?.buildUrl ?? `/build?sport=world_cup&q=${encodeURIComponent(m.home ?? "")}`} className="vault-press flex-1 text-center rounded-[6px] py-1.5 font-mono uppercase tracking-[0.1em]" style={{ border: "1px solid var(--vault-rule)", color: "var(--vault-text-mute)", fontSize: 10.5, textDecoration: "none" }}>Build</Link>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}
      {oddsReady && upcomingOutlook.length > 0 ? (
        <section aria-label="Upcoming market outlook">
          <SectionHeader eyebrow="Upcoming · market outlook" title="Next World Cup matches" sub="90-minute Home/Draw/Away + totals implied by current prices. Regulation only (Draw included; no extra time/penalties)." />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {upcomingOutlook.map((m) => {
              const sched = scheduleByPair.get([normTeamName(m.homeTeam), normTeamName(m.awayTeam)].sort().join("|"));
              return (
                <WcMatchOutlookCard key={m.oddsEventId ?? `${m.homeTeam}-${m.awayTeam}`} match={m}
                  homeCode={teamCodeByNorm.get(normTeamName(m.homeTeam)) ?? ""} awayCode={teamCodeByNorm.get(normTeamName(m.awayTeam)) ?? ""}
                  homeName={m.homeTeam} awayName={m.awayTeam} kickoff={sched?.kickoffLocal ?? (m.commenceTime ?? "").slice(11, 16)}
                  group={(sched?.stage === "group" ? sched?.group : sched?.stage) ?? null} venue={sched?.venueCity ?? null} />
              );
            })}
          </div>
        </section>
      ) : null}
      <section aria-label="Opening matches">
        <SectionHeader eyebrow="Opening matchdays · group stage" title="First six matches" sub="Kickoff in venue local time. Full 104-match schedule on the Schedule page." />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {upcomingMatches.map((m) => {
            const homeTeam = teams.find((t) => t.name === m.home);
            const awayTeam = teams.find((t) => t.name === m.away);
            return (
              <article key={m.id} className="rounded-[8px] px-4 py-4 flex flex-col gap-3" style={{ background: "rgba(26, 16, 11,0.55)", border: "1px solid var(--vault-border)" }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono uppercase tracking-[0.18em]" style={{ color: "var(--vault-gold)", fontSize: 10 }}>Group {m.group} · match {m.id}</span>
                  <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>{m.date.slice(5)} · {m.kickoffLocal}</span>
                </div>
                <div className="flex items-center gap-3"><FlagBadge code={homeTeam?.code ?? ""} size="md" /><span className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 15 }}>{m.home}</span><span className="font-mono ml-auto" style={{ color: "var(--vault-text-mute)", fontSize: 11 }}>vs</span></div>
                <div className="flex items-center gap-3"><FlagBadge code={awayTeam?.code ?? ""} size="md" /><span className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 15 }}>{m.away}</span></div>
                <div className="flex items-center justify-between gap-2 pt-2" style={{ borderTop: "1px solid var(--vault-rule)" }}>
                  <span className="font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 10 }}>{m.venueCity}, {m.venueCountry}</span>
                  <span className="font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>Projection pending</span>
                </div>
              </article>
            );
          })}
        </div>
        <div className="mt-4"><Link href="/world-cup/schedule" className="font-mono uppercase tracking-[0.16em]" style={{ color: "var(--vault-gold-bright)", fontSize: 11 }}>Open full schedule →</Link></div>
      </section>
    </div>
  );

  const projectionsTab = (
    <div className="flex flex-col gap-5">
      {!projectionsLive && methodologyReview ? (
        <div className="rounded-[8px] px-4 py-4 flex flex-col gap-2" style={{ background: "rgba(26, 16, 11,0.55)", border: "1px solid var(--vault-border)" }}>
          <div className="flex items-center gap-2">
            <span aria-hidden className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: "var(--vault-warn)", boxShadow: "0 0 6px rgba(242, 54, 69,0.55)" }} />
            <span className="font-mono uppercase tracking-[0.16em]" style={{ color: "var(--vault-warn)", fontSize: 10 }}>Model projections under methodology review</span>
          </div>
          <p className="text-[13px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>
            The model is an ensemble — de-vigged market prior + FIFA-ranking strength + opponent-adjusted form — and a pick publishes only when it clears market-sanity, sample-size, and edge gates. A thin-sample extreme underdog is never surfaced. Full detail on the Methodology tab.
          </p>
        </div>
      ) : null}
      {wcProjections.length > 0 ? (
        <section aria-label="Model projections">
          <SectionHeader eyebrow={`Projections · ${wcProjections.length} market views`} title="GameTime Picks model projections" sub="Model vs market with edge on each market. A “Card eligible” chip appears only where an edge clears the suggested-card threshold. 90-minute regulation only; early-tournament sample, confidence capped Low." />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {wcProjections.map((p) => <ProjectionCard key={p.id} p={p} />)}
          </div>
        </section>
      ) : (
        <p className="text-[13px]" style={{ color: "var(--vault-text-mute)" }}>Model projections publish automatically once an edge clears the gates. Today the Market Outlook (Games tab) is shown instead.</p>
      )}
    </div>
  );

  const playerPropsTab = (
    <div className="flex flex-col gap-6">
      <SectionHeader eyebrow={`Player props · ${wcPlayers.length} views · ${photoCount} photos`} title="Player projections" sub="Built from the sportsbook's listed players (the predicted-XI signal) matched to real API-Football identities. Market-anchored until lineups confirm — a “Card eligible” chip appears once a starter is confirmed and the edge qualifies." />
      {wcPlayers.length > 0 ? (
        [...playerByMarket.entries()]
          .sort((a, b) => PLAYER_MARKET_ORDER.indexOf(a[0]) - PLAYER_MARKET_ORDER.indexOf(b[0]))
          .map(([market, list]) => (
            <section key={market} aria-label={market}>
              <div className="flex items-center gap-2 mb-2">
                <span className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}>{market}</span>
                <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>{list.length}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {list.map((p) => <PlayerPropCard key={p.id} p={p} />)}
              </div>
            </section>
          ))
      ) : (
        <div className="rounded-[10px] px-5 py-6 text-center" style={{ background: "rgba(26, 16, 11,0.55)", border: "1px solid var(--vault-border)" }}>
          <span aria-hidden style={{ fontSize: 26 }}>⚽</span>
          <p className="mt-2" style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 600 }}>Books haven&apos;t posted player props yet</p>
          <p className="mt-1 text-[12.5px]" style={{ color: "var(--vault-text-mute)" }}>Player views appear once sportsbooks post player-prop odds + the listed-player universe for today&apos;s matches. Team markets are live now.</p>
        </div>
      )}
    </div>
  );

  const cardsTab = (
    <div className="flex flex-col gap-4">
      <SectionHeader eyebrow={`Suggested cards · ${wcCards.length} live`} title="World Cup suggested parlays" sub="Built only from positive-edge model projections (one leg per match — no in-card correlation). Default paper stakes; enter any amount for the projected paper payout." />
      {wcCards.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {wcCards.map((c) => <SuggestedCard key={c.id} card={c} />)}
        </div>
      ) : (
        <p className="text-[13px]" style={{ color: "var(--vault-text-mute)" }}>Suggested cards are built only from parlay-eligible projections. When none clear the threshold, the probability views (Projections tab) are still shown — we don't turn a sub-threshold edge into a card.</p>
      )}
    </div>
  );

  const marketsTab = (
    <div className="flex flex-col gap-8">
      {availability ? <WcMarketMatrix availability={availability} /> : null}
      <section aria-label="Data status">
        <SectionHeader eyebrow="Data status" title="What's live vs gated" sub="We only show what real data supports. No fabricated prices, lineups, or edges." />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {dataStatus.map((d) => (
            <div key={d.label} className="flex items-center justify-between gap-2 rounded-[6px] px-3 py-2.5" style={{ background: "rgba(26, 16, 11,0.55)", border: "1px solid var(--vault-border)" }}>
              <div className="flex flex-col min-w-0">
                <span style={{ color: "var(--vault-text)", fontSize: 13, fontWeight: 600 }}>{d.label}</span>
                <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>{d.note}</span>
              </div>
              <StatusChip label={d.on ? "Live" : "Gated"} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );

  // Settled cards come from the SETTLED slate's dated parlays artifact (today's live
  // parlays are unsettled by definition); falls back to the live artifact.
  const settledParlays = settlement ? loadWorldCupParlaysForDate(settlement.date) ?? parlays : parlays;
  const settledCards = (settledParlays?.cards ?? []).filter((c) => c.result && c.result !== "pending");
  const resultsTab = (
    <div className="flex flex-col gap-4">
      <SectionHeader eyebrow="Results" title="World Cup settlement" sub="Official 90-minute regulation grading. Soccer settles on the FT regulation score — Draw is a real outcome; extra time and penalties never count for these markets." />
      {settlement ? (
        <>
          {/* Official finals */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {(settlement.finals ?? []).map((f) => (
              <div key={String(f.matchId)} className="rounded-[8px] px-4 py-3" style={{ background: "rgba(26, 16, 11,0.55)", border: "1px solid var(--vault-border)" }}>
                <div className="flex items-center justify-between gap-2">
                  <span style={{ color: "var(--vault-text)", fontSize: 13.5, fontWeight: 600 }}>{f.match}</span>
                  <span className="font-display tabular" style={{ color: "var(--vault-gold-bright)", fontSize: 16, fontWeight: 700 }}>{f.regulationScore}</span>
                </div>
                <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>
                  Full time (90′ regulation){f.corners ? ` · corners ${f.corners.home}–${f.corners.away}` : ""}
                </span>
              </div>
            ))}
          </div>

          {/* Graded published picks */}
          <div className="flex flex-col gap-1.5">
            {settlement.graded.map((g) => (
              <div key={g.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[8px] px-4 py-2.5" style={{ background: "rgba(26, 16, 11,0.55)", border: "1px solid var(--vault-border)" }}>
                <span style={{ color: "var(--vault-text)", fontSize: 13, fontWeight: 600 }}>{g.pick}</span>
                <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>{g.market.replace(/_/g, " ")} · final {g.regulationScore}</span>
                <span
                  className="ml-auto rounded px-2 py-0.5 font-mono text-[10px] font-bold tracking-[0.08em]"
                  style={g.outcome === "win"
                    ? { color: "#6EE7A8", background: "rgba(110,231,168,0.14)" }
                    : g.outcome === "push"
                      ? { color: "var(--vault-text-mute)", background: "rgba(255,255,255,0.06)" }
                      : { color: "#F08A8A", background: "rgba(240,138,138,0.12)" }}
                >
                  {g.outcome.toUpperCase()}
                </span>
              </div>
            ))}
          </div>

          {/* Settled suggested cards */}
          {settledCards.length > 0 && (
            <div>
              <span className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>
                Suggested cards · {settledCards.filter((c) => c.result === "won").length} won / {settledCards.filter((c) => c.result === "lost").length} lost
              </span>
              <div className="mt-2 flex flex-col gap-1.5">
                {settledCards.map((c) => (
                  <div key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[8px] px-4 py-2.5" style={{ background: "rgba(26, 16, 11,0.55)", border: "1px solid var(--vault-border)" }}>
                    <span style={{ color: "var(--vault-text)", fontSize: 12.5, fontWeight: 600 }}>{c.riskTier} card</span>
                    <span className="font-mono truncate" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>
                      {c.legs.map((l) => l.pick).join(" + ")}
                    </span>
                    <span
                      className="ml-auto rounded px-2 py-0.5 font-mono text-[10px] font-bold tracking-[0.08em]"
                      style={c.result === "won"
                        ? { color: "#6EE7A8", background: "rgba(110,231,168,0.14)" }
                        : { color: "#F08A8A", background: "rgba(240,138,138,0.12)" }}
                    >
                      {(c.result ?? "").toUpperCase()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <p className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>
            Source: {settlement.settlementSource ?? "official final scores"} · settled {settlement.generatedAt}. Paper-only educational tracking.
          </p>
        </>
      ) : (
        <div className="rounded-[8px] px-4 py-6 text-center" style={{ background: "rgba(26, 16, 11,0.55)", border: "1px solid var(--vault-border)" }}>
          <p style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 600 }}>No settled World Cup cards yet</p>
          <p className="mt-1" style={{ color: "var(--vault-text-mute)", fontSize: 12 }}>Grading runs automatically once today's matches reach full time. Full cross-sport history lives on the Results page.</p>
          <div className="mt-3"><Link href="/results" className="font-mono uppercase tracking-[0.16em]" style={{ color: "var(--vault-gold-bright)", fontSize: 11 }}>Open Results →</Link></div>
        </div>
      )}
    </div>
  );

  const methodologyTab = (
    <div className="flex flex-col gap-8">
      <section aria-label="Methodology">
        <SectionHeader eyebrow="Methodology" title="How the World Cup model works" sub="An ensemble: de-vigged market prior + a sourced FIFA-ranking team-strength layer + opponent-adjusted recent national-team form. Poisson Home/Draw/Away + totals. 90-minute regulation only — Draw is a real third outcome, never mixed with advancement or extra-time markets." />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {(meta?.projectionStatus?.plannedInputs ?? []).map((input) => (
            <div key={input} className="rounded-[6px] px-4 py-3" style={{ background: "rgba(26, 16, 11,0.55)", border: "1px solid var(--vault-border)" }}>
              <span className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-gold)", fontSize: 10 }}>model input</span>
              <div className="mt-1 text-[13px] leading-relaxed" style={{ color: "var(--vault-text)" }}>{input}</div>
            </div>
          ))}
        </div>
        <div className="mt-4">
          <span className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>Markets + risk tiers</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {[["Moneyline (90-min, 3-way)", "Low/Med"], ["Double chance", "Low"], ["Total goals", "Med/High"], ["Total corners", "Low/Med"], ["Player shots", "Low/Med"], ["Shots on target", "Low/Med"], ["Player assists", "Medium"], ["Anytime goalscorer", "Med/High"]].map(([market, tier]) => (
              <span key={market} className="inline-flex items-center gap-1.5 rounded-[6px] px-2.5 py-1" style={{ background: "rgba(26, 16, 11,0.55)", border: "1px solid var(--vault-rule)" }}>
                <span style={{ color: "var(--vault-text)", fontSize: 12 }}>{market}</span>
                <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>{tier}</span>
              </span>
            ))}
          </div>
        </div>
        <p className="mt-4 text-[11.5px] leading-relaxed" style={{ color: "var(--vault-text-faint)" }}>
          {meta?.projectionStatus?.notes} Full factor framework: <Link href="/methodology" style={{ color: "var(--vault-gold-bright)" }}>methodology</Link>.
        </p>
      </section>
      <section className="rounded-[6px] px-4 py-4" style={{ background: "rgba(26, 16, 11,0.45)", border: "1px solid var(--vault-border)" }} aria-label="Squad status">
        <div className="flex items-center gap-2 mb-2">
          <span aria-hidden className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: "var(--vault-warn)", boxShadow: "0 0 6px rgba(242, 54, 69, 0.55)" }} />
          <span className="font-mono uppercase tracking-[0.18em]" style={{ color: "var(--vault-warn)", fontSize: 10 }}>Squads / lineups</span>
        </div>
        <p className="text-[13px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>{meta?.squadStatus?.notes}</p>
      </section>
      <section className="text-[11px] leading-relaxed" style={{ color: "var(--vault-text-faint)" }} aria-label="Sources">
        <span className="font-mono uppercase tracking-[0.16em]" style={{ color: "var(--vault-gold)", fontSize: 10 }}>Sources</span>
        <ul className="mt-1 space-y-0.5">
          {(meta?.sources ?? []).map((s) => (<li key={s.url}>· <span style={{ color: "var(--vault-text-mute)" }}>{s.label}</span></li>))}
        </ul>
      </section>
      <OverviewFooterDisclosure
        inputsLabel="What is wired today"
        inputsBody={<>Official tournament schedule (104 matches), groups (12), qualified teams (48), venues by host city, a live 90-minute Market Outlook, a sourced FIFA-ranking strength layer, and — when gates pass — model projections, lineup-pending player props, and suggested paper cards.</>}
        framingBody={<>Every surface is real + fail-closed: independent projections, player props, and parlays publish only when real odds + stats gates pass. We refuse to invent rosters, results, or “model edge” before the model is live.</>}
      />
    </div>
  );

  const tabs: ShellTab[] = [
    // Games-first (June-12 sprint).
    { key: "games", label: "Games", badge: todayMatches.length || null, content: gamesTab },
    { key: "overview", label: "Overview", content: overviewTab },
    { key: "projections", label: "Projections", badge: wcProjections.length || null, content: projectionsTab },
    { key: "player-props", label: "Player Props", badge: wcPlayers.length || null, content: playerPropsTab },
    { key: "cards", label: "Suggested Cards", badge: wcCards.length || null, content: cardsTab },
    { key: "markets", label: "Markets", badge: null, content: marketsTab },
    { key: "results", label: "Results", badge: null, content: resultsTab },
    { key: "methodology", label: "Methodology", badge: null, content: methodologyTab },
  ];

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-14 overflow-x-hidden">
      <div className="mb-6">
        <WorldCupSectionTabs />
      </div>

      <SportOverviewHero
        badge={<CompetitionBadge sport="world_cup" size="sm" />}
        icon={getSportIdentity("world_cup").icon}
        iconGradient={getSportIdentity("world_cup").gradient}
        iconLabel={getSportIdentity("world_cup").ballLabel}
        eyebrow="FIFA World Cup 2026 · educational analytics"
        sport="World Cup"
        tagline={daysOut > 0 ? `kickoff in ${daysOut} day${daysOut === 1 ? "" : "s"}` : "tournament live"}
        statusKind={isLive ? "live" : "upcoming"}
        statusLabel={daysOut > 0 ? `${daysOut} days to kickoff` : "Tournament live"}
        statusCaption={isLive ? ` · ${todayMatches.length} match${todayMatches.length === 1 ? "" : "es"} today` : " · schedule live"}
        matchupLine={
          isLive && nextMatch
            ? `Next · ${nextMatch.home} vs ${nextMatch.away} · ${nextMatch.kickoffLocal} (${nextMatch.venueCity})`
            : opener
              ? `Opener · ${opener.home} vs ${opener.away} · ${opener.venueCity}`
              : undefined
        }
        stats={[
          { label: "Tournament dates", value: "Jun 11 – Jul 19", sub: meta ? "104 matches across USA · Canada · Mexico" : undefined },
          { label: "Teams", value: String(teams.length), sub: `${groups.length} groups · expanded 48-team format` },
          { label: "Final", value: finalMatch ? "Jul 19" : "—", sub: finalMatch ? finalMatch.venueCity : undefined },
        ]}
        ctas={[
          { href: "/world-cup/schedule", label: "View schedule", primary: true },
          { href: "/world-cup/groups", label: "Groups" },
          { href: "/world-cup/teams", label: "Teams" },
        ]}
        framing={
          projectionsLive
            ? "Official FIFA schedule + groups, a live 90-minute Market Outlook, and GameTime Picks model projections for today's matches — a recent national-team form model blended with the market (a model lean, capped Low this early). Suggested paper parlays are built only from positive-edge projections."
            : "Official schedule + groups from FIFA, plus a live 90-minute Market Outlook — de-vigged Home/Draw/Away + totals implied by current sportsbook prices (market-implied, not a model pick). Independent projections, player props, and parlays stay fail-closed until gates pass."
        }
        accent="wc"
      />

      <SportShell tabs={tabs} />
    </div>
  );
}
