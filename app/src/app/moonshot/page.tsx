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
import MoonshotLadderV2 from "@/components/moonshot/ladder-v2";
import StructuredMoonshotSection from "@/components/world-cup/structured-moonshot-section";
import PicksSurfaceHeader, { type PicksSurfaceStatus } from "@/components/picks-surface-header";
import { presentFromArtifact } from "@/lib/signature-presentation.mjs";
import ProductLanesLadder from "@/components/ladders/product-lanes-ladder";
import { buildDailyPortfolio } from "@/lib/mr-dub/daily-portfolio";
import { currentEtDate } from "@/lib/freshness";
import { currentSlateDate } from "@/lib/parlays/ui-loader";
import SlateLivenessBanner from "@/components/slate-liveness-banner";
import { publicationDeadlineUtc } from "@/lib/ops/read-publication-slo";
import { RUNBOOKS } from "@/lib/launch/runbook-registry.mjs";

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
  const { record } = loadMoonshotPortfolio();
  // Today's ET slate is resolved below; the lane's own date comes from the artifact so a stale
  // file can never borrow today's date.
  const etToday = currentEtDate();
  const laneDate = typeof lane?.generatedAt === "string" ? lane.generatedAt.slice(0, 10) : null;

  // Availability comes from the shared signature-state derivation — NOT from the lane's
  // self-declared status. The previous inline ternary read `lane.status` alone, so a lane
  // generated 2026-07-21 with status "active" rendered as "Slate in progress" fifteen days later.
  // Freshness outranks a file's opinion of itself.
  const signature = presentFromArtifact({
    slateDate: etToday,
    artifactDate: laneDate,
    artifactStatus: lane?.status ?? null,
  });
  const status = signature.surfaceStatus as PicksSurfaceStatus;

  // Today's daily portfolio — the activated Moonshot A/B lanes render as the lead ladder.
  const today = currentSlateDate() ?? currentEtDate();
  const dailyPortfolio = buildDailyPortfolio(path.join(process.cwd(), "public", "data"), new Date().toISOString(), today);
  // Open exposure is a LIVE figure and must come from today's slate, not from portfolio.json — that
  // artifact is the SETTLED-money authority and correctly reports 0 settled exposure. Reading it here
  // made the tracker say "$0.00 exposure" on the same page whose header said "$50.00 placed".
  const exposure = dailyPortfolio?.exposure?.moonshot ?? 0;
  const moonshotLanes = dailyPortfolio.cards.filter((c) => c.product === "moonshot");
  const structured = buildStructuredMoonshot(path.join(process.cwd(), "public", "data"), today);

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-12 overflow-x-hidden flex flex-col gap-6">
      {/* Slate liveness (real ET clock) — no-play framing when today has no live slate; points at the next
          scheduled focus. The longshot lanes below remain the most-recent published cards. */}
      <SlateLivenessBanner
        publishDeadlineUtc={publicationDeadlineUtc()}
        buildTimeToday={currentEtDate()}
        latestSlate={today}
        latestSlateHasGames={dailyPortfolio.cards.length > 0}
        archiveHref="/results"
        archiveLabel="See results & receipts"
      />
      <PicksSurfaceHeader
        eyebrow="Moonshot Lane"
        title="Moonshot Lane"
        status={status}
        statusLabel={signature.label}
        counts={record ? { settled: record.wins + record.losses + record.voids, pending: record.pending } : undefined}
        primaryAction={{ label: "Open Bank Builder", href: "/bank-builder" }}
        secondaryAction={{ label: "Mr. Dub", href: "/mr-dub" }}
        /* P214 A2: the record is DERIVED (a hand-typed "0-7 · every card has lost" rots the day a
           card wins), and "not a ladder" contradicted the 3-STEP LADDER section below — the truth
           is it is separate from the BANK BUILDER's ladder. */
        note={
          record
            ? `Two independent longshot cards published daily, separate from the Bank Builder. Lifetime paper record ${record.wins}–${record.losses}${record.wins === 0 && record.losses > 0 ? ": every settled card so far has lost" : ""} — a transparent record of a high-variance approach, not a product to follow.`
            : "Two independent longshot cards published daily, separate from the Bank Builder — a transparent record of a high-variance approach, not a product to follow."
        }
      />

      {/* The 3-STEP LADDER — now a PROMINENT trajectory visual (was a small inline grid). Rendered from the
          pure moonshotV2LadderPolicy spec. Day 1 is live when a lane is active today; Days 2-3 unlock only
          by winning the prior day. Team markets, no props, no forced cards. */}
      <MoonshotLadderV2 live={moonshotLanes.length > 0} currentDay={1} />

      {/* P211 R-E: the next transition, quoted from the ONE runbook registry (guard-tied to the
          workflow's real cron) — a waiting lane's next transition is tomorrow's evaluation; a live
          card's is overnight settlement. */}
      <p className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>
        {moonshotLanes.length
          ? "Next transition: settles overnight from official results — a win unlocks the next day, a loss ends the run with banked profit kept."
          : `Next daily evaluation: ${RUNBOOKS.mlb.products.when} (scheduled; the cron can drift up to ~90 minutes).`}
      </p>

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
          <div className="rounded-xl px-4 py-8 text-center" style={{ background: "color-mix(in srgb, var(--vault-scrim-base) 55%, transparent)", border: "1px solid var(--vault-border)" }}>
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
