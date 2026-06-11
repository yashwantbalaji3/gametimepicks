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
} from "@/lib/world-cup/market-outlook";
import WcMatchOutlookCard from "@/components/world-cup/wc-match-outlook-card";
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
  const statsNote = planBlock
    ? "API-Football connected · 2026 needs a paid plan"
    : statsConnected
      ? "API-Football connected · awaiting coverage"
      : "no provider connected";
  const dataStatus: Array<{ label: string; on: boolean; note: string }> = [
    { label: "Odds / Market outlook", on: oddsReady, note: "The Odds API · 3-way + totals" },
    { label: "Team stats", on: !!stats?.teamStatsReady, note: statsNote },
    { label: "xG / xGA", on: !!stats?.xgReady, note: "API-Football has no xG" },
    { label: "Lineups / minutes", on: !!stats?.lineupsReady, note: statsNote },
    { label: "Model projections", on: !!stats?.projectionsAllowed, note: "needs team stats + odds" },
    { label: "Suggested parlays", on: !!stats?.parlayAllowed, note: "needs projections" },
  ];

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
        framing="Official schedule + groups from FIFA, plus a live 90-minute Market Outlook — de-vigged Home/Draw/Away + totals implied by current sportsbook prices for today's matches (market-implied, not a model pick). Independent projections, player props, and parlays stay fail-closed until a soccer stats provider connects: we never print a model edge we can't back with data."
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
                color: oddsReady ? "var(--vault-success)" : "var(--vault-gold-bright)",
                border: `1px solid ${oddsReady ? "var(--vault-success)" : "var(--vault-gold-bright)"}`,
                fontSize: 10,
              }}
            >
              {oddsReady ? "Market outlook live" : "Schedule live"}
            </span>
            <span className="text-[12.5px]" style={{ color: "var(--vault-text-mute)" }}>
              {oddsReady
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
