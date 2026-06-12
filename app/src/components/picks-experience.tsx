"use client";
/**
 * PicksExperience — the unified suggested-card lobby. Filters by sport (All / Mixed / World Cup /
 * MLB / NBA / UFC) and risk (All / Low / Medium / High / Longshot), plus a Bank-Builder-eligible
 * toggle. Renders the shared SuggestedCard. Honest empty states explain why a tab has no cards.
 */
import { useMemo, useState } from "react";
import type { PublicSuggestedCard } from "@/lib/normalize";
import SuggestedCard from "@/components/ui/suggested-card";
import { getSportIdentity } from "@/lib/sport-identity";

const SPORTS = [
  { key: "all", label: "All", icon: "" },
  { key: "mixed", label: "Mixed", icon: getSportIdentity("mixed").icon },
  { key: "world_cup", label: "World Cup", icon: getSportIdentity("world_cup").icon },
  { key: "mlb", label: "MLB", icon: getSportIdentity("mlb").icon },
  { key: "nba", label: "NBA", icon: getSportIdentity("nba").icon },
  { key: "ufc", label: "UFC", icon: getSportIdentity("ufc").icon },
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

  // Summary matrix: rows (All/Mixed/World Cup/MLB/NBA/UFC) × cols (Low/Medium/High/Longshot).
  const MATRIX_ROWS: Array<{ key: string; label: string; icon?: string }> = [
    { key: "all", label: "All" },
    { key: "mixed", label: "Mixed", icon: getSportIdentity("mixed").icon },
    { key: "world_cup", label: "World Cup", icon: getSportIdentity("world_cup").icon },
    { key: "mlb", label: "MLB", icon: getSportIdentity("mlb").icon },
    { key: "nba", label: "NBA", icon: getSportIdentity("nba").icon },
    { key: "ufc", label: "UFC", icon: getSportIdentity("ufc").icon },
  ];
  const MATRIX_COLS = ["Low", "Medium", "High", "Longshot"];
  const matchRow = (c: PublicSuggestedCard, key: string) =>
    key === "all" ? true : key === "mixed" ? c.cardType === "mixed_sport"
      : c.cardType !== "mixed_sport" && c.sports.includes(key as PublicSuggestedCard["sports"][number]);
  const cellCount = (rowKey: string, col: string) =>
    cards.filter((c) => matchRow(c, rowKey) && c.riskTier === col).length;
  const rowTotal = (rowKey: string) => cards.filter((c) => matchRow(c, rowKey)).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {SPORTS.map((s) => (
          <Pill key={s.key} on={sport === s.key} onClick={() => setSport(s.key)}>
            {s.icon ? <span aria-hidden style={{ marginRight: 5, fontSize: 11 }}>{s.icon}</span> : null}
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
        <span className="self-center font-mono text-[10px]" style={{ color: "var(--vault-text-faint)" }}>
          = clears the ladder gates: real odds, model + market support, low correlation
        </span>
      </div>

      {/* Sport/risk matrix — demoted below the filter chips and collapsed by
          default (v4 simplification): filters are the primary control; the
          matrix is the power-user overview. */}
      <details className="rounded-[10px]" style={{ border: "1px solid var(--vault-rule)" }}>
        <summary className="cursor-pointer px-3 py-2 text-[12px] font-semibold" style={{ color: "var(--vault-text-mute)" }}>
          Card counts by sport × risk
        </summary>
      <div className="rounded-[10px] overflow-x-auto" style={{ background: "rgba(7,11,26,0.55)", border: "1px solid var(--vault-border)" }}>
        <table className="w-full min-w-[440px]" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th className="text-left px-3 py-2 font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9, fontWeight: 600 }}>Suggested cards</th>
              {MATRIX_COLS.map((col) => (
                <th key={col} className="px-2 py-2">
                  <button type="button" onClick={() => { setSport("all"); setRisk(col); setBankOnly(false); }}
                    className="font-mono uppercase tracking-[0.08em] w-full" style={{ color: risk === col && sport === "all" ? "var(--vault-gold-bright)" : "var(--vault-text-mute)", fontSize: 9.5, fontWeight: 600 }}>
                    {col}
                  </button>
                </th>
              ))}
              <th className="px-2 py-2 font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>All</th>
            </tr>
          </thead>
          <tbody>
            {MATRIX_ROWS.map((row) => {
              const total = rowTotal(row.key);
              return (
                <tr key={row.key} style={{ borderTop: "1px solid var(--vault-rule)" }}>
                  <td className="px-3 py-1.5">
                    <button type="button" onClick={() => { setSport(row.key); setRisk("All"); setBankOnly(false); }}
                      className="text-left" style={{ color: sport === row.key ? "var(--vault-gold-bright)" : "var(--vault-text)", fontSize: 12, fontWeight: 600 }}>
                      {row.icon ? <span aria-hidden style={{ marginRight: 5, fontSize: 11 }}>{row.icon}</span> : null}
                      {row.label}
                    </button>
                  </td>
                  {MATRIX_COLS.map((col) => {
                    const n = cellCount(row.key, col);
                    const on = sport === row.key && risk === col;
                    return (
                      <td key={col} className="px-1 py-1 text-center">
                        <button type="button" disabled={n === 0} onClick={() => { setSport(row.key); setRisk(col); setBankOnly(false); }}
                          className="w-full rounded-[5px] py-1 transition-colors tabular font-mono"
                          style={{
                            background: on ? "var(--vault-gold-dim)" : n > 0 ? "rgba(255,255,255,0.03)" : "transparent",
                            border: `1px solid ${on ? "var(--vault-gold-bright)" : "transparent"}`,
                            color: n === 0 ? "var(--vault-text-faint)" : on ? "var(--vault-gold-bright)" : "var(--vault-text)",
                            fontSize: 13, fontWeight: n > 0 ? 700 : 400, cursor: n === 0 ? "default" : "pointer",
                          }}>
                          {n === 0 ? "·" : n}
                        </button>
                      </td>
                    );
                  })}
                  <td className="px-2 py-1 text-center font-mono tabular" style={{ color: "var(--vault-text-mute)", fontSize: 12 }}>{total || "·"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </details>


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
