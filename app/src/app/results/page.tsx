/**
 * /results — parlay-first track record.
 *
 * The product centers on suggested parlays. This page answers the
 * single question that matters: did the model-suggested parlays hit?
 *
 * Layout (post-era-reset):
 *   1. Compact hero (`ResultsHero`) — settled-slate date + lifetime
 *      public hit rate, with the fresh-era start date as a subline.
 *      (Replaced the old 737px Fresh-era status block.)
 *   2. Risk-section + sport-mix breakdowns of the newest settled slate
 *      (the primary dashboard frame), under an <h2> section heading.
 *   3. Daily projection-level audit banner (intact — distinct from
 *      parlay tracking; tracks per-prop accuracy).
 *   4. Per-date sections (newest first, era-filtered) with every graded
 *      slip. Renders an empty state until a post-era slate settles.
 *   5. By-model-profile lifetime tiles (historical view), under an
 *      <h2> heading, deep on the page so it no longer competes.
 *   6. Learning signals (collapsed) + methodology + projection-audit
 *      pointer (secondary).
 *
 * Honesty contract:
 *   - Hit rates only count decisive slips (win + loss).
 *   - Pushes excluded from denominator.
 *   - Pending slips excluded from denominator.
 *   - Empty pool → empty state. Never fabricates a slip.
 *   - Pre-era data is filtered out at the loader (`parlay-results.ts`
 *     applies `public-parlay-era.ts`). Files stay on disk as
 *     internal/dev archive; the UI never reads them.
 */
import Link from "next/link";

import ResultsAccountingSection from "@/components/research/results-accounting-section";
import RiskLadderStream from "@/components/results/risk-ladder-stream";
import { loadRiskLadderRecord } from "@/lib/parlays/risk-ladder";
import path from "node:path";
import ResultsMarketBenchmark from "@/components/research/results-market-benchmark";
import { loadTerminal } from "@/lib/research/public-contract-adapter";
import { loadRecentAccounting } from "@/lib/research/results-accounting-loader";

import {
  getOptimizerSummary,
  getOptimizerSettledDates,
  getOptimizerGradedForDate,
  sortGradedSlipsForDisplay,
} from "@/lib/parlay-results";
import {
  getLatestOptimizerSnapshot,
} from "@/lib/data-parlays";
import { currentEtDate } from "@/lib/freshness";
import { resultsMode } from "@/lib/sport-capability-registry";
import FreshnessBadge from "@/components/ui/freshness-badge";
import { PUBLIC_PARLAY_RESULTS_START_DATE } from "@/lib/public-parlay-era";
import { optimizerSlipToParlaySlip } from "@/lib/parlay-optimizer";
import { loadCalibrationTable } from "@/lib/confidence-calibration";
import { getLifetimeSummary } from "@/lib/data";
import { getMlbLifetimeSummary } from "@/lib/data-mlb-results";
import { getMarketReliabilityInsights } from "@/lib/market-reliability";

import ProjectionAccuracySummary from "@/components/projection-accuracy-summary";
import ModelNotesPanel from "@/components/model-notes-panel";
import ParlayResultsSummary from "@/components/parlay-results-summary";
import ParlayResultsDateSectionV2 from "@/components/parlay-results-date-section-v2";
import RiskSectionResultsTable from "@/components/risk-section-results-table";
import SportMixResultsTable from "@/components/sport-mix-results-table";
import RiskSectionDrilldown from "@/components/risk-section-drilldown";
import LearningSignalsTable from "@/components/learning-signals-table";
import DailyAuditBanner from "@/components/daily-audit-banner";
import MethodologyCard from "@/components/methodology-card";
import ResultsHero from "@/components/results-hero";
import ResultsSectionNav, {
  summarizeLearningSignalCounts,
} from "@/components/results-section-nav";
import {
  getLatestDailyAudit,
  getDailyAuditPolicy,
  getRawAuditPolicy,
} from "@/lib/data-daily-audit";
import {
  summarizeByRiskSection,
  summarizeBySportBucket,
  summarizePublishedRecord,
} from "@/lib/results-breakdown";
import { buildLearningSignalRows } from "@/lib/learning-signals";
import { buildRiskSectionDrilldown } from "@/lib/results-drilldown";
import YesterdaySummary from "@/components/yesterday-summary";
import TrustCenter from "@/components/results/trust-center";
import { getTrustCenterModel } from "@/lib/results-trust-center";

export const metadata = {
  title: "Results & Receipts · GameTime Picks",
  description:
    "The official paper-card record, open exposure, settlement status, and money-independent model-performance receipts — one public trust center.",
};

export default function ResultsPage() {
  const summary = getOptimizerSummary();

  // Leg-level PROJECTION accuracy (the model-quality lead) — settled-only,
  // sourced from lifetime_summary.json (NBA = results/, MLB = mlb/results/).
  // These are individual leaned picks graded vs the line; pushes/voids are
  // already excluded from `decisive` by the loaders. Never pregame, never
  // fabricated.
  const nbaLeg = getLifetimeSummary();
  const mlbLeg = getMlbLifetimeSummary();
  const marketInsights = getMarketReliabilityInsights();
  const toProj = (
    s: { wins: number; losses: number; decisive: number; hitRate: number | null } | null,
  ) =>
    s && s.decisive > 0
      ? { wins: s.wins, losses: s.losses, decisive: s.decisive, hitRate: s.hitRate }
      : null;
  const nbaProj = toProj(nbaLeg);
  const mlbProj = toProj(mlbLeg);
  // A COMBINED figure is only meaningful when every sport in it is a comparable LIVE system. NBA's
  // record is real but frozen, so summing it with live MLB produced a headline "overall hit rate" that
  // read as current cross-sport model performance while being mostly stale NBA by sample. Prefer NO
  // combined figure over a misleading one: the per-sport cards below still show both, each labelled
  // with its own data mode.
  const contributors = [
    { key: "mlb", proj: mlbProj },
    { key: "nba", proj: nbaProj },
  ].filter((c) => c.proj !== null);
  const allContributorsLive =
    contributors.length > 0 && contributors.every((c) => resultsMode(c.key) === "live");
  const overallProj = allContributorsLive
    ? (() => {
        const wins = contributors.reduce((a, c) => a + (c.proj?.wins ?? 0), 0);
        const losses = contributors.reduce((a, c) => a + (c.proj?.losses ?? 0), 0);
        const decisive = contributors.reduce((a, c) => a + (c.proj?.decisive ?? 0), 0);
        return { wins, losses, decisive, hitRate: decisive > 0 ? wins / decisive : null };
      })()
    : null;

  // Small honest banner above the lifetime summary, only rendered when an audit payload exists for at
  // least one settled slate. Never fabricates a row.
  const latestAudit = getLatestDailyAudit();
  // Confirming-days policy. Shows a single status line when the artifact exists; renders nothing
  // otherwise, and never moves the model on its own.
  const auditPolicy = getDailyAuditPolicy();
  // Settled means DECIDED, not "a graded file exists" — a withheld slate must never be announced as
  // the newest settled one.
  const dates = getOptimizerSettledDates();
  const calibrationTable = loadCalibrationTable();
  // The newest date with a real settled outcome. Everything that frames itself as "the latest settled
  // day" reads from this, never from the calendar.
  const newestSettledDate = dates[0] ?? null;

  // For each date, load the graded payload and prepare display slips.
  const dateSections = dates.map((date) => {
    const payload = getOptimizerGradedForDate(date);
    if (!payload) return { date, slips: [], totals: null };
    const unique = payload.uniqueSlips ?? [];
    const sorted = sortGradedSlipsForDisplay(unique);
    // Convert each OptimizerSlip → ParlaySlip for the ticket card.
    //
    // The graded payload ships with `riskProfile: null` on
    // every uniqueSlip — the lane is encoded in the slipId
    // (`opt_<date>_<lane>_<hash>`). The V2 results section sub-groups
    // missed slips by lane, so we derive `riskProfile` from the slipId
    // here. Falls back to the value already on the slip when present.
    const deriveLane = (s: { slipId?: string; riskProfile?: unknown }) => {
      if (s.riskProfile && typeof s.riskProfile === "string") {
        return s.riskProfile;
      }
      const id = s.slipId ?? "";
      const m = id.match(/^opt_\d{4}-\d{2}-\d{2}_([a-z_]+?)(?:_[a-f0-9]{6,}|_(?:nba|mlb|multi|all)_)/);
      if (m) {
        const lane = m[1].replace(/_(?:nba|mlb|multi|all)$/, "");
        if (lane === "conservative" || lane === "balanced" || lane === "aggressive" || lane === "star_power") {
          return lane;
        }
      }
      return null;
    };
    const displaySlips = sorted.map((s) => {
      const ps = optimizerSlipToParlaySlip(s, date);
      return {
        ...ps,
        riskProfile: (deriveLane(s) ?? ps.riskProfile) as typeof ps.riskProfile,
        status: ((s as unknown as { status?: string }).status ?? "pending") as
          | "pending"
          | "win"
          | "loss"
          | "push"
          | "void",
      };
    });
    const totals = {
      wins: unique.filter((s) => (s as unknown as { status?: string }).status === "win").length,
      losses: unique.filter((s) => (s as unknown as { status?: string }).status === "loss").length,
      pushes: unique.filter((s) => (s as unknown as { status?: string }).status === "push").length,
      pending: unique.filter((s) => (s as unknown as { status?: string }).status === "pending").length,
    };
    return { date, slips: displaySlips, totals };
  });

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-6 sm:py-10 overflow-x-hidden">
      {/* Trust Center lead: official record, exposure, settlement status, product cards, Bank Builder
         settled history, and the money-INDEPENDENT MLB model-performance summary. Everything below the
         divider is the deeper transparency + projection audit, retained in full so no trust surface is
         hidden. */}
      <TrustCenter model={getTrustCenterModel()} />

      {/* ── RECORD DIRECTORY (P200) ──────────────────────────────────────────────────────────────
          The site keeps SEPARATE records because they answer different questions over different
          populations, and blending them is banned. But separate-by-design was also undiscoverable:
          nothing named the families side by side, so a reader landing here could not tell this
          page's saved-slip grading from the Lab's own suggestions or the model-pick ledgers. Each
          line names its population and settlement policy; the destination carries the denominators
          and stamps. Links only — this section computes NOTHING and can never blend the records. */}
      <section
        aria-label="Which record is which"
        className="mt-4 rounded-[10px] px-4 py-3"
        style={{ border: "1px solid var(--vault-border-strong)" }}
      >
        <div className="font-mono uppercase tracking-[0.14em]" style={{ fontSize: 10, color: "var(--vault-text-faint)" }}>
          Four separate records · never blended
        </div>
        <ul className="mt-2 flex flex-col gap-1.5" style={{ fontSize: 12.5, lineHeight: 1.55, listStyle: "none", padding: 0 }}>
          <li>
            <Link href="/results/picks" style={{ color: "var(--gtp-bank-cta)", fontWeight: 600 }}>Model picks</Link>
            <span style={{ color: "var(--vault-text-mute)" }}> — every published per-sport model read vs the official outcome; graded from official results only.</span>
          </li>
          <li>
            <Link href="/results/parlay-lab" style={{ color: "var(--gtp-bank-cta)", fontWeight: 600 }}>Suggested parlays</Link>
            <span style={{ color: "var(--vault-text-mute)" }}> — the Lab&rsquo;s own daily cards, by sport and risk tier; a card grades only when every leg has an official result.</span>
          </li>
          <li>
            <span style={{ color: "var(--vault-text)", fontWeight: 600 }}>Saved slips</span>
            <span style={{ color: "var(--vault-text-mute)" }}> — cards readers built and kept (this page&rsquo;s per-date sections below); a different population from the Lab&rsquo;s suggestions.</span>
          </li>
          <li>
            <Link href="/mr-dub" style={{ color: "var(--gtp-bank-cta)", fontWeight: 600 }}>Paper products</Link>
            <span style={{ color: "var(--vault-text-mute)" }}> — the Bank Builder / Moonshot bankroll journeys, settled card by card in their own ledger.</span>
          </li>
        </ul>
      </section>

      {/* Canonical outcome accounting.
         Starts from the GENERATED population rather than the settled ledger, because the ledger is
         authoritative for what was graded and silent about everything else. Rows that never produced a
         stat, slates the integrity gate refused, and dates where no slate was ever built all stay in
         the count with a reason — dropping any of them would quietly improve every number beside
         them. */}
      <ResultsAccountingSection rows={loadRecentAccounting(8)} />

      {/* The risk-ladder stream, in its own lane. Deliberately AFTER the settled product record and
          visibly separate: these paper cards never move the bankroll, and the bankroll's record
          never lends them credibility. */}
      <RiskLadderStream record={loadRiskLadderRecord(path.join(process.cwd(), "public", "data"))} />

      <div className="mt-12 mb-5 flex items-center gap-3">
        <h2
          className="font-mono uppercase tracking-[0.16em] m-0 font-normal"
          style={{ color: "var(--vault-text-mute)", fontSize: 12 }}
        >
          Deeper transparency &amp; model audit
        </h2>
        <span className="flex-1 h-px" style={{ background: "var(--vault-rule)" }} />
      </div>

      {/* Latest settled day at a glance — official outcomes only.
         Framed on the newest date that actually SETTLED, not on the wall clock's "yesterday".
         Yesterday is frequently the wrong frame here: a slate can be withheld by the integrity gate,
         or never have been produced at all, and asking a settled-results strip for that date renders
         an empty box under a heading promising results. */}
      {newestSettledDate ? (
        <div className="mb-5">
          <YesterdaySummary date={newestSettledDate} />
        </div>
      ) : null}

      {/* Lead with LEG-LEVEL projection accuracy — the cleaner read on model
         quality than parlay (card) hit rate, which is naturally low because
         every leg must hit. Settled-only, real graded data. */}
      {/* Render whenever ANY sport has settled data. Gating this on `overallProj` was wrong once the
          combined figure became conditional: suppressing the misleading blend also suppressed the honest
          per-sport cards, so /results showed nothing at all. The combined card inside degrades on its own. */}
      <div className="mb-6">
        <ResultsMarketBenchmark terminal={loadTerminal()} />
      </div>

      {(mlbProj || nbaProj) && (
        <div className="mb-6">
          <ProjectionAccuracySummary
            overall={overallProj}
            mlb={mlbProj}
            nba={nbaProj}
            eraStart={PUBLIC_PARLAY_RESULTS_START_DATE}
          />
        </div>
      )}

      {/* Honest, settled-data "what's working / what we're improving" note —
         transparency that the model learns from results (including losses) and
         why plus-money is confined to higher-variance sections. */}
      {marketInsights && (
        <div className="mb-6">
          <ModelNotesPanel insights={marketInsights} />
        </div>
      )}

      {/* Parlay card performance — repositioned BELOW projection accuracy and
         explicitly framed as higher-variance. The two-record (Published cards /
         Generated pool) UX is preserved inside ResultsHero. */}
      <div className="flex flex-col gap-1 max-w-5xl mb-2">
        <span
          className="font-mono uppercase tracking-[0.18em]"
          style={{ color: "var(--vault-text-mute)", fontSize: 11 }}
        >
          Parlay card performance · higher variance
        </span>
        <p
          className="text-[12px] leading-snug"
          style={{ color: "var(--vault-text-faint)", maxWidth: 620 }}
        >
          Parlays are stricter: every leg must hit for the card to cash, so card
          hit rate is naturally lower than individual projection accuracy. The
          published cards you saw are tracked below for full transparency.
        </p>
      </div>
      {/* Honesty banner: the OPTIMIZER suggested-parlay grading is a distinct track that has not been graded
         since its latest settled date — never let a month-old record read as "current". World Cup + MLB
         settle in their own products. Shown only when the parlay grading is meaningfully stale (>7 days). */}
      {(() => {
        const settled = dateSections[0]?.date ?? null;
        if (!settled) return null;
        const days = Math.round((Date.parse(`${currentEtDate()}T00:00:00Z`) - Date.parse(`${settled}T00:00:00Z`)) / 86400000);
        if (!Number.isFinite(days) || days <= 7) return null;
        return (
          <div className="rounded-[8px] px-4 py-3 mb-4 flex flex-col gap-1"
            style={{ background: "rgba(217,164,65,0.08)", border: "1px solid color-mix(in srgb, var(--vault-gold-bright) 35%, transparent)" }}>
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-gold-bright)", fontSize: 9.5 }}>Suggested-parlay grading · settled through {settled}</span>
              {/* Client badge re-computes "N days ago" with the real browser clock — the static-export
                  build date can't freeze this banner's honesty. */}
              <FreshnessBadge slateDate={settled} serverToday={currentEtDate()} noun="grading" />
            </span>
            <p className="text-[12px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>
              The suggested-parlay optimizer track record below is settled through <span style={{ color: "var(--vault-text)" }}>{settled}</span> ({days} days ago) — newer slates are awaiting grading, so this is NOT a live scoreboard. World Cup and MLB settle in their own products (World Cup on the Track Record / Bank Builder pages). Nothing here is counted as a win or loss until officially graded.
            </p>
          </div>
        );
      })()}
      {/* Compact hero: the settled date + the two lifetime records (published cards / generated pool). */}
      <ResultsHero
        settledDate={dateSections[0]?.date ?? null}
        lifetime={summary?.lifetime ?? null}
        publishedLifetime={
          summary?.byPublicSection?.lifetime
            ? summarizePublishedRecord(summary.byPublicSection.lifetime)
            : null
        }
      />

      {/* When a snapshot exists for a date strictly newer than the newest settled date, surface a small
         chip pointing at today's picks — so an active slate is never mistaken for settled results. */}
      {(() => {
        const newestSettled = dateSections[0]?.date ?? null;
        const latest = getLatestOptimizerSnapshot();
        const today = currentEtDate();
        const activeDate = latest?.date ?? today;
        const isFreshActive =
          !!latest &&
          (!newestSettled || activeDate > newestSettled);
        if (!isFreshActive) return null;
        const activeLabel = formatResultsDateLabel(activeDate);
        return (
          <section
            aria-label="Today's picks pointer"
            className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-[8px] px-3 py-2"
            style={{
              background: "var(--gtp-card)",
              border: "1px solid var(--vault-rule)",
            }}
          >
            <span
              className="font-mono uppercase tracking-[0.14em]"
              style={{ color: "var(--vault-gold-bright)", fontSize: 11 }}
            >
              Pregame
            </span>
            <span
              className="text-[12.5px] leading-snug"
              style={{ color: "var(--vault-text-mute)" }}
            >
              {activeLabel} picks live in Picks Lab until games finish.
            </span>
            {/* Return loop: yesterday's recap → today's slate (the daily journey's forward step). */}
            <Link
              href="/today/"
              className="font-mono uppercase tracking-[0.12em]"
              style={{ color: "var(--vault-gold-bright)", fontSize: 11 }}
            >
              See today&apos;s slate →
            </Link>
            <Link
              href="/markets/"
              className="font-mono uppercase tracking-[0.12em] px-2.5 py-1 rounded-full ml-auto"
              style={{
                color: "var(--vault-gold-bright)",
                border: "1px solid var(--vault-gold-bright)",
                fontSize: 11,
                lineHeight: 1.1,
              }}
            >
              View today&apos;s picks →
            </Link>
          </section>
        );
      })()}

      {/* Pill nav anchored to the section IDs below. Renders only the
         pills whose target sections actually exist on this render
         (no dead anchors). Stays under 60px tall on desktop and
         mobile. */}
      {dateSections.length > 0 && (() => {
        const rawPolicy = getRawAuditPolicy();
        const learningRows = buildLearningSignalRows(summary, rawPolicy);
        const items = [
          { id: "overview", label: "Overview" },
          { id: "risk-sections", label: "Risk sections" },
          { id: "sport-mix", label: "Sport mix" },
          { id: "slip-details", label: "Slip details" },
          ...(latestAudit
            ? [{ id: "projection-audit", label: "Projection audit" }]
            : []),
          ...(learningRows.length > 0
            ? [
                {
                  id: "learning-signals",
                  label: "Learning signals",
                  hint: summarizeLearningSignalCounts(learningRows),
                },
              ]
            : []),
        ];
        return (
          <div className="mt-4">
            <ResultsSectionNav items={items} />
          </div>
        );
      })()}

      {/* Risk-section and sport-mix breakdowns of the most recent settled
         slate. Pulled in above the per-date sections so the user can
         see the Low / Medium / High / Longshot performance + the
         NBA-only / MLB-only / Mixed performance at a glance.

         The pipeline grades the published sections directly and persists per-section and
         per-sport-bucket summaries, which is what these tables prefer, so the numbers match what
         readers actually saw. It falls back to a loader-side classification for any date not yet
         graded section-wise. */}
      {dateSections.length > 0 && (() => {
        const newest = dateSections[0];
        const label = formatResultsDateLabel(newest.date);
        const pipelineSections =
          summary?.byPublicSection?.byDate?.[newest.date];
        const pipelineSportBuckets =
          summary?.bySportBucket?.byDate?.[newest.date];
        const riskBreakdown = pipelineSections
          ? buildBreakdownFromPipeline(pipelineSections)
          : summarizeByRiskSection(newest.slips);
        const sportBreakdown = pipelineSportBuckets
          ? buildSportBreakdownFromPipeline(pipelineSportBuckets)
          : summarizeBySportBucket(newest.slips);
        // Pull the graded payload for the same date so the drilldown can
        // expose the actual settled slips under each section.
        const gradedPayload = getOptimizerGradedForDate(newest.date);
        const drilldown = buildRiskSectionDrilldown(gradedPayload ?? null);
        return (
          <section
            aria-label={`${label} breakdowns`}
            className="mt-6 flex flex-col gap-4"
            id="overview"
            style={{ scrollMarginTop: 80 }}
          >
            {/* Single shared eyebrow so the date label isn't repeated on each card.
               promoted to a real
               <h2> so the dashboard has a scannable heading outline
               (one <h1> in the hero, an <h2> per major section) for
               screen readers and skim-readers alike. Visual styling is
               unchanged. */}
            <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2
                className="font-mono uppercase tracking-[0.16em] m-0 font-normal"
                style={{ color: "var(--vault-text-mute)", fontSize: 12 }}
              >
                {label} breakdowns
              </h2>
              <span
                className="font-mono"
                style={{ color: "var(--vault-text-faint)", fontSize: 11 }}
              >
                published cards — by risk and by sport mix
              </span>
            </header>
            <p
              className="font-mono leading-snug m-0"
              style={{ color: "var(--vault-text-faint)", fontSize: 11 }}
            >
              The breakdowns below count the published cards shown on Suggested
              Parlays for this slate. The all-generated-cards record (every card the
              model produced, tracked internally) is the second card at the top.
            </p>
            <div id="risk-sections" style={{ scrollMarginTop: 80 }}>
              <RiskSectionResultsTable breakdown={riskBreakdown} />
            </div>
            <div id="sport-mix" style={{ scrollMarginTop: 80 }}>
              <SportMixResultsTable breakdown={sportBreakdown} />
              {/* A Mixed Suggested tab exists, so Mixed is a published
                  card type. The Mixed row reflects published cross-sport
                  (NBA + MLB) cards; it reads zero when none settled on a slate. */}
              <p
                className="px-1 pt-2 text-[11px] leading-snug"
                style={{ color: "var(--vault-text-faint)" }}
              >
                Mixed = published cross-sport (NBA + MLB) cards. When no Mixed
                cards settled on this slate, the row reads zero.
              </p>
            </div>
            <div id="slip-details" style={{ scrollMarginTop: 80 }}>
              <RiskSectionDrilldown
                bySection={drilldown}
                contextLabel={label}
                date={newest.date}
              />
            </div>
          </section>
        );
      })()}

      {/* Daily audit banner sits here (below the breakdowns). It's useful detail but it
         was 667px tall up top and shoved everything else down.
         assigns the
         `projection-audit` anchor for the in-page nav. */}
      {latestAudit && (
        <div id="projection-audit" className="mt-8" style={{ scrollMarginTop: 80 }}>
          <DailyAuditBanner audit={latestAudit} policy={auditPolicy} />
        </div>
      )}

      {/* Bank Builder settled steps now render inside the Trust Center lead
          (section 5). Removed the duplicate render here. */}

      <div className="mt-8 flex flex-col gap-6">
        {dateSections.length === 0 ? (
          <EmptyState />
        ) : (
          // PAGE-WEIGHT CAP: render the newest 10 graded days in full (thousands of per-slip rows made
          // this page ~21MB of HTML). The older tail is summarized HONESTLY below — every older slip
          // still counts in the lifetime/by-profile totals above; nothing is silently dropped.
          dateSections.slice(0, 10).map((section) => (
            <ParlayResultsDateSectionV2
              key={section.date}
              date={section.date}
              slips={section.slips}
              totals={section.totals}
              calibrationTable={calibrationTable}
            />
          ))
        )}
        {dateSections.length > 10 ? (
          <p className="rounded-[8px] px-4 py-3 text-[12px] leading-relaxed" style={{ border: "1px dashed var(--vault-border)", color: "var(--vault-text-mute)" }}>
            {dateSections.length - 10} older graded day{dateSections.length - 10 === 1 ? "" : "s"} ({dateSections[dateSections.length - 1].date} → {dateSections[10].date}) are not listed slip-by-slip to keep this page fast — every one of those slips is still counted in the lifetime hit rate and by-profile records above. Nothing is dropped from the record.
          </p>
        ) : null}
      </div>

      {/* The legacy per-profile tile row (Conservative / Balanced / Star Power /
         Aggressive) but moved it deep into the page under a
         "By internal profile" eyebrow. The primary frame is now the
         risk-section / sport-mix breakdowns above; this row stays
         visible for users who want the historical lane view but no
         longer competes with the dashboard. */}
      <section
        aria-label="Profile lifetime tiles"
        className="mt-10 flex flex-col gap-2"
      >
        <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2
            className="font-mono uppercase tracking-[0.16em] m-0 font-normal"
            style={{ color: "var(--vault-text-mute)", fontSize: 12 }}
          >
            By model profile
          </h2>
          <span
            className="font-mono"
            style={{ color: "var(--vault-text-faint)", fontSize: 11 }}
          >
            historical view · the framing we shipped earlier
          </span>
        </header>
        <ParlayResultsSummary summary={summary} />
      </section>

      {/* Read-only table of every audit signal the model is watching, sized
         against the published numeric thresholds. Renders nothing
         when there's no honest data to show (e.g. no summary).

         It is collapsed by default; the summary chip carries the headline counts so the reader
         gets the gist without expanding. */}
      {(() => {
        const rawPolicy = getRawAuditPolicy();
        const rows = buildLearningSignalRows(summary, rawPolicy);
        if (rows.length === 0) return null;
        const headline = summarizeLearningSignalCounts(rows);
        return (
          <div
            id="learning-signals"
            className="mt-8"
            style={{ scrollMarginTop: 80 }}
          >
            <details
              className="rounded-[10px] overflow-hidden"
              style={{
                background: "var(--gtp-card)",
                border: "1px solid var(--gtp-card-border)",
              }}
            >
              <summary
                className="px-4 sm:px-5 py-3.5 flex flex-wrap items-baseline gap-x-3 gap-y-1 cursor-pointer list-none"
                style={{
                  background: "var(--gtp-card-sunken)",
                  borderBottom: "1px solid var(--vault-rule)",
                }}
              >
                <span
                  className="font-mono uppercase tracking-[0.16em]"
                  style={{ color: "var(--vault-text-mute)", fontSize: 12 }}
                >
                  Learning signals
                </span>
                <span
                  className="font-mono"
                  style={{
                    color: "var(--vault-text-faint)",
                    fontSize: 11,
                  }}
                >
                  · {headline}
                </span>
                <span
                  className="font-mono ml-auto"
                  style={{
                    color: "var(--vault-text-faint)",
                    fontSize: 10,
                  }}
                >
                  click to expand
                </span>
              </summary>
              <div className="p-0">
                <LearningSignalsTable rows={rows} />
              </div>
            </details>
          </div>
        );
      })()}

      <div className="mt-10">
        <MethodologyCard />
      </div>

      <section
        className="mt-6 rounded-[8px] p-4"
        style={{
          background: "var(--gtp-card)",
          border: "1px solid var(--vault-rule)",
        }}
        aria-label="Projection-level audit pointer"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-col gap-0.5 min-w-0">
            <span
              className="font-mono uppercase tracking-[0.16em]"
              style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
            >
              Want projection-level accuracy?
            </span>
            <span
              className="font-display"
              style={{ color: "var(--vault-text)", fontSize: 15, lineHeight: 1.3 }}
            >
              Per-prop hit rate on every settled lean is on the legacy
              audit pages.
            </span>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Link
              href="/results/nba"
              className="font-mono uppercase tracking-[0.12em] px-3.5 py-2 rounded-full"
              style={{
                color: "var(--vault-gold-bright)",
                border: "1px solid var(--vault-gold-bright)",
                fontSize: 12,
                lineHeight: 1.1,
              }}
            >
              NBA audit →
            </Link>
            <Link
              href="/results/mlb"
              className="font-mono uppercase tracking-[0.12em] px-3.5 py-2 rounded-full"
              style={{
                color: "var(--vault-gold-bright)",
                border: "1px solid var(--vault-gold-bright)",
                fontSize: 12,
                lineHeight: 1.1,
              }}
            >
              MLB audit →
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

/** Adapter — turn pipeline `byPublicSection.byDate[date]` into the
 *  shape `RiskSectionResultsTable` consumes. Always fills every
 *  section key with a zeroed row when missing so the UI renders
 *  "Not enough settled slips yet." instead of skipping a section. */
function buildBreakdownFromPipeline(
  byPublicSection: Record<string, {
    wins: number;
    losses: number;
    pushes: number;
    pending: number;
    decisive: number;
    hitRate: number | null;
  }>,
): import("@/lib/results-breakdown").RiskSectionBreakdown {
  const zero = {
    total: 0, wins: 0, losses: 0, pushes: 0, pending: 0, decisive: 0,
    hitRate: null,
  };
  const sec = (k: string) => {
    const r = byPublicSection[k];
    if (!r) return { ...zero };
    return {
      total: r.wins + r.losses + r.pushes + r.pending,
      wins: r.wins,
      losses: r.losses,
      pushes: r.pushes,
      pending: r.pending,
      decisive: r.decisive,
      hitRate: r.hitRate,
    };
  };
  return {
    sections: {
      low: sec("low"),
      medium: sec("medium"),
      high: sec("high"),
      longshot: sec("longshot"),
    },
    unaligned: { ...zero },
  };
}

/** Same adapter for the sport-bucket breakdown. */
function buildSportBreakdownFromPipeline(
  bySportBucket: Record<string, {
    wins: number;
    losses: number;
    pushes: number;
    pending: number;
    decisive: number;
    hitRate: number | null;
  }>,
): import("@/lib/results-breakdown").SportBucketBreakdown {
  const zero = {
    total: 0, wins: 0, losses: 0, pushes: 0, pending: 0, decisive: 0,
    hitRate: null,
  };
  const row = (k: string) => {
    const r = bySportBucket[k];
    if (!r) return { ...zero };
    return {
      total: r.wins + r.losses + r.pushes + r.pending,
      wins: r.wins,
      losses: r.losses,
      pushes: r.pushes,
      pending: r.pending,
      decisive: r.decisive,
      hitRate: r.hitRate,
    };
  };
  return {
    nba: row("nba"),
    mlb: row("mlb"),
    multi: row("multi"),
    other: { ...zero },
  };
}

/** Pure: format a `YYYY-MM-DD` to "May 28" using America/New_York
 *  so the breakdown caption stays consistent with the rest of the
 *  results UI. Returns the raw input if it doesn't parse. */
function formatResultsDateLabel(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return date;
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const mi = parseInt(m[2], 10) - 1;
  const day = parseInt(m[3], 10);
  if (mi < 0 || mi > 11 || Number.isNaN(day)) return date;
  return `${months[mi]} ${day}`;
}

function EmptyState() {
  return (
    <section
      className="rounded-[10px] p-6 flex flex-col gap-3"
      style={{
        background: "var(--gtp-card)",
        border: "1px dashed var(--gtp-card-border-strong)",
      }}
    >
      <span
        className="font-mono uppercase tracking-[0.14em]"
        style={{ color: "var(--vault-text-mute)", fontSize: 12, lineHeight: 1.2 }}
      >
        No settled public parlay results yet
      </span>
      <p
        className="text-[13px] leading-relaxed"
        style={{ color: "var(--vault-text-mute)", maxWidth: 600 }}
      >
        Public parlay tracking starts {PUBLIC_PARLAY_RESULTS_START_DATE}.
        As soon as a slate from this era finishes and the grader runs,
        results will appear here.
      </p>
    </section>
  );
}
