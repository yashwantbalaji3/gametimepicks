/**
 * SettledGameDetail — sport-agnostic expandable per-game audit card.
 *
 * Renders a collapsed `<details>` card with the game's matchup, W/L/P,
 * decisive count, and hit-rate chip. Expanding it reveals a per-row
 * audit table: player · market · lean · line · projection · actual ·
 * outcome · confidence · edge · book.
 *
 * Honest by design:
 *   - never fabricates rows
 *   - shows "—" for missing fields (projection / actual / edge)
 *   - tone of the outcome cell drives only the cell color, not the
 *     row background (no hype)
 *   - hit-rate chip is faint when bucket has < 5 decisive picks
 */
import type { ReactNode } from "react";

export interface SettledLeanRow {
  id: string;
  playerName: string;
  marketLabel: string;
  side: string;        // "Over" / "Under" / "Pass" / "No Play"
  line: number | null;
  projection: number | null;
  actual: number | null;
  outcome: "Win" | "Loss" | "Push" | "—";
  confidence: string;  // "High" / "Medium" / "Low" / "insufficient_data" / etc.
  edgePct: number | null;
  bookmaker?: string | null;
  oddsForSide?: number | null;
}

interface Props {
  matchup: string;          // "DET @ CLE" / "TOR @ DET"
  subtitle?: string;        // e.g. "Eastern Conf Semis · Game 6" or tipoff
  wins: number;
  losses: number;
  pushes: number;
  decisive: number;
  hitRate: number | null;
  rows: SettledLeanRow[];
  /** Optional accent: NBA pages currently use gold tone, MLB uses
   *  success-green for the hit-rate chip. */
  tone?: "gold" | "success";
  /** Open by default — useful on Results pages with only 1–2 games. */
  defaultOpen?: boolean;
}

function pct(p: number | null): string {
  if (p === null) return "—";
  return `${(p * 100).toFixed(1)}%`;
}

function fmt(n: number | null | undefined, decimals = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n as number))
    return "—";
  return (n as number).toFixed(decimals);
}

function fmtOdds(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n as number)) return "";
  const v = Math.round(n as number);
  return v > 0 ? `+${v}` : `${v}`;
}

function outcomeColor(o: SettledLeanRow["outcome"]): string {
  switch (o) {
    case "Win":
      return "var(--vault-success)";
    case "Loss":
      return "var(--vault-warn)";
    case "Push":
      return "var(--vault-text-mute)";
    default:
      return "var(--vault-text-faint)";
  }
}

export default function SettledGameDetail({
  matchup,
  subtitle,
  wins,
  losses,
  pushes,
  decisive,
  hitRate,
  rows,
  tone = "gold",
  defaultOpen = false,
}: Props) {
  const accent = tone === "success" ? "var(--vault-success)" : "var(--vault-gold-bright)";
  const accentRim =
    tone === "success" ? "rgba(74, 222, 128, 0.30)" : "rgba(212, 175, 55, 0.30)";
  const accentBg =
    tone === "success" ? "rgba(74, 222, 128, 0.08)" : "rgba(212, 175, 55, 0.06)";
  const smallBucket = decisive < 5;

  return (
    <details
      className="group rounded-[6px]"
      style={{
        background: "rgba(7, 11, 26, 0.55)",
        border: "1px solid var(--vault-border)",
      }}
      open={defaultOpen}
    >
      <summary
        className="list-none cursor-pointer flex items-center justify-between gap-3 px-4 sm:px-5 py-3"
        style={{ borderRadius: 6 }}
      >
        <div className="flex flex-col gap-0.5 min-w-0">
          <span
            className="font-display font-semibold tracking-tight"
            style={{ color: "var(--vault-text)", fontSize: 16 }}
          >
            {matchup}
          </span>
          {subtitle && (
            <span
              className="font-mono uppercase tracking-[0.12em]"
              style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
            >
              {subtitle}
            </span>
          )}
        </div>
        <div
          className="flex items-center gap-3 shrink-0 font-mono"
          style={{
            color: "var(--vault-text-mute)",
            fontSize: 12,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          <span>
            {wins}–{losses}
            {pushes > 0 ? `–${pushes}P` : ""}
          </span>
          <span style={{ color: "var(--vault-text-faint)" }}>
            {decisive} dec
          </span>
          <span
            className="font-display font-semibold"
            style={{
              color: smallBucket ? "var(--vault-text-mute)" : accent,
              background: smallBucket ? "transparent" : accentBg,
              border: `1px solid ${smallBucket ? "var(--vault-border)" : accentRim}`,
              borderRadius: 4,
              padding: "2px 8px",
              fontSize: 13,
              minWidth: 60,
              textAlign: "center",
            }}
          >
            {pct(hitRate)}
          </span>
          <span
            aria-hidden
            className="font-mono transition-transform group-open:rotate-180"
            style={{ color: "var(--vault-text-faint)", fontSize: 12 }}
          >
            ▾
          </span>
        </div>
      </summary>
      <div
        className="overflow-x-auto"
        style={{ borderTop: "1px solid var(--vault-rule)" }}
      >
        <table
          className="w-full text-[12px] font-mono"
          style={{
            color: "var(--vault-text-mute)",
            fontVariantNumeric: "tabular-nums",
            borderCollapse: "collapse",
          }}
        >
          <thead>
            <tr
              style={{
                color: "var(--vault-text-faint)",
                fontSize: 10,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
              }}
            >
              <Th>Player</Th>
              <Th>Market</Th>
              <Th align="right">Lean / Line</Th>
              <Th align="right">Proj</Th>
              <Th align="right">Actual</Th>
              <Th align="right">Edge</Th>
              <Th align="right">Conf</Th>
              <Th align="right">Outcome</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-4 text-[12px]"
                  style={{ color: "var(--vault-text-faint)" }}
                >
                  No graded rows yet.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr
                key={r.id}
                style={{
                  borderTop: "1px solid var(--vault-rule)",
                }}
              >
                <Td>
                  <span style={{ color: "var(--vault-text)", fontWeight: 500 }}>
                    {r.playerName}
                  </span>
                </Td>
                <Td>{r.marketLabel}</Td>
                <Td align="right">
                  <span style={{ color: "var(--vault-gold-bright)" }}>
                    {r.side}
                  </span>{" "}
                  <span style={{ color: "var(--vault-text)" }}>
                    {fmt(r.line, 1)}
                  </span>
                </Td>
                <Td align="right">{fmt(r.projection, 2)}</Td>
                <Td align="right">
                  <span style={{ color: "var(--vault-text)" }}>
                    {fmt(r.actual, 0)}
                  </span>
                </Td>
                <Td align="right">
                  {r.edgePct !== null
                    ? `${r.edgePct >= 0 ? "+" : ""}${r.edgePct.toFixed(1)}%`
                    : "—"}
                </Td>
                <Td align="right">{r.confidence}</Td>
                <Td align="right">
                  <span
                    style={{
                      color: outcomeColor(r.outcome),
                      fontWeight: 600,
                    }}
                  >
                    {r.outcome}
                  </span>
                  {r.bookmaker && (
                    <span
                      className="ml-2"
                      style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
                    >
                      {fmtOdds(r.oddsForSide)} · {r.bookmaker}
                    </span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function Th({
  children,
  align,
}: {
  children: ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      scope="col"
      className="px-3 sm:px-4 py-2"
      style={{ textAlign: align ?? "left", fontWeight: 600 }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align,
}: {
  children: ReactNode;
  align?: "left" | "right";
}) {
  return (
    <td
      className="px-3 sm:px-4 py-2"
      style={{ textAlign: align ?? "left", whiteSpace: "nowrap" }}
    >
      {children}
    </td>
  );
}
