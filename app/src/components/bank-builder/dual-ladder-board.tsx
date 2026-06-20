/**
 * DualLadderBoard — the public Dual Bank Builder as two side-by-side 5-step visual ladders (Lane A /
 * Lane B). Each lane is a vertical rail (✓ cleared · glowing dot active/awaiting · numbered upcoming)
 * with a big readable money target per rung; every rung is a native <details> drawer that expands to
 * the exact card + legs when one exists, or an honest "awaiting / starting path" body when it doesn't.
 *
 * Server-rendered + native <details> → a stopped lane's lost steps never reach the HTML (the view
 * model excludes them). Stopped-lane history lives only on Mr. Dub. Paper-only.
 */
import Link from "next/link";
import MoneyPath from "@/components/ui/money-path";
import { LaneLegRow } from "@/components/parlays/bank-builder-preview-panel";
import { buildPublicDualLadder, type PublicDualLadderView, type PublicLadderStep, type PublicStepStatus } from "@/lib/bank-builder/public-dual-ladder";
import type { DualBankBuilderPreview } from "@/lib/parlays/ui-loader";

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

const STATUS_META: Record<PublicStepStatus, { label: string; color: string; bg: string; border: string }> = {
  cleared: { label: "Cleared", color: "#6EE7A8", bg: "rgba(110,231,168,0.12)", border: "rgba(110,231,168,0.4)" },
  active: { label: "Active", color: "var(--gtp-bank-heat)", bg: "var(--gtp-bank-heat-dim)", border: "rgba(242,54,69,0.4)" },
  awaiting: { label: "Awaiting next card", color: "var(--vault-gold-bright)", bg: "rgba(217,164,65,0.12)", border: "rgba(217,164,65,0.4)" },
  queued: { label: "Starting path", color: "var(--vault-gold-bright)", bg: "rgba(217,164,65,0.10)", border: "rgba(217,164,65,0.35)" },
  upcoming: { label: "Upcoming", color: "var(--vault-text-faint)", bg: "rgba(255,255,255,0.03)", border: "var(--vault-rule)" },
};

/** Rail node: ✓ cleared · glowing dot active/awaiting/queued · number upcoming. */
function RailNode({ status, step }: { status: PublicStepStatus; step: number }) {
  const cleared = status === "cleared";
  const glow = status === "active" || status === "awaiting" || status === "queued";
  const m = STATUS_META[status];
  return (
    <span
      className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-bold ${glow ? "gtp-heat-pulse" : ""}`}
      style={{
        background: cleared ? "rgba(110,231,168,0.18)" : glow ? m.bg : "rgba(26,16,11,0.9)",
        border: `1px solid ${m.border}`,
        color: m.color,
        boxShadow: glow ? `0 0 10px ${m.bg}` : "none",
      }}
      aria-hidden
    >
      {cleared ? "✓" : step}
    </span>
  );
}

function CardDrawer({ step }: { step: PublicLadderStep }) {
  const c = step.card;
  if (!c) {
    const cand = step.candidate;
    if (cand) {
      const hasLegs = cand.legs.length > 0;
      return (
        <div className="px-3 pb-3 pt-1">
          <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
            <span className="rounded px-1.5 py-0.5 font-bold uppercase tracking-[0.06em]" style={{ background: "rgba(217,164,65,0.14)", color: "var(--vault-gold-bright)", border: "1px solid rgba(217,164,65,0.4)" }}>{cand.headline}</span>
            {cand.combinedOdds != null && <span className="rounded px-1.5 py-0.5" style={{ background: "rgba(255,255,255,0.05)", color: "var(--vault-text-faint)" }}>combined {cand.combinedOdds >= 0 ? "+" : ""}{cand.combinedOdds}</span>}
            {cand.stake != null && cand.projectedReturn != null && <span className="rounded px-1.5 py-0.5" style={{ background: "rgba(255,255,255,0.05)", color: "var(--vault-text-faint)" }}>{usd(cand.stake)} → {usd(cand.projectedReturn)}</span>}
          </div>
          {hasLegs && <div className="mt-2">{cand.legs.map((l) => <LaneLegRow key={`cand:${step.step}:${l.legId}`} leg={l} pending />)}</div>}
          <p className="mt-2 text-[12px]" style={{ color: "var(--vault-text-mute)" }}>{cand.reason}</p>
        </div>
      );
    }
    return (
      <div className="px-3 pb-3 pt-1 text-[12px]" style={{ color: "var(--vault-text-mute)" }}>
        <p>{step.status === "queued" ? "The next qualified card starts this path at " + usd(step.actualStake ?? 100) + "." : "Unlocks once the prior step clears — its qualified card is selected then."}</p>
        <p className="mt-1 font-mono text-[10.5px]" style={{ color: "var(--vault-text-faint)" }}>Paper-only — generated from current pre-event model gates. No card is shown until the slate supports one.</p>
      </div>
    );
  }
  const settled = c.status === "settled";
  const won = c.result === "won";
  return (
    <div className="px-3 pb-3 pt-1">
      <MoneyPath stake={c.stake} ret={c.payout} kind={settled ? (won ? "settled" : "lost") : "projected"} step={c.step} />
      <div className="mt-2 flex flex-wrap gap-1.5 font-mono text-[10px]">
        {c.combinedOdds != null && <span className="rounded px-1.5 py-0.5" style={{ background: "rgba(255,255,255,0.05)", color: "var(--vault-text-faint)" }}>combined {c.combinedOdds >= 0 ? "+" : ""}{c.combinedOdds}</span>}
        {c.survivalScore != null && <span className="rounded px-1.5 py-0.5" style={{ background: "rgba(255,255,255,0.05)", color: "var(--vault-text-faint)" }}>survival {c.survivalScore}</span>}
        {c.slateDate && <span className="rounded px-1.5 py-0.5" style={{ background: "rgba(255,255,255,0.05)", color: "var(--vault-text-faint)" }}>{c.slateDate}</span>}
        <span className="rounded px-1.5 py-0.5" style={{ background: "rgba(255,255,255,0.05)", color: settled ? (won ? "#6EE7A8" : "var(--gtp-bank-heat)") : "var(--vault-gold-bright)" }}>{settled ? (won ? "settled · won" : "settled") : "active · pending official settlement"}</span>
      </div>
      <div className="mt-2">{c.legs.map((l) => <LaneLegRow key={`${c.step}:${l.legId}`} leg={l} pending={!settled} />)}</div>
    </div>
  );
}

function LadderStepRow({ step }: { step: PublicLadderStep }) {
  const m = STATUS_META[step.status];
  const cleared = step.status === "cleared";
  const active = step.status === "active";
  // Open the drawer by default for the next actionable step (active card or an awaiting/queued
  // candidate) so the demo shows the card/candidate without a click.
  const openByDefault = active || ((step.status === "awaiting" || step.status === "queued") && step.candidate != null);
  return (
    <details className="group relative" open={openByDefault}>
      <summary className="flex cursor-pointer items-center gap-3 py-2.5" style={{ listStyle: "none" }}>
        <RailNode status={step.status} step={step.step} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="font-display tabular tracking-tight" style={{ color: "var(--vault-text)", fontSize: 16, fontWeight: 700 }}>
              {usd(step.startTarget)} <span style={{ color: "var(--vault-text-faint)" }}>→</span> {usd(step.goalTarget)}
            </span>
            <span className="font-mono text-[10px]" style={{ color: "var(--vault-text-faint)" }}>~{step.multiplier.toFixed(2)}×</span>
          </span>
          {(cleared || active) && step.actualStake != null ? (
            <span className="mt-0.5 block font-mono text-[11px]" style={{ color: cleared ? "#6EE7A8" : "var(--vault-gold-bright)" }}>
              actual {usd2(step.actualStake)} → {usd2(step.actualReturn)}{cleared ? " · WON" : " riding"}
            </span>
          ) : (
            <span className="mt-0.5 block font-mono text-[10px]" style={{ color: "var(--vault-text-faint)" }}>Step {step.step} of 5</span>
          )}
        </span>
        <span className="shrink-0 rounded-full px-2 py-0.5 font-mono text-[9.5px] font-bold uppercase tracking-[0.08em]" style={{ color: m.color, background: m.bg, border: `1px solid ${m.border}` }}>{m.label}</span>
        <span aria-hidden className="shrink-0 font-mono text-[11px] transition-transform group-open:rotate-90" style={{ color: "var(--vault-text-faint)" }}>›</span>
      </summary>
      <div className="ml-10 mb-1 rounded-[10px]" style={{ background: "rgba(255,255,255,0.015)", border: "1px solid var(--vault-rule)" }}>
        <CardDrawer step={step} />
      </div>
    </details>
  );
}

function usd2(n: number | null): string {
  return n == null ? "—" : `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function LaneLadderCard({ view }: { view: PublicDualLadderView }) {
  const accent = view.currentStatus === "queued_restart" ? "var(--vault-gold-bright)" : view.currentStatus === "advanced" ? "#6EE7A8" : "var(--gtp-bank-heat)";
  return (
    <div className="flex flex-col rounded-2xl p-4" style={{ background: "rgba(26,16,11,0.55)", border: "1px solid var(--vault-border)" }}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 16, fontWeight: 800 }}>{view.label}</h3>
        <span className="rounded-full px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: accent, background: "rgba(255,255,255,0.05)", border: `1px solid ${accent}` }}>
          {view.currentStatus === "advanced" ? "Advanced" : view.currentStatus === "queued_restart" ? "Starting path" : view.currentStatus === "active" ? "Active" : view.currentStatus}
        </span>
      </div>
      <p className="mb-3 text-[12px]" style={{ color: "var(--vault-text-mute)" }}>{view.headline}</p>

      {/* Vertical rail behind the step nodes (the rail node sits at left ~14px). */}
      <div className="relative">
        <span aria-hidden className="absolute top-3 bottom-3" style={{ left: 13.5, width: 2, background: "linear-gradient(180deg, #6EE7A8 0%, var(--vault-gold-bright) 45%, var(--vault-rule) 100%)", opacity: 0.5, borderRadius: 2 }} />
        <div className="flex flex-col divide-y" style={{ borderColor: "var(--vault-rule)" }}>
          {view.steps.map((s) => <LadderStepRow key={s.step} step={s} />)}
        </div>
      </div>

      <Link href="/mr-dub" className="mt-3 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: "var(--vault-gold-bright)" }}>
        Full ledger on Mr. Dub →
      </Link>
    </div>
  );
}

export default function DualLadderBoard({ preview }: { preview: DualBankBuilderPreview }) {
  const a = buildPublicDualLadder(preview.laneA, "lane-a");
  const b = buildPublicDualLadder(preview.laneB, "lane-b");
  if (!a && !b) return null;
  return (
    <section className="overflow-x-hidden" aria-label="Dual Bank Builder ladders">
      <div className="mb-3">
        <h2 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 17, fontWeight: 800 }}>Today&rsquo;s Dual Bank Builder</h2>
        <p className="text-[12.5px]" style={{ color: "var(--vault-text-mute)" }}>Two independent paper paths toward $10K — tap any step for the exact card.</p>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {a ? <LaneLadderCard view={a} /> : null}
        {b ? <LaneLadderCard view={b} /> : null}
      </div>
    </section>
  );
}
