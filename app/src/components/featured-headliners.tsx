"use client";

/**
 * FeaturedHeadliners — compact "star spotlight" rail above the main
 * board grid.
 *
 * Iteration 4 redesign:
 *
 * The previous version (iteration 3) duplicated full VaultPlayerCard
 * components above the grid, which made the page very tall and
 * effectively showed the same card twice. This redesign renders
 * compact "headliner tiles" instead — each tile summarises the
 * player's best loaded lean and anchor-links to their full card
 * lower on the same page (#card-{cardKey}). The full cards remain in
 * the main grid below, so nothing is duplicated.
 *
 * It NEVER fabricates a missing star. If a configured star's team is
 * on tonight's slate but their props were not in the loaded feed, the
 * rail surfaces an honest "not in loaded feed" note.
 *
 * The curated star list is a small local constant and is a visibility
 * heuristic, not a recommendation. Order in the list determines the
 * render order in the rail.
 */
import type { PlayerCard, MarketRow } from "@/lib/grouping";
import type { Market, PropLean } from "@/lib/types";
import PlayerAvatar from "./player-avatar";
import { getPlayoffContext } from "./playoff-context";

interface Props {
  /** All player cards on the visible slate. */
  playerCards: PlayerCard[];
  /** Team abbreviations of the games on tonight's slate. */
  slateTeams: Set<string>;
}

// Curated star list. Order is the rendering priority when multiple are
// loaded. Each entry includes the player's primary team so the
// "not in feed" callout only fires when the player's team is actually
// on tonight's slate.
const STAR_PRIORITY: Array<{ name: string; team: string }> = [
  { name: "Anthony Edwards", team: "MIN" },
  { name: "Victor Wembanyama", team: "SAS" },
  { name: "Donovan Mitchell", team: "CLE" },
  { name: "Cade Cunningham", team: "DET" },
  { name: "James Harden", team: "CLE" },
  { name: "Evan Mobley", team: "CLE" },
  { name: "Jarrett Allen", team: "CLE" },
  { name: "Jalen Duren", team: "DET" },
  { name: "Julius Randle", team: "MIN" },
  { name: "Rudy Gobert", team: "MIN" },
  { name: "De'Aaron Fox", team: "SAS" },
  { name: "Stephon Castle", team: "SAS" },
];

const MARKET_LABEL: Record<Market, string> = {
  PTS: "Points",
  REB: "Rebounds",
  AST: "Assists",
};

const CONF_TONE: Record<
  string,
  { fg: string; bg: string; border: string; label: string }
> = {
  High: {
    fg: "var(--vault-gold-bright)",
    bg: "var(--vault-gold-dim)",
    border: "var(--vault-border-strong)",
    label: "High",
  },
  Medium: {
    fg: "var(--vault-warn)",
    bg: "var(--vault-warn-dim)",
    border: "color-mix(in srgb, var(--vault-accent) 30%, transparent)",
    label: "Medium",
  },
  Low: {
    fg: "var(--vault-text-mute)",
    bg: "var(--vault-panel-elevated)",
    border: "var(--vault-border)",
    label: "Low",
  },
  insufficient_data: {
    fg: "var(--vault-text-faint)",
    bg: "var(--vault-panel-elevated)",
    border: "var(--vault-border)",
    label: "No data",
  },
  no_play: {
    fg: "var(--vault-text-faint)",
    bg: "var(--vault-panel-elevated)",
    border: "var(--vault-border)",
    label: "Pass",
  },
};

interface HeadlinerSummary {
  player: string;
  playerId: number;
  team: string;
  opponent: string;
  homeAway: string;
  tipoff: string;
  gameId: string;
  market: Market;
  side: string;
  line: number | null | undefined;
  edgePct: number | null | undefined;
  confidence: string;
  isAnomaly: boolean;
  cardKey: string;
}

/**
 * Pick the most newsworthy lean for a star's card.
 *
 * Priority:
 *   1. High-confidence clean lean (no suspicious_edge) with largest |edge|
 *   2. Medium-confidence clean lean with largest |edge|
 *   3. Any anomaly-flagged lean with largest |edge|
 *   4. First lean we find
 *
 * This way the rail surfaces a usable "High +12% Points" before falling
 * back to "Low +43% (anomaly)" — anomalies are still surfaced but never
 * win out over clean signal.
 */
function pickBestLean(card: PlayerCard): HeadlinerSummary | null {
  const rows: { market: Market; row: MarketRow }[] = [];
  for (const m of ["PTS", "REB", "AST"] as Market[]) {
    const row = card.rows[m];
    if (row) rows.push({ market: m, row });
  }
  if (rows.length === 0) return null;

  // Sprint 035: was |edgePct| tiered by confidence — both inverted on settled results
  // (High .4934 vs Low .5172; 20+pp .4317 vs .5203 under 2.5pp, n=21,192). Headliners now pick the
  // highest model probability, and confidence no longer tiers the candidate pool.
  const score = (lean: PropLean): number => {
    const p = lean.modelProbability;
    return typeof p === "number" && Number.isFinite(p) && p > 0 ? p : -1;
  };
  const isAnomaly = (lean: PropLean): boolean =>
    (lean.riskFlags ?? []).includes("suspicious_edge");

  // Anomaly rows stay demoted — that exclusion IS backed by settled data (.4342 over n=760).
  const tiers: Array<(lean: PropLean) => boolean> = [
    (l) => !isAnomaly(l),
    () => true,
  ];

  for (const accept of tiers) {
    let best: { market: Market; row: MarketRow; lean: PropLean; s: number } | null =
      null;
    for (const r of rows) {
      const lean = r.row.primary;
      if (!accept(lean)) continue;
      const s = score(lean);
      if (!best || s > best.s) best = { market: r.market, row: r.row, lean, s };
    }
    if (best) {
      return {
        player: card.playerName,
        playerId: card.playerId,
        team: card.team,
        opponent: card.opponent,
        homeAway: card.homeAway,
        tipoff: card.tipoff,
        gameId: card.gameId,
        market: best.market,
        side: best.lean.lean,
        line: best.lean.line,
        edgePct: best.lean.edgePct,
        confidence: best.lean.confidence,
        isAnomaly: isAnomaly(best.lean),
        cardKey: card.cardKey,
      };
    }
  }
  return null;
}

export default function FeaturedHeadliners({
  playerCards,
  slateTeams,
}: Props) {
  const cardByName = new Map<string, PlayerCard>();
  for (const c of playerCards) cardByName.set(c.playerName, c);

  const summaries: HeadlinerSummary[] = [];
  const missingOnSlate: string[] = [];
  for (const star of STAR_PRIORITY) {
    const c = cardByName.get(star.name);
    if (c) {
      const s = pickBestLean(c);
      if (s) summaries.push(s);
    } else if (slateTeams.has(star.team)) {
      missingOnSlate.push(star.name);
    }
  }

  if (summaries.length === 0 && missingOnSlate.length === 0) {
    return null;
  }

  return (
    <section
      className="gtp-rail-frame relative"
      aria-label="Star headliner spotlight"
    >
      <span aria-hidden className="gtp-rail-sweep" />
      <span aria-hidden className="gtp-rail-bracket gtp-rail-bracket-tl" />
      <span aria-hidden className="gtp-rail-bracket gtp-rail-bracket-tr" />
      <span aria-hidden className="gtp-rail-bracket gtp-rail-bracket-bl" />
      <span aria-hidden className="gtp-rail-bracket gtp-rail-bracket-br" />
      {/* Section header */}
      <div className="relative flex flex-wrap items-baseline justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="inline-block w-1.5 h-1.5 rounded-full gtp-neon-pulse"
            style={{
              background: "var(--vault-gold-bright)",
              boxShadow: "0 0 10px color-mix(in srgb, var(--vault-accent) 70%, transparent)",
            }}
          />
          <div>
            <div
              className="font-mono uppercase tracking-[0.18em]"
              style={{ color: "var(--vault-gold)", fontSize: 10 }}
            >
              Headliners · star spotlight
            </div>
            <h2
              className="mt-1 vault-display-h3"
              style={{ color: "var(--vault-text)" }}
            >
              Star players on tonight&apos;s slate
            </h2>
          </div>
        </div>
        <span
          className="text-[11px]"
          style={{ color: "var(--vault-text-faint)" }}
        >
          {summaries.length} loaded · tap a tile to jump to the full card
        </span>
      </div>

      {/* Tile grid — compact summaries that anchor-scroll to the full
          card in the main grid below. */}
      {summaries.length > 0 && (
        <div
          className="grid gap-2.5"
          style={{
            gridTemplateColumns:
              "repeat(auto-fill, minmax(min(100%, 240px), 1fr))",
          }}
        >
          {summaries.map((s) => (
            <HeadlinerTile key={s.cardKey} summary={s} />
          ))}
        </div>
      )}

      {missingOnSlate.length > 0 && (
        <p
          className="mt-4 px-3 py-2.5 rounded-[3px] text-[12px] leading-relaxed"
          style={{
            background: "var(--vault-panel)",
            border: "1px solid var(--vault-rule)",
            color: "var(--vault-text-mute)",
          }}
        >
          <span
            style={{
              color: "var(--vault-text-faint)",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
            }}
          >
            Not in feed ·
          </span>{" "}
          <span style={{ color: "var(--vault-text)" }}>
            {missingOnSlate.join(", ")}
          </span>{" "}
          props were not in the loaded sportsbook feed for this slate.
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// HeadlinerTile — compact summary card with anchor link to full grid card.
// ---------------------------------------------------------------------------
function HeadlinerTile({ summary }: { summary: HeadlinerSummary }) {
  const conf =
    CONF_TONE[summary.confidence] ?? CONF_TONE["Low"];
  const matchupArrow = summary.homeAway === "Home" ? "vs" : "at";
  const edgeText =
    typeof summary.edgePct === "number" && Number.isFinite(summary.edgePct)
      ? `${summary.edgePct > 0 ? "+" : ""}${summary.edgePct.toFixed(1)}%`
      : "—";
  const lineText =
    typeof summary.line === "number" && Number.isFinite(summary.line)
      ? summary.line
      : "—";

  const ctx = getPlayoffContext(
    summary.gameId,
    summary.homeAway === "Home" ? summary.opponent : summary.team,
    summary.homeAway === "Home" ? summary.team : summary.opponent,
  );

  return (
    <a
      href={`#card-${summary.cardKey}`}
      className="gtp-headliner-tile group block"
      aria-label={`${summary.player} — view full card`}
    >
      {/* Top row: avatar + player name + small chevron */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5 min-w-0">
          <PlayerAvatar
            playerId={summary.playerId}
            playerName={summary.player}
            team={summary.team}
            size="sm"
          />
          <div className="min-w-0">
            <h3
              className="font-display font-semibold tracking-tight truncate"
              style={{
                color: "var(--vault-text)",
                fontSize: 15,
                lineHeight: 1.2,
              }}
            >
              {summary.player}
            </h3>
            <div
              className="mt-0.5 text-[11px] truncate"
              style={{ color: "var(--vault-text-mute)" }}
            >
              <span style={{ color: "var(--vault-text)" }}>
                {summary.team || "—"}
              </span>{" "}
              <span style={{ color: "var(--vault-text-faint)" }}>
                {matchupArrow}
              </span>{" "}
              <span style={{ color: "var(--vault-text)" }}>
                {summary.opponent || "—"}
              </span>
            </div>
          </div>
        </div>
        <span
          aria-hidden
          className="text-[11px] shrink-0 mt-0.5 transition-transform group-hover:translate-x-0.5"
          style={{ color: "var(--vault-text-faint)" }}
        >
          →
        </span>
      </div>

      {/* Tipoff / playoff context line */}
      <div className="mt-2 flex items-center gap-2 flex-wrap">
        {ctx.isPlayoffs && ctx.gameLabel && (
          <span className="gtp-game-chip">{ctx.gameLabel}</span>
        )}
        <span
          className="text-[10px] tracking-wide"
          style={{ color: "var(--vault-text-faint)" }}
        >
          {summary.tipoff}
        </span>
      </div>

      {/* Divider */}
      <div
        className="my-2.5 h-px"
        style={{ background: "var(--vault-rule)" }}
      />

      {/* Best lean line: market · side line · edge */}
      <div
        className="text-[10px] tracking-[0.14em] uppercase mb-1"
        style={{ color: "var(--vault-text-faint)" }}
      >
        Best loaded lean
      </div>
      <div
        className="font-mono tabular flex items-baseline gap-1.5 flex-wrap"
        style={{ fontSize: 13 }}
      >
        <span
          style={{ color: "var(--vault-gold-bright)" }}
          className="font-semibold"
        >
          {MARKET_LABEL[summary.market] || summary.market}
        </span>
        <span style={{ color: "var(--vault-text-mute)" }}>
          {summary.side}
        </span>
        <span style={{ color: "var(--vault-text)" }}>{lineText}</span>
      </div>

      {/* Edge + confidence row */}
      <div className="mt-2 flex items-center gap-2 flex-wrap">
        <span
          className="font-mono font-semibold tabular tracking-wider rounded-[3px] px-2 py-0.5 text-[11px]"
          style={
            summary.isAnomaly
              ? {
                  color: "var(--vault-warn)",
                  background: "var(--vault-warn-dim)",
                  border: "1px solid color-mix(in srgb, var(--vault-accent) 30%, transparent)",
                }
              : {
                  color: "var(--vault-gold-bright)",
                  background: "var(--vault-gold-dim)",
                  border: "1px solid var(--vault-border-strong)",
                }
          }
        >
          {edgeText}
        </span>
        <span
          className="vault-pill"
          style={{
            ["--pill-fg" as string]: conf.fg,
            ["--pill-bg" as string]: conf.bg,
            ["--pill-border" as string]: conf.border,
          }}
        >
          {conf.label}
        </span>
        {summary.isAnomaly && (
          <span
            className="text-[10px] tracking-tight"
            style={{ color: "var(--vault-warn)" }}
          >
            anomaly
          </span>
        )}
      </div>
    </a>
  );
}
