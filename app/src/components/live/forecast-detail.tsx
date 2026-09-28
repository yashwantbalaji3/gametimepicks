"use client";
/**
 * ForecastDetail — the Analyst layer beneath one featured forecast.
 *
 * Shows ONLY canonical fields that exist for this row; a missing field is omitted, never padded:
 *   · the model's own 10th–90th percentile range (volume families, both ends frozen)
 *   · the Model Lab's status for the family (command-center/model-status.ts — the same labels the
 *     Model Lab renders; never a second label set)
 *   · the family's publication state on the board, as recorded
 *   · when the forecast was frozen, and when (and where) the line was captured
 *   · where the live measurement comes from, once a record has been read
 *
 * It never restates a prediction, a line, a live value or a result — those are in the row above, the
 * same numbers in both modes. Rendered only inside <AnalystOnly>, so a Simple page carries none of it.
 */
import type { FeaturedForecast, LiveModelStatus } from "@/lib/live/nfl-hub-data";

const SANS = "var(--font-display)";
const ET = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const etTime = (iso: string | null) => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? `${ET.format(new Date(t))} ET` : null;
};
const fmt = (n: number | null) => (n === null ? null : Number.isInteger(n) ? String(n) : n.toFixed(1));
const BOOK: Record<string, string> = { draftkings: "DraftKings", fanduel: "FanDuel", betmgm: "BetMGM", caesars: "Caesars" };
const titleState = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ");

const S = {
  box: { margin: "10px 0 0", border: "1px solid var(--vault-border)", borderRadius: 8, background: "color-mix(in srgb, var(--vault-scrim-base) 45%, transparent)" } as const,
  summary: { cursor: "pointer", listStyle: "none", padding: "8px 10px", minHeight: 36, display: "flex", alignItems: "center", fontFamily: SANS, fontSize: 11.5, fontWeight: 600, color: "var(--vault-text-mute)", letterSpacing: "0.04em" } as const,
  dl: { display: "grid", gridTemplateColumns: "minmax(0, 11em) minmax(0, 1fr)", gap: "6px 12px", margin: 0, padding: "2px 10px 10px", fontFamily: SANS, fontSize: 12 } as const,
  dt: { color: "var(--vault-text-faint)", margin: 0 } as const,
  dd: { color: "var(--vault-text)", margin: 0, overflowWrap: "anywhere" } as const,
};

export interface ForecastDetailFacts { label: string; value: string }

/** The facts to show, in order — pure, so the "only what exists" rule is testable. */
export function forecastDetailFacts(f: FeaturedForecast, { modelStatus = null, liveSource = null, lastObservedAt = null }: {
  modelStatus?: LiveModelStatus | null; liveSource?: string | null; lastObservedAt?: string | null;
} = {}): ForecastDetailFacts[] {
  const out: ForecastDetailFacts[] = [];
  if (f.kind === "VOLUME" && f.modelLow !== null && f.modelHigh !== null) out.push({ label: "Pregame range (10th–90th pct.)", value: `${fmt(f.modelLow)} – ${fmt(f.modelHigh)}` });
  if (modelStatus) out.push({ label: "Model status", value: `${modelStatus.label} · ${modelStatus.headline}` });
  if (f.familyState) out.push({ label: "Board publication", value: titleState(f.familyState) });
  const frozen = etTime(f.frozenAt);
  if (frozen) out.push({ label: "Forecast frozen", value: frozen });
  const captured = etTime(f.marketCapturedAt);
  if (f.sportsbook || captured) out.push({ label: "Line source", value: [f.sportsbook ? BOOK[f.sportsbook] ?? f.sportsbook : null, captured ? `captured ${captured}` : null].filter(Boolean).join(" · ") });
  if (liveSource) out.push({ label: "Live measurement", value: [liveSource, etTime(lastObservedAt) ? `last observed ${etTime(lastObservedAt)}` : null].filter(Boolean).join(" · ") });
  return out;
}

export default function ForecastDetail(props: { f: FeaturedForecast; modelStatus?: LiveModelStatus | null; liveSource?: string | null; lastObservedAt?: string | null }) {
  const facts = forecastDetailFacts(props.f, props);
  if (facts.length === 0) return null;
  return (
    <details className="gtp-disclose" style={S.box}>
      <summary style={S.summary}>Model detail</summary>
      <dl style={S.dl}>
        {facts.map((x) => (
          <div key={x.label} style={{ display: "contents" }}>
            <dt style={S.dt}>{x.label}</dt>
            <dd style={S.dd}>{x.value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
