/**
 * WcPlayerPropsBoard — Phase C pilot surface for the REAL, provider-priced World Cup player props
 * (anytime goalscorer, shots, shots on target, assists) already ingested from The Odds API. Every price
 * is a de-vigged, market-IMPLIED read — clearly labelled provider-backed, lineups-pending, and
 * settlement-pending, so it is never mistaken for an independent model or a settleable/product pick.
 *
 * Pure/presentational: renders the loader's honest output. Fabricates nothing; shows odds + implied % only.
 */
import type { WcPlayerProps, WcPlayerProp } from "@/lib/world-cup/wc-player-props";

function pct(p: number | null): string {
  return p == null ? "—" : `${Math.round(p * 100)}%`;
}
function odds(o: number | null): string {
  return o == null ? "—" : o > 0 ? `+${o}` : `${o}`;
}

function PropRow({ p }: { p: WcPlayerProp }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5" style={{ borderTop: "1px solid var(--vault-border)" }}>
      <div className="flex flex-col min-w-0">
        <span className="truncate" style={{ color: "var(--vault-text)", fontSize: 12.5, fontWeight: 600 }}>{p.player}</span>
        <span className="font-mono uppercase tracking-[0.06em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>
          {p.team ?? "team pending"} · {p.pick}{p.line != null ? ` ${p.line}` : ""}
        </span>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className="font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 11 }}>{pct(p.impliedProb)}</span>
        <span className="font-mono tabular" style={{ color: "var(--vault-gold-bright)", fontSize: 12, fontWeight: 700 }}>{odds(p.americanOdds)}</span>
      </div>
    </div>
  );
}

export default function WcPlayerPropsBoard({ data }: { data: WcPlayerProps | null }) {
  if (!data || data.count === 0) return null;

  return (
    <section aria-label="World Cup player props" className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 17, fontWeight: 700 }}>
          Player props · <span style={{ color: "var(--vault-gold)" }}>provider-priced</span>
        </h2>
        <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>
          Anytime goalscorer, shots, shots on target and assists — real de-vigged prices from{" "}
          {data.priceSource === "the_odds_api" ? "The Odds API" : "the odds provider"}. Market-implied only (no
          independent per-player model). {data.lineupsPosted ? "" : "Lineups not posted yet · "}
          <span style={{ color: "var(--vault-warn)" }}>settlement pending</span> — these are educational reads,
          not product-eligible picks.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {data.fixtures.map((fx) => (
          <div key={fx.fixture} className="rounded-[12px] px-4 py-3 flex flex-col" style={{ background: "rgba(26,16,11,0.5)", border: "1px solid var(--vault-border)" }}>
            <div className="flex items-center justify-between gap-2 pb-1">
              <span style={{ color: "var(--vault-text)", fontSize: 13, fontWeight: 700 }}>{fx.fixture}</span>
              <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>{fx.props.length} props</span>
            </div>
            {[...new Set(fx.props.map((p) => p.marketLabel))].map((label) => (
              <div key={label} className="pt-1.5">
                <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-gold)", fontSize: 9.5 }}>{label}</span>
                {fx.props.filter((p) => p.marketLabel === label).slice(0, 6).map((p, i) => (
                  <PropRow key={`${p.player}-${p.market}-${i}`} p={p} />
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>

      <p className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)" }}>
        {data.count} provider-priced props · settlement: {data.settlementSupport} (no scorer/shots settlement source yet) ·
        never in Bank Builder / Moonshot · paper-only
      </p>
    </section>
  );
}
