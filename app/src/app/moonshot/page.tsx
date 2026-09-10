/**
 * /moonshot — the dedicated Moonshot board. A separate, higher-volatility paper product kept apart
 * from the core Bank Builder, with its own record and exposure.
 *
 * WHAT THIS PAGE USED TO CLAIM, AND WHY IT WAS WRONG
 * The page advertised "two independent longshot cards published daily", a lifetime record of 0-1 and
 * "0 Pending". All three were false: nothing had published since 2026-08-17, the product ledger holds
 * seven settled cards rather than one, and two published cards were sitting open. Every one of those
 * numbers now comes from `deriveMoonshotState`, which reads the artifacts and reports where they
 * disagree instead of picking a winner.
 *
 * Server component; reads committed artifacts.
 */
import fs from "node:fs";
import path from "node:path";
import Link from "next/link";

import { loadMoonshotLane } from "@/lib/moonshot/moonshot-lane";
import MoonshotLaneTracker from "@/components/moonshot/moonshot-lane-tracker";
import MoonshotLadderV2 from "@/components/moonshot/ladder-v2";
import PicksSurfaceHeader, { type PicksSurfaceStatus } from "@/components/picks-surface-header";
import { presentFromArtifact } from "@/lib/signature-presentation.mjs";
import ProductLanesLadder from "@/components/ladders/product-lanes-ladder";
import { buildDailyPortfolio } from "@/lib/mr-dub/daily-portfolio";
import LifecycleRecord from "@/components/products/lifecycle-record";
import { positionFromReceipts, readReceipts } from "@/lib/products/ladder-position.mjs";
import { receiptPositionRecord } from "@/lib/bank-builder/receipt-lane-display";
import { MOONSHOT_LADDER, MOONSHOT_SEED } from "@/lib/moonshot/moonshot-ladder.mjs";
import { loadLifecycleHistory, settledCardsFor, settledCardIds } from "@/lib/products/lifecycle-view";
import { currentEtDate } from "@/lib/freshness";
import { currentSlateDate } from "@/lib/parlays/ui-loader";
import SlateLivenessBanner from "@/components/slate-liveness-banner";
import { publicationDeadlineUtc } from "@/lib/ops/read-publication-slo";
import {
  deriveMoonshotState,
  isPublishedCard,
  moonshotTodayCounts,
  MOONSHOT_HAS_SCHEDULED_GENERATOR,
  MOONSHOT_HAS_WIRED_SETTLER,
} from "@/lib/products/moonshot-state.mjs";
import { withRouteMetadata } from "@/lib/seo/route-metadata";

export const metadata = withRouteMetadata("/moonshot/", {
  title: "Moonshot · GameTime Picks",
  description:
    "Moonshot — a separate, higher-volatility paper product tracked on its own record, apart from the Bank Builder. Educational and paper-only.",
});

const readData = (...rel: string[]) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", ...rel), "utf8"));
  } catch {
    return null;
  }
};

const money = (n: number) => `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function MoonshotPage() {
  const lane = loadMoonshotLane();
  const portfolioMoonshot = readData("mr-dub", "portfolio.json")?.moonshot ?? null;
  const record = portfolioMoonshot?.record;
  // Today's ET slate is resolved below; the lane's own date comes from the artifact so a stale
  // file can never borrow today's date.
  const etToday = currentEtDate();
  const laneDate = typeof lane?.generatedAt === "string" ? lane.generatedAt.slice(0, 10) : null;

  /*
   * THE ONE OWNER of this product's state. It reconciles the lane artifact, the product ledger and
   * the portfolio block, and reports their disagreements rather than resolving them by fiat — two
   * ledgers describing different eras is a fact about the product's history, not a bug to average
   * away. `running` is false here because nothing generates the product and nothing can settle the
   * cards it left open.
   */
  // Today's daily portfolio — computed BEFORE the state derivation so the derived sentence knows
  // the revived daily lane published today (P240): the page must never say "not produced" beside
  // today's live card.
  const today = currentSlateDate() ?? currentEtDate();
  const dailyPortfolio = buildDailyPortfolio(path.join(process.cwd(), "public", "data"), new Date().toISOString(), today);
  const moonshotLanes = dailyPortfolio.cards.filter((c) => c.product === "moonshot" && isPublishedCard(c));

  // Availability comes from the shared signature-state derivation — NOT from the lane's
  // self-declared status. The previous inline ternary read `lane.status` alone, so a lane
  // generated 2026-07-21 with status "active" rendered as "Slate in progress" fifteen days later.
  // Freshness outranks a file's opinion of itself.
  //
  // P250 · A01: the derivation now reads TODAY'S publication surface (the daily portfolio) when it
  // holds published Moonshot cards. Reading the retired legacy lane first is what rendered a
  // "Not published today" badge in the same header whose derived note said today's card IS
  // published — two record systems, one component, no label.
  const signature = presentFromArtifact({
    slateDate: etToday,
    artifactDate: moonshotLanes.length > 0 ? (dailyPortfolio.date ?? etToday) : laneDate,
    artifactStatus: moonshotLanes.length > 0 ? "active" : (lane?.status ?? null),
  });
  const status = signature.surfaceStatus as PicksSurfaceStatus;
  const moonshot = deriveMoonshotState({
    /* Cards the lifecycle ledger has graded. The settler never rewrites the lane artifact — it
       feeds the protected bankroll — so without this a settled card reads as pending for ever. */
    settledCardIds: settledCardIds(loadLifecycleHistory(), "moonshot"),
    ...moonshotTodayCounts(dailyPortfolio.cards),
    lane,
    portfolioMoonshot,
    productLedger: readData("product-ledger", "moonshot.json"),
    hasScheduledGenerator: MOONSHOT_HAS_SCHEDULED_GENERATOR,
    hasWiredSettler: MOONSHOT_HAS_WIRED_SETTLER,
    today: etToday,
  });

  // Today's daily portfolio — the activated Moonshot A/B lanes render as the lead ladder.
  // (loaded above, before the state derivation)
  // Open exposure is a LIVE figure and must come from today's slate, not from portfolio.json — that
  // artifact is the SETTLED-money authority and correctly reports 0 settled exposure. Reading it here
  // made the tracker say "$0.00 exposure" on the same page whose header said "$50.00 placed".
  const exposure = dailyPortfolio?.exposure?.moonshot ?? 0;

  /* The Moonshot card frozen on 2026-08-17 sat unsettled for nineteen days because no job read this
     lane. The ledger now carries its graded outcome and the ladder position that followed. */
  const msLedger = loadLifecycleHistory();

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-12 overflow-x-hidden flex flex-col gap-6">
      {/* Slate liveness (real ET clock) — no-play framing when today has no live slate; points at the next
          scheduled focus. The ladder lanes below remain the most-recent published cards. */}
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
        statusLabel={moonshot.running ? signature.label : "Not running"}
        /* NO counts chips. They render a settled/pending pair, and neither number can be stated as a
           single figure here: two ledgers disagree on how many cards are settled, and the open cards
           are not "pending" because nothing will ever grade them. The reconciliation below shows both
           sources instead of picking one for a chip. */
        primaryAction={{ label: "Open Bank Builder", href: "/bank-builder" }}
        secondaryAction={{ label: "Mr. Dub", href: "/mr-dub" }}
        /* Derived, never hand-typed — the previous note claimed daily publication for a product that
           had published nothing in weeks. */
        note={moonshot.publicNote}
      />

      {/* THE RECONCILIATION — the charter's P0: one place where pending count, settled count,
          exposure and card status are stated together, including where the sources disagree.
          Hiding the disagreement behind a single chip is what produced the contradiction. */}
      {moonshot.contradictions.length ? (
        <section
          aria-label="Moonshot state reconciliation"
          className="rounded-xl px-4 py-4 flex flex-col gap-3"
          style={{ background: "color-mix(in srgb, var(--vault-scrim-base) 55%, transparent)", border: "1px solid var(--vault-border)" }}
        >
          <h2 className="font-semibold" style={{ color: "var(--vault-text)", fontSize: 15 }}>What this product&rsquo;s records actually say</h2>

          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {/* Each tile names WHICH record it reads (P250 · A01): the first pair describe TODAY's
                publication surface; the last pair reconcile the retired legacy lane against the
                lifecycle ledger. Unlabeled, "Open cards 0 · $0.00" sat two sections above today's
                two published cards and $50 paper exposure — one page, two unscoped eras. */}
            {[
              ["Published today", String(moonshotLanes.length), moonshotLanes.length ? `$${dailyPortfolio.exposure.moonshot.toFixed(2)} paper` : "no card today"],
              ["Settled cards", moonshot.ledgerRecord ? `${moonshot.ledgerRecord.wins}–${moonshot.ledgerRecord.losses}` : "—",
                moonshot.ledgerRecord?.fromDate ? `${moonshot.ledgerRecord.fromDate} … ${moonshot.ledgerRecord.throughDate}` : ""],
              ["Legacy open cards", String(moonshot.openCardCount), moonshot.openCardCount === 0 ? "legacy lane fully graded" : moonshot.unsettleableCardCount ? "cannot be graded" : "awaiting results"],
              ["Legacy stranded stake", `$${moonshot.openExposure.toFixed(2)}`, "legacy lane · paper"],
            ].map(([k, v, sub]) => (
              <div key={k} className="rounded-[10px] px-3 py-2" style={{ background: "var(--vault-wash-soft)", border: "1px solid var(--vault-rule)" }}>
                <dd className="font-mono tabular" style={{ color: "var(--vault-text)", fontSize: 15, fontWeight: 700 }}>{v}</dd>
                <dt className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>{k}</dt>
                {sub ? <p className="font-mono mt-0.5" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>{sub}</p> : null}
              </div>
            ))}
          </dl>

          <div className="flex flex-col gap-1.5">
            <p className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>
              Where the stored records disagree
            </p>
            <ul className="flex flex-col gap-1">
              {moonshot.contradictions.map((c) => (
                <li key={c} className="font-mono leading-relaxed" style={{ color: "var(--vault-text-mute)", fontSize: 10.5 }}>· {c}</li>
              ))}
            </ul>
          </div>

          {moonshot.founderDecision ? (
            <p className="font-mono leading-relaxed" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>
              Open decision: {moonshot.founderDecision}
            </p>
          ) : null}
        </section>
      ) : null}

      {/* The 3-STEP LADDER — the rule both lanes climb. Since 2026-09-10 each lane's rung comes from the
          official receipts (products/ladder-position.mjs), and each lane's own day is on its rail in
          today's cards below; this graphic names no single LIVE day, because two lanes can stand on
          different ones. */}
      <MoonshotLadderV2 currentDay={1} />

      {/* The next transition, and only when one genuinely exists. This line used to assert ladder
          progression mechanics ("a win unlocks the next day") for cards that are not ladder steps. */}
      <p className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>
        {moonshotLanes.length
          ? "Next transition: today's cards settle overnight from official results. Both legs win → the whole payout carries to the lane's next day; either leg loses → the lane restarts at $25."
          : "No card is placed today. The ladder deals again tomorrow morning from wherever each lane stands."}
      </p>

      {/*
        TODAY'S CARD — the PUBLISHED lanes themselves (P243 · A-2).
        This section used to be "Today's structured Moonshot", assembled from the RETIRED World Cup
        round-of-32 board — which on an MLB day always found no usable pair and rendered
        "No qualified Moonshot today" on the same page whose header said today's card is published.
        Two derivations of "today" cannot share a page: this one now renders the very cards the
        header is talking about, and its empty state quotes the SAME derived sentence the header
        uses, so the two surfaces cannot disagree again.
      */}
      <section className="flex flex-col gap-3 overflow-x-hidden">
        <h2 className="font-semibold" style={{ color: "var(--vault-text)", fontSize: 17 }}>Today&rsquo;s Moonshot · {today}</h2>
        {moonshotLanes.length ? (
          <>
            <ProductLanesLadder productLabel="Moonshot" product="moonshot" lanes={moonshotLanes} accent="gold" />
            <p className="font-mono leading-relaxed" style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>
              Paper exposure {money(dailyPortfolio.exposure.moonshot)} placed · active bankroll {money(dailyPortfolio.activeBankroll)} · available {money(dailyPortfolio.availableBankroll)} · crown {money(dailyPortfolio.crownBankroll)} (historical, unchanged)
            </p>
          </>
        ) : (
          <div className="rounded-[12px] px-5 py-6 text-center" style={{ background: "color-mix(in srgb, var(--vault-scrim-base) 45%, transparent)", border: "1px dashed var(--vault-rule)" }}>
            <span aria-hidden style={{ fontSize: 22 }}>🌙</span>
            <p className="mt-1.5" style={{ color: "var(--vault-text)", fontSize: 13.5, fontWeight: 600 }}>No published Moonshot card for {today}</p>
            <p className="mt-1 text-[12px]" style={{ color: "var(--vault-text-mute)" }}>{moonshot.publicNote}</p>
          </div>
        )}
      </section>

      <LifecycleRecord
        cards={settledCardsFor(msLedger, "moonshot")}
        /* Where Lane A stands, from the same official receipts the generator deals from; the card on
           the table wins for today. */
        position={receiptPositionRecord(
          positionFromReceipts({ receipts: readReceipts(path.join(process.cwd(), "public", "data"), today), product: "moonshot", lane: "A", ladder: MOONSHOT_LADDER as never, seed: MOONSHOT_SEED }) as never,
          dailyPortfolio.cards.find((c) => c.product === "moonshot" && c.lane === "A" && c.status === "active")?.step ?? null,
        )}
        positionLabel="Moonshot Lane A"
        emptyReason="No Moonshot card has been graded yet. When a card's games finish, its legs and the official numbers they were graded against appear here."
      />

      {/* History — the day-by-day lane tracker (stopped / restart state) below the live ladder. */}
      <div className="flex flex-col gap-3">
        <h2 className="font-semibold" style={{ color: "var(--vault-text)", fontSize: 17 }}>History</h2>
        {lane ? (
          <MoonshotLaneTracker
            lane={lane}
            record={moonshot.displayRecord ?? undefined}
            exposure={exposure}
            running={moonshot.running}
            /* Outcomes the lifecycle ledger graded, keyed by the lane's own card ids — without this
               the tracker said "pending" directly above a record listing the same card as lost. */
            settledOutcomes={new Map(settledCardsFor(msLedger, "moonshot").flatMap((c) => (c.sourceCardId && c.result ? [[c.sourceCardId, c.result] as [string, string]] : [])))}
          />
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
