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
import { selectPlus100BuilderSlip, selectBankBuilderSlip } from "@/lib/parlay-suggested";
import { filterOfficialSuggestedSlips } from "@/lib/sport-capabilities";
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

/** "Jun 7" from an ISO date, locale-stable on the server. */
function fmtShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Scoreboard-style stat tile for the command-center hero. Renders real
 *  loader data only; the left accent rail is purely decorative. */
function StatTile({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent: string;
}) {
  return (
    <div
      className="relative flex flex-col gap-1 rounded-[10px] px-3 py-2.5 sm:px-3.5 sm:py-3 min-w-0 overflow-hidden"
      style={{ background: "rgba(7,11,26,0.55)", border: "1px solid var(--vault-border)" }}
    >
      <span aria-hidden className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: accent }} />
      <span className="font-mono uppercase tracking-[0.14em] truncate" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>
        {label}
      </span>
      <span className="font-display tabular truncate" style={{ color: "var(--vault-text)", fontSize: 21, fontWeight: 700, lineHeight: 1 }}>
        {value}
      </span>
      <span className="font-mono truncate" style={{ color: accent, fontSize: 9.5 }}>
        {sub}
      </span>
    </div>
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

  // PR `feature/sport-specific-suggested` (2026-06-02): Home previews the same
  // OFFICIAL Suggested surface as Parlay Lab — single-sport only. Drop any
  // mixed-sport slip so the featured card, the preview cards, and the Guided
  // finder never present a mixed slip as an official suggested parlay. Real
  // slips only; no fabrication.
  const officialSuggestedSlips = filterOfficialSuggestedSlips(
    suggested?.slips ?? [],
  );

  // Top Pick of the Day = the BANK BUILDER slip: the most conservative
  // stack (negative-odds favorites, strong recent form), NOT the
  // highest payout. Falls back to the top published slip only when no qualifying
  // conservative stack exists. The card shows its own honest settled/pending
  // state — never fabricated.
  const bankBuilderPick = selectBankBuilderSlip(officialSuggestedSlips);
  const featured =
    bankBuilderPick?.slip ??
    officialSuggestedSlips[0] ??
    null;
  const featuredIsBankBuilder =
    !!bankBuilderPick && featured?.slipId === bankBuilderPick.slip.slipId;

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
  const previewSlips = officialSuggestedSlips
    .filter((s) => s.slipId !== featured?.slipId)
    .slice(0, 2);

  // Mobile-first ordering (PR `feat/home-mobile-order`, 2026-06-02): a
  // single flattened grid whose children carry BOTH a mobile `order-*` and
  // a desktop `xl:order-*`/`xl:col-span-*`. On 375 the modules stack in the
  // exact priority order (paths → featured → bank builder → sports →
  // suggested preview → track record); on xl the same modules pack into a
  // clean two-column (8/4) dashboard with no gaps. No data changes.
  return (
    <div className="vault-page-shell px-3 sm:px-5 lg:px-6 py-4 lg:py-6 overflow-x-hidden flex flex-col gap-4">
      <MarketTicker items={tickerItems} className="-mx-3 sm:-mx-5 lg:-mx-6" />

      {/* 0 · Premium command-center hero — layered gradient frame, headline,
          paper-only badge, sportsbook-style scoreboard stat strip (real loader
          data only), and the two primary CTAs. No data/model change. */}
      <section
        className="relative overflow-hidden rounded-[14px]"
        style={{
          border: "1px solid var(--vault-border-strong)",
          background:
            "radial-gradient(120% 150% at 0% 0%, rgba(240,199,94,0.10) 0%, transparent 55%)," +
            "linear-gradient(135deg, rgba(22,30,62,0.96) 0%, rgba(11,15,31,0.97) 55%, rgba(7,11,26,0.98) 100%)",
          boxShadow: "var(--vault-shadow-elevated)",
        }}
      >
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-[2px]"
          style={{
            background:
              "linear-gradient(90deg, transparent, var(--vault-gold-bright), transparent)",
            opacity: 0.7,
          }}
        />
        <div className="relative flex flex-col gap-6 px-5 py-6 sm:px-7 sm:py-7 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-3 lg:max-w-lg">
            <span
              className="self-start font-mono uppercase tracking-[0.18em] px-2.5 py-1 rounded-full"
              style={{
                fontSize: 9,
                color: "var(--vault-gold-bright)",
                border: "1px solid var(--vault-border-strong)",
                background: "var(--vault-gold-dim)",
              }}
            >
              Educational · paper picks only
            </span>
            <h1
              className="font-display"
              style={{
                color: "var(--vault-text)",
                fontSize: "clamp(26px, 5.2vw, 40px)",
                fontWeight: 700,
                lineHeight: 1.05,
                letterSpacing: "-0.01em",
              }}
            >
              Today&apos;s board, ranked by the model.
            </h1>
            <p
              className="text-[13px] sm:text-[14px] leading-snug"
              style={{ color: "var(--vault-text-mute)", maxWidth: "46ch" }}
            >
              Player-prop parlays grouped by risk — saved before games start and
              graded after. Honest paper tracking, not betting advice.
            </p>
            <div className="flex flex-wrap gap-2.5 pt-1">
              <Link
                href="/parlay-lab/#suggested"
                className="px-4 py-2.5 rounded-full text-[12.5px] font-semibold"
                style={{ background: "var(--vault-gold-bright)", color: "var(--vault-bg)" }}
              >
                Today&apos;s Suggested Parlays →
              </Link>
              <Link
                href="/results/"
                className="px-4 py-2.5 rounded-full text-[12.5px] font-medium"
                style={{ border: "1px solid var(--vault-border-strong)", color: "var(--vault-text)" }}
              >
                Track record →
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-2.5 lg:w-[416px] shrink-0">
            <StatTile
              label="Active slate"
              value={fmtShort(suggested?.date)}
              sub={
                showingTodayPregame
                  ? "today · pregame"
                  : suggested?.isFallback
                    ? "latest slate"
                    : "today"
              }
              accent="var(--risk-low)"
            />
            <StatTile
              label="Latest settled"
              value={fmtShort(latestSettled)}
              sub={latestSettled ? "graded" : "—"}
              accent="var(--sport-mlb)"
            />
            <StatTile
              label="Tracked accuracy"
              value={combinedHitRate != null ? formatPercent(combinedHitRate) : "—"}
              sub={combinedDecisive > 0 ? `${combinedWins}/${combinedDecisive} legs` : "no settled data"}
              accent="var(--vault-gold-bright)"
            />
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 xl:items-start">
        {/* 1 · Five clear paths */}
        <div className="order-1 xl:order-1 xl:col-span-12">
          <HomePathCards cards={pathCards} />
        </div>

        {/* 2 · Top Pick of the Day (Bank Builder = most conservative stack) */}
        {featured && (
          <div className="order-2 xl:order-2 xl:col-span-8">
            <ModuleCard
              title={featuredIsBankBuilder ? "Top Pick of the Day" : "Featured slip"}
              meta={slateLabel}
            >
              <div className="p-2 sm:p-3">
                {featuredIsBankBuilder && (
                  <div className="px-1 pb-2 flex flex-wrap items-center gap-1.5">
                    <span
                      className="font-mono uppercase tracking-[0.14em] px-2 py-0.5 rounded-[4px]"
                      style={{
                        fontSize: 10,
                        color: "var(--vault-bg, #0b0b14)",
                        background: "var(--vault-accent, #d4af37)",
                        fontWeight: 700,
                      }}
                    >
                      Bank Builder
                    </span>
                    <span
                      className="font-mono uppercase tracking-[0.12em]"
                      style={{ fontSize: 10, color: "var(--vault-text-faint)" }}
                    >
                      Most conservative stack · negative-odds favorites
                    </span>
                  </div>
                )}
                <ParlayTicketCard
                  slip={featured}
                  emphasis="featured"
                  savedPregame={suggested?.source === "snapshot"}
                  calibrationTable={calibrationTable}
                />
                <p className="px-1 pt-2 text-[11px] leading-snug" style={{ color: "var(--vault-text-faint)" }}>
                  {featuredIsBankBuilder
                    ? `The most conservative stack on the ${slateLabel} slate — negative-odds favorites with strong recent form, saved before games and graded after. Conservative does not mean guaranteed.`
                    : `The model's headline slip from the ${slateLabel} slate — saved before games, graded after. High-variance slips are labelled.`}
                </p>
              </div>
            </ModuleCard>
          </div>
        )}

        {/* 3 · Bank Builder */}
        <div className="order-3 xl:order-3 xl:col-span-4">
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
        </div>

        {/* 4 · Sports coverage (compact, honest at-a-glance) */}
        <div className="order-4 xl:order-5 xl:col-span-4">
          <ModuleCard title="Sports coverage" href="/events">
            <HomeSportsCoverage />
            <p className="px-3.5 py-2.5 text-[10.5px] leading-snug" style={{ color: "var(--vault-text-faint)", borderTop: "1px solid var(--vault-rule)" }}>
              NBA &amp; MLB have player-prop projections + model parlays; World Cup
              has a live market outlook (sportsbook-implied) — model projections are
              under methodology review. Other leagues are schedule-only — never picks.
            </p>
          </ModuleCard>
        </div>

        {/* 5 · Suggested-parlays preview — a few real cards + CTAs into the
            full Parlay Lab workspace (filters + Build My Card live there). */}
        <div className="order-5 xl:order-4 xl:col-span-8">
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

        {/* 6 · Track record */}
        <div className="order-6 xl:order-7 xl:col-span-4">
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
        </div>

        {/* 7 · Guided "New here?" finder — kept for beginners, demoted below
            the dashboard so it never crowds the top on mobile. */}
        <div className="order-7 xl:order-6 xl:col-span-8">
          <GuidedStart
            slips={officialSuggestedSlips}
            slateDate={suggested?.date ?? today}
            isFallback={suggested?.isFallback ?? true}
            calibrationTable={calibrationTable}
          />
        </div>

        {/* 8 · Newsletter */}
        <div className="order-8 xl:order-8 xl:col-span-12">
          <NewsletterSignup variant="full" />
        </div>
      </div>
    </div>
  );
}
