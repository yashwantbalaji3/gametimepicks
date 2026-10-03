/**
 * RESULTS V2 · SUGGESTED PARLAYS PUBLISHED THIS DAY (Session 9 overnight · F2). The frozen ladder cards with the
 * lab's settled grades (lib/results/v2/suggested-history.mjs). Server component; nothing recomputed. A card with
 * no settled receipt is "Pending" — never a loss; a tier with no card shows the ladder's own reason.
 */
import { suggestedCardsFor } from "@/lib/results/v2/suggested-history.mjs";

const WORD: Record<string, string> = { won: "Won", lost: "Lost", push: "Push", void: "Void", pending: "Pending" };
const american = (n: number | null) => (n == null ? "—" : n > 0 ? `+${n}` : String(n));

export default function SuggestedReceipts({ date }: { date: string }) {
  const day = suggestedCardsFor(date);
  if (!day) return null;
  return (
    <section aria-labelledby="suggested-receipts-h" className="mt-10 flex flex-col gap-3">
      <div>
        <h2 id="suggested-receipts-h" className="m-0 font-display text-[22px]" style={{ color: "var(--vault-text)" }}>Suggested Parlays published this day</h2>
        <p className="m-0 mt-1 text-[12.5px] leading-snug" style={{ color: "var(--vault-text-mute)", maxWidth: 720 }}>
          The MLB cards as published (one per risk level), each graded from the lab&rsquo;s settled receipt — the same cards the
          published record counts. A card not yet settled is pending, never a loss. Paper-only.
        </p>
      </div>
      <ul className="m-0 p-0 list-none grid grid-cols-1 lg:grid-cols-2 gap-3">
        {day.cards.map((c, i) => (
          <li key={`${c.tier}-${i}`} className="rounded-xl p-4" style={{ background: "var(--vault-panel)", border: "1px solid var(--vault-border-strong)" }}>
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
              <h3 className="m-0 text-[15px] font-semibold" style={{ color: "var(--vault-text)" }}>{c.tierLabel} · {american(c.combinedAmerican)}</h3>
              <span className="font-mono text-[12px] uppercase tracking-[0.06em]" style={{ color: c.result === "won" ? "var(--vault-text)" : "var(--vault-text-mute)" }}>{WORD[c.result] ?? c.result}</span>
            </div>
            <table className="gtp-day-table">
              <thead><tr><th scope="col">Leg</th><th scope="col">Price</th><th scope="col" className="r">Grade</th></tr></thead>
              <tbody>
                {c.legs.map((g, j) => (
                  <tr key={j}>
                    <td>{g.player ?? "—"}{g.team ? <span className="m"> · {g.team}</span> : null}<span className="m"> · {g.market ?? "—"} {g.side ?? ""} {g.line ?? ""}</span></td>
                    <td>{american(g.odds)}</td>
                    <td className="r"><span className={g.result === "won" ? "o w" : "o"}>{WORD[g.result] ?? g.result}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </li>
        ))}
        {day.skipped.map((s) => (
          <li key={`skip-${s.tier}`} className="rounded-xl p-4" style={{ border: "1px solid var(--vault-border)" }}>
            <h3 className="m-0 text-[15px] font-semibold" style={{ color: "var(--vault-text)" }}>{s.tierLabel}</h3>
            <p className="m-0 mt-1 text-[12.5px] leading-snug" style={{ color: "var(--vault-text-mute)" }}>No card was published{s.reason ? ` — ${s.reason}` : ""}.</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
