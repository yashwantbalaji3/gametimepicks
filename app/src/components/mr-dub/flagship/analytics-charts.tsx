"use client";
/**
 * Performance analytics (Phase 5) — tabbed SVG charts derived entirely from the settled history:
 * bankroll-over-time, daily P/L, drawdown, product attribution and a calendar heatmap. No chart library
 * (static-export safe); every series comes from the reconciled flagship model. No fabricated metrics.
 */
import { useState } from "react";
import type { FlagshipCharts } from "@/lib/mr-dub/flagship";

const usd0 = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const signed0 = (n: number) => `${n >= 0 ? "+" : "−"}$${Math.round(Math.abs(n)).toLocaleString("en-US")}`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const md = (iso: string) => { const [, m, d] = iso.split("-").map(Number); return `${MONTHS[m - 1]} ${d}`; };
const GREEN = "var(--vault-success)"; const RED = "var(--gtp-bank-heat)"; const GOLD = "var(--vault-gold)"; const FAINT = "var(--vault-text-faint)"; const MUTE = "var(--vault-text-mute)";

const W = 720, H = 240, PAD_L = 6, PAD_R = 6, PAD_T = 14, PAD_B = 20;

function BankrollChart({ data }: { data: { date: string; closing: number }[] }) {
  if (data.length < 2) return null;
  const max = Math.max(...data.map((d) => d.closing)) * 1.04;
  const iw = W - PAD_L - PAD_R, ih = H - PAD_T - PAD_B;
  const x = (i: number) => PAD_L + (i / (data.length - 1)) * iw;
  const y = (v: number) => PAD_T + ih - (v / max) * ih;
  const line = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d.closing).toFixed(1)}`).join(" ");
  const area = `${line} L${x(data.length - 1).toFixed(1)},${(PAD_T + ih).toFixed(1)} L${x(0).toFixed(1)},${(PAD_T + ih).toFixed(1)} Z`;
  const peakI = data.reduce((bi, d, i) => (d.closing > data[bi].closing ? i : bi), 0);
  const milestones = data.map((d, i) => ({ ...d, i })).filter((d) => d.closing >= 9999 && (d.i === 0 || data[d.i - 1].closing < 9999));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="none" style={{ display: "block", maxHeight: 240 }} role="img" aria-label="Bankroll over time">
      <defs>
        <linearGradient id="bkFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="color-mix(in srgb, var(--vault-warn) 28%, transparent)" /><stop offset="100%" stopColor="color-mix(in srgb, var(--vault-warn) 2%, transparent)" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((f) => <line key={f} x1={PAD_L} x2={W - PAD_R} y1={PAD_T + ih * f} y2={PAD_T + ih * f} stroke="var(--vault-rule)" strokeWidth={0.5} strokeDasharray="2 4" />)}
      <path d={area} fill="url(#bkFill)" />
      <path className="gtp-chart-draw" d={line} fill="none" stroke={GOLD} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {milestones.map((m) => <circle key={m.i} cx={x(m.i)} cy={y(m.closing)} r={3.5} fill={GREEN} stroke="var(--vault-bg)" strokeWidth={1.5} />)}
      <circle cx={x(peakI)} cy={y(data[peakI].closing)} r={4} fill={GOLD} stroke="var(--vault-bg)" strokeWidth={1.5} />
      <text x={x(peakI)} y={y(data[peakI].closing) - 7} fill={GOLD} fontSize={10} fontFamily="monospace" textAnchor="middle">{usd0(data[peakI].closing)}</text>
    </svg>
  );
}

function BarsChart({ data, accessor }: { data: { date: string; v: number }[]; accessor?: never }) {
  if (!data.length) return null;
  const maxAbs = Math.max(1, ...data.map((d) => Math.abs(d.v)));
  const iw = W - PAD_L - PAD_R, ih = H - PAD_T - PAD_B;
  const bw = iw / data.length;
  const zeroY = PAD_T + ih / 2;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="none" style={{ display: "block", maxHeight: 240 }} role="img" aria-label="Daily profit and loss">
      <line x1={PAD_L} x2={W - PAD_R} y1={zeroY} y2={zeroY} stroke="var(--vault-rule)" strokeWidth={0.75} />
      {data.map((d, i) => {
        const h = (Math.abs(d.v) / maxAbs) * (ih / 2 - 2);
        const up = d.v >= 0;
        return <rect key={i} x={PAD_L + i * bw + bw * 0.14} y={up ? zeroY - h : zeroY} width={bw * 0.72} height={Math.max(0.6, h)} rx={1} fill={d.v > 0 ? GREEN : d.v < 0 ? RED : FAINT} opacity={0.92} />;
      })}
    </svg>
  );
}

function DrawdownChart({ data }: { data: { date: string; drawdown: number }[] }) {
  if (data.length < 2) return null;
  const max = Math.max(1, ...data.map((d) => d.drawdown)) * 1.15;
  const iw = W - PAD_L - PAD_R, ih = H - PAD_T - PAD_B;
  const x = (i: number) => PAD_L + (i / (data.length - 1)) * iw;
  const y = (v: number) => PAD_T + (v / max) * ih; // 0 at top → drawdown drops down
  const line = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d.drawdown).toFixed(1)}`).join(" ");
  const area = `${line} L${x(data.length - 1).toFixed(1)},${PAD_T} L${x(0).toFixed(1)},${PAD_T} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="none" style={{ display: "block", maxHeight: 240 }} role="img" aria-label="Drawdown from peak">
      <defs><linearGradient id="ddFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="rgba(242,84,91,0.04)" /><stop offset="100%" stopColor="rgba(242,84,91,0.26)" /></linearGradient></defs>
      <line x1={PAD_L} x2={W - PAD_R} y1={PAD_T} y2={PAD_T} stroke="var(--vault-rule)" strokeWidth={0.75} />
      <path d={area} fill="url(#ddFill)" />
      <path d={line} fill="none" stroke={RED} strokeWidth={1.75} strokeLinejoin="round" />
    </svg>
  );
}

function ProductBars({ data }: { data: FlagshipCharts["productPerformance"] }) {
  const maxAbs = Math.max(1, ...data.map((p) => Math.abs(p.profit)));
  const scale = (v: number) => Math.sign(v) * Math.sqrt(Math.abs(v) / maxAbs) * 100; // symsqrt so side lanes are visible next to BB
  return (
    <div className="flex flex-col gap-2">
      {data.map((p) => (
        <div key={p.productId} className="flex items-center gap-2.5">
          <span className="w-[116px] shrink-0 truncate text-[11.5px]" style={{ color: "var(--vault-text)" }}><span aria-hidden className="mr-1">{p.glyph}</span>{p.label}</span>
          <div className="relative h-4 flex-1 rounded-sm" style={{ background: "color-mix(in srgb, var(--vault-wash-base) 3%, transparent)" }}>
            <div className="absolute top-0 bottom-0" style={{ left: "50%", width: 1, background: "var(--vault-rule)" }} />
            <div className="absolute top-0 bottom-0 rounded-sm" style={{ [p.profit >= 0 ? "left" : "right"]: "50%", width: `${Math.abs(scale(p.profit)) / 2}%`, background: p.net === "positive" ? GREEN : p.net === "negative" ? RED : FAINT, opacity: 0.85 } as any} />
          </div>
          <span className="w-[92px] shrink-0 text-right font-mono text-[11px] tabular" style={{ color: p.net === "positive" ? GREEN : p.net === "negative" ? RED : MUTE }}>{signed0(p.profit)}</span>
          <span className="w-[52px] shrink-0 text-right font-mono text-[10px]" style={{ color: FAINT }}>{p.wins}-{p.losses}</span>
        </div>
      ))}
      <p className="mt-1 font-mono text-[9.5px]" style={{ color: FAINT }}>Bar length is √-scaled so the side lanes stay visible beside Bank Builder. Bank Builder P/L is the canonical cumulative-crown bankroll growth; the side lanes are flat-stake paper.</p>
    </div>
  );
}

function Heatmap({ data }: { data: FlagshipCharts["heatmap"] }) {
  const maxAbs = Math.max(1, ...data.map((d) => Math.abs(d.pl)));
  const cellColor = (pl: number) => {
    if (Math.abs(pl) < 0.01) return "var(--vault-wash)";
    const t = Math.min(1, Math.sqrt(Math.abs(pl) / maxAbs));
    return pl > 0 ? `rgba(74,222,128,${(0.18 + t * 0.72).toFixed(2)})` : `rgba(242,84,91,${(0.18 + t * 0.72).toFixed(2)})`;
  };
  return (
    <div className="flex flex-wrap gap-1">
      {data.map((d) => (
        <div key={d.date} title={`${md(d.date)} · ${signed0(d.pl)}`} className="rounded-sm" style={{ width: 26, height: 26, background: cellColor(d.pl), border: "1px solid var(--vault-rule)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span className="font-mono" style={{ fontSize: 7.5, color: "var(--vault-text-faint)" }}>{d.date.slice(8)}</span>
        </div>
      ))}
    </div>
  );
}

const TABS = [
  { id: "bankroll", label: "Bankroll" },
  { id: "daily", label: "Daily P/L" },
  { id: "drawdown", label: "Drawdown" },
  { id: "product", label: "By product" },
  { id: "heatmap", label: "Heatmap" },
] as const;

export default function AnalyticsCharts({ charts }: { charts: FlagshipCharts }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("bankroll");
  const first = charts.bankroll[0]?.date, last = charts.bankroll[charts.bankroll.length - 1]?.date;
  return (
    <div className="rounded-xl px-3.5 py-3" style={{ border: "1px solid var(--vault-border)", background: "var(--gtp-card, var(--vault-wash-faint))" }}>
      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className="gtp-pressable rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.06em]" style={{ cursor: "pointer", color: tab === t.id ? "var(--vault-bg)" : "var(--vault-text-mute)", background: tab === t.id ? "var(--vault-gold)" : "transparent", border: `1px solid ${tab === t.id ? "var(--vault-gold)" : "var(--vault-rule)"}` }}>{t.label}</button>
        ))}
      </div>
      <div className="mt-3 min-h-[200px]">
        {tab === "bankroll" ? <BankrollChart data={charts.bankroll} /> : null}
        {tab === "daily" ? <BarsChart data={charts.dailyRoi.map((d) => ({ date: d.date, v: d.pl }))} /> : null}
        {tab === "drawdown" ? <DrawdownChart data={charts.drawdown} /> : null}
        {tab === "product" ? <ProductBars data={charts.productPerformance} /> : null}
        {tab === "heatmap" ? <Heatmap data={charts.heatmap} /> : null}
      </div>
      {tab !== "product" && tab !== "heatmap" && first && last ? (
        <div className="mt-1 flex justify-between font-mono text-[9px]" style={{ color: FAINT }}><span>{md(first)}</span><span>{md(last)}</span></div>
      ) : null}
    </div>
  );
}
