"use client";
/**
 * LedgerCalendar — Mr. Dub's paper-portfolio ledger as a premium calendar (replaces the old day-list).
 *
 * A month grid of P/L cells (green win / red loss / grey flat), product dots, and the running bankroll;
 * a stats strip (streak, best day, largest win/loss, high-water mark, rolling ROI); and a click-through
 * day drawer with every settled ticket for that day. PRESENTATION ONLY — all figures come from the
 * canonical daily-summary via buildLedgerCalendar; nothing here computes or mutates money.
 */
import { useState, useEffect, useCallback } from "react";
import { PRODUCT_META, type CalMonth, type CalStats, type CalCell, type LedgerDay, type LedgerEvent } from "@/lib/mr-dub/ledger-calendar";

const usd = (n: number | null | undefined) => n == null ? "—" : `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const usd0 = (n: number | null | undefined) => n == null ? "—" : `$${Math.round(Number(n)).toLocaleString("en-US")}`;
const signed = (n: number) => `${n >= 0 ? "+" : "−"}${usd0(Math.abs(n))}`;
// Compact glance-format for the tiny calendar cells (full precision lives in the day drawer).
const compact = (n: number | null | undefined) => {
  if (n == null) return "—";
  const a = Math.abs(Number(n));
  return a >= 1000 ? `$${(a / 1000).toFixed(a >= 10000 ? 0 : 1)}k` : `$${Math.round(a)}`;
};
const signedC = (n: number) => `${n >= 0 ? "+" : "−"}${compact(Math.abs(n))}`;
const WD = ["S", "M", "T", "W", "T", "F", "S"];
const win = "var(--vault-success)", loss = "var(--gtp-bank-heat)", faint = "var(--vault-text-faint)";
const resultColor = (r: CalCell["result"]) => r === "win" ? win : r === "loss" ? loss : r === "flat" ? "var(--vault-text-mute)" : faint;

function StatTile({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl px-3 py-2.5 min-w-0" style={{ background: "rgba(255,255,255,0.025)", border: "1px solid var(--vault-border)" }}>
      <div className="font-display tracking-tight truncate" style={{ color: color ?? "var(--vault-text)", fontSize: 16, fontWeight: 800 }}>{value}</div>
      <div className="font-mono uppercase tracking-[0.1em] truncate" style={{ color: faint, fontSize: 8.5 }}>{label}</div>
      {sub ? <div className="mt-0.5 truncate text-[10px]" style={{ color: "var(--vault-text-mute)" }}>{sub}</div> : null}
    </div>
  );
}

function DayCell({ cell, onPick }: { cell: CalCell; onPick: (d: LedgerDay) => void }) {
  if (!cell.inMonth) return <div aria-hidden className="rounded-lg" style={{ minHeight: 58 }} />;
  const r = cell.result, d = cell.day;
  const tint = r === "win" ? "rgba(110,231,168,0.10)" : r === "loss" ? "rgba(225,29,42,0.10)" : "rgba(255,255,255,0.015)";
  const ring = r === "win" ? "color-mix(in srgb, var(--vault-success) 38%, transparent)" : r === "loss" ? "color-mix(in srgb, var(--gtp-bank-heat) 38%, transparent)" : "var(--vault-border)";
  const clickable = !!d;
  return (
    <button
      type="button" disabled={!clickable} onClick={() => d && onPick(d)}
      aria-label={d ? `${cell.date}: ${signed(d.pl)}, bankroll ${usd(d.closing)}` : cell.date ?? undefined}
      className={`group relative flex flex-col rounded-lg px-1.5 py-1 text-left transition-transform ${clickable ? "hover:-translate-y-0.5 cursor-pointer" : "cursor-default"}`}
      style={{ minHeight: 58, background: tint, border: `1px solid ${ring}` }}
    >
      <span className="font-mono tabular" style={{ color: d ? "var(--vault-text-mute)" : faint, fontSize: 9.5 }}>{cell.dayNum}</span>
      {d ? (
        <>
          <span className="font-display tabular tracking-tight leading-none mt-0.5 whitespace-nowrap" style={{ color: resultColor(r), fontSize: 12, fontWeight: 800 }}>{signedC(d.pl)}</span>
          <span className="mt-auto flex items-center justify-between gap-0.5">
            <span className="flex gap-0.5">{cell.products.slice(0, 3).map((p) => <span key={p} aria-hidden style={{ fontSize: 8.5 }}>{PRODUCT_META[p]?.glyph ?? "•"}</span>)}</span>
            <span className="font-mono tabular shrink-0" style={{ color: faint, fontSize: 8 }}>{compact(d.closing)}</span>
          </span>
        </>
      ) : null}
    </button>
  );
}

function EventRow({ e }: { e: LedgerEvent }) {
  const won = e.result === "won" || e.result === "win";
  const lost = e.result === "lost";
  const tone = won ? win : lost ? loss : "var(--vault-gold-bright)";
  const meta = e.category ? PRODUCT_META[e.category] : undefined;
  return (
    <div className="rounded-lg px-3 py-2" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--vault-border)", borderLeft: `2px solid ${tone}` }}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11.5px] font-medium truncate" style={{ color: "var(--vault-text)" }}>
          {meta ? `${meta.glyph} ${meta.label}` : (e.category ?? "—")}{e.laneId ? ` · ${e.laneId.replace("lane-", "Lane ").replace("-ladder", "")}` : ""}{e.step ? ` · Step ${e.step}` : ""}
        </span>
        <span className="font-mono tabular text-[11px] shrink-0" style={{ color: tone }}>
          {e.status === "open" ? `open ${usd(e.paperStake)}` : `${(e.paperProfit ?? 0) >= 0 ? "+" : "−"}${usd(Math.abs(e.paperProfit ?? 0))}`}
        </span>
      </div>
      <div className="mt-0.5 flex flex-wrap gap-x-2 font-mono text-[9.5px]" style={{ color: faint }}>
        {e.paperStake != null ? <span>stake {usd(e.paperStake)}</span> : null}
        {e.paperReturn != null ? <span>→ {usd(e.paperReturn)}</span> : null}
        {e.combinedAmerican != null ? <span>{e.combinedAmerican > 0 ? "+" : ""}{e.combinedAmerican}</span> : null}
        {e.result ? <span style={{ color: tone }}>· {String(e.result).toUpperCase()}</span> : null}
      </div>
      {e.legs?.length ? (
        <div className="mt-1 flex flex-col gap-0.5 text-[10.5px]" style={{ color: "var(--vault-text-mute)" }}>
          {e.legs.map((l: any, i: number) => <span key={i} className="truncate">· {l.selection}{l.officialResult ? ` (${l.officialResult})` : ""}</span>)}
        </div>
      ) : null}
    </div>
  );
}

function DayDrawer({ day, onClose }: { day: LedgerDay; onClose: () => void }) {
  const esc = useCallback((e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }, [onClose]);
  useEffect(() => { document.addEventListener("keydown", esc); return () => document.removeEventListener("keydown", esc); }, [esc]);
  // group the day's events by product category, in a stable product order
  const order = ["bank_builder", "moonshot", "wc_specials", "specials", "homer_nukes", "mlb"];
  const groups = new Map<string, LedgerEvent[]>();
  for (const e of day.events ?? []) { const k = e.category ?? "other"; (groups.get(k) ?? groups.set(k, []).get(k)!).push(e); }
  const orderedKeys = [...groups.keys()].sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
  return (
    <div role="dialog" aria-modal="true" aria-label={`Ledger detail for ${day.date}`} className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center" onClick={onClose}>
      <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.62)", backdropFilter: "blur(2px)" }} />
      <div onClick={(e) => e.stopPropagation()} className="relative w-full sm:max-w-lg max-h-[85vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl px-4 py-4 animate-[slideup_.18s_ease-out]"
        style={{ background: "var(--vault-surface, #140d09)", border: "1px solid var(--vault-rule)", boxShadow: "0 -8px 40px rgba(0,0,0,0.5)" }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 17, fontWeight: 800 }}>{day.date}</div>
            <div className="font-mono text-[11px]" style={{ color: faint }}>{usd(day.opening)} → {usd(day.closing)}</div>
          </div>
          <div className="text-right">
            <div className="font-display tabular" style={{ color: day.pl > 0 ? win : day.pl < 0 ? loss : faint, fontSize: 20, fontWeight: 800 }}>{signed(day.pl)}</div>
            <div className="font-mono text-[10px]" style={{ color: faint }}>{day.wins}W · {day.losses}L{day.voids ? ` · ${day.voids}V` : ""}{day.pending ? ` · ${day.pending}P` : ""}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="shrink-0 rounded-full px-2 py-0.5 font-mono text-[12px]" style={{ color: faint, border: "1px solid var(--vault-border)" }}>✕</button>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          <StatTile label="Staked" value={usd0(day.staked)} />
          <StatTile label="Returned" value={usd0(day.returned)} />
          <StatTile label="Closing bankroll" value={usd0(day.closing)} color="var(--vault-gold-bright)" />
        </div>
        <div className="mt-3 flex flex-col gap-2.5">
          {orderedKeys.length ? orderedKeys.map((k) => (
            <div key={k}>
              <div className="mb-1 font-mono uppercase tracking-[0.12em] text-[9.5px]" style={{ color: faint }}>{PRODUCT_META[k]?.label ?? k}</div>
              <div className="flex flex-col gap-1.5">{groups.get(k)!.map((e, i) => <EventRow key={e.eventId ?? i} e={e} />)}</div>
            </div>
          )) : <p className="text-[12px]" style={{ color: "var(--vault-text-mute)" }}>No individual tickets recorded for this day.</p>}
        </div>
      </div>
      <style>{`@keyframes slideup{from{transform:translateY(14px);opacity:.6}to{transform:translateY(0);opacity:1}}`}</style>
    </div>
  );
}

export default function LedgerCalendar({ months, stats }: { months: CalMonth[]; stats: CalStats }) {
  const [picked, setPicked] = useState<LedgerDay | null>(null);
  const streakLabel = stats.currentStreak.kind === "none" ? "—" : `${stats.currentStreak.len}${stats.currentStreak.kind}`;
  return (
    <section aria-label="Ledger calendar" className="flex flex-col gap-3">
      {/* Stats strip — presentation-only "feel" metrics */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
        <StatTile label="Current streak" value={streakLabel} color={stats.currentStreak.kind === "W" ? win : stats.currentStreak.kind === "L" ? loss : undefined} sub={`${stats.winDays}W · ${stats.lossDays}L days`} />
        <StatTile label="Best day" value={stats.bestDay ? signed(stats.bestDay.pl) : "—"} color={win} sub={stats.bestDay?.date.slice(5)} />
        <StatTile label="Worst day" value={stats.worstDay && stats.worstDay.pl < 0 ? signed(stats.worstDay.pl) : "$0"} color={loss} sub={stats.worstDay && stats.worstDay.pl < 0 ? stats.worstDay.date.slice(5) : "no losing day"} />
        <StatTile label="High-water" value={usd0(stats.highWaterMark)} color="var(--vault-gold-bright)" />
        <StatTile label="Bankroll" value={usd0(stats.currentBankroll)} sub={stats.recoveredToHighWater ? "at high-water ✓" : "below HWM"} color={stats.recoveredToHighWater ? win : undefined} />
        <StatTile label="Rolling ROI" value={`${stats.roiMultiple}×`} color={stats.totalPl >= 0 ? win : loss} sub={`${signed(stats.totalPl)} total`} />
      </div>

      {/* Calendar months */}
      {months.map((m) => (
        <div key={m.key} className="rounded-2xl px-2.5 py-3" style={{ background: "rgba(255,255,255,0.015)", border: "1px solid var(--vault-border)" }}>
          <div className="mb-2 px-1 font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 700 }}>{m.label}</div>
          <div className="grid grid-cols-7 gap-1">
            {WD.map((w, i) => <div key={i} className="text-center font-mono uppercase tracking-[0.1em]" style={{ color: faint, fontSize: 8.5 }}>{w}</div>)}
            {m.weeks.flat().map((c, i) => <DayCell key={c.date ?? `pad${i}`} cell={c} onPick={setPicked} />)}
          </div>
        </div>
      ))}

      <p className="px-1 font-mono text-[10px]" style={{ color: faint }}>Tap a day for the exact tickets · green = up, red = down, grey = flat · 🏦 Bank Builder 🌙 Moonshot ⚽ WC Specials ⚾ Homer Nukes. Paper-only educational tracking.</p>

      {picked ? <DayDrawer day={picked} onClose={() => setPicked(null)} /> : null}
    </section>
  );
}
