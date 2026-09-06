import type { LifecycleCard, LifecyclePosition } from "@/lib/products/lifecycle-view";
import { cardSummary } from "@/lib/products/lifecycle-view";

const OUTCOME: Record<string, { label: string; tone: string }> = {
  won: { label: "Won", tone: "var(--vault-success)" },
  lost: { label: "Lost", tone: "var(--vault-danger)" },
  void: { label: "Refunded", tone: "var(--vault-text-mute)" },
  pending: { label: "Not settled", tone: "var(--vault-text-mute)" },
};

/**
 * The settled record for one product. Shows the legs, the official number each was graded against,
 * and where the ladder stands afterwards — the things a reader needs to check the result themselves.
 */
export default function LifecycleRecord({
  cards, position, positionLabel, emptyReason,
}: {
  cards: LifecycleCard[];
  position: LifecyclePosition | null;
  positionLabel: string;
  emptyReason: string;
}) {
  return (
    <section className="rounded-2xl p-5 md:p-6" style={{ background: "var(--vault-surface)", border: "1px solid var(--vault-border)" }}>
      <h2 className="m-0 text-[15px] font-semibold" style={{ color: "var(--vault-text)" }}>Settled record</h2>
      {cards.length === 0 ? (
        <p className="mt-2 mb-0 text-[13px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>{emptyReason}</p>
      ) : (
        <>
          {position && (
            <p className="mt-2 mb-4 text-[13px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>
              {positionLabel} stands at <strong style={{ color: "var(--vault-text)" }}>run {position.cycle}, step {position.step}</strong>.
            </p>
          )}
          <ul className="m-0 p-0 list-none flex flex-col gap-4">
            {cards.map((c) => (
              <li key={c.id} className="rounded-xl p-4" style={{ background: "var(--vault-surface)", border: "1px solid var(--vault-border)" }}>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-[13px] font-semibold" style={{ color: OUTCOME[c.result]?.tone ?? "var(--vault-text)" }}>
                    {OUTCOME[c.result]?.label ?? c.result}
                  </span>
                  <span className="text-[12px] font-mono" style={{ color: "var(--vault-text-mute)" }}>{c.id}</span>
                </div>
                <p className="mt-1 mb-3 text-[13px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>{cardSummary(c)}</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-[12px] border-collapse" style={{ minWidth: 380 }}>
                    <thead>
                      <tr style={{ color: "var(--vault-text-mute)" }}>
                        <th className="text-left font-medium py-1 pr-3">Pick</th>
                        <th className="text-left font-medium py-1 pr-3">Needed</th>
                        <th className="text-left font-medium py-1 pr-3">Actual</th>
                        <th className="text-left font-medium py-1">Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.legs.map((l, i) => (
                        <tr key={i} style={{ borderTop: "1px solid var(--vault-border)" }}>
                          <td className="py-1.5 pr-3" style={{ color: "var(--vault-text)" }}>{l.player}</td>
                          <td className="py-1.5 pr-3" style={{ color: "var(--vault-text-mute)" }}>{l.side} {l.line} {l.market.replace(/_/g, " ")}</td>
                          <td className="py-1.5 pr-3" style={{ color: "var(--vault-text)" }}>{l.actual ?? "—"}</td>
                          <td className="py-1.5" style={{ color: OUTCOME[l.result]?.tone ?? "var(--vault-text-mute)" }}>
                            {OUTCOME[l.result]?.label ?? l.result}{l.note ? ` · ${l.note}` : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-4 mb-0 text-[12px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>
            Graded from the official MLB Stats API box score, joined by game ID. Paper only — no money moved.
          </p>
        </>
      )}
    </section>
  );
}
