"use client";
/**
 * Bank Builder journey (Phase 4) — the visual ladder. Two completed $100→$10K crown ladders (each rung
 * clickable to reveal its approved card, odds, result, stake, payout and reasoning) plus today's active
 * approved lane(s) climbing toward the next rung. Pure display of the canonical journey model.
 */
import { useState } from "react";
import type { BankBuilderJourney, JourneyLadder, JourneyStep, JourneyActiveLane } from "@/lib/mr-dub/flagship";

const usd = (n: number | null | undefined) => n == null ? "—" : `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortDate = (iso: string | null) => { if (!iso) return ""; const [y, m, d] = iso.split("-").map(Number); return `${MONTHS[m - 1]} ${d}`; };
const odds = (n: number | null | undefined) => n == null ? "" : n > 0 ? `+${n}` : `${n}`;

function CompletedLadder({ ladder }: { ladder: JourneyLadder }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="rounded-xl px-3.5 py-3" style={{ border: "1px solid var(--vault-border)", background: "var(--gtp-card, rgba(255,255,255,0.02))" }}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12.5px] font-semibold" style={{ color: "var(--vault-text)" }}>{ladder.label}</span>
        <span className="font-mono text-[11px] rounded-full px-2 py-0.5" style={{ color: "var(--vault-success)", background: "var(--gtp-success-soft, rgba(74,222,128,0.10))", border: "1px solid var(--vault-success-dim)" }}>{ladder.result} · {usd(ladder.final)}</span>
      </div>
      <div className="mt-2.5 flex items-stretch gap-1">
        {ladder.steps.map((s: JourneyStep, i: number) => {
          const isOpen = open === s.step;
          return (
            <button key={s.step} onClick={() => setOpen(isOpen ? null : s.step)} className="gtp-pressable group relative flex-1 rounded-lg px-1.5 py-2 text-center" style={{ border: `1px solid ${isOpen ? "var(--vault-success)" : "var(--vault-rule)"}`, background: isOpen ? "var(--gtp-success-soft, rgba(74,222,128,0.12))" : "rgba(74,222,128,0.05)", cursor: "pointer" }} aria-expanded={isOpen}>
              <div className="font-mono text-[8.5px] uppercase tracking-[0.06em]" style={{ color: "var(--vault-text-faint)" }}>Step {s.step}</div>
              <div className="mt-0.5 font-display tabular text-[12px] font-bold" style={{ color: "var(--vault-success)" }}>✓</div>
              <div className="font-mono text-[8.5px]" style={{ color: "var(--vault-text-mute)" }}>{usd(s.after)}</div>
              {i < ladder.steps.length - 1 ? <span aria-hidden className="absolute -right-1 top-1/2 z-10 -translate-y-1/2 text-[9px]" style={{ color: "var(--vault-text-faint)" }}>→</span> : null}
            </button>
          );
        })}
      </div>
      {open != null ? (() => {
        const s = ladder.steps.find((x) => x.step === open)!;
        return (
          <div className="mt-2 rounded-lg px-3 py-2.5" style={{ border: "1px solid var(--vault-rule)", background: "rgba(255,255,255,0.02)" }}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono uppercase tracking-[0.1em] text-[9px]" style={{ color: "var(--vault-success)" }}>Step {s.step} · won · {shortDate(s.date)}</span>
              <span className="font-mono text-[11px]" style={{ color: "var(--vault-text-mute)" }}>{usd(s.before)} → {usd(s.after)}</span>
            </div>
            <ul className="mt-1.5 flex flex-col gap-0.5">
              {s.legs.length ? s.legs.map((l, i) => <li key={i} className="text-[11.5px]" style={{ color: "var(--vault-text)" }}>· {l}</li>) : <li className="text-[11px]" style={{ color: "var(--vault-text-faint)" }}>Official settlement (legs archived).</li>}
            </ul>
            <div className="mt-1 font-mono text-[9.5px]" style={{ color: "var(--vault-text-faint)" }}>Won +{usd(s.profit)} · rolled to the next rung</div>
          </div>
        );
      })() : null}
    </div>
  );
}

function ActiveLane({ lane }: { lane: JourneyActiveLane }) {
  const totalSteps = 5;
  return (
    <div className="rounded-xl px-3.5 py-3" style={{ border: "1px solid var(--vault-edge-gold, var(--vault-border))", background: "linear-gradient(135deg, rgba(240,199,94,0.08), rgba(255,255,255,0.02))" }}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12.5px] font-semibold" style={{ color: "var(--vault-text)" }}>{lane.label}</span>
        <span className="gtp-active-glow font-mono text-[10px] rounded-full px-2 py-0.5" style={{ color: "var(--vault-gold)", border: "1px solid var(--vault-gold-dim)" }}>ACTIVE</span>
      </div>
      <div className="mt-2.5 flex items-stretch gap-1">
        {Array.from({ length: totalSteps }, (_, i) => i + 1).map((step, i) => {
          const cleared = step <= lane.clearedSteps;
          const active = step === lane.step;
          return (
            <div key={step} className="relative flex-1 rounded-lg px-1.5 py-2 text-center" style={{ border: `1px solid ${active ? "var(--vault-gold)" : cleared ? "var(--vault-success)" : "var(--vault-rule)"}`, background: active ? "rgba(240,199,94,0.12)" : cleared ? "rgba(74,222,128,0.05)" : "rgba(255,255,255,0.015)" }}>
              <div className="font-mono text-[8.5px] uppercase tracking-[0.06em]" style={{ color: "var(--vault-text-faint)" }}>Step {step}</div>
              <div className="mt-0.5 font-display text-[12px] font-bold" style={{ color: active ? "var(--vault-gold)" : cleared ? "var(--vault-success)" : "var(--vault-text-faint)" }}>{cleared ? "✓" : active ? "▲" : "·"}</div>
              {i < totalSteps - 1 ? <span aria-hidden className="absolute -right-1 top-1/2 z-10 -translate-y-1/2 text-[9px]" style={{ color: "var(--vault-text-faint)" }}>→</span> : null}
            </div>
          );
        })}
      </div>
      <div className="mt-2 rounded-lg px-3 py-2.5" style={{ border: "1px solid var(--vault-rule)", background: "rgba(255,255,255,0.02)" }}>
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono uppercase tracking-[0.1em] text-[9px]" style={{ color: "var(--vault-gold)" }}>Step {lane.step} · pending · {lane.confidence ?? ""}</span>
          <span className="font-mono text-[11px]" style={{ color: "var(--vault-text-mute)" }}>{usd(lane.stake)} → {lane.potentialReturn != null ? usd(lane.potentialReturn) : "—"}{lane.combinedOdds != null ? ` · ${odds(lane.combinedOdds)}` : ""}</span>
        </div>
        <ul className="mt-1.5 flex flex-col gap-0.5">
          {lane.legs.map((l, i) => <li key={i} className="flex items-center justify-between gap-2 text-[11.5px]" style={{ color: "var(--vault-text)" }}><span>· {l.selection}</span>{l.odds != null ? <span className="font-mono text-[10px]" style={{ color: "var(--vault-text-faint)" }}>{odds(l.odds)}</span> : null}</li>)}
        </ul>
        {lane.whyLadderPick ? <p className="mt-1.5 text-[10.5px] leading-snug" style={{ color: "var(--vault-text-faint)" }}>{lane.whyLadderPick}</p> : null}
      </div>
    </div>
  );
}

export default function BankBuilderJourneySection({ journey }: { journey: BankBuilderJourney }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono uppercase tracking-[0.1em] text-[10px]" style={{ color: "var(--vault-text-faint)" }}>Crown = Σ completed ladders</span>
        <span className="font-display tabular text-[14px] font-bold" style={{ color: "var(--vault-gold)" }}>{usd(journey.crownTotal)}</span>
      </div>
      {journey.activeLanes.length ? (
        <div className="grid gap-2 sm:grid-cols-2">{journey.activeLanes.map((l) => <ActiveLane key={l.lane} lane={l} />)}</div>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-2">{journey.ladders.map((l) => <CompletedLadder key={l.ladder} ladder={l} />)}</div>
      <p className="text-[10px] font-mono" style={{ color: "var(--vault-text-faint)" }}>Tap any ✓ rung to see the approved card, its legs and the official result. Won rungs roll into the next step; a lost $100 seed stops a lane. Paper-only.</p>
    </div>
  );
}
