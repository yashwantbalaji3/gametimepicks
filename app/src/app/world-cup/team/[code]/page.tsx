/**
 * /world-cup/team/[code] — team detail page.
 *
 * Static export: pre-builds one page per qualified team using
 * `generateStaticParams()`. Renders the country hero, group context,
 * group-stage fixtures, and an honest "squad pending" module.
 */
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  loadWorldCupTeams,
  loadWorldCupGroups,
  fixturesForTeam,
  teamByCode,
  type WorldCupMatch,
} from "@/lib/data-world-cup";

import WorldCupSectionTabs from "@/components/world-cup/world-cup-section-tabs";
import FlagBadge from "@/components/flag-badge";

interface PageProps {
  params: { code: string };
}

export function generateStaticParams() {
  return loadWorldCupTeams().map((t) => ({ code: t.code }));
}

export function generateMetadata({ params }: PageProps) {
  const code = decodeURIComponent(params.code);
  const team = teamByCode(code);
  if (!team) {
    return { title: "Team · FIFA World Cup 2026 · GameTime Picks" };
  }
  return {
    title: `${team.name} · FIFA World Cup 2026 · GameTime Picks`,
    description: `${team.name}'s 2026 FIFA World Cup fixtures, group context, and squad status. Educational analytics — projections coming soon.`,
  };
}

export default function WorldCupTeamDetailPage({ params }: PageProps) {
  const code = decodeURIComponent(params.code);
  const team = teamByCode(code);
  if (!team) return notFound();

  const fixtures = fixturesForTeam(team.name);
  const groups = loadWorldCupGroups();
  const group = groups.find((g) => g.id === team.group);
  const groupRivals = (group?.teams ?? []).filter((n) => n !== team.name);
  const allTeams = loadWorldCupTeams();
  const codeFor = new Map(allTeams.map((t) => [t.name, t.code]));

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-14 overflow-x-hidden">
      <div className="mb-6">
        <WorldCupSectionTabs />
      </div>

      {/* Hero */}
      <section
        className="rounded-[12px] px-5 py-6 sm:px-8 sm:py-8"
        style={{
          background:
            "linear-gradient(180deg, rgba(26, 16, 11,0.85) 0%, rgba(26, 16, 11,0.50) 100%)",
          border: team.isHost
            ? "1px solid rgba(242, 54, 69, 0.45)"
            : "1px solid var(--vault-border)",
        }}
      >
        <div className="flex items-center gap-4">
          <FlagBadge code={team.code} size="xl" ariaLabel={`${team.name} flag`} />
          <div className="flex-1 min-w-0">
            <span
              className="font-mono uppercase tracking-[0.18em]"
              style={{ color: "var(--vault-gold)", fontSize: 10 }}
            >
              FIFA World Cup 2026 · Group {team.group}
              {team.isHost ? " · host nation" : ""}
            </span>
            <h1
              className="mt-1 font-display font-semibold tracking-tight"
              style={{ color: "var(--vault-text)", fontSize: 32, lineHeight: 1.05 }}
            >
              {team.name}
            </h1>
            <div
              className="mt-1 font-mono"
              style={{ color: "var(--vault-text-mute)", fontSize: 11 }}
            >
              {team.confederation} · {fixtures.length} group-stage fixtures
            </div>
          </div>
        </div>
      </section>

      {/* Group context */}
      <section className="mt-8" aria-label="Group context">
        <div className="flex items-center gap-3 mb-3">
          <span
            className="font-mono uppercase tracking-[0.16em] shrink-0"
            style={{ color: "var(--vault-gold)", fontSize: 10 }}
          >
            Group {team.group} · rivals
          </span>
          <div className="flex-1 h-px" style={{ background: "var(--vault-rule)" }} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {groupRivals.map((name) => {
            const code = codeFor.get(name) ?? "";
            return (
              <Link
                key={name}
                href={`/world-cup/team/${encodeURIComponent(code || name)}`}
                className="rounded-[6px] px-3 py-3 flex items-center gap-2.5 vault-glow-hover"
                style={{
                  background: "rgba(26, 16, 11,0.55)",
                  border: "1px solid var(--vault-border)",
                  textDecoration: "none",
                }}
              >
                <FlagBadge code={code} size="md" ariaLabel={`${name} flag`} />
                <span
                  className="font-display tracking-tight"
                  style={{ color: "var(--vault-text)", fontSize: 14 }}
                >
                  {name}
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Fixtures */}
      <section className="mt-10" aria-label="Group-stage fixtures">
        <div className="flex items-center gap-3 mb-3">
          <span
            className="font-mono uppercase tracking-[0.16em] shrink-0"
            style={{ color: "var(--vault-gold)", fontSize: 10 }}
          >
            Group-stage fixtures
          </span>
          <div className="flex-1 h-px" style={{ background: "var(--vault-rule)" }} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {fixtures.map((m) => (
            <FixtureCard key={m.id} match={m} self={team.name} codeFor={codeFor} />
          ))}
        </div>
      </section>

      {/* Squad pending */}
      <section
        className="mt-10 rounded-[8px] px-4 py-5"
        style={{
          background: "rgba(26, 16, 11,0.45)",
          border: "1px solid var(--vault-border)",
        }}
      >
        <div className="flex items-center gap-2 mb-2">
          <span
            aria-hidden
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{
              background: "var(--vault-warn)",
              boxShadow: "0 0 6px rgba(242, 54, 69, 0.55)",
            }}
          />
          <span
            className="font-mono uppercase tracking-[0.18em]"
            style={{ color: "var(--vault-warn)", fontSize: 10 }}
          >
            Roster module pending
          </span>
        </div>
        <p
          className="text-[13px] leading-relaxed"
          style={{ color: "var(--vault-text-mute)" }}
        >
          {team.name}'s final 26-player squad publishes once the federation
          officially announces it (FIFA deadline June 1; FIFA-wide
          publication June 2). We refuse to print speculative or leaked
          rosters — the squad card opens the day the official list drops.
        </p>
        <p
          className="mt-2 text-[11.5px] leading-relaxed"
          style={{ color: "var(--vault-text-faint)" }}
        >
          Projections, edges, and parlay candidates are also pending — the
          tournament model opens before kickoff. See the World Cup overview
          for the planned model inputs.
        </p>
      </section>

      {/* Bottom CTAs */}
      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/world-cup/schedule"
          className="font-mono uppercase tracking-[0.16em]"
          style={{ color: "var(--vault-gold-bright)", fontSize: 11 }}
        >
          ← Full schedule
        </Link>
        <Link
          href={`/world-cup/groups#group-${team.group}`}
          className="font-mono uppercase tracking-[0.16em]"
          style={{ color: "var(--vault-text-mute)", fontSize: 11 }}
        >
          Group {team.group} →
        </Link>
      </div>
    </div>
  );
}

function FixtureCard({
  match,
  self,
  codeFor,
}: {
  match: WorldCupMatch;
  self: string;
  codeFor: Map<string, string>;
}) {
  const opponent = match.home === self ? match.away : match.home;
  const oppCode = opponent ? codeFor.get(opponent) ?? "" : "";
  const isHome = match.home === self;
  return (
    <article
      className="rounded-[8px] px-4 py-4 flex flex-col gap-3"
      style={{
        background: "rgba(26, 16, 11,0.55)",
        border: "1px solid var(--vault-border)",
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className="font-mono uppercase tracking-[0.18em]"
          style={{ color: "var(--vault-gold)", fontSize: 10 }}
        >
          Match {match.id} · {match.date.slice(5)}
        </span>
        <span
          className="font-mono"
          style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
        >
          {match.kickoffLocal}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <FlagBadge code={oppCode} size="md" />
        <div className="flex-1">
          <div
            className="font-mono uppercase tracking-[0.14em]"
            style={{ color: "var(--vault-text-mute)", fontSize: 10 }}
          >
            {isHome ? "Home fixture · vs" : "Away fixture · at"}
          </div>
          <div
            className="font-display tracking-tight"
            style={{ color: "var(--vault-text)", fontSize: 15 }}
          >
            {opponent}
          </div>
        </div>
      </div>
      <div
        className="flex items-center justify-between gap-2 pt-2"
        style={{ borderTop: "1px solid var(--vault-rule)" }}
      >
        <span
          className="font-mono"
          style={{ color: "var(--vault-text-mute)", fontSize: 10 }}
        >
          {match.venueCity}, {match.venueCountry}
        </span>
        <span
          className="font-mono uppercase tracking-[0.12em]"
          style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
        >
          Projection pending
        </span>
      </div>
    </article>
  );
}
