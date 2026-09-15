"use client";
/**
 * SavedList (P310) — the reader's saved forecasts, grouped by what happened, joined to the graded ledgers on the
 * client. Every result comes from a canonical ledger row or is stated as pending; a saved snapshot is never rewritten.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSavedForecasts, type SavedForecast } from "@/lib/saved/saved-store";
import { LEDGER_URLS, parseLedger, resolveResult } from "@/lib/saved/results.mjs";
import { savedAfterStart } from "@/lib/saved/saved-schema.mjs";
import { PUBLIC_STATE_LABEL, type PublicModelState } from "@/lib/command-center/contract";
import ModelStatusChip from "@/components/command-center/model-status-chip";

type Ledgers = { mlbGames: object[]; nfl: object[]; epl: object[]; ufc: object[] };
type Resolved = { state: "UPCOMING" | "PENDING" | "FINAL"; outcome: "HIT" | "MISS" | "VOID" | null; actual: string | null; gradedAt: string | null };

const SPORT_LABEL: Record<string, string> = { mlb: "MLB", nfl: "NFL", epl: "Premier League", ufc: "UFC" };
const etStamp = (iso: string | null) => (iso && Number.isFinite(Date.parse(iso)) ? new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " ET" : null);

function Row({ s, r, onRemove }: { s: SavedForecast; r: Resolved; onRemove: () => void }) {
  const tone = r.outcome === "HIT" ? "var(--vault-success)" : r.outcome === "MISS" ? "var(--vault-danger)" : "var(--vault-text-faint)";
  return (
    <li className="flex flex-col gap-1.5 rounded-[12px] px-3 py-2.5" style={{ border: "1px solid var(--vault-border)", background: "color-mix(in srgb, var(--vault-scrim-base) 55%, transparent)" }}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>{SPORT_LABEL[s.sport] ?? s.sport}{s.context ? ` · ${s.context}` : ""}{s.startUtc ? ` · ${etStamp(s.startUtc)}` : ""}</span>
        <ModelStatusChip state={s.modelState as PublicModelState} label={PUBLIC_STATE_LABEL[s.modelState as PublicModelState] ?? s.modelState} family={s.modelFamily ?? undefined} />
      </div>
      <Link href={s.href} className="font-display" style={{ color: "var(--vault-text)", fontSize: 15, fontWeight: 800, textDecoration: "none" }}>{s.matchup}</Link>
      <span style={{ color: "var(--vault-text-mute)", fontSize: 12.5 }}><span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>{s.family} </span><strong style={{ color: "var(--vault-text)" }}>{s.value}</strong>{s.sub ? ` · ${s.sub}` : ""}</span>
      {s.signal ? <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>{s.signal}</span> : null}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="font-mono" style={{ color: tone, fontSize: 10.5 }}>
          {r.state === "FINAL" ? `Final${r.actual ? ` ${r.actual}` : ""} · ${r.outcome === "HIT" ? "the forecast landed" : r.outcome === "MISS" ? "the forecast missed" : "no result (void)"}` : r.state === "PENDING" ? "Started · result not graded yet" : "Upcoming"}
        </span>
        <span className="font-mono" style={{ color: savedAfterStart(s) ? "var(--vault-warn)" : "var(--vault-text-faint)", fontSize: 9.5 }}>saved {etStamp(s.savedAt)}{savedAfterStart(s) ? " · after the start, so not a pre-event pick" : ""}{s.updatedAt ? ` · numbers as of ${etStamp(s.updatedAt)}` : ""}</span>
      </div>
      <button type="button" onClick={onRemove} className="self-start font-mono uppercase tracking-[0.08em]" style={{ minHeight: 36, padding: "0 12px", borderRadius: 999, border: "1px solid var(--vault-rule)", background: "transparent", color: "var(--vault-text-faint)", fontSize: 9.5, cursor: "pointer" }}>Remove</button>
    </li>
  );
}

export default function SavedList() {
  const { items, ready, unsave, clear } = useSavedForecasts();
  const [ledgers, setLedgers] = useState<Ledgers | null>(null);
  const [ledgerError, setLedgerError] = useState(false);
  const [sport, setSport] = useState<string>("all");
  const nowIso = useMemo(() => new Date().toISOString(), []);

  useEffect(() => {
    if (!ready || !items.length) return;
    let alive = true;
    (async () => {
      const out: Ledgers = { mlbGames: [], nfl: [], epl: [], ufc: [] };
      let failed = false;
      await Promise.all((Object.keys(LEDGER_URLS) as Array<keyof typeof LEDGER_URLS>).map(async (k) => {
        try {
          const res = await fetch(LEDGER_URLS[k], { cache: "no-store" });
          if (!res.ok) { failed = true; return; }
          out[k] = parseLedger(k, await res.text()) as object[];
        } catch { failed = true; }
      }));
      if (alive) { setLedgers(out); setLedgerError(failed); }
    })();
    return () => { alive = false; };
  }, [ready, items.length]);

  if (!ready) return <p className="font-mono m-0" style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>Loading your saved forecasts…</p>;
  if (!items.length) {
    return (
      <div className="rounded-[12px] px-4 py-5 flex flex-col gap-2" style={{ border: "1px dashed var(--vault-rule)" }}>
        <p className="m-0" style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 700 }}>Nothing saved yet.</p>
        <p className="m-0" style={{ color: "var(--vault-text-mute)", fontSize: 12.5 }}>Press Save on any forecast card — on the <Link href="/" style={{ color: "var(--vault-gold-bright)" }}>home page</Link> to start — and it appears here with its result once the game is graded. Saved forecasts live in this browser only.</p>
      </div>
    );
  }
  const shown = items.filter((s) => sport === "all" || s.sport === sport);
  const resolved = shown.map((s) => ({ s, r: (ledgers ? resolveResult(s, ledgers, nowIso) : { state: s.startUtc && Date.parse(s.startUtc) <= Date.parse(nowIso) ? "PENDING" : "UPCOMING", outcome: null, actual: null, gradedAt: null }) as Resolved }));
  const groups: Array<[string, string, typeof resolved]> = [
    ["upcoming", "Upcoming", resolved.filter((x) => x.r.state === "UPCOMING")],
    ["pending", "Started · result pending", resolved.filter((x) => x.r.state === "PENDING")],
    ["final", "Final", resolved.filter((x) => x.r.state === "FINAL")],
  ];
  const sports = [...new Set(items.map((s) => s.sport))];
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by sport">
          {["all", ...sports].map((k) => (
            <button key={k} type="button" onClick={() => setSport(k)} aria-pressed={sport === k} className="font-mono uppercase tracking-[0.08em]" style={{ minHeight: 36, padding: "0 12px", borderRadius: 999, border: `1px solid ${sport === k ? "var(--vault-border-active)" : "var(--vault-rule)"}`, background: sport === k ? "var(--vault-panel-elevated)" : "transparent", color: sport === k ? "var(--vault-text)" : "var(--vault-text-mute)", fontSize: 9.5, cursor: "pointer" }}>{k === "all" ? "All" : SPORT_LABEL[k] ?? k}</button>
          ))}
        </div>
        <button type="button" onClick={() => { if (window.confirm("Remove every saved forecast from this browser?")) clear(); }} className="font-mono uppercase tracking-[0.08em]" style={{ minHeight: 36, padding: "0 12px", borderRadius: 999, border: "1px solid var(--vault-rule)", background: "transparent", color: "var(--vault-text-faint)", fontSize: 9.5, cursor: "pointer" }}>Clear all</button>
      </div>
      {ledgerError ? <p className="m-0 font-mono" style={{ color: "var(--vault-warn)", fontSize: 10.5 }}>Some result ledgers could not be loaded, so a graded result may show as pending. Nothing is guessed.</p> : null}
      {!ledgers && items.length ? <p className="m-0 font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10.5 }}>Checking results…</p> : null}
      {groups.map(([key, label, list]) => list.length ? (
        <section key={key} aria-labelledby={`saved-${key}-h`} className="flex flex-col gap-2">
          <h2 id={`saved-${key}-h`} className="font-mono uppercase tracking-[0.14em] m-0" style={{ color: "var(--vault-gold)", fontSize: 11 }}>{label} · {list.length}</h2>
          <ul className="m-0 p-0 list-none flex flex-col gap-2">
            {list.map(({ s, r }) => <Row key={s.id} s={s} r={r} onRemove={() => unsave(s.id)} />)}
          </ul>
        </section>
      ) : null)}
    </div>
  );
}
