/**
 * RiskSectionDrilldown — accordion-style "show me the actual slips
 * behind the Low / Medium / High / Longshot numbers" component for
 * `/results`.
 *
 * Honesty:
 *   - Renders nothing fabricated. When a section has 0 slips the
 *     row reads "Not enough settled slips yet." Same copy as the
 *     summary table for consistency.
 *   - Status comes straight from the grader (`status` on each slip,
 *     `result` on each leg). The component never overrides either.
 *   - Pending slips appear in their own visual lane so the reader
 *     never confuses them with decided ones.
 *
 * Pure presentation. No data fetches; no fabricated content.
 */
import {
  RISK_SECTION_ORDER,
  getRiskSectionDisplay,
  type RiskSectionKey,
} from "@/lib/parlay-risk-sections";
import {
  sortDrilldownSlips,
  type DrilldownSlip,
  type DrilldownStatus,
  type DrilldownLeg,
} from "@/lib/results-drilldown";
import { formatLegGameTime } from "@/lib/leg-game-time";

export interface RiskSectionDrilldownProps {
  /** Per-section slips, in display order. */
  bySection: Record<RiskSectionKey, DrilldownSlip[]>;
  /** Date label used on the eyebrow ("May 28"). */
  contextLabel?: string;
  /** Optional `YYYY-MM-DD` for the leg date label. */
  date?: string;
}

const _STATUS_DISPLAY: Record<
  DrilldownStatus,
  { label: string; toneVar: string }
> = {
  win: { label: "Won", toneVar: "var(--vault-success)" },
  loss: { label: "Lost", toneVar: "var(--vault-warn)" },
  push: { label: "Push", toneVar: "var(--vault-text)" },
  pending: { label: "Pending", toneVar: "var(--vault-text-mute)" },
  void: { label: "Void", toneVar: "var(--vault-text-faint)" },
};

function _formatAmericanOdds(am: number | null): string {
  if (am == null || !Number.isFinite(am)) return "—";
  const sign = am > 0 ? "+" : "";
  return `${sign}${am}`;
}

const _SPORT_LABEL: Record<"nba" | "mlb" | "multi", string> = {
  nba: "🏀 NBA",
  mlb: "⚾ MLB",
  multi: "🔀 Mixed",
};

export default function RiskSectionDrilldown({
  bySection,
  contextLabel,
  date,
}: RiskSectionDrilldownProps) {
  // If every section is empty we render nothing — the summary table
  // already shows the same "not enough yet" state.
  const totalSlips = RISK_SECTION_ORDER.reduce(
    (acc, k) => acc + (bySection[k]?.length ?? 0),
    0,
  );
  if (totalSlips === 0) return null;
  return (
    <section
      aria-label="Risk-section slip drilldown"
      className="rounded-[10px] overflow-hidden"
      style={{
        background: "var(--gtp-card)",
        border: "1px solid var(--gtp-card-border)",
      }}
    >
      <header
        className="px-4 sm:px-5 py-3.5 flex flex-wrap items-baseline gap-x-3 gap-y-1"
        style={{
          background: "var(--gtp-card-sunken)",
          borderBottom: "1px solid var(--vault-rule)",
        }}
      >
        <span
          className="font-mono uppercase tracking-[0.16em]"
          style={{ color: "var(--vault-text-mute)", fontSize: 12 }}
        >
          Settled published cards
        </span>
        {contextLabel && (
          <span
            className="font-mono"
            style={{ color: "var(--vault-text-faint)", fontSize: 11 }}
          >
            · {contextLabel}
          </span>
        )}
        <span
          className="font-mono ml-auto"
          style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
        >
          status from the grader · never edited
        </span>
      </header>
      <div className="p-3 sm:p-4 flex flex-col gap-3">
        {RISK_SECTION_ORDER.map((sectionKey) => (
          <SectionBlock
            key={sectionKey}
            sectionKey={sectionKey}
            slips={bySection[sectionKey] ?? []}
            date={date}
          />
        ))}
      </div>
    </section>
  );
}

function SectionBlock({
  sectionKey,
  slips,
  date,
}: {
  sectionKey: RiskSectionKey;
  slips: DrilldownSlip[];
  date: string | undefined;
}) {
  const display = getRiskSectionDisplay(sectionKey);
  const sorted = sortDrilldownSlips(slips);
  return (
    <details
      className="rounded-[8px] overflow-hidden"
      style={{
        background: "var(--gtp-card-sunken)",
        border: "1px solid var(--vault-rule)",
      }}
      // Open by default — the drilldown's whole point is to be
      // inspectable. The summary tables above stay scannable; this is
      // the "show me the actual rows" surface.
      open
    >
      <summary
        className="px-3 py-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 cursor-pointer list-none"
        style={{
          background: "transparent",
        }}
      >
        <span
          className="font-mono uppercase tracking-[0.14em]"
          style={{ color: display.accentVar, fontSize: 11 }}
        >
          {display.label}
        </span>
        <span
          className="font-mono"
          style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
        >
          {display.legRange} · {display.oddsRange}
        </span>
        <span
          className="font-mono ml-auto"
          style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
        >
          {sorted.length} {sorted.length === 1 ? "slip" : "slips"}
        </span>
      </summary>
      <div className="px-3 pb-3 pt-1 flex flex-col gap-2">
        {sorted.length === 0 ? (
          <p
            className="text-[11.5px] leading-snug py-2"
            style={{ color: "var(--vault-text-faint)" }}
          >
            Not enough settled slips yet.
          </p>
        ) : (
          sorted.map((slip) => <SlipRow key={slip.slipId} slip={slip} date={date} />)
        )}
      </div>
    </details>
  );
}

function SlipRow({ slip, date }: { slip: DrilldownSlip; date: string | undefined }) {
  const statusDisplay = _STATUS_DISPLAY[slip.status];
  return (
    <article
      aria-label={`${statusDisplay.label} slip · ${slip.legs.length} legs`}
      className="rounded-[6px] px-3 py-2 flex flex-col gap-1.5"
      style={{
        background: "var(--gtp-card)",
        border: `1px solid ${statusDisplay.toneVar === "var(--vault-success)" ? "var(--vault-success)" : "var(--vault-rule)"}`,
      }}
    >
      <header className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span
          className="font-mono uppercase tracking-[0.14em] px-1.5 py-0.5 rounded-[3px] shrink-0"
          style={{
            color: statusDisplay.toneVar,
            border: `1px solid ${statusDisplay.toneVar}`,
            fontSize: 10,
            lineHeight: 1.2,
          }}
        >
          {statusDisplay.label}
        </span>
        <span
          className="font-mono"
          style={{ color: "var(--vault-text)", fontSize: 11 }}
        >
          {_SPORT_LABEL[slip.sport]}
        </span>
        <span
          className="font-mono"
          style={{ color: "var(--vault-text-mute)", fontSize: 11 }}
        >
          · {slip.legs.length} legs · {_formatAmericanOdds(slip.combinedAmericanOdds)}
        </span>
        {slip.singleGame && (
          <span
            className="font-mono uppercase tracking-[0.12em] px-1.5 py-0.5 rounded-full shrink-0"
            style={{
              color: "var(--vault-warn)",
              border: "1px solid var(--vault-warn)",
              fontSize: 9,
              lineHeight: 1.3,
            }}
          >
            Single-game
          </span>
        )}
      </header>
      <ul className="list-none flex flex-col gap-0.5 pl-0">
        {slip.legs.map((leg, i) => (
          <LegLine key={`${slip.slipId}_${i}`} leg={leg} date={date} />
        ))}
      </ul>
    </article>
  );
}

function LegLine({ leg, date }: { leg: DrilldownLeg; date: string | undefined }) {
  const legResultTone = legResultColor(leg.result);
  const gameTimeLabel =
    formatLegGameTime({
      gameDate: date ?? null,
      commenceTime: leg.commenceTime,
      gameTime: leg.gameTime,
    }) || (date ? formatBasicDate(date) : "");
  const matchup = leg.team
    ? leg.opponent
      ? `${leg.team} vs ${leg.opponent}`
      : leg.team
    : leg.opponent ?? "";
  return (
    <li
      className="grid grid-cols-[auto_1fr_auto] gap-2 items-baseline"
      style={{ fontSize: 11, lineHeight: 1.35 }}
    >
      <span
        className="font-mono uppercase tracking-[0.12em]"
        style={{
          color: legResultTone,
          fontSize: 9,
          minWidth: 36,
        }}
      >
        {(leg.result ?? "—").slice(0, 6).toUpperCase()}
      </span>
      <span
        className="font-mono truncate"
        style={{ color: "var(--vault-text)" }}
      >
        <span style={{ fontWeight: 600 }}>{leg.playerName}</span>
        {matchup && (
          <span style={{ color: "var(--vault-text-faint)" }}> · {matchup}</span>
        )}
        <span style={{ color: "var(--vault-text-mute)" }}>
          {" · "}
          {leg.marketLabel ?? leg.market} {leg.side}
          {leg.line != null ? ` ${leg.line}` : ""}
        </span>
        {typeof leg.finalStat === "number" && (
          <span style={{ color: "var(--vault-text-faint)" }}>
            {" · final "}
            {leg.finalStat}
          </span>
        )}
      </span>
      {gameTimeLabel && (
        <span
          className="font-mono shrink-0 hidden sm:inline"
          style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
        >
          {gameTimeLabel}
        </span>
      )}
    </li>
  );
}

function legResultColor(result: string | null): string {
  if (typeof result !== "string") return "var(--vault-text-faint)";
  const r = result.toLowerCase();
  if (r === "win") return "var(--vault-success)";
  if (r === "loss") return "var(--vault-warn)";
  if (r === "push") return "var(--vault-text-mute)";
  return "var(--vault-text-faint)";
}

function formatBasicDate(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return "";
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const mi = parseInt(m[2], 10) - 1;
  const day = parseInt(m[3], 10);
  if (mi < 0 || mi > 11 || Number.isNaN(day)) return "";
  return `${months[mi]} ${day}`;
}
