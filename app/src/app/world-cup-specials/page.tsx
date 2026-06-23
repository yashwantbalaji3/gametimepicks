/**
 * /world-cup-specials — the dedicated World Cup Specials Tracker. Day-by-day model-ranked suggested
 * longshot cards with official settlement, kept separate from Bank Builder, Moonshot, and the crown.
 * Suggested cards only — no exposure is placed. Server component; reads committed artifacts.
 */
import Link from "next/link";

import { loadWorldCupSpecials } from "@/lib/world-cup/world-cup-specials";
import { deriveSpecialsTracker } from "@/lib/world-cup/specials-tracker";
import WorldCupSpecialsTracker from "@/components/specials/world-cup-specials-tracker";
import PicksSurfaceHeader, { type PicksSurfaceStatus } from "@/components/picks-surface-header";

export const metadata = {
  title: "World Cup Specials Tracker · GameTime Picks",
  description:
    "Daily World Cup Specials — model-ranked suggested longshot cards with official settlement and a separate result history. Suggested cards only, paper-only, educational.",
};

export default function WorldCupSpecialsPage() {
  const nowIso = new Date().toISOString();
  const result = loadWorldCupSpecials();
  const t = deriveSpecialsTracker(result, nowIso);
  const status: PicksSurfaceStatus = t.summary.settledCount > 0 && t.summary.pendingCount === 0 && t.summary.candidateCount === 0
    ? "settled"
    : t.summary.pendingCount > 0
      ? "live"
      : t.summary.candidateCount > 0
        ? "pregame"
        : "data_pending";

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-12 overflow-x-hidden flex flex-col gap-6">
      <PicksSurfaceHeader
        eyebrow="World Cup Specials"
        title="World Cup Specials Tracker"
        slateDate={t.date ?? undefined}
        status={status}
        counts={{ suggestedCards: result?.cards?.length ?? 0, pending: t.summary.pendingCount, settled: t.summary.settledCount }}
        primaryAction={{ label: "World Cup hub", href: "/world-cup" }}
        secondaryAction={{ label: "View Results", href: "/results" }}
        note="Daily model-ranked suggested longshot cards with official settlement and a separate result history — no exposure is placed. Separate from Bank Builder, Moonshot, and the protected crown."
      />
      {result ? (
        <WorldCupSpecialsTracker result={result} nowIso={nowIso} mode="full" />
      ) : (
        <div className="rounded-xl px-4 py-8 text-center" style={{ background: "rgba(26,16,11,0.55)", border: "1px solid var(--vault-border)" }}>
          <p style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 600 }}>World Cup Specials data pending</p>
          <p className="mt-1" style={{ color: "var(--vault-text-mute)", fontSize: 12 }}>
            A fresh box of specials posts once the next multi-game slate is available. <Link href="/world-cup" style={{ color: "var(--vault-gold-bright)" }}>Open the World Cup hub</Link>.
          </p>
        </div>
      )}
    </div>
  );
}
