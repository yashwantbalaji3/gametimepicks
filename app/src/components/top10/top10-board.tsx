"use client";
/**
 * Model Top 10 Picks — the universal cross-sport daily board (Overall / Safe / Value / Props / Team).
 * Pure display of the derived Top10Board model: real odds, model vs market probability, a specific
 * reason and risk per pick. Mental parlay-building only — there is no bet placement here.
 */
import { useState } from "react";
import Link from "next/link";
import type { Top10Board, Top10Pick } from "@/lib/top10/top10-picks";

const odds = (n: number) => (n > 0 ? `+${n}` : `${n}`);
const pct = (p: number | null) => (p == null ? "—" : `${Math.round(p * 100)}%`);
const TABS = [["overall", "Top 10"], ["safe", "Safe"], ["value", "Value"], ["team", "Team markets"], ["props", "Props"]] as const;

function Row({ p, rank }: { p: Top10Pick; rank: number }) {
  const [open, setOpen] = useState(false);
  const inner = (
    <>
      <span className="w-5 shrink-0 text-center font-mono text-[10px]" style={{ color: rank <= 3 ? "var(--vault-gold)" : "var(--vault-text-faint)" }}>{rank}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px] font-medium" style={{ color: "var(--vault-text)" }}>{p.selection}</div>
        <div className="truncate font-mono text-[9.5px]" style={{ color: "var(--vault-text-faint)" }}>{p.sport === "mlb" ? "⚾" : "⚽"} {p.game} · {p.market} · {p.confidence}</div>
      </div>
      <span className="shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[11px] font-bold" style={{ color: "var(--vault-text)", border: "1px solid var(--vault-rule)" }}>{odds(p.odds)}</span>
      <span className="w-[74px] shrink-0 text-right font-mono text-[9.5px]" style={{ color: "var(--vault-text-mute)" }}>{pct(p.modelProbability)} <span style={{ color: "var(--vault-text-faint)" }}>vs {pct(p.marketProbability)}</span></span>
    </>
  );
  return (
    <div className="rounded-lg" style={{ border: "1px solid var(--vault-rule)", background: "rgba(255,255,255,0.015)" }}>
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-2.5 py-2 text-left" style={{ cursor: "pointer", background: "transparent" }} aria-expanded={open}>
        {inner}
      </button>
      {open ? (
        <div className="flex flex-col gap-1 px-2.5 pb-2 pl-9 text-[10.5px]" style={{ color: "var(--vault-text-mute)" }}>
          <span><span style={{ color: "var(--vault-success)" }}>Why:</span> {p.reason}</span>
          <span><span style={{ color: "var(--gtp-bank-heat)" }}>Risk:</span> {p.risk}</span>
          <span className="font-mono text-[9px]" style={{ color: "var(--vault-text-faint)" }}>source · {p.source}{p.gameSlug ? <> · <Link href={`/world-cup/round-of-32/${p.gameSlug}`} style={{ color: "var(--vault-gold)" }}>game detail →</Link></> : null}</span>
        </div>
      ) : null}
    </div>
  );
}

export default function Top10BoardSection({ board }: { board: Top10Board }) {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("overall");
  const picks = board[tab];
  return (
    <div className="rounded-xl px-3.5 py-3" style={{ border: "1px solid var(--vault-border)", background: "var(--gtp-card, rgba(255,255,255,0.02))" }}>
      <div className="flex flex-wrap gap-1.5">
        {TABS.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className="gtp-pressable rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.06em]" style={{ cursor: "pointer", color: tab === id ? "var(--vault-bg)" : "var(--vault-text-mute)", background: tab === id ? "var(--vault-gold)" : "transparent", border: `1px solid ${tab === id ? "var(--vault-gold)" : "var(--vault-rule)"}` }}>{label}</button>
        ))}
      </div>
      <div className="mt-2.5 flex flex-col gap-1">
        {picks.length ? picks.map((p, i) => <Row key={p.id} p={p} rank={i + 1} />) : (
          <p className="rounded-lg px-3 py-3 text-[11.5px]" style={{ border: "1px dashed var(--vault-border)", color: "var(--vault-text-mute)" }}>
            No qualified {tab} picks right now — picks appear when pregame markets clear the model's quality bar. Never forced.
          </p>
        )}
      </div>
      <p className="mt-2 font-mono text-[9px]" style={{ color: "var(--vault-text-faint)" }}>
        Ranked by settled market reliability × model probability + edge — never by payout. Tap a pick for why/risk. Paper-only research; no bets are placed here.
      </p>
    </div>
  );
}
