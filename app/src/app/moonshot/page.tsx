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
import { moonshotV2LadderPolicy } from "@/lib/methodology/ladder-policy";
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

      {/* The 3-DAY LADDER structure — the Moonshot's ladder spec (moonshotLadderPolicy), rendered from
          the tested policy function. Day 1 is live when a lane is active today; Days 2-3 unlock only by
          winning the prior day. Team markets preferred, no props by default, no forced cards. */}
      <section className="rounded-xl px-4 py-3.5" style={{ border: "1px solid var(--vault-border)", background: "rgba(139,123,240,0.05)" }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-mono uppercase tracking-[0.12em] text-[10px]" style={{ color: "#b9a8ff" }}>🌙 The 3-day ladder · $25 → $1,500</span>
          <span className="font-mono text-[9.5px]" style={{ color: "var(--vault-text-faint)" }}>high volatility by design · no forced cards</span>
        </div>
        <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {([1, 2, 3] as const).map((day) => {
            const p = moonshotV2LadderPolicy(day);
            const active = day === 1 && moonshotLanes.length > 0;
            return (
              <div key={day} className="rounded-lg px-3 py-2.5" style={{ border: `1px solid ${active ? "#8b7bf0" : "var(--vault-rule)"}`, background: active ? "rgba(139,123,240,0.10)" : "rgba(255,255,255,0.015)" }}>
                <div className="flex items-center justify-between">
                  <span className="font-mono uppercase tracking-[0.08em] text-[9px]" style={{ color: active ? "#b9a8ff" : "var(--vault-text-faint)" }}>Day {day}{active ? " · LIVE" : day === 1 ? "" : " · unlocks when the prior day wins"}</span>
                  <span className="font-mono text-[9px]" style={{ color: "var(--vault-text-faint)" }}>{p.targetMultiple}×</span>
                </div>
                <div className="mt-1 font-display tabular text-[15px] font-bold" style={{ color: "var(--vault-text)" }}>${p.roll.toLocaleString("en-US")} → ${p.target.toLocaleString("en-US")}</div>
                <div className="mt-0.5 font-mono text-[9px]" style={{ color: p.lock > 0 ? "var(--vault-success)" : "var(--vault-text-faint)" }}>
                  {p.lock > 0 ? `lock $${p.lock} · roll $${p.rollForward}` : "completes — everything realizes"}
                </div>
                <div className="mt-0.5 font-mono text-[9px]" style={{ color: "var(--vault-text-faint)" }}>{p.legRange[0]}–{p.legRange[1]} legs · team markets · no props</div>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[10.5px] leading-snug" style={{ color: "var(--vault-text-faint)" }}>
          Profit locks as the ladder climbs: win Day 1 and the $25 seed is banked back immediately — Days 2-3 ride house money ($100 locked before the $1,500 swing; a full run realizes ~$1,600). A losing day costs only what was still rolling. A day with no qualified card is a NO-PLAY, never forced. Settles from official results only.
        </p>
      </section>

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
