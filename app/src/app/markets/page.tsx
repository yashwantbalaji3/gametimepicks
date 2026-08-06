import type { Metadata } from "next";

import MarketCenter from "@/components/market-center";
import HowToReadMarkets from "@/components/markets/how-to-read-markets";
import PageHero from "@/components/page-hero";
import DisagreementExplorer from "@/components/research/disagreement-explorer";
import { currentEtDate } from "@/lib/freshness";
import { latestMarketDate, loadMarketCenter } from "@/lib/markets/load";
import { freshnessLabel, formatSnapshotCapture } from "@/lib/markets/freshness";
import { toPropRowViews } from "@/lib/markets/view-model";
import { loadExplorer } from "@/lib/research/disagreement-explorer-loader";
import {
  EXPLORER_ELIGIBILITY_NOTE,
  EXPLORER_INTRO,
  EXPLORER_PROBABILITY_NOTE,
  EXPLORER_TITLE,
  toExplorerRowViews,
  toGapBucketViews,
} from "@/lib/research/disagreement-explorer";

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

  // The explorer runs on SETTLED slates with a per-row provenance record, which is a different date
  // from the live snapshot above and is meant to be. It is a retrospective section on a live page, so
  // it states its own date rather than inheriting this one.
  const explorer = loadExplorer();

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-14 overflow-x-hidden">
      <PageHero
        eyebrow="Market Center"
        title="Sportsbook prices next to our simulations"
        sub="Every market is labelled by what we can honestly show for it: both sides, one side, or neither. Probabilities from the sportsbook are converted by GameTimePicks from the posted price — they are not the book's own numbers. Paper and educational only."
      />

      {data.isHistorical ? (
        <section className="reveal" style={{ marginTop: 20 }}>
          <div
            style={{
              border: "1px solid var(--vault-warn)",
              borderRadius: 10,
              padding: 14,
              background: "rgba(240, 199, 94, 0.06)",
            }}
          >
            <div
              className="font-mono uppercase tracking-[0.16em]"
              style={{ fontSize: 10, color: "var(--vault-warn)", marginBottom: 6 }}
            >
              Not today&rsquo;s market
            </div>
            <div style={{ fontSize: 13, color: "var(--vault-text)", marginBottom: 4 }}>
              Today&rsquo;s sportsbook snapshot is not available yet. This page shows the latest one we captured:{" "}
              <strong>{data.date}</strong> ({data.daysBehind === 1 ? "yesterday" : `${data.daysBehind} days ago`}).
            </div>
            <div style={{ fontSize: 12, color: "var(--vault-text-mute)" }}>
              Prices below are as they stood on that slate. They are not current, and those games have already been
              played.
            </div>
          </div>
        </section>
      ) : null}

      {/* Reading key (Program 141). Collapsed by default, so it costs a returning reader nothing,
          and native <details> so it is keyboard-operable and works on touch — a tooltip would not. */}
      <section className="reveal" style={{ marginTop: 24 }}>
        <HowToReadMarkets />
      </section>

      <section className="reveal" style={{ marginTop: 28 }}>
        <MarketCenter
          games={[...data.games]}
          props={toPropRowViews(data.props)}
          capturedAt={data.capturedAt}
          bookmaker={data.bookmaker}
          snapshotLabel={formatSnapshotCapture(data.gameFreshness)}
          // On a historical page the reading is "current" only RELATIVE to its own slate, which
          // would render a green "Current snapshot" badge directly beside the banner saying this is
          // not today's market. The badge follows the frame the reader is actually in.
          freshnessLabel={
            data.isHistorical ? `Snapshot from ${data.date}` : freshnessLabel(data.gameFreshness)
          }
          isCurrent={!data.isHistorical && data.gameFreshness.isCurrent}
        />
      </section>

      <section className="reveal reveal-d2" style={{ marginTop: 40 }}>
        <div
          className="font-mono uppercase tracking-[0.16em]"
          style={{ fontSize: 10, color: "var(--vault-gold)", marginBottom: 8 }}
        >
          {EXPLORER_TITLE}
        </div>
        <p style={{ fontSize: 12, color: "var(--vault-text-mute)", lineHeight: 1.7, marginBottom: 16 }}>
          {EXPLORER_INTRO}
        </p>

        {explorer.available && explorer.date && explorer.table ? (
          <DisagreementExplorer
            date={explorer.date}
            rows={toExplorerRowViews(explorer.rows)}
            buckets={toGapBucketViews(explorer.table)}
            historyTotal={explorer.table.totalRows}
            historyExcluded={explorer.table.excludedRows}
            historyFrom={explorer.table.window?.from ?? null}
            historyTo={explorer.table.window?.to ?? null}
            largestGapCaution={explorer.largestGapCaution}
            coverageTotal={explorer.coverage?.total ?? explorer.rows.length}
            coverageListed={explorer.coverage?.listed ?? explorer.rows.length}
            probabilityNote={EXPLORER_PROBABILITY_NOTE}
            eligibilityNote={EXPLORER_ELIGIBILITY_NOTE}
          />
        ) : (
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
            {explorer.unavailableReason ?? "This section has nothing to show for the current record."}
          </div>
        )}
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
