"use client";
/**
 * THE FULL MODEL-PICK RESULT HISTORY — Program 235 · Release D.
 *
 * `graded-picks.json` counts 40,072 settled picks and publishes 60. The other 40,012 were never
 * missing — they sit in the per-date calibration rows — but no page could reach them, and a
 * 60-row sample beside a 37,958-row denominator is the shape of a statistic nobody can check.
 *
 * ARCHITECTURE, forced by the deployment. This is a static export whose prune keeps only data files
 * the shipped output names. So the page carries a COMPACT per-date summary — dates, counts, market
 * breakdown and each partition's URL, about 19KB — which is enough for every filter and every
 * headline without a single fetch, and which also names all 85 partitions so the prune keeps them.
 * Opening a day fetches that day alone.
 *
 * DENOMINATORS. A push is neither a win nor a loss and is in no rate. The decisive count is stated
 * beside every percentage, because a hit rate without its sample size is not a number a reader can
 * weigh. The model-versus-market comparison runs only on rows carrying both probabilities, which
 * here is all of them — stated rather than assumed.
 *
 * WHAT IS NOT HERE. No edge, no confidence, no lean: those are internal selection signals this
 * project does not surface, and they are stripped in the producer rather than hidden here.
 */
import { useEffect, useMemo, useState } from "react";

export interface ModelDay {
  date: string;
  wins: number; losses: number; pushes: number; rows: number;
  /** Distinct games these picks came from — the unit that governs uncertainty, not the row count. */
  games: number;
  rowsUrl: string;
  byMarket: Record<string, { wins: number; losses: number; pushes: number }>;
}

export interface ModelCoverage {
  dates: number; firstDate: string | null; lastDate: string | null;
  rows: number; wins: number; losses: number; pushes: number; decisive: number; games: number;
}

interface DetailRow {
  id: string; date: string; market: string; player: string | null;
  eventName: string | null; selection: string | null; line: number | null;
  modelProbability: number | null; marketProbability: number | null;
  outcome: string; settledStat: number | string | null;
}

const MARKET_LABEL: Record<string, string> = {
  batter_hits: "Hits",
  batter_total_bases: "Total bases",
  batter_hits_runs_rbis: "Hits + runs + RBIs",
  pitcher_strikeouts: "Strikeouts",
};

const pct = (w: number, l: number) => (w + l === 0 ? null : (w / (w + l)) * 100);
const etToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
const shift = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10);
};

export default function ModelResultsExplorer({ days, coverage }: { days: ModelDay[]; coverage: ModelCoverage }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [market, setMarket] = useState("all");
  const [openDate, setOpenDate] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailRow[] | null>(null);
  const [detailState, setDetailState] = useState<"idle" | "loading" | "error">("idle");

  /* Filters live in the URL so a view can be shared and survives a refresh — the same contract the
     parlay explorer already keeps. */
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("mfrom")) setFrom(p.get("mfrom")!);
    if (p.get("mto")) setTo(p.get("mto")!);
    if (p.get("market")) setMarket(p.get("market")!);
  }, []);

  const sync = (next: Record<string, string>) => {
    try {
      const url = new URL(window.location.href);
      for (const [k, v] of Object.entries(next)) {
        if (!v || v === "all") url.searchParams.delete(k); else url.searchParams.set(k, v);
      }
      window.history.pushState(null, "", url.toString());
    } catch { /* a URL we cannot write is not a reason to break the filter */ }
  };

  const rangeError = useMemo(() => {
    const bad = (d: string) => d !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(d);
    if (bad(from)) return `"${from}" is not a date in YYYY-MM-DD form.`;
    if (bad(to)) return `"${to}" is not a date in YYYY-MM-DD form.`;
    if (from && to && from > to) return `The range starts after it ends (${from} → ${to}). Nothing can fall inside it.`;
    return null;
  }, [from, to]);

  const markets = useMemo(
    () => [...new Set(days.flatMap((d) => Object.keys(d.byMarket ?? {})))].sort(),
    [days],
  );

  const selected = useMemo(() => {
    if (rangeError) return [];
    return days.filter((d) => (!from || d.date >= from) && (!to || d.date <= to));
  }, [days, from, to, rangeError]);

  /** Pooled from SUMMED COUNTS, never averaged across days. */
  const pooled = useMemo(() => {
    let wins = 0, losses = 0, pushes = 0, games = 0;
    for (const d of selected) {
      games += d.games ?? 0;
      if (market === "all") { wins += d.wins; losses += d.losses; pushes += d.pushes; continue; }
      const m = d.byMarket?.[market];
      if (m) { wins += m.wins; losses += m.losses; pushes += m.pushes; }
    }
    return { wins, losses, pushes, decisive: wins + losses, games };
  }, [selected, market]);

  /* Opening a day fetches that day alone. A failure says so rather than rendering an empty table. */
  useEffect(() => {
    if (!openDate) { setDetail(null); setDetailState("idle"); return; }
    const day = days.find((d) => d.date === openDate);
    if (!day) return;
    let cancelled = false;
    setDetailState("loading"); setDetail(null);
    fetch(day.rowsUrl)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((doc) => { if (!cancelled) { setDetail(doc.rows ?? []); setDetailState("idle"); } })
      .catch(() => { if (!cancelled) setDetailState("error"); });
    /* A response for a day the reader has since navigated away from is dropped. */
    return () => { cancelled = true; };
  }, [openDate, days]);

  const visibleDetail = useMemo(
    () => (detail ?? []).filter((r) => market === "all" || r.market === market),
    [detail, market],
  );

  const control: React.CSSProperties = {
    minHeight: 44, borderRadius: 8, padding: "0 10px", fontSize: 13,
    background: "color-mix(in srgb, var(--vault-wash-base) 3%, transparent)",
    border: "1px solid var(--vault-border)", color: "var(--vault-text)",
  };
  const rate = pct(pooled.wins, pooled.losses);
  const rangeLabel = from || to ? `${from || coverage.firstDate} → ${to || coverage.lastDate}` : "all settled history";

  return (
    <section aria-labelledby="model-results-h" className="mt-10 flex flex-col gap-3">
      <h2 id="model-results-h" className="font-display tracking-tight m-0" style={{ color: "var(--vault-text)", fontSize: 18, fontWeight: 750 }}>
        Every settled model pick
      </h2>
      <p className="m-0 text-[13px] leading-relaxed max-w-2xl" style={{ color: "var(--vault-text-mute)" }}>
        All {coverage.rows.toLocaleString()} graded picks across {coverage.dates} settled days,
        {" "}{coverage.firstDate} to {coverage.lastDate} — not a sample of them. Pushes are neither a win
        nor a loss and are in no rate below. Every row carries both the model's probability and the
        market's, so the two are compared on the same picks.
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1" style={{ fontSize: 11, color: "var(--vault-text-faint)" }}>
          <label htmlFor="mr-from">From</label>
          <input id="mr-from" type="date" value={from} style={control}
            min={coverage.firstDate ?? undefined} max={coverage.lastDate ?? undefined}
            onChange={(e) => { setFrom(e.target.value); sync({ mfrom: e.target.value }); }} />
        </div>
        <div className="flex flex-col gap-1" style={{ fontSize: 11, color: "var(--vault-text-faint)" }}>
          <label htmlFor="mr-to">To</label>
          <input id="mr-to" type="date" value={to} style={control}
            min={coverage.firstDate ?? undefined} max={coverage.lastDate ?? undefined}
            onChange={(e) => { setTo(e.target.value); sync({ mto: e.target.value }); }} />
        </div>
        <div className="flex flex-col gap-1" style={{ fontSize: 11, color: "var(--vault-text-faint)" }}>
          <label htmlFor="mr-market">Market</label>
          <select id="mr-market" value={market} style={control}
            onChange={(e) => { setMarket(e.target.value); sync({ market: e.target.value }); }}>
            <option value="all">All markets</option>
            {markets.map((m) => <option key={m} value={m}>{MARKET_LABEL[m] ?? m}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap gap-1.5 pb-0.5">
          {([["Last 7 days", 6], ["Last 30 days", 29]] as const).map(([label, back]) => (
            <button key={label} type="button"
              onClick={() => { const t = etToday(); const f = shift(t, -back); setFrom(f); setTo(t); sync({ mfrom: f, mto: t }); }}
              className="vault-press rounded-full px-3 inline-flex items-center"
              style={{ minHeight: 36, fontSize: 11.5, border: "1px solid var(--vault-border)", color: "var(--vault-text-mute)" }}>
              {label}
            </button>
          ))}
          <button type="button" onClick={() => { setFrom(""); setTo(""); setMarket("all"); setOpenDate(null); sync({ mfrom: "", mto: "", market: "all" }); }}
            className="vault-press rounded-full px-3 inline-flex items-center"
            style={{ minHeight: 36, fontSize: 11.5, border: "1px solid var(--vault-border)", color: "var(--vault-text-mute)" }}>
            Reset
          </button>
        </div>
      </div>

      {rangeError ? <p role="alert" className="m-0" style={{ fontSize: 12.5, color: "var(--vault-warn)" }}>{rangeError}</p> : null}

      {!rangeError ? (
        <div style={{ border: "1px solid var(--vault-border)", borderRadius: 10, padding: "12px 14px", background: "var(--vault-wash-faint)" }}>
          <div style={{ fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--vault-text-faint)" }}>
            {rangeLabel}{market === "all" ? "" : ` · ${MARKET_LABEL[market] ?? market}`}
          </div>
          <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 16, alignItems: "baseline" }}>
            {rate == null ? (
              <span style={{ fontSize: 14, color: "var(--vault-text-mute)" }}>No decided pick in this selection.</span>
            ) : (
              <>
                <span style={{ fontSize: 22, fontWeight: 800 }}>{rate.toFixed(1)}%</span>
                <span style={{ fontFamily: "monospace", fontSize: 13 }}>{pooled.wins.toLocaleString()}-{pooled.losses.toLocaleString()}</span>
              </>
            )}
            <span style={{ fontSize: 11.5, color: "var(--vault-text-mute)", fontFamily: "monospace" }}>
              {pooled.decisive.toLocaleString()} decisive
              {pooled.pushes ? ` · ${pooled.pushes.toLocaleString()} push` : ""}
              {pooled.games ? ` · ${pooled.games.toLocaleString()} games` : ""}
              {` · ${selected.length} day${selected.length === 1 ? "" : "s"}`}
            </span>
          </div>
        </div>
      ) : null}

      {!rangeError && selected.length > 0 ? (
        <div style={{ overflowX: "auto", maxHeight: 340, overflowY: "auto" }}>
          <table style={{ borderCollapse: "collapse", fontSize: 12.5, width: "100%", minWidth: 460 }}>
            <caption className="sr-only">Settled model picks by day for {rangeLabel}</caption>
            <thead>
              <tr>
                {["Date", "Record", "Decisive", "Push", ""].map((h, i) => (
                  <th key={i} scope="col" style={{ textAlign: "left", padding: "6px 12px 6px 0", borderBottom: "1px solid var(--vault-rule)", fontSize: 11, color: "var(--vault-text-faint)", position: "sticky", top: 0, background: "var(--vault-scrim-base)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...selected].reverse().map((d) => {
                const m = market === "all" ? { wins: d.wins, losses: d.losses, pushes: d.pushes } : (d.byMarket?.[market] ?? { wins: 0, losses: 0, pushes: 0 });
                const r = pct(m.wins, m.losses);
                return (
                  <tr key={d.date}>
                    <th scope="row" style={{ textAlign: "left", padding: "6px 12px 6px 0", fontFamily: "monospace", fontSize: 11.5, fontWeight: 500 }}>{d.date}</th>
                    <td style={{ padding: "6px 12px 6px 0", fontFamily: "monospace", fontSize: 11.5 }}>
                      {r == null ? <span style={{ color: "var(--vault-text-faint)" }}>no decided pick</span> : `${r.toFixed(1)}% ${m.wins}-${m.losses}`}
                    </td>
                    <td style={{ padding: "6px 12px 6px 0", fontFamily: "monospace", fontSize: 11.5 }}>{m.wins + m.losses}</td>
                    <td style={{ padding: "6px 12px 6px 0", fontFamily: "monospace", fontSize: 11.5, color: "var(--vault-text-faint)" }}>{m.pushes || "—"}</td>
                    <td style={{ padding: "6px 0" }}>
                      <button type="button" onClick={() => setOpenDate(openDate === d.date ? null : d.date)}
                        style={{ color: "var(--vault-gold-bright)", background: "none", border: "none", padding: 0, font: "inherit", cursor: "pointer", textDecoration: "underline", fontSize: 11.5 }}
                        aria-expanded={openDate === d.date}>
                        {openDate === d.date ? "Hide picks" : `Open ${d.rows} picks`}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {openDate ? (
        <div className="flex flex-col gap-2">
          <h3 style={{ fontSize: 13.5, fontWeight: 700, margin: "6px 0 0" }}>
            {openDate}{market === "all" ? "" : ` · ${MARKET_LABEL[market] ?? market}`}
          </h3>
          {detailState === "loading" ? <p className="m-0" style={{ fontSize: 12.5, color: "var(--vault-text-mute)" }}>Loading that day&apos;s picks…</p> : null}
          {detailState === "error" ? <p role="alert" className="m-0" style={{ fontSize: 12.5, color: "var(--vault-warn)" }}>That day&apos;s picks could not be loaded. The counts above are unaffected — they come from the index, not from this file.</p> : null}
          {detailState === "idle" && visibleDetail.length === 0 && detail ? <p className="m-0" style={{ fontSize: 12.5, color: "var(--vault-text-mute)" }}>No pick in this market on this day.</p> : null}
          {visibleDetail.length > 0 ? (
            <div style={{ overflowX: "auto", maxHeight: 420, overflowY: "auto" }}>
              <table style={{ borderCollapse: "collapse", fontSize: 12, width: "100%", minWidth: 620 }}>
                <caption className="sr-only">Individual model picks for {openDate}</caption>
                <thead>
                  <tr>
                    {["Player", "Game", "Selection", "Model", "Market", "Result"].map((h) => (
                      <th key={h} scope="col" style={{ textAlign: "left", padding: "5px 12px 5px 0", borderBottom: "1px solid var(--vault-rule)", fontSize: 10.5, color: "var(--vault-text-faint)", whiteSpace: "nowrap", position: "sticky", top: 0, background: "var(--vault-scrim-base)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleDetail.slice(0, 250).map((r) => (
                    <tr key={r.id}>
                      <th scope="row" style={{ textAlign: "left", padding: "5px 12px 5px 0", fontWeight: 600 }}>{r.player ?? "—"}</th>
                      <td style={{ padding: "5px 12px 5px 0", color: "var(--vault-text-mute)" }}>{r.eventName ?? "—"}</td>
                      <td style={{ padding: "5px 12px 5px 0" }}>{r.selection ?? "—"}</td>
                      <td style={{ padding: "5px 12px 5px 0", fontFamily: "monospace", fontSize: 11.5 }}>{r.modelProbability == null ? "—" : `${(r.modelProbability * 100).toFixed(1)}%`}</td>
                      <td style={{ padding: "5px 12px 5px 0", fontFamily: "monospace", fontSize: 11.5, color: "var(--vault-text-mute)" }}>{r.marketProbability == null ? "—" : `${(r.marketProbability * 100).toFixed(1)}%`}</td>
                      <td style={{ padding: "5px 0", textTransform: "capitalize", color: r.outcome === "win" ? "var(--vault-success)" : r.outcome === "loss" ? "var(--vault-text-mute)" : "var(--vault-text-faint)" }}>{r.outcome}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {visibleDetail.length > 250 ? (
            <p className="m-0" style={{ fontSize: 11, color: "var(--vault-text-faint)" }}>
              Showing the first 250 of {visibleDetail.length}. Narrow by market to see the rest — the counts above cover every one of them.
            </p>
          ) : null}
        </div>
      ) : null}

      <p className="m-0" style={{ fontSize: 11, color: "var(--vault-text-faint)", lineHeight: 1.55, maxWidth: 760 }}>
        <strong style={{ color: "var(--vault-text-mute)" }}>These picks are not independent
        observations.</strong> They cluster inside games — roughly {coverage.games > 0 ? Math.round(coverage.rows / coverage.games) : 0} props
        per game across the whole record — so the effective sample is far closer to the game count
        than to the row count, and any confidence interval computed as though each pick stood alone
        would be several times narrower than the evidence supports.
        {" "}Model and market probabilities are shown side by side on the same picks. A hit rate is
        not a return: these are probability calls with no stake attached, and nothing here is a
        betting record. Educational and paper-only.
      </p>
    </section>
  );
}
