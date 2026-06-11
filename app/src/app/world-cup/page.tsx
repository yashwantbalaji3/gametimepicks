/**
 * /world-cup — FIFA World Cup 2026 command center.
 *
 * Premium overview surface: hero with countdown, flag rail of all 48
 * qualified teams, methodology preview, schedule preview, and an
 * honest "projections coming soon" module.
 *
 * Honest framing:
 *   - No projections, no odds, no parlay claims. The methodology
 *     module lists planned model inputs as PLANNED, not active.
 *   - Squads are pending official release (June 1 / 2). The card
 *     copy reflects that.
 *   - Tournament schedule + groups are official (Final Draw 2025-12-05);
 *     sources are cited in the methodology disclosure block.
 */
import Link from "next/link";

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
  outlookForMatch,
  upcomingReadyOutlook,
  normTeamName,
} from "@/lib/world-cup/market-outlook";
import {
  loadWorldCupProjections,
  loadWorldCupParlays,
  worldCupMethodologyReview,
  type WcProjection,
} from "@/lib/world-cup/projections";
import WcMatchOutlookCard from "@/components/world-cup/wc-match-outlook-card";
import WcProjectionCard from "@/components/world-cup/wc-projection-card";
import WcParlayCard from "@/components/world-cup/wc-parlay-card";
import WorldCupSectionTabs from "@/components/world-cup/world-cup-section-tabs";
import FlagBadge from "@/components/flag-badge";
import SportOverviewHero from "@/components/sport-overview-hero";
import SectionHeader from "@/components/section-header";
import OverviewFooterDisclosure from "@/components/overview-footer-disclosure";

export const metadata = {
  title: "FIFA World Cup 2026 · GameTime Picks",
  description:
    "FIFA World Cup 2026 command center — official schedule, groups, and qualified teams. Educational analytics; projections coming soon.",
};

export default function WorldCupLandingPage() {
  const meta = loadWorldCupMeta();
  const teams = loadWorldCupTeams();
  const groups = loadWorldCupGroups();
  const schedule = loadWorldCupSchedule();
  const daysOut = daysUntilOpener();
  const isLive = daysOut <= 0;
  const today = currentEtDate();
  const todayMatches = matchesOnDate(today);
  // Next upcoming match (today's first, else the earliest future fixture).
  const nextMatch =
    todayMatches[0] ??
    schedule.find((m) => m.date >= today) ??
    schedule.find((m) => m.id === 1);
  const opener = schedule.find((m) => m.id === 1);
  const finalMatch = schedule.find((m) => m.id === 104);
  const upcomingMatches = schedule.filter((m) => m.stage === "group").slice(0, 6);

  // Real market outlook (de-vigged H/D/A + totals) from The Odds API. Market-implied,
  // NOT a model pick. Fail-closed: null when no ready odds.
  const outlook = loadWorldCupMarketOutlook();
  const readiness = loadWorldCupProjectionReadiness();
  const stats = loadWorldCupStatsReadiness();
  const oddsReady = !!readiness?.oddsReady && (outlook?.readyCount ?? 0) > 0;
  // Honest data-status gates (fail-closed). Odds/outlook are live; the stats provider
  // (API-Football) is wired but its free plan doesn't cover the 2026 season yet, so
  // everything stats-dependent stays off until the plan is upgraded.
  const statsConnected = !!stats?.providerConfigured;
  const planBlock = stats?.providerPlanBlock;
  // Real model projections + suggested parlays (fail-closed: null when gates didn't pass).
  const projections = loadWorldCupProjections();
  const parlays = loadWorldCupParlays();
  const projectionsLive = !!projections && projections.matches.length > 0;
  const parlaysLive = !!parlays && parlays.cards.length > 0;
  // Methodology review (2026-06-11): model projections/parlays are produced + preserved for
  // audit but held from public surfaces until the upgraded gates classify a pick as `active`.
  const methodologyReview = worldCupMethodologyReview();
  const statsNote = stats?.teamStatsReady
    ? "API-Football Pro · recent-form sample"
    : planBlock
      ? "API-Football connected · 2026 needs a paid plan"
      : statsConnected
        ? "API-Football connected · awaiting coverage"
        : "no provider connected";
  const dataStatus: Array<{ label: string; on: boolean; note: string }> = [
    { label: "Odds / Market outlook", on: oddsReady, note: "The Odds API · 3-way + totals" },
    { label: "Team stats", on: !!stats?.teamStatsReady, note: statsNote },
    { label: "xG / xGA", on: !!stats?.xgReady, note: "API-Football has no xG" },
    { label: "Lineups / minutes", on: !!stats?.lineupsReady, note: "posted near kickoff" },
    { label: "Model projections", on: projectionsLive, note: projectionsLive ? `${projections!.projectionCount} picks · 90-min` : methodologyReview ? "under methodology review" : "needs team stats + odds" },
    { label: "Suggested parlays", on: parlaysLive, note: parlaysLive ? `${parlays!.cardCount} cards` : methodologyReview ? "under methodology review" : "needs projections" },
  ];
  // Group projections by match for the projection cards (moneyline + total per match).
  const projByMatch = new Map<number, WcProjection[]>();
  if (projections) {
    for (const p of projections.matches) {
      const arr = projByMatch.get(p.matchId) ?? [];
      arr.push(p);
      projByMatch.set(p.matchId, arr);
    }
  }

  // Upcoming · Market Outlook — the next ready matches (real odds), excluding the
  // ones already shown in the Today section. Enriched with team codes + schedule
  // metadata (group/venue/kickoff) via alias-aware joins.
  const teamCodeByNorm = new Map(teams.map((t) => [normTeamName(t.name), t.code]));
  const scheduleByPair = new Map(
    schedule.map((m) => [
      [normTeamName(m.home), normTeamName(m.away)].sort().join("|"),
      m,
    ]),
  );
  const todayPairs = new Set(
    todayMatches.map((m) => [normTeamName(m.home), normTeamName(m.away)].sort().join("|")),
  );
  const upcomingOutlook = upcomingReadyOutlook(outlook, `${today}T00:00:00Z`, 16)
    .filter(
      (m) =>
        !todayPairs.has(
          [normTeamName(m.homeTeam), normTeamName(m.awayTeam)].sort().join("|"),
        ),
    )
    .slice(0, 8);

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-14 overflow-x-hidden">
      <div className="mb-6">
        <WorldCupSectionTabs />
      </div>

      <SportOverviewHero
        eyebrow="FIFA World Cup 2026 · educational analytics"
        sport="World Cup"
        tagline={
          daysOut > 0
            ? `kickoff in ${daysOut} day${daysOut === 1 ? "" : "s"}`
            : "tournament live"
        }
        statusKind={isLive ? "live" : "upcoming"}
        statusLabel={daysOut > 0 ? `${daysOut} days to kickoff` : "Tournament live"}
        statusCaption={
          isLive
            ? ` · ${todayMatches.length} match${todayMatches.length === 1 ? "" : "es"} today`
            : " · schedule live"
        }
        matchupLine={
          isLive && nextMatch
            ? `Next · ${nextMatch.home} vs ${nextMatch.away} · ${nextMatch.kickoffLocal} (${nextMatch.venueCity})`
            : opener
              ? `Opener · ${opener.home} vs ${opener.away} · ${opener.venueCity}`
              : undefined
        }
        stats={[
          {
            label: "Tournament dates",
            value: "Jun 11 – Jul 19",
            sub: meta ? "104 matches across USA · Canada · Mexico" : undefined,
          },
          {
            label: "Teams",
            value: String(teams.length),
            sub: `${groups.length} groups · expanded 48-team format`,
          },
          {
            label: "Final",
            value: finalMatch ? "Jul 19" : "—",
            sub: finalMatch ? finalMatch.venueCity : undefined,
          },
        ]}
        ctas={[
          { href: "/world-cup/schedule", label: "View schedule", primary: true },
          { href: "/world-cup/groups", label: "Groups" },
          { href: "/world-cup/teams", label: "Teams" },
        ]}
        framing={
          projectionsLive
            ? "Official FIFA schedule + groups, a live 90-minute Market Outlook (sportsbook-implied Home/Draw/Away + totals), and — now live — GameTime Picks model projections for today's matches: a recent national-team form model blended with the market (a model lean, capped Low this early). Suggested paper parlays are built only from positive-edge projections. Player props stay fail-closed until lineups + player-prop odds post: we never print an edge we can't back with data."
            : "Official schedule + groups from FIFA, plus a live 90-minute Market Outlook — de-vigged Home/Draw/Away + totals implied by current sportsbook prices for today's matches (market-implied, not a model pick). Independent projections, player props, and parlays stay fail-closed until a soccer stats provider connects: we never print a model edge we can't back with data."
        }
        accent="gold"
      />

      {/* ─── Today's matches + readiness (fail-closed) ──────────────── */}
      {isLive && todayMatches.length > 0 && (
        <section className="mt-8" aria-label="Today's matches">
          <SectionHeader
            eyebrow={`Today · ${todayMatches.length} match${todayMatches.length === 1 ? "" : "es"}`}
            title="Today's World Cup fixtures"
            sub="Kickoff times in venue local time. Schedule is live; market outlooks and projections appear only once real odds + stats gates pass."
          />
          {/* Readiness badge — reflects the real odds gate. */}
          <div
            className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[8px] px-3.5 py-2.5"
            style={{ background: "var(--gtp-card)", border: "1px solid var(--gtp-card-border)" }}
          >
            <span
              className="font-mono uppercase tracking-[0.14em] px-2 py-0.5 rounded-[4px]"
              style={{
                color: projectionsLive || oddsReady ? "var(--vault-success)" : "var(--vault-gold-bright)",
                border: `1px solid ${projectionsLive || oddsReady ? "var(--vault-success)" : "var(--vault-gold-bright)"}`,
                fontSize: 10,
              }}
            >
              {projectionsLive ? "Projections live" : oddsReady ? "Market outlook live" : "Schedule live"}
            </span>
            <span className="text-[12.5px]" style={{ color: "var(--vault-text-mute)" }}>
              {projectionsLive
                ? "GameTime Picks model projections are live for today — recent national-team form blended with the market (a model lean, not the raw outlook). Plus the 90-minute Home/Draw/Away market outlook. Player props stay off until lineups + player-prop odds post."
                : oddsReady
                  ? "90-minute Home/Draw/Away + totals implied by current sportsbook prices — market outlook, not a model pick. Player props + independent projections stay off until a soccer stats provider is connected."
                  : "Odds & projections pending — they unlock only when a real soccer odds + stats provider is connected. No placeholder prices are shown."}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {todayMatches.map((m) => {
              const homeTeam = teams.find((t) => t.name === m.home);
              const awayTeam = teams.find((t) => t.name === m.away);
              return (
                <WcMatchOutlookCard
                  key={m.id}
                  match={outlookForMatch(m.home ?? "", m.away ?? "", outlook)}
                  homeCode={homeTeam?.code ?? ""}
                  awayCode={awayTeam?.code ?? ""}
                  homeName={m.home ?? ""}
                  awayName={m.away ?? ""}
                  kickoff={m.kickoffLocal}
                  group={(m.stage === "group" ? m.group : m.stage) ?? null}
                  venue={m.venueCity}
                />
              );
            })}
          </div>
        </section>
      )}

      {/* ─── Model under methodology review (projections paused) ────── */}
      {!projectionsLive && methodologyReview && oddsReady && (
        <section className="mt-10" aria-label="Model projections under review">
          <div
            className="rounded-[8px] px-4 py-4 flex flex-col gap-2"
            style={{ background: "rgba(7,11,26,0.55)", border: "1px solid var(--vault-border)" }}
          >
            <div className="flex items-center gap-2">
              <span aria-hidden className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: "var(--vault-warn)", boxShadow: "0 0 6px rgba(212,175,55,0.55)" }} />
              <span className="font-mono uppercase tracking-[0.16em]" style={{ color: "var(--vault-warn)", fontSize: 10 }}>
                Model projections under methodology review
              </span>
            </div>
            <p className="text-[13px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>
              GameTime Picks model projections and suggested parlays for the World Cup are paused
              from public release while we deepen the soccer methodology (heavier market anchoring,
              opponent-strength adjustment, and market-sanity gates so thin-sample extreme
              underdogs aren&apos;t surfaced as model leans). The <strong style={{ color: "var(--vault-text)" }}>Market Outlook</strong> above
              stays live — sportsbook-implied Home/Draw/Away + totals, clearly market-implied, not a
              model pick. Projections return once the upgraded gates classify a pick as defensible.
            </p>
          </div>
        </section>
      )}

      {/* ─── Today's model projections (GameTime Picks) ─────────────── */}
      {projectionsLive && (
        <section className="mt-10" aria-label="Model projections">
          <SectionHeader
            eyebrow={`Projections live · ${projections!.projectionCount} model picks`}
            title="GameTime Picks model projections"
            sub="Recent national-team form blended with the de-vigged market — a model lean, not the raw market outlook. 90-minute regulation only (Draw is a real outcome). Early-tournament sample, so confidence is capped Low."
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from(projByMatch.entries()).map(([matchId, projs]) => {
              const head = projs[0];
              const homeTeam = teams.find((t) => t.name === head.homeTeam);
              const awayTeam = teams.find((t) => t.name === head.awayTeam);
              const sched = scheduleByPair.get(
                [normTeamName(head.homeTeam), normTeamName(head.awayTeam)].sort().join("|"),
              );
              return (
                <WcProjectionCard
                  key={matchId}
                  projections={projs}
                  homeCode={homeTeam?.code ?? ""}
                  awayCode={awayTeam?.code ?? ""}
                  group={(sched?.stage === "group" ? sched?.group : sched?.stage) ?? null}
                  kickoff={sched?.kickoffLocal ?? null}
                />
              );
            })}
          </div>
        </section>
      )}

      {/* ─── Suggested parlays (from model projections) ─────────────── */}
      {parlaysLive && (
        <section className="mt-10" aria-label="Suggested parlays">
          <SectionHeader
            eyebrow={`Suggested cards · ${parlays!.cardCount} live`}
            title="World Cup suggested parlays"
            sub="Built only from positive-edge model projections (one leg per match — no in-card correlation). Default paper stakes; projected paper payouts. Educational / paper, not betting advice."
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {parlays!.cards.map((c) => (
              <WcParlayCard key={c.id} card={c} />
            ))}
          </div>
          {parlays!.gateReasons.length > 0 && (
            <p className="mt-3 text-[10.5px] leading-relaxed" style={{ color: "var(--vault-text-faint)" }}>
              {parlays!.gateReasons.join(" · ")}.
            </p>
          )}
        </section>
      )}

      {/* ─── Upcoming · Market Outlook (real odds) ──────────────────── */}
      {oddsReady && upcomingOutlook.length > 0 && (
        <section className="mt-10" aria-label="Upcoming market outlook">
          <SectionHeader
            eyebrow="Upcoming · market outlook"
            title="Next World Cup matches"
            sub="90-minute Home/Draw/Away + totals implied by current sportsbook prices. Market outlook, not a model pick — regulation time only (Draw included; no extra time/penalties)."
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {upcomingOutlook.map((m) => {
              const sched = scheduleByPair.get(
                [normTeamName(m.homeTeam), normTeamName(m.awayTeam)].sort().join("|"),
              );
              // Keep the card's home/away orientation matching the odds card.
              return (
                <WcMatchOutlookCard
                  key={m.oddsEventId ?? `${m.homeTeam}-${m.awayTeam}`}
                  match={m}
                  homeCode={teamCodeByNorm.get(normTeamName(m.homeTeam)) ?? ""}
                  awayCode={teamCodeByNorm.get(normTeamName(m.awayTeam)) ?? ""}
                  homeName={m.homeTeam}
                  awayName={m.awayTeam}
                  kickoff={sched?.kickoffLocal ?? (m.commenceTime ?? "").slice(11, 16)}
                  group={(sched?.stage === "group" ? sched?.group : sched?.stage) ?? null}
                  venue={sched?.venueCity ?? null}
                />
              );
            })}
          </div>
        </section>
      )}

      {/* ─── Data status — honest, fail-closed gates ────────────────── */}
      <section className="mt-8" aria-label="Data status">
        <SectionHeader
          eyebrow="Data status"
          title="What's live vs gated"
          sub="We only show what real data supports. Market outlook is live from sportsbook prices; model projections + parlays stay off until a real soccer stats provider is connected — no fabricated prices, lineups, or edges."
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {dataStatus.map((d) => (
            <div
              key={d.label}
              className="flex items-center justify-between gap-2 rounded-[6px] px-3 py-2.5"
              style={{ background: "rgba(7,11,26,0.55)", border: "1px solid var(--vault-border)" }}
            >
              <div className="flex flex-col min-w-0">
                <span style={{ color: "var(--vault-text)", fontSize: 13, fontWeight: 600 }}>{d.label}</span>
                <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>{d.note}</span>
              </div>
              <span
                className="font-mono uppercase tracking-[0.1em] shrink-0 px-2 py-0.5 rounded-[4px]"
                style={{
                  color: d.on ? "var(--vault-success)" : "var(--vault-text-faint)",
                  border: `1px solid ${d.on ? "var(--vault-success)" : "var(--vault-rule)"}`,
                  fontSize: 9.5,
                }}
              >
                {d.on ? "Live" : "Gated"}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Qualified teams · flag rail ─────────────────────────────── */}
      <section className="mt-10" aria-label="Qualified nations">
        <SectionHeader
          eyebrow="Qualified nations · 48 teams"
          title="Every federation in the field"
          sub="Grouped by World Cup confederation. Hosts marked in gold. Click a flag for fixtures."
        />
        <div className="grid grid-cols-3 sm:grid-cols-6 md:grid-cols-8 gap-2">
          {teams.map((t) => (
            <Link
              key={t.code + t.name}
              href={`/world-cup/team/${encodeURIComponent(t.code)}`}
              className="rounded-[6px] flex flex-col items-center gap-1 py-3 vault-glow-hover"
              style={{
                background: "rgba(7,11,26,0.55)",
                border: t.isHost
                  ? "1px solid rgba(240, 199, 94, 0.55)"
                  : "1px solid var(--vault-border)",
                textDecoration: "none",
              }}
              title={`${t.name} · Group ${t.group}${t.isHost ? " · Host" : ""}`}
            >
              <FlagBadge code={t.code} size="lg" ariaLabel={`${t.name} flag`} />
              <span
                className="font-mono uppercase tracking-[0.10em]"
                style={{
                  color: t.isHost
                    ? "var(--vault-gold-bright)"
                    : "var(--vault-text-mute)",
                  fontSize: 9,
                }}
              >
                {t.name}
              </span>
              <span
                className="font-mono"
                style={{ color: "var(--vault-text-faint)", fontSize: 9 }}
              >
                Group {t.group}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ─── Opener + early schedule preview ───────────────────────────── */}
      <section className="mt-10" aria-label="Opening matches">
        <SectionHeader
          eyebrow="Opening matchdays · group stage"
          title="First six matches"
          sub="Kickoff times shown in the venue's local time. Full 104-match schedule on the Schedule page."
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {upcomingMatches.map((m) => {
            const homeTeam = teams.find((t) => t.name === m.home);
            const awayTeam = teams.find((t) => t.name === m.away);
            return (
              <article
                key={m.id}
                className="rounded-[8px] px-4 py-4 flex flex-col gap-3"
                style={{
                  background: "rgba(7,11,26,0.55)",
                  border: "1px solid var(--vault-border)",
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="font-mono uppercase tracking-[0.18em]"
                    style={{ color: "var(--vault-gold)", fontSize: 9 }}
                  >
                    Group {m.group} · match {m.id}
                  </span>
                  <span
                    className="font-mono"
                    style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
                  >
                    {m.date.slice(5)} · {m.kickoffLocal}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <FlagBadge code={homeTeam?.code ?? ""} size="md" />
                  <span
                    className="font-display tracking-tight"
                    style={{ color: "var(--vault-text)", fontSize: 15 }}
                  >
                    {m.home}
                  </span>
                  <span
                    className="font-mono ml-auto"
                    style={{ color: "var(--vault-text-mute)", fontSize: 11 }}
                  >
                    vs
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <FlagBadge code={awayTeam?.code ?? ""} size="md" />
                  <span
                    className="font-display tracking-tight"
                    style={{ color: "var(--vault-text)", fontSize: 15 }}
                  >
                    {m.away}
                  </span>
                </div>
                <div
                  className="flex items-center justify-between gap-2 pt-2"
                  style={{ borderTop: "1px solid var(--vault-rule)" }}
                >
                  <span
                    className="font-mono"
                    style={{ color: "var(--vault-text-mute)", fontSize: 10 }}
                  >
                    {m.venueCity}, {m.venueCountry}
                  </span>
                  <span
                    className="font-mono uppercase tracking-[0.12em]"
                    style={{ color: "var(--vault-text-faint)", fontSize: 9 }}
                  >
                    Projection pending
                  </span>
                </div>
              </article>
            );
          })}
        </div>
        <div className="mt-4">
          <Link
            href="/world-cup/schedule"
            className="font-mono uppercase tracking-[0.16em]"
            style={{ color: "var(--vault-gold-bright)", fontSize: 11 }}
          >
            Open full schedule →
          </Link>
        </div>
      </section>

      {/* ─── Methodology preview ──────────────────────────────────────── */}
      <section className="mt-12" aria-label="Methodology preview">
        <SectionHeader
          eyebrow="Methodology preview"
          title="Planned model inputs"
          sub="These are the inputs the World Cup projection model will ingest once live. Nothing here is scoring matches yet."
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {(meta?.projectionStatus?.plannedInputs ?? []).map((input) => (
            <div
              key={input}
              className="rounded-[6px] px-4 py-3"
              style={{
                background: "rgba(7,11,26,0.55)",
                border: "1px solid var(--vault-border)",
              }}
            >
              <span
                className="font-mono uppercase tracking-[0.14em]"
                style={{ color: "var(--vault-gold)", fontSize: 9 }}
              >
                planned input
              </span>
              <div
                className="mt-1 text-[13px] leading-relaxed"
                style={{ color: "var(--vault-text)" }}
              >
                {input}
              </div>
            </div>
          ))}
        </div>
        {/* Planned soccer markets + risk tiers — from the factor guide.
            PLANNED, not active: nothing prices these until odds + stats land. */}
        <div className="mt-4">
          <span
            className="font-mono uppercase tracking-[0.14em]"
            style={{ color: "var(--vault-text-faint)", fontSize: 9 }}
          >
            Planned markets · not yet active
          </span>
          <div className="mt-2 flex flex-wrap gap-2">
            {[
              ["Moneyline (90-min, 3-way)", "Low/Med"],
              ["Team total goals", "Medium"],
              ["Match total goals", "Med/High"],
              ["Player shots", "Low/Med"],
              ["Shots on target", "Low/Med"],
              ["Player assists", "Medium"],
              ["Corners", "Low/Med"],
              ["Anytime goalscorer", "Med/High"],
            ].map(([market, tier]) => (
              <span
                key={market}
                className="inline-flex items-center gap-1.5 rounded-[6px] px-2.5 py-1"
                style={{ background: "rgba(7,11,26,0.55)", border: "1px solid var(--vault-rule)" }}
              >
                <span style={{ color: "var(--vault-text)", fontSize: 12 }}>{market}</span>
                <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
                  {tier}
                </span>
              </span>
            ))}
          </div>
        </div>
        <p
          className="mt-4 text-[11.5px] leading-relaxed"
          style={{ color: "var(--vault-text-faint)" }}
        >
          {meta?.projectionStatus?.notes} Soccer markets are kept explicit — the 90-minute
          regulation result (with Draw as a real third outcome) is never mixed with
          advancement or extra-time markets. Full factor framework:{" "}
          <Link
            href="/methodology"
            style={{ color: "var(--vault-gold-bright)" }}
          >
            methodology
          </Link>
          .
        </p>
      </section>

      {/* ─── Squad status disclosure ──────────────────────────────────── */}
      <section
        className="mt-10 rounded-[6px] px-4 py-4"
        style={{
          background: "rgba(7,11,26,0.45)",
          border: "1px solid var(--vault-border)",
        }}
      >
        <div className="flex items-center gap-2 mb-2">
          <span
            aria-hidden
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{
              background: "var(--vault-warn)",
              boxShadow: "0 0 6px rgba(212, 175, 55, 0.55)",
            }}
          />
          <span
            className="font-mono uppercase tracking-[0.18em]"
            style={{ color: "var(--vault-warn)", fontSize: 10 }}
          >
            Squads pending official release
          </span>
        </div>
        <p
          className="text-[13px] leading-relaxed"
          style={{ color: "var(--vault-text-mute)" }}
        >
          {meta?.squadStatus?.notes}
        </p>
      </section>

      {/* ─── Source attribution ───────────────────────────────────────── */}
      <section
        className="mt-10 text-[11px] leading-relaxed"
        style={{ color: "var(--vault-text-faint)" }}
      >
        <span
          className="font-mono uppercase tracking-[0.16em]"
          style={{ color: "var(--vault-gold)", fontSize: 9 }}
        >
          Sources
        </span>
        <ul className="mt-1 space-y-0.5">
          {(meta?.sources ?? []).map((s) => (
            <li key={s.url}>
              · <span style={{ color: "var(--vault-text-mute)" }}>{s.label}</span>
            </li>
          ))}
        </ul>
      </section>

      <OverviewFooterDisclosure
        inputsLabel="What is wired today"
        inputsBody={
          <>
            Official tournament schedule (104 matches), groups (12), qualified
            teams (48), venues by host city, and confederation context. Every
            row is sourced from FIFA Final Draw + ESPN cross-reference; the
            sources block above carries the citations.
          </>
        }
        framingBody={
          <>
            A live 90-minute Market Outlook (sportsbook-implied Home/Draw/Away +
            totals) is shown for today&apos;s matches, clearly labeled as
            market-implied — not a model pick. Independent projections, player
            props, and parlays stay fail-closed until a real soccer stats provider
            is connected: we refuse to invent rosters, results, or
            &quot;model edge&quot; before the model is live.
          </>
        }
      />
    </div>
  );
}
