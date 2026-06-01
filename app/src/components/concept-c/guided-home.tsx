"use client";

/**
 * GuidedHome — Concept C (Guided Beginner Flow) PREVIEW ONLY.
 *
 * Replaces the "dump the whole builder immediately" home with an explicit
 * 3-step wizard: pick a sport → pick a comfort level → review the matching
 * cards. One decision at a time, plain English, strong next-step actions.
 *
 * No data/logic changes: it filters the SAME suggested slips with the same
 * shared helpers (getSlipSports, combinedAmericanOddsFromLegs,
 * classifyOddsSection) and renders the same ParlayTicketCard. Honest empty
 * states tell the user exactly what to do next.
 */
import { useMemo, useState } from "react";
import Link from "next/link";

import type { ParlaySlip } from "@/lib/parlay-suggested";
import { getSlipSports } from "@/lib/parlay-suggested";
import {
  combinedAmericanOddsFromLegs,
  classifyOddsSection,
} from "@/lib/parlay-risk-sections";
import type { CalibrationTable } from "@/lib/confidence-calibration";
import ParlayTicketCard from "@/components/parlay-ticket-card";

type SportKey = "all" | "nba" | "mlb" | "multi";
type Comfort = "low" | "medium" | "high" | "longshot";

const SPORTS: Array<{ key: SportKey; label: string; glyph: string; blurb: string }> = [
  { key: "all", label: "Any sport", glyph: "🎯", blurb: "Show me everything tonight" },
  { key: "nba", label: "NBA", glyph: "🏀", blurb: "Basketball props only" },
  { key: "mlb", label: "MLB", glyph: "⚾", blurb: "Baseball props only" },
  { key: "multi", label: "Mixed", glyph: "🔀", blurb: "Slips that combine both sports" },
];

const COMFORTS: Array<{ key: Comfort; label: string; range: string; blurb: string }> = [
  { key: "low", label: "Safer", range: "under +300", blurb: "2–3 legs, lower variance. The steadiest model picks." },
  { key: "medium", label: "Balanced", range: "+300 to +599", blurb: "A bit more upside for a bit more risk." },
  { key: "high", label: "Bolder", range: "+600 to +999", blurb: "Higher payout, higher variance — clearly labeled." },
  { key: "longshot", label: "Longshot", range: "+1000 and up", blurb: "Lottery-style. Most miss — that's the point." },
];

function slipMatchesSport(slip: ParlaySlip, sport: SportKey): boolean {
  if (sport === "all") return true;
  const sports = getSlipSports(slip);
  if (sport === "multi") return sports.size >= 2;
  return sports.size === 1 && sports.has(sport);
}

function slipComfort(slip: ParlaySlip): Comfort | null {
  const american = combinedAmericanOddsFromLegs(slip.legs ?? []);
  if (american == null) return null;
  return classifyOddsSection(american) as Comfort | null;
}

function Stepper({ step }: { step: 1 | 2 | 3 }) {
  const labels = ["Sport", "Comfort", "Your cards"];
  return (
    <ol className="flex items-center gap-2 sm:gap-3" aria-label="Progress">
      {labels.map((label, i) => {
        const n = (i + 1) as 1 | 2 | 3;
        const done = n < step;
        const active = n === step;
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className="inline-flex items-center justify-center rounded-full font-mono"
              style={{
                width: 24, height: 24, fontSize: 12,
                color: active || done ? "var(--vault-bg)" : "var(--vault-text-mute)",
                background: active || done ? "var(--vault-gold-bright)" : "transparent",
                border: active || done ? "none" : "1px solid var(--vault-border-strong)",
              }}
            >
              {done ? "✓" : n}
            </span>
            <span className="text-[12px] font-medium" style={{ color: active ? "var(--vault-text)" : "var(--vault-text-faint)" }}>
              {label}
            </span>
            {n < 3 && <span aria-hidden style={{ width: 18, height: 1, background: "var(--vault-border)" }} />}
          </li>
        );
      })}
    </ol>
  );
}

function BigChoice({
  title, sub, glyph, onClick,
}: { title: string; sub: string; glyph?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-4 w-full text-left rounded-[14px] px-5 py-4 transition-colors"
      style={{ background: "var(--gtp-card)", border: "1px solid var(--vault-border)" }}
    >
      {glyph && <span aria-hidden style={{ fontSize: 26 }}>{glyph}</span>}
      <span className="flex flex-col min-w-0">
        <span className="font-display" style={{ fontSize: 17, fontWeight: 600, color: "var(--vault-text)" }}>{title}</span>
        <span className="text-[12.5px]" style={{ color: "var(--vault-text-mute)" }}>{sub}</span>
      </span>
      <span aria-hidden className="ml-auto" style={{ color: "var(--vault-gold-bright)", fontSize: 18 }}>→</span>
    </button>
  );
}

export default function GuidedHome({
  slips,
  slateDate,
  isFallback,
  calibrationTable,
}: {
  slips: ParlaySlip[];
  slateDate: string;
  isFallback: boolean;
  calibrationTable: CalibrationTable;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [sport, setSport] = useState<SportKey | null>(null);
  const [comfort, setComfort] = useState<Comfort | null>(null);

  const matches = useMemo(() => {
    if (!sport || !comfort) return [];
    const seen = new Set<string>();
    return slips.filter((s) => {
      if (seen.has(s.slipId)) return false;
      if (!slipMatchesSport(s, sport)) return false;
      if (slipComfort(s) !== comfort) return false;
      seen.add(s.slipId);
      return true;
    });
  }, [slips, sport, comfort]);

  const sportLabel = SPORTS.find((s) => s.key === sport)?.label ?? "";
  const comfortLabel = COMFORTS.find((c) => c.key === comfort)?.label ?? "";

  return (
    <div className="mx-auto max-w-xl px-4 py-6 sm:py-10 flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <span className="font-mono uppercase tracking-[0.18em]" style={{ color: "var(--vault-gold)", fontSize: 11 }}>
          Find a card in 3 steps
        </span>
        <h1 className="font-display tracking-tight" style={{ fontSize: "clamp(24px, 6vw, 34px)", lineHeight: 1.05, color: "var(--vault-text)" }}>
          New here? Let&apos;s find your card.
        </h1>
        <p className="text-[13px]" style={{ color: "var(--vault-text-mute)" }}>
          We&apos;ll walk you through it — no betting knowledge needed. Educational, paper-only.
        </p>
      </div>

      <Stepper step={step} />

      {step === 1 && (
        <section className="flex flex-col gap-3" aria-label="Step 1 — sport">
          <h2 className="text-[15px] font-semibold" style={{ color: "var(--vault-text)" }}>1 · Which sport?</h2>
          {SPORTS.map((s) => (
            <BigChoice key={s.key} title={s.label} sub={s.blurb} glyph={s.glyph}
              onClick={() => { setSport(s.key); setStep(2); }} />
          ))}
        </section>
      )}

      {step === 2 && (
        <section className="flex flex-col gap-3" aria-label="Step 2 — comfort">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold" style={{ color: "var(--vault-text)" }}>2 · How much risk?</h2>
            <button type="button" onClick={() => setStep(1)} className="text-[12px]" style={{ color: "var(--vault-text-mute)" }}>← back</button>
          </div>
          {COMFORTS.map((c) => (
            <BigChoice key={c.key} title={`${c.label} · ${c.range}`} sub={c.blurb}
              onClick={() => { setComfort(c.key); setStep(3); }} />
          ))}
        </section>
      )}

      {step === 3 && (
        <section className="flex flex-col gap-4" aria-label="Step 3 — your cards">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-[15px] font-semibold" style={{ color: "var(--vault-text)" }}>
              3 · {sportLabel} · {comfortLabel}
            </h2>
            <button type="button" onClick={() => { setStep(1); setSport(null); setComfort(null); }}
              className="text-[12px]" style={{ color: "var(--vault-gold-bright)" }}>start over</button>
          </div>
          <p className="text-[12.5px]" style={{ color: "var(--vault-text-mute)" }}>
            {matches.length > 0
              ? `${matches.length} model ${matches.length === 1 ? "slip" : "slips"} from the ${slateDate}${isFallback ? " (latest)" : ""} slate match. Each is saved before games and graded after.`
              : `No ${comfortLabel.toLowerCase()} ${sportLabel} slips on this slate. Try a different comfort level or sport — that's an honest gap, not a hidden pick.`}
          </p>

          {matches.length === 0 ? (
            <div className="flex gap-2">
              <button type="button" onClick={() => setStep(2)} className="px-4 py-2 rounded-full text-[12px]" style={{ border: "1px solid var(--vault-border-strong)", color: "var(--vault-text)" }}>← change comfort</button>
              <button type="button" onClick={() => { setStep(1); setSport(null); setComfort(null); }} className="px-4 py-2 rounded-full text-[12px]" style={{ border: "1px solid var(--vault-border-strong)", color: "var(--vault-text)" }}>change sport</button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {matches.slice(0, 6).map((slip) => (
                <ParlayTicketCard key={slip.slipId} slip={slip} emphasis="alternate"
                  savedPregame={!isFallback} calibrationTable={calibrationTable} />
              ))}
            </div>
          )}

          <div className="mt-2 rounded-[14px] px-4 py-4 flex flex-col gap-2" style={{ background: "var(--gtp-card)", border: "1px solid var(--vault-border)" }}>
            <span className="text-[13px] font-semibold" style={{ color: "var(--vault-text)" }}>What next?</span>
            <div className="flex flex-wrap gap-2">
              <Link href="/parlay-lab/" className="px-4 py-2 rounded-full text-[12px]" style={{ background: "var(--vault-gold-bright)", color: "var(--vault-bg)" }}>Build my own card →</Link>
              <Link href="/bank-builder/" className="px-4 py-2 rounded-full text-[12px]" style={{ border: "1px solid var(--vault-border-strong)", color: "var(--vault-text)" }}>Try the paper bankroll →</Link>
              <Link href="/results/" className="px-4 py-2 rounded-full text-[12px]" style={{ border: "1px solid var(--vault-border-strong)", color: "var(--vault-text)" }}>See the track record →</Link>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
