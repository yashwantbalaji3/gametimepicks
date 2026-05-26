/**
 * CricketPlayerProjections — context-only player cards for the
 * cricket match drilldown.
 *
 * Render contract:
 *   - Renders inside a <details> accordion so the heavy player list
 *     stays collapsed until the user opens the match.
 *   - When the file is missing, the accordion still renders but the
 *     body shows an honest "Player projections unavailable" line.
 *   - Numeric runs/wickets are shown ONLY when projectionType is
 *     "numeric" AND the supporting field is populated. The default
 *     state for this MVP is "context-only" — qualitative role-impact
 *     notes only.
 *   - Every card carries the source + manual badge.
 *   - Pre-toss + XI-not-final caveats sit at the top + bottom of
 *     the section.
 */
import type {
  CricketPlayerProjection,
  CricketPlayerProjectionsFile,
} from "@/lib/data-cricket-players";
import {
  groupPlayersByTeam,
  sortPlayersForDisplay,
} from "@/lib/data-cricket-players";
import CricketTeamBadge from "./cricket-team-badge";

interface Props {
  projections: CricketPlayerProjectionsFile | null;
}

export default function CricketPlayerProjections({ projections }: Props) {
  return (
    <details
      className="rounded-[6px] flex flex-col"
      style={{
        background: "rgba(7,11,26,0.55)",
        border: "1px solid var(--vault-rule)",
      }}
    >
      <summary
        className="cursor-pointer select-none px-3 py-2.5 flex items-center justify-between gap-2"
        style={{ listStyle: "none" }}
      >
        <span className="flex items-center gap-2">
          <span aria-hidden style={{ fontSize: 14 }}>
            👥
          </span>
          <span
            className="font-mono uppercase tracking-[0.14em]"
            style={{ color: "var(--vault-gold)", fontSize: 10 }}
          >
            Player projections
          </span>
          <StatusBadge projections={projections} />
        </span>
        <span
          className="font-mono uppercase tracking-[0.12em]"
          style={{ color: "var(--vault-text-faint)", fontSize: 9 }}
        >
          Tap to open
        </span>
      </summary>

      <div className="px-3 pb-3 flex flex-col gap-2.5">
        {!projections ? (
          <UnavailableState />
        ) : (
          <PlayerProjectionsContent projections={projections} />
        )}
      </div>
    </details>
  );
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function StatusBadge({
  projections,
}: {
  projections: CricketPlayerProjectionsFile | null;
}) {
  if (!projections) {
    return (
      <span
        className="font-mono uppercase tracking-[0.12em] px-1.5 py-0.5 rounded-[3px]"
        style={{
          color: "var(--vault-text-faint)",
          border: "1px solid var(--vault-rule)",
          fontSize: 9,
        }}
      >
        Unavailable
      </span>
    );
  }
  const label =
    projections.status === "pre_toss"
      ? "Pre-toss · context only"
      : "Context only";
  return (
    <span
      className="font-mono uppercase tracking-[0.12em] px-1.5 py-0.5 rounded-[3px]"
      style={{
        color: "var(--vault-gold-bright)",
        border: "1px solid var(--vault-border-strong)",
        fontSize: 9,
      }}
    >
      {label}
    </span>
  );
}

function UnavailableState() {
  return (
    <p
      className="text-[11px] leading-snug rounded-[4px] px-2 py-1.5"
      style={{
        color: "var(--vault-text-faint)",
        background: "rgba(7,11,26,0.45)",
        border: "1px dashed var(--vault-border)",
      }}
    >
      Player projections unavailable for this match. We don't publish
      per-player numeric projections until a reliable per-innings stats
      feed is wired in.
    </p>
  );
}

function PlayerProjectionsContent({
  projections,
}: {
  projections: CricketPlayerProjectionsFile;
}) {
  const byTeam = groupPlayersByTeam(projections.players);
  const teams = Object.keys(byTeam);
  return (
    <div className="flex flex-col gap-2.5">
      <PreTossNote />
      <TotalsContext projections={projections} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {teams.map((t) => (
          <TeamPlayerColumn
            key={t}
            team={t}
            players={sortPlayersForDisplay(byTeam[t])}
          />
        ))}
      </div>
      <SourcesFooter projections={projections} />
    </div>
  );
}

function PreTossNote() {
  return (
    <p
      className="text-[11px] leading-snug rounded-[4px] px-2 py-1.5"
      style={{
        color: "var(--vault-text-mute)",
        background: "rgba(7,11,26,0.45)",
        border: "1px dashed var(--vault-border)",
      }}
    >
      Pre-toss · playing XI can materially change projections. Cards
      below are qualitative role notes only — no numeric runs / wickets
      until per-innings stats data is wired in.
    </p>
  );
}

function TotalsContext({
  projections,
}: {
  projections: CricketPlayerProjectionsFile;
}) {
  const t = projections.totalsContext;
  if (!t) return null;
  return (
    <article
      className="rounded-[4px] px-2.5 py-2 flex flex-col gap-1"
      style={{ border: "1px solid var(--vault-rule)" }}
    >
      <span
        className="font-mono uppercase tracking-[0.12em]"
        style={{ color: "var(--vault-gold)", fontSize: 10 }}
      >
        Total · context only
      </span>
      <p
        className="text-[11.5px] leading-snug"
        style={{ color: "var(--vault-text-mute)" }}
      >
        {t.note}
      </p>
      {t.rangeQualitative ? (
        <p
          className="text-[11px] leading-snug"
          style={{ color: "var(--vault-text-faint)" }}
        >
          {t.rangeQualitative}
        </p>
      ) : null}
      <span
        className="font-mono uppercase tracking-[0.12em]"
        style={{ color: "var(--vault-warn)", fontSize: 9 }}
      >
        {t.label}
      </span>
      {t.source ? (
        <span
          className="text-[10px] font-mono"
          style={{ color: "var(--vault-text-faint)" }}
        >
          Source: {t.source}
        </span>
      ) : null}
    </article>
  );
}

function TeamPlayerColumn({
  team,
  players,
}: {
  team: string;
  players: CricketPlayerProjection[];
}) {
  return (
    <div
      className="rounded-[4px] px-2.5 py-2 flex flex-col gap-2"
      style={{ border: "1px solid var(--vault-rule)" }}
    >
      <div className="flex items-center gap-2">
        <CricketTeamBadge abbr={team} size="sm" />
        <span
          className="font-mono uppercase tracking-[0.12em]"
          style={{ color: "var(--vault-text-mute)", fontSize: 10 }}
        >
          {team} · {players.length} players
        </span>
      </div>
      <ul className="flex flex-col gap-2">
        {players.map((p) => (
          <PlayerCard key={p.name} player={p} />
        ))}
      </ul>
    </div>
  );
}

function PlayerCard({ player }: { player: CricketPlayerProjection }) {
  const isNumeric = player.projectionType === "numeric";
  return (
    <li
      className="rounded-[3px] px-2 py-1.5 flex flex-col gap-1"
      style={{
        background: "rgba(7,11,26,0.45)",
        border: "1px solid var(--vault-rule)",
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className="font-display tracking-tight truncate"
            style={{
              color: "var(--vault-text)",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {player.name}
          </span>
          <RoleChip role={player.role} />
        </div>
        <LikelyXiChip status={player.likelyXiStatus} />
      </div>
      {isNumeric ? <NumericProjection player={player} /> : null}
      <p
        className="text-[11px] leading-snug"
        style={{ color: "var(--vault-text-mute)" }}
      >
        {player.roleImpact}
      </p>
      {player.trendNote ? (
        <p
          className="text-[10.5px] leading-snug"
          style={{ color: "var(--vault-text-faint)" }}
        >
          {player.trendNote}
        </p>
      ) : null}
      <div className="flex items-center gap-1.5">
        {player.manual ? (
          <span
            className="font-mono uppercase tracking-[0.1em] px-1.5 py-0.5 rounded-[2px]"
            style={{
              color: "var(--vault-text-faint)",
              border: "1px solid var(--vault-rule)",
              fontSize: 8,
            }}
          >
            Curated
          </span>
        ) : null}
        {player.source ? (
          <span
            className="text-[10px] font-mono truncate"
            style={{ color: "var(--vault-text-faint)" }}
          >
            · {player.source}
          </span>
        ) : null}
      </div>
    </li>
  );
}

function NumericProjection({ player }: { player: CricketPlayerProjection }) {
  // Render numeric values ONLY when the supporting field exists.
  // Honest: a "numeric" projectionType with no number falls back
  // silently to qualitative — never invent a number.
  if (player.role === "bowler" && typeof player.projectedWickets === "number") {
    return (
      <div className="flex items-baseline gap-2">
        <span
          className="font-display"
          style={{ color: "var(--vault-text)", fontSize: 16, fontWeight: 600 }}
        >
          {player.projectedWickets.toFixed(1)}{" "}
          <span
            style={{
              color: "var(--vault-text-faint)",
              fontSize: 10,
              fontWeight: 400,
            }}
          >
            wickets
          </span>
        </span>
        {player.projectedWicketsRange ? (
          <span
            className="font-mono"
            style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
          >
            range {player.projectedWicketsRange}
          </span>
        ) : null}
      </div>
    );
  }
  if (typeof player.projectedRuns === "number") {
    return (
      <div className="flex items-baseline gap-2">
        <span
          className="font-display"
          style={{ color: "var(--vault-text)", fontSize: 16, fontWeight: 600 }}
        >
          {player.projectedRuns.toFixed(1)}{" "}
          <span
            style={{
              color: "var(--vault-text-faint)",
              fontSize: 10,
              fontWeight: 400,
            }}
          >
            runs
          </span>
        </span>
        {player.projectedRunsRange ? (
          <span
            className="font-mono"
            style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
          >
            range {player.projectedRunsRange}
          </span>
        ) : null}
      </div>
    );
  }
  return null;
}

function RoleChip({ role }: { role: string }) {
  const label =
    role === "all-rounder" ? "all-rounder" : role === "keeper" ? "keeper" : role;
  return (
    <span
      className="font-mono uppercase tracking-[0.1em] px-1 py-0.5 rounded-[2px]"
      style={{
        color: "var(--vault-text-faint)",
        border: "1px solid var(--vault-rule)",
        fontSize: 8,
      }}
    >
      {label}
    </span>
  );
}

function LikelyXiChip({ status }: { status: string }) {
  if (!status || status === "unknown") return null;
  const tone =
    status === "likely"
      ? {
          color: "var(--vault-success)",
          border: "rgba(110,231,168,0.4)",
        }
      : {
          color: "var(--vault-text-faint)",
          border: "var(--vault-rule)",
        };
  return (
    <span
      className="font-mono uppercase tracking-[0.1em] px-1 py-0.5 rounded-[2px] shrink-0"
      style={{
        color: tone.color,
        border: `1px solid ${tone.border}`,
        fontSize: 8,
      }}
    >
      {status === "likely" ? "Likely XI" : "Squad · XI not final"}
    </span>
  );
}

function SourcesFooter({
  projections,
}: {
  projections: CricketPlayerProjectionsFile;
}) {
  if (!projections.sources || projections.sources.length === 0) return null;
  return (
    <footer className="flex flex-col gap-0.5 pt-1.5">
      <span
        className="font-mono uppercase tracking-[0.12em]"
        style={{ color: "var(--vault-text-faint)", fontSize: 9 }}
      >
        Sources
      </span>
      {projections.sources.map((s, i) => (
        <span
          key={i}
          className="text-[10px] font-mono truncate"
          style={{ color: "var(--vault-text-faint)" }}
        >
          · {s.name}
          {s.covers ? ` — ${s.covers}` : ""}
        </span>
      ))}
    </footer>
  );
}
