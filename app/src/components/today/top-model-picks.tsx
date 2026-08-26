/**
 * TodayTopModelPicks — Section 3 of the Daily Model Hub. The strongest daily reads from the canonical
 * Top-10 board, rendered as a COMPACT ranked list (top ~5-6, not the full board wall). Each row shows the
 * sport glyph / team flag, the selection, its game · market · confidence, American odds, model-vs-market
 * probability, and a "simulate this game" link when a game slug exists. Honest empty state when there are
 * no qualified picks — never fabricated.
 *
 * Presentational only: it renders the pre-derived `Top10Pick[]` slice handed down by the server page
 * (built from real committed artifacts). It reads no data and computes no money.
 */
import Link from "next/link";
import FlagBadge from "@/components/flag-badge";
import type { Top10Pick } from "@/lib/top10/top10-picks";

const oddsLabel = (n: number) => (n > 0 ? `+${n}` : `${n}`);
const pct = (p: number | null) => (p == null ? "—" : `${Math.round(p * 100)}%`);

function Row({ p, rank }: { p: Top10Pick; rank: number }) {
  return (
    <div className="flex items-center gap-2 rounded-lg px-2.5 py-2" style={{ border: "1px solid var(--vault-rule)", background: "color-mix(in srgb, var(--vault-wash-base) 1.5%, transparent)" }}>
      <span className="w-4 shrink-0 text-center font-mono text-[10px]" style={{ color: rank <= 3 ? "var(--vault-gold)" : "var(--vault-text-faint)" }}>{rank}</span>
      {p.flagCode ? (
        <FlagBadge code={p.flagCode} size="sm" ariaLabel={p.selection} />
      ) : (
        <span aria-hidden className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-[11px]" style={{ background: "var(--vault-wash)" }}>{p.sport === "mlb" ? "⚾" : "⚽"}</span>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px] font-medium" style={{ color: "var(--vault-text)" }}>{p.selection}</div>
        <div className="truncate font-mono text-[9.5px]" style={{ color: "var(--vault-text-faint)" }}>
          {p.game}{p.game ? " · " : ""}{p.market} · {p.confidence}
          {p.gameSlug ? (
            <>
              {" · "}
              <Link href={`/world-cup/round-of-32/${p.gameSlug}`} style={{ color: "var(--vault-gold)" }}>simulate game →</Link>
            </>
          ) : null}
        </div>
      </div>
      <span className="shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[11px] font-bold" style={{ color: "var(--vault-text)", border: "1px solid var(--vault-rule)" }}>{oddsLabel(p.odds)}</span>
      <span className="hidden sm:block w-[70px] shrink-0 text-right font-mono text-[9.5px]" style={{ color: "var(--vault-text-mute)" }}>
        {pct(p.modelProbability)} <span style={{ color: "var(--vault-text-faint)" }}>vs {pct(p.marketProbability)}</span>
      </span>
    </div>
  );
}

export default function TodayTopModelPicks({ picks }: { picks: Top10Pick[] }) {
  return (
    <section id="top-model-picks" aria-label="Top model picks" className="flex flex-col gap-2.5 scroll-mt-20">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 15, fontWeight: 700 }}>Top model picks</h2>
        <Link href="/markets/" className="font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}>All picks →</Link>
      </div>
      {picks.length > 0 ? (
        <div className="flex flex-col gap-1">
          {picks.map((p, i) => <Row key={p.id} p={p} rank={i + 1} />)}
        </div>
      ) : (
        <p className="rounded-lg px-3 py-3 text-[11.5px]" style={{ border: "1px dashed var(--vault-border)", color: "var(--vault-text-mute)" }}>
          No qualified picks today — reads appear only when pregame markets clear the model&rsquo;s quality bar. No-play over forcing a card.
        </p>
      )}
      <p className="font-mono text-[9px]" style={{ color: "var(--vault-text-faint)" }}>
        Ordered by settled market reliability × simulated probability — never by payout, and not a claim to out-predict the market. Paper-only research; no bets are placed here.
      </p>
    </section>
  );
}
