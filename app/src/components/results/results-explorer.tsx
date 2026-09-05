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

export default function ResultsExplorer({ rows }: { rows: ResultRow[] }) {
  const [recordType, setRecordType] = useState<string>(RECORD_TYPES.SUGGESTED_PARLAY);
  const [sport, setSport] = useState<string>("all");
  const [tier, setTier] = useState<string>("all");

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
  }, []);

  const sync = (next: Record<string, string>) => {
    try {
      const url = new URL(window.location.href);
      for (const [k, v] of Object.entries(next)) {
        if (v === "all") url.searchParams.delete(k);
        else url.searchParams.set(k, v);
      }
      window.history.replaceState(null, "", url.toString());
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

      <p style={{ fontSize: 12, color: "var(--vault-text-mute)", margin: 0, maxWidth: 720 }}>{TYPE_NOTE[recordType]}</p>

      {pooled ? (
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

      {visible.length === 0 ? (
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
    </section>
  );
}
