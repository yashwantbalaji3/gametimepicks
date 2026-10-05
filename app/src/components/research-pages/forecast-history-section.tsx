/**
 * Research V2 (Session 13) · "Our forecasts for <player>" — the player's own published forecasts from the Universal
 * Forecast Ledger, newest first, each with what happened and how it was scored, and a link to that forecast type's full
 * record. Read-only, display-only; one reader (forecast-ledger-reader). Pending, void and withdrawn rows are shown in
 * words and never as misses. Renders nothing when the ledger holds no forecast for this player.
 */
import Link from "next/link";

import { familyHref, subjectRows } from "@/lib/results/v2/forecast-ledger-reader";
import { FAMILY_LABELS } from "@/lib/results/v2/forecast-record.mjs";

const fmt = (v: number | null | undefined) => (v == null ? "—" : Number.isInteger(v) ? String(v) : Number(v).toFixed(1));
const pct = (v: number | null | undefined) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);

function said(r: any): string {
  if (r.forecastKind === "CONTINUOUS_PROJECTION") return r.rangeLow != null ? `${fmt(r.projection)} (range ${fmt(r.rangeLow)}–${fmt(r.rangeHigh)})` : fmt(r.projection);
  if (r.forecastKind === "BINARY_PROBABILITY") return `${pct(r.probability)} chance`;
  return "—";
}
function happened(r: any): string {
  const s = r.settlement ?? {};
  if (r.publicationStatus === "WITHDRAWN") return "Withdrawn before kickoff — not a miss";
  if (s.state === "PENDING") return "Not final yet";
  if (s.state === "VOID") return s.reason === "DID_NOT_PLAY" ? "Did not play — void" : "Void";
  if (s.state === "NO_MEASUREMENT") return "No official line — not measured";
  if (r.forecastKind === "CONTINUOUS_PROJECTION") return `Actual ${fmt(s.finalValue)} · missed by ${fmt(r.measurement?.absoluteError)}`;
  return r.measurement?.observed === 1 ? "Happened" : r.measurement?.observed === 0 ? "Did not happen" : "Settled";
}

export default function ForecastHistorySection({ subjectId, name, limit = 8 }: { subjectId: string; name: string; limit?: number }) {
  const rows = subjectRows(subjectId);
  if (!rows.length) return null;
  const shown = rows.slice(0, limit);
  const families = [...new Set(rows.map((r) => `${r.sport}|${r.family}`))];
  return (
    <section aria-labelledby="forecast-history" style={{ marginTop: 20 }}>
      <p className="font-mono" style={{ margin: 0, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--vault-text-faint)" }}>
        Forecast record · what we said, and what happened
      </p>
      <h2 id="forecast-history" style={{ margin: "6px 0 4px", fontSize: 17, fontWeight: 750 }}>{`Our forecasts for ${name}`}</h2>
      <p style={{ margin: "0 0 8px", fontSize: 12.5, color: "var(--vault-text-mute)" }}>
        {`${rows.length} published forecast${rows.length === 1 ? "" : "s"}, newest first${rows.length > shown.length ? ` — the latest ${shown.length} shown` : ""}. Each was frozen before the game and checked against the official result.`}
      </p>
      <div style={{ overflowX: "auto", position: "relative" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead>
            <tr>
              {["Game", "Forecast", "We said", "What happened"].map((h) => (
                <th key={h} scope="col" style={{ textAlign: "left", padding: "6px 8px", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--vault-text-faint)", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.forecastId}>
                <td style={{ padding: "6px 8px", borderTop: "1px solid var(--vault-border)", whiteSpace: "nowrap" }}>
                  <span className="font-mono">{String(r.eventStart ?? r.publishedAt ?? "").slice(0, 10) || "—"}</span>
                  <div style={{ fontSize: 11, color: "var(--vault-text-faint)" }}>{r.matchup ?? ""}</div>
                </td>
                <td style={{ padding: "6px 8px", borderTop: "1px solid var(--vault-border)" }}>
                  <Link href={familyHref(r.sport, r.family)} style={{ color: "var(--gtp-bank-heat)" }}>{FAMILY_LABELS[r.family as keyof typeof FAMILY_LABELS] ?? r.family}</Link>
                </td>
                <td className="font-mono" style={{ padding: "6px 8px", borderTop: "1px solid var(--vault-border)" }}>{said(r)}</td>
                <td style={{ padding: "6px 8px", borderTop: "1px solid var(--vault-border)" }}>{happened(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--vault-text-mute)" }}>
        How each forecast type has done overall:{" "}
        {families.map((k, i) => {
          const [sport, family] = k.split("|");
          return (
            <span key={k}>
              {i ? " · " : ""}
              <Link href={familyHref(sport, family)} style={{ color: "var(--gtp-bank-heat)" }}>{FAMILY_LABELS[family as keyof typeof FAMILY_LABELS] ?? family}</Link>
            </span>
          );
        })}
      </p>
    </section>
  );
}
