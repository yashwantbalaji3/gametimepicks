"use client";
/**
 * TodaysParlays — filterable suggested-parlay grid for Today/Home. Sport + variance chips over the
 * day's real cards (World Cup + MLB + mixed). Cards are pre-built, odds-backed, paper-only; this is
 * a presentation filter only (no fabrication). Each card's legs carry portraits via SuggestedCard.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import SuggestedCard from "@/components/ui/suggested-card";
import SectionHeader from "@/components/section-header";
import type { PublicSuggestedCard } from "@/lib/normalize";

type SportKey = "all" | "world_cup" | "mlb" | "mixed";
type Variance = "all" | "low" | "balanced" | "higher";

const SPORTS: Array<{ key: SportKey; label: string }> = [
  { key: "all", label: "All" },
  { key: "mlb", label: "MLB" },
  { key: "mixed", label: "Mixed" },
];
const VARIANCE: Array<{ key: Variance; label: string }> = [
  { key: "all", label: "All" },
  { key: "low", label: "Low Risk" },
  { key: "balanced", label: "Medium Risk" },
  { key: "higher", label: "High Risk" },
];

function isMixed(c: PublicSuggestedCard): boolean {
  return c.cardType === "mixed_sport" || (c.sports?.length ?? 0) > 1;
}
function matchSport(c: PublicSuggestedCard, k: SportKey): boolean {
  if (k === "all") return true;
  if (k === "mixed") return isMixed(c);
  return !isMixed(c) && (c.sports ?? []).includes(k);
}
function matchVariance(c: PublicSuggestedCard, v: Variance): boolean {
  if (v === "all") return true;
  const t = (c.riskTier ?? "").toLowerCase();
  if (v === "low") return t === "low";
  if (v === "balanced") return t === "medium";
  return t === "high" || t === "longshot";
}

function Chip({ active, label, count, onClick }: { active: boolean; label: string; count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={count === 0 && !active}
      className="vault-press rounded-full px-3 py-1.5 font-mono uppercase tracking-[0.1em]"
      style={{
        fontSize: 10.5, fontWeight: 700, cursor: count === 0 && !active ? "not-allowed" : "pointer",
        border: `1px solid ${active ? "var(--gtp-bank-heat)" : "var(--vault-border)"}`,
        color: active ? "#1A0E06" : count === 0 ? "var(--vault-text-faint)" : "var(--vault-text)",
        background: active ? "var(--gtp-bank-heat)" : "rgba(26,16,11,0.5)",
        opacity: count === 0 && !active ? 0.4 : 1,
      }}
    >
      {label}{count > 0 ? <span style={{ opacity: 0.7 }}> · {count}</span> : null}
    </button>
  );
}

export default function TodaysParlays({ cards, dateLabel }: { cards: PublicSuggestedCard[]; dateLabel: string }) {
  const [sport, setSport] = useState<SportKey>("all");
  const [variance, setVariance] = useState<Variance>("all");

  const filtered = useMemo(
    () => cards.filter((c) => matchSport(c, sport) && matchVariance(c, variance)),
    [cards, sport, variance],
  );

  if (cards.length === 0) return null;

  return (
    <section aria-label="Today's suggested parlays">
      <SectionHeader
        eyebrow={`Suggested parlays · ${dateLabel}`}
        title="Today's suggested cards"
        sub="Odds-backed paper cards across today's slate. Filter by sport or variance; enter any stake for the projected return."
      />
      <div className="mb-3 flex flex-col gap-2">
        <div className="flex flex-wrap gap-1.5">
          {SPORTS.map((s) => (
            <Chip key={s.key} active={sport === s.key} label={s.label}
              count={cards.filter((c) => matchSport(c, s.key)).length} onClick={() => setSport(s.key)} />
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {VARIANCE.map((v) => (
            <Chip key={v.key} active={variance === v.key} label={v.label}
              count={cards.filter((c) => matchSport(c, sport) && matchVariance(c, v.key)).length} onClick={() => setVariance(v.key)} />
          ))}
        </div>
      </div>

      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.map((c) => <SuggestedCard key={c.id} card={c} />)}
        </div>
      ) : (
        <p className="font-mono text-[12px]" style={{ color: "var(--vault-text-faint)" }}>
          No cards match this filter today. <button type="button" onClick={() => { setSport("all"); setVariance("all"); }} style={{ color: "var(--vault-gold-bright)", textDecoration: "underline" }}>Reset</button>
        </p>
      )}

      <div className="mt-3">
        <Link href="/picks" className="font-mono uppercase tracking-[0.16em]" style={{ color: "var(--vault-gold-bright)", fontSize: 11 }}>
          All suggested parlays in Parlay Lab →
        </Link>
      </div>
    </section>
  );
}
