import type { Metadata } from "next";

import MarketCenter from "@/components/market-center";
import PageHero from "@/components/page-hero";
import { currentEtDate } from "@/lib/freshness";
import { latestMarketDate, loadMarketCenter } from "@/lib/markets/load";
import { freshnessLabel, formatSnapshotCapture } from "@/lib/markets/freshness";
import { toPropRowViews } from "@/lib/markets/view-model";

export const metadata: Metadata = {
  title: "Market Center · GameTimePicks",
  description:
    "Sportsbook prices alongside GameTimePicks simulations for the current MLB slate, with every market labelled by what we can honestly show.",
};

export default function MarketsPage() {
  const today = currentEtDate();
  const date = latestMarketDate();

  if (!date) {
    return (
      <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-14 overflow-x-hidden">
        <PageHero
          eyebrow="Market Center"
          title="No sportsbook snapshot available"
          sub="No captured sportsbook artifact was found. Nothing is shown rather than presenting an older snapshot as the current market."
        />
      </div>
    );
  }

  // A pinned instant so freshness and event phase are evaluated once, not twice with a drift
  // between them. The client freshness components re-derive the real ET clock on mount.
  const nowIso = new Date().toISOString();
  const data = loadMarketCenter(date, today, nowIso);

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-14 overflow-x-hidden">
      <PageHero
        eyebrow="Market Center"
        title="Sportsbook prices next to our simulations"
        sub="Every market is labelled by what we can honestly show for it: both sides, one side, or neither. Probabilities from the sportsbook are converted by GameTimePicks from the posted price — they are not the book's own numbers. Paper and educational only."
      />

      <section className="reveal" style={{ marginTop: 28 }}>
        <MarketCenter
          games={[...data.games]}
          props={toPropRowViews(data.props)}
          capturedAt={data.capturedAt}
          bookmaker={data.bookmaker}
          snapshotLabel={formatSnapshotCapture(data.gameFreshness)}
          freshnessLabel={freshnessLabel(data.gameFreshness)}
          isCurrent={data.gameFreshness.isCurrent}
        />
      </section>

      <section className="reveal reveal-d2" style={{ marginTop: 32 }}>
        <div
          style={{
            border: "1px solid var(--vault-rule)",
            borderRadius: 10,
            padding: 16,
            fontSize: 12,
            color: "var(--vault-text-mute)",
            lineHeight: 1.7,
          }}
        >
          <div
            className="font-mono uppercase tracking-[0.16em]"
            style={{ fontSize: 10, color: "var(--vault-gold)", marginBottom: 8 }}
          >
            What this page does and does not show
          </div>
          <p style={{ marginBottom: 8 }}>
            A difference is reported in percentage points and nothing more. Our simulations have not been shown to
            out-predict the sportsbook — on settled history the market price is the better estimate — so a gap is a
            disagreement worth looking at, never a recommendation.
          </p>
          <p style={{ marginBottom: 8 }}>
            Freshness describes the captured file, not individual rows. The feed carries no per-row update time, so
            there is no &ldquo;updated N minutes ago&rdquo; anywhere on this page.
          </p>
          <p>
            There is no opening price, no line movement and no trend history here, because no retained snapshot series
            exists yet. When one does, it will be built from prices captured going forward.
          </p>
        </div>
      </section>
    </div>
  );
}
