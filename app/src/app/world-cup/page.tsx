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
        framing="Official schedule, groups, and qualified squads from FIFA. Match projections, parlays, and odds are NOT live yet — World Cup is fail-closed until real soccer odds and stats providers are connected, so we never print a projection we can't back with data. The schedule and tournament structure are fully live now."
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
          {/* Readiness badge — honest, fail-closed market-outlook state. */}
          <div
            className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[8px] px-3.5 py-2.5"
            style={{ background: "var(--gtp-card)", border: "1px solid var(--gtp-card-border)" }}
          >
            <span
              className="font-mono uppercase tracking-[0.14em] px-2 py-0.5 rounded-[4px]"
              style={{ color: "var(--vault-gold-bright)", border: "1px solid var(--vault-gold-bright)", fontSize: 10 }}
            >
              Schedule live
            </span>
            <span className="text-[12.5px]" style={{ color: "var(--vault-text-mute)" }}>
              Odds &amp; projections pending — they unlock only when a real soccer odds + stats
              provider is connected. No placeholder prices are shown.
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {todayMatches.map((m) => {
              const homeTeam = teams.find((t) => t.name === m.home);
              const awayTeam = teams.find((t) => t.name === m.away);
              return (
                <article
                  key={m.id}
                  className="rounded-[8px] px-4 py-4 flex flex-col gap-3"
                  style={{ background: "rgba(7,11,26,0.55)", border: "1px solid var(--vault-border)" }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono uppercase tracking-[0.18em]" style={{ color: "var(--vault-gold)", fontSize: 9 }}>
                      {m.stage === "group" ? `Group ${m.group}` : m.stage} · match {m.id}
                    </span>
                    <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>
                      {m.kickoffLocal} · {m.venueCity}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <FlagBadge code={homeTeam?.code ?? ""} size="md" />
                      <span className="font-display tracking-tight truncate" style={{ color: "var(--vault-text)", fontSize: 15, fontWeight: 600 }}>
                        {m.home}
                      </span>
                    </div>
                    <span className="font-mono shrink-0" style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>vs</span>
                    <div className="flex items-center gap-2 min-w-0 justify-end">
                      <span className="font-display tracking-tight truncate text-right" style={{ color: "var(--vault-text)", fontSize: 15, fontWeight: 600 }}>
                        {m.away}
                      </span>
                      <FlagBadge code={awayTeam?.code ?? ""} size="md" />
                    </div>
                  </div>
                  <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>
                    90-minute markets unavailable — odds provider not connected yet
                  </span>
                </article>
              );
            })}
          </div>
        </section>
      )}

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
        <p
          className="mt-4 text-[11.5px] leading-relaxed"
          style={{ color: "var(--vault-text-faint)" }}
        >
          {meta?.projectionStatus?.notes}
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
            Projections, parlay candidate slips, and odds are intentionally
            absent for World Cup matches — the surface is fail-closed until a
            real soccer odds + stats provider is connected. We refuse to invent
            rosters, results, prices, or &quot;model edge&quot; before the model
            is live. The schedule, groups, and qualified teams are fully live.
          </>
        }
      />
    </div>
  );
}
