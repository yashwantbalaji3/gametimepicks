/**
 * /diamond-specials — the MLB Diamond Specials product. 5 model-built parlays a day (Homer · Hits ·
 * Bases · Pitching · Longshot) at $20 each ($100/day), drawn from the single Mr. Dub bankroll and
 * archived forever, with a durable ledger (record / ROI / P&L / win-rate). Honest by construction:
 * real posted MLB markets only, or a data-gated empty state. Server component.
 */
import path from "node:path";
import Link from "next/link";

import PicksSurfaceHeader, { type PicksSurfaceStatus } from "@/components/picks-surface-header";
import DiamondSpecialsBoard from "@/components/mlb/diamond-specials-board";
import SpecialsLedgerSection from "@/components/world-cup/specials-ledger-section";
import { loadDiamondSpecials, DIAMOND_SPECIALS_DAILY_ALLOCATION, DIAMOND_SPECIALS_STAKE_PER_CARD } from "@/lib/mlb/diamond-specials";
import { buildDiamondLedger } from "@/lib/mlb/diamond-specials-ledger";
import type { SpecialsLedger } from "@/lib/world-cup/specials-ledger";
import { currentEtDate } from "@/lib/freshness";
import { currentSlateDate } from "@/lib/parlays/ui-loader";

export const metadata = {
  title: "Diamond Specials · GameTime Picks",
  description:
    "Diamond Specials — 5 model-built MLB parlays a day (Homer · Hits · Bases · Pitching · Longshot), $20 each / $100/day, tracked inside Mr. Dub and archived forever. Real posted MLB markets only; paper-only.",
};

const money = (n: number) => `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function DiamondSpecialsPage() {
  const today = currentSlateDate() ?? currentEtDate();
  const root = path.join(process.cwd(), "public", "data");
  const board = loadDiamondSpecials(root, today);
  const d = buildDiamondLedger(root, today);
  // The shared ledger section is structurally identical (record/ROI/P&L/win-rate/open exposure/slates).
  const ledger: SpecialsLedger = {
    stakePerCard: d.stakePerCard, dailyAllocation: d.dailyAllocation, totalSlates: d.totalSlates,
    totalCards: d.totalCards, settledCards: d.settledCards, record: d.record, staked: d.staked,
    pnl: d.pnl, roi: d.roi, winRate: d.winRate, openExposure: d.openExposure,
    days: d.days.map((x) => ({ ...x })), note: d.note,
  };
  const status: PicksSurfaceStatus = board.available ? "pregame" : "data_pending";

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-12 overflow-x-hidden flex flex-col gap-6">
      <PicksSurfaceHeader
        eyebrow="Diamond Specials · MLB"
        title="Diamond Specials"
        status={status}
        counts={board.available ? { suggestedCards: board.cards.length } : undefined}
        primaryAction={{ label: "Mr. Dub portfolio", href: "/mr-dub" }}
        secondaryAction={{ label: "MLB board", href: "/mlb" }}
        note={`Five model-built MLB parlays a day — Homer · Hits · Bases · Pitching · Longshot — ${money(DIAMOND_SPECIALS_STAKE_PER_CARD)} each, ${money(DIAMOND_SPECIALS_DAILY_ALLOCATION)}/day, tracked inside Mr. Dub and archived forever. Real posted MLB markets only; paper-only.`}
      />

      <SpecialsLedgerSection ledger={ledger} />

      <DiamondSpecialsBoard board={board} />

      <p className="text-center text-[12px]" style={{ color: "var(--vault-text-faint)" }}>
        A permanent MLB product, drawn from the single Mr. Dub bankroll.{" "}
        <Link href="/mr-dub" className="underline" style={{ color: "var(--vault-text-mute)" }}>See the full portfolio allocation →</Link>
      </p>
    </div>
  );
}
