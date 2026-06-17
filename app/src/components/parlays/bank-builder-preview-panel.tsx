/**
 * Dual Bank Builder PREVIEW — operator approval required. Renders SEPARATE Lane A / Lane B trackers
 * (stake, leg statuses, combined odds, projected return, survival + risk, sport mix, soccer marker,
 * progress meter, "why this lane"). PREVIEW ONLY: never marks a run active, never writes protected
 * Bank Builder data, never launches. Plain (server-renderable) component.
 */
import PlayerAvatar from "@/components/player-avatar";
import TeamLogo from "@/components/team-logo";
import FlagBadge from "@/components/flag-badge";
import type { DualBankBuilderPreview, ParlayLegDisplay } from "@/lib/parlays/ui-loader";

const STAKE = 100;

function american(o: number | null): string {
  return o == null ? "—" : o > 0 ? `+${o}` : `${o}`;
}
function decimalOf(o: number | null): number | null {
  if (o == null) return null;
  return o > 0 ? 1 + o / 100 : 1 + 100 / Math.abs(o);
}
function projectedReturn(o: number | null): string {
  const d = decimalOf(o);
  return d == null ? "—" : `$${(STAKE * d).toFixed(2)}`;
}

function sideText(side: string | null): string {
  if (!side) return "";
  const s = side.toLowerCase();
  return s === "over" ? "Over" : s === "under" ? "Under" : s === "yes" ? "Yes" : s === "no" ? "No" : "";
}

function startLabel(iso: string | null): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  return new Date(t).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" }) + " UTC";
}

function legAvatar(leg: ParlayLegDisplay) {
  const id = leg.identity;
  if (id.kind === "player" && id.playerId != null) return <PlayerAvatar playerId={id.playerId} playerName={leg.participant} team={id.teamAbbr ?? undefined} sport={id.avatarSport} size="xs" flat />;
  if (leg.sport === "WORLD_CUP" && id.countryCode) return <FlagBadge code={id.countryCode} size="sm" ariaLabel={leg.participant} />;
  if (id.teamAbbr && (leg.sportKey === "mlb" || leg.sportKey === "nba")) return <TeamLogo team={id.teamAbbr} sport={leg.sportKey} size="sm" />;
  return <PlayerAvatar playerName={leg.participant} size="xs" flat />;
}

/** A clickable leg: shows the EXACT side (Over/Under), and expands to "why this pick". */
function LaneLegRow({ leg, active }: { leg: ParlayLegDisplay; active?: boolean }) {
  const sl = sideText(leg.side);
  // The exact pick (market + Over/Under + line) is on its own line so it is never truncated away.
  const pick = `${leg.market}${sl ? ` ${sl}` : ""}${leg.line != null ? ` ${leg.line}` : ""}`.trim();
  return (
    <details className="py-1.5" style={{ borderTop: "1px solid var(--vault-border)" }}>
      <summary className="flex items-center gap-2 cursor-pointer" style={{ listStyle: "none" }}>
        <span className="shrink-0">{legAvatar(leg)}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-medium" style={{ color: "var(--vault-text)" }}>{leg.participant}</span>
          {pick && <span className="block truncate text-[11.5px]" style={{ color: "var(--vault-text-mute)" }}>{pick}</span>}
        </span>
        <span className="shrink-0 text-right">
          <span className="block font-mono text-[12px]" style={{ color: "var(--vault-text)" }}>{american(leg.odds)}</span>
          <span className="block font-mono text-[9.5px]" style={{ color: "var(--vault-text-faint)" }}>{active ? "pending · live ▾" : "pending ▾"}</span>
        </span>
      </summary>
      <div className="mt-2 space-y-1.5 pl-8 text-[11.5px]">
        <div className="flex flex-wrap gap-1.5 font-mono text-[10.5px]">
          {leg.confidenceTier && <span className="rounded px-1.5 py-0.5" style={{ background: "rgba(255,255,255,0.05)", color: "var(--vault-text-faint)" }}>conf {leg.confidenceTier}</span>}
          {leg.survivalScore != null && <span className="rounded px-1.5 py-0.5" style={{ background: "rgba(255,255,255,0.05)", color: "var(--vault-text-faint)" }}>survival {leg.survivalScore}</span>}
          <span className="rounded px-1.5 py-0.5" style={{ background: "rgba(255,255,255,0.05)", color: "var(--vault-text-faint)" }}>risk {leg.riskScore.toFixed(2)}</span>
          <span className="rounded px-1.5 py-0.5" style={{ background: "rgba(255,255,255,0.05)", color: "var(--vault-text-faint)" }}>{leg.legQualityTier}</span>
          {leg.modelProbability != null && <span className="rounded px-1.5 py-0.5" style={{ background: "rgba(255,255,255,0.05)", color: "var(--vault-text-faint)" }}>model {Math.round(leg.modelProbability * 100)}%</span>}
        </div>
        {leg.topPositiveFactors.slice(0, 2).map((f, i) => <div key={`p${i}`} style={{ color: "var(--vault-text-mute)" }}><span style={{ color: "var(--vault-success)" }}>Why:</span> {f}</div>)}
        {leg.topNegativeFactors.slice(0, 2).map((f, i) => <div key={`n${i}`} style={{ color: "var(--vault-text-mute)" }}><span style={{ color: "var(--gtp-bank-heat)" }}>Risk:</span> {f}</div>)}
        {leg.startTime && <div style={{ color: "var(--vault-text-faint)" }}>Kickoff/first pitch: {startLabel(leg.startTime)} · settles from official sources only.</div>}
      </div>
    </details>
  );
}

const LADDER_STEPS = [1, 2, 3, 4, 5];

/** Per-lane $100 → $10K ladder: Step 1 active, Steps 2–5 coming soon. */
function LaneLadder({ projected }: { projected: string }) {
  return (
    <div className="mt-2.5">
      <div className="flex items-center gap-1">
        {LADDER_STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-1">
            <span className="flex h-5 w-5 items-center justify-center rounded-full font-mono text-[9.5px]"
              style={{ background: s === 1 ? "var(--gtp-bank-heat)" : "rgba(255,255,255,0.05)", color: s === 1 ? "#170f0a" : "var(--vault-text-faint)", border: "1px solid var(--vault-border)" }}>
              {s}
            </span>
            {i < LADDER_STEPS.length - 1 && <span aria-hidden style={{ width: 10, height: 1, background: "var(--vault-border)" }} />}
          </div>
        ))}
        <span className="ml-1 font-mono text-[10px]" style={{ color: "var(--vault-text-faint)" }}>→ $10K</span>
      </div>
      <div className="mt-1 font-mono text-[10px]" style={{ color: "var(--vault-text-faint)" }}>
        Step 1 active · $100 → {projected} · pending official settlement · Steps 2–5 coming soon
      </div>
    </div>
  );
}

function LaneTracker({ lane, laneId, active }: { lane: NonNullable<DualBankBuilderPreview["laneA"]>; laneId: "A" | "B"; active?: boolean }) {
  const sports = Array.from(new Set(lane.legs.map((l) => l.sport)));
  const hasSoccer = lane.legs.some((l) => l.sport === "WORLD_CUP");
  const avgRisk = lane.legs.length ? lane.legs.reduce((s, l) => s + l.riskScore, 0) / lane.legs.length : 0;
  return (
    <div className="rounded-xl p-3.5" style={{ background: "linear-gradient(180deg, rgba(58,18,12,0.5), rgba(20,10,8,0.5))", border: "1px solid var(--vault-border)", borderTop: "2px solid var(--gtp-bank-heat)" }}>
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold" style={{ color: "var(--vault-text)" }}>Lane {laneId} · {laneId === "A" ? "survival" : "diversified"}</span>
        <span className="font-mono text-[11.5px]" style={{ color: "var(--vault-text-mute)" }}>survival {lane.survivalScore}</span>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <span className="rounded px-1.5 py-0.5 font-mono text-[10.5px]" style={{ background: "rgba(255,255,255,0.05)", color: "var(--vault-text-faint)" }}>stake ${STAKE}</span>
        <span className="rounded px-1.5 py-0.5 font-mono text-[10.5px]" style={{ background: "rgba(255,255,255,0.05)", color: "var(--vault-text-faint)" }}>risk {avgRisk.toFixed(2)}</span>
        <span className="rounded px-1.5 py-0.5 font-mono text-[10.5px]" style={{ background: "rgba(255,255,255,0.05)", color: "var(--vault-text-faint)" }}>{sports.map((s) => (s === "WORLD_CUP" ? "WC" : s)).join("+")}</span>
        {hasSoccer && <span className="rounded px-1.5 py-0.5 font-mono text-[10.5px]" style={{ background: "rgba(70,130,90,0.18)", color: "var(--vault-success)" }}>⚽ soccer leg</span>}
      </div>
      <div className="mt-1.5">
        {lane.legs.map((l) => <LaneLegRow key={l.legId} leg={l} active={active} />)}
      </div>
      <div className="mt-2 flex items-center justify-between text-[12px]" style={{ borderTop: "1px solid var(--vault-border)", paddingTop: 8 }}>
        <span style={{ color: "var(--vault-text-mute)" }}>combined <span className="font-mono" style={{ color: "var(--vault-text)" }}>{american(lane.combinedOdds)}</span></span>
        <span style={{ color: "var(--vault-text-mute)" }}>→ {projectedReturn(lane.combinedOdds)} from ${STAKE}</span>
      </div>
      <LaneLadder projected={projectedReturn(lane.combinedOdds)} />
      {/* progress meter — preview: 0 legs settled, awaiting operator launch */}
      <div className="mt-2">
        <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
          <div style={{ width: "0%", height: "100%", background: "var(--gtp-bank-heat)" }} />
        </div>
        <div className="mt-1 font-mono text-[10.5px]" style={{ color: "var(--vault-text-faint)" }}>0 / {lane.legs.length} settled · {active ? "live — awaiting results" : "awaiting operator launch"}</div>
      </div>
    </div>
  );
}

export default function BankBuilderPreviewPanel({ preview }: { preview: DualBankBuilderPreview }) {
  const qualifies = preview.status !== "no_qualified_launch" && preview.laneA && preview.laneB;
  const active = preview.status === "launched";
  return (
    <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.02)", border: active ? "1px solid var(--gtp-bank-heat)" : "1px solid var(--vault-border)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[15px] font-semibold" style={{ color: "var(--vault-text)" }}>{active ? "Dual Bank Builder · ACTIVE" : "Dual Bank Builder preview"}</h3>
        <span className="rounded-full px-2.5 py-1 text-[11px] font-medium" style={{ background: active ? "rgba(70,130,90,0.18)" : "rgba(255,255,255,0.05)", color: active ? "var(--vault-success)" : "var(--gtp-bank-heat)", border: "1px solid var(--vault-border)" }}>
          {active ? "Live · paper" : "Operator approval required"}
        </span>
      </div>
      <p className="mt-1 text-[12.5px]" style={{ color: "var(--vault-text-faint)" }}>
        {active
          ? "Launched dual run from the methodology engine — survival-first, one World Cup leg per lane. Paper stakes only; protected completed-ladder history is untouched."
          : "Dry-run preview from the methodology engine — survival-first, pre-event, odds-backed, correlation-aware. Not launched; nothing is published or active. Paper stakes only."}
      </p>

      {qualifies ? (
        <>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <LaneTracker lane={preview.laneA!} laneId="A" active={active} />
            <LaneTracker lane={preview.laneB!} laneId="B" active={active} />
          </div>

          <details className="mt-3 rounded-lg" style={{ background: "rgba(255,255,255,0.03)" }}>
            <summary className="cursor-pointer px-3 py-2 text-[12.5px]" style={{ color: "var(--vault-text)" }}>Why these lanes</summary>
            <div className="px-3 pb-3 text-[12px]" style={{ color: "var(--vault-text-mute)" }}>
              The four highest-survival, lowest-fragility legs across four distinct games, pairwise
              non-correlated. Lane A takes the strongest survival pair; Lane B diversifies exposure to
              different games. Each leg is pre-event, odds-backed, and passed leakage validation.
            </div>
          </details>

          <div className="mt-2 rounded-lg px-3 py-2 text-[12px]" style={{ background: "rgba(255,255,255,0.03)", color: "var(--vault-text-mute)" }}>
            {active ? (
              <>Run <span className="font-mono">{preview.runId}</span> — ACTIVE (methodology-engine namespace; protected completed-ladder history untouched). Settles from official sources only.</>
            ) : (
              <>Run id <span className="font-mono">{preview.runId ?? `dual-bank-builder-${preview.date}`}</span> — not launched.
              Launch after approval via <span className="font-mono">project-and-launch-today.mjs --launch --write-bank-builder</span> (or the approved pipeline path).</>
            )}
          </div>
        </>
      ) : (
        <div className="mt-3">
          <div className="text-[13px] font-medium" style={{ color: "var(--vault-text)" }}>No Qualified Bank Builder Launch</div>
          <ul className="mt-1.5 space-y-1 text-[12.5px]" style={{ color: "var(--vault-text-mute)" }}>
            {preview.noLaunchReasons.length ? preview.noLaunchReasons.map((r, i) => <li key={i}>· {r}</li>) : <li>· No qualifying slate right now.</li>}
          </ul>
        </div>
      )}

      <div className="mt-3 text-[11px] leading-relaxed" style={{ color: "var(--vault-text-faint)" }}>
        Settlement: official sources only · a hitter prop with no plate appearance voids (DNP, no-action) ·
        a suspended/postponed game is no-action for the original slate · paper-only, not betting advice.
      </div>
    </div>
  );
}
