"use client";

/**
 * MARKET DISAGREEMENT EXPLORER — presentation only.
 *
 * Every probability, difference, rate, interval, denominator and sentence arrives pre-derived from
 * `lib/research/disagreement-explorer.ts` and `lib/research/disagreement-buckets.ts`. This component
 * performs NO statistics: not a division, not an average, not a rounding decision that changes a
 * meaning. A rate computed inside a component is a rate no test can reach, and this surface exists
 * precisely to be checkable.
 *
 * WHAT IT REFUSES TO DO
 *   · default to the largest-difference ordering (event time, always — the biggest disagreements are
 *     the measured worst performers, so putting them first would be a claim);
 *   · offer that ordering without the caution sentence beside it;
 *   · place a prediction-disabled market anywhere in a difference-ordered list;
 *   · show a rate without its denominator, window and interval;
 *   · describe any row as preferable to any other.
 *
 * The three analytics events wired here are attached to REAL controls — the ordering switch, the row
 * expander, the probability-layer explainer. Each is validated and routed through the resolved sink,
 * which is a no-op until a provider is approved and configured.
 */
import { useMemo, useState } from "react";

import { SCHEMA_VERSION, type AnalyticsEvent, type MarketFamily } from "@/lib/analytics/event-contract";
import { readSinkConfig, resolveSink, track } from "@/lib/analytics/sink";
import { currentEtDate } from "@/lib/freshness";
import {
  orderExplorerRows,
  type ExplorerOrder,
  type ExplorerRowView,
  type GapBucketView,
} from "@/lib/research/disagreement-explorer";

type Props = {
  date: string;
  rows: ExplorerRowView[];
  buckets: GapBucketView[];
  historyTotal: number;
  historyExcluded: number;
  historyFrom: string | null;
  historyTo: string | null;
  largestGapCaution: string | null;
  coverageTotal: number;
  coverageListed: number;
  probabilityNote: string;
  eligibilityNote: string;
};

const CARD: React.CSSProperties = {
  border: "1px solid var(--vault-rule)",
  borderRadius: 10,
  background: "var(--vault-panel, transparent)",
};

const pct = (p: number | null | undefined, digits = 1) =>
  typeof p === "number" && Number.isFinite(p) ? `${(p * 100).toFixed(digits)}%` : "—";

const ppText = (v: number | null | undefined) =>
  typeof v === "number" && Number.isFinite(v) ? `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)} pp` : "—";

const clockEt = (iso: string | null) => {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  return new Date(t).toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  });
};

const SETTLEMENT_TONE: Record<string, string> = {
  WIN: "var(--vault-success)",
  LOSS: "var(--vault-text-mute)",
  VOID: "var(--vault-text-faint)",
  PENDING: "var(--vault-text-faint)",
  WITHHELD: "var(--vault-warn)",
};

function researchEvent(
  name: "market_row_opened" | "probability_explainer_opened" | "market_disagreement_opened",
  family: MarketFamily,
): AnalyticsEvent {
  // Surface is `research`, not `markets`: this explorer sits inside the Market Center page but is a
  // separate control set, and collapsing the two would make the counts unreadable.
  return {
    event: name,
    schemaVersion: SCHEMA_VERSION,
    dayBucket: currentEtDate(),
    surface: "research",
    sport: "mlb",
    marketFamily: family,
  } as AnalyticsEvent;
}

export default function DisagreementExplorer(props: Props) {
  const [order, setOrder] = useState<ExplorerOrder>("event_time");
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [openLayers, setOpenLayers] = useState<string | null>(null);
  const sink = useMemo(() => resolveSink(readSinkConfig()), []);

  const ordered = useMemo(() => orderExplorerRows(props.rows, order), [props.rows, order]);

  // Offering the difference ordering without the measured caution beside it is the one thing this
  // component must not do, so the control does not exist when the caution cannot be derived.
  const canOrderByGap = props.largestGapCaution != null;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3" style={{ marginBottom: 12 }}>
        <div className="font-mono uppercase tracking-[0.16em]" style={{ fontSize: 10, color: "var(--vault-text-mute)" }}>
          {props.date} · {props.coverageListed} of {props.coverageTotal} rows have a pregame capture record
        </div>
        <div className="flex items-center gap-1">
          {(
            [
              ["event_time", "Event time"],
              ["largest_gap", "Largest difference"],
            ] as const
          )
            .filter(([id]) => id === "event_time" || canOrderByGap)
            .map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  // Switching to the difference ordering IS the open-the-disagreement-view interaction.
                  // It measures interest in the comparison, never a statement about it.
                  if (id === "largest_gap" && order !== "largest_gap") {
                    track(researchEvent("market_disagreement_opened", "other"), sink);
                  }
                  setOrder(id);
                }}
                className="font-mono uppercase tracking-[0.14em]"
                style={{
                  fontSize: 9,
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: `1px solid ${order === id ? "var(--vault-gold)" : "var(--vault-rule)"}`,
                  color: order === id ? "var(--vault-gold)" : "var(--vault-text-mute)",
                  background: "transparent",
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
            ))}
        </div>
      </div>

      {order === "largest_gap" && props.largestGapCaution ? (
        <div
          style={{
            border: "1px solid var(--vault-warn)",
            borderRadius: 8,
            padding: 12,
            marginBottom: 12,
            background: "color-mix(in srgb, var(--vault-warn) 6%, transparent)",
            fontSize: 12,
            lineHeight: 1.7,
            color: "var(--vault-text)",
          }}
        >
          {props.largestGapCaution}
        </div>
      ) : null}

      <p style={{ fontSize: 12, color: "var(--vault-text-mute)", lineHeight: 1.7, marginBottom: 12 }}>
        {props.eligibilityNote}
      </p>

      <div className="grid gap-2">
        {ordered.rows.map((row) => (
          <RowCard
            key={row.rowId}
            row={row}
            expanded={openRow === row.rowId}
            layersOpen={openLayers === row.rowId}
            probabilityNote={props.probabilityNote}
            onToggle={() => {
              if (openRow !== row.rowId) track(researchEvent("market_row_opened", row.analyticsFamily), sink);
              setOpenRow(openRow === row.rowId ? null : row.rowId);
            }}
            onToggleLayers={() => {
              if (openLayers !== row.rowId) {
                track(researchEvent("probability_explainer_opened", row.analyticsFamily), sink);
              }
              setOpenLayers(openLayers === row.rowId ? null : row.rowId);
            }}
          />
        ))}
      </div>

      {ordered.notRankable.length > 0 ? (
        <div style={{ ...CARD, padding: 14, marginTop: 14 }}>
          <div className="font-mono uppercase tracking-[0.16em]" style={{ fontSize: 10, color: "var(--vault-warn)", marginBottom: 8 }}>
            Not placed in this ordering ({ordered.notRankable.length})
          </div>
          <div className="grid gap-2">
            {ordered.notRankable.map(({ row, reason }) => (
              <div key={row.rowId} style={{ fontSize: 12, color: "var(--vault-text-mute)", lineHeight: 1.6 }}>
                <span style={{ color: "var(--vault-text)" }}>
                  {row.player} {row.side} {row.marketLabel}
                  {row.line == null ? "" : ` ${row.line}`}
                </span>{" "}
                — {reason}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <HistoryTable
        buckets={props.buckets}
        total={props.historyTotal}
        excluded={props.historyExcluded}
        from={props.historyFrom}
        to={props.historyTo}
      />
    </div>
  );
}

function RowCard({
  row,
  expanded,
  layersOpen,
  probabilityNote,
  onToggle,
  onToggleLayers,
}: {
  row: ExplorerRowView;
  expanded: boolean;
  layersOpen: boolean;
  probabilityNote: string;
  onToggle: () => void;
  onToggleLayers: () => void;
}) {
  return (
    <div style={{ ...CARD, padding: 14 }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full flex-wrap items-center justify-between gap-3 text-left"
        style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer" }}
      >
        <div className="min-w-0">
          <div style={{ fontSize: 14, color: "var(--vault-text)" }}>
            {row.player} <span style={{ color: "var(--vault-text-mute)" }}>{row.side}</span> {row.marketLabel}
            {row.line == null ? "" : ` ${row.line}`}
          </div>
          <div className="font-mono" style={{ fontSize: 11, color: "var(--vault-text-faint)", marginTop: 2 }}>
            {row.matchup} · {clockEt(row.startTime)} ET · {row.lineageLabel}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Figure label="Sportsbook" text={pct(row.marketProbability)} />
          <Figure label="Simulation" text={pct(row.rawProbability)} />
          <Figure label="Calibrated" text={pct(row.calibratedProbability)} />
          <Figure label="Difference" text={ppText(row.gapPp)} />
          <span
            className="font-mono uppercase tracking-[0.14em]"
            style={{ fontSize: 9, color: SETTLEMENT_TONE[row.settlementState] ?? "var(--vault-text-mute)" }}
          >
            {row.settlementLabel}
          </span>
        </div>
      </button>

      {row.predictionDisabled ? (
        <div
          className="font-mono uppercase tracking-[0.14em]"
          style={{ fontSize: 9, color: "var(--vault-warn)", marginTop: 8 }}
        >
          Predictions switched off for this market
        </div>
      ) : null}

      {expanded ? (
        <div style={{ marginTop: 12, borderTop: "1px solid var(--vault-rule)", paddingTop: 12 }}>
          <p style={{ fontSize: 12, color: "var(--vault-text)", lineHeight: 1.75 }}>{row.interpretation}</p>

          <div className="grid gap-1" style={{ marginTop: 10, fontSize: 11, color: "var(--vault-text-mute)" }}>
            <Detail label="What this row is" text={row.lineageMeaning} />
            <Detail label="Price observed" text={row.capturedAt ?? "not recorded"} />
            <Detail label="Game started" text={row.eventStart ?? "not recorded"} />
            <Detail
              label="Price at capture"
              text={
                row.capturedNoVigProbability == null
                  ? "the archive recorded no de-vigged figure for this row"
                  : `${pct(row.capturedNoVigProbability)} in the pregame archive; the difference above is measured against the board snapshot so it matches the historical ranges`
              }
            />
            <Detail label="Graded from" text={row.settlementSourceRef ?? "the ledger records no source for this row"} />
            <Detail label="Event" text={row.eventId ?? "not resolved"} />
            <Detail label="Market policy" text={`${row.registryStatus} — ${row.policyNote}`} />
          </div>

          <button
            type="button"
            onClick={onToggleLayers}
            aria-expanded={layersOpen}
            className="font-mono uppercase tracking-[0.14em]"
            style={{
              marginTop: 12,
              fontSize: 9,
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid var(--vault-rule)",
              color: "var(--vault-text-mute)",
              background: "transparent",
              cursor: "pointer",
            }}
          >
            {layersOpen ? "Hide" : "How these three numbers are built"}
          </button>

          {layersOpen ? (
            <p style={{ marginTop: 10, fontSize: 12, color: "var(--vault-text-mute)", lineHeight: 1.75 }}>
              {probabilityNote}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Figure({ label, text }: { label: string; text: string }) {
  return (
    <span className="text-right">
      <span
        className="font-mono uppercase tracking-[0.14em] block"
        style={{ fontSize: 8, color: "var(--vault-text-faint)" }}
      >
        {label}
      </span>
      <span className="font-mono" style={{ fontSize: 13, color: "var(--vault-text)" }}>
        {text}
      </span>
    </span>
  );
}

function Detail({ label, text }: { label: string; text: string }) {
  return (
    <div style={{ lineHeight: 1.6 }}>
      <span className="font-mono uppercase tracking-[0.14em]" style={{ fontSize: 9, color: "var(--vault-text-faint)" }}>
        {label}
      </span>{" "}
      <span style={{ wordBreak: "break-word" }}>{text}</span>
    </div>
  );
}

function HistoryTable({
  buckets,
  total,
  excluded,
  from,
  to,
}: {
  buckets: GapBucketView[];
  total: number;
  excluded: number;
  from: string | null;
  to: string | null;
}) {
  return (
    <div style={{ ...CARD, padding: 16, marginTop: 20 }}>
      <div className="font-mono uppercase tracking-[0.16em]" style={{ fontSize: 10, color: "var(--vault-gold)", marginBottom: 8 }}>
        How each range has performed
      </div>
      <p style={{ fontSize: 12, color: "var(--vault-text-mute)", lineHeight: 1.7, marginBottom: 12 }}>
        Every settled row from {from ?? "the start of the record"} to {to ?? "the latest settled slate"}, grouped by how
        far the simulation sat from the sportsbook price. {total.toLocaleString()} rows are counted.{" "}
        {excluded.toLocaleString()} were refused by an integrity check and appear in no figure here. Ranges with no
        observations show no rate rather than a zero.
      </p>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ color: "var(--vault-text-faint)" }}>
              {["Range", "Rows", "Came in", "95% interval", "Brier"].map((h) => (
                <th
                  key={h}
                  className="font-mono uppercase tracking-[0.14em]"
                  style={{ fontSize: 9, textAlign: "left", padding: "6px 10px 6px 0", whiteSpace: "nowrap" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {buckets.map((b) => (
              <tr key={b.id} style={{ borderTop: "1px solid var(--vault-rule)" }}>
                <td style={{ padding: "8px 10px 8px 0", color: "var(--vault-text)" }}>{b.label}</td>
                <td className="font-mono" style={{ padding: "8px 10px 8px 0", color: "var(--vault-text-mute)" }}>
                  {b.n.toLocaleString()}
                </td>
                <td className="font-mono" style={{ padding: "8px 10px 8px 0", color: "var(--vault-text)" }}>
                  {b.observedRate == null ? "—" : pct(b.observedRate)}
                </td>
                <td className="font-mono" style={{ padding: "8px 10px 8px 0", color: "var(--vault-text-mute)", whiteSpace: "nowrap" }}>
                  {b.low == null || b.high == null ? "—" : `${pct(b.low)} – ${pct(b.high)}`}
                </td>
                <td className="font-mono" style={{ padding: "8px 10px 8px 0", color: "var(--vault-text-mute)" }}>
                  {b.brier == null ? "—" : b.brier.toFixed(3)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
