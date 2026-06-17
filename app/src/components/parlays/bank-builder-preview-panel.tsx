/**
 * Dual Bank Builder PREVIEW panel — operator approval required. Renders the dry-run lane selection
 * (or no-launch reasons). It is PREVIEW ONLY: it never marks a run active, never writes protected
 * Bank Builder data, and never launches. Plain (server-renderable) component.
 */
import PlayerAvatar from "@/components/player-avatar";
import TeamLogo from "@/components/team-logo";
import type { DualBankBuilderPreview, ParlayLegDisplay } from "@/lib/parlays/ui-loader";

function american(o: number | null): string {
  return o == null ? "—" : o > 0 ? `+${o}` : `${o}`;
}

function LaneLeg({ leg }: { leg: ParlayLegDisplay }) {
  const id = leg.identity;
  const avatar = id.kind === "player" && id.playerId != null
    ? <PlayerAvatar playerId={id.playerId} playerName={leg.participant} team={id.teamAbbr ?? undefined} sport={id.avatarSport} size="xs" flat />
    : id.teamAbbr && (leg.sportKey === "mlb" || leg.sportKey === "nba")
      ? <TeamLogo team={id.teamAbbr} sport={leg.sportKey} size="sm" />
      : <PlayerAvatar playerName={leg.participant} size="xs" flat />;
  return (
    <div className="flex items-center gap-2 py-1.5" style={{ borderTop: "1px solid var(--vault-border)" }}>
      <span className="shrink-0">{avatar}</span>
      <span className="min-w-0 flex-1 truncate text-[12.5px]" style={{ color: "var(--vault-text)" }}>{leg.participant} · {leg.market}{leg.line != null ? ` ${leg.line}` : ""}</span>
      <span className="font-mono text-[12px]" style={{ color: "var(--vault-text-mute)" }}>{american(leg.odds)}</span>
    </div>
  );
}

export default function BankBuilderPreviewPanel({ preview }: { preview: DualBankBuilderPreview }) {
  const qualifies = preview.status !== "no_qualified_launch" && preview.laneA && preview.laneB;
  return (
    <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--vault-border)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[15px] font-semibold" style={{ color: "var(--vault-text)" }}>Dual Bank Builder preview</h3>
        <span className="rounded-full px-2.5 py-1 text-[11px] font-medium" style={{ background: "rgba(255,255,255,0.05)", color: "var(--gtp-bank-heat)", border: "1px solid var(--vault-border)" }}>
          Operator approval required
        </span>
      </div>
      <p className="mt-1 text-[12.5px]" style={{ color: "var(--vault-text-faint)" }}>
        Dry-run preview from the methodology engine. Not launched — nothing is published or active.
      </p>

      {qualifies ? (
        <>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[preview.laneA!, preview.laneB!].map((lane, i) => (
              <div key={i} className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--vault-border)" }}>
                <div className="flex items-center justify-between">
                  <span className="text-[12.5px] font-medium" style={{ color: "var(--vault-text)" }}>{lane.label}</span>
                  <span className="font-mono text-[12px]" style={{ color: "var(--vault-text-mute)" }}>survival {lane.survivalScore}</span>
                </div>
                {lane.legs.map((l) => <LaneLeg key={l.legId} leg={l} />)}
                <div className="mt-1.5 text-right font-mono text-[12.5px]" style={{ color: "var(--vault-text)" }}>combined {american(lane.combinedOdds)}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-lg px-3 py-2 text-[12px]" style={{ background: "rgba(255,255,255,0.03)", color: "var(--vault-text-mute)" }}>
            Run id <span className="font-mono">{preview.runId ?? `dual-bank-builder-${preview.date}`}</span> — not launched yet.
            To launch after approval: <span className="font-mono">project-and-launch-today.mjs --launch --write-bank-builder</span>.
          </div>
        </>
      ) : (
        <div className="mt-3">
          <div className="text-[13px] font-medium" style={{ color: "var(--vault-text)" }}>No Qualified Bank Builder Launch</div>
          <ul className="mt-1.5 space-y-1 text-[12.5px]" style={{ color: "var(--vault-text-mute)" }}>
            {preview.noLaunchReasons.map((r, i) => <li key={i}>· {r}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
