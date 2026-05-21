/**
 * /world-cup/groups — twelve groups of four.
 *
 * Renders each group as a card with the four teams listed in pot order,
 * a "fixtures count" line, and "Standings unlock at kickoff" framing.
 * No fabricated standings, points, or projected winners.
 */
import Link from "next/link";

import {
  loadWorldCupGroups,
  loadWorldCupTeams,
  loadWorldCupSchedule,
} from "@/lib/data-world-cup";

import WorldCupSectionTabs from "@/components/world-cup/world-cup-section-tabs";
import FlagBadge from "@/components/flag-badge";
import SectionHeader from "@/components/section-header";

export const metadata = {
  title: "Groups · FIFA World Cup 2026 · GameTime Picks",
  description:
    "All 12 FIFA World Cup 2026 groups as drawn at the Final Draw on Dec 5, 2025. Educational analytics; standings unlock at kickoff.",
};

export default function WorldCupGroupsPage() {
  const groups = loadWorldCupGroups();
  const teams = loadWorldCupTeams();
  const schedule = loadWorldCupSchedule();

  const teamMap = new Map(teams.map((t) => [t.name, t]));
  const groupMatches = (gid: string) =>
    schedule.filter((m) => m.stage === "group" && m.group === gid);

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-14 overflow-x-hidden">
      <div className="mb-6">
        <WorldCupSectionTabs />
      </div>

      <SectionHeader
        eyebrow="FIFA World Cup 2026 · groups"
        title="12 groups of four"
        sub="Final Draw on December 5, 2025. Top two from each group advance, plus the eight best third-place finishers. Standings unlock at kickoff."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {groups.map((g) => {
          const fixtures = groupMatches(g.id);
          return (
            <article
              key={g.id}
              className="rounded-[8px] overflow-hidden flex flex-col"
              style={{
                background:
                  "linear-gradient(180deg, rgba(7,11,26,0.85) 0%, rgba(7,11,26,0.55) 100%)",
                border: "1px solid var(--vault-border)",
              }}
            >
              <header
                className="flex items-center justify-between gap-2 px-4 py-3"
                style={{ borderBottom: "1px solid var(--vault-rule)" }}
              >
                <span
                  className="font-mono uppercase tracking-[0.18em]"
                  style={{ color: "var(--vault-gold-bright)", fontSize: 11 }}
                >
                  Group {g.id}
                </span>
                <span
                  className="font-mono uppercase tracking-[0.14em]"
                  style={{ color: "var(--vault-text-faint)", fontSize: 9 }}
                >
                  {fixtures.length} fixtures
                </span>
              </header>
              <ul className="px-4 py-3 space-y-2">
                {g.teams.map((name) => {
                  const t = teamMap.get(name);
                  return (
                    <li key={name} className="flex items-center gap-2.5">
                      <FlagBadge
                        code={t?.code ?? ""}
                        size="md"
                        ariaLabel={`${name} flag`}
                      />
                      <Link
                        href={
                          t
                            ? `/world-cup/team/${encodeURIComponent(t.code)}`
                            : "/world-cup/teams"
                        }
                        className="font-display tracking-tight"
                        style={{
                          color: "var(--vault-text)",
                          fontSize: 14,
                          textDecoration: "none",
                          flex: 1,
                        }}
                      >
                        {name}
                        {t?.isHost ? (
                          <span
                            className="ml-2 font-mono uppercase tracking-[0.12em]"
                            style={{
                              color: "var(--vault-gold)",
                              fontSize: 9,
                            }}
                          >
                            host
                          </span>
                        ) : null}
                      </Link>
                      <span
                        className="font-mono"
                        style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
                      >
                        {t?.confederation ?? "—"}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <footer
                className="px-4 py-2.5 flex items-center justify-between gap-2"
                style={{ borderTop: "1px solid var(--vault-rule)" }}
              >
                <span
                  className="font-mono uppercase tracking-[0.14em]"
                  style={{ color: "var(--vault-text-mute)", fontSize: 9 }}
                >
                  Standings unlock at kickoff
                </span>
                <Link
                  href={`/world-cup/schedule#group-${g.id}`}
                  className="font-mono uppercase tracking-[0.14em]"
                  style={{
                    color: "var(--vault-gold-bright)",
                    fontSize: 9,
                    textDecoration: "none",
                  }}
                >
                  Fixtures →
                </Link>
              </footer>
            </article>
          );
        })}
      </div>

      <section
        className="mt-10 rounded-[6px] px-4 py-4 text-[12px] leading-relaxed"
        style={{
          background: "rgba(7,11,26,0.45)",
          border: "1px solid var(--vault-border)",
          color: "var(--vault-text-mute)",
        }}
      >
        <span
          className="font-mono uppercase tracking-[0.14em]"
          style={{ color: "var(--vault-gold)", fontSize: 9 }}
        >
          Advancement rules
        </span>
        <ul className="mt-2 space-y-1 list-disc pl-5">
          <li>Top two teams in each group advance.</li>
          <li>Eight best third-place teams across all 12 groups also advance.</li>
          <li>Total advancing: 32 teams into the Round of 32.</li>
        </ul>
      </section>
    </div>
  );
}
