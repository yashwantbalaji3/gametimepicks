/**
 * Homepage — Command Center dashboard.
 *
 * A modular dashboard (brand gold/vault theme): the "Where do you want
 * to start?" path cards, a prominent Featured-slip card, a COMPACT
 * preview of the top suggested parlays (CTAs into the full /parlay-lab
 * workspace — the full builder with filters + Build My Card lives there,
 * not here), and a sidebar of modules (track record, Bank Builder,
 * projections, events). Same loaders, same honesty — only the home
 * composition changed. No data/pipeline/optimizer/settlement changes.
 *
 * Honesty preserved:
 *   - Only real snapshots/graded files render here; the slate is labelled
 *     "today / latest / settled" honestly (never fabricated).
 *   - Empty states explain why; high-variance slips stay labelled.
 *   - Decisive single-leg stats only on the track-record module.
 */
import Link from "next/link";

import { getLifetimeSummary, getBoardForDate } from "@/lib/data";
import { getMlbLifetimeSummary } from "@/lib/data-mlb-results";
import { getMlbBoardForDate } from "@/lib/data-mlb";
import { getOptimizerSummary, getOptimizerGradedDates } from "@/lib/parlay-results";
import {
  getSuggestedParlaysForDate,
  getOptimizerSnapshotForDate,
  getLatestOptimizerSnapshot,
} from "@/lib/data-parlays";
import { selectPlus100BuilderSlip } from "@/lib/parlay-suggested";
import { loadCalibrationTable } from "@/lib/confidence-calibration";
import { formatPercent } from "@/lib/format";

import ParlayTicketCard from "@/components/parlay-ticket-card";
import HomePathCards, { type PathCard } from "@/components/home-path-cards";
import HomeSportsCoverage from "@/components/home-sports-coverage";
import GuidedStart from "@/components/guided-start/guided-start";
import NewsletterSignup from "@/components/newsletter-signup";
import MarketTicker from "@/components/market-ticker";
import { buildMarketTickerItems } from "@/lib/market-ticker";
import { currentEtDate } from "@/lib/freshness";

/* ----------------------------------------------------------------------- */
/* Module shell                                                            */
/* ----------------------------------------------------------------------- */
function ModuleCard({
  title,
  meta,
  href,
  children,
}: {
  title: string;
  meta?: string;
  href?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="flex flex-col rounded-[8px] overflow-hidden"
      style={{ background: "var(--gtp-card)", border: "1px solid var(--vault-border)" }}
    >
      <header
        className="flex items-center justify-between gap-3 px-3.5 py-2.5"
        style={{ borderBottom: "1px solid var(--vault-rule)", background: "rgba(7,11,26,0.5)" }}
      >
        <span
          className="font-mono uppercase tracking-[0.16em]"
          style={{ color: "var(--vault-gold-bright)", fontSize: 10.5 }}
        >
          {title}
        </span>
        <div className="flex items-center gap-3">
          {meta && (
            <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>
              {meta}
            </span>
          )}
          {href && (
            <Link
              href={href}
              className="font-mono uppercase tracking-[0.12em]"
              style={{ color: "var(--vault-text-mute)", fontSize: 10 }}
            >
              open →
            </Link>
          )}
        </div>
      </header>
      <div className="flex-1">{children}</div>
    </section>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="flex flex-col gap-1 px-3.5 py-3 min-w-0">
      <span className="font-mono uppercase tracking-[0.16em] truncate" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>
        {label}
      </span>
      <span className="font-display tabular truncate" style={{ color: "var(--vault-text)", fontSize: 20, fontWeight: 600, lineHeight: 1 }}>
        {value}
      </span>
      <span className="font-mono truncate" style={{ color: "var(--vault-text-mute)", fontSize: 10 }}>
        {sub}
      </span>
    </div>
  );
}

export default function HomePage() {
  const today = currentEtDate();
  const lifetime = getLifetimeSummary();
  const mlbLifetime = getMlbLifetimeSummary();
  const calibrationTable = loadCalibrationTable();

  const suggested = getSuggestedParlaysForDate(today);
  const optimizerForDate =
    getOptimizerSnapshotForDate(today) ||
    (suggested ? getOptimizerSnapshotForDate(suggested.date) : null) ||
    getLatestOptimizerSnapshot()?.payload ||
    null;
  const showingTodayPregame =
    !!suggested && !suggested.isFallback && suggested.source === "snapshot";

  // Featured slip: prefer a pending ~+100 builder pick; otherwise the top
  // slip of the latest published slate. The card shows its own honest
  // settled/pending state — never fabricated.
  const featured =
    selectPlus100BuilderSlip(suggested?.slips ?? [])?.slip ??
    suggested?.slips?.[0] ??
    null;

  const combinedDecisive = (lifetime?.decisive ?? 0) + (mlbLifetime?.decisive ?? 0);
  const combinedWins = (lifetime?.wins ?? 0) + (mlbLifetime?.wins ?? 0);
  const combinedHitRate = combinedDecisive > 0 ? combinedWins / combinedDecisive : null;

  const nbaBoard = getBoardForDate(today);
  const mlbBoard = getMlbBoardForDate(today);
  const tickerItems = buildMarketTickerItems({
    surface: "home",
    optimizerSummary: getOptimizerSummary(),
    nba: nbaBoard,
    mlb: mlbBoard,
  });

  const slateLabel = suggested
    ? `${suggested.date} · ${showingTodayPregame ? "today" : suggested.isFallback ? "latest slate" : "today"}`
    : "—";

  // ---- "Where do you want to start?" path cards ------------------------
  // Five plain-language entry points mapping to the clear user paths. Any
  // status shown is computed here, server-side, from the same honest
  // loaders the rest of the app uses — real counts/dates only, never
  // fabricated. Parlay Lab cards use the hash deep-links from PR #223.
  const totalSlips = optimizerForDate?.totalSlips ?? suggested?.slips?.length ?? 0;
  const gradedDates = getOptimizerGradedDates();
  const latestSettled = gradedDates.length ? [...gradedDates].sort().slice(-1)[0] : null;
  const pathCards: PathCard[] = [
    {
      href: "/projections/",
      glyph: "◷",
      title: "Straight Bets",
      blurb: "Model projections and edges for individual player props — the picks behind every parlay.",
      cta: "View projections →",
      status: null,
    },
    {
      href: "/parlay-lab/#suggested",
      glyph: "⊞",
      title: "Suggested Parlays",
      blurb: "The model's top-ranked parlays for the slate, grouped by risk level.",
      cta: "See suggested →",
      status: totalSlips > 0 ? `${totalSlips} slips` : null,
    },
    {
      href: "/parlay-lab/#build",
      glyph: "✎",
      title: "Build Your Own",
      blurb: "Assemble a custom parlay from the same pool. Exploratory — not officially tracked.",
      cta: "Build a parlay →",
      status: null,
    },
    {
      href: "/bank-builder/",
      glyph: "▰",
      title: "Bank Builder",
      blurb: "A $100 → $3,000 paper ladder, one daily pick per rung. Educational, paper-only.",
      cta: "Open Bank Builder →",
      status: "$100 paper",
    },
    {
      href: "/results/",
      glyph: "✓",
      title: "Results",
      blurb: "Every suggested slip, graded after games — the honest W/L track record.",
      cta: "View results →",
      status: latestSettled ? `Latest ${latestSettled}` : null,
    },
  ];

  // ---- Suggested parlays preview --------------------------------------
  // PR `feat/home-suggested-preview-dedup` (2026-06-01) — Home is the
  // dashboard; the FULL workspace (filters + risk lanes + Build My Card)
  // lives on /parlay-lab. So Home shows only a small preview of the real
  // top-ranked slips (the featured one is shown separately just above, so
  // exclude it to avoid a duplicate card) plus CTAs into the two Parlay
  // Lab modes. Real slips only — no fabrication.
  const previewSlips = (suggested?.slips ?? [])
    .filter((s) => s.slipId !== featured?.slipId)
    .slice(0, 3);

  return (
    <div className="vault-page-shell px-3 sm:px-5 lg:px-6 py-4 lg:py-6 overflow-x-hidden flex flex-col gap-4">
      <MarketTicker items={tickerItems} className="-mx-3 sm:-mx-5 lg:-mx-6" />

      <HomePathCards cards={pathCards} />

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* Main column — guided start + featured card + suggested preview */}
        <div className="xl:col-span-8 flex flex-col gap-4">
          {/* Additive "New here?" beginner finder — does not replace the
              builder or the featured slip; reuses the same slips/helpers. */}
          <GuidedStart
            slips={suggested?.slips ?? []}
            slateDate={suggested?.date ?? today}
            isFallback={suggested?.isFallback ?? true}
            calibrationTable={calibrationTable}
          />

          {featured && (
            <ModuleCard title="Featured slip" meta={slateLabel}>
              <div className="p-2 sm:p-3">
                <ParlayTicketCard
                  slip={featured}
                  emphasis="featured"
                  savedPregame={suggested?.source === "snapshot"}
                  calibrationTable={calibrationTable}
                />
                <p className="px-1 pt-2 text-[11px] leading-snug" style={{ color: "var(--vault-text-faint)" }}>
                  The model&apos;s headline slip from the {slateLabel} slate — saved before games,
                  graded after. High-variance slips are labelled.
                </p>
              </div>
            </ModuleCard>
          )}

          {/* Compact Suggested-parlays preview — a few real cards + CTAs
              into the full Parlay Lab workspace. The full builder (filters,
              risk lanes, Build My Card) lives on /parlay-lab, not here. */}
          <ModuleCard
            title="Suggested parlays"
            meta={suggested ? slateLabel : undefined}
            href="/parlay-lab/#suggested"
          >
            <div className="p-2 sm:p-3 flex flex-col gap-3">
              {previewSlips.length > 0 ? (
                <>
                  <p className="px-1 text-[12px] leading-snug" style={{ color: "var(--vault-text-mute)" }}>
                    A preview of the model&apos;s top-ranked parlays for the {slateLabel} slate.
                    Open Parlay Lab for the full set — every risk level, filters, and Build My Card.
                  </p>
                  <div className="flex flex-col gap-3">
                    {previewSlips.map((slip) => (
                      <ParlayTicketCard
                        key={slip.slipId}
                        slip={slip}
                        emphasis="alternate"
                        savedPregame={suggested?.source === "snapshot"}
                        calibrationTable={calibrationTable}
                      />
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2 px-1 pt-0.5">
                    <Link
                      href="/parlay-lab/#suggested"
                      className="px-3.5 py-2 rounded-full text-[11.5px] font-medium"
                      style={{ background: "var(--vault-gold-bright)", color: "var(--vault-bg)" }}
                    >
                      Open Suggested Parlays →
                    </Link>
                    <Link
                      href="/parlay-lab/#build"
                      className="px-3.5 py-2 rounded-full text-[11.5px]"
                      style={{ border: "1px solid var(--vault-border-strong)", color: "var(--vault-text)" }}
                    >
                      Build Your Own →
                    </Link>
                  </div>
                </>
              ) : (
                <p className="px-3 py-6 text-[13px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>
                  No suggested slips posted yet — we only show slips saved before games started. The
                  next pregame snapshot lands once tonight&apos;s lines and projections are ready. In
                  the meantime, open{" "}
                  <Link href="/projections/" style={{ color: "var(--vault-gold-bright)" }}>projections</Link>.
                </p>
              )}
            </div>
          </ModuleCard>
        </div>

        {/* Sidebar — modules */}
        <div className="xl:col-span-4 flex flex-col gap-4">
          <ModuleCard title="Track record" href="/results">
            <div className="grid grid-cols-3">
              <Metric
                label="Tracked"
                value={combinedHitRate != null ? formatPercent(combinedHitRate) : "—"}
                sub={combinedDecisive > 0 ? `${combinedWins}/${combinedDecisive}` : "no settled data"}
              />
              <Metric
                label="NBA"
                value={lifetime?.hitRate != null ? formatPercent(lifetime.hitRate) : "—"}
                sub={lifetime ? `${lifetime.wins}/${lifetime.decisive}` : "—"}
              />
              <Metric
                label="MLB"
                value={mlbLifetime?.hitRate != null ? formatPercent(mlbLifetime.hitRate) : "—"}
                sub={mlbLifetime ? `${mlbLifetime.wins}/${mlbLifetime.decisive}` : "—"}
              />
            </div>
            <p className="px-3.5 pb-3 text-[10.5px] leading-snug" style={{ color: "var(--vault-text-faint)" }}>
              Decisive single-leg projections only; pushes excluded. Parlay-slip results live on{" "}
              <Link href="/results/" style={{ color: "var(--vault-gold)" }}>Results</Link>.
            </p>
          </ModuleCard>

          <ModuleCard title="Bank Builder" href="/bank-builder">
            <div className="px-3.5 py-3 flex flex-col gap-1.5">
              <span className="font-display" style={{ color: "var(--vault-text)", fontSize: 16, fontWeight: 600 }}>
                $100 → $3,000 paper ladder
              </span>
              <span className="text-[12px] leading-snug" style={{ color: "var(--vault-text-mute)" }}>
                Five rungs, one daily pick per rung, target ~+100. Paper-trading / educational only —
                resets to the $100 base on a loss, always shown.
              </span>
            </div>
          </ModuleCard>

          <ModuleCard title="Projections" href="/projections">
            <div className="px-3.5 py-3">
              <span className="text-[12.5px] leading-snug" style={{ color: "var(--vault-text-mute)" }}>
                Every game, every player prop the suggestions are built on — game cards, player
                accordions, per-prop edges. Today&apos;s board posts each morning.
              </span>
            </div>
          </ModuleCard>

          {/* Sports coverage — honest at-a-glance of every league we
              surface. NBA/MLB link to picks; schedule-only leagues link to
              their schedule; MLS/EPL are dimmed "coming soon" with no link.
              Full grid + schedules live on /events. */}
          <ModuleCard title="Sports coverage" href="/events">
            <HomeSportsCoverage />
            <p className="px-3.5 py-2.5 text-[10.5px] leading-snug" style={{ color: "var(--vault-text-faint)", borderTop: "1px solid var(--vault-rule)" }}>
              NBA &amp; MLB have projections + model parlays. Other leagues are
              schedule-only or not yet modelled — never picks.
            </p>
          </ModuleCard>
        </div>
      </div>

      <section className="mt-2">
        <NewsletterSignup variant="full" />
      </section>
    </div>
  );
}
