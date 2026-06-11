"use client";
/**
 * PicksExperience — the unified suggested-card lobby. Filters by sport (All / Mixed / World Cup /
 * MLB / NBA / UFC) and risk (All / Low / Medium / High / Longshot), plus a Bank-Builder-eligible
 * toggle. Renders the shared SuggestedCard. Honest empty states explain why a tab has no cards.
 */
import { useMemo, useState } from "react";
import type { PublicSuggestedCard } from "@/lib/normalize";
import SuggestedCard from "@/components/ui/suggested-card";

const SPORTS = [
  { key: "all", label: "All" },
  { key: "mixed", label: "Mixed" },
  { key: "world_cup", label: "World Cup" },
  { key: "mlb", label: "MLB" },
  { key: "nba", label: "NBA" },
  { key: "ufc", label: "UFC" },
] as const;
const RISKS = ["All", "Low", "Medium", "High", "Longshot"] as const;

function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full px-3.5 py-1.5 transition-colors shrink-0"
      style={{
        background: on ? "var(--vault-gold-dim)" : "transparent",
        border: `1px solid ${on ? "var(--vault-gold-bright)" : "var(--vault-rule)"}`,
        color: on ? "var(--vault-gold-bright)" : "var(--vault-text-mute)",
        fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

export default function PicksExperience({ cards }: { cards: PublicSuggestedCard[] }) {
  const [sport, setSport] = useState<string>("all");
  const [risk, setRisk] = useState<string>("All");
  const [bankOnly, setBankOnly] = useState(false);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const card of cards) {
      c[card.cardType === "mixed_sport" ? "mixed" : card.sports[0]] =
        (c[card.cardType === "mixed_sport" ? "mixed" : card.sports[0]] ?? 0) + 1;
    }
    return c;
  }, [cards]);

  const filtered = useMemo(
    () =>
      cards.filter((c) => {
        if (bankOnly && !c.bankBuilderEligible) return false;
        if (risk !== "All" && c.riskTier !== risk) return false;
        if (sport === "all") return true;
        if (sport === "mixed") return c.cardType === "mixed_sport";
        return c.sports.includes(sport as PublicSuggestedCard["sports"][number]);
      }),
    [cards, sport, risk, bankOnly],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {SPORTS.map((s) => (
          <Pill key={s.key} on={sport === s.key} onClick={() => setSport(s.key)}>
            {s.label}
            {s.key !== "all" && counts[s.key] ? (
              <span className="ml-1.5 font-mono" style={{ fontSize: 10, opacity: 0.8 }}>{counts[s.key]}</span>
            ) : null}
          </Pill>
        ))}
      </div>
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {RISKS.map((r) => (
          <Pill key={r} on={risk === r} onClick={() => setRisk(r)}>{r}</Pill>
        ))}
        <span className="mx-1" style={{ color: "var(--vault-rule)" }}>|</span>
        <Pill on={bankOnly} onClick={() => setBankOnly((b) => !b)}>Bank Builder eligible</Pill>
      </div>

      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((c) => (
            <SuggestedCard key={c.id} card={c} />
          ))}
        </div>
      ) : (
        <div className="rounded-[10px] px-4 py-8 text-center" style={{ background: "rgba(7,11,26,0.55)", border: "1px solid var(--vault-border)" }}>
          <p style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 600 }}>No cards for this filter</p>
          <p className="mt-1" style={{ color: "var(--vault-text-mute)", fontSize: 12 }}>
            {bankOnly
              ? "No card currently qualifies for the Bank Builder ladder — see Bank Builder for the pending reason."
              : sport === "mixed"
                ? "No mixed-sport cards today — they appear when eligible legs exist across two or more sports."
                : "Nothing cleared the suggested-card gates for this combination today. Cards publish only from real, eligible projections — never padded."}
          </p>
        </div>
      )}
      <p style={{ color: "var(--vault-text-faint)", fontSize: 10.5 }}>
        Educational / paper only — not betting advice. Cards come from real, eligible model
        projections; enter any stake on a card to see the projected paper return.
      </p>
    </div>
  );
}
