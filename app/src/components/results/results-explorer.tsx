"use client";
/**
 * THE RESULTS EXPLORER — the first way to ask a question of the record.
 *
 * Program 233 · Release C. `/results` shipped with zero filter controls: no record-type selector, no
 * sport filter, no risk tier. Every number on it was a headline with no path to the rows underneath,
 * and a reader who wanted "how have the medium-risk UFC cards done?" had nowhere to go.
 *
 * WHAT THIS REFUSES TO DO IS THE DESIGN. It never pools across record types — a suggested paper slip
 * and a single model pick are different populations, and the read model throws rather than add them.
 * It never renders a rate over zero decisive selections: an empty tier reads "no settled cards", not
 * 0%, because 0% says a strategy lost every time when nothing has been graded.
 *
 * Filter state lives in the URL so a view can be shared, refreshed and navigated back to — the same
 * contract every dated surface here already honours.
 */
import { useEffect, useMemo, useState } from "react";

import { RECORD_TYPES, RISK_TIERS, filterRows, poolRows } from "@/lib/results/read-model.mjs";
/* The PURE module. `dated-cards.mjs` reads node:fs, and importing from it here put fs in the
   client bundle and failed the export build — the second time this exact wall was hit. */
import { dailySeries } from "@/lib/results/card-math.mjs";
import ResultsTrend from "@/components/results/results-trend";

export interface ResultRow {
  recordType: string;
  sport: string;
  tier: string | null;
  wins: number; losses: number; pushes: number; voids: number; pending: number;
  decisive: number; settled: number;
  hitRate: { value: number | null; decisive: number; available: boolean; reason: string | null };
  interval: { low: number; high: number; n: number } | null;
  staked: number | null; returned: number | null;
  source: string; note: string | null;
}

const TYPE_LABEL: Record<string, string> = {
  [RECORD_TYPES.SUGGESTED_PARLAY]: "Suggested parlays",
  [RECORD_TYPES.MODEL_PICK]: "Model picks",
  [RECORD_TYPES.SIGNATURE_PRODUCT]: "Signature products",
};

/** What each population actually counts — stated once, at the point the reader chooses it. */
const TYPE_NOTE: Record<string, string> = {
  [RECORD_TYPES.SUGGESTED_PARLAY]:
    "Whole published slips, graded once each under the policy frozen at publication. A slip wins only if every leg does — one winning leg is not a winning parlay.",
  [RECORD_TYPES.MODEL_PICK]:
    "Single model selections, graded one at a time against the official result. No stake is recorded for these.",
  [RECORD_TYPES.SIGNATURE_PRODUCT]:
    "The money ladders, each with its own bankroll and its own history. These are never added together.",
};

const SPORT_LABEL: Record<string, string> = {
  mlb: "MLB", nfl: "NFL", epl: "Premier League", ufc: "UFC", multi: "Mixed sport",
  "bank-builder": "Bank Builder", moonshot: "Moonshot",
};

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

function Rate({ row }: { row: ResultRow }) {
  if (!row.hitRate.available) {
    /* The empty state that matters. "0%" here would be a claim; this is the truth. */
    return (
      <span style={{ color: "var(--vault-text-faint)", fontSize: 12.5 }}>
        no settled cards yet
      </span>
    );
  }
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 6 }}>
      <strong style={{ fontSize: 15 }}>{pct(row.hitRate.value!)}</strong>
      <span style={{ color: "var(--vault-text-faint)", fontSize: 11, fontFamily: "monospace" }}>
        {row.wins}-{row.losses}
        {row.interval ? ` · ${pct(row.interval.low)}–${pct(row.interval.high)}` : ""}
      </span>
    </span>
  );
}

/** One settled card, as `lib/results/dated-cards` flattens it. */
export interface SettledCard {
  date: string;
  slipId: string;
  sport: string;
  sports: readonly string[];
  tier: string | null;
  result: string;
  decided: boolean; won: boolean; lost: boolean; pushed: boolean; pending: boolean;
  combinedDecimal: number | null;
  legs: readonly string[];
  legCount: number;
}

/** ET calendar day. `en-CA` gives YYYY-MM-DD directly and cannot produce the hour-24 this project
 *  has been bitten by three times, because it never formats an hour. */
const etToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
const shiftDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export default function ResultsExplorer({
  rows,
  cards = [],
  dateBasisNote = "",
}: {
  rows: ResultRow[];
  /**
   * Per-card dated rows for the populations that HAVE them. P233's ledgers are aggregates; a date
   * control over an aggregate is a decoration. Only `suggested-parlay` publishes per-card detail,
   * so only it gets a date filter — and the cards reconcile with the ledger exactly, which is what
   * makes a filtered number safe to show beside the site's published one.
   */
  cards?: SettledCard[];
  dateBasisNote?: string;
}) {
  const [recordType, setRecordType] = useState<string>(RECORD_TYPES.SUGGESTED_PARLAY);
  const [sport, setSport] = useState<string>("all");
  const [tier, setTier] = useState<string>("all");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  /* Adopt the URL after mount — under `output: "export"` reading it on the server would freeze one
     reader's filters into the page every visitor receives. */
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const rt = p.get("record");
    if (rt && (Object.values(RECORD_TYPES) as string[]).includes(rt)) setRecordType(rt);
    const sp = p.get("sport");
    if (sp) setSport(sp);
    const t = p.get("tier");
    if (t) setTier(t);
    const f = p.get("from");
    if (f) setFrom(f);
    const u = p.get("to");
    if (u) setTo(u);
  }, []);

  /* Back/forward walk the reader's own filter steps rather than dying on the first one. */
  useEffect(() => {
    const onPop = () => {
      const p = new URLSearchParams(window.location.search);
      setRecordType(p.get("record") ?? RECORD_TYPES.SUGGESTED_PARLAY);
      setSport(p.get("sport") ?? "all");
      setTier(p.get("tier") ?? "all");
      setFrom(p.get("from") ?? "");
      setTo(p.get("to") ?? "");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const sync = (next: Record<string, string>) => {
    try {
      const url = new URL(window.location.href);
      for (const [k, v] of Object.entries(next)) {
        /* "all" and "" are both "no selection" — they must leave the URL rather than sit in it as
           a filter the next reader inherits from a shared link. */
        if (v === "all" || v === "") url.searchParams.delete(k);
        else url.searchParams.set(k, v);
      }
      /* pushState, not replaceState: a filter change is a step a reader can go back from. */
      window.history.pushState(null, "", url.toString());
    } catch { /* a URL we cannot write is not a reason to break the filter */ }
  };

  const ofType = useMemo(() => filterRows(rows, { recordType } as never) as ResultRow[], [rows, recordType]);
  const sports = useMemo(() => [...new Set(ofType.map((r) => r.sport))].sort(), [ofType]);
  const hasTiers = ofType.some((r) => r.tier);

  const visible = useMemo(() => {
    let out = ofType;
    if (sport !== "all") out = out.filter((r) => r.sport === sport);
    /* `tier: all` shows the per-sport totals (tier === null); a named tier shows that tier only.
       Mixing the two would double-count every card in the pooled figure below. */
    out = tier === "all" ? out.filter((r) => !r.tier) : out.filter((r) => r.tier === tier);
    return out;
  }, [ofType, sport, tier]);

  const pooled = useMemo(() => {
    try { return visible.length ? poolRows(visible) : null; } catch { return null; }
  }, [visible]);

  /* ── DATE FILTERING, only where dated detail exists ─────────────────────────────────────────── */
  const dateFilterable = recordType === RECORD_TYPES.SUGGESTED_PARLAY && cards.length > 0;
  const covered = useMemo(() => [...new Set(cards.map((c) => c.date))].sort(), [cards]);

  /** A reversed or malformed range is REFUSED and said so — never silently widened to all time. */
  const rangeError = useMemo(() => {
    const bad = (d: string) => d !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(d);
    if (bad(from)) return `"${from}" is not a date in YYYY-MM-DD form.`;
    if (bad(to)) return `"${to}" is not a date in YYYY-MM-DD form.`;
    if (from && to && from > to) return `The range starts after it ends (${from} → ${to}). Nothing can fall inside it.`;
    return null;
  }, [from, to]);

  const selectedCards = useMemo(() => {
    if (!dateFilterable || rangeError) return [];
    return cards.filter((c) => {
      if (from && c.date < from) return false;
      if (to && c.date > to) return false;
      if (sport !== "all" && c.sport !== sport) return false;
      if (tier !== "all" && c.tier !== tier) return false;
      return true;
    });
  }, [cards, dateFilterable, rangeError, from, to, sport, tier]);

  /** Pooled from SUMMED COUNTS. Nothing here averages a rate, and no decided card means no rate. */
  const cardPool = useMemo(() => {
    const wins = selectedCards.filter((c) => c.won).length;
    const losses = selectedCards.filter((c) => c.lost).length;
    const decisive = wins + losses;
    return {
      wins, losses, decisive,
      pushes: selectedCards.filter((c) => c.pushed).length,
      pending: selectedCards.filter((c) => c.pending).length,
      rate: decisive > 0 ? wins / decisive : null,
    };
  }, [selectedCards]);

  const gridSports = useMemo(() => [...new Set(cards.map((c) => c.sport))].sort(), [cards]);
  /** The cards inside the DATE range only — the grid answers "in this period", not "ever". */
  const inRange = useMemo(() => {
    if (!dateFilterable || rangeError) return [];
    return cards.filter((c) => (!from || c.date >= from) && (!to || c.date <= to));
  }, [cards, dateFilterable, rangeError, from, to]);

  /* The trend runs over the SAME `selectedCards` as the headline above it, bounded by the range the
     reader chose — so an empty tail is drawn rather than trimmed away. */
  const series = useMemo(
    () => (dateFilterable && !rangeError
      ? dailySeries(selectedCards, { from: from || null, to: to || null })
      : { days: [], cumulative: [], pooled: null }),
    [dateFilterable, rangeError, selectedCards, from, to],
  );

  const applyRange = (f: string, t: string) => { setFrom(f); setTo(t); sync({ from: f, to: t }); };
  const today = dateFilterable ? etToday() : "";
  const PRESETS: Array<[string, () => void]> = [
    ["Today", () => applyRange(today, today)],
    ["Yesterday", () => applyRange(shiftDays(today, -1), shiftDays(today, -1))],
    ["Last 7 days", () => applyRange(shiftDays(today, -6), today)],
    ["Last 30 days", () => applyRange(shiftDays(today, -29), today)],
    ["All history", () => applyRange("", "")],
  ];
  const rangeLabel = from || to
    ? `${from || covered[0] || "the beginning"} → ${to || "now"}`
    : "all settled history";

  const control: React.CSSProperties = {
    minHeight: 44, borderRadius: 8, padding: "0 10px", fontSize: 13,
    background: "color-mix(in srgb, var(--vault-wash-base) 3%, transparent)",
    border: "1px solid var(--vault-border)", color: "var(--vault-text)",
  };

  return (
    <section aria-labelledby="results-explorer-h" className="flex flex-col gap-3">
      <h2 id="results-explorer-h" style={{ fontSize: 16, fontWeight: 700 }}>Explore the record</h2>

      {/* EXPLICIT id/htmlFor, not a wrapping <label>. Wrapping made each select's accessible name the
          whole label text INCLUDING its option list, so "Risk tier … per-sport totals" also answered
          to "Sport" — two controls with one name, which is a real problem for a screen reader long
          before it was a problem for a test. */}
      <div className="flex flex-wrap gap-2">
        <div className="flex flex-col gap-1" style={{ fontSize: 11, color: "var(--vault-text-faint)" }}>
          <label htmlFor="results-record-type">Record type</label>
          <select
            id="results-record-type" aria-label="Record type"
            value={recordType} style={control}
            onChange={(e) => { setRecordType(e.target.value); setSport("all"); setTier("all"); sync({ record: e.target.value, sport: "all", tier: "all" }); }}
          >
            {Object.values(RECORD_TYPES).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
          </select>
        </div>

        <div className="flex flex-col gap-1" style={{ fontSize: 11, color: "var(--vault-text-faint)" }}>
          <label htmlFor="results-sport">Sport</label>
          <select id="results-sport" aria-label="Sport" value={sport} style={control} onChange={(e) => { setSport(e.target.value); sync({ sport: e.target.value }); }}>
            <option value="all">All sports</option>
            {sports.map((s) => <option key={s} value={s}>{SPORT_LABEL[s] ?? s}</option>)}
          </select>
        </div>

        {hasTiers ? (
          <div className="flex flex-col gap-1" style={{ fontSize: 11, color: "var(--vault-text-faint)" }}>
            <label htmlFor="results-tier">Risk tier</label>
            <select id="results-tier" aria-label="Risk tier" value={tier} style={control} onChange={(e) => { setTier(e.target.value); sync({ tier: e.target.value }); }}>
              <option value="all">All tiers (per-sport totals)</option>
              {RISK_TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        ) : null}
      </div>

      {/* ── DATE RANGE. Present only where per-card dated detail exists; where it does not, the
             absence is explained rather than left as a missing control a reader wonders about. ── */}
      {dateFilterable ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1" style={{ fontSize: 11, color: "var(--vault-text-faint)" }}>
              <label htmlFor="results-from">From</label>
              <input id="results-from" type="date" value={from} style={control}
                min={covered[0]} max={covered[covered.length - 1]}
                onChange={(e) => { setFrom(e.target.value); sync({ from: e.target.value }); }} />
            </div>
            <div className="flex flex-col gap-1" style={{ fontSize: 11, color: "var(--vault-text-faint)" }}>
              <label htmlFor="results-to">To</label>
              <input id="results-to" type="date" value={to} style={control}
                min={covered[0]} max={covered[covered.length - 1]}
                onChange={(e) => { setTo(e.target.value); sync({ to: e.target.value }); }} />
            </div>
            <div className="flex flex-wrap gap-1.5 pb-0.5">
              {PRESETS.map(([label, apply]) => (
                <button key={label} type="button" onClick={apply}
                  className="vault-press rounded-full px-3 inline-flex items-center"
                  style={{ minHeight: 36, fontSize: 11.5, border: "1px solid var(--vault-border)", color: "var(--vault-text-mute)" }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          {/* The BASIS, beside the control that depends on it. */}
          <p style={{ fontSize: 11, color: "var(--vault-text-faint)", margin: 0, maxWidth: 720, lineHeight: 1.5 }}>
            {dateBasisNote} Settled cards run {covered[0]} to {covered[covered.length - 1]}.
          </p>
          {rangeError ? (
            <p role="alert" style={{ fontSize: 12.5, color: "var(--vault-warn)", margin: 0 }}>{rangeError}</p>
          ) : null}
        </div>
      ) : (
        <p style={{ fontSize: 11.5, color: "var(--vault-text-faint)", margin: 0, maxWidth: 720, lineHeight: 1.5 }}>
          No date filter for this population: its ledger publishes a total rather than the individual
          dated rows behind it, and a date control over a total would narrow the label without
          narrowing the number.
        </p>
      )}

      <p style={{ fontSize: 12, color: "var(--vault-text-mute)", margin: 0, maxWidth: 720 }}>{TYPE_NOTE[recordType]}</p>

      {/* ── THE SELECTED PERIOD, from the cards themselves ────────────────────────────────────── */}
      {dateFilterable && !rangeError ? (
        <div style={{ border: "1px solid var(--vault-border)", borderRadius: 10, padding: "12px 14px", background: "var(--vault-wash-faint)" }}>
          <div style={{ fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--vault-text-faint)" }}>
            {rangeLabel}
          </div>
          <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 16, alignItems: "baseline" }}>
            {cardPool.decisive > 0 ? (
              <>
                <span style={{ fontSize: 22, fontWeight: 800 }}>{(cardPool.rate! * 100).toFixed(1)}%</span>
                <span style={{ fontFamily: "monospace", fontSize: 13 }}>{cardPool.wins}-{cardPool.losses}</span>
              </>
            ) : (
              /* ZERO DECISIVE IS UNAVAILABLE, NEVER 0%. */
              <span style={{ fontSize: 14, color: "var(--vault-text-mute)" }}>
                {selectedCards.length === 0 ? "No card in this selection." : "No card in this selection has settled yet — there is no hit rate to report."}
              </span>
            )}
            <span style={{ fontSize: 11.5, color: "var(--vault-text-mute)", fontFamily: "monospace" }}>
              {cardPool.decisive} decisive
              {cardPool.pushes ? ` · ${cardPool.pushes} push` : ""}
              {cardPool.pending ? ` · ${cardPool.pending} pending` : ""}
              {` · ${selectedCards.length} card${selectedCards.length === 1 ? "" : "s"}`}
            </span>
          </div>
        </div>
      ) : pooled ? (
        <div style={{ border: "1px solid var(--vault-border)", borderRadius: 10, padding: "12px 14px", background: "var(--vault-wash-faint)" }}>
          <div style={{ fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--vault-text-faint)" }}>
            Selected population
          </div>
          <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 16, alignItems: "baseline" }}>
            <Rate row={{ ...(visible[0] ?? {} as ResultRow), wins: pooled.wins, losses: pooled.losses, hitRate: pooled.hitRate, interval: pooled.interval }} />
            <span style={{ fontSize: 11.5, color: "var(--vault-text-mute)", fontFamily: "monospace" }}>
              {pooled.wins + pooled.losses} decisive
              {pooled.pushes ? ` · ${pooled.pushes} push` : ""}
              {pooled.voids ? ` · ${pooled.voids} void` : ""}
              {pooled.pending ? ` · ${pooled.pending} pending` : ""}
            </span>
          </div>
        </div>
      ) : null}

      {/* ── PER-SPORT RECORD. Derived from the CARDS whenever a date range can apply, because the
             aggregate table beside a filtered headline was two answers to one question: the header
             read "3-10 over the last 7 days" while the row under it read "6-31" from the all-time
             ledger, with nothing saying they counted different periods. Same source, one period. ── */}
      {dateFilterable && !rangeError ? (
        gridSports.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--vault-text-mute)" }}>No settled card in this period.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", fontSize: 13, width: "100%", minWidth: 460 }}>
              <caption className="sr-only">Record by sport for {rangeLabel}</caption>
              <thead>
                <tr>
                  {["Sport", "Record", "Decisive", "Pending", "Period"].map((h) => (
                    <th key={h} scope="col" style={{ textAlign: "left", padding: "6px 12px 6px 0", borderBottom: "1px solid var(--vault-rule)", whiteSpace: "nowrap", fontSize: 11, color: "var(--vault-text-faint)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gridSports.map((sp) => {
                  const mine = inRange.filter((c) => c.sport === sp && (tier === "all" || c.tier === tier));
                  const w = mine.filter((c) => c.won).length;
                  const l = mine.filter((c) => c.lost).length;
                  const dec = w + l;
                  return (
                    <tr key={sp}>
                      <th scope="row" style={{ textAlign: "left", padding: "7px 12px 7px 0", fontWeight: 600 }}>{SPORT_LABEL[sp] ?? sp}</th>
                      <td style={{ padding: "7px 12px 7px 0" }}>
                        {dec === 0
                          ? <span style={{ color: "var(--vault-text-mute)", fontSize: 12 }}>{mine.length ? "nothing settled yet" : "no card in this period"}</span>
                          : <><strong>{(w / dec * 100).toFixed(1)}%</strong> <span style={{ fontFamily: "monospace", fontSize: 12 }}>{w}-{l}</span></>}
                      </td>
                      <td style={{ padding: "7px 12px 7px 0", fontFamily: "monospace", fontSize: 12 }}>{dec}</td>
                      <td style={{ padding: "7px 12px 7px 0", fontFamily: "monospace", fontSize: 12, color: "var(--vault-text-faint)" }}>{mine.filter((c) => c.pending).length || "—"}</td>
                      <td style={{ padding: "7px 12px 7px 0", fontFamily: "monospace", fontSize: 10.5, color: "var(--vault-text-faint)" }}>{rangeLabel}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : visible.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--vault-text-mute)" }}>
          Nothing settled in this combination yet. That is an absence of graded cards, not a zero result.
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", fontSize: 13, width: "100%", minWidth: 460 }}>
            <caption className="sr-only">Record for the selected population</caption>
            <thead>
              <tr>
                {["Sport", tier === "all" ? "Record" : `Record (${tier})`, "Decisive", "Pending", "Source"].map((h) => (
                  <th key={h} scope="col" style={{ textAlign: "left", padding: "6px 12px 6px 0", borderBottom: "1px solid var(--vault-rule)", whiteSpace: "nowrap", fontSize: 11, color: "var(--vault-text-faint)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={`${r.recordType}:${r.sport}:${r.tier ?? "all"}`}>
                  <th scope="row" style={{ textAlign: "left", padding: "7px 12px 7px 0", fontWeight: 600 }}>{SPORT_LABEL[r.sport] ?? r.sport}</th>
                  <td style={{ padding: "7px 12px 7px 0" }}><Rate row={r} /></td>
                  <td style={{ padding: "7px 12px 7px 0", fontFamily: "monospace", fontSize: 12 }}>{r.decisive}</td>
                  <td style={{ padding: "7px 12px 7px 0", fontFamily: "monospace", fontSize: 12, color: "var(--vault-text-faint)" }}>{r.pending || "—"}</td>
                  <td style={{ padding: "7px 12px 7px 0", fontFamily: "monospace", fontSize: 10.5, color: "var(--vault-text-faint)" }}>{r.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── SPORT × RISK GRID, over the selected period. Every populated cell is a link into its own
             slips; an empty cell says nothing rather than reporting a zero. ── */}
      {dateFilterable && !rangeError ? (
        <div className="flex flex-col gap-2">
          <h3 style={{ fontSize: 13.5, fontWeight: 700, margin: "6px 0 0" }}>By sport and risk tier</h3>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", fontSize: 12.5, width: "100%", minWidth: 520 }}>
              <caption className="sr-only">Settled cards by sport and risk tier for {rangeLabel}</caption>
              <thead>
                <tr>
                  <th scope="col" style={{ textAlign: "left", padding: "6px 12px 6px 0", borderBottom: "1px solid var(--vault-rule)", fontSize: 11, color: "var(--vault-text-faint)" }}>Sport</th>
                  {RISK_TIERS.map((t) => (
                    <th key={t} scope="col" style={{ textAlign: "left", padding: "6px 12px 6px 0", borderBottom: "1px solid var(--vault-rule)", fontSize: 11, color: "var(--vault-text-faint)", textTransform: "capitalize" }}>{t}</th>
                  ))}
                  <th scope="col" style={{ textAlign: "left", padding: "6px 0", borderBottom: "1px solid var(--vault-rule)", fontSize: 11, color: "var(--vault-text-faint)" }}>All tiers</th>
                </tr>
              </thead>
              <tbody>
                {gridSports.map((sp) => {
                  const mine = inRange.filter((c) => c.sport === sp);
                  const cell = (subset: SettledCard[]) => {
                    const w = subset.filter((c) => c.won).length;
                    const l = subset.filter((c) => c.lost).length;
                    return { w, l, n: subset.length, decisive: w + l };
                  };
                  return (
                    <tr key={sp}>
                      <th scope="row" style={{ textAlign: "left", padding: "7px 12px 7px 0", fontWeight: 600 }}>{SPORT_LABEL[sp] ?? sp}</th>
                      {RISK_TIERS.map((t) => {
                        const c = cell(mine.filter((x) => x.tier === t));
                        return (
                          <td key={t} style={{ padding: "7px 12px 7px 0", fontFamily: "monospace", fontSize: 12 }}>
                            {c.n === 0 ? (
                              <span style={{ color: "var(--vault-text-faint)" }} title="no card in this cell for this period">—</span>
                            ) : (
                              /* EVERY POPULATED CELL LEADS TO ITS OWN SLIPS. */
                              <button type="button"
                                onClick={() => { setSport(sp); setTier(t); sync({ sport: sp, tier: t }); }}
                                style={{ color: "var(--vault-gold-bright)", background: "none", border: "none", padding: 0, font: "inherit", cursor: "pointer", textDecoration: "underline" }}
                                aria-label={`Show the ${c.n} ${sp} ${t} card${c.n === 1 ? "" : "s"} for ${rangeLabel}`}>
                                {c.w}-{c.l}{c.decisive < c.n ? `+${c.n - c.decisive}` : ""}
                              </button>
                            )}
                          </td>
                        );
                      })}
                      <td style={{ padding: "7px 0", fontFamily: "monospace", fontSize: 12 }}>
                        {mine.length === 0 ? <span style={{ color: "var(--vault-text-faint)" }}>—</span> : `${cell(mine).w}-${cell(mine).l}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: 11, color: "var(--vault-text-faint)", margin: 0, lineHeight: 1.5 }}>
            A trailing <code>+n</code> counts cards that have not settled; they are in no rate above.
            A dash is an empty cell — no card of that tier settled in this period, which is not a loss.
            Mixed-sport cards are their own row and are never counted inside a single sport.
          </p>
        </div>
      ) : null}

      {/* ── THE TREND, over exactly the cards selected above. ── */}
      {/* A range containing NO card draws no chart. Drawing one is not dishonest — every day would
             correctly read as a gap — but a "day by day" heading over an empty window is noise
             directly beneath a headline that already says there is nothing in the selection. */}
      {dateFilterable && !rangeError && selectedCards.length > 0 && series.days.length > 0 ? (
        <ResultsTrend days={series.days} cumulative={series.cumulative} label={`${rangeLabel} · ${sport === "all" ? "all sports" : sport}${tier === "all" ? "" : ` · ${tier}`}`} />
      ) : null}

      {/* ── THE SLIPS THEMSELVES. The drill-down the grid links into. ── */}
      {dateFilterable && !rangeError && selectedCards.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 style={{ fontSize: 13.5, fontWeight: 700, margin: "6px 0 0" }}>
            The {selectedCards.length} card{selectedCards.length === 1 ? "" : "s"} behind this record
          </h3>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", fontSize: 12.5, width: "100%", minWidth: 560 }}>
              <caption className="sr-only">Individual settled cards for {rangeLabel}</caption>
              <thead>
                <tr>
                  {["Date", "Sport", "Tier", "Legs", "Price", "Result", "Slip"].map((h) => (
                    <th key={h} scope="col" style={{ textAlign: "left", padding: "6px 12px 6px 0", borderBottom: "1px solid var(--vault-rule)", fontSize: 11, color: "var(--vault-text-faint)", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Newest first, capped — and the cap is STATED below rather than silently applied. */}
                {[...selectedCards].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 50).map((c) => (
                  <tr key={c.slipId}>
                    <td style={{ padding: "6px 12px 6px 0", fontFamily: "monospace", fontSize: 11.5, whiteSpace: "nowrap" }}>{c.date}</td>
                    <td style={{ padding: "6px 12px 6px 0" }}>{c.sports.join(" + ")}</td>
                    <td style={{ padding: "6px 12px 6px 0", textTransform: "capitalize" }}>{c.tier ?? "—"}</td>
                    <td style={{ padding: "6px 12px 6px 0", fontFamily: "monospace", fontSize: 11.5 }}>{c.legCount}</td>
                    <td style={{ padding: "6px 12px 6px 0", fontFamily: "monospace", fontSize: 11.5 }}>
                      {c.combinedDecimal != null ? c.combinedDecimal.toFixed(2) : "—"}
                    </td>
                    <td style={{ padding: "6px 12px 6px 0", textTransform: "capitalize", color: c.won ? "var(--vault-success)" : c.lost ? "var(--vault-text-mute)" : "var(--vault-text-faint)" }}>
                      {c.result}
                    </td>
                    <td style={{ padding: "6px 0", fontFamily: "monospace", fontSize: 10.5, color: "var(--vault-text-faint)", wordBreak: "break-all" }}>{c.slipId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {selectedCards.length > 50 ? (
            <p style={{ fontSize: 11, color: "var(--vault-text-faint)", margin: 0 }}>
              Showing the 50 most recent of {selectedCards.length}. Narrow the range to see the rest —
              the totals above count every one of them.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
