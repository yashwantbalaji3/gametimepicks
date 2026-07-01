/**
 * /moonshot — the dedicated Moonshot board. A separate, higher-volatility paper product that publishes
 * two independent daily longshot cards (NOT a ladder, no step/target/progression), with its own
 * record / ROI / profit kept apart from the core Bank Builder, hit/miss/pending legs, and exposure.
 * Server component; reads committed artifacts.
 */
import fs from "node:fs";
import path from "node:path";
import Link from "next/link";

import { loadMoonshotLane } from "@/lib/moonshot/moonshot-lane";
import MoonshotLaneTracker from "@/components/moonshot/moonshot-lane-tracker";
import { buildStructuredMoonshot } from "@/lib/world-cup/structured-moonshot";
import StructuredMoonshotSection from "@/components/world-cup/structured-moonshot-section";
import PicksSurfaceHeader, { type PicksSurfaceStatus } from "@/components/picks-surface-header";
import ProductLanesLadder from "@/components/ladders/product-lanes-ladder";
import { buildDailyPortfolio } from "@/lib/mr-dub/daily-portfolio";
import { currentEtDate } from "@/lib/freshness";
import { currentSlateDate } from "@/lib/parlays/ui-loader";

export const metadata = {
  title: "Moonshot · GameTime Picks",
  description:
    "Moonshot — two independent, high-upside longshot cards published daily, tracked on their own record / ROI / profit, fully separate from the Bank Builder. Educational, paper-only, official settlement.",
};

function loadMoonshotPortfolio(): { record?: { wins: number; losses: number; voids: number; pending: number }; exposure?: number } {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "mr-dub", "portfolio.json"), "utf8")) as {
      moonshot?: { record?: { wins: number; losses: number; voids: number; pending: number }; exposure?: number };
    };
    return { record: j.moonshot?.record, exposure: j.moonshot?.exposure };
  } catch {
    return {};
  }
}

const money = (n: number) => `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function MoonshotPage() {
  const lane = loadMoonshotLane();
  const { record, exposure } = loadMoonshotPortfolio();
  const status: PicksSurfaceStatus = lane?.status === "stopped" ? "settled" : lane?.status === "active" ? "live" : "data_pending";

  // Today's daily portfolio — the activated Moonshot A/B lanes render as the lead ladder.
  const today = currentSlateDate() ?? currentEtDate();
  const dailyPortfolio = buildDailyPortfolio(path.join(process.cwd(), "public", "data"), new Date().toISOString(), today);
  const moonshotLanes = dailyPortfolio.cards.filter((c) => c.product === "moonshot");
  const structured = buildStructuredMoonshot(path.join(process.cwd(), "public", "data"), today);

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-12 overflow-x-hidden flex flex-col gap-6">
      <PicksSurfaceHeader
        eyebrow="Moonshot Lane"
        title="Moonshot Lane"
        status={status}
        counts={record ? { settled: record.wins + record.losses + record.voids, pending: record.pending } : undefined}
        primaryAction={{ label: "Open Bank Builder", href: "/bank-builder" }}
        secondaryAction={{ label: "Mr. Dub", href: "/mr-dub" }}
        note="Two independent, high-upside longshot cards published daily — maximum upside, not a ladder. Tracked on their own record / ROI / profit, fully separate from the Bank Builder. Paper-only, settlement-supported."
      />

      {/* Today's STRUCTURED Moonshot — result + total per game, grouped by game (team markets only). */}
      <section className="flex flex-col gap-3 overflow-x-hidden">
        <h2 className="font-semibold" style={{ color: "var(--vault-text)", fontSize: 17 }}>Today&rsquo;s structured Moonshot · {structured.date}</h2>
        <StructuredMoonshotSection data={structured} />
        {moonshotLanes.length ? (
          <p className="font-mono leading-relaxed" style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>
            Paper exposure {money(dailyPortfolio.exposure.moonshot)} placed · active bankroll {money(dailyPortfolio.activeBankroll)} · available {money(dailyPortfolio.availableBankroll)} · crown {money(dailyPortfolio.crownBankroll)} (historical, unchanged)
          </p>
        ) : null}
      </section>

      {/* History — the day-by-day lane tracker (stopped / restart state) below the live ladder. */}
      <div className="flex flex-col gap-3">
        <h2 className="font-semibold" style={{ color: "var(--vault-text)", fontSize: 17 }}>History</h2>
        {lane ? (
          <MoonshotLaneTracker lane={lane} record={record} exposure={exposure} />
        ) : (
          <div className="rounded-xl px-4 py-8 text-center" style={{ background: "rgba(26,16,11,0.55)", border: "1px solid var(--vault-border)" }}>
            <p style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 600 }}>Moonshot Lane data pending</p>
            <p className="mt-1" style={{ color: "var(--vault-text-mute)", fontSize: 12 }}>
              The tracker appears once a lane artifact is published. <Link href="/bank-builder" style={{ color: "var(--vault-gold-bright)" }}>Open Bank Builder</Link>.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
