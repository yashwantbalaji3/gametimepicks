/**
 * /world-cup-specials — the dedicated World Cup Specials Tracker. Day-by-day model-ranked suggested
 * longshot cards with official settlement, kept separate from Bank Builder, Moonshot, and the crown.
 * Suggested cards only — no exposure is placed. Server component; reads committed artifacts.
 */
import Link from "next/link";

import { loadWorldCupSpecials, loadWorldCupSpecialsHistory, specialsPastSlates } from "@/lib/world-cup/world-cup-specials";
import { deriveSpecialsTracker } from "@/lib/world-cup/specials-tracker";
import WorldCupSpecialsTracker from "@/components/specials/world-cup-specials-tracker";
import SpecialsHistorySection from "@/components/specials/specials-history-section";
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
  const pastSlates = specialsPastSlates(loadWorldCupSpecialsHistory(), t.date ?? "");
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
        eyebrow="Suggested World Cup parlays"
        title="Today's Suggested World Cup Parlays"
        slateDate={t.date ?? undefined}
        status={status}
        counts={{ suggestedCards: result?.cards?.length ?? 0, pending: t.summary.pendingCount, settled: t.summary.settledCount }}
        primaryAction={{ label: "World Cup model picks", href: "/world-cup?tab=model-picks" }}
        secondaryAction={{ label: "View Results", href: "/results" }}
        note="Model-ranked paper-only suggested World Cup parlays built from eligible model picks — now part of the World Cup experience, not a separate product. No exposure is placed unless explicitly activated as Bank Builder or Moonshot. Separate from the protected crown."
      />
      <div className="rounded-[10px] px-4 py-3" style={{ background: "rgba(217,164,65,0.06)", border: "1px solid var(--vault-rule)" }}>
        <p className="text-[12px]" style={{ color: "var(--vault-text-mute)" }}>
          “World Cup Specials” are now <strong style={{ color: "var(--vault-text)" }}>Today's Suggested World Cup Parlays</strong> — model-ranked paper cards surfaced on the <Link href="/world-cup?tab=model-picks" style={{ color: "var(--vault-gold-bright)" }}>World Cup hub</Link> and <Link href="/picks" style={{ color: "var(--vault-gold-bright)" }}>Parlay Lab</Link>, no longer a separate tracker. This page keeps the running history.
        </p>
      </div>
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
      <SpecialsHistorySection days={pastSlates} />
    </div>
  );
}
