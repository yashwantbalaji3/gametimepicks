/**
 * SpecialsHistorySection — durable "Past slates" history for World Cup Specials.
 * Reads the append-only history (loadWorldCupSpecialsHistory) and renders prior days as collapsible
 * rows of compact cards (odds + per-card result). Suggested cards only — no exposure, separate record.
 * Honest: shows days as archived (no fabricated outcomes); a card with no settled result shows "—".
 */
import type { SpecialsHistoryDay } from "@/lib/world-cup/world-cup-specials";

const fmtDate = (d: string) => {
  try { return new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }); }
  catch { return d; }
};
const odds = (o: number | null) => (o == null ? "—" : o > 0 ? `+${o}` : `${o}`);

function resultPill(result: string | null) {
  const map: Record<string, { label: string; color: string }> = {
    won: { label: "Won", color: "var(--vault-success)" },
    lost: { label: "Lost", color: "var(--gtp-bank-heat)" },
    void: { label: "Void", color: "var(--vault-text-faint)" },
  };
  const m = result ? map[result] : null;
  const label = m?.label ?? "Archived";
  const color = m?.color ?? "var(--vault-text-faint)";
  return (
    <span className="rounded-full px-1.5 py-0.5 font-mono uppercase tracking-[0.08em]" style={{ fontSize: 8.5, color, background: "rgba(255,255,255,0.04)", border: `1px solid color-mix(in srgb, ${color} 35%, transparent)` }}>
      {label}
    </span>
  );
}

export default function SpecialsHistorySection({ days }: { days: SpecialsHistoryDay[] }) {
  if (!days.length) return null;
  return (
    <section aria-label="Specials past slates" className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 700 }}>Past slates</h2>
        <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>{days.length} archived · $0 exposure</span>
      </div>
      {days.map((day) => {
        const settled = day.cards.filter((c) => c.result === "won" || c.result === "lost");
        const won = day.cards.filter((c) => c.result === "won").length;
        const summary = settled.length ? `${won}-${settled.length - won} settled` : "archived candidates";
        return (
          <details key={day.date} className="rounded-[10px]" style={{ background: "rgba(12,8,6,0.4)", border: "1px solid var(--vault-rule)" }}>
            <summary className="cursor-pointer list-none px-3 py-2.5 flex items-center justify-between gap-2">
              <span className="font-semibold" style={{ color: "var(--vault-text)", fontSize: 12.5 }}>{fmtDate(day.date)}</span>
              <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>{day.cardCount} cards · {summary}</span>
            </summary>
            <div className="px-3 pb-3 flex flex-col gap-1.5">
              {day.cards.map((c) => (
                <div key={c.id ?? c.title} className="flex items-center justify-between gap-2 rounded-[8px] px-2.5 py-1.5" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--vault-rule)" }}>
                  <span className="truncate" style={{ color: "var(--vault-text-mute)", fontSize: 11 }}>{c.title} · {c.legCount} legs</span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="font-mono tabular" style={{ color: "var(--vault-text)", fontSize: 11 }}>{odds(c.combinedOdds)}</span>
                    {resultPill(c.result)}
                  </span>
                </div>
              ))}
            </div>
          </details>
        );
      })}
    </section>
  );
}
