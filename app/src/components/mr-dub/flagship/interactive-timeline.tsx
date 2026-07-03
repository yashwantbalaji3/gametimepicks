"use client";
/**
 * Interactive timeline (Phase 3) — an expandable day-by-day story instead of a giant table. Each row is a
 * settled day: record-after-settlement, opening → closing bankroll, P/L, ROI, drawdown, products, ladder
 * step. Expand to reveal every wager that settled that day — legs, official result, odds and payout.
 * Pure display of the canonical timeline model; no money is recomputed.
 */
import { useState } from "react";
import type { TimelineDay, FlagshipEvent } from "@/lib/mr-dub/flagship";

const usd = (n: number | null | undefined) => n == null ? "—" : `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const signed = (n: number) => `${n >= 0 ? "+" : "−"}${usd(Math.abs(n))}`;
const odds = (n: number | null | undefined) => n == null ? "" : n > 0 ? `+${n}` : `${n}`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function fmt(iso: string) { const [y, m, d] = iso.split("-").map(Number); const wd = WD[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]; return { md: `${MONTHS[m - 1]} ${d}`, wd }; }
const tone = (s: string) => s === "win" ? "var(--vault-success)" : s === "loss" ? "var(--gtp-bank-heat)" : "var(--vault-text-faint)";

function WagerDetail({ e }: { e: FlagshipEvent }) {
  const won = e.result === "won" || e.result === "win";
  const lost = e.result === "lost";
  const open = e.status === "open" || e.status === "queued";
  const t = won ? "var(--vault-success)" : lost ? "var(--gtp-bank-heat)" : open ? "var(--vault-gold)" : "var(--vault-text-faint)";
  const label = e.type === "dual_lane_losses" ? "Dual-lane phase seeds" : e.type?.replace(/_/g, " ") ?? "settlement";
  return (
    <div className="rounded-lg px-3 py-2" style={{ border: "1px solid var(--vault-rule)", background: "rgba(255,255,255,0.02)", borderLeft: `2px solid ${t}` }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11.5px] font-medium capitalize" style={{ color: "var(--vault-text)" }}>{label}{e.step ? ` · Step ${e.step}` : ""}{e.combinedOdds != null || e.combinedAmerican != null ? ` · ${odds(e.combinedOdds ?? e.combinedAmerican)}` : ""}</span>
        <span className="font-mono text-[10.5px]" style={{ color: t }}>{open ? `open ${usd(e.atRiskStake ?? e.paperStake)}` : won ? `${usd(e.paperStake)} → ${usd(e.paperReturn)}${e.rolled ? " (rolls)" : ""}` : lost ? signed(e.paperProfit ?? 0) : "settled"}</span>
      </div>
      {(e.legs ?? []).length ? (
        <ul className="mt-1 flex flex-col gap-0.5">
          {e.legs!.map((l, i) => (
            <li key={i} className="text-[10.5px]" style={{ color: "var(--vault-text-mute)" }}>
              · {l.selection}
              {l.result && !["win", "won", "settled", "pending"].includes(l.result) ? <span style={{ color: l.result === "lost" ? "var(--gtp-bank-heat)" : "var(--vault-text-faint)" }}> — {l.result}</span> : null}
              {l.officialResult ? <span style={{ color: "var(--vault-text-faint)" }}> · {l.officialResult}</span> : l.finalScore ? <span style={{ color: "var(--vault-text-faint)" }}> · {l.finalScore}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {e.settlementSource ? <div className="mt-1 font-mono text-[9px]" style={{ color: "var(--vault-text-faint)" }}>source · {e.settlementSource}</div> : null}
    </div>
  );
}

function Row({ d, defaultOpen }: { d: TimelineDay; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const { md, wd } = fmt(d.date);
  const settled = (d.events ?? []).filter((e) => e.status === "settled" || e.status === "open" || e.status === "queued");
  return (
    <div className="overflow-hidden rounded-xl" style={{ border: "1px solid var(--vault-border)", background: "var(--gtp-card, rgba(255,255,255,0.02))" }}>
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left" style={{ cursor: "pointer", background: "transparent" }} aria-expanded={open}>
        <span aria-hidden className="shrink-0 rounded-md" style={{ width: 4, alignSelf: "stretch", background: tone(d.sign), minHeight: 34 }} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-display tabular text-[13px] font-bold" style={{ color: "var(--vault-text)" }}>{md}</span>
            <span className="font-mono text-[9px] uppercase" style={{ color: "var(--vault-text-faint)" }}>{wd}</span>
            <span className="font-mono text-[10px] rounded-full px-1.5" style={{ color: "var(--vault-text-mute)", border: "1px solid var(--vault-rule)" }}>{d.cumWins}–{d.cumLosses}</span>
            {d.ladderStep ? <span className="font-mono text-[9px]" style={{ color: "var(--vault-gold)" }}>{d.ladderLabel} · Step {d.ladderStep}</span> : null}
          </div>
          <div className="mt-0.5 truncate text-[11px]" style={{ color: "var(--vault-text-mute)" }}>{d.headline}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-mono text-[13px] font-bold" style={{ color: tone(d.sign) }}>{d.pl === 0 ? "rolls" : signed(d.pl)}</div>
          <div className="font-mono text-[9.5px]" style={{ color: "var(--vault-text-faint)" }}>{usd(d.closing)} · {d.roiMultiple}×</div>
        </div>
        <span aria-hidden className="shrink-0 text-[10px] transition-transform" style={{ color: "var(--vault-text-faint)", transform: open ? "rotate(180deg)" : "none" }}>▾</span>
      </button>
      {open ? (
        <div className="flex flex-col gap-1.5 px-3.5 pb-3">
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 font-mono text-[9.5px]" style={{ color: "var(--vault-text-faint)" }}>
            <span>Open {usd(d.opening)} → Close {usd(d.closing)}</span>
            <span>Peak {usd(d.hwm)}</span>
            {d.drawdown > 0 ? <span>Drawdown {usd(d.drawdown)} · {(d.drawdownPct * 100).toFixed(2)}%</span> : null}
            <span>Products {d.products.join(" · ") || "—"}</span>
          </div>
          {settled.map((e, i) => <WagerDetail key={e.eventId ?? i} e={e} />)}
          {d.bankedNote ? <div className="rounded-lg px-3 py-2 text-[10.5px]" style={{ border: "1px dashed var(--vault-rule)", color: "var(--vault-text-faint)", background: "rgba(255,255,255,0.015)" }}>{d.bankedNote}</div> : null}
        </div>
      ) : null}
    </div>
  );
}

export default function InteractiveTimeline({ timeline }: { timeline: TimelineDay[] }) {
  return (
    <div className="flex flex-col gap-2">
      {timeline.map((d, i) => <Row key={d.date} d={d} defaultOpen={i === 0} />)}
    </div>
  );
}
