/**
 * CricketContextCards — team form, head-to-head, key players, venue
 * trends + the "no book total" honesty card.
 *
 * Render contract:
 *   - Sits below the existing CricketMatchCard's market header.
 *   - When the context file is absent or empty, the section renders
 *     a single small "Context data unavailable" line — we do NOT
 *     hide the cricket card entirely.
 *   - Every manual datum carries a small "source" footer.
 *   - We never fabricate a total; the totals card explicitly states
 *     no book line is posted.
 */
import type {
  CricketContext,
  CricketTeamForm,
  CricketPlayerForm,
  CricketVenueTrends,
} from "@/lib/data-cricket-context";
import CricketTeamBadge from "./cricket-team-badge";

interface Props {
  context: CricketContext | null;
  totalsAvailable: boolean;
}

export default function CricketContextCards({ context, totalsAvailable }: Props) {
  if (!context) {
    return (
      <p
        className="text-[11px] leading-snug rounded-[4px] px-2 py-1.5"
        style={{
          color: "var(--vault-text-faint)",
          background: "rgba(26, 16, 11,0.45)",
          border: "1px dashed var(--vault-border)",
        }}
      >
        Contextual research data unavailable for this match. Market consensus
        above is the honest read until team / player / venue context posts.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <TotalsHonestyCard
        totalsAvailable={totalsAvailable}
        venueTrends={context.venueTrends}
      />
      <TeamFormGrid forms={context.teamForm} />
      <HeadToHead context={context} />
      <KeyPlayers players={context.playerForm} />
      <VenueTrendsCard trends={context.venueTrends} />
      <MatchupNotes notes={context.matchupNotes} />
      <SourcesFooter context={context} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function SectionHeader({ label, sub }: { label: string; sub?: string }) {
  return (
    <header className="flex items-baseline justify-between gap-2">
      <span
        className="font-mono uppercase tracking-[0.14em]"
        style={{ color: "var(--vault-gold)", fontSize: 10 }}
      >
        {label}
      </span>
      {sub ? (
        <span
          className="font-mono"
          style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
        >
          {sub}
        </span>
      ) : null}
    </header>
  );
}

function TotalsHonestyCard({
  totalsAvailable,
  venueTrends,
}: {
  totalsAvailable: boolean;
  venueTrends: CricketVenueTrends | null;
}) {
  if (totalsAvailable) return null;
  return (
    <article
      className="rounded-[6px] px-3 py-2.5 flex flex-col gap-1.5"
      style={{
        background: "rgba(26, 16, 11,0.55)",
        border: "1px solid var(--vault-rule)",
      }}
    >
      <SectionHeader label="Total score" sub="No book line available" />
      <p
        className="text-[12px] leading-snug"
        style={{ color: "var(--vault-text-mute)" }}
      >
        The Odds API did not return a totals market for this match.{" "}
        <span style={{ color: "var(--vault-text-faint)" }}>
          Projection unavailable until the total market posts.
        </span>
      </p>
      {venueTrends && venueTrends.notes.length > 0 ? (
        <p
          className="text-[11px] leading-snug"
          style={{ color: "var(--vault-text-faint)" }}
        >
          Venue context (below) is descriptive, not a betting edge.
        </p>
      ) : null}
    </article>
  );
}

function TeamFormGrid({ forms }: { forms: CricketTeamForm[] }) {
  if (!forms || forms.length === 0) return null;
  return (
    <article
      className="rounded-[6px] px-3 py-3 flex flex-col gap-2"
      style={{
        background: "rgba(26, 16, 11,0.55)",
        border: "1px solid var(--vault-rule)",
      }}
    >
      <SectionHeader label="Team form" sub={`Last ${forms[0]?.lastN ?? 5} matches`} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {forms.map((f) => (
          <TeamFormCard key={f.team ?? ""} form={f} />
        ))}
      </div>
    </article>
  );
}

function TeamFormCard({ form }: { form: CricketTeamForm }) {
  const sequence = form.matches.map((m) => m.result).join("");
  return (
    <div
      className="rounded-[4px] px-2.5 py-2 flex flex-col gap-1.5"
      style={{ border: "1px solid var(--vault-rule)" }}
    >
      <div className="flex items-center gap-2">
        <CricketTeamBadge abbr={form.team} size="sm" />
        <div className="flex flex-col">
          <span
            className="font-mono uppercase tracking-[0.12em]"
            style={{ color: "var(--vault-text-mute)", fontSize: 10 }}
          >
            {form.team}
          </span>
          <span
            className="font-mono"
            style={{ color: "var(--vault-text)", fontSize: 12, fontWeight: 600 }}
          >
            {form.summary}
          </span>
        </div>
      </div>
      <div
        className="flex items-center gap-0.5 font-mono tracking-wider"
        aria-label={`Form sequence ${sequence}`}
        style={{ fontSize: 10 }}
      >
        {form.matches.map((m, i) => (
          <span
            key={i}
            className="inline-flex items-center justify-center"
            style={{
              width: 16,
              height: 16,
              borderRadius: 3,
              background:
                m.result === "W"
                  ? "rgba(110,231,168,0.18)"
                  : "rgba(240,138,138,0.18)",
              color: m.result === "W" ? "var(--vault-success)" : "var(--vault-danger)",
              fontWeight: 600,
              fontSize: 10,
            }}
            title={`${m.result} vs ${m.opponent ?? "?"} (${m.date})`}
          >
            {m.result}
          </span>
        ))}
      </div>
      <ul className="flex flex-col gap-1">
        {form.matches.slice(0, 5).map((m, i) => (
          <li
            key={i}
            className="font-mono truncate"
            style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
          >
            <span
              style={{
                color: m.result === "W" ? "var(--vault-success)" : "var(--vault-danger)",
                fontWeight: 600,
                marginRight: 4,
              }}
            >
              {m.result}
            </span>
            {m.date} · {m.venue === "home" ? "vs" : "@"} {m.opponent ?? "?"}
            {m.teamScore ? ` · ${m.teamScore}` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}

function HeadToHead({ context }: { context: CricketContext }) {
  const h2h = context.headToHead;
  if (!h2h || h2h.length === 0) return null;
  return (
    <article
      className="rounded-[6px] px-3 py-2.5 flex flex-col gap-1.5"
      style={{
        background: "rgba(26, 16, 11,0.55)",
        border: "1px solid var(--vault-rule)",
      }}
    >
      <SectionHeader
        label="Head-to-head"
        sub={`Last ${h2h.length} meeting${h2h.length === 1 ? "" : "s"}`}
      />
      <ul className="flex flex-col gap-1">
        {h2h.map((h, i) => (
          <li
            key={i}
            className="font-mono"
            style={{ color: "var(--vault-text-mute)", fontSize: 11 }}
          >
            <span style={{ color: "var(--vault-gold-bright)", fontWeight: 600 }}>
              {h.winner} won
            </span>
            <span style={{ color: "var(--vault-text-faint)" }}>
              {" · "}
              {h.date} · {h.scoreLine}
            </span>
          </li>
        ))}
      </ul>
    </article>
  );
}

function KeyPlayers({ players }: { players: CricketPlayerForm[] }) {
  if (!players || players.length === 0) return null;
  const byTeam = players.reduce<Record<string, CricketPlayerForm[]>>(
    (acc, p) => {
      const t = p.team || "?";
      (acc[t] = acc[t] || []).push(p);
      return acc;
    },
    {},
  );
  const teams = Object.keys(byTeam);
  return (
    <article
      className="rounded-[6px] px-3 py-3 flex flex-col gap-2"
      style={{
        background: "rgba(26, 16, 11,0.55)",
        border: "1px solid var(--vault-rule)",
      }}
    >
      <SectionHeader label="Key players to watch" sub="Curated · sourced" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {teams.map((t) => (
          <div
            key={t}
            className="flex flex-col gap-1.5 rounded-[4px] px-2.5 py-2"
            style={{ border: "1px solid var(--vault-rule)" }}
          >
            <div className="flex items-center gap-2">
              <CricketTeamBadge abbr={t} size="sm" />
              <span
                className="font-mono uppercase tracking-[0.12em]"
                style={{ color: "var(--vault-text-mute)", fontSize: 10 }}
              >
                {t}
              </span>
            </div>
            <ul className="flex flex-col gap-1.5">
              {byTeam[t].map((p) => (
                <li key={p.player} className="flex flex-col gap-0.5">
                  <span className="flex items-center gap-1.5">
                    <span
                      style={{
                        color: "var(--vault-text)",
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      {p.player}
                    </span>
                    <RoleChip role={p.role} />
                  </span>
                  <span
                    className="text-[11px] leading-snug"
                    style={{ color: "var(--vault-text-mute)" }}
                  >
                    {p.note}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p
        className="text-[10px] font-mono"
        style={{ color: "var(--vault-text-faint)" }}
      >
        Player names manually curated. Per-player numerical recent form
        is not modeled here.
      </p>
    </article>
  );
}

function RoleChip({ role }: { role: string }) {
  return (
    <span
      className="font-mono uppercase tracking-[0.12em] px-1.5 py-0.5 rounded-[3px]"
      style={{
        color: "var(--vault-text-faint)",
        border: "1px solid var(--vault-rule)",
        fontSize: 10,
      }}
    >
      {role}
    </span>
  );
}

function VenueTrendsCard({ trends }: { trends: CricketVenueTrends | null }) {
  if (!trends) return null;
  return (
    <article
      className="rounded-[6px] px-3 py-2.5 flex flex-col gap-1.5"
      style={{
        background: "rgba(26, 16, 11,0.55)",
        border: "1px solid var(--vault-rule)",
      }}
    >
      <SectionHeader
        label="Venue context"
        sub={trends.elevation_m ? `${trends.elevation_m} m elevation` : undefined}
      />
      <div
        className="font-display tracking-tight"
        style={{ color: "var(--vault-text)", fontSize: 13, fontWeight: 600 }}
      >
        {trends.venue}
      </div>
      <ul className="flex flex-col gap-1">
        {trends.notes.map((n, i) => (
          <li
            key={i}
            className="text-[11.5px] leading-snug"
            style={{ color: "var(--vault-text-mute)" }}
          >
            • {n}
          </li>
        ))}
      </ul>
      {trends.honestyNote ? (
        <p
          className="text-[10.5px] leading-snug rounded-[3px] px-2 py-1"
          style={{
            color: "var(--vault-text-faint)",
            background: "rgba(26, 16, 11,0.45)",
            border: "1px dashed var(--vault-border)",
          }}
        >
          {trends.honestyNote}
        </p>
      ) : null}
      {trends.source ? (
        <p
          className="text-[10px] font-mono"
          style={{ color: "var(--vault-text-faint)" }}
        >
          Source: {trends.source}
        </p>
      ) : null}
    </article>
  );
}

function MatchupNotes({ notes }: { notes: CricketContext["matchupNotes"] }) {
  if (!notes || notes.length === 0) return null;
  return (
    <article
      className="rounded-[6px] px-3 py-2.5 flex flex-col gap-1.5"
      style={{
        background: "rgba(26, 16, 11,0.55)",
        border: "1px solid var(--vault-rule)",
      }}
    >
      <SectionHeader label="Matchup read" />
      <ul className="flex flex-col gap-2">
        {notes.map((n, i) => (
          <li key={i} className="flex flex-col gap-0.5">
            <span
              className="font-mono uppercase tracking-[0.12em]"
              style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
            >
              {n.label}
              {n.manual ? " · curated" : " · auto"}
            </span>
            <span
              className="text-[12px] leading-snug"
              style={{ color: "var(--vault-text-mute)" }}
            >
              {n.note}
            </span>
          </li>
        ))}
      </ul>
    </article>
  );
}

function SourcesFooter({ context }: { context: CricketContext }) {
  if (!context.sources || context.sources.length === 0) return null;
  return (
    <footer
      className="rounded-[4px] px-2.5 py-1.5 flex flex-col gap-0.5"
      style={{ background: "rgba(26, 16, 11,0.35)" }}
    >
      <span
        className="font-mono uppercase tracking-[0.12em]"
        style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
      >
        Sources
      </span>
      <ul className="flex flex-col gap-0.5">
        {context.sources.map((s, i) => (
          <li
            key={i}
            className="text-[10.5px] font-mono"
            style={{ color: "var(--vault-text-faint)" }}
          >
            · {s.name}
            {s.covers ? ` — ${s.covers}` : ""}
          </li>
        ))}
      </ul>
    </footer>
  );
}
