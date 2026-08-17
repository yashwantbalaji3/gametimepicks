import type { RiskLadder } from "@/lib/parlays/risk-ladder";

/**
 * THE RISK-LADDER STREAM on /results — this product's record, kept in its own lane.
 *
 * Separate from the settled product record on purpose, and the separation runs both ways:
 *   · these cards never move the Bank Builder / Moonshot bankroll or the 19-14 settled record, and
 *   · that record never lends this stream its credibility.
 *
 * The table leads with ROI rather than hit rate because hit rate alone is unreadable across price
 * bands — 5.9% is catastrophic at even money and would be excellent at +2000. Every row here is
 * negative, so the ordering also happens to be the honest one: the tier that looks most exciting
 * (Longshot, 12.75x average win) is the one losing a quarter of every unit staked.
 */

const TIER_LABEL: Record<string, string> = {
  low: "Low risk", medium: "Medium risk", high: "High risk", longshot: "Longshot",
};
const TIER_BAND: Record<string, string> = {
  low: "−200 to +100", medium: "+100 to +300", high: "+300 to +600", longshot: "> +600",
};
const ORDER = ["low", "medium", "high", "longshot"];

const pct = (v: number | null | undefined) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);
const signed = (v: number | null | undefined) =>
  v == null ? "—" : `${v > 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;

export default function RiskLadderStream({ record }: { record: RiskLadder["record"] | null }) {
  if (!record) return null;
  const rows = ORDER.map((t) => ({ tier: t, r: record.byTier[t] })).filter((x) => x.r);
  if (rows.length === 0) return null;

  return (
    <section aria-labelledby="risk-ladder-record" className="mt-10 flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className="font-mono uppercase tracking-[0.16em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
          Risk ladder · paper stream
        </span>
        <h2 id="risk-ladder-record" className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 18, fontWeight: 800 }}>
          Parlays by risk level
        </h2>
        <p className="m-0 max-w-[72ch]" style={{ color: "var(--vault-text-mute)", fontSize: 13, lineHeight: 1.65 }}>
          One flat unit per card, {record.gradedDays} graded days
          {record.firstDay ? ` (${record.firstDay} → ${record.lastDay})` : ""}. Return on investment is
          the column that matters: a hit rate cannot be read without the price it was paid at.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full" style={{ borderCollapse: "collapse", minWidth: 560 }}>
          <thead>
            <tr>
              {["Tier", "Price band", "W–L", "Hit rate", "Paper ROI"].map((h, i) => (
                <th key={h} className="font-mono uppercase tracking-[0.12em] py-2"
                  style={{ color: "var(--vault-text-faint)", fontSize: 9, textAlign: i < 2 ? "left" : "right", borderBottom: "1px solid var(--vault-rule)" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ tier, r }) => (
              <tr key={tier}>
                <td className="py-2" style={{ color: "var(--vault-text)", fontSize: 13, fontWeight: 600, borderBottom: "1px solid var(--vault-rule)" }}>
                  {TIER_LABEL[tier] ?? tier}
                </td>
                <td className="py-2 font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 11, borderBottom: "1px solid var(--vault-rule)" }}>
                  {TIER_BAND[tier] ?? "—"}
                </td>
                <td className="py-2 font-mono tabular-nums" style={{ color: "var(--vault-text-mute)", fontSize: 12.5, textAlign: "right", borderBottom: "1px solid var(--vault-rule)" }}>
                  {r.wins}–{r.losses}
                </td>
                <td className="py-2 font-mono tabular-nums" style={{ color: "var(--vault-text-mute)", fontSize: 12.5, textAlign: "right", borderBottom: "1px solid var(--vault-rule)" }}>
                  {pct(r.hitRate)}
                </td>
                <td className="py-2 font-mono tabular-nums" style={{ fontSize: 12.5, fontWeight: 700, textAlign: "right", borderBottom: "1px solid var(--vault-rule)",
                  color: (r.roi ?? 0) < 0 ? "var(--vault-danger)" : "var(--vault-success)" }}>
                  {signed(r.roi)}
                </td>
              </tr>
            ))}
            <tr>
              <td className="py-2 font-semibold" style={{ color: "var(--vault-text)", fontSize: 13 }}>All tiers</td>
              <td />
              <td className="py-2 font-mono tabular-nums" style={{ color: "var(--vault-text)", fontSize: 12.5, textAlign: "right" }}>
                {record.overall.wins}–{record.overall.losses}
              </td>
              <td />
              <td className="py-2 font-mono tabular-nums" style={{ fontSize: 12.5, fontWeight: 800, textAlign: "right",
                color: (record.overall.roi ?? 0) < 0 ? "var(--vault-danger)" : "var(--vault-success)" }}>
                {signed(record.overall.roi)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="m-0" style={{ color: "var(--vault-text-mute)", fontSize: 12, lineHeight: 1.6 }}>
        Every tier is negative. Published because the record is the point — a card shown without it
        is a claim, and this stream has not earned one.
      </p>
      <p className="m-0 font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9, lineHeight: 1.6 }}>
        Paper only · separate ledger · never part of the settled product record or the bankroll
      </p>
    </section>
  );
}
