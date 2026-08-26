/**
 * ModelNotesPanel — an honest, settled-data "what's working / what we're
 * improving" note for the Results page. Reads the read-only market-reliability
 * research artifact (no fabrication, sample-floored, shrunk). The point is
 * transparency: surface where the model is strong AND weak, show that we tune
 * from results (including losing days), and explain why plus-money lives in the
 * higher-variance sections. No profit/guarantee claims.
 */
import type { MarketReliabilityInsights } from "@/lib/market-reliability";

export default function ModelNotesPanel({
  insights,
}: {
  insights: MarketReliabilityInsights | null;
}) {
  if (!insights) return null;
  const strong = insights.strongestMarkets.slice(0, 3);
  const weak = insights.weakestMarkets.slice(0, 3);
  const heavy = insights.oddsBandRates.heavy_fav;
  const plus = insights.oddsBandRates.plus_money ?? insights.oddsBandRates.high_plus;
  if (strong.length === 0 && weak.length === 0) return null;

  const chip = (m: { label: string; hitRate: number }, positive: boolean) => (
    <span
      key={m.label}
      className="font-mono inline-flex items-center gap-1 rounded-[4px] px-2 py-0.5"
      style={{
        fontSize: 11,
        color: positive ? "var(--vault-success, var(--vault-success))" : "var(--vault-text-mute)",
        border: `1px solid ${positive ? "var(--vault-success, var(--vault-success))" : "var(--vault-rule)"}`,
      }}
    >
      {m.label} {m.hitRate.toFixed(1)}%
    </span>
  );

  return (
    <section aria-label="What the model is learning" className="flex flex-col gap-2 max-w-5xl">
      <span
        className="font-mono uppercase tracking-[0.18em]"
        style={{ color: "var(--vault-text-mute)", fontSize: 11 }}
      >
        What the model is learning
      </span>
      <div
        className="rounded-[8px] px-3.5 py-3 flex flex-col gap-2.5"
        style={{ background: "var(--gtp-card)", border: "1px solid var(--vault-rule)" }}
      >
        {strong.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>
              Working — markets clearing 50% on settled slates
            </span>
            <div className="flex flex-wrap gap-1.5">{strong.map((m) => chip(m, true))}</div>
          </div>
        )}
        {weak.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>
              Improving — weaker markets, de-emphasized in conservative cards
            </span>
            <div className="flex flex-wrap gap-1.5">{weak.map((m) => chip(m, false))}</div>
          </div>
        )}
        {heavy && plus && (
          <p className="text-[12px] leading-snug m-0" style={{ color: "var(--vault-text-mute)" }}>
            On settled slates, heavy favorites have hit <strong style={{ color: "var(--vault-text)" }}>{heavy.hitRate.toFixed(1)}%</strong>{" "}
            while plus-money props hit <strong style={{ color: "var(--vault-text)" }}>{plus.hitRate.toFixed(1)}%</strong> — that&apos;s
            why plus-money lives in High Risk &amp; Longshot, not the conservative Bank Builder.
          </p>
        )}
        <p className="text-[11px] leading-snug m-0" style={{ color: "var(--vault-text-faint)" }}>
          We track every settled pick — including losing days — and weight markets from the
          results, not from hype. Sample-floored and shrunk toward 50% so a short hot streak
          can&apos;t inflate a number. Not a profit or guarantee claim.
        </p>
      </div>
    </section>
  );
}
