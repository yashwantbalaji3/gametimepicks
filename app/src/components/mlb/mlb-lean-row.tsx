import type { MlbBoardLean, MlbReasonBullet } from "@/lib/types-mlb";
import {
  formatAmericanOdds,
  formatEdgePct,
  mlbMarketLabel,
} from "@/lib/format-mlb";
import MlbPlayerAvatar from "./mlb-player-avatar";
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
  lean: MlbBoardLean;
  density?: "detailed" | "scan";
}

function confidenceMeta(tier: MlbBoardLean["confidence"]): {
  label: string;
  fg: string;
  bg: string;
  rim: string;
} {
  switch (tier) {
    case "High":
      return {
        label: "High",
        fg: "var(--vault-success)",
        bg: "rgba(74, 222, 128, 0.10)",
        rim: "rgba(74, 222, 128, 0.35)",
      };
    case "Medium":
      return {
        label: "Medium",
        fg: "var(--vault-gold-bright)",
        bg: "rgba(240, 199, 94, 0.10)",
        rim: "rgba(240, 199, 94, 0.30)",
      };
    case "Low":
      return {
        label: "Low",
        fg: "var(--vault-warn)",
        bg: "rgba(212, 175, 55, 0.06)",
        rim: "rgba(212, 175, 55, 0.18)",
      };
    case "insufficient_data":
      return {
        label: "Sample too small",
        fg: "var(--vault-text-faint)",
        bg: "rgba(255, 255, 255, 0.02)",
        rim: "rgba(255, 255, 255, 0.05)",
      };
    default:
      return {
        label: "Pass",
        fg: "var(--vault-text-mute)",
        bg: "rgba(255, 255, 255, 0.02)",
        rim: "rgba(255, 255, 255, 0.05)",
      };
  }
}

function bulletToneColor(tone: MlbReasonBullet["tone"]): string {
  switch (tone) {
    case "warn":
      return "var(--vault-warn)";
    case "success":
      return "var(--vault-success)";
    case "mute":
      return "var(--vault-text-faint)";
    default:
      return "var(--vault-text-mute)";
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

export default function MlbLeanRow({ lean, density = "detailed" }: Props) {
  const meta = confidenceMeta(lean.confidence);
  const hasProj =
    lean.projection !== null && lean.confidence !== "insufficient_data";
  const directionalOdds =
    lean.lean === "Over"
      ? formatAmericanOdds(lean.oddsOver)
      : lean.lean === "Under"
        ? formatAmericanOdds(lean.oddsUnder)
        : "—";
  const isAnomaly = (lean.riskFlags || []).includes("r5_model_anomaly");
  const isInsufficient = lean.confidence === "insufficient_data";

  const teamAbbr = lean.playerTeamAbbr ?? "—";
  const oppAbbr = lean.opponentAbbr ?? "—";
  const bullets =
    lean.reasonBullets && lean.reasonBullets.length > 0
      ? lean.reasonBullets
      : fallbackBulletsFromReason(lean.reason);

  const containerStyle = {
    padding: density === "scan" ? "8px 12px" : "14px 16px",
    border: `1px solid ${meta.rim}`,
    background: isInsufficient
      ? "linear-gradient(180deg, rgba(14, 21, 48, 0.30) 0%, rgba(7, 11, 26, 0.38) 100%)"
      : "linear-gradient(180deg, rgba(14, 21, 48, 0.55) 0%, rgba(7, 11, 26, 0.62) 100%)",
    minWidth: 0,
    maxWidth: "100%",
    opacity: isInsufficient ? 0.78 : 1,
    scrollMarginTop: 80,
  } as const;

  // ───────────────────────── SCAN MODE ─────────────────────────
  // Two-row layout on narrow screens (390 px), single-row on desktop.
  // Row 1 always: avatar + name + confidence chip + (R5)
  // Row 2 always: market · LINE · proj · gap bar · EDGE
  // The trio of LINE / proj / EDGE stays visible at every width — that's
  // the whole point of scan mode.
  if (density === "scan") {
    return (
      <div
        className="flex flex-col sm:flex-row sm:items-center gap-x-3 gap-y-2 rounded-[4px] overflow-hidden"
        style={containerStyle}
        id={lean.id}
      >
        {/* Identity row — always visible */}
        <div className="flex items-center gap-2 min-w-0 sm:flex-1">
          <MlbPlayerAvatar
            playerId={lean.playerId}
            playerName={lean.playerName}
            team={lean.playerTeamAbbr}
            role={lean.playerRole}
            size="sm"
          />
          <span
            className="font-medium text-[13px] truncate min-w-0 flex-1"
            style={{ color: "var(--vault-text)" }}
          >
            {lean.playerName}
          </span>
          <span
            className="font-mono uppercase tracking-[0.12em] text-[9px] shrink-0 hidden md:inline"
            style={{ color: "var(--vault-text-faint)" }}
          >
            {teamAbbr} vs {oppAbbr}
          </span>
          <span
            className="font-mono shrink-0 sm:hidden"
            style={{
              color: meta.fg,
              fontSize: 9,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              background: meta.bg,
              borderRadius: 2,
              padding: "2px 6px",
              border: `1px solid ${meta.rim}`,
              whiteSpace: "nowrap",
            }}
          >
            {meta.label}
          </span>
          {isAnomaly && (
            <span
              className="font-mono uppercase tracking-[0.12em] shrink-0 sm:hidden"
              style={{
                color: "var(--vault-warn)",
                fontSize: 8,
                padding: "1px 4px",
                border: "1px solid rgba(212, 175, 55, 0.30)",
                borderRadius: 2,
              }}
            >
              R5
            </span>
          )}
        </div>

        {/* Market + LINE / proj / gap / EDGE — always visible */}
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="font-mono uppercase tracking-[0.12em] text-[9px] shrink-0"
            style={{ color: "var(--vault-text-faint)", minWidth: 60 }}
          >
            {mlbMarketLabel(lean.marketKey)}
          </span>
          <span
            className="font-mono font-semibold shrink-0"
            style={{
              color: "var(--vault-text)",
              fontSize: 14,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            <span style={{ color: "var(--vault-gold-bright)" }}>
              {lean.lean}
            </span>{" "}
            {lean.line}
          </span>
          {hasProj && (
            <span
              className="font-mono shrink-0"
              style={{
                color: "var(--vault-text-mute)",
                fontSize: 12,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              proj{" "}
              <span style={{ color: "var(--vault-text)" }}>
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
              className="font-mono font-semibold shrink-0"
              style={{
                color:
                  lean.edgePct >= 0
                    ? "var(--vault-success)"
                    : "var(--vault-warn)",
                fontSize: 14,
                fontVariantNumeric: "tabular-nums",
                minWidth: 60,
                textAlign: "right",
              }}
            >
              {formatEdgePct(lean.edgePct)}
            </span>
          )}
          <span
            className="font-mono shrink-0 hidden sm:inline-block"
            style={{
              color: meta.fg,
              fontSize: 9,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              background: meta.bg,
              borderRadius: 2,
              padding: "2px 6px",
              border: `1px solid ${meta.rim}`,
              whiteSpace: "nowrap",
            }}
          >
            {meta.label}
          </span>
          {isAnomaly && (
            <span
              className="font-mono uppercase tracking-[0.12em] shrink-0 hidden sm:inline-block"
              style={{
                color: "var(--vault-warn)",
                fontSize: 8,
                padding: "1px 4px",
                border: "1px solid rgba(212, 175, 55, 0.30)",
                borderRadius: 2,
              }}
            >
              R5
            </span>
          )}
        </div>
      </div>
    );
  }

  // ──────────────────────── DETAILED MODE ────────────────────────
  return (
    <div
      className="flex flex-col gap-3 rounded-[4px] overflow-hidden"
      style={containerStyle}
      id={lean.id}
    >
      {/* Row 1 — identity cluster + confidence chip */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <MlbPlayerAvatar
            playerId={lean.playerId}
            playerName={lean.playerName}
            team={lean.playerTeamAbbr}
            role={lean.playerRole}
            size="md"
          />
          <div className="flex flex-col gap-0.5 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                style={{
                  color: "var(--vault-text)",
                  fontSize: 15,
                  fontWeight: 600,
                  lineHeight: 1.2,
                }}
              >
                {lean.playerName}
              </span>
              {isAnomaly && (
                <span
                  className="font-mono uppercase tracking-[0.12em]"
                  style={{
                    color: "var(--vault-warn)",
                    fontSize: 9,
                    background: "rgba(212, 175, 55, 0.10)",
                    borderRadius: 2,
                    padding: "1px 6px",
                    border: "1px solid rgba(212, 175, 55, 0.30)",
                  }}
                >
                  R5 anomaly
                </span>
              )}
            </div>
            <div
              className="flex items-center gap-2 text-[11px] font-mono"
              style={{ color: "var(--vault-text-mute)" }}
            >
              <span>{teamAbbr}</span>
              <span style={{ color: "var(--vault-text-faint)" }}>vs</span>
              <span>{oppAbbr}</span>
              <span aria-hidden style={{ color: "var(--vault-text-faint)" }}>
                ·
              </span>
              <span
                className="uppercase tracking-[0.12em]"
                style={{ color: "var(--vault-text-faint)" }}
              >
                {lean.playerRole === "pitcher" ? "Pitcher" : "Batter"}
              </span>
              <span aria-hidden style={{ color: "var(--vault-text-faint)" }}>
                ·
              </span>
              <span
                className="uppercase tracking-[0.12em]"
                style={{ color: "var(--vault-text-faint)" }}
              >
                {mlbMarketLabel(lean.marketKey)}
              </span>
            </div>
          </div>
        </div>
        <span
          className="font-mono shrink-0"
          style={{
            color: meta.fg,
            fontSize: 10,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            background: meta.bg,
            borderRadius: 2,
            padding: "4px 9px",
            border: `1px solid ${meta.rim}`,
            whiteSpace: "nowrap",
          }}
        >
          {meta.label}
        </span>
      </div>

      {/* Row 2 — big stat tile trio (LINE / PROJECTION / EDGE) +
                  projection-vs-line gap bar.
                  Three columns on every width; stat values are large so the
                  numbers pop. */}
      <div className="grid grid-cols-3 gap-2">
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
        width={9999}
        height={8}
      />

      {/* Row 3 — NBA-style bullet reasoning, one short line per bullet */}
      {bullets.length > 0 && (
        <ul
          className="flex flex-col gap-1 list-none p-0 m-0"
          style={{ color: "var(--vault-text-mute)" }}
        >
          {bullets.map((b, i) => (
            <li
              key={`${b.label}-${i}`}
              className="flex items-baseline gap-2 text-[12px] leading-snug"
            >
              <span
                className="font-mono uppercase tracking-[0.14em] shrink-0"
                style={{
                  fontSize: 9,
                  color: bulletToneColor(b.tone),
                  minWidth: 72,
                }}
              >
                {b.label}
              </span>
              <span
                style={{
                  color:
                    b.tone === "warn"
                      ? "var(--vault-warn)"
                      : "var(--vault-text-mute)",
                }}
              >
                {b.text}
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
              className="font-mono uppercase tracking-[0.14em]"
              style={{ color: "var(--vault-text-faint)", fontSize: 9 }}
            >
              no recent trend
            </span>
          )}
        </div>
        <div
          className="font-mono"
          style={{
            color: "var(--vault-text-faint)",
            fontSize: 11,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {directionalOdds} · {lean.bookmaker}
        </div>
      </div>
    </div>
  );
}

/**
 * Big stat tile — used for LINE / PROJECTION / EDGE inside the detailed
 * lean card. Mirrors the visual weight of NBA's KpiTile but lives inline
 * inside a card row instead of as a standalone panel.
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
  const valueColor =
    isDash && mutedIfDash
      ? "var(--vault-text-faint)"
      : accent === "gold"
        ? "var(--vault-gold-bright)"
        : accent === "warn"
          ? "var(--vault-warn)"
          : accent === "success"
            ? "var(--vault-success)"
            : "var(--vault-text)";
  return (
    <div
      className="rounded-[3px] flex flex-col items-center justify-center"
      style={{
        padding: "8px 6px",
        border: "1px solid var(--vault-border)",
        background: "rgba(7, 11, 26, 0.45)",
      }}
    >
      <span
        className="font-mono uppercase tracking-[0.14em]"
        style={{ color: "var(--vault-text-faint)", fontSize: 9 }}
      >
        {label}
      </span>
      <span
        className="font-display font-semibold tracking-tight tabular"
        style={{
          color: valueColor,
          fontSize: 22,
          lineHeight: 1.1,
          marginTop: 2,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </span>
    </div>
  );
}
