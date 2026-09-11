"use client";
import { useMemo, useState } from "react";
import { replayBankroll } from "@/lib/parlays/lab/style-replay.mjs";

/**
 * STYLE REPLAY CHART (P260 · Parlay Lab 2.0) — one risk level's settled cards, in date order, applied
 * to the reader's bankroll at their flat unit.
 *
 * A completed past, drawn: every point is a card that was published before its games and graded after
 * them. Nothing on this chart is simulated or extended forward. Drag, hover or use the arrow keys to
 * read any day; the summary under it is the same fact in words, and is also the chart's label for
 * screen readers.
 */
export interface ReplayItem {
  readonly date: string;
  readonly result: string;
  readonly decimal: number;
}

interface Point { readonly date: string | null; readonly balance: number }
interface Replay {
  readonly points: readonly Point[];
  readonly start: number;
  readonly end: number;
  readonly lowest: number;
  readonly worstRun: number;
  readonly cards: number;
  readonly wins: number;
}

const fmtDate = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const money = (v: number) => `${v < 0 ? "−" : ""}$${Math.abs(v).toFixed(2)}`;

export default function StyleReplayChart({
  series, bankroll, unitPct, since, tierLabel,
}: {
  series: readonly ReplayItem[];
  bankroll: number | null;
  unitPct: number;
  since: string | null;
  tierLabel: string;
}) {
  const start = bankroll ?? 100;
  const unit = Math.round(start * unitPct) / 100;
  const r = useMemo(() => replayBankroll([...series], { bankroll: start, unit }) as Replay | null, [series, start, unit]);
  const [at, setAt] = useState<number | null>(null);

  if (!r || r.cards === 0) {
    return (
      <p className="m-0" style={{ color: "var(--vault-text-faint)", fontSize: 12.5 }}>
        No settled {tierLabel.toLowerCase()} cards{since ? ` since ${fmtDate(since)}` : ""} — nothing to replay yet.
      </p>
    );
  }

  const W = 600, H = 190, PX = 12, PY = 18;
  const n = r.points.length;
  const vals = r.points.map((p) => p.balance);
  const pad = Math.max(unit, (Math.max(...vals) - Math.min(...vals)) * 0.14);
  const lo = Math.min(...vals) - pad;
  const hi = Math.max(...vals) + pad;
  const x = (i: number) => PX + (n === 1 ? 0.5 : i / (n - 1)) * (W - 2 * PX);
  const y = (v: number) => PY + (1 - (v - lo) / (hi - lo)) * (H - 2 * PY);
  const line = r.points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.balance).toFixed(1)}`).join(" ");
  const base = y(start);
  const area = `${line} L${x(n - 1).toFixed(1)} ${base.toFixed(1)} L${x(0).toFixed(1)} ${base.toFixed(1)} Z`;
  const tone = r.end >= start ? "var(--vault-success)" : "var(--vault-danger)";
  const idx = at ?? n - 1;
  const cur = r.points[idx];

  const summary =
    `Since ${since ? fmtDate(since) : "the last rule change"}, a ${money(unit)} card at ${tierLabel.toLowerCase()} on each day it had one ` +
    `would have taken ${money(start)} to ${money(r.end)}: ${r.wins} won of ${r.cards}, longest losing run ${r.worstRun}, lowest point ${money(r.lowest)}.`;

  const pickAt = (clientX: number, rect: DOMRect) => {
    const px = ((clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - PX) / (W - 2 * PX)) * (n - 1));
    setAt(Math.min(n - 1, Math.max(0, i)));
  };

  return (
    <figure className="m-0 flex flex-col gap-2">
      <figcaption className="flex items-baseline justify-between gap-2">
        <span className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
          Replay · this level on {bankroll != null ? "your bankroll" : "a $100 bankroll"}
        </span>
        <span aria-live="polite" className="font-mono tabular-nums whitespace-nowrap" style={{ color: "var(--vault-text)", fontSize: 12.5, fontWeight: 600 }}>
          {cur.date ? fmtDate(cur.date) : "Start"} · {money(cur.balance)}
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={summary}
        tabIndex={0}
        className="w-full h-auto rounded-[10px] touch-pan-y"
        style={{ background: "var(--vault-wash-faint)", border: "1px solid var(--vault-rule)", cursor: "crosshair" }}
        onPointerMove={(e) => pickAt(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerDown={(e) => pickAt(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerLeave={() => setAt(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") { e.preventDefault(); setAt(Math.max(0, idx - 1)); }
          else if (e.key === "ArrowRight") { e.preventDefault(); setAt(Math.min(n - 1, idx + 1)); }
        }}
      >
        <line x1={PX} x2={W - PX} y1={base} y2={base} stroke="var(--vault-text-faint)" strokeDasharray="4 5" strokeWidth={1} />
        <text x={W - PX} y={base - 7} textAnchor="end" fontSize={15} fill="var(--vault-text-faint)">
          start {money(start)}
        </text>
        <path d={area} fill={tone} opacity={0.12} />
        <path
          key={`${tierLabel}:${unit}:${n}`}
          d={line}
          pathLength={1}
          className="gtp-line-draw"
          fill="none"
          stroke={tone}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <line x1={x(idx)} x2={x(idx)} y1={PY / 2} y2={H - PY / 2} stroke="var(--vault-text-mute)" strokeWidth={1} opacity={0.45} />
        <circle cx={x(idx)} cy={y(cur.balance)} r={5} fill={tone} stroke="var(--vault-bg)" strokeWidth={2} />
      </svg>
      <div className="flex justify-between font-mono tabular-nums" style={{ color: "var(--vault-text-faint)", fontSize: 10.5 }} aria-hidden="true">
        <span>{r.points[1]?.date ? fmtDate(r.points[1].date) : ""}</span>
        <span>{r.points[n - 1]?.date ? fmtDate(r.points[n - 1].date as string) : ""}</span>
      </div>
      <p className="m-0" style={{ color: "var(--vault-text-mute)", fontSize: 12.5, lineHeight: 1.6 }}>
        {summary}
        {bankroll == null ? ` Enter a bankroll above to replay it on your own number at your ${unitPct}% unit.` : ""}
      </p>
    </figure>
  );
}
