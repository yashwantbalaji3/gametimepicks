"use client";
import { useCallback, useEffect, useState } from "react";
import { accountsClient } from "@/lib/accounts/client.mjs";
import { summarise, findings, byLegCount, repeatedLegs, riskMix, weeklyTrend, MIN_DECIDED } from "@/lib/accounts/bet-insights.mjs";

/**
 * YOUR RECORD (P266) — what you have actually been doing, and how it has actually gone.
 *
 * Every number here is yours: your slips, settled from official results. Nothing about you enters the
 * site's public record, and nothing here tells you what to bet next — the maths is in
 * lib/accounts/bet-insights.mjs, which reports NEEDS_MORE below twenty settled slips rather than
 * dressing a small sample as a verdict.
 */
type Row = Record<string, unknown>;
const money = (v: number) => `${v < 0 ? "−" : ""}$${Math.abs(v).toFixed(2)}`;

export default function MyBetsRecord({ refreshKey = 0 }: { refreshKey?: number }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const client = accountsClient();
    if (!client) { setError("Accounts are not connected yet."); return; }
    const { data, error: err } = await client
      .from("bet_slips").select("*").order("placed_at", { ascending: false }).limit(500);
    if (err) { setError(err.message); return; }
    setError(null);
    setRows(data ?? []);
  }, []);

  useEffect(() => { void load(); }, [load, refreshKey]);

  if (error) return <p className="m-0" style={{ color: "var(--vault-danger)", fontSize: 13 }}>Your record could not be read: {error}</p>;
  if (rows == null) return <p className="m-0" style={{ color: "var(--vault-text-faint)", fontSize: 13 }}>Reading your record…</p>;
  if (rows.length === 0) {
    return (
      <p className="m-0" style={{ color: "var(--vault-text-mute)", fontSize: 13, lineHeight: 1.6 }}>
        Nothing saved yet. Add a slip above and it appears here — with its own record, the legs you repeat, and where
        your money actually goes.
      </p>
    );
  }

  const s = summarise(rows);
  const fs = findings(rows);
  const legs = byLegCount(rows).slice(0, 5);
  const repeats = repeatedLegs(rows).slice(0, 5);
  const mix = riskMix(rows);
  const trend = weeklyTrend(rows, { weeks: 8 }) as Array<{ weekEnding: string; decided: number; net: number }>;
  const peak = Math.max(1, ...trend.map((t) => Math.abs(t.net)));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="font-display tabular-nums" style={{ color: "var(--vault-text)", fontSize: 26, fontWeight: 800 }}>
          {s.wins}–{s.losses}{s.pushes ? `–${s.pushes}` : ""}
        </span>
        <span className="font-mono tabular-nums" style={{ color: s.net >= 0 ? "var(--vault-success)" : "var(--vault-danger)", fontSize: 15, fontWeight: 700 }}>
          {money(s.net)}
        </span>
        <span style={{ color: "var(--vault-text-faint)", fontSize: 12 }}>
          {s.decided} settled · {s.pending} pending · {money(s.staked)} staked
          {s.state === "NEEDS_MORE" ? ` · under ${MIN_DECIDED} settled, so read it lightly` : ""}
        </span>
      </div>

      <ul className="flex flex-col gap-1.5 list-none m-0 p-0">
        {fs.map((f) => (
          <li key={f.id} className="rounded-[8px] px-3 py-2" style={{ background: "var(--vault-wash-faint)", border: "1px solid var(--vault-rule)" }}>
            <span style={{ color: "var(--vault-text)", fontSize: 13 }}>{f.text}</span>
            {f.state === "NEEDS_MORE" ? <span style={{ color: "var(--vault-text-faint)", fontSize: 11 }}> · too few to read anything into</span> : null}
          </li>
        ))}
      </ul>

      {legs.length > 1 ? (
        <div className="flex flex-col gap-1">
          <span className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>By leg count</span>
          {legs.map((l) => (
            <div key={l.key} className="flex items-baseline justify-between gap-3" style={{ fontSize: 12.5, color: "var(--vault-text-mute)" }}>
              <span>{l.key} leg{l.key === 1 ? "" : "s"}</span>
              <span className="font-mono tabular-nums">
                {l.wins}–{l.losses} · {l.state === "OBSERVED" && l.roi != null ? `${(l.roi * 100).toFixed(1)}%` : `${l.decided} settled`}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {repeats.length > 0 ? (
        <div className="flex flex-col gap-1">
          <span className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>Selections you keep backing</span>
          {repeats.map((r) => (
            <div key={r.leg} className="flex items-baseline justify-between gap-3" style={{ fontSize: 12.5, color: "var(--vault-text-mute)" }}>
              <span className="truncate">{r.leg}</span>
              <span className="font-mono tabular-nums whitespace-nowrap">{r.appearances}× · {r.wins}–{r.losses}</span>
            </div>
          ))}
        </div>
      ) : null}

      {mix.length > 0 ? (
        <div className="flex flex-col gap-1">
          <span className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>Where the money goes</span>
          {mix.map((m) => (
            <div key={m.band} className="flex items-center gap-2" style={{ fontSize: 12.5, color: "var(--vault-text-mute)" }}>
              <span style={{ width: 84 }}>{m.band}</span>
              <span className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "var(--vault-wash-faint)", border: "1px solid var(--vault-rule)" }}>
                <span className="gtp-chance-fill block h-full rounded-full" style={{ width: `${Math.max(1.5, m.share * 100)}%`, background: "var(--vault-gold-bright)" }} />
              </span>
              <span className="font-mono tabular-nums" style={{ width: 44, textAlign: "right" }}>{Math.round(m.share * 100)}%</span>
            </div>
          ))}
        </div>
      ) : null}

      {trend.some((t) => t.decided > 0) ? (
        <div className="flex flex-col gap-1">
          <span className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>Last eight weeks</span>
          {/* A quiet week is drawn as a quiet week — zero height, still listed — rather than closed up,
              because a gap in betting is part of the trend. */}
          <div className="flex items-end gap-1" style={{ height: 44 }} role="img"
            aria-label={trend.map((t) => `${t.weekEnding}: ${t.decided} settled, net ${t.net.toFixed(2)}`).join("; ")}>
            {trend.map((t) => (
              <span key={t.weekEnding} className="flex-1 flex flex-col justify-end" style={{ height: "100%" }} title={`${t.weekEnding} · ${t.decided} settled · ${money(t.net)}`}>
                <span style={{
                  height: `${Math.max(2, (Math.abs(t.net) / peak) * 100)}%`,
                  background: t.net >= 0 ? "var(--vault-success)" : "var(--vault-danger)",
                  opacity: t.decided === 0 ? 0.25 : 1,
                  borderRadius: 3,
                }} />
              </span>
            ))}
          </div>
          <span style={{ color: "var(--vault-text-faint)", fontSize: 10.5 }}>
            {trend[0].weekEnding} → {trend[trend.length - 1].weekEnding} · a faint bar is a week with nothing settled
          </span>
        </div>
      ) : null}

      <p className="m-0 font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9, lineHeight: 1.6 }}>
        Your slips are yours · never part of the site's published record · nothing here is a recommendation to stake
      </p>
    </div>
  );
}
