"use client";
/**
 * THE TREND, DRAWN HONESTLY — Program 234 · Release F.
 *
 * Two views over the SAME cards the filters above already selected: what happened each day, and
 * where the pooled record stands as those days accumulate.
 *
 * THE THREE WAYS A RECORD CHART LIES, and what is done about each:
 *
 *   A DAY WITH NOTHING ON IT. Plotted at 0% it draws a loss nobody took; skipped entirely it
 *   compresses three quiet weeks into one bad afternoon. Every calendar day in the range is drawn,
 *   and an empty one is a marked gap with no rate at all.
 *
 *   UNEQUAL DENOMINATORS. A day that went 1-0 and a day that went 0-20 are not two data points of
 *   equal weight. The daily columns are drawn at the HEIGHT OF THEIR SAMPLE, so a single-card day
 *   cannot look like a trend, and the cumulative line is pooled from summed counts rather than
 *   averaged across days.
 *
 *   PENDING OUTCOMES. They are in no decisive denominator anywhere here, and are shown separately
 *   so a reader can see what is still open rather than wondering why the counts do not add up.
 *
 * The table beneath is not a fallback — it is the same data, readable by anyone the chart does not
 * serve, and it is what the assertions about "the chart agrees with the headline" are checked against.
 */
import { useMemo } from "react";

export interface TrendDay {
  date: string; hasData: boolean; cards: number;
  wins: number; losses: number; pushes: number; pending: number;
  decisive: number; rate: number | null;
}
export interface TrendPoint { date: string; wins: number; losses: number; decisive: number; rate: number | null }

const pct = (n: number | null) => (n == null ? "—" : `${(n * 100).toFixed(1)}%`);

export default function ResultsTrend({
  days, cumulative, label,
}: {
  days: TrendDay[];
  cumulative: TrendPoint[];
  /** The period and population these cover, so the chart cannot be read under the wrong filter. */
  label: string;
}) {
  const maxSample = useMemo(() => Math.max(1, ...days.map((d) => d.decisive)), [days]);
  const withData = days.filter((d) => d.hasData).length;

  if (!days.length) {
    return (
      <p style={{ fontSize: 12.5, color: "var(--vault-text-mute)", margin: 0 }}>
        No settled card in this selection, so there is no trend to draw. An empty period is not a losing one.
      </p>
    );
  }

  /* The cumulative polyline, in a 0–1 space. Points exist only where a rate exists. */
  const W = 100, H = 30;
  const pts = cumulative
    .map((p, i) => (p.rate == null ? null : `${(i / Math.max(1, cumulative.length - 1)) * W},${H - p.rate * H}`))
    .filter(Boolean) as string[];

  return (
    <div className="flex flex-col gap-3">
      <h3 style={{ fontSize: 13.5, fontWeight: 700, margin: "6px 0 0" }}>Day by day</h3>
      <p style={{ fontSize: 11, color: "var(--vault-text-faint)", margin: 0, lineHeight: 1.5 }}>
        {label} · {withData} of {days.length} day{days.length === 1 ? "" : "s"} had a settled card.
        Column height is the number of DECIDED cards that day, so a one-card day cannot look like a trend.
        A day with nothing on it has no rate and is drawn as a gap, never as a zero.
      </p>

      {/* ── daily columns ── */}
      <div aria-hidden className="flex items-end gap-[2px]" style={{ height: 70 }}>
        {days.map((d) => (
          <span key={d.date} className="flex-1 flex flex-col justify-end" style={{ height: "100%" }}
            title={d.hasData ? `${d.date}: ${d.wins}-${d.losses}${d.pending ? ` · ${d.pending} pending` : ""}` : `${d.date}: no settled card`}>
            {d.decisive === 0 ? (
              /* The GAP marker. Visible, at the baseline, and unmistakably not a bar. */
              <span style={{ height: 2, background: "var(--vault-border)", opacity: 0.9 }} />
            ) : (
              <>
                <span style={{ height: `${(d.wins / maxSample) * 100}%`, background: "var(--vault-success)" }} />
                <span style={{ height: `${(d.losses / maxSample) * 100}%`, background: "color-mix(in srgb, var(--vault-text-faint) 55%, transparent)" }} />
              </>
            )}
          </span>
        ))}
      </div>

      {/* ── cumulative pooled rate ── */}
      <div className="flex flex-col gap-1">
        <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>
          Cumulative hit rate · pooled from summed counts, never averaged across days
        </span>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden focusable="false"
          style={{ width: "100%", height: 54, display: "block", background: "var(--vault-wash-faint)", border: "1px solid var(--vault-border)", borderRadius: 6 }}>
          {pts.length > 1 ? <polyline points={pts.join(" ")} fill="none" stroke="var(--vault-gold-bright)" strokeWidth="0.8" vectorEffect="non-scaling-stroke" /> : null}
          {pts.length === 1 ? <circle cx={pts[0].split(",")[0]} cy={pts[0].split(",")[1]} r="1" fill="var(--vault-gold-bright)" /> : null}
        </svg>
      </div>

      {/* ── THE SAME DATA, READABLE. Not a fallback: this is what the totals are checked against. ── */}
      <details>
        <summary style={{ fontSize: 12, color: "var(--vault-text-mute)", cursor: "pointer" }}>
          The numbers behind these charts
        </summary>
        <div style={{ overflowX: "auto", marginTop: 8 }}>
          <table style={{ borderCollapse: "collapse", fontSize: 12, width: "100%", minWidth: 460 }}>
            <caption className="sr-only">Daily and cumulative record for {label}</caption>
            <thead>
              <tr>
                {["Date", "Day", "Decided", "Pending", "Day rate", "Cumulative"].map((h) => (
                  <th key={h} scope="col" style={{ textAlign: "left", padding: "5px 12px 5px 0", borderBottom: "1px solid var(--vault-rule)", fontSize: 10.5, color: "var(--vault-text-faint)", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((d, i) => (
                <tr key={d.date}>
                  <th scope="row" style={{ textAlign: "left", padding: "5px 12px 5px 0", fontFamily: "monospace", fontSize: 11.5, fontWeight: 500 }}>{d.date}</th>
                  <td style={{ padding: "5px 12px 5px 0", fontFamily: "monospace", fontSize: 11.5 }}>
                    {d.hasData ? `${d.wins}-${d.losses}` : <span style={{ color: "var(--vault-text-faint)" }}>no card</span>}
                  </td>
                  <td style={{ padding: "5px 12px 5px 0", fontFamily: "monospace", fontSize: 11.5 }}>{d.decisive}</td>
                  <td style={{ padding: "5px 12px 5px 0", fontFamily: "monospace", fontSize: 11.5, color: "var(--vault-text-faint)" }}>{d.pending || "—"}</td>
                  <td style={{ padding: "5px 12px 5px 0", fontFamily: "monospace", fontSize: 11.5 }}>
                    {d.rate == null ? <span style={{ color: "var(--vault-text-faint)" }} title="no decided card that day">—</span> : pct(d.rate)}
                  </td>
                  <td style={{ padding: "5px 12px 5px 0", fontFamily: "monospace", fontSize: 11.5, color: "var(--vault-text-mute)" }}>
                    {cumulative[i]?.rate == null ? "—" : `${pct(cumulative[i].rate)} · ${cumulative[i].wins}-${cumulative[i].losses}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <p style={{ fontSize: 11, color: "var(--vault-text-faint)", margin: 0, lineHeight: 1.55, maxWidth: 760 }}>
        A rising line is not evidence the model learned. These are whole published cards over a short
        period, their legs are not independent of each other, and no period here is long enough to
        support a claim about the future.
      </p>
    </div>
  );
}
