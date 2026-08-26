"use client";
/**
 * PlayerRecentFormDrawer — modal/sheet that opens when a parlay leg
 * is tapped.
 *
 * Honest data contract:
 *   - We render ONLY data already on the leg (recentSeries — up to 10
 *     numeric values for the relevant market). The pipeline persists
 *     these on every optimizer snapshot.
 *   - We never invent a game log or fabricate dates/opponents.
 *   - When recentSeries is missing, we render a clean fallback note.
 *   - When recentSeries is short (e.g. only a few values) we show what
 *     we have and label the count honestly.
 *
 * UX rules:
 *   - Esc closes; backdrop click closes.
 *   - Mobile: bottom-sheet style (full width, bottom-anchored).
 *   - Desktop: centered modal with max-width.
 *   - Focus trap is light-touch (focuses the close button on open).
 */
import { useEffect, useRef, useState } from "react";
import type { ParlayLeg } from "@/lib/parlay-suggested";
import { takeNewestFirst } from "@/lib/recent-form-order";
import { humanMarketLabel } from "@/lib/market-label";
import { PlayerPortrait, TeamLogo } from "@/components/entity";
import RecentFormSparkline from "./recent-form-sparkline";

interface Props {
  leg: ParlayLeg | null;
  onClose: () => void;
}

export default function PlayerRecentFormDrawer({ leg, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const [showLast10, setShowLast10] = useState(false);

  useEffect(() => {
    if (!leg) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    // Lock body scroll while modal is open.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setTimeout(() => closeRef.current?.focus(), 0);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [leg, onClose]);

  if (!leg) return null;

  // PR #116 ordering: the pipeline emits `recentGames` and
  // `recentSeries` in OLDEST → NEWEST order (matches sparkline
  // rendering). The drawer's "Last 5 games" label means the user's
  // MOST RECENT 5 games — so we reverse a copy and then take the
  // top 5 via `takeNewestFirst`. The same `limit=5` applied to both
  // arrays preserves the 1:1 alignment between `recentGames[i]` and
  // `recentSeries[i]` after ordering, so the value in row `i`
  // always matches the date/opponent in row `i`.
  const seriesOldestFirst = leg.recentSeries ?? [];
  const recentGamesOldestFirst = leg.recentGames ?? [];
  // Prefer the enriched `recentGames` rows when the pipeline provided
  // them (date/opponent/isHome). Otherwise fall back to the legacy
  // numeric series — never fabricate dates or opponents we don't have
  // on disk.
  // Default to the last 5 games (clear, immediate pattern). The optional
  // toggle expands to the last 10 only when the user asks — never the default.
  const totalAvailable = Math.max(
    recentGamesOldestFirst.length,
    seriesOldestFirst.length,
  );
  const canExpand = totalAvailable > 5;
  const windowN = showLast10 && canExpand ? 10 : 5;
  const enriched = takeNewestFirst(recentGamesOldestFirst, windowN);
  const recent5 = takeNewestFirst(seriesOldestFirst, windowN);
  const recentAvg =
    recentGamesOldestFirst.length > 0
      ? recentGamesOldestFirst.reduce((sum, r) => sum + (r.value ?? 0), 0) /
        recentGamesOldestFirst.length
      : seriesOldestFirst.length > 0
        ? seriesOldestFirst.reduce((sum, v) => sum + v, 0) /
          seriesOldestFirst.length
        : null;
  const totalCount =
    recentGamesOldestFirst.length > 0
      ? recentGamesOldestFirst.length
      : seriesOldestFirst.length;
  const stat = humanMarketLabel(leg.sport, leg.market, leg.marketLabel);
  // Sparkline wants newest-first; the takeNewestFirst above already
  // reversed the series. recent5 = newest-first numeric values.
  const sparklineValues = recent5;
  // Compute over/under summary across the available history for an
  // honest "X of Y cleared the line" subtitle. Skip when we have no
  // line.
  const clearedCount =
    leg.line != null
      ? recent5.filter((v) => v > (leg.line as number)).length
      : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Recent form for ${leg.playerName}`}
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ background: "color-mix(in srgb, var(--vault-ink-black) 65%, transparent)" }}
      />
      {/* Sheet / modal — flex column so the header stays put and the body
          scrolls independently. Uses 90dvh (dynamic viewport height) so mobile
          browser chrome never clips the bottom; falls back to vh on older UAs. */}
      <div
        className="relative w-full sm:max-w-md sm:rounded-[10px] rounded-t-[14px] overflow-hidden flex flex-col"
        style={{
          background: "color-mix(in srgb, var(--vault-scrim-base) 97%, transparent)",
          border: "1px solid var(--vault-border)",
          maxHeight: "90dvh",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <header
          className="flex items-center justify-between gap-3 px-4 py-3 shrink-0"
          style={{
            borderBottom: "1px solid var(--vault-rule)",
            background: "color-mix(in srgb, var(--vault-scrim-base) 97%, transparent)",
          }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <PlayerPortrait
              playerId={leg.playerId ?? null}
              name={leg.playerName}
              team={leg.team ?? undefined}
              sport={(leg.sport === "mlb" || leg.sport === "nba") ? (leg.sport as "mlb" | "nba") : "nba"}
              size="xl"
            />
            <div className="flex flex-col min-w-0">
              <span
                className="font-mono uppercase tracking-[0.16em]"
                style={{ color: "var(--vault-gold)", fontSize: 10 }}
              >
                Recent form · {leg.sport.toUpperCase()}
              </span>
              <span
                className="font-display tracking-tight truncate"
                style={{
                  color: "var(--vault-text)",
                  fontSize: 18,
                  fontWeight: 600,
                  lineHeight: 1.2,
                }}
              >
                {leg.playerName}
              </span>
              {leg.team ? (
                <span
                  className="flex items-center gap-1.5 mt-0.5"
                  style={{
                    color: "var(--vault-text-mute)",
                    fontSize: 12,
                  }}
                >
                  {(leg.sport === "mlb" || leg.sport === "nba" || leg.sport === "nhl") ? (
                    <TeamLogo
                      team={leg.team}
                      sport={leg.sport as "mlb" | "nba" | "nhl"}
                      size="sm"
                    />
                  ) : null}
                  <span>
                    {leg.team}
                    {leg.opponent ? ` vs ${leg.opponent}` : ""}
                  </span>
                </span>
              ) : null}
            </div>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="shrink-0 font-mono uppercase tracking-[0.14em] px-2 py-1 rounded-[4px]"
            style={{
              color: "var(--vault-text-mute)",
              border: "1px solid var(--vault-rule)",
              fontSize: 10,
              cursor: "pointer",
            }}
            aria-label="Close"
          >
            Close
          </button>
        </header>

        <div
          className="px-4 py-3 flex flex-col gap-3 overflow-y-auto flex-1 min-h-0"
          style={{ overscrollBehavior: "contain" }}
        >
          <PickSummary leg={leg} stat={stat} />
          {sparklineValues.length > 0 && (
            <TrendPanel
              values={sparklineValues}
              line={leg.line}
              statLabel={stat}
              clearedCount={clearedCount}
            />
          )}
          <WhyThisPick
            leg={leg}
            stat={stat}
            recentAvg={recentAvg}
            recentCount={totalCount}
            clearedCount={clearedCount}
            windowSize={recent5.length}
          />
          {canExpand && (
            <button
              type="button"
              onClick={() => setShowLast10((v) => !v)}
              className="self-start font-mono uppercase tracking-[0.14em] px-2.5 py-1 rounded-[4px]"
              style={{
                color: "var(--vault-gold-bright)",
                border: "1px solid var(--vault-rule)",
                fontSize: 10,
                cursor: "pointer",
              }}
              aria-pressed={showLast10}
            >
              {showLast10 ? "Show last 5" : "Show last 10"}
            </button>
          )}
          {enriched.length > 0 ? (
            <EnrichedRecentList
              games={enriched}
              statLabel={stat}
              line={leg.line}
              sport={leg.sport}
            />
          ) : recent5.length > 0 ? (
            <>
              <RecentList
                values={recent5}
                statLabel={stat}
                line={leg.line}
              />
              <p
                className="text-[11px] leading-snug"
                style={{ color: "var(--vault-text-faint)" }}
              >
                Per-game opponent / date metadata isn&apos;t attached to
                this source — we surface raw stat values only. Pipeline
                follow-up will enrich these rows.
              </p>
            </>
          ) : (
            <FallbackNote />
          )}
          {recentAvg !== null && (
            <p
              className="font-mono"
              style={{ color: "var(--vault-text-mute)", fontSize: 11 }}
            >
              Recent average · {stat} {recentAvg.toFixed(2)} on last{" "}
              {totalCount} {totalCount === 1 ? "game" : "games"} on record
            </p>
          )}
          <ProvenanceNote sport={leg.sport} />
        </div>
      </div>
    </div>
  );
}

/** Friendly, non-technical confidence label + tone. */
function friendlyConfidence(
  c: string | null | undefined,
): { label: string; color: string } | null {
  switch ((c || "").toLowerCase()) {
    case "high":
      return { label: "Category A", color: "var(--vault-text-mute)" };
    case "medium":
      return { label: "Worth a look", color: "var(--vault-warn)" };
    case "low":
      return { label: "Higher variance", color: "var(--vault-text-mute)" };
    default:
      return null;
  }
}

/** "-110" / "+120" from American odds. */
function fmtOdds(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n)) return null;
  return n > 0 ? `+${n}` : `${n}`;
}

/**
 * PickSummary — the single most important block in the drawer. The pick
 * is rendered large + obvious ("Over 2.5 3PM"), with a market badge, the
 * book price, the model projection/edge, and a plain-language confidence
 * chip. Every value is read straight off the leg — nothing fabricated.
 */
function PickSummary({ leg, stat }: { leg: ParlayLeg; stat: string }) {
  const conf = friendlyConfidence(leg.confidence);
  const odds = fmtOdds(leg.oddsForSide);
  const isOver = (leg.side || "").toLowerCase().startsWith("o");
  return (
    <div
      className="px-3.5 py-3 rounded-[8px] flex flex-col gap-2"
      style={{
        background: "color-mix(in srgb, var(--vault-ink-black) 40%, transparent)",
        border: "1px solid var(--vault-border)",
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className="font-mono uppercase tracking-[0.14em] px-2 py-0.5 rounded-[4px]"
          style={{
            color: "var(--vault-gold)",
            border: "1px solid var(--vault-rule)",
            fontSize: 10,
          }}
        >
          {stat}
        </span>
        {conf ? (
          <span
            className="font-mono uppercase tracking-[0.12em]"
            style={{ color: conf.color, fontSize: 10 }}
          >
            {conf.label}
          </span>
        ) : null}
      </div>
      {/* The pick — large + obvious */}
      <div className="flex items-baseline gap-2 flex-wrap">
        <span
          className="font-display"
          style={{
            color: isOver ? "var(--vault-success)" : "var(--vault-warn)",
            fontSize: 26,
            fontWeight: 700,
            lineHeight: 1.05,
          }}
        >
          {leg.side} {leg.line != null ? leg.line.toFixed(1) : "—"}
        </span>
        <span
          className="font-display"
          style={{ color: "var(--vault-text-mute)", fontSize: 15, fontWeight: 600 }}
        >
          {stat}
        </span>
      </div>
      {/* Price + book */}
      {(odds || leg.bookmaker) && (
        <span
          className="font-mono"
          style={{ color: "var(--vault-text)", fontSize: 12 }}
        >
          {odds ?? "—"}
          {leg.bookmaker ? ` · ${leg.bookmaker}` : ""}
        </span>
      )}
      {/* Model line */}
      {leg.projection != null && leg.edgePct != null && (
        <span
          className="font-mono"
          style={{ color: "var(--vault-text-mute)", fontSize: 11 }}
        >
          Model projects {leg.projection.toFixed(1)} {stat} · {leg.edgePct >= 0 ? "+" : ""}
          {leg.edgePct.toFixed(1)}pp vs the market
        </span>
      )}
    </div>
  );
}

/**
 * WhyThisPick — 2–4 plain-language bullets the model can justify from
 * data already on the leg. Never overclaims; only renders a bullet when
 * the underlying value exists.
 */
function WhyThisPick({
  leg,
  stat,
  recentAvg,
  recentCount,
  clearedCount,
  windowSize,
}: {
  leg: ParlayLeg;
  stat: string;
  recentAvg: number | null;
  recentCount: number;
  clearedCount: number | null;
  windowSize: number;
}) {
  const bullets: string[] = [];
  const isOver = (leg.side || "").toLowerCase().startsWith("o");
  if (recentAvg != null && recentCount > 0) {
    bullets.push(
      `Averaging ${recentAvg.toFixed(1)} ${stat} over the last ${recentCount} game${recentCount === 1 ? "" : "s"} on record.`,
    );
  }
  if (leg.projection != null && leg.line != null) {
    const diff = leg.projection - leg.line;
    bullets.push(
      `Model projects ${leg.projection.toFixed(1)} — ${Math.abs(diff).toFixed(1)} ${diff >= 0 ? "above" : "below"} the ${leg.line.toFixed(1)} line, supporting the ${leg.side} lean.`,
    );
  }
  if (clearedCount != null && windowSize > 0) {
    bullets.push(
      `${isOver ? "Cleared" : "Stayed under"} the line in ${isOver ? clearedCount : windowSize - clearedCount} of the last ${windowSize}.`,
    );
  }
  const conf = (leg.confidence || "").toLowerCase();
  if (conf === "low") {
    bullets.push(
      "Higher-variance market — treat as a lean, not a strong signal.",
    );
  } else if (["blk", "stl"].includes((leg.market || "").toLowerCase())) {
    bullets.push(
      "Blocks/steals are low-count, high-variance markets — capped conservatively.",
    );
  }
  if (bullets.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <span
        className="font-mono uppercase tracking-[0.16em]"
        style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
      >
        Why this pick
      </span>
      <ul className="flex flex-col gap-1 m-0 pl-4" style={{ listStyle: "disc" }}>
        {bullets.slice(0, 4).map((b, i) => (
          <li
            key={i}
            className="text-[12px] leading-snug"
            style={{ color: "var(--vault-text-mute)" }}
          >
            {b}
          </li>
        ))}
      </ul>
    </div>
  );
}

function RecentList({
  values,
  statLabel,
  line,
}: {
  values: number[];
  statLabel: string;
  line: number | null;
}) {
  // Compare each game to the line so the user sees which would have
  // hit. Honest — no fake context, just stat vs line.
  return (
    <div className="flex flex-col gap-1.5">
      <span
        className="font-mono uppercase tracking-[0.16em]"
        style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
      >
        Last {values.length} {values.length === 1 ? "game" : "games"} · {statLabel}
      </span>
      <ol className="flex flex-col gap-1">
        {values.map((v, i) => {
          const cleared = line != null ? v > line : null;
          return (
            <li
              key={i}
              className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-[4px]"
              style={{
                background: "color-mix(in srgb, var(--vault-ink-black) 25%, transparent)",
                border: "1px solid var(--vault-rule)",
              }}
            >
              <span
                className="font-mono uppercase tracking-[0.14em]"
                style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
              >
                G−{i + 1}
              </span>
              <span
                className="font-display tabular"
                style={{
                  color: "var(--vault-text)",
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                {Number.isInteger(v) ? v.toString() : v.toFixed(1)}
              </span>
              <span
                className="font-mono uppercase tracking-[0.12em]"
                style={{
                  color:
                    cleared === true
                      ? "var(--vault-success)"
                      : cleared === false
                        ? "var(--vault-warn)"
                        : "var(--vault-text-faint)",
                  fontSize: 10,
                  minWidth: 36,
                  textAlign: "right",
                }}
              >
                {cleared === true ? "Over" : cleared === false ? "Under" : "—"}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * PR #114: enriched recent-form list — renders date + opponent +
 * opponent team logo per row. Only used when the pipeline has
 * persisted the `recentGames` field on the leg; otherwise we fall
 * back to the legacy `RecentList` numeric view.
 */
function EnrichedRecentList({
  games,
  statLabel,
  line,
  sport,
}: {
  games: NonNullable<ParlayLeg["recentGames"]>;
  statLabel: string;
  line: number | null;
  sport: string;
}) {
  const logoSport: "nba" | "mlb" | "nhl" | null =
    sport === "nba" || sport === "mlb" || sport === "nhl"
      ? (sport as "nba" | "mlb" | "nhl")
      : null;
  // Honest provenance: flag only when MOST rows lack opponent/date metadata, so
  // a mostly-enriched list isn't noised up. Per-row gaps already render as "—".
  const missingMeta = games.filter((g) => !g.date || !g.opponent).length;
  const lowMetaCoverage = games.length > 0 && missingMeta > 2;
  return (
    <div className="flex flex-col gap-1.5">
      <span
        className="font-mono uppercase tracking-[0.16em]"
        style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
      >
        Last {games.length} {games.length === 1 ? "game" : "games"} · {statLabel}
      </span>
      <ol className="flex flex-col gap-1">
        {games.map((g, i) => {
          const cleared = line != null ? g.value > line : null;
          const dateLabel = _formatShortDate(g.date ?? null);
          const matchupPrefix = g.isHome === true ? "vs" : g.isHome === false ? "@" : "vs";
          return (
            <li
              key={i}
              className="grid grid-cols-[auto_1fr_auto_auto] gap-2 items-center px-2.5 py-1.5 rounded-[4px]"
              style={{
                background: "color-mix(in srgb, var(--vault-ink-black) 25%, transparent)",
                border: "1px solid var(--vault-rule)",
              }}
            >
              <span
                className="font-mono uppercase tracking-[0.12em]"
                style={{
                  color: "var(--vault-text-faint)",
                  fontSize: 10,
                  minWidth: 48,
                }}
              >
                {dateLabel ?? `G−${i + 1}`}
              </span>
              <span
                className="font-mono inline-flex items-center gap-1.5 min-w-0"
                style={{ color: "var(--vault-text-mute)", fontSize: 11 }}
              >
                <span>{matchupPrefix}</span>
                {g.opponent ? (
                  <>
                    {logoSport ? (
                      <TeamLogo
                        team={g.opponent}
                        sport={logoSport}
                        size="sm"
                      />
                    ) : null}
                    <span style={{ color: "var(--vault-text)" }}>
                      {g.opponent}
                    </span>
                  </>
                ) : (
                  <span style={{ color: "var(--vault-text-faint)" }}>—</span>
                )}
              </span>
              <span
                className="font-display tabular text-right"
                style={{
                  color: "var(--vault-text)",
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                {Number.isInteger(g.value) ? g.value : g.value.toFixed(1)}
              </span>
              <span
                className="font-mono uppercase tracking-[0.12em] text-right"
                style={{
                  color:
                    cleared === true
                      ? "var(--vault-success)"
                      : cleared === false
                        ? "var(--vault-warn)"
                        : "var(--vault-text-faint)",
                  fontSize: 10,
                  minWidth: 40,
                }}
              >
                {cleared === true ? "Over" : cleared === false ? "Under" : "—"}
              </span>
            </li>
          );
        })}
      </ol>
      {lowMetaCoverage && (
        <p
          className="text-[11px] leading-snug"
          style={{ color: "var(--vault-text-faint)" }}
        >
          Opponent / date metadata is missing for {missingMeta} of {games.length}{" "}
          recent games from this source — stat values are still accurate.
        </p>
      )}
    </div>
  );
}

/** "2026-05-23" → "May 23". Returns null on parse failure. */
function _formatShortDate(iso: string | null): string | null {
  if (!iso) return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const mi = parseInt(m[2], 10) - 1;
  const day = parseInt(m[3], 10);
  if (mi < 0 || mi > 11 || isNaN(day)) return null;
  return `${months[mi]} ${day}`;
}

function FallbackNote() {
  return (
    <p
      className="text-[12px] leading-snug px-2.5 py-2 rounded-[4px]"
      style={{
        color: "var(--vault-text-mute)",
        background: "color-mix(in srgb, var(--vault-ink-black) 25%, transparent)",
        border: "1px dashed var(--vault-border)",
      }}
    >
      Game-by-game log unavailable for this leg. We don&apos;t fabricate
      rows when the underlying recent-form data is missing.
    </p>
  );
}

/** Compact trend panel — sparkline + "X of Y cleared" eyebrow. The
 *  sparkline values are always passed newest-first to match the list
 *  rendered below; it visualises the same five games. */
function TrendPanel({
  values,
  line,
  statLabel,
  clearedCount,
}: {
  values: number[];
  line: number | null;
  statLabel: string;
  clearedCount: number | null;
}) {
  if (values.length === 0) return null;
  return (
    <div
      className="px-3 py-3 rounded-[6px] flex flex-col gap-2"
      style={{
        background: "color-mix(in srgb, var(--vault-ink-black) 30%, transparent)",
        border: "1px solid var(--vault-rule)",
      }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span
          className="font-mono uppercase tracking-[0.16em]"
          style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
        >
          Trend · {statLabel}
        </span>
        {clearedCount !== null && line !== null && (
          <span
            className="font-mono"
            style={{ color: "var(--vault-text-mute)", fontSize: 11 }}
          >
            {clearedCount} of {values.length} cleared {line.toFixed(1)}
          </span>
        )}
      </div>
      <div className="flex justify-center">
        <RecentFormSparkline values={values} threshold={line} />
      </div>
      {line !== null && (
        <span
          className="font-mono"
          style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
        >
          Dashed line = prop line ({line.toFixed(1)}). Bars above = cleared.
        </span>
      )}
    </div>
  );
}

/** Honest data-source note. Recent-form values come from settlement
 *  feeds (MLB Stats API / nba_api) attached to each leg by the morning
 *  pipeline. Game-time string (PR `feature/leg-game-time-threading`) is
 *  sourced from pregame board metadata — never fabricated, and only
 *  shown on legs whose board carried a usable start time. */
function ProvenanceNote({ sport }: { sport: string }) {
  const s = (sport || "").toLowerCase();
  const sourceLabel =
    s === "mlb"
      ? "MLB Stats API"
      : s === "nba"
        ? "ESPN"
        : "settlement feed";
  return (
    <p
      className="text-[10.5px] leading-snug rounded-[4px] px-2.5 py-1.5"
      style={{
        color: "var(--vault-text-faint)",
        background: "color-mix(in srgb, var(--vault-ink-black) 20%, transparent)",
        border: "1px dashed var(--vault-rule)",
      }}
    >
      Recent-form values from {sourceLabel} via the daily settlement
      pipeline. Game time is sourced from pregame board metadata when
      available — when the source doesn&apos;t carry one, the leg shows
      the date only.
    </p>
  );
}
