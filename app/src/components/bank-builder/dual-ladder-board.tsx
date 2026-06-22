/**
 * DualLadderBoard — the public Dual Bank Builder as two side-by-side 5-step visual ladders (Lane A /
 * Lane B). Each lane is a vertical rail (✓ cleared · glowing dot active/awaiting · numbered upcoming)
 * with a big readable money target per rung; every rung is a native <details> drawer that expands to
 * the exact card + legs when one exists, or an honest "awaiting / starting path" body when it doesn't.
 *
 * Server-rendered + native <details> → a stopped lane's lost steps never reach the HTML (the view
 * model excludes them). Stopped-lane history lives only on Mr. Dub. Paper-only.
 */
import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import MoneyPath from "@/components/ui/money-path";
import FlagBadge from "@/components/flag-badge";
import { LaneLegRow } from "@/components/parlays/bank-builder-preview-panel";
import { buildPublicDualLadder, type PublicDualLadderView, type PublicLadderStep, type PublicStepStatus } from "@/lib/bank-builder/public-dual-ladder";
import type { DualBankBuilderPreview } from "@/lib/parlays/ui-loader";

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;
const american = (o: number | null | undefined) => (o == null ? "—" : o > 0 ? `+${o}` : `${o}`);

// ── Active-leg enrichment ────────────────────────────────────────────────────────────────────────
// The public view model (ParlayLegDisplay) intentionally carries only the engine fields; the active
// cross-slate legs carry richer betting-slip metadata in the committed artifact (displaySelection,
// matchup, kickoffEt, flags, settlementSource, …). We read that artifact directly here (server-only,
// like every other data loader) and join by legId so the active leg rows read as clear slip rows —
// without mutating the protected artifact or the shared ui-loader. Fail-closed: any read error → no
// enrichment, the row falls back to the plain shared LaneLegRow.
interface EnrichedLeg {
  legId: string;
  displaySelection?: string;
  matchup?: string;
  homeTeam?: string;
  awayTeam?: string;
  flagHome?: string;
  flagAway?: string;
  marketLabel?: string;
  participantName?: string;
  kickoffEt?: string;
  eventDate?: string;
  odds?: number | null;
  provider?: string;
  settlementSource?: string;
  settlementStatus?: string; // "hit" | "miss" | "pending" (leg-level official outcome)
  settlementResult?: string; // "won" | "lost" | "void"
  settlementOfficial?: string; // e.g. "New Zealand 1-3 Egypt (FT, ESPN/FIFA)"
  rationale?: string;
  riskNote?: string;
  currentGameStatus?: string;
}
interface StepMeta {
  crossSlate?: boolean;
  slateLabel?: string;
  riskNote?: string;
  legs: Record<string, EnrichedLeg>;
}
// keyed by `${laneId}:${step}` → step metadata + enriched legs by legId.
function loadActiveEnrichment(): Record<string, StepMeta> {
  const out: Record<string, StepMeta> = {};
  try {
    const p = path.join(process.cwd(), "public", "data", "methodology", "launch", "dual-bank-builder-active.json");
    const raw = JSON.parse(fs.readFileSync(p, "utf8")) as { run?: { laneA?: unknown; laneB?: unknown } };
    const run = raw.run ?? {};
    for (const [laneKey, laneId] of [["laneA", "lane-a"], ["laneB", "lane-b"]] as const) {
      const lane = (run as Record<string, { steps?: Array<Record<string, unknown>> }>)[laneKey];
      for (const s of lane?.steps ?? []) {
        const step = Number(s.step);
        if (!Number.isFinite(step)) continue;
        const legs: Record<string, EnrichedLeg> = {};
        for (const l of (s.legs as Array<Record<string, unknown>>) ?? []) {
          const legId = String(l.legId ?? "");
          if (!legId) continue;
          // settlement may be a plain source-description string (unsettled) or an object with the
          // official leg outcome (settled). Only read result/official from the object form.
          const settlement = (l.settlement && typeof l.settlement === "object") ? (l.settlement as Record<string, unknown>) : undefined;
          legs[legId] = {
            legId,
            displaySelection: l.displaySelection as string | undefined,
            matchup: l.matchup as string | undefined,
            homeTeam: l.homeTeam as string | undefined,
            awayTeam: l.awayTeam as string | undefined,
            flagHome: l.flagHome as string | undefined,
            flagAway: l.flagAway as string | undefined,
            marketLabel: l.marketLabel as string | undefined,
            participantName: l.participantName as string | undefined,
            kickoffEt: l.kickoffEt as string | undefined,
            eventDate: l.eventDate as string | undefined,
            odds: (l.odds as number | null | undefined) ?? null,
            provider: l.provider as string | undefined,
            settlementSource: l.settlementSource as string | undefined,
            settlementStatus: l.settlementStatus as string | undefined,
            settlementResult: settlement?.result as string | undefined,
            settlementOfficial: settlement?.official as string | undefined,
            rationale: l.rationale as string | undefined,
            riskNote: l.riskNote as string | undefined,
            currentGameStatus: l.currentGameStatus as string | undefined,
          };
        }
        out[`${laneId}:${step}`] = {
          crossSlate: s.crossSlate as boolean | undefined,
          slateLabel: s.slateLabel as string | undefined,
          riskNote: s.riskNote as string | undefined,
          legs,
        };
      }
    }
  } catch { /* fail-closed: no enrichment */ }
  return out;
}

/** "Jun 22" from an ISO date (YYYY-MM-DD), UTC-noon math to avoid an off-by-one. */
function shortEventDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** A betting-slip-style active leg row: flags + matchup, market + selection, kickoff ET, odds, and a
 *  small settlement-supported note. Used for the active (pending) step legs that carry enriched data. */
function ActiveSlipLegRow({ leg }: { leg: EnrichedLeg }) {
  // Selection text: prefer the explicit displaySelection; else compose "{matchup} — {market}: {pick}"
  // so an active leg NEVER reads as a bare "Under 3.5" with no matchup.
  const market = leg.marketLabel ?? "";
  const pick = leg.participantName ?? "";
  const composed = [leg.matchup, [market, pick].filter(Boolean).join(": ")].filter(Boolean).join(" — ");
  const selection = leg.displaySelection || composed || pick || market;
  const koDate = shortEventDate(leg.eventDate);
  const kickoff = [leg.kickoffEt, koDate].filter(Boolean).join(" · ");
  // Leg-level official outcome: settled HIT/MISS (with the official score), else pending.
  const status = (leg.settlementStatus ?? "").toLowerCase();
  const isHit = status === "hit" || leg.settlementResult === "won";
  const isMiss = status === "miss" || leg.settlementResult === "lost";
  const settled = isHit || isMiss;
  return (
    <div className="flex items-start gap-2 py-2" style={{ borderTop: "1px solid var(--vault-border)" }}>
      <span className="mt-0.5 flex shrink-0 items-center gap-0.5">
        {leg.flagHome ? <FlagBadge code={leg.flagHome} size="sm" ariaLabel={leg.homeTeam ?? ""} /> : null}
        {leg.flagAway ? <FlagBadge code={leg.flagAway} size="sm" ariaLabel={leg.awayTeam ?? ""} /> : null}
        {!leg.flagHome && !leg.flagAway ? (
          <span className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-[5px] text-[11px]" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid var(--vault-border)" }} aria-hidden>⚽</span>
        ) : null}
      </span>
      <span className="min-w-0 flex-1">
        {leg.matchup && <span className="block truncate text-[11px] font-semibold" style={{ color: "var(--vault-text)" }}>{leg.matchup}</span>}
        <span className="block text-[12px]" style={{ color: "var(--vault-text-mute)" }}>{selection}</span>
        {kickoff && <span className="block font-mono text-[10px]" style={{ color: "var(--vault-text-faint)" }}>Kickoff {kickoff}</span>}
        {settled && leg.settlementOfficial && (
          <span className="block font-mono text-[10px]" style={{ color: "var(--vault-text-faint)" }}>Official: {leg.settlementOfficial}</span>
        )}
        {leg.settlementSource && (
          <span className="mt-0.5 inline-block rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.05em]" style={{ color: "var(--vault-text-faint)", background: "rgba(255,255,255,0.05)" }}>
            settlement-supported · {leg.settlementSource}
          </span>
        )}
      </span>
      <span className="shrink-0 text-right">
        <span className="block font-mono text-[12.5px]" style={{ color: "var(--vault-text)" }}>{american(leg.odds)}</span>
        {settled ? (
          <span className="mt-0.5 inline-block rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.05em]"
            style={{ color: isHit ? "#6EE7A8" : "var(--gtp-bank-heat)", background: isHit ? "rgba(110,231,168,0.12)" : "var(--gtp-bank-heat-dim)" }}>
            {isHit ? "Hit ✓" : "Miss ✗"}
          </span>
        ) : (
          <span className="mt-0.5 inline-block rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.05em]"
            style={{ color: "var(--vault-text-faint)", background: "rgba(255,255,255,0.04)" }}>
            Pending ◷
          </span>
        )}
      </span>
    </div>
  );
}

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

function CardDrawer({ step, stepMeta }: { step: PublicLadderStep; stepMeta?: StepMeta }) {
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
  // Enriched, betting-slip-style active rows only for the live (pending) step that carries the
  // richer artifact metadata; settled/cleared rows keep the shared LaneLegRow (with their official
  // result evidence). The crossSlate / JUN xx / approved-broader-criteria badges come from the step.
  const enriched = !settled && stepMeta ? stepMeta.legs : null;
  const allEnriched = enriched != null && c.legs.length > 0 && c.legs.every((l) => enriched[l.legId]);
  const slateLabel = stepMeta?.slateLabel;
  const crossSlate = stepMeta?.crossSlate;
  // riskNote → ONE small badge (don't clutter); pick the step note or the first leg's note.
  const riskNote = stepMeta?.riskNote ?? (enriched ? Object.values(enriched).find((l) => l.riskNote)?.riskNote : undefined);
  // Distinct JUN dates across the enriched legs (e.g. "JUN 22") for a tasteful date badge.
  const eventDates = enriched ? Array.from(new Set(Object.values(enriched).map((l) => shortEventDate(l.eventDate)).filter(Boolean))) : [];
  return (
    <div className="px-3 pb-3 pt-1">
      <MoneyPath stake={c.stake} ret={c.payout} kind={settled ? (won ? "settled" : "lost") : "projected"} step={c.step} />
      <div className="mt-2 flex flex-wrap gap-1.5 font-mono text-[10px]">
        {c.combinedOdds != null && <span className="rounded px-1.5 py-0.5" style={{ background: "rgba(255,255,255,0.05)", color: "var(--vault-text-faint)" }}>combined {c.combinedOdds >= 0 ? "+" : ""}{c.combinedOdds}</span>}
        {c.survivalScore != null && <span className="rounded px-1.5 py-0.5" style={{ background: "rgba(255,255,255,0.05)", color: "var(--vault-text-faint)" }}>survival {c.survivalScore}</span>}
        {c.slateDate && <span className="rounded px-1.5 py-0.5" style={{ background: "rgba(255,255,255,0.05)", color: "var(--vault-text-faint)" }}>{c.slateDate}</span>}
        <span className="rounded px-1.5 py-0.5" style={{ background: "rgba(255,255,255,0.05)", color: settled ? (won ? "#6EE7A8" : "var(--gtp-bank-heat)") : "var(--vault-gold-bright)" }}>{settled ? (won ? "settled · won" : "settled") : "active · pending official settlement"}</span>
      </div>
      {!settled && (crossSlate || slateLabel || eventDates.length || riskNote) ? (
        <div className="mt-1.5 flex flex-wrap gap-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.06em]">
          {crossSlate ? <span className="rounded px-1.5 py-0.5" style={{ color: "var(--vault-gold-bright)", background: "rgba(217,164,65,0.14)", border: "1px solid rgba(217,164,65,0.4)" }}>Cross-slate</span> : null}
          {eventDates.map((d) => <span key={d} className="rounded px-1.5 py-0.5" style={{ color: "var(--vault-text-mute)", background: "rgba(255,255,255,0.05)", border: "1px solid var(--vault-rule)" }}>{d.toUpperCase()}</span>)}
          {slateLabel ? <span className="rounded px-1.5 py-0.5 normal-case" style={{ color: "var(--vault-text-faint)", background: "rgba(255,255,255,0.04)", letterSpacing: 0 }}>{slateLabel}</span> : null}
          {riskNote ? <span className="rounded px-1.5 py-0.5" style={{ color: "var(--gtp-bank-heat)", background: "var(--gtp-bank-heat-dim)", border: "1px solid rgba(242,54,69,0.32)" }}>Approved broader criteria</span> : null}
        </div>
      ) : null}
      {allEnriched ? (
        <div className="mt-2">{c.legs.map((l) => <ActiveSlipLegRow key={`${c.step}:${l.legId}`} leg={enriched![l.legId]} />)}</div>
      ) : (
        <div className="mt-2">{c.legs.map((l) => <LaneLegRow key={`${c.step}:${l.legId}`} leg={l} pending={!settled} />)}</div>
      )}
    </div>
  );
}

function LadderStepRow({ step, stepMeta }: { step: PublicLadderStep; stepMeta?: StepMeta }) {
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
        <CardDrawer step={step} stepMeta={stepMeta} />
      </div>
    </details>
  );
}

function usd2(n: number | null): string {
  return n == null ? "—" : `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function LaneLadderCard({ view, enrichment }: { view: PublicDualLadderView; enrichment: Record<string, StepMeta> }) {
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
          {view.steps.map((s) => <LadderStepRow key={s.step} step={s} stepMeta={enrichment[`${view.laneId}:${s.step}`]} />)}
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
  // Enriched betting-slip metadata for the live (cross-slate) active legs — read once, joined per step.
  const enrichment = loadActiveEnrichment();
  return (
    <section className="overflow-x-hidden" aria-label="Dual Bank Builder ladders">
      <div className="mb-3">
        <h2 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 17, fontWeight: 800 }}>Today&rsquo;s Dual Bank Builder</h2>
        <p className="text-[12.5px]" style={{ color: "var(--vault-text-mute)" }}>Two independent paper paths toward $10K — tap any step for the exact card.</p>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {a ? <LaneLadderCard view={a} enrichment={enrichment} /> : null}
        {b ? <LaneLadderCard view={b} enrichment={enrichment} /> : null}
      </div>
    </section>
  );
}
