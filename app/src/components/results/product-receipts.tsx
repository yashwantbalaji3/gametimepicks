/**
 * RESULTS V2 · PRODUCT RECEIPTS (G-4). Each Bank Builder / Moonshot lane settled that day, with every leg's official
 * score and the owner's grade — the receipt a product record is folded from. Server component; nothing recomputed.
 */
import type { DayReceipts } from "@/lib/results/v2/product-receipts";

const PRODUCT: Record<string, string> = { "bank-builder": "Bank Builder", moonshot: "Moonshot" };
const WORD: Record<string, string> = { won: "Won", lost: "Lost", void: "Void", push: "Push", pending: "Pending — not settled yet", active: "Open — a leg is still pending" };

export default function ProductReceipts({ day }: { day: DayReceipts | null }) {
  if (!day || !day.lanes.length) return null;
  return (
    <section aria-labelledby="product-receipts-h" className="mt-10 flex flex-col gap-3">
      <div>
        <h2 id="product-receipts-h" className="m-0 font-display text-[22px]" style={{ color: "var(--vault-text)" }}>Product cards settled this day</h2>
        <p className="m-0 mt-1 text-[12.5px] leading-snug" style={{ color: "var(--vault-text-mute)", maxWidth: 720 }}>
          Every Bank Builder and Moonshot lane, each leg with its official score and grade — the receipts the product records are
          built from. {day.source ? `Source: ${day.source}.` : ""} Paper-only.
        </p>
      </div>
      <ul className="m-0 p-0 list-none grid grid-cols-1 lg:grid-cols-2 gap-3">
        {day.lanes.map((l, i) => (
          <li key={`${l.product}-${l.lane}-${i}`} className="rounded-xl p-4" style={{ background: "var(--vault-panel)", border: "1px solid var(--vault-border-strong)" }}>
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
              <h3 className="m-0 text-[15px] font-semibold" style={{ color: "var(--vault-text)" }}>{PRODUCT[l.product] ?? l.product}{l.lane ? ` · lane ${l.lane}` : ""}</h3>
              <span className="font-mono text-[12px] uppercase tracking-[0.06em]" style={{ color: l.result === "won" ? "var(--vault-text)" : "var(--vault-text-mute)" }}>{WORD[l.result] ?? l.result}</span>
            </div>
            <table className="gtp-day-table">
              <thead><tr><th scope="col">Leg</th><th scope="col">Official</th><th scope="col" className="r">Grade</th></tr></thead>
              <tbody>
                {l.legs.map((g, j) => (
                  <tr key={j}><td>{g.selection ?? "—"}<span className="m"> · {g.matchup ?? "—"}</span></td><td>{g.official ?? "—"}</td><td className="r"><span className={g.result === "won" ? "o w" : "o"}>{WORD[g.result] ?? g.result}</span></td></tr>
                ))}
              </tbody>
            </table>
          </li>
        ))}
      </ul>
    </section>
  );
}
