/**
 * /world-cup-specials — RETIRED archive of the World Cup Specials Tracker. The 2026 World Cup is
 * complete and WC Specials is retired in the product registry; this page exists ONLY as the durable
 * accountability record: the settled per-slate ledger (record / ROI / P&L), the final tracker state,
 * and the full slate history. Suggested cards only — no exposure was ever placed. Nothing here may
 * present as live coverage (soccer is SCAFFOLD_ONLY in the capability registry). Server component;
 * reads committed artifacts. noindex: an archive, not a destination.
 */
import Link from "next/link";

import { loadWorldCupSpecials, loadWorldCupSpecialsHistory, specialsPastSlates } from "@/lib/world-cup/world-cup-specials";
import { deriveSpecialsTracker } from "@/lib/world-cup/specials-tracker";
import { buildSpecialsLedger } from "@/lib/world-cup/specials-ledger";
import WorldCupSpecialsTracker from "@/components/specials/world-cup-specials-tracker";
import SpecialsHistorySection from "@/components/specials/specials-history-section";
import SpecialsLedgerSection from "@/components/world-cup/specials-ledger-section";
import DailySpecialsSection from "@/components/specials/daily-specials-section";
import PicksSurfaceHeader from "@/components/picks-surface-header";
import path from "node:path";

export const metadata = {
  title: "World Cup Specials — Retired Archive · GameTime Picks",
  description:
    "Archived World Cup Specials record — model-ranked suggested longshot cards from the completed 2026 World Cup, settled from official results. Retired; kept as past proof. Paper-only, educational.",
  robots: { index: false, follow: false },
};

export default function WorldCupSpecialsPage() {
  const nowIso = new Date().toISOString();
  const result = loadWorldCupSpecials();
  const t = deriveSpecialsTracker(result, nowIso);
  const pastSlates = specialsPastSlates(loadWorldCupSpecialsHistory(), t.date ?? "");
  const ledger = buildSpecialsLedger(path.join(process.cwd(), "public", "data"), t.date ?? result?.date ?? "");

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-12 overflow-x-hidden flex flex-col gap-6">
      <PicksSurfaceHeader
        eyebrow="Retired · World Cup archive"
        title="World Cup Specials — Archived"
        slateDate={t.date ?? undefined}
        status="settled"
        counts={{ suggestedCards: result?.cards?.length ?? 0, pending: t.summary.pendingCount, settled: t.summary.settledCount }}
        primaryAction={{ label: "Mr. Dub portfolio", href: "/mr-dub" }}
        secondaryAction={{ label: "Results", href: "/results" }}
        note="RETIRED (2026-07-21) — the 2026 World Cup is complete, so this World-Cup-only paper product is closed and no new boxes post. Below is its archived record (record / ROI / P&L), settled from official results and kept as past proof. Paper-only; separate from the protected crown."
      />

      {/* The durable ledger — record / ROI / P&L / win-rate / open exposure / slates archived. */}
      <SpecialsLedgerSection ledger={ledger} />

      {/* Daily Structured Specials — the "2 legs from each game" product, four reliability tiers. */}
      {result?.dailySpecials?.length ? <DailySpecialsSection cards={result.dailySpecials} /> : null}

      {result ? (
        <WorldCupSpecialsTracker result={result} nowIso={nowIso} mode="full" />
      ) : (
        <div className="rounded-xl px-4 py-8 text-center" style={{ background: "rgba(26,16,11,0.55)", border: "1px solid var(--vault-border)" }}>
          <p style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 600 }}>World Cup Specials — retired</p>
          <p className="mt-1" style={{ color: "var(--vault-text-mute)", fontSize: 12 }}>
            The 2026 World Cup is complete, so no new specials post. The settled record lives in the <Link href="/results" style={{ color: "var(--vault-gold-bright)" }}>results</Link>.
          </p>
        </div>
      )}
      <SpecialsHistorySection days={pastSlates} />
    </div>
  );
}
