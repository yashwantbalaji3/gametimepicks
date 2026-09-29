"use client";
/**
 * "Not today's market" — raised on the READER'S day, not the build's (#761 PR 1). The rule is
 * lib/markets/freshness.ts readerMarketFrame; MarketCenter's badge reads the same rule, so the banner and
 * the badge can never disagree.
 */
import { readerMarketFrame } from "@/lib/markets/freshness";
import { useReaderEtDate } from "@/lib/use-reader-et-date";

export default function NotTodaysMarket({ snapshotDate, seedToday }: { snapshotDate: string; seedToday: string }) {
  const today = useReaderEtDate(seedToday);
  const frame = readerMarketFrame({ snapshotDate, today, currentLabel: "", currentIsCurrent: true });
  if (!frame.isHistorical) return null;
  return (
    <section className="reveal" style={{ marginTop: 20 }}>
      <div
        style={{
          border: "1px solid var(--vault-warn)",
          borderRadius: 10,
          padding: 14,
          background: "color-mix(in srgb, var(--vault-warn) 6%, transparent)",
        }}
      >
        <div className="font-mono uppercase tracking-[0.16em]" style={{ fontSize: 10, color: "var(--vault-warn)", marginBottom: 6 }}>
          Not today&rsquo;s market
        </div>
        <div style={{ fontSize: 13, color: "var(--vault-text)", marginBottom: 4 }}>
          Today&rsquo;s sportsbook snapshot is not available yet. This page shows the latest one we captured:{" "}
          <strong>{snapshotDate}</strong> ({frame.daysBehind === 1 ? "yesterday" : `${frame.daysBehind} days ago`}).
        </div>
        <div style={{ fontSize: 12, color: "var(--vault-text-mute)" }}>
          Prices below are as they stood on that slate. They are not current, and those games have already been
          played.
        </div>
      </div>
    </section>
  );
}
