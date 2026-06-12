/**
 * AnatomyCallout — homepage educational module that takes a real loaded
 * star lean and renders it as a labeled "anatomy of a projection"
 * diagram. Pure presentation — no fabrication: the caller passes the
 * exact values from a real PropLean and the component only annotates
 * them.
 *
 * Reads as a Vegas sportsbook explanatory plate, not a how-to article.
 * Used on the homepage between the "What's on the floor" tiles and the
 * three-step explainer.
 */
import type { ReactNode } from "react";
import Link from "next/link";
import PlayerAvatar from "./player-avatar";
import { getPlayoffContext } from "./playoff-context";
import { confidenceLabel } from "@/lib/confidence-labels";

interface Props {
  playerName: string;
  /** NBA stats player ID for the headshot. */
  playerId?: number;
  /** Game ID for playoff context decoding. */
  gameId?: string;
  /** Away team abbreviation (used for playoff conference inference). */
  awayTeamAbbr?: string;
  /** Home team abbreviation. */
  homeTeamAbbr?: string;
  /** Player's own team for the avatar corner chip. */
  team?: string;
  matchup: string;
  market: string;
  side: string;
  line: number;
  projection: number;
  edgePct: number;
  confidence: string;
  /** When true, the example card carries a "model anomaly" badge. */
  anomaly?: boolean;
  /** Anchor link that jumps to the full player card on the board. */
  cardAnchorHref?: string;
}

export default function AnatomyCallout({
  playerName,
  playerId,
  gameId,
  awayTeamAbbr,
  homeTeamAbbr,
  team,
  matchup,
  market,
  side,
  line,
  projection,
  edgePct,
  confidence,
  anomaly,
  cardAnchorHref,
}: Props) {
  const edgeSign = edgePct >= 0 ? "+" : "";
  const projectionDelta = projection - line;
  const deltaLabel = `${projectionDelta >= 0 ? "+" : ""}${projectionDelta.toFixed(1)}`;
  const playoff = getPlayoffContext(gameId, awayTeamAbbr, homeTeamAbbr);
  return (
    <section className="mt-20 reveal">
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-5">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="inline-block w-1.5 h-1.5 rounded-full gtp-neon-pulse"
            style={{
              background: "var(--vault-gold-bright)",
              boxShadow: "0 0 8px rgba(240, 199, 94, 0.6)",
            }}
          />
          <span
            className="font-mono text-[10px] uppercase tracking-[0.18em]"
            style={{ color: "var(--vault-gold)" }}
          >
            Anatomy of a projection
          </span>
        </div>
        {cardAnchorHref && (
          <Link
            href={cardAnchorHref}
            className="font-mono tracking-tight transition-colors"
            style={{ color: "var(--vault-gold)", fontSize: 12 }}
          >
            see this card on the board →
          </Link>
        )}
      </div>

      <div className="gtp-anatomy-callout">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(260px,320px)] gap-6 lg:gap-10 items-start">
          {/* Left — the example card surface */}
          <div className="vault-deluxe-card casino-glow-card p-5">
            <header className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <span className="gtp-player-spotlight">
                  <PlayerAvatar
                    playerId={playerId}
                    playerName={playerName}
                    team={team}
                    size="md"
                  />
                </span>
                <div className="min-w-0">
                <h3
                  className="font-display font-semibold tracking-tight"
                  style={{
                    color: "var(--vault-text)",
                    fontSize: "clamp(18px, 2.2vw, 22px)",
                    lineHeight: 1.15,
                  }}
                >
                  {playerName}
                </h3>
                <p
                  className="mt-1 text-[13px] leading-snug"
                  style={{ color: "var(--vault-text-mute)" }}
                >
                  {matchup}
                </p>
                {playoff.isPlayoffs && (
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <span className="gtp-game-chip">{playoff.gameLabel}</span>
                    <span
                      className="font-mono"
                      style={{
                        fontSize: 10,
                        color: "var(--vault-text-faint)",
                        letterSpacing: "0.14em",
                        textTransform: "uppercase",
                      }}
                    >
                      {playoff.roundLabelCompact}
                    </span>
                  </div>
                )}
                </div>
              </div>
              <ConfidencePill confidence={confidence} />
            </header>

            <div
              className="mt-4 grid grid-cols-3 gap-2 rounded-[4px] px-3 py-3"
              style={{
                background: "var(--vault-panel)",
                border: "1px solid var(--vault-rule)",
              }}
            >
              <Cell
                label="line"
                value={`${side} ${line}`}
                tone="default"
              />
              <Cell
                label="projection"
                value={projection.toFixed(1)}
                tone="gold"
                sub={`${deltaLabel} vs line`}
              />
              <Cell
                label="edge"
                value={`${edgeSign}${edgePct.toFixed(1)}%`}
                tone={anomaly ? "warn" : "gold"}
                sub={anomaly ? "model anomaly" : "clean"}
              />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span
                className="inline-flex items-center gap-1.5 font-mono"
                style={{
                  fontSize: 11,
                  color: "var(--vault-text-faint)",
                  letterSpacing: "0.02em",
                }}
              >
                <span style={{ color: "var(--vault-text-mute)" }}>
                  {market}
                </span>
                <span>·</span>
                <span>{side}</span>
                <span>·</span>
                <span style={{ color: "var(--vault-gold)" }}>{line}</span>
              </span>
            </div>
          </div>

          {/* Right — annotation column */}
          <div className="flex flex-col gap-2.5">
            <Annotation
              eyebrow="01 · who"
              body={
                <>
                  <strong>Player + matchup</strong> tells you which game
                  the projection lives in. Tipoff and home/away change
                  how the model weights recent form.
                </>
              }
            />
            <Annotation
              eyebrow="02 · line"
              body={
                <>
                  The <strong>sportsbook line</strong> is the threshold
                  the market quoted. The side (<em>{side}</em>) is the
                  direction the model leans.
                </>
              }
            />
            <Annotation
              eyebrow="03 · projection"
              body={
                <>
                  The <strong>model projection</strong> ({projection.toFixed(1)}) is
                  the number our pipeline expects. {deltaLabel} away from
                  the line is the raw gap.
                </>
              }
            />
            <Annotation
              eyebrow="04 · edge"
              body={
                <>
                  <strong>Edge</strong> ({edgeSign}{edgePct.toFixed(1)}%) is
                  model probability minus implied probability. {anomaly
                    ? "This one is flagged as a model anomaly — confidence is auto-capped."
                    : "A clean edge clears the threshold without tripping any guardrail."}
                </>
              }
            />
            <Annotation
              eyebrow="05 · confidence"
              body={
                <>
                  <strong>{confidence}</strong> reflects sample size,
                  recent-form quality, and guardrail state. Every market
                  on the board carries its own tier — no card is graded
                  as a sure thing.
                </>
              }
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function Cell({
  label,
  value,
  tone,
  sub,
}: {
  label: string;
  value: string;
  tone: "default" | "gold" | "warn";
  sub?: string;
}) {
  const valueColor =
    tone === "gold"
      ? "var(--vault-gold-bright)"
      : tone === "warn"
        ? "var(--vault-warn)"
        : "var(--vault-text)";
  return (
    <div>
      <div
        className="font-mono"
        style={{
          fontSize: 10,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--vault-text-faint)",
        }}
      >
        {label}
      </div>
      <div
        className="font-display font-semibold tabular tracking-tight"
        style={{ fontSize: 18, color: valueColor, lineHeight: 1.15 }}
      >
        {value}
      </div>
      {sub && (
        <div
          className="font-mono"
          style={{
            fontSize: 10,
            color: "var(--vault-text-faint)",
            letterSpacing: "0.04em",
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

function ConfidencePill({ confidence }: { confidence: string }) {
  const isHigh = confidence === "High";
  const isMed = confidence === "Medium";
  const fg = isHigh
    ? "var(--vault-gold-bright)"
    : isMed
      ? "var(--vault-warn)"
      : "var(--vault-text-mute)";
  const bg = isHigh
    ? "var(--vault-gold-dim)"
    : isMed
      ? "var(--vault-warn-dim)"
      : "var(--vault-panel-elevated)";
  const border = isHigh || isMed
    ? "var(--vault-border-strong)"
    : "var(--vault-border)";
  const label = confidenceLabel(confidence);
  return (
    <span
      className="inline-flex items-center px-2.5 py-1 rounded-[3px] font-mono"
      style={{
        fontSize: 10,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: fg,
        background: bg,
        border: `1px solid ${border}`,
      }}
    >
      {label}
    </span>
  );
}

function Annotation({
  eyebrow,
  body,
}: {
  eyebrow: string;
  body: ReactNode;
}) {
  return (
    <div className="gtp-anatomy-note">
      <span className="gtp-anatomy-eyebrow">{eyebrow}</span>
      <span className="gtp-anatomy-text">{body}</span>
    </div>
  );
}
