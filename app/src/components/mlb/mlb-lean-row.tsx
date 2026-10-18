import type { MlbBoardLean, MlbReasonBullet } from "@/lib/types-mlb";
import type { MlbBoardLeanView } from "@/lib/mlb/board-lean-view";
import { isAnomalyLean } from "@/lib/mlb/lean-anomaly";
import {
  formatAmericanOdds,
  formatEdgePct,
  mlbMarketLabel,
} from "@/lib/format-mlb";
import { leanMatchup } from "@/lib/mlb/lean-matchup";
import PlayerAvatar from "@/components/player-avatar";
import MlbProjectionGap from "./mlb-projection-gap";
import VaultSparkline from "../vault-sparkline";

/**
 * Single-lean row for the MLB board. Two densities:
 *
 *   detailed — sportsbook-style card. Identity cluster on top, then a
 *              three-column stat tile grid (LINE / PROJECTION / EDGE),
 *              then a projection-vs-line gap bar, then NBA-style
 *              reason bullets, then the recent-form sparkline + odds.
 *              On mobile the three stat tiles stack as a 3-row grid
 *              (still 3-up but pinned to a smaller width).
 *
 *   scan     — single condensed row pinned to the LINE / PROJ / EDGE
 *              trio so the most important numbers stay visible while
 *              sweeping all leans on the slate.
 *
 * Confidence tier drives the rim accent + right-side chip. R5 anomaly
 * gets its own small chip next to the player name.
 */
interface Props {
  lean: MlbBoardLeanView;
  density?: "detailed" | "scan";
}

function confidenceMeta(tier: MlbBoardLean["confidence"]): {
  label: string;
  /** Tier class: sets --lr-fg / --lr-bg / --lr-rim (globals.css, "MLB lean row"). */
  cls: string;
} {
  switch (tier) {
    /* P2-A: these tiers are model-vs-market gap sizes, not confidence (a larger gap has not settled better;
       every MLB prop market here is DEMOTE_TO_MARKET_CONTEXT). Labelled as what they measure. */
    case "High":
      return {
        label: "Gap ≥ 5 pp",
        cls: "lr-t-high",
      };
    case "Medium":
      return {
        label: "Gap 2.5–5 pp",
        cls: "lr-t-med",
      };
    case "Low":
      return {
        label: "Small gap",
        cls: "lr-t-low",
      };
    case "insufficient_data":
      return {
        label: "Sample too small",
        cls: "lr-t-insuf",
      };
    default:
      return {
        label: "Pass",
        cls: "lr-t-pass",
      };
  }
}

function bulletToneClass(tone: MlbReasonBullet["tone"]): string {
  switch (tone) {
    case "warn":
      return "lr-c-warn";
    case "success":
      return "lr-c-succ";
    case "mute":
      return "lr-c-faint";
    default:
      return "lr-c-mute";
  }
}

/**
 * Honest fallback: when a lean predates the structured `reasonBullets`
 * field (older boards), parse the legacy `reason` paragraph on " · "
 * and emit one default-tone bullet per chunk. New boards always carry
 * structured bullets so this branch rarely runs.
 */
function fallbackBulletsFromReason(reason: string): MlbReasonBullet[] {
  if (!reason) return [];
  return reason
    .split(" · ")
    .map((t) => t.trim())
    .filter(Boolean)
    .map((text) => ({ label: "Note", text, tone: "default" as const }));
}

/* GTP-14 (2026-10-14): an R5 anomaly is a gap too LARGE to trust (the model is likely missing something), and
   it was labelled by its downgraded tier — "Small gap" on a +23.2 pp row. The anomaly is now its own label, and
   the internal rule code ("R5") is no longer shown beside it. */
const ANOMALY_META = {
  label: "Anomaly · gap too large to trust",
  cls: "lr-t-anom",
};

export default function MlbLeanRow({ lean, density = "detailed" }: Props) {
  const isAnomaly = isAnomalyLean(lean);
  const meta = isAnomaly ? ANOMALY_META : confidenceMeta(lean.confidence);
  const hasProj =
    lean.projection !== null && lean.confidence !== "insufficient_data";
  const directionalOdds =
    lean.lean === "Over"
      ? formatAmericanOdds(lean.oddsOver)
      : lean.lean === "Under"
        ? formatAmericanOdds(lean.oddsUnder)
        : "—";
  const isInsufficient = lean.confidence === "insufficient_data";

  /* P289: this was `playerTeamAbbr ?? "—"` / `opponentAbbr ?? "—"`, which rendered "— vs —" on 3,989
     rows across 100 players — everyone whose canonical name carries an accent, because the provider
     spells them without one and the PLAYER join fails while the GAME join holds. One owner decides
     what the row may honestly say; a null means omit, never a pair of dashes. */
  const matchup = leanMatchup(lean);
  const bullets =
    lean.reasonBullets && lean.reasonBullets.length > 0
      ? lean.reasonBullets
      : fallbackBulletsFromReason(lean.reason);

  /* Container: rim from the tier class, padding by density, dimmed surface for insufficient samples (globals.css). */
  const containerCls = `lr ${meta.cls}${density === "scan" ? " lr-scan" : ""}${isInsufficient ? " lr-insuff" : ""}`;

  // ───────────────────────── SCAN MODE ─────────────────────────
  // Two-row layout on narrow screens (390 px), single-row on desktop.
  // Row 1 always: avatar + name + confidence chip + (R5)
  // Row 2 always: market · LINE · proj · gap bar · EDGE
  // The trio of LINE / proj / EDGE stays visible at every width — that's
  // the whole point of scan mode.
  if (density === "scan") {
    return (
      <div
        className={`flex flex-col sm:flex-row sm:items-center gap-x-3 gap-y-2 rounded-[4px] overflow-hidden ${containerCls}`}
        id={lean.id}
      >
        {/* Identity row — always visible */}
        <div className="flex items-center gap-2 min-w-0 sm:flex-1">
          <PlayerAvatar sport="mlb"
            playerId={lean.playerId}
            playerName={lean.playerName}
            team={lean.playerTeamAbbr}
            role={lean.playerRole}
            size="sm"
          />
          <span
            className="font-medium text-[13px] truncate min-w-0 flex-1 lr-c-text"
          >
            {lean.playerName}
          </span>
          {matchup ? (
            <span
              className="font-mono uppercase tracking-[0.12em] text-[10px] shrink-0 hidden md:inline lr-c-faint"
            >
              {matchup.label}
            </span>
          ) : null}
          <span
            className="font-mono shrink-0 sm:hidden lr-chip"
          >
            {meta.label}
          </span>
        </div>

        {/* Market + LINE / proj / gap / EDGE — always visible */}
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="font-mono uppercase tracking-[0.12em] text-[10px] shrink-0 lr-c-faint lr-mw60"
          >
            {mlbMarketLabel(lean.marketKey)}
          </span>
          <span
            className="font-mono font-semibold shrink-0 lr-num14"
          >
            <span className="lr-c-goldb">
              {lean.lean}
            </span>{" "}
            {lean.line}
          </span>
          {hasProj && (
            <span
              className="font-mono shrink-0 lr-num12m"
            >
              proj{" "}
              <span className="lr-c-text">
                {lean.projection}
              </span>
            </span>
          )}
          {/* Gap bar — hidden on the tightest mobile scan layout to keep
              the EDGE value fully readable. Visible from sm: up. */}
          <div className="flex-1 min-w-[24px] hidden sm:block">
            <MlbProjectionGap
              line={lean.line}
              projection={lean.projection}
              sigma={lean.sigma}
              width={64}
              height={6}
            />
          </div>
          {/* Spacer on mobile so edge stays right-aligned */}
          <div className="flex-1 sm:hidden" />

          {hasProj && lean.edgePct !== null && (
            <span
              className={`font-mono font-semibold shrink-0 lr-edge ${lean.edgePct >= 0 ? "lr-c-succ" : "lr-c-warn"}`}
            >
              {formatEdgePct(lean.edgePct)}
            </span>
          )}
          <span
            className="font-mono shrink-0 hidden sm:inline-block lr-chip"
          >
            {meta.label}
          </span>
        </div>
      </div>
    );
  }

  // ──────────────────────── DETAILED MODE ────────────────────────
  return (
    <div
      className={`flex flex-col gap-3 rounded-[4px] overflow-hidden ${containerCls}`}
      id={lean.id}
    >
      {/* Row 1 — identity cluster + confidence chip.
          UXR1-04 (DS-001 §9): the chip was nowrap and never shrank, so on a phone the anomaly label
          ("Anomaly · gap too large to trust", ~255 px) squeezed the identity column to one word per line and ran
          over it. The row now wraps: the identity keeps a 12rem basis and the chip drops below it when both
          cannot fit, wrapping its own text inside the card if it must. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0" style={{ flex: "1 1 12rem" }}>
          <PlayerAvatar sport="mlb"
            playerId={lean.playerId}
            playerName={lean.playerName}
            team={lean.playerTeamAbbr}
            role={lean.playerRole}
            size="md"
          />
          <div className="flex flex-col gap-0.5 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="lr-name">
                {lean.playerName}
              </span>
              {isAnomaly && (
                <span
                  className="font-mono uppercase tracking-[0.12em] lr-anom"
                >
                  Model anomaly
                </span>
              )}
            </div>
            <div
              className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-mono lr-c-mute"
            >
              {matchup ? (
                <>
                  {matchup.kind === "SIDED" ? (
                    <>
                      <span>{matchup.team}</span>
                      <span className="lr-c-faint">vs</span>
                      <span>{matchup.opponent}</span>
                    </>
                  ) : (
                    /* The game, with no claim about which side the player is on. */
                    <span>{matchup.label}</span>
                  )}
                  <span aria-hidden className="lr-c-faint">
                    ·
                  </span>
                </>
              ) : null}
              <span
                className="uppercase tracking-[0.12em] lr-c-faint"
              >
                {lean.playerRole === "pitcher" ? "Pitcher" : "Batter"}
              </span>
              <span aria-hidden className="lr-c-faint">
                ·
              </span>
              <span
                className="uppercase tracking-[0.12em] lr-c-faint"
              >
                {mlbMarketLabel(lean.marketKey)}
              </span>
            </div>
          </div>
        </div>
        <span
          className="font-mono shrink-0 lr-chip lr-chip-lg"
        >
          {meta.label}
        </span>
      </div>

      {/* Row 2 — big stat tile trio (LINE / PROJECTION / EDGE) +
                  projection-vs-line gap bar.
                  Three columns on every width; stat values are large so the
                  numbers pop. */}
      <div className="grid grid-cols-1 min-[375px]:grid-cols-3 gap-2">
        <StatTile
          label={`${lean.lean === "Pass" || lean.lean === "No Play" ? "Line" : lean.lean.toUpperCase()}`}
          value={String(lean.line)}
          accent="default"
        />
        <StatTile
          label="Projection"
          value={hasProj ? String(lean.projection) : "—"}
          accent="gold"
          mutedIfDash
        />
        <StatTile
          label="Edge"
          value={
            hasProj && lean.edgePct !== null
              ? formatEdgePct(lean.edgePct)
              : "—"
          }
          accent={
            !hasProj || lean.edgePct === null
              ? "default"
              : lean.edgePct >= 0
                ? "success"
                : "warn"
          }
          mutedIfDash={!hasProj}
        />
      </div>
      <MlbProjectionGap
        line={lean.line}
        projection={lean.projection}
        sigma={lean.sigma}
        width="100%"
        height={8}
      />

      {/* Row 3 — NBA-style bullet reasoning, one short line per bullet */}
      {bullets.length > 0 && (
        <ul
          className="flex flex-col gap-1 list-none p-0 m-0 lr-c-mute"
        >
          {bullets.map((b, i) => (
            <li
              key={`${b.label}-${i}`}
              className="flex items-baseline gap-2 text-[12px] leading-snug"
            >
              <span
                className={`font-mono uppercase tracking-[0.14em] shrink-0 lr-bl ${bulletToneClass(b.tone)}`}
              >
                {b.label}
              </span>
              <span className={b.tone === "warn" ? "lr-c-warn" : "lr-c-mute"}>
                {/* GTP-14/27: the artifact's bullet names the internal rule ("R5"); the reader gets the meaning. */}
                {b.text.replace(/\bR5 anomaly threshold\b/g, "anomaly threshold").replace(/\bR5\b ?/g, "")}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Row 4 — recent-form sparkline + odds + book */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          {lean.recentSeries && lean.recentSeries.length > 0 ? (
            <VaultSparkline
              values={lean.recentSeries.slice(-10)}
              refLine={lean.line}
              width={96}
              height={24}
              ariaLabel={`${lean.playerName} last ${Math.min(
                lean.recentSeries.length,
                10,
              )} ${mlbMarketLabel(lean.marketKey).toLowerCase()}`}
            />
          ) : (
            <span
              className="font-mono uppercase tracking-[0.14em] lr-c-faint lr-fs10"
            >
              no recent trend
            </span>
          )}
        </div>
        <div
          className="font-mono lr-odds"
        >
          {directionalOdds} · {lean.bookmaker}
        </div>
      </div>
    </div>
  );
}

/**
 * Big stat tile — used for LINE / PROJECTION / EDGE inside the detailed
 * MLB lean card. Visual weight matches the NBA scoreboard tile shipped
 * earlier in PR #55 so both sports' projection cards read with the
 * same sportsbook rhythm:
 *
 *   - color-mix(in srgb, var(--vault-scrim-base) 55%, transparent) neon-bordered surface
 *   - minHeight 56 so the trio aligns at every breakpoint
 *   - mono uppercase eyebrow label
 *   - big tabular value at clamp(20px, 3vw, 26px)
 *   - PROJECTION (and healthy EDGE) carry a soft gold textShadow glow
 *
 * Accent semantics stay sport-specific:
 *   default → muted text (LINE / dash)
 *   gold    → gold-bright (PROJECTION)
 *   success → success-green (positive EDGE) — kept for MLB so a clean
 *             edge reads as "positive" rather than "anomaly"
 *   warn    → warn-amber (R5 anomaly / capped edge)
 */
function StatTile({
  label,
  value,
  accent,
  mutedIfDash,
}: {
  label: string;
  value: string;
  accent: "default" | "gold" | "warn" | "success";
  mutedIfDash?: boolean;
}) {
  const isDash = value === "—" || value === "";
  /* Colours and glow by accent (classes in globals.css, "MLB lean row"; values unchanged from the former inline styles). */
  const valueCls =
    isDash && mutedIfDash
      ? "lr-c-faint"
      : accent === "gold"
        ? "lr-c-goldb"
        : accent === "warn"
          ? "lr-c-warn"
          : accent === "success"
            ? "lr-c-succ"
            : "lr-c-text";
  const labelCls =
    accent === "warn"
      ? "lr-c-warn"
      : accent === "success"
        ? "lr-c-succ"
        : accent === "gold"
          ? "lr-c-gold"
          : "lr-c-faint";
  const glow = accent === "gold" || (accent === "success" && !isDash);
  return (
    <div
      /* Below 375 px the trio stacks and each tile reads as one row (label · value), so a 10-letter label is
         never broken mid-word; from 375 px it is the original three-column tile, with 8 px side padding and no
         extra label tracking below sm ("PROJECTION" = 63 px in a 68 px tile at 375 px). UXR1-06 on the shared
         .lr-tile class (padding 8px 8px; its min-height moved to these utilities so they can respond). */
      className="rounded-[5px] flex flex-row items-baseline justify-between gap-2 min-h-[40px] min-[375px]:flex-col min-[375px]:items-start min-[375px]:justify-center min-[375px]:gap-0 min-[375px]:min-h-[56px] lr-tile min-w-0"
    >
      {/* UXR1-06 (cont.): at 320 px "PROJECTION" at 0.14em ran out of its tile into "EDGE". */}
      <span className={`font-mono uppercase tracking-normal sm:tracking-[0.14em] lr-fs10 lr-wrap-any ${labelCls}`}>
        {label}
      </span>
      <span
        className={`font-display font-semibold tracking-tight tabular whitespace-nowrap lr-tv ${valueCls}${glow ? " lr-glow" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}
