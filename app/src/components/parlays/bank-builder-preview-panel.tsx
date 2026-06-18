/**
 * Dual Bank Builder panel — renders the active LADDER as two SEPARATE lane ladders (Lane A survival /
 * Lane B diversified). Each lane shows Step 1 (cleared, official results), Step 2 (active, today's
 * fresh legs as cards with a "why" drawer), and Steps 3–5 (coming soon → $10K). Falls back to a
 * single-step tracker for the dry-run preview (no ladder yet). Plain server-renderable component.
 * PREVIEW/DISPLAY ONLY: never launches, never writes protected Bank Builder data, never fabricates.
 */
import PlayerAvatar from "@/components/player-avatar";
import TeamLogo from "@/components/team-logo";
import FlagBadge from "@/components/flag-badge";
import type { DualBankBuilderPreview, LaneDisplay, LaneStepDisplay, ParlayLegDisplay, Last5 } from "@/lib/parlays/ui-loader";

const CROWN_TARGET = 10000;

function american(o: number | null): string {
  return o == null ? "—" : o > 0 ? `+${o}` : `${o}`;
}
function money(n: number | null): string {
  return n == null ? "—" : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function resultColor(r: string | null): string {
  const v = (r ?? "").toLowerCase();
  if (v === "won") return "var(--vault-success)";
  if (v === "lost") return "var(--gtp-bank-heat)";
  return "var(--vault-text-faint)"; // void / pending / needs_review
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

/** Real last-5 prop history (official MLB game logs). Renders the per-game value vs the line + hit rate. */
function Last5Grid({ last5, side, line }: { last5: Last5; side: string | null; line: number | null }) {
  const sl = sideText(side);
  if (last5.unavailable) {
    return <div className="font-mono text-[10.5px]" style={{ color: "var(--vault-text-faint)" }}>Last 5: data unavailable{last5.reason ? ` — ${last5.reason}` : ""}</div>;
  }
  const games = last5.games ?? [];
  const hr = last5.hitRate;
  return (
    <div className="rounded-lg px-2 py-1.5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--vault-border)" }}>
      <div className="flex items-center justify-between font-mono text-[10px]" style={{ color: "var(--vault-text-faint)" }}>
        <span>Last 5 · {last5.stat === "strikeouts" ? "K" : "H+R+RBI"} vs {sl} {line}</span>
        {hr && <span style={{ color: hr.pct >= 60 ? "var(--vault-success)" : "var(--vault-text-mute)" }}>{hr.hits}/{hr.total} hit · {hr.pct}%</span>}
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        {games.map((g, i) => (
          <span key={i} title={`${g.date} vs ${g.opp}: ${g.value}`} className="flex h-6 min-w-[26px] items-center justify-center rounded font-mono text-[11px]"
            style={{ background: g.hit ? "rgba(70,130,90,0.22)" : "rgba(225,29,42,0.15)", color: g.hit ? "var(--vault-success)" : "var(--gtp-bank-heat)", border: "1px solid var(--vault-border)" }}>
            {g.value}
          </span>
        ))}
      </div>
      <div className="mt-0.5 font-mono text-[9.5px]" style={{ color: "var(--vault-text-faint)" }}>official MLB game logs · most recent first</div>
    </div>
  );
}

/** A clickable leg: shows the EXACT side (Over/Under) + line, settlement, and a "why this pick" drawer. */
function LaneLegRow({ leg, pending }: { leg: ParlayLegDisplay; pending?: boolean }) {
  const sl = sideText(leg.side);
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
          {leg.settlementResult ? (
            <span className="block font-mono text-[9.5px] uppercase" style={{ color: resultColor(leg.settlementResult) }}>{leg.settlementResult} ▾</span>
          ) : (
            <span className="block font-mono text-[9.5px]" style={{ color: "var(--vault-text-faint)" }}>{pending ? "pending ▾" : "preview ▾"}</span>
          )}
        </span>
      </summary>
      <div className="mt-2 space-y-1.5 pl-8 text-[11.5px]">
        <div className="flex flex-wrap gap-1.5 font-mono text-[10.5px]">
          {leg.confidenceTier && <span className="rounded px-1.5 py-0.5" style={{ background: "rgba(255,255,255,0.05)", color: "var(--vault-text-faint)" }}>conf {leg.confidenceTier}</span>}
          {leg.survivalScore != null && <span className="rounded px-1.5 py-0.5" style={{ background: "rgba(255,255,255,0.05)", color: "var(--vault-text-faint)" }}>survival {leg.survivalScore}</span>}
          <span className="rounded px-1.5 py-0.5" style={{ background: "rgba(255,255,255,0.05)", color: "var(--vault-text-faint)" }}>risk {leg.riskScore.toFixed(2)}</span>
          <span className="rounded px-1.5 py-0.5" style={{ background: "rgba(255,255,255,0.05)", color: "var(--vault-text-faint)" }}>{leg.legQualityTier} {leg.legQualityScore}</span>
          {leg.modelProbability != null && <span className="rounded px-1.5 py-0.5" style={{ background: "rgba(255,255,255,0.05)", color: "var(--vault-text-faint)" }}>model {Math.round(leg.modelProbability * 100)}%</span>}
          {leg.marketImpliedProbability != null && <span className="rounded px-1.5 py-0.5" style={{ background: "rgba(255,255,255,0.05)", color: "var(--vault-text-faint)" }}>implied {Math.round(leg.marketImpliedProbability * 100)}%</span>}
          {leg.edge != null && <span className="rounded px-1.5 py-0.5" style={{ background: "rgba(255,255,255,0.05)", color: leg.edge > 0 ? "var(--vault-success)" : "var(--vault-text-faint)" }}>{leg.edge >= 0 ? "+" : ""}{leg.edge.toFixed(1)}pp edge</span>}
          {leg.confidenceTier && <span className="rounded px-1.5 py-0.5" style={{ background: "rgba(255,255,255,0.05)", color: "var(--vault-text-faint)" }}>DQ {leg.confidenceTier === "High" ? "A/B" : "B"}</span>}
        </div>

        {/* Real last-5 prop history (MLB legs) — official MLB Stats API game logs, never fabricated. */}
        {leg.last5 && <Last5Grid last5={leg.last5} side={leg.side} line={leg.line} />}

        {leg.settlementResult && leg.settlementOfficial && (
          <div style={{ color: "var(--vault-text)" }}><span className="uppercase font-mono text-[10px]" style={{ color: resultColor(leg.settlementResult) }}>{leg.settlementResult}</span> · official: {leg.settlementOfficial}</div>
        )}
        {leg.topPositiveFactors.slice(0, 2).map((f, i) => <div key={`p${i}`} style={{ color: "var(--vault-text-mute)" }}><span style={{ color: "var(--vault-success)" }}>Why:</span> {f}</div>)}
        {leg.topNegativeFactors.slice(0, 2).map((f, i) => <div key={`n${i}`} style={{ color: "var(--vault-text-mute)" }}><span style={{ color: "var(--gtp-bank-heat)" }}>Risk:</span> {f}</div>)}
        {(leg.missingFlags.length > 0 || leg.staleFlags.length > 0) && (
          <div style={{ color: "var(--vault-text-faint)" }}>flags: {[...leg.missingFlags.map((f) => `missing ${f}`), ...leg.staleFlags.map((f) => `stale ${f}`)].join(" · ")}</div>
        )}
        {leg.startTime && <div style={{ color: "var(--vault-text-faint)" }}>Kickoff/first pitch: {startLabel(leg.startTime)} · settles from official sources only.</div>}
        <div style={{ color: "var(--vault-text-faint)" }}>
          {leg.sport === "WORLD_CUP"
            ? "Soccer settles on the 90-minute regulation result (official). Limited-data: market-implied, no independent model."
            : "Settles from the official box score. No plate appearance / did-not-pitch → void (no action)."}
        </div>
      </div>
    </details>
  );
}

/** Step pips: 1 ✓/✗ (settled), current ● (active), rest ○ (coming soon) → $10K. */
function StepPips({ steps, currentStep }: { steps: LaneStepDisplay[]; currentStep: number }) {
  return (
    <div className="flex items-center gap-1">
      {steps.map((s, i) => {
        const isSettled = s.status === "settled";
        const won = s.result === "won";
        const isCurrent = s.step === currentStep && !isSettled;
        const bg = isSettled ? (won ? "var(--vault-success)" : "var(--gtp-bank-heat)")
          : isCurrent ? "var(--gtp-bank-heat)" : "rgba(255,255,255,0.05)";
        const fg = isSettled || isCurrent ? "#170f0a" : "var(--vault-text-faint)";
        return (
          <div key={s.step} className="flex items-center gap-1">
            <span className="flex h-5 w-5 items-center justify-center rounded-full font-mono text-[9.5px]"
              style={{ background: bg, color: fg, border: "1px solid var(--vault-border)" }}>
              {isSettled ? (won ? "✓" : "✗") : s.step}
            </span>
            {i < steps.length - 1 && <span aria-hidden style={{ width: 10, height: 1, background: "var(--vault-border)" }} />}
          </div>
        );
      })}
      <span className="ml-1 font-mono text-[10px]" style={{ color: "var(--vault-text-faint)" }}>→ $10K</span>
    </div>
  );
}

function StepBlock({ step }: { step: LaneStepDisplay }) {
  const settled = step.status === "settled";
  const pending = step.status === "pending";
  const evaluating = step.status === "evaluating";
  const won = step.result === "won";
  const accent = settled ? (won ? "var(--vault-success)" : "var(--gtp-bank-heat)") : pending ? "var(--gtp-bank-heat)" : "var(--vault-text-faint)";
  const tag = settled ? (won ? "cleared · WON" : `${step.result}`) : pending ? "active · pending official settlement" : evaluating ? "evaluating" : "coming soon";
  return (
    <div className="mt-2 rounded-lg p-2.5" style={{ background: "rgba(255,255,255,0.025)", border: "1px solid var(--vault-border)", borderLeft: `2px solid ${accent}` }}>
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-wide" style={{ color: "var(--vault-text)" }}>
          Step {step.step}
          <span className="ml-2 rounded px-1.5 py-0.5 text-[9.5px]" style={{ background: "rgba(255,255,255,0.05)", color: accent }}>{tag}</span>
        </span>
        {(step.stake != null) && (
          <span className="font-mono text-[10.5px]" style={{ color: "var(--vault-text-mute)" }}>
            {money(step.stake)} → {money(step.payout)}{step.projected ? " (proj.)" : ""}
          </span>
        )}
      </div>
      {step.combinedOdds != null && (
        <div className="mt-0.5 font-mono text-[10px]" style={{ color: "var(--vault-text-faint)" }}>
          combined {american(step.combinedOdds)}{step.survivalScore != null ? ` · survival ${step.survivalScore}` : ""}{step.slateDate ? ` · ${step.slateDate}` : ""}
        </div>
      )}
      {pending && step.stake != null && (
        <div className="mt-1 rounded px-2 py-1 font-mono text-[10px]" style={{ background: "rgba(212,175,55,0.07)", color: "var(--vault-gold-bright)" }}>
          Target rung ≈ $200 → $700 · this lane {money(step.stake)} → {money(step.payout)} (payout-optimized)
        </div>
      )}
      {step.legs.length > 0 && <div className="mt-1">{step.legs.map((l) => <LaneLegRow key={`${step.step}:${l.legId}`} leg={l} pending={pending} />)}</div>}
      {evaluating && (
        <ul className="mt-1.5 space-y-1 text-[11px]" style={{ color: "var(--vault-text-mute)" }}>
          {(step.blockers.length ? step.blockers : ["No qualifying legs for this step yet."]).map((b, i) => <li key={i}>· {b}</li>)}
        </ul>
      )}
    </div>
  );
}

/** A full lane ladder: header + step pips + per-step blocks + coming-soon summary + progress meter. */
function LaneLadder({ lane, laneId }: { lane: LaneDisplay; laneId: "A" | "B" }) {
  const steps = lane.steps;
  const detailed = steps.filter((s) => s.status === "settled" || s.status === "pending" || s.status === "evaluating");
  const comingSoon = steps.filter((s) => s.status === "coming_soon");
  const clearedCount = steps.filter((s) => s.status === "settled" && s.result === "won").length;
  const totalSteps = steps.length || 5;
  const hasSoccer = lane.legs.some((l) => l.sport === "WORLD_CUP");
  const pct = Math.round((clearedCount / totalSteps) * 100);
  const currentStep = steps.find((s) => s.status === "pending" || s.status === "evaluating");
  return (
    <div className="rounded-xl p-3.5" style={{ background: "linear-gradient(180deg, rgba(58,18,12,0.5), rgba(20,10,8,0.5))", border: "1px solid var(--vault-border)", borderTop: "2px solid var(--gtp-bank-heat)" }}>
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold" style={{ color: "var(--vault-text)" }}>
          Lane {laneId} · {laneId === "A" ? "survival" : "diversified"}
          <span className="ml-2 rounded px-1.5 py-0.5 text-[10px] uppercase" style={{ background: "rgba(225,29,42,0.15)", color: "var(--gtp-bank-heat)" }}>Step {lane.currentStep} live</span>
        </span>
        <span className="font-mono text-[11.5px]" style={{ color: "var(--vault-text-mute)" }}>survival {lane.survivalScore}</span>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <span className="rounded px-1.5 py-0.5 font-mono text-[10.5px]" style={{ background: "rgba(70,130,90,0.18)", color: "var(--vault-success)" }}>Step 1 cleared</span>
        {hasSoccer && <span className="rounded px-1.5 py-0.5 font-mono text-[10.5px]" style={{ background: "rgba(70,130,90,0.18)", color: "var(--vault-success)" }}>⚽ soccer leg</span>}
        <span className="rounded px-1.5 py-0.5 font-mono text-[10.5px]" style={{ background: "rgba(255,255,255,0.05)", color: "var(--vault-text-faint)" }}>target ${CROWN_TARGET.toLocaleString()}</span>
      </div>

      <div className="mt-2.5"><StepPips steps={steps} currentStep={lane.currentStep} /></div>

      {detailed.map((s) => <StepBlock key={s.step} step={s} />)}

      {comingSoon.length > 0 && (
        <div className="mt-2 rounded-lg px-2.5 py-2 font-mono text-[10.5px]" style={{ background: "rgba(255,255,255,0.02)", border: "1px dashed var(--vault-border)", color: "var(--vault-text-faint)" }}>
          Step{comingSoon.length > 1 ? "s" : ""} {comingSoon.map((s) => s.step).join("–")} · coming soon · ride the bank toward ${CROWN_TARGET.toLocaleString()}
        </div>
      )}

      {/* progress meter */}
      <div className="mt-2.5">
        <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: "var(--vault-success)" }} />
        </div>
        <div className="mt-1 font-mono text-[10.5px]" style={{ color: "var(--vault-text-faint)" }}>
          {clearedCount} / {totalSteps} steps cleared · {currentStep ? `Step ${currentStep.step} ${currentStep.status === "pending" ? "live — awaiting official results" : "evaluating"}` : "ladder advancing"} · official sources only
        </div>
      </div>
    </div>
  );
}

// ── Single-step fallback (dry-run preview, no ladder) ─────────────────────────────────────────────
function SingleStepLane({ lane, laneId, live }: { lane: LaneDisplay; laneId: "A" | "B"; live?: boolean }) {
  const hasSoccer = lane.legs.some((l) => l.sport === "WORLD_CUP");
  const dec = lane.combinedOdds == null ? null : lane.combinedOdds > 0 ? 1 + lane.combinedOdds / 100 : 1 + 100 / Math.abs(lane.combinedOdds);
  const projected = dec == null ? "—" : money(100 * dec);
  return (
    <div className="rounded-xl p-3.5" style={{ background: "linear-gradient(180deg, rgba(58,18,12,0.5), rgba(20,10,8,0.5))", border: "1px solid var(--vault-border)", borderTop: "2px solid var(--gtp-bank-heat)" }}>
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold" style={{ color: "var(--vault-text)" }}>Lane {laneId} · {laneId === "A" ? "survival" : "diversified"}</span>
        <span className="font-mono text-[11.5px]" style={{ color: "var(--vault-text-mute)" }}>survival {lane.survivalScore}</span>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <span className="rounded px-1.5 py-0.5 font-mono text-[10.5px]" style={{ background: "rgba(255,255,255,0.05)", color: "var(--vault-text-faint)" }}>stake $100</span>
        {hasSoccer && <span className="rounded px-1.5 py-0.5 font-mono text-[10.5px]" style={{ background: "rgba(70,130,90,0.18)", color: "var(--vault-success)" }}>⚽ soccer leg</span>}
      </div>
      <div className="mt-1.5">{lane.legs.map((l) => <LaneLegRow key={l.legId} leg={l} pending={live} />)}</div>
      <div className="mt-2 flex items-center justify-between text-[12px]" style={{ borderTop: "1px solid var(--vault-border)", paddingTop: 8 }}>
        <span style={{ color: "var(--vault-text-mute)" }}>combined <span className="font-mono" style={{ color: "var(--vault-text)" }}>{american(lane.combinedOdds)}</span></span>
        <span style={{ color: "var(--vault-text-mute)" }}>→ {projected} from $100</span>
      </div>
    </div>
  );
}

export default function BankBuilderPreviewPanel({ preview }: { preview: DualBankBuilderPreview }) {
  const qualifies = preview.status !== "no_qualified_launch" && preview.laneA && preview.laneB;
  const isLadder = preview.isLadder && (preview.laneA?.steps.length ?? 0) > 0;
  const live = preview.status === "launched";
  const active = live || preview.status === "settled";
  const lanesCleared = [preview.laneA, preview.laneB].filter(Boolean).filter((l) => l!.steps.some((s) => s.status === "settled" && s.result === "won")).length;
  const lanesTotal = [preview.laneA, preview.laneB].filter(Boolean).length;

  return (
    <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.02)", border: active ? "1px solid var(--gtp-bank-heat)" : "1px solid var(--vault-border)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[15px] font-semibold" style={{ color: "var(--vault-text)" }}>
          {isLadder ? `Dual Bank Builder · Step ${preview.currentStep} live` : live ? "Dual Bank Builder · ACTIVE" : "Dual Bank Builder preview"}
        </h3>
        <span className="rounded-full px-2.5 py-1 text-[11px] font-medium" style={{ background: active ? "rgba(70,130,90,0.18)" : "rgba(255,255,255,0.05)", color: active ? "var(--vault-success)" : "var(--gtp-bank-heat)", border: "1px solid var(--vault-border)" }}>
          {isLadder ? `${lanesCleared}/${lanesTotal} lanes cleared Step 1 · paper` : live ? "Live · paper" : "Operator approval required"}
        </span>
      </div>
      <p className="mt-1 text-[12.5px]" style={{ color: "var(--vault-text-faint)" }}>
        {isLadder
          ? `Both lanes cleared Step 1 from official sources. Step ${preview.currentStep} is now live — two fresh survival-first legs per lane, one World Cup leg each, riding the bank toward $${CROWN_TARGET.toLocaleString()}. Paper stakes only; protected completed-ladder history untouched.`
          : live
          ? "Launched dual run from the methodology engine — survival-first, one World Cup leg per lane. Paper stakes only; protected completed-ladder history untouched."
          : "Dry-run preview from the methodology engine — survival-first, pre-event, odds-backed, correlation-aware. Not launched; nothing is published or active. Paper stakes only."}
      </p>

      {qualifies ? (
        <>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {isLadder ? (
              <>
                <LaneLadder lane={preview.laneA!} laneId="A" />
                <LaneLadder lane={preview.laneB!} laneId="B" />
              </>
            ) : (
              <>
                <SingleStepLane lane={preview.laneA!} laneId="A" live={live} />
                <SingleStepLane lane={preview.laneB!} laneId="B" live={live} />
              </>
            )}
          </div>

          <details className="mt-3 rounded-lg" style={{ background: "rgba(255,255,255,0.03)" }}>
            <summary className="cursor-pointer px-3 py-2 text-[12.5px]" style={{ color: "var(--vault-text)" }}>Why these lanes</summary>
            <div className="px-3 pb-3 text-[12px]" style={{ color: "var(--vault-text-mute)" }}>
              Each step takes the highest-survival, lowest-fragility legs across distinct games, pairwise
              non-correlated. Lane A takes the strongest survival pair; Lane B diversifies exposure to
              different games. Every leg is pre-event, odds-backed, and passed leakage validation. A lane
              only advances when its current step settles WON from official sources.
            </div>
          </details>

          <div className="mt-2 rounded-lg px-3 py-2 text-[12px]" style={{ background: "rgba(255,255,255,0.03)", color: "var(--vault-text-mute)" }}>
            {active ? (
              <>Active dual ladder — methodology-engine namespace; protected completed-ladder history untouched. Settles from official sources only.</>
            ) : (
              <>Dry-run preview — not launched. Launches only after approval when the gates pass.</>
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
