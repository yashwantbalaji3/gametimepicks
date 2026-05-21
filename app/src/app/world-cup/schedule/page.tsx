/**
 * /world-cup/schedule — full 104-match schedule.
 *
 * Renders chronologically by date with a sticky date-rail at the top.
 * Each match card carries flag badges, venue, kickoff (venue-local
 * time), stage label, and an honest "Projection pending" tag.
 *
 * Knockout matches show placeholder labels (e.g. "Group A · Winner")
 * until results determine the bracket — never fabricated team names.
 */
import Link from "next/link";

import {
  loadWorldCupSchedule,
  loadWorldCupTeams,
  scheduleByDate,
  STAGE_LABEL,
  type WorldCupMatch,
} from "@/lib/data-world-cup";

import WorldCupSectionTabs from "@/components/world-cup/world-cup-section-tabs";
import FlagBadge from "@/components/flag-badge";
import SectionHeader from "@/components/section-header";

export const metadata = {
  title: "Schedule · FIFA World Cup 2026 · GameTime Picks",
  description:
    "Full 104-match FIFA World Cup 2026 schedule with venue, group, and kickoff time. Educational analytics; projections coming soon.",
};

export default function WorldCupSchedulePage() {
  const matches = loadWorldCupSchedule();
  const teams = loadWorldCupTeams();
  const codeFor = new Map(teams.map((t) => [t.name, t.code]));
  const byDate = scheduleByDate();

  // Count of matches per stage for the summary strip.
  const stageCounts = matches.reduce<Record<string, number>>(
    (acc, m) => ((acc[m.stage] = (acc[m.stage] ?? 0) + 1), acc),
    {},
  );

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-14 overflow-x-hidden">
      <div className="mb-6">
        <WorldCupSectionTabs />
      </div>

      <SectionHeader
        eyebrow="FIFA World Cup 2026 · schedule"
        title="Every match · group stage through final"
        sub="104 matches across USA, Canada and Mexico from June 11 to July 19. Times shown are local to the venue. Knockout placeholders unlock as results come in."
      />

      {/* Stage summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 mb-8">
        {(["group", "r32", "r16", "qf", "sf", "third", "final"] as const).map(
          (s) => (
            <div
              key={s}
              className="rounded-[5px] px-3 py-2"
              style={{
                background: "rgba(7,11,26,0.55)",
                border: "1px solid var(--vault-border)",
              }}
            >
              <div
                className="font-mono uppercase tracking-[0.14em]"
                style={{ color: "var(--vault-gold)", fontSize: 9 }}
              >
                {STAGE_LABEL[s]}
              </div>
              <div
                className="mt-0.5 font-display tabular tracking-tight"
                style={{ color: "var(--vault-text)", fontSize: 20 }}
              >
                {stageCounts[s] ?? 0}
              </div>
              <div
                className="font-mono"
                style={{ color: "var(--vault-text-faint)", fontSize: 9 }}
              >
                matches
              </div>
            </div>
          ),
        )}
      </div>

      {/* Date-anchored list */}
      <div className="space-y-8">
        {byDate.map(({ date, matches }) => (
          <DayBlock
            key={date}
            date={date}
            matches={matches}
            codeFor={codeFor}
          />
        ))}
      </div>

      <p
        className="mt-12 text-[11px] leading-relaxed"
        style={{ color: "var(--vault-text-faint)" }}
      >
        Source: FIFA Final Draw (Dec 5, 2025) + ESPN cross-reference. Every
        match shown here is in the official 104-match tournament fixture
        list. Projections, odds, and parlay slips are NOT live for World Cup
        matches yet.
      </p>
    </div>
  );
}

function DayBlock({
  date,
  matches,
  codeFor,
}: {
  date: string;
  matches: WorldCupMatch[];
  codeFor: Map<string, string>;
}) {
  return (
    <section aria-label={`Matches on ${date}`}>
      <div className="flex items-center gap-3 mb-3">
        <span
          className="font-mono uppercase tracking-[0.16em] shrink-0"
          style={{ color: "var(--vault-gold)", fontSize: 10 }}
        >
          {formatLongDate(date)} · {matches.length} match
          {matches.length === 1 ? "" : "es"}
        </span>
        <div
          className="flex-1 h-px"
          style={{ background: "var(--vault-rule)" }}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {matches.map((m) => (
          <MatchCard key={m.id} match={m} codeFor={codeFor} />
        ))}
      </div>
    </section>
  );
}

function MatchCard({
  match,
  codeFor,
}: {
  match: WorldCupMatch;
  codeFor: Map<string, string>;
}) {
  const isGroup = match.stage === "group";
  const homeName = match.home ?? match.homePlaceholder ?? "TBD";
  const awayName = match.away ?? match.awayPlaceholder ?? "TBD";
  const homeCode = match.home ? codeFor.get(match.home) ?? "" : "";
  const awayCode = match.away ? codeFor.get(match.away) ?? "" : "";

  return (
    <article
      className="rounded-[8px] px-4 py-4 flex flex-col gap-3"
      style={{
        background: "rgba(7,11,26,0.55)",
        border: isGroup
          ? "1px solid var(--vault-border)"
          : "1px solid rgba(240, 199, 94, 0.30)",
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className="font-mono uppercase tracking-[0.18em]"
          style={{
            color: isGroup ? "var(--vault-gold)" : "var(--vault-gold-bright)",
            fontSize: 9,
          }}
        >
          {isGroup
            ? `Group ${match.group} · match ${match.id}`
            : `${STAGE_LABEL[match.stage]} · match ${match.id}`}
        </span>
        <span
          className="font-mono"
          style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
        >
          {match.kickoffLocal}
        </span>
      </div>
      <TeamRow code={homeCode} name={homeName} placeholder={!match.home} />
      <div
        className="font-mono uppercase tracking-[0.20em] text-center"
        style={{ color: "var(--vault-text-mute)", fontSize: 9 }}
      >
        vs
      </div>
      <TeamRow code={awayCode} name={awayName} placeholder={!match.away} />
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
          style={{ color: "var(--vault-text-faint)", fontSize: 9 }}
        >
          Projection pending
        </span>
      </div>
    </article>
  );
}

function TeamRow({
  code,
  name,
  placeholder,
}: {
  code: string;
  name: string;
  placeholder: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <FlagBadge code={code} size="md" fallback={placeholder ? "?" : undefined} />
      <Link
        href={
          placeholder || !code ? "/world-cup/teams" : `/world-cup/team/${encodeURIComponent(code)}`
        }
        className="font-display tracking-tight"
        style={{
          color: placeholder ? "var(--vault-text-mute)" : "var(--vault-text)",
          fontSize: 14,
          textDecoration: "none",
        }}
      >
        {name}
      </Link>
    </div>
  );
}

function formatLongDate(iso: string): string {
  try {
    const d = new Date(iso + "T12:00:00Z");
    return d.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return iso;
  }
}
