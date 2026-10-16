/**
 * /preview/ncaaf/game/<eventId> — INTERNAL preview of one NCAAF game's frozen shadow forecast (NCAAF-008).
 *
 * Internal like /preview/ncaaf: 404 in the production export, deleted from `out/` by the prune step. Shows
 * the FORECAST OF RECORD (last receipt captured before kickoff), the score-world summary it froze, the market
 * line exactly as captured (a benchmark, never our number), and — once graded — the official final. Every
 * figure is read from the receipt or the grade log; nothing is recomputed at render time.
 */
import Link from "next/link";
import type { Metadata } from "next";

import { guardInternalRoute } from "@/lib/internal-route-guard";
import { withRouteMetadata } from "@/lib/seo/route-metadata";
import { forecastOfRecord } from "@/lib/sports/ncaaf/forward.mjs";
import { loadNcaafGrades, loadNcaafReceipts, pct, type NcaafReceipt } from "@/lib/sports/ncaaf/preview-hub";

const SEASON = 2026;
const MUTE = "var(--vault-text-mute)";
const TEXT = "var(--vault-text)";
const RULE = "1px solid var(--vault-rule)";

export function generateStaticParams() {
  return [...loadNcaafReceipts(SEASON).keys()].map((eventId) => ({ eventId }));
}
export const dynamicParams = false;

export function generateMetadata({ params }: { params: { eventId: string } }): Metadata {
  return withRouteMetadata(`/preview/ncaaf/game/${params.eventId}/`, { title: "Internal Preview · College Football game", robots: { index: false, follow: false } });
}

const signed = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)}`;
const american = (o: number | null) => (o === null ? "—" : o > 0 ? `+${o}` : `${o}`);
const et = (iso: string) => new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) + " ET";

/** A compact, accessible histogram: one bar per bucket of `width` points, counts as exact world shares. */
function Distribution({ title, hist, worlds, width, unit }: { title: string; hist: Record<string, number>; worlds: number; width: number; unit: string }) {
  const buckets = new Map<number, number>();
  for (const [k, v] of Object.entries(hist)) { const b = Math.floor(Number(k) / width) * width; buckets.set(b, (buckets.get(b) ?? 0) + v); }
  const keys = [...buckets.keys()].sort((a, b) => a - b);
  const max = Math.max(...buckets.values());
  return (
    <figure className="m-0 flex flex-col gap-1">
      <figcaption className="text-[12px] font-semibold" style={{ color: TEXT }}>{title}</figcaption>
      <ul className="m-0 p-0 list-none flex flex-col gap-[2px]" aria-label={`${title}, share of ${worlds.toLocaleString("en-US")} simulated games per ${width}-${unit} range`}>
        {keys.map((k) => {
          const share = buckets.get(k)! / worlds;
          return (
            <li key={k} className="flex items-center gap-2 text-[11px] font-mono" style={{ color: MUTE }}>
              <span className="w-[72px] text-right">{k} to {k + width - 1}</span>
              <span aria-hidden className="h-[8px] rounded-sm" style={{ width: `${Math.max(1, (buckets.get(k)! / max) * 180)}px`, background: "var(--vault-gold)" }} />
              <span>{(share * 100).toFixed(1)}%</span>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-3 py-1.5 text-[13.5px]" style={{ borderBottom: RULE }}>
      <dt className="w-[180px] shrink-0" style={{ color: MUTE }}>{label}</dt>
      <dd className="m-0" style={{ color: TEXT }}>{children}</dd>
    </div>
  );
}

export default function NcaafPreviewGamePage({ params }: { params: { eventId: string } }) {
  guardInternalRoute();
  const receipts = loadNcaafReceipts(SEASON).get(params.eventId) ?? [];
  const grade = loadNcaafGrades(SEASON).get(params.eventId) ?? null;
  const r = (forecastOfRecord(receipts) ?? receipts.at(-1)) as NcaafReceipt | undefined;
  if (!r) return <p className="vault-page-shell px-4 py-8">No receipt for this event.</p>;
  const e = r.event, f = r.forecast, w = f.worlds;
  const home = e.homeAbbreviation ?? "Home", away = e.awayAbbreviation ?? "Away";
  const settled = grade?.settlement.state === "SETTLED";
  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-12 overflow-x-hidden flex flex-col gap-6 max-w-3xl">
      <p className="m-0 text-[12px]"><Link href="/preview/ncaaf/" className="underline" style={{ color: MUTE }}>← College football preview</Link></p>
      <header className="flex flex-col gap-1">
        <h1 className="m-0 font-display text-[22px] sm:text-[26px] font-bold" style={{ color: TEXT }}>{away} @ {home}</h1>
        <p className="m-0 text-[13px]" style={{ color: MUTE }}>
          Week {e.week} · {et(e.startUtcAtCapture)}{e.neutralSite ? " · neutral site" : ""} ·{" "}
          <span className="font-semibold" style={{ color: TEXT }}>Shadow forecast, not published</span>
        </p>
      </header>

      {settled ? (
        <section aria-labelledby="final-h" className="rounded-[12px] px-4 py-3" style={{ border: RULE }}>
          <h2 id="final-h" className="m-0 text-[15px] font-bold" style={{ color: TEXT }}>Official final</h2>
          <p className="m-0 text-[14px]" style={{ color: TEXT }}>
            {away} {grade!.settlement.finalAway} – {home} {grade!.settlement.finalHome}{grade!.settlement.overtimePeriods ? ` (${grade!.settlement.overtimePeriods}OT)` : ""}
          </p>
          <p className="m-0 text-[12px]" style={{ color: MUTE }}>The forecast below is the version frozen before kickoff and was not changed after the game.</p>
        </section>
      ) : null}

      <section aria-labelledby="forecast-h" className="flex flex-col gap-1">
        <h2 id="forecast-h" className="m-0 font-display text-[18px] font-bold" style={{ color: TEXT }}>Forecast frozen before kickoff</h2>
        <dl className="m-0">
          <Row label="Win chance (rating model)">{home} {pct(f.winner.pHome)} · {away} {pct(1 - f.winner.pHome)}</Row>
          <Row label="Win chance (score model)">{home} {pct(f.score.pHome)}{w && !w.refused ? ` · simulated games ${home} ${pct(w.pHome!)}` : ""}</Row>
          <Row label="Projected score (means)">{away} {f.score.awayMean.toFixed(1)} – {home} {f.score.homeMean.toFixed(1)}</Row>
          <Row label="Projected margin (home)">{signed(f.score.marginMean)} points{w?.marginPercentiles ? ` · 80% of simulated games between ${w.marginPercentiles.p10} and ${w.marginPercentiles.p90}` : ""}</Row>
          <Row label="Projected total">{f.score.totalMean.toFixed(1)} points{w?.totalPercentiles ? ` · 80% between ${w.totalPercentiles.p10} and ${w.totalPercentiles.p90}` : ""}</Row>
          {w?.counts ? <Row label="Simulated games">{w.worlds!.toLocaleString("en-US")} · {home} won {w.counts.homeWins.toLocaleString("en-US")} · went to overtime {w.counts.overtimeWorlds.toLocaleString("en-US")}</Row> : null}
        </dl>
        <p className="m-0 text-[12px]" style={{ color: MUTE }}>
          The two win chances come from different research models and are shown side by side rather than reconciled.
          Frozen {et(r.capturedAt)} from code {r.code.commit.slice(0, 10)}.
        </p>
      </section>

      {w?.marginHistogram && w.totalHistogram ? (
        <section aria-labelledby="dist-h" className="flex flex-col gap-3">
          <h2 id="dist-h" className="m-0 font-display text-[18px] font-bold" style={{ color: TEXT }}>Simulated outcomes</h2>
          <Distribution title={`Margin (${home} minus ${away})`} hist={w.marginHistogram} worlds={w.worlds!} width={7} unit="point" />
          <Distribution title="Total points" hist={w.totalHistogram} worlds={w.worlds!} width={7} unit="point" />
          <p className="m-0 text-[12px]" style={{ color: MUTE }}>Known weakness: games decided by exactly 3 or 7 points, and overtime, occur less often here than in real games.</p>
        </section>
      ) : null}

      <section aria-labelledby="market-h" className="flex flex-col gap-1">
        <h2 id="market-h" className="m-0 font-display text-[18px] font-bold" style={{ color: TEXT }}>Market line, as captured</h2>
        {r.market ? (
          <dl className="m-0">
            <Row label="Line">{r.market.details ?? "—"}{r.market.homeSpread === null ? " (side not verified)" : ""}</Row>
            <Row label="Total">{r.market.overUnder ?? "—"}</Row>
            <Row label="Moneyline">{away} {american(r.market.awayMoneyline)} · {home} {american(r.market.homeMoneyline)}</Row>
            <Row label="Source">{r.market.provider ?? "unknown"} via ESPN · captured {et(r.market.capturedAt)}</Row>
          </dl>
        ) : <p className="m-0 text-[13px]" style={{ color: MUTE }}>No line was shown when this forecast was frozen.</p>}
        <p className="m-0 text-[12px]" style={{ color: MUTE }}>A sportsbook price, shown for comparison. It is not a GameTimePicks forecast and was not a model input.</p>
      </section>
    </div>
  );
}
