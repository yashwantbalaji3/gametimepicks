/**
 * /world-cup/teams — the 48 qualified nations.
 *
 * Country cards grouped by confederation, each linking to the team
 * detail page. Hosts are highlighted. Fixture count comes from the
 * static schedule.
 */
import Link from "next/link";

import {
  loadWorldCupTeams,
  loadWorldCupSchedule,
  CONFEDERATION_LABEL,
  fixturesForTeam,
  type WorldCupTeam,
} from "@/lib/data-world-cup";

import WorldCupSectionTabs from "@/components/world-cup/world-cup-section-tabs";
import FlagBadge from "@/components/flag-badge";
import SectionHeader from "@/components/section-header";

export const metadata = {
  title: "Teams · FIFA World Cup 2026 · GameTime Picks",
  description:
    "All 48 qualified men's national teams at the FIFA World Cup 2026, grouped by confederation. Educational analytics; squads pending official release.",
};

export default function WorldCupTeamsPage() {
  const teams = loadWorldCupTeams();
  // Touch the schedule loader once so fixturesForTeam is warm.
  loadWorldCupSchedule();

  const confederationOrder: WorldCupTeam["confederation"][] = [
    "UEFA",
    "CONMEBOL",
    "CONCACAF",
    "AFC",
    "CAF",
    "OFC",
  ];
  const byConfederation = new Map<WorldCupTeam["confederation"], WorldCupTeam[]>();
  for (const c of confederationOrder) byConfederation.set(c, []);
  for (const t of teams) {
    byConfederation.get(t.confederation)?.push(t);
  }

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-14 overflow-x-hidden">
      <div className="mb-6">
        <WorldCupSectionTabs />
      </div>

      <SectionHeader
        eyebrow="FIFA World Cup 2026 · 48 teams"
        title="The qualified nations"
        sub="Grouped by confederation. Hosts marked in gold. Click a card for fixtures + squad status."
      />

      <div className="space-y-8">
        {confederationOrder.map((c) => {
          const list = byConfederation.get(c) ?? [];
          if (list.length === 0) return null;
          return (
            <section key={c} aria-label={CONFEDERATION_LABEL[c]}>
              <div className="flex items-center gap-3 mb-3">
                <span
                  className="font-mono uppercase tracking-[0.16em] shrink-0"
                  style={{ color: "var(--vault-gold)", fontSize: 10 }}
                >
                  {CONFEDERATION_LABEL[c]} · {list.length} team
                  {list.length === 1 ? "" : "s"}
                </span>
                <div
                  className="flex-1 h-px"
                  style={{ background: "var(--vault-rule)" }}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {list.map((t) => (
                  <TeamCard key={t.code + t.name} team={t} />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <p
        className="mt-10 text-[11px] leading-relaxed"
        style={{ color: "var(--vault-text-faint)" }}
      >
        Source: FIFA Final Draw (Dec 5, 2025). Squad lists pending federation
        announcements ahead of the June 1 FIFA deadline.
      </p>
    </div>
  );
}

function TeamCard({ team }: { team: WorldCupTeam }) {
  const fixtures = fixturesForTeam(team.name);
  return (
    <Link
      href={`/world-cup/team/${encodeURIComponent(team.code)}`}
      className="rounded-[8px] block vault-glow-hover"
      style={{
        background:
          "linear-gradient(180deg, rgba(26, 16, 11,0.78) 0%, rgba(26, 16, 11,0.55) 100%)",
        border: team.isHost
          ? "1px solid rgba(242, 54, 69, 0.40)"
          : "1px solid var(--vault-border)",
        textDecoration: "none",
      }}
    >
      <div className="px-4 py-4 flex items-center gap-3">
        <FlagBadge code={team.code} size="lg" ariaLabel={`${team.name} flag`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span
              className="font-display tracking-tight"
              style={{
                color: "var(--vault-text)",
                fontSize: 16,
              }}
            >
              {team.name}
            </span>
            {team.isHost && (
              <span
                className="font-mono uppercase tracking-[0.14em]"
                style={{ color: "var(--vault-gold)", fontSize: 10 }}
              >
                host
              </span>
            )}
          </div>
          <div
            className="mt-0.5 font-mono"
            style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
          >
            Group {team.group} · {fixtures.length} group fixtures · squad pending
          </div>
        </div>
        <span
          className="font-mono uppercase tracking-[0.16em]"
          style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}
        >
          →
        </span>
      </div>
    </Link>
  );
}
