"use client";

/**
 * HomepageTrendingTabs — PR B.
 *
 * Lightweight accessible tabbed module rendered on the homepage. All data
 * is precomputed server-side in app/src/app/page.tsx and passed in as
 * plain props — this component is pure presentation + tab state.
 *
 * Three tabs:
 *   1. Projections — strongest clean leans from the latest scored slate,
 *      plus a separate "model anomaly watchlist" for guardrail-flagged
 *      leans (R5 suspicious_edge). Never promotes anomalies as "top picks".
 *   2. Parlays    — links into Parlay Lab. No fabricated parlays here;
 *      Parlay Lab's Build mode owns candidate generation from real leans.
 *   3. Upcoming   — next scheduled slate. Surfaces game cards honestly
 *      with "Tipoff TBD" + "projections appear once sportsbook lines load"
 *      when leans are not yet available.
 *
 * No model code, no fabricated data, no betting-advice copy.
 */
import { useRef, useState } from "react";
import Link from "next/link";
import type { ConfidenceTier } from "@/lib/types";
import { formatTipoffLabel } from "@/lib/freshness";

type TabKey = "projections" | "parlays" | "upcoming";

export interface TrendingLean {
  playerName: string;
  team: string;
  opponent: string;
  market: "PTS" | "REB" | "AST" | string;
  line: number;
  side: "Over" | "Under" | "No Play" | "Pass" | string;
  projection: number | null;
  edgePct: number | null;
  confidence: ConfidenceTier | string;
}

export interface TrendingGame {
  gameId: string;
  awayTeamAbbr: string;
  homeTeamAbbr: string;
  tipoff: string;
}

interface Props {
  latestScoredDate: string | null;
  latestScoredDayLabel: string | null;
  latestScoredMatchup: string | null;
  latestScoredLeanCount: number;
  cleanProjections: TrendingLean[];
  anomalyWatchlist: TrendingLean[];
  upcomingDate: string | null;
  upcomingDayLabel: string | null;
  upcomingGames: TrendingGame[];
}

export default function HomepageTrendingTabs(props: Props) {
  const [tab, setTab] = useState<TabKey>("projections");

  const tabs: { key: TabKey; label: string; sub: string }[] = [
    { key: "projections", label: "Projections", sub: "latest scored slate" },
    { key: "parlays", label: "Parlays", sub: "build mode entry" },
    { key: "upcoming", label: "Upcoming", sub: "next scheduled slate" },
  ];

  const tabRefs = useRef<Record<TabKey, HTMLButtonElement | null>>({
    projections: null,
    parlays: null,
    upcoming: null,
  });

  function focusTab(next: TabKey) {
    setTab(next);
    requestAnimationFrame(() => tabRefs.current[next]?.focus());
  }

  function onTabKeyDown(e: React.KeyboardEvent, current: TabKey) {
    const order: TabKey[] = ["projections", "parlays", "upcoming"];
    const idx = order.indexOf(current);
    if (e.key === "ArrowRight") {
      e.preventDefault();
      focusTab(order[(idx + 1) % order.length]);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      focusTab(order[(idx - 1 + order.length) % order.length]);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusTab(order[0]);
    } else if (e.key === "End") {
      e.preventDefault();
      focusTab(order[order.length - 1]);
    }
  }

  return (
    <section className="mt-24" aria-label="Trending model intelligence">
      {/* Section header */}
      <div className="flex items-baseline justify-between gap-3 mb-6 flex-wrap">
        <div>
          <div
            className="vault-quiet-label"
            style={{ color: "var(--vault-gold)", letterSpacing: "0.08em" }}
          >
            Trending
          </div>
          <h2
            className="mt-2 vault-display-h3"
            style={{ color: "var(--vault-text)" }}
          >
            What the model sees right now
          </h2>
        </div>
      </div>

      {/* Tab strip */}
      <div
        role="tablist"
        aria-label="Trending content"
        className="flex gap-1 mb-5 -mx-1 px-1 overflow-x-auto scrollbar-thin"
        style={{ borderBottom: "1px solid var(--vault-rule)" }}
      >
        {tabs.map(({ key, label, sub }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              ref={(el) => {
                tabRefs.current[key] = el;
              }}
              role="tab"
              type="button"
              id={`trending-tab-${key}`}
              aria-selected={active}
              aria-controls={`trending-panel-${key}`}
              tabIndex={active ? 0 : -1}
              onClick={() => setTab(key)}
              onKeyDown={(e) => onTabKeyDown(e, key)}
              className="relative shrink-0 px-4 sm:px-5 py-3 text-left transition-colors focus:outline-none"
              style={{
                marginBottom: "-1px",
                minWidth: "150px",
              }}
            >
              <div
                className="font-display text-[14px] sm:text-[15px] font-semibold tracking-tight"
                style={{
                  color: active
                    ? "var(--vault-gold-bright)"
                    : "var(--vault-text-mute)",
                }}
              >
                {label}
              </div>
              <div
                className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.12em]"
                style={{ color: "var(--vault-text-faint)" }}
              >
                {sub}
              </div>
              {active && (
                <span
                  aria-hidden
                  className="absolute left-3 right-3 -bottom-px h-px"
                  style={{
                    background:
                      "linear-gradient(90deg, transparent, var(--vault-gold-bright), transparent)",
                    boxShadow: "0 0 8px rgba(242, 54, 69, 0.45)",
                  }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Panels */}
      {tab === "projections" && (
        <ProjectionsPanel
          latestScoredDate={props.latestScoredDate}
          latestScoredDayLabel={props.latestScoredDayLabel}
          latestScoredMatchup={props.latestScoredMatchup}
          cleanProjections={props.cleanProjections}
          anomalyWatchlist={props.anomalyWatchlist}
        />
      )}
      {tab === "parlays" && (
        <ParlaysPanel
          latestScoredDate={props.latestScoredDate}
          latestScoredDayLabel={props.latestScoredDayLabel}
          latestScoredLeanCount={props.latestScoredLeanCount}
          upcomingDate={props.upcomingDate}
          upcomingDayLabel={props.upcomingDayLabel}
        />
      )}
      {tab === "upcoming" && (
        <UpcomingPanel
          upcomingDate={props.upcomingDate}
          upcomingDayLabel={props.upcomingDayLabel}
          upcomingGames={props.upcomingGames}
        />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Tab A — Projections
// ---------------------------------------------------------------------------
function ProjectionsPanel({
  latestScoredDate,
  latestScoredDayLabel,
  latestScoredMatchup,
  cleanProjections,
  anomalyWatchlist,
}: {
  latestScoredDate: string | null;
  latestScoredDayLabel: string | null;
  latestScoredMatchup: string | null;
  cleanProjections: TrendingLean[];
  anomalyWatchlist: TrendingLean[];
}) {
  if (!latestScoredDate) {
    return (
      <Panel id="trending-panel-projections" labelledBy="trending-tab-projections">
        <EmptyMessage
          heading="No scored slate available yet."
          body="Model projections appear here once a slate finishes scoring. Check back after the next refresh."
        />
      </Panel>
    );
  }

  const dateChip = `${latestScoredDayLabel ?? latestScoredDate}${
    latestScoredMatchup ? ` · ${latestScoredMatchup}` : ""
  }`;

  return (
    <Panel id="trending-panel-projections" labelledBy="trending-tab-projections">
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-3">
        <div
          className="font-mono text-[10px] uppercase tracking-[0.15em]"
          style={{ color: "var(--vault-text-faint)" }}
        >
          Strongest clean projections · {dateChip}
        </div>
        <Link
          href={`/board?date=${latestScoredDate}`}
          className="font-mono text-[11px] tracking-tight transition-colors"
          style={{ color: "var(--vault-gold)" }}
        >
          view full board →
        </Link>
      </div>

      {cleanProjections.length === 0 ? (
        <EmptyMessage
          heading="No clean projections in this slate."
          body="Every scored lean on the latest slate was flagged for review. Open the board to see context."
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {cleanProjections.map((l, i) => (
            <LeanRow key={`clean-${i}`} lean={l} />
          ))}
        </div>
      )}

      {anomalyWatchlist.length > 0 && (
        <div className="mt-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3 mb-3">
            <div
              className="font-mono text-[10px] uppercase tracking-[0.15em]"
              style={{ color: "var(--vault-warn)" }}
            >
              Model anomaly watchlist · 25%+ edges flagged for review
            </div>
            <Link
              href="/methodology"
              className="font-mono text-[11px] tracking-tight transition-colors"
              style={{ color: "var(--vault-text-mute)" }}
            >
              why →
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {anomalyWatchlist.map((l, i) => (
              <LeanRow key={`anomaly-${i}`} lean={l} flagged />
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}

function LeanRow({ lean, flagged }: { lean: TrendingLean; flagged?: boolean }) {
  const matchup =
    lean.team && lean.opponent ? `${lean.team} @ ${lean.opponent}` : null;
  return (
    <div
      className="vault-deluxe-card casino-glow-card px-4 py-3.5"
      style={
        flagged
          ? { borderColor: "rgba(242, 54, 69, 0.32)" }
          : undefined
      }
    >
      {/* Header: player + matchup chip */}
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <span
          className="font-display text-[16px] font-semibold tracking-tight"
          style={{ color: "var(--vault-text)" }}
        >
          {lean.playerName}
        </span>
        {matchup && (
          <span
            className="font-mono text-[10px] uppercase tracking-[0.14em]"
            style={{ color: "var(--vault-text-faint)" }}
          >
            {matchup}
          </span>
        )}
      </div>

      {/* Lean phrase — bigger display weight */}
      <div className="mt-2 font-display text-[15px] tracking-tight">
        <span style={{ color: "var(--vault-text-mute)" }}>{lean.side}</span>{" "}
        <span
          className="font-semibold"
          style={{
            color: flagged
              ? "var(--vault-warn)"
              : "var(--vault-gold-bright)",
          }}
        >
          {lean.line}
        </span>{" "}
        <span style={{ color: "var(--vault-text-mute)" }}>
          {lean.market}
        </span>
      </div>

      {/* Stats row */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        <StatChip
          label="proj"
          value={
            typeof lean.projection === "number"
              ? lean.projection.toFixed(1)
              : "—"
          }
        />
        <StatChip
          label="edge"
          value={
            typeof lean.edgePct === "number"
              ? `${lean.edgePct.toFixed(1)}%`
              : "—"
          }
          valueColor={flagged ? "var(--vault-warn)" : "var(--vault-gold)"}
        />
        <StatChip
          label="conf"
          value={String(lean.confidence)}
          valueColor={
            lean.confidence === "High"
              ? "var(--vault-gold-bright)"
              : lean.confidence === "Medium"
                ? "var(--vault-warn)"
                : "var(--vault-text-mute)"
          }
        />
        {flagged && (
          <span
            className="inline-flex items-center px-2 py-0.5 rounded-[3px] font-mono text-[10px] tracking-tight uppercase"
            style={{
              background: "var(--vault-warn-dim)",
              border: "1px solid rgba(242, 54, 69, 0.30)",
              color: "var(--vault-warn)",
            }}
          >
            model anomaly
          </span>
        )}
      </div>
    </div>
  );
}

function StatChip({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <span
      className="inline-flex items-baseline gap-1 px-2 py-0.5 rounded-[2px] font-mono text-[10px] tracking-tight"
      style={{
        background: "var(--vault-panel-elevated)",
        border: "1px solid var(--vault-border)",
      }}
    >
      <span
        className="uppercase tracking-[0.12em]"
        style={{ color: "var(--vault-text-faint)" }}
      >
        {label}
      </span>
      <span style={{ color: valueColor ?? "var(--vault-text)" }}>{value}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Tab B — Parlays
// ---------------------------------------------------------------------------
function ParlaysPanel({
  latestScoredDate,
  latestScoredDayLabel,
  latestScoredLeanCount,
  upcomingDate,
  upcomingDayLabel,
}: {
  latestScoredDate: string | null;
  latestScoredDayLabel: string | null;
  latestScoredLeanCount: number;
  upcomingDate: string | null;
  upcomingDayLabel: string | null;
}) {
  return (
    <Panel id="trending-panel-parlays" labelledBy="trending-tab-parlays">
      <div className="vault-deluxe-card casino-glow-card p-5 sm:p-6">
        <div
          className="font-mono text-[10px] uppercase tracking-[0.18em] mb-3"
          style={{ color: "var(--vault-gold)" }}
        >
          Parlay Lab · build mode
        </div>
        <h3
          className="font-display text-[20px] sm:text-[24px] font-semibold tracking-tight leading-snug"
          style={{ color: "var(--vault-text)" }}
        >
          Build candidate parlays from real model leans.
        </h3>
        <p
          className="mt-3 text-[14px] leading-relaxed max-w-2xl"
          style={{ color: "var(--vault-text-mute)" }}
        >
          Pick a risk profile, optionally restrict to specific players or
          markets, and the lab generates candidate combinations from leans
          the model has already scored. No fabricated lines, no invented
          odds — if the model doesn&rsquo;t have a lean on a player, that
          combination isn&rsquo;t available.
        </p>

        <ul
          className="mt-4 space-y-1.5 text-[13px]"
          style={{ color: "var(--vault-text-mute)" }}
        >
          {latestScoredDate && (
            <li>
              <span style={{ color: "var(--vault-gold-bright)" }}>·</span>{" "}
              Latest archive: <strong style={{ color: "var(--vault-text)" }}>{latestScoredDayLabel ?? latestScoredDate}</strong>
              {" "}({latestScoredLeanCount} model leans available)
            </li>
          )}
          {upcomingDate && (
            <li>
              <span style={{ color: "var(--vault-gold-bright)" }}>·</span>{" "}
              Upcoming slate: <strong style={{ color: "var(--vault-text)" }}>{upcomingDayLabel ?? upcomingDate}</strong>
              {" "}— parlays unlock once sportsbook lines load
            </li>
          )}
          <li>
            <span style={{ color: "var(--vault-gold-bright)" }}>·</span>{" "}
            Same-game legs are flagged for correlation. Risk profile is a
            label, not advice.
          </li>
        </ul>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/build#suggested-cards"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-[3px] font-medium text-[14px] tracking-tight transition-colors"
            style={{
              background: "var(--vault-gold)",
              color: "#0A0705",
            }}
          >
            Open Parlay Lab
            <span aria-hidden>→</span>
          </Link>
          {latestScoredDate && (
            <Link
              href={`/board?date=${latestScoredDate}`}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-[3px] font-medium text-[14px] tracking-tight transition-colors"
              style={{
                border: "1px solid var(--vault-border-strong)",
                color: "var(--vault-text)",
              }}
            >
              View latest scored board
            </Link>
          )}
        </div>
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Tab C — Upcoming slate
// ---------------------------------------------------------------------------
function UpcomingPanel({
  upcomingDate,
  upcomingDayLabel,
  upcomingGames,
}: {
  upcomingDate: string | null;
  upcomingDayLabel: string | null;
  upcomingGames: TrendingGame[];
}) {
  if (!upcomingDate || upcomingGames.length === 0) {
    return (
      <Panel id="trending-panel-upcoming" labelledBy="trending-tab-upcoming">
        <EmptyMessage
          heading="No upcoming slate on the schedule yet."
          body="When the next NBA games are confirmed, they'll appear here. Check back after the next scheduled update."
        />
      </Panel>
    );
  }

  return (
    <Panel id="trending-panel-upcoming" labelledBy="trending-tab-upcoming">
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-3">
        <div
          className="font-mono text-[10px] uppercase tracking-[0.15em]"
          style={{ color: "var(--vault-text-faint)" }}
        >
          Next slate · {upcomingDayLabel ?? upcomingDate}
        </div>
        <Link
          href={`/board?date=${upcomingDate}`}
          className="font-mono text-[11px] tracking-tight transition-colors"
          style={{ color: "var(--vault-gold)" }}
        >
          view slate →
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {upcomingGames.map((g) => (
          <div
            key={g.gameId}
            className="vault-deluxe-card casino-glow-card px-4 py-3"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span
                className="font-display text-[16px] font-semibold tracking-tight"
                style={{ color: "var(--vault-text)" }}
              >
                {g.awayTeamAbbr}
                <span
                  className="mx-2"
                  style={{ color: "var(--vault-text-faint)" }}
                >
                  @
                </span>
                {g.homeTeamAbbr}
              </span>
              <span
                className="font-mono text-[10px] uppercase tracking-[0.15em]"
                style={{ color: "var(--vault-text-faint)" }}
              >
                {formatTipoffLabel(g.tipoff)}
              </span>
            </div>
          </div>
        ))}
      </div>

      <p
        className="mt-4 text-[13px] leading-relaxed max-w-2xl"
        style={{ color: "var(--vault-text-mute)" }}
      >
        Schedule is in for {upcomingDayLabel ?? upcomingDate}. Sportsbook
        lines haven&rsquo;t loaded yet — projections appear here once they
        do.
      </p>

      <div className="mt-5 flex flex-wrap gap-3">
        <Link
          href={`/board?date=${upcomingDate}`}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-[3px] font-medium text-[14px] tracking-tight transition-colors"
          style={{
            background: "var(--vault-gold-dim)",
            border: "1px solid var(--vault-border-strong)",
            color: "var(--vault-gold-bright)",
          }}
        >
          View slate
          <span aria-hidden>→</span>
        </Link>
        <Link
          href="/build#suggested-cards"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-[3px] font-medium text-[14px] tracking-tight transition-colors"
          style={{
            border: "1px solid var(--vault-border)",
            color: "var(--vault-text-mute)",
          }}
        >
          Open Parlay Lab
        </Link>
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------
function Panel({
  id,
  labelledBy,
  children,
}: {
  id: string;
  labelledBy: string;
  children: React.ReactNode;
}) {
  return (
    <div
      id={id}
      role="tabpanel"
      aria-labelledby={labelledBy}
      tabIndex={0}
      className="vault-rise focus:outline-none"
    >
      {children}
    </div>
  );
}

function EmptyMessage({
  heading,
  body,
}: {
  heading: string;
  body: string;
}) {
  return (
    <div
      className="rounded-[3px] px-6 py-10 text-center"
      style={{
        border: "1px dashed var(--vault-border)",
        color: "var(--vault-text-mute)",
      }}
    >
      <div
        className="font-display text-[16px] font-semibold tracking-tight"
        style={{ color: "var(--vault-text)" }}
      >
        {heading}
      </div>
      <p className="mt-2 text-[13px] leading-relaxed max-w-md mx-auto">
        {body}
      </p>
    </div>
  );
}
