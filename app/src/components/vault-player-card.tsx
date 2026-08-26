"use client";

/**
 * VaultPlayerCard — premium board surface.
 *
 * One card per (date, gameId, playerId). Inside, up to three market
 * rows (PTS / REB / AST). Each market row presents:
 *   - the sportsbook pick (OVER/UNDER + line + odds)
 *   - the model projection paired visually with the line
 *   - the resulting edge and implied probability
 *   - bookmaker info, risk flags, and the model's reason
 *
 * Underlying alternates are preserved in the data — this component only
 * collapses them visually. The confidence pill at the top reflects the
 * BEST confidence among present markets so one High row brings the card
 * up to High overall.
 *
 * Extreme edges (>= 25%) paired with a suspicious_edge risk flag render
 * the edge in a calmer "model anomaly" treatment rather than gold so the
 * card never reads as "guaranteed money".
 */
import type { Market, ConfidenceTier } from "@/lib/types";
import type { PlayerCard, MarketRow } from "@/lib/grouping";
import {
  formatPercent,
  formatOdds,
  formatStat,
  marketLabel,
  EM_DASH,
} from "@/lib/format";
import PlayerCardTrends from "./player-card-trends";
import PlayerAvatar from "./player-avatar";
import { getPlayoffContext } from "./playoff-context";
import { useState } from "react";

interface Props {
  card: PlayerCard;
}

const CONFIDENCE_RANK: Record<ConfidenceTier, number> = {
  High: 0,
  Medium: 1,
  Low: 2,
  insufficient_data: 3,
  no_play: 4,
};

const CONFIDENCE_PILL: Record<
  string,
  { fg: string; bg: string; border: string; label: string }
> = {
  // Sprint 035: labels AND colours are neutral. The old palette (gold for High, muted for Low)
  // encoded the same inverted ranking the words did — on settled data the order runs A .4934,
  // B .5063, C .5172, so no category may be styled as the desirable one.
  High: {
    fg: "var(--vault-text-mute)",
    bg: "var(--vault-panel-elevated)",
    border: "var(--vault-border)",
    label: "Category A",
  },
  Medium: {
    fg: "var(--vault-text-mute)",
    bg: "var(--vault-panel-elevated)",
    border: "var(--vault-border)",
    label: "Category B",
  },
  Low: {
    fg: "var(--vault-text-mute)",
    bg: "var(--vault-panel-elevated)",
    border: "var(--vault-border)",
    label: "Category C",
  },
  insufficient_data: {
    fg: "var(--vault-text-faint)",
    bg: "var(--vault-panel-elevated)",
    border: "var(--vault-border)",
    label: "Not enough data",
  },
  no_play: {
    fg: "var(--vault-text-faint)",
    bg: "var(--vault-panel-elevated)",
    border: "var(--vault-border)",
    label: "Pass",
  },
};

const MARKET_ORDER: Market[] = ["PTS", "REB", "AST"];

// Friendlier labels for guardrail-emitted riskFlags. Anything not in
// this map falls back to underscore-to-space.
const RISK_FLAG_LABEL: Record<string, string> = {
  suspicious_edge: "Anomaly-flagged",
  news_risk_flag: "News risk",
  news_remove: "Removed by news",
  news_manual_review: "Manual review",
};

function riskFlagLabel(flag: string): string {
  return RISK_FLAG_LABEL[flag] ?? flag.replace(/_/g, " ");
}

const SUSPICIOUS_EDGE_PCT = 25;

// ---------------------------------------------------------------------------
// buildLeanReasonBullets
//
// Iteration 3: the pipeline's reason string is a semicolon-joined sentence
// chain like:
//
//   "Under 4.5: projection 3.4 (+7.1pp edge). last-5 avg 4.0 AST;
//    minutes trending down; playing at home."
//
// That reads as a shabby data-dump. This helper parses the recognised
// sub-strings the pipeline emits (see pipeline/score_model.py:215-225)
// and rebuilds the explanation as discrete bullet points that pair with
// the projection-vs-line visual. It NEVER fabricates fields — if a piece
// of context isn't in the reason or on the lean, no bullet is rendered
// for it.
//
// The bullets are returned as plain strings; the caller decides the
// visual treatment (list rendering, spacing, etc.).
// ---------------------------------------------------------------------------
interface BulletInput {
  reason?: string | null;
  market?: string;
  line?: number | null;
  projection?: number | null;
  edgePct?: number | null;
  homeAway?: string;
  opponent?: string;
  lean?: string;
  confidence?: string;
  riskFlags?: string[] | null;
  guardrail?: string | null;
  originalConfidence?: string | null;
}

interface ReasonBullet {
  /** Mono-uppercase label rendered to the left of the sentence. */
  label?: string;
  text: string;
  /** Visual tone — "warn" tints the marker amber. */
  tone?: "default" | "warn" | "mute";
}

function buildLeanReasonBullets(input: BulletInput): ReasonBullet[] {
  const bullets: ReasonBullet[] = [];
  const reason = input.reason || "";
  const market = input.market ?? "";

  // 1. Projection vs line — the headline bullet.
  if (
    typeof input.projection === "number" &&
    Number.isFinite(input.projection) &&
    typeof input.line === "number" &&
    Number.isFinite(input.line)
  ) {
    const diff = input.projection - input.line;
    const absDiff = Math.abs(diff).toFixed(1);
    if (Math.abs(diff) < 0.05) {
      bullets.push({
        label: "Projection",
        text: `Sits on the ${input.line} line at ${input.projection.toFixed(
          1,
        )}.`,
      });
    } else {
      bullets.push({
        label: "Projection",
        text: `${input.projection.toFixed(1)} — ${absDiff} ${
          diff > 0 ? "above" : "below"
        } the ${input.line} line.`,
      });
    }
  }

  // 2. Edge — surface the model's edge number explicitly as its own
  // bullet so the reader can see it inline with the rest of the story.
  // (The headline edge chip elsewhere on the card stays.) We only emit
  // this bullet when the lean is an actual Over/Under pick — for
  // No-Play / Pass the Verdict bullet below covers it instead.
  if (
    typeof input.edgePct === "number" &&
    Number.isFinite(input.edgePct) &&
    input.lean !== "No Play" &&
    input.lean !== "Pass"
  ) {
    const sign = input.edgePct >= 0 ? "+" : "";
    bullets.push({
      label: "Edge",
      text: `${sign}${input.edgePct.toFixed(1)}% over the market's implied probability.`,
    });
  }

  // 3. Recent form — combined last-5 / last-10 fragment. Cleaner
  // sentence than the raw pipeline string.
  const last5 = /last-5 avg ([\d.]+)/i.exec(reason);
  const last10 = /last-10 avg ([\d.]+)/i.exec(reason);
  if (last5 || last10) {
    const parts: string[] = [];
    if (last5) parts.push(`last-5 averaging ${last5[1]}`);
    if (last10) parts.push(`last-10 averaging ${last10[1]}`);
    bullets.push({
      label: "Recent form",
      text: `${parts.join(" · ")}${market ? ` ${market}` : ""}.`,
    });
  }

  // 4. Minutes trend — clean phrasing instead of the longer pipeline string.
  if (/minutes trending up/i.test(reason)) {
    bullets.push({
      label: "Minutes",
      text: "Trending up over the recent window.",
    });
  } else if (/minutes trending down/i.test(reason)) {
    bullets.push({
      label: "Minutes",
      text: "Trending down over the recent window.",
    });
  }

  // 4. Home / away context. Pairs neatly with Minutes when both fire.
  if (input.homeAway === "Home") {
    bullets.push({ label: "Context", text: "Playing at home." });
  } else if (input.homeAway === "Away" && input.opponent) {
    bullets.push({
      label: "Context",
      text: `Playing on the road at ${input.opponent}.`,
    });
  }

  // 5. Thin sample callout (when explicitly noted in the reason).
  const thinSample = /thin sample \((\d+) games?\)/i.exec(reason);
  if (thinSample) {
    bullets.push({
      label: "Sample",
      text: `Only ${thinSample[1]} recent game${
        thinSample[1] === "1" ? "" : "s"
      } informed the model.`,
      tone: "mute",
    });
  }

  // 6. Guardrail explanation — paired with the confidence cap. Use the
  // calmer "downgrade label" framing on anomalies so the card never
  // reads as "free money even though the model says no".
  const gr = input.guardrail;
  const orig = input.originalConfidence;
  if (gr === "R5_suspicious_edge") {
    bullets.push({
      label: "Higher variance",
      text: `Edge is unusually wide (≥25%). Confidence is capped at Low${
        orig ? ` — the raw model said ${orig}.` : "."
      }`,
      tone: "warn",
    });
  } else if (gr === "R2_extreme_edge_thin_sample") {
    bullets.push({
      label: "Higher variance",
      text:
        "Edge above 30% on a thin sample — the model declines to lean here.",
      tone: "warn",
    });
  } else if (gr === "R3_thin_sample_capped_medium") {
    bullets.push({
      label: "Limited history",
      text: `Fewer than 8 recent games — confidence capped at Medium${
        orig ? ` (originally ${orig}).` : "."
      }`,
      tone: "warn",
    });
  } else if (gr === "R4_thin_sample_capped_low") {
    bullets.push({
      label: "Limited history",
      text: `Fewer than 5 recent games — confidence capped at Low${
        orig ? ` (originally ${orig}).` : "."
      }`,
      tone: "warn",
    });
  } else if (gr === "R1_no_logs_insufficient_data") {
    bullets.push({
      label: "Limited history",
      text: "Recent log data unavailable — the model can't grade this prop yet.",
      tone: "warn",
    });
  }

  // 7. No-play / pass clarification.
  if (input.lean === "No Play" || input.lean === "Pass") {
    if (/No edge above threshold/i.test(reason) || !gr) {
      bullets.push({
        label: "Verdict",
        text: "Model passes — the edge does not clear the threshold.",
        tone: "mute",
      });
    }
  }

  // 8. Fallback: if nothing landed but the pipeline gave us a sentence,
  // surface it as a single neutral bullet so we never render an empty
  // explanation block.
  if (bullets.length === 0 && reason.trim().length > 0) {
    bullets.push({ text: reason.trim(), tone: "mute" });
  }

  return bullets;
}

export default function VaultPlayerCard({ card }: Props) {
  // Trend panel — default collapsed; opens on click. Preserves
  // aria-expanded / aria-controls relationship.
  const [trendsOpen, setTrendsOpen] = useState(false);

  // Best confidence across present markets → header pill.
  let bestConfidence: ConfidenceTier = "no_play";
  let bestRank = 99;
  for (const m of MARKET_ORDER) {
    const row = card.rows[m];
    if (!row) continue;
    const r = CONFIDENCE_RANK[row.primary.confidence] ?? 99;
    if (r < bestRank) {
      bestRank = r;
      bestConfidence = row.primary.confidence;
    }
  }

  const matchupArrow = card.homeAway === "Home" ? "vs" : "at";
  const presentRows = MARKET_ORDER.map((m) => card.rows[m]).filter(
    (r): r is MarketRow => Boolean(r),
  );

  return (
    <article
      id={`card-${card.cardKey}`}
      className="vault-deluxe-card casino-glow-card gtp-card-rim-led p-5 sm:p-6 scroll-mt-32 sm:scroll-mt-28"
      aria-label={`${card.playerName} — ${card.team} ${matchupArrow} ${card.opponent}`}
    >
      {/* ─── HEADER ─── */}
      <header className="flex items-start justify-between gap-3">
        <div className="gtp-player-profile min-w-0 flex-1">
          <PlayerAvatar
            playerId={card.playerId}
            playerName={card.playerName}
            team={card.team}
            size="md"
          />
          <div className="gtp-player-profile-body">
            <h3
              className="font-display font-semibold tracking-tight truncate"
              style={{
                color: "var(--vault-text)",
                fontSize: "clamp(18px, 2.4vw, 22px)",
                lineHeight: 1.15,
              }}
            >
              {card.playerName}
            </h3>
            <p
              className="mt-1 text-[13px] leading-snug truncate"
              style={{ color: "var(--vault-text-mute)" }}
            >
              <span style={{ color: "var(--vault-text)" }}>
                {card.team || EM_DASH}
              </span>{" "}
              <span style={{ color: "var(--vault-text-faint)" }}>
                {matchupArrow}
              </span>{" "}
              <span style={{ color: "var(--vault-text)" }}>
                {card.opponent || EM_DASH}
              </span>
              <span style={{ color: "var(--vault-text-faint)" }}> · </span>
              <span>{card.tipoff}</span>
            </p>
            {(() => {
              const ctx = getPlayoffContext(
                card.gameId,
                card.homeAway === "Home" ? card.opponent : card.team,
                card.homeAway === "Home" ? card.team : card.opponent,
              );
              if (!ctx.isPlayoffs) return null;
              return (
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <span className="gtp-game-chip">{ctx.gameLabel}</span>
                  <span
                    className="font-mono"
                    style={{
                      fontSize: 10,
                      color: "var(--vault-text-faint)",
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                    }}
                  >
                    {ctx.roundLabelCompact}
                  </span>
                </div>
              );
            })()}
          </div>
        </div>
        <ConfidenceTag confidence={bestConfidence} />
      </header>

      {/* ─── MARKET ROWS ─── */}
      <div className="mt-4">
        {presentRows.map((row, idx) => (
          <div key={row.market}>
            {idx > 0 && (
              <div
                className="my-4 h-px"
                style={{ background: "var(--vault-rule)" }}
              />
            )}
            <MarketRowView row={row} />
          </div>
        ))}
      </div>

      {/* ─── TRENDS TOGGLE + PANEL ─── */}
      <div
        className="mt-5 pt-4"
        style={{ borderTop: "1px solid var(--vault-rule)" }}
      >
        <button
          type="button"
          onClick={() => setTrendsOpen((v) => !v)}
          aria-expanded={trendsOpen}
          aria-controls={`trends-${card.cardKey}`}
          className="gtp-disclosure-trigger w-full flex items-center justify-between gap-2 px-3 py-2 rounded-[3px] focus:outline-none"
          style={{
            background: trendsOpen
              ? "var(--vault-gold-dim)"
              : "transparent",
            color: trendsOpen
              ? "var(--vault-gold-bright)"
              : "var(--vault-text-mute)",
            border: `1px solid ${trendsOpen ? "var(--vault-border-strong)" : "var(--vault-rule)"}`,
          }}
        >
          <span className="text-[12px] font-medium tracking-tight">
            {trendsOpen ? "Hide last 10 trends" : "Show last 10 trends"}
          </span>
          <span
            className="font-mono text-[12px] leading-none transition-transform"
            style={{
              transform: trendsOpen ? "rotate(180deg)" : "rotate(0deg)",
            }}
            aria-hidden="true"
          >
            ▾
          </span>
        </button>

        {trendsOpen && (
          <div id={`trends-${card.cardKey}`} className="mt-3">
            <PlayerCardTrends card={card} />
          </div>
        )}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// One market row inside the card
// ---------------------------------------------------------------------------
function MarketRowView({ row }: { row: MarketRow }) {
  const lean = row.primary;
  const isPass = lean.lean === "No Play" || lean.lean === "Pass";
  const hasProjection =
    typeof lean.projection === "number" && Number.isFinite(lean.projection);
  const pickSide: "OVER" | "UNDER" | null =
    lean.lean === "Over" ? "OVER" : lean.lean === "Under" ? "UNDER" : null;
  const pickOdds = pickSide === "UNDER" ? lean.oddsUnder : lean.oddsOver;
  const altCount = row.alternates.length;
  const hasRiskFlags = (lean.riskFlags?.length ?? 0) > 0;
  const isSuspicious = Boolean(
    lean.riskFlags?.includes("suspicious_edge"),
  );
  const reasonText = lean.reason;
  const hasFiniteEdge =
    typeof lean.edgePct === "number" && Number.isFinite(lean.edgePct);
  const dampedEdge =
    hasFiniteEdge && Math.abs(lean.edgePct as number) >= SUSPICIOUS_EDGE_PCT;

  return (
    <section>
      {/* TOP — market label + pick badge */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2 min-w-0">
          <span
            className="text-[13px] font-medium tracking-tight"
            style={{ color: "var(--vault-gold-bright)" }}
          >
            {marketLabel(row.market)}
          </span>
          {isPass && (
            <span
              className="text-[11px] tracking-tight"
              style={{ color: "var(--vault-text-faint)" }}
            >
              · model passes
            </span>
          )}
        </div>
        <PickBadge
          pickSide={pickSide}
          line={lean.line}
          odds={pickOdds}
        />
      </div>

      {/* HERO — projection vs line + edge */}
      {hasProjection ? (
        <div className="mt-3">
          <ProjectionLineRow
            projection={lean.projection as number}
            line={lean.line ?? null}
            pickSide={pickSide}
            edgePct={lean.edgePct ?? null}
            dampedEdge={dampedEdge}
            suspicious={isSuspicious}
          />
        </div>
      ) : (
        <p
          className="mt-3 text-[12px]"
          style={{ color: "var(--vault-text-faint)" }}
        >
          {lean.confidence === "no_play"
            ? "Model passes — below edge threshold."
            : "Projection unavailable — not enough recent log data."}
        </p>
      )}

      {/* META — implied · bookmaker · books · lines vary */}
      <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1.5 text-[11px]">
        {hasFiniteEdge && (
          <span style={{ color: "var(--vault-text-faint)" }}>
            Implied{" "}
            <span
              className="tabular"
              style={{ color: "var(--vault-text-mute)" }}
            >
              {formatPercent(lean.impliedProbability, 0)}
            </span>
          </span>
        )}
        <span style={{ color: "var(--vault-text-faint)" }}>
          {lean.bookmaker || EM_DASH}
        </span>
        {altCount > 0 && (
          <span
            className="px-1.5 py-0.5 rounded-[2px] text-[10px] tracking-tight"
            style={{
              color: "var(--vault-gold-bright)",
              background: "var(--vault-gold-dim)",
              border: "1px solid var(--vault-border-strong)",
            }}
            title={`Also offered by: ${row.bookmakers
              .filter((b) => b !== lean.bookmaker)
              .join(", ")}`}
          >
            +{altCount} {altCount === 1 ? "book" : "books"}
          </span>
        )}
        {row.hasMultipleLines && (
          <span style={{ color: "var(--vault-text-faint)" }}>
            · lines vary
          </span>
        )}
      </div>

      {/* RISK FLAGS — calm pill row */}
      {hasRiskFlags && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {lean.riskFlags!.map((flag) => (
            <span
              key={flag}
              className="px-2 py-0.5 rounded-[3px] text-[10px] tracking-tight"
              style={{
                color: "var(--vault-warn)",
                background: "var(--vault-warn-dim)",
                border: "1px solid color-mix(in srgb, var(--vault-accent) 30%, transparent)",
              }}
            >
              {riskFlagLabel(flag)}
            </span>
          ))}
        </div>
      )}

      {/* REASON — bulleted explanation (iteration 4). Each bullet has a
          short mono-uppercase label ("Projection", "Recent form",
          "Minutes", "Context", "downgrade label", "Verdict") so the
          reading rhythm reads as a sportsbook readout rather than a
          paragraph. Tagged bullets are sourced only from data already
          on the lean. */}
      {(() => {
        const bullets = buildLeanReasonBullets({
          reason: reasonText,
          market: row.market,
          line: lean.line ?? null,
          projection: lean.projection ?? null,
          edgePct: lean.edgePct ?? null,
          homeAway: lean.homeAway,
          opponent: lean.opponent,
          lean: lean.lean,
          confidence: lean.confidence,
          riskFlags: lean.riskFlags,
          guardrail: (lean as unknown as { _guardrail?: string | null })
            ._guardrail,
          originalConfidence: (
            lean as unknown as { _originalConfidence?: string | null }
          )._originalConfidence,
        });
        if (bullets.length === 0) return null;
        return (
          <div className="mt-3">
            <div className="gtp-reason-eyebrow">Why this lean</div>
            <ul className="gtp-reason-list">
              {bullets.map((b, i) => (
                <li key={i} data-tone={b.tone ?? "default"}>
                  <span aria-hidden className="gtp-reason-marker" />
                  <span>
                    {b.label && (
                      <span className="gtp-reason-label">{b.label}</span>
                    )}
                    {b.text}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        );
      })()}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Projection vs line visual — the new hero element of each market row.
// Renders the line on the left and the projection on the right (or vice
// versa) with a small directional bar between, so the gap is readable at
// a glance.
// ---------------------------------------------------------------------------
function ProjectionLineRow({
  projection,
  line,
  pickSide,
  edgePct,
  dampedEdge,
  suspicious,
}: {
  projection: number;
  line: number | null;
  pickSide: "OVER" | "UNDER" | null;
  edgePct: number | null;
  dampedEdge: boolean;
  suspicious: boolean;
}) {
  const projAboveLine = line != null ? projection > line : false;
  const direction: "above" | "below" | "equal" = (() => {
    if (line == null) return "equal";
    if (projection > line + 0.05) return "above";
    if (projection < line - 0.05) return "below";
    return "equal";
  })();

  // For the visual indicator we cap the rendered gap at ±50% of the line
  // value. Above 50% the bar fills the side completely; we don't try to
  // show "this is a 200% edge" visually since that scale is the whole point
  // of the model anomaly chip.
  let fillPct = 0;
  if (line != null && line > 0) {
    const ratio = Math.abs((projection - line) / line);
    fillPct = Math.max(0, Math.min(1, ratio / 0.5)) * 100;
  }

  // Edge formatting for the 3rd hero tile. Honest: when the edge is
  // capped by R5 (suspicious) we present it in warn-tone, never gold.
  const edgeIsFinite =
    typeof edgePct === "number" && Number.isFinite(edgePct);
  const edgeAbs = edgeIsFinite ? Math.abs(edgePct as number) : 0;
  // Cap the displayed magnitude at ±50 pp so a runaway anomaly doesn't
  // dominate the card; the model-anomaly chip already calls it out.
  const edgeDisplay = edgeIsFinite
    ? `${edgePct! > 0 ? "+" : edgePct! < 0 ? "−" : ""}${Math.min(edgeAbs, 50).toFixed(1)}%`
    : EM_DASH;
  const edgeColor = !edgeIsFinite
    ? "var(--vault-text-faint)"
    : suspicious || dampedEdge
      ? "var(--vault-warn)"
      : pickSide === "OVER" || pickSide === "UNDER"
        ? "var(--vault-gold-bright)"
        : "var(--vault-text-mute)";
  const edgeGlow = !edgeIsFinite || suspicious || dampedEdge
    ? "none"
    : "0 0 14px color-mix(in srgb, var(--vault-accent) 30%, transparent)";

  return (
    <div>
      {/* HERO scoreboard — 3 equal tiles: LINE · PROJECTION · EDGE.
          The previous 2-column "line vs projection + small edge chip"
          was hard to scan; this matches a sportsbook stat board. */}
      <div className="grid grid-cols-3 gap-2">
        <ScoreboardTile
          label="LINE"
          value={line != null ? formatStat(line) : EM_DASH}
          tone="mute"
        />
        <ScoreboardTile
          label="PROJECTION"
          value={formatStat(projection)}
          tone="gold"
          glow
        />
        <ScoreboardTile
          label="EDGE"
          value={edgeDisplay}
          tone={suspicious || dampedEdge ? "warn" : "gold-bright"}
          valueColor={edgeColor}
          glow={edgeGlow !== "none"}
        />
      </div>

      {/* Visual track — directional fill from line mid to projection
          side. Same data, calmer placement under the tiles. */}
      <div className="mt-3">
        <ProjectionVsLineTrack
          direction={direction}
          fillPct={fillPct}
          suspicious={suspicious}
        />
      </div>

      {/* Plain-English summary line */}
      <p
        className="mt-2 text-[11px]"
        style={{ color: "var(--vault-text-faint)" }}
      >
        {summaryLine({ direction, projection, line, pickSide })}
      </p>
    </div>
  );
}

/**
 * Premium 3-tile scoreboard cell. Used by ProjectionLineRow to render
 * LINE / PROJECTION / EDGE as the projection-card hero. Each tile has
 * a small mono eyebrow label and a big tabular value.
 */
function ScoreboardTile({
  label,
  value,
  tone,
  valueColor,
  glow,
}: {
  label: string;
  value: string;
  tone: "gold" | "gold-bright" | "warn" | "mute";
  /** Optional override for the value color (used by EDGE which needs
   *  per-state coloring beyond the tone preset). */
  valueColor?: string;
  glow?: boolean;
}) {
  const resolvedValueColor =
    valueColor ??
    (tone === "gold-bright"
      ? "var(--vault-gold-bright)"
      : tone === "warn"
        ? "var(--vault-warn)"
        : tone === "mute"
          ? "var(--vault-text)"
          : "var(--vault-gold)");
  const labelColor =
    tone === "warn"
      ? "var(--vault-warn)"
      : tone === "mute"
        ? "var(--vault-text-faint)"
        : "var(--vault-gold)";
  return (
    <div
      className="rounded-[5px] px-2.5 py-2 flex flex-col items-start justify-center"
      style={{
        background: "color-mix(in srgb, var(--vault-scrim-base) 55%, transparent)",
        border: "1px solid var(--vault-border)",
        minHeight: 56,
      }}
    >
      <div
        className="font-mono uppercase tracking-[0.14em]"
        style={{ color: labelColor, fontSize: 10 }}
      >
        {label}
      </div>
      <div
        className="mt-0.5 font-display font-semibold tabular tracking-tight whitespace-nowrap"
        style={{
          color: resolvedValueColor,
          fontSize: "clamp(20px, 3vw, 26px)",
          lineHeight: 1.05,
          textShadow: glow
            ? "0 0 12px color-mix(in srgb, var(--vault-accent) 35%, transparent)"
            : "none",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function summaryLine({
  direction,
  projection,
  line,
  pickSide,
}: {
  direction: "above" | "below" | "equal";
  projection: number;
  line: number | null;
  pickSide: "OVER" | "UNDER" | null;
}): string {
  if (line == null || direction === "equal") {
    return "Projection sits on the line.";
  }
  const diff = Math.abs(projection - line).toFixed(1);
  const projTxt = formatStat(projection);
  const lineTxt = formatStat(line);
  if (direction === "above") {
    if (pickSide === "OVER")
      return `Model: ${projTxt} vs line ${lineTxt} — ${diff} above the line.`;
    return `Model: ${projTxt} vs line ${lineTxt} — ${diff} above; pick declined.`;
  }
  if (pickSide === "UNDER")
    return `Model: ${projTxt} vs line ${lineTxt} — ${diff} below the line.`;
  return `Model: ${projTxt} vs line ${lineTxt} — ${diff} below; pick declined.`;
}

// Horizontal track. Line is a tick mark in the middle; the fill bar
// extends from the middle toward the projection side, capped at the edge.
function ProjectionVsLineTrack({
  direction,
  fillPct,
  suspicious,
}: {
  direction: "above" | "below" | "equal";
  fillPct: number;
  suspicious: boolean;
}) {
  const fillColor = suspicious
    ? "var(--vault-warn)"
    : direction === "equal"
    ? "var(--vault-text-faint)"
    : "var(--vault-gold)";

  return (
    <div
      role="presentation"
      aria-hidden="true"
      className="relative flex-1 h-1.5 rounded-full overflow-hidden"
      style={{ background: "var(--vault-panel-elevated)" }}
    >
      {/* center tick */}
      <span
        className="absolute top-0 bottom-0 w-px"
        style={{
          left: "50%",
          background: "var(--vault-border-strong)",
          transform: "translateX(-0.5px)",
        }}
      />
      {/* fill */}
      {direction !== "equal" && fillPct > 0 && (
        <span
          className="absolute top-0 bottom-0 rounded-full"
          style={{
            background: fillColor,
            left: direction === "below" ? `calc(50% - ${fillPct / 2}%)` : "50%",
            width: `${fillPct / 2}%`,
            opacity: 0.85,
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function PickBadge({
  pickSide,
  line,
  odds,
}: {
  pickSide: "OVER" | "UNDER" | null;
  line: number | null | undefined;
  odds: number | null | undefined;
}) {
  if (pickSide === null) {
    return (
      <span
        className="font-mono text-[11px] tabular tracking-wide"
        style={{ color: "var(--vault-text-faint)" }}
      >
        {EM_DASH} {formatStat(line)}
      </span>
    );
  }
  const arrow = pickSide === "OVER" ? "↑" : "↓";
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-mono text-[11px] tabular tracking-wide whitespace-nowrap"
      style={{
        color: "var(--vault-gold-bright)",
        background: "var(--vault-gold-dim)",
        border: "1px solid var(--vault-border-strong)",
      }}
    >
      <span aria-hidden="true">{arrow}</span>
      <span className="font-semibold">{pickSide}</span>
      <span style={{ color: "var(--vault-text)" }}>{formatStat(line)}</span>
      <span style={{ color: "var(--vault-text-mute)" }}>
        {formatOdds(odds)}
      </span>
    </span>
  );
}

function ConfidenceTag({ confidence }: { confidence: string }) {
  const cfg = CONFIDENCE_PILL[confidence] ?? CONFIDENCE_PILL.Low;
  return (
    <span
      className="vault-pill"
      style={{
        ["--pill-fg" as string]: cfg.fg,
        ["--pill-bg" as string]: cfg.bg,
        ["--pill-border" as string]: cfg.border,
      }}
    >
      {cfg.label}
    </span>
  );
}

function EdgeTag({
  edgePct,
  dampedEdge,
  suspicious,
}: {
  edgePct: number | null | undefined;
  dampedEdge: boolean;
  suspicious: boolean;
}) {
  const isFinite = typeof edgePct === "number" && Number.isFinite(edgePct);
  if (!isFinite) {
    return (
      <span
        className="font-mono font-semibold tabular tracking-wider rounded-[3px] px-2 py-0.5 text-[11px] whitespace-nowrap"
        style={{
          color: "var(--vault-text-faint)",
          background: "var(--vault-panel-elevated)",
          border: "1px solid var(--vault-border)",
        }}
      >
        {EM_DASH}
      </span>
    );
  }
  const sign = edgePct > 0 ? "+" : "";

  // Suspicious extreme edge → warn-tone treatment, not gold. This pairs
  // with the "Model anomaly" chip below the row so the card never reads
  // as "guaranteed money" no matter how large the headline number.
  if (dampedEdge && suspicious) {
    return (
      <span
        className="font-mono font-semibold tabular tracking-wider rounded-[3px] px-2 py-0.5 text-[11px] whitespace-nowrap"
        style={{
          color: "var(--vault-warn)",
          background: "var(--vault-warn-dim)",
          border: "1px solid color-mix(in srgb, var(--vault-accent) 30%, transparent)",
        }}
        title="Edge above 25% — visually capped because the model flagged this as an anomaly."
      >
        {sign}
        {edgePct.toFixed(1)}%
      </span>
    );
  }

  const positive = edgePct >= 0;
  return (
    <span
      className="font-mono font-semibold tabular tracking-wider rounded-[3px] px-2 py-0.5 text-[11px] whitespace-nowrap"
      style={{
        color: positive ? "var(--vault-gold-bright)" : "var(--vault-text-mute)",
        background: positive ? "var(--vault-gold-dim)" : "var(--vault-panel-elevated)",
        border: `1px solid ${
          positive ? "var(--vault-border-strong)" : "var(--vault-border)"
        }`,
      }}
    >
      {sign}
      {edgePct.toFixed(1)}%
    </span>
  );
}
