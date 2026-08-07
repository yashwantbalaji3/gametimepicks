"use client";

/**
 * GuidedStart — an ADDITIVE "New here? Find a card in 3 steps" module.
 *
 * Helps a first-time visitor understand what to click without replacing the
 * full ParlayLabBuilder or Build My Card. A compact, collapsible dashboard
 * module: pick a sport → pick a game → pick a comfort level → review the
 * real matching model cards, then continue to Parlay Lab / Bank Builder.
 *
 * No data/logic of its own beyond composition: it filters the SAME slips
 * Parlay Lab uses, via the SAME shared helpers
 * (filterSlipsBySportTeamPlayer, getAvailableGamesFromSlips,
 * combinedAmericanOddsFromLegs + classifyOddsSection), so options only show
 * what truly exists and counts are honest. Empty states explain the next
 * best action; nothing is fabricated.
 */
import { useMemo, useState } from "react";
import Link from "next/link";

import type { ParlaySlip, SuggestedSport } from "@/lib/parlay-suggested";
import {
  filterSlipsBySportTeamPlayer,
  getAvailableGamesFromSlips,
} from "@/lib/parlay-suggested";
import type { RiskSectionKey } from "@/lib/parlay-risk-sections";
import {
  combinedAmericanOddsFromLegs,
  classifyOddsSection,
} from "@/lib/parlay-risk-sections";
import type { CalibrationTable } from "@/lib/confidence-calibration";
import ParlayTicketCard from "@/components/parlay-ticket-card";

const SPORT_ORDER: SuggestedSport[] = ["all", "nba", "mlb", "multi"];
const SPORT_META: Record<SuggestedSport, { label: string; glyph: string }> = {
  all: { label: "Any sport", glyph: "🎯" },
  nba: { label: "NBA", glyph: "🏀" },
  mlb: { label: "MLB", glyph: "⚾" },
  multi: { label: "Mixed", glyph: "🔀" },
};

const COMFORTS: Array<{ key: RiskSectionKey; label: string; range: string; blurb: string }> = [
  { key: "low", label: "Steadier", range: "under +300", blurb: "Steadiest model picks, lower variance." },
  { key: "medium", label: "Balanced", range: "+300 to +599", blurb: "A bit more upside for a bit more risk." },
  { key: "high", label: "Bolder", range: "+600 to +999", blurb: "Higher payout, higher variance — labelled." },
  { key: "longshot", label: "Longshot", range: "+1000 and up", blurb: "Lottery-style — most miss. Have fun, stay honest." },
];

function comfortOf(slip: ParlaySlip): RiskSectionKey | null {
  return classifyOddsSection(combinedAmericanOddsFromLegs(slip.legs ?? []));
}

function Choice({
  title, sub, glyph, count, onClick,
}: { title: string; sub?: string; glyph?: string; count?: number; onClick: () => void }) {
  const dim = count === 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 w-full text-left rounded-[8px] px-4 py-3 transition-colors"
      style={{
        background: "var(--gtp-card-elevated)",
        border: "1px solid var(--vault-border)",
        opacity: dim ? 0.6 : 1,
      }}
    >
      {glyph && <span aria-hidden style={{ fontSize: 20 }}>{glyph}</span>}
      <span className="flex flex-col min-w-0">
        <span className="font-display" style={{ fontSize: 14.5, fontWeight: 600, color: "var(--vault-text)" }}>{title}</span>
        {sub && <span className="text-[11.5px]" style={{ color: "var(--vault-text-mute)" }}>{sub}</span>}
      </span>
      {typeof count === "number" && (
        <span className="ml-auto font-mono" style={{ color: dim ? "var(--vault-text-faint)" : "var(--vault-gold-bright)", fontSize: 11 }}>
          {count}
        </span>
      )}
      {typeof count !== "number" && <span aria-hidden className="ml-auto" style={{ color: "var(--vault-gold-bright)" }}>→</span>}
    </button>
  );
}

function Crumb({ step }: { step: 1 | 2 | 3 | 4 }) {
  const labels = ["Sport", "Game", "Comfort", "Cards"];
  return (
    <ol className="flex items-center gap-1.5 flex-wrap" aria-label="Progress">
      {labels.map((label, i) => {
        const n = (i + 1) as 1 | 2 | 3 | 4;
        const on = n <= step;
        return (
          <li key={label} className="flex items-center gap-1.5">
            <span className="inline-flex items-center justify-center rounded-full font-mono"
              style={{ width: 18, height: 18, fontSize: 10,
                color: on ? "var(--vault-bg)" : "var(--vault-text-mute)",
                background: on ? "var(--vault-gold-bright)" : "transparent",
                border: on ? "none" : "1px solid var(--vault-border-strong)" }}>
              {n < step ? "✓" : n}
            </span>
            <span className="text-[11px]" style={{ color: n === step ? "var(--vault-text)" : "var(--vault-text-faint)" }}>{label}</span>
            {n < 4 && <span aria-hidden style={{ width: 12, height: 1, background: "var(--vault-border)" }} />}
          </li>
        );
      })}
    </ol>
  );
}

export default function GuidedStart({
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
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [sport, setSport] = useState<SuggestedSport | null>(null);
  const [gameKey, setGameKey] = useState<string | null>(null); // null = all games
  const [comfort, setComfort] = useState<RiskSectionKey | null>(null);

  const availableSports = useMemo(
    () => SPORT_ORDER.filter((s) => filterSlipsBySportTeamPlayer(slips, { sport: s }).length > 0),
    [slips],
  );
  const games = useMemo(
    () => (sport ? getAvailableGamesFromSlips(slips, sport) : []),
    [slips, sport],
  );
  const sportGameSlips = useMemo(
    () => (sport ? filterSlipsBySportTeamPlayer(slips, { sport, gameKey: gameKey ?? null }) : []),
    [slips, sport, gameKey],
  );
  const comfortCounts = useMemo(() => {
    const m: Record<RiskSectionKey, number> = { low: 0, medium: 0, high: 0, longshot: 0 };
    for (const s of sportGameSlips) { const c = comfortOf(s); if (c) m[c] += 1; }
    return m;
  }, [sportGameSlips]);
  const matches = useMemo(() => {
    if (!comfort) return [];
    const seen = new Set<string>();
    return sportGameSlips.filter((s) => {
      if (seen.has(s.slipId)) return false;
      if (comfortOf(s) !== comfort) return false;
      seen.add(s.slipId);
      return true;
    });
  }, [sportGameSlips, comfort]);

  const reset = () => { setStep(1); setSport(null); setGameKey(null); setComfort(null); };
  const sportLabel = sport ? SPORT_META[sport].label : "";
  const gameLabel = gameKey ? (games.find((g) => g.key === gameKey)?.label ?? "this game") : "All games";
  const comfortLabel = comfort ? COMFORTS.find((c) => c.key === comfort)!.label : "";

  return (
    <section className="flex flex-col rounded-[8px] overflow-hidden"
      style={{ background: "var(--gtp-card)", border: "1px solid var(--vault-border-strong)" }}>
      <header className="flex items-center justify-between gap-3 px-3.5 py-2.5"
        style={{ borderBottom: open ? "1px solid var(--vault-rule)" : "none", background: "rgba(26, 16, 11,0.5)" }}>
        <span className="font-mono uppercase tracking-[0.16em]" style={{ color: "var(--vault-gold-bright)", fontSize: 10.5 }}>
          New here? Find a card in 3 steps
        </span>
        <button type="button" onClick={() => { setOpen((o) => !o); if (open) reset(); }}
          className="font-mono uppercase tracking-[0.12em] px-3 py-1 rounded-full"
          style={{ fontSize: 10, color: open ? "var(--vault-text-mute)" : "var(--vault-bg)",
            background: open ? "transparent" : "var(--vault-gold-bright)",
            border: open ? "1px solid var(--vault-border-strong)" : "none" }}>
          {open ? "hide" : "Start →"}
        </button>
      </header>

      {!open ? (
        <p className="px-3.5 py-3 text-[12.5px] leading-snug" style={{ color: "var(--vault-text-mute)" }}>
          No betting knowledge needed — we&apos;ll walk you to a model card in three quick picks
          (sport → game → comfort), then you can build your own. Educational, paper-only.
        </p>
      ) : slips.length === 0 || availableSports.length === 0 ? (
        <div className="px-3.5 py-4 flex flex-col gap-2">
          <p className="text-[12.5px]" style={{ color: "var(--vault-text-mute)" }}>
            No suggested slips are posted yet — we only show slips saved before games start. The next
            pregame snapshot lands once tonight&apos;s lines and projections are ready.
          </p>
          <Link href="/mlb/board/" className="self-start font-mono uppercase tracking-[0.12em] text-[11px]" style={{ color: "var(--vault-gold-bright)" }}>
            Browse projections →
          </Link>
        </div>
      ) : (
        <div className="px-3.5 py-3 flex flex-col gap-3">
          <Crumb step={step} />

          {step === 1 && (
            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-semibold" style={{ color: "var(--vault-text)" }}>1 · Which sport?</span>
              {availableSports.map((s) => (
                <Choice key={s} title={SPORT_META[s].label} glyph={SPORT_META[s].glyph}
                  onClick={() => { setSport(s); setGameKey(null); setStep(2); }} />
              ))}
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold" style={{ color: "var(--vault-text)" }}>2 · Which game?</span>
                <button type="button" onClick={() => setStep(1)} className="text-[11px]" style={{ color: "var(--vault-text-mute)" }}>← back</button>
              </div>
              <Choice title="All games" sub={`Every ${sportLabel.toLowerCase()} slip on the slate`}
                onClick={() => { setGameKey(null); setStep(3); }} />
              {games.map((g) => (
                <Choice key={g.key} title={g.label}
                  onClick={() => { setGameKey(g.key); setStep(3); }} />
              ))}
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold" style={{ color: "var(--vault-text)" }}>3 · How much risk?</span>
                <button type="button" onClick={() => setStep(2)} className="text-[11px]" style={{ color: "var(--vault-text-mute)" }}>← back</button>
              </div>
              {COMFORTS.map((c) => (
                <Choice key={c.key} title={`${c.label} · ${c.range}`} sub={c.blurb} count={comfortCounts[c.key]}
                  onClick={() => { setComfort(c.key); setStep(4); }} />
              ))}
            </div>
          )}

          {step === 4 && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-[13px] font-semibold" style={{ color: "var(--vault-text)" }}>
                  {sportLabel} · {gameLabel} · {comfortLabel}
                </span>
                <div className="flex gap-3">
                  <button type="button" onClick={() => setStep(3)} className="text-[11px]" style={{ color: "var(--vault-text-mute)" }}>← back</button>
                  <button type="button" onClick={reset} className="text-[11px]" style={{ color: "var(--vault-gold-bright)" }}>start over</button>
                </div>
              </div>

              {matches.length === 0 ? (
                <p className="text-[12.5px] leading-snug" style={{ color: "var(--vault-text-mute)" }}>
                  No {comfortLabel.toLowerCase()} {sportLabel.toLowerCase()} slips for {gameLabel.toLowerCase()} on the{" "}
                  {slateDate}{isFallback ? " (latest)" : ""} slate — that&apos;s an honest gap, not a hidden pick. Try a different
                  comfort level or game.
                </p>
              ) : (
                <>
                  <p className="text-[12px]" style={{ color: "var(--vault-text-mute)" }}>
                    {matches.length} model {matches.length === 1 ? "slip" : "slips"} match — saved before games, graded after.
                  </p>
                  <div className="flex flex-col gap-3">
                    {matches.slice(0, 4).map((slip) => (
                      <ParlayTicketCard key={slip.slipId} slip={slip} emphasis="alternate"
                        savedPregame={!isFallback} calibrationTable={calibrationTable} />
                    ))}
                  </div>
                  {matches.length > 4 && (
                    <span className="text-[11px]" style={{ color: "var(--vault-text-faint)" }}>
                      +{matches.length - 4} more — see them all in Parlay Lab.
                    </span>
                  )}
                </>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                <Link href="/build/" className="px-3.5 py-2 rounded-full text-[11.5px]" style={{ background: "var(--vault-gold-bright)", color: "var(--vault-bg)" }}>
                  Build your own in Parlay Lab →
                </Link>
                <Link href="/bank-builder/" className="px-3.5 py-2 rounded-full text-[11.5px]" style={{ border: "1px solid var(--vault-border-strong)", color: "var(--vault-text)" }}>
                  Try the paper bankroll →
                </Link>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
