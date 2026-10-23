"use client";
/**
 * RESULTS V2 · OVERVIEW + DAILY TRACKER (B-2). The first thing /results answers: how did GameTimePicks do?
 *
 * - One card per graded population (MLB game calls, NFL game winners, EPL match results, UFC fight winners),
 *   each its own record — never summed into a site-wide percentage.
 * - Research / paused populations (MLB calls the site had paused at first pitch, MLB player-prop leans) sit in their
 *   own, visibly separate block; rows whose publication status cannot be established sit in a third (F05).
 * - Products show their ONE canonical headline (from the results projection), with its window — never
 *   recomputed here.
 * - Windows (Today / 7 days / 30 days / Season / All time) are recomputed on the READER's day from the daily
 *   series, so a static page does not freeze "today" at build time.
 * - F06: the day-by-day list is scoped by the SAME window contract as the counts (populations.mjs `inWindow`) and
 *   sits inside the selected tab's panel — a "Today" tab never sits above a list that starts last week.
 */
import { useId, useState } from "react";
import { useRovingTabs } from "@/components/a11y/use-roving-tabs";

import { windowsFrom, inWindow } from "@/lib/results/v2/populations.mjs";
import { sampleStateFor, SAMPLE_STATE } from "@/lib/sports/graded-picks.mjs";
import { useReaderEtDate } from "@/lib/use-reader-et-date";
import { etDayLabel } from "@/lib/et-stamp.mjs";
import { surfaceHref } from "@/lib/nav/date-sport-route";

export interface OverviewPopulation {
  id: string; label: string; sportLabel: string; class: "PUBLIC" | "RESEARCH" | "UNKNOWN"; note: string | null;
  seasonStart: string | null; seasonLabel: string | null; href: string;
  /** Populations split from one owner by publication status share a group; `tag` names a non-public one's kind. */
  group?: string | null; tag?: string | null;
  days: Array<{ date: string; won: number; lost: number; push: number; void: number }>;
}
export interface OverviewProduct { id: string; label: string; recordLabel: string | null; pendingLabel: string | null; window: string | null; note: string; href: string }

const WINDOWS = [
  { key: "today", label: "Today" }, { key: "d7", label: "7 days" }, { key: "d30", label: "30 days" },
  { key: "season", label: "Season" }, { key: "all", label: "All time" },
] as const;
type WindowKey = (typeof WINDOWS)[number]["key"];

type Counts = { won: number; lost: number; push: number; void: number; decisive: number; hitRate: number | null };
const pct = (r: number | null) => (r == null ? null : `${Math.round(r * 1000) / 10}%`);
/* RESULTS INTEGRITY (2026-10-17, from draft #1123): a rate on these cards travels with the site's one small-sample
   rule (sampleStateFor: under 30 decided says nothing; under 200 is still small). The hubs already gate the same
   records this way; the cards printed "64.3% of 14 decided" bare. */
const sampleCaveat = (decided: number): string | null => {
  const s = sampleStateFor(decided);
  if (s === SAMPLE_STATE.TOO_SMALL) return "Far too few decided to judge accuracy.";
  if (s === SAMPLE_STATE.EMERGING) return "Still a small sample: a rate over this many has a wide margin of error.";
  return null;
};
const record = (c: Counts) => `${c.won}–${c.lost}${c.push ? `–${c.push}` : ""}`;

const countsIn = (p: OverviewPopulation, w: WindowKey, today: string) =>
  (windowsFrom(p.days, { today, seasonStart: p.seasonStart }) as Record<WindowKey, Counts | null>)[w];
const graded = (c: Counts | null) => (c ? c.decisive + c.push + c.void : 0);

function PopulationCard({ p, w, today, siblings = [] }: { p: OverviewPopulation; w: WindowKey; today: string; siblings?: OverviewPopulation[] }) {
  const c = countsIn(p, w, today);
  const research = p.class !== "PUBLIC";
  /* F05: a public record split from a wider ledger says what it leaves out in this window, so the denominator reconciles. */
  const left = siblings.map((x) => ({ x, n: graded(countsIn(x, w, today)) })).filter((x) => x.n > 0);
  return (
    <li className="rounded-xl p-4 flex flex-col gap-2" style={{ background: "var(--vault-panel)", border: `1px solid ${research ? "var(--vault-border)" : "var(--vault-border-strong)"}` }}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-mute)" }}>{p.sportLabel}</span>
        {research ? <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-right" style={{ color: "var(--vault-text-mute)" }}>{p.tag ?? "not public picks"}</span> : null}
      </div>
      <h3 className="m-0 text-[15px] font-semibold" style={{ color: "var(--vault-text)" }}>{p.label}</h3>
      {c == null ? (
        <p className="m-0 text-[13px]" style={{ color: "var(--vault-text-mute)" }}>No season window for this record.</p>
      ) : c.decisive + c.push + c.void === 0 ? (
        <p className="m-0 text-[13px]" style={{ color: "var(--vault-text-mute)" }}>Nothing graded in this window.</p>
      ) : (
        <>
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className={research ? "text-[20px] font-bold" : "text-[26px] font-bold"} style={{ color: "var(--vault-text)" }}>{record(c)}</span>
            {pct(c.hitRate) ? <span className="text-[15px]" style={{ color: "var(--vault-text-mute)" }}>{pct(c.hitRate)} of {c.decisive.toLocaleString("en-US")} decided</span> : null}
          </div>
          <span className="text-[12px]" style={{ color: "var(--vault-text-mute)" }}>
            {c.push ? `${c.push} push · ` : ""}{c.void ? `${c.void.toLocaleString("en-US")} void · ` : ""}{w === "season" && p.seasonLabel ? p.seasonLabel : WINDOWS.find((x) => x.key === w)!.label}
          </span>
          {pct(c.hitRate) && sampleCaveat(c.decisive) ? (
            <span className="text-[12px]" style={{ color: "var(--vault-text-mute)" }}>{sampleCaveat(c.decisive)}</span>
          ) : null}
        </>
      )}
      {left.length ? (
        <p className="m-0 text-[12px] leading-snug" style={{ color: "var(--vault-text-mute)" }} data-excluded>
          Not counted here, graded separately below: {left.map(({ x, n }) => `${n.toLocaleString("en-US")} ${x.tag ?? x.label}`).join(" · ")}.
        </p>
      ) : null}
      {p.note ? <p className="m-0 text-[12px] leading-snug" style={{ color: "var(--vault-text-mute)" }}>{p.note}</p> : null}
      <a href={p.href} className="mt-auto text-[13px] font-medium no-underline" style={{ color: "var(--vault-text)", minHeight: 44, display: "inline-flex", alignItems: "center" }}>Every graded row →</a>
    </li>
  );
}

/** The newest days the list shows; the rest of a long window is one tap away on each day's page and the explorer. */
const DAY_LIST_MAX = 14;

function DailyTracker({ pops, today, w }: { pops: OverviewPopulation[]; today: string; w: WindowKey }) {
  /* Each population's days in the selected window, by its own season start — the same rule as its card's counts. */
  const inW = (p: OverviewPopulation, date: string) => inWindow(date, w, { today, seasonStart: p.seasonStart });
  const all = [...new Set(pops.flatMap((p) => p.days.filter((d) => inW(p, d.date)).map((d) => d.date)))].sort().reverse();
  const dates = all.slice(0, DAY_LIST_MAX);
  if (!dates.length) {
    const newest = [...new Set(pops.flatMap((p) => p.days.map((d) => d.date)))].filter((d) => d <= today).sort().at(-1) ?? null;
    return (
      <div className="flex flex-col gap-1" data-day-list-empty>
        <p className="m-0 text-[13px]" style={{ color: "var(--vault-text-mute)" }}>{w === "today" ? "Nothing graded today yet." : "No graded day in this window."}</p>
        {newest ? (
          <a href={surfaceHref("results", { date: newest }) ?? "/results/"} className="text-[13px] font-medium no-underline" style={{ color: "var(--vault-text)", minHeight: 44, display: "inline-flex", alignItems: "center" }}>
            The newest graded day is {etDayLabel(newest)} →
          </a>
        ) : null}
      </div>
    );
  }
  return (
    <>
    {all.length > dates.length ? (
      <p className="m-0 mb-2 text-[12.5px]" style={{ color: "var(--vault-text-mute)" }}>The newest {dates.length} of {all.length} graded days in this window.</p>
    ) : null}
    <ul className="m-0 p-0 list-none flex flex-col gap-2" data-day-list>
      {dates.map((date) => {
        const rows = pops.map((p) => ({ p, d: inW(p, date) ? p.days.find((x) => x.date === date) : undefined })).filter((x) => x.d);
        const pub = rows.filter((x) => x.p.class === "PUBLIC");
        return (
          <li key={date} data-date={date} className="rounded-lg" style={{ background: "var(--vault-wash-faint)", border: "1px solid var(--vault-border)" }}>
            <details>
              <summary className="cursor-pointer list-none flex flex-wrap items-baseline gap-x-4 gap-y-1 px-3 py-2.5" style={{ minHeight: 44 }}>
                <span className="font-mono text-[12.5px] font-semibold" style={{ color: "var(--vault-text)", minWidth: 92 }}><span aria-hidden>▸ </span>{etDayLabel(date)}</span>
                {pub.length ? pub.map(({ p, d }) => (
                  <span key={p.id} className="text-[12.5px]" style={{ color: "var(--vault-text-mute)" }}>{p.sportLabel} <strong style={{ color: "var(--vault-text)" }}>{d!.won}–{d!.lost}</strong>{d!.push ? `–${d!.push}` : ""}</span>
                )) : <span className="text-[12.5px]" style={{ color: "var(--vault-text-mute)" }}>No public forecast graded</span>}
              </summary>
              <div className="px-3 pb-3">
                <table className="w-full text-[12.5px] border-collapse">
                  <thead><tr style={{ color: "var(--vault-text-mute)" }}><th scope="col" className="text-left font-medium py-1">Record</th><th scope="col" className="text-right font-medium py-1">Won</th><th scope="col" className="text-right font-medium py-1">Lost</th><th scope="col" className="text-right font-medium py-1">Push</th><th scope="col" className="text-right font-medium py-1">Void</th></tr></thead>
                  <tbody>
                    {rows.map(({ p, d }) => (
                      <tr key={p.id} style={{ borderTop: "1px solid var(--vault-border)", color: p.class !== "PUBLIC" ? "var(--vault-text-mute)" : "var(--vault-text)" }}>
                        <td className="py-1.5">{p.label}{p.class !== "PUBLIC" && p.tag && !p.label.includes(p.tag) ? ` · ${p.tag}` : ""}</td>
                        <td className="py-1.5 text-right">{d!.won}</td><td className="py-1.5 text-right">{d!.lost}</td><td className="py-1.5 text-right">{d!.push}</td><td className="py-1.5 text-right">{d!.void}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <a href={surfaceHref("results", { date }) ?? "/results/"} className="text-[13px] font-medium no-underline" style={{ color: "var(--vault-text)", minHeight: 44, display: "inline-flex", alignItems: "center" }}>Game by game for {etDayLabel(date)} →</a>
              </div>
            </details>
          </li>
        );
      })}
    </ul>
    </>
  );
}

export default function ResultsOverview({ populations, products, seedToday, initialWindow = "d7" }: { populations: OverviewPopulation[]; products: OverviewProduct[]; seedToday: string; initialWindow?: WindowKey }) {
  const today = useReaderEtDate(seedToday);
  const [w, setW] = useState<WindowKey>(initialWindow);
  /* GTP-13 follow-up: arrow keys / Home / End and one tab stop (shared hook). UXR1-13: the window-dependent records
     (public forecasts, products, research) sit in ONE tabpanel named by the selected tab — the single-panel shape
     the MLB game report and /live already use — so every tab carries aria-controls like the rest of the site.
     F06: the day-by-day list is window-dependent too, so it sits inside that panel. */
  const windowTabs = useRovingTabs<WindowKey>({ keys: WINDOWS.map((x) => x.key), active: w, onChange: setW, idBase: useId().replace(/:/g, "") });
  const pub = populations.filter((p) => p.class === "PUBLIC");
  const research = populations.filter((p) => p.class === "RESEARCH");
  const unknown = populations.filter((p) => p.class === "UNKNOWN");
  const siblingsOf = (p: OverviewPopulation) => (p.group ? populations.filter((x) => x.group === p.group && x.id !== p.id) : []);
  const windowLabel = WINDOWS.find((x) => x.key === w)!.label;
  return (
    <section aria-labelledby="results-overview-h" className="flex flex-col gap-5 mb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="results-overview-h" className="m-0 font-display text-[22px]" style={{ color: "var(--vault-text)" }}>How GameTimePicks did</h2>
        <div {...windowTabs.listProps} aria-label="Window" className="flex flex-wrap gap-1.5">
          {WINDOWS.map((x) => (
            <button key={x.key} {...windowTabs.tabProps(x.key)}
              className="rounded-full px-3.5 font-mono text-[11.5px] uppercase tracking-[0.1em]"
              style={{ minHeight: 44, color: w === x.key ? "var(--vault-bg)" : "var(--vault-text-mute)", background: w === x.key ? "var(--vault-text)" : "transparent", border: `1px solid ${w === x.key ? "var(--vault-text)" : "var(--vault-border)"}` }}>
              {x.label}
            </button>
          ))}
        </div>
      </div>
      <p className="m-0 text-[13px] leading-relaxed" style={{ color: "var(--vault-text-mute)", maxWidth: 720 }}>
        Every record is graded against official results and kept separate — a game call, a fight pick and a match
        forecast are different questions, so they are never added into one percentage. Pushes and voids are never
        losses. Windows use your day ({etDayLabel(today)}).
      </p>

      <div {...windowTabs.panelProps(w)} className="flex flex-col gap-5">
      <div>
        <h3 className="m-0 mb-2 font-mono text-[11px] uppercase tracking-[0.14em]" style={{ color: "var(--vault-text-mute)" }}>Public forecasts</h3>
        <ul className="m-0 p-0 list-none grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {pub.map((p) => <PopulationCard key={p.id} p={p} w={w} today={today} siblings={siblingsOf(p)} />)}
        </ul>
      </div>

      <div>
        <h3 className="m-0 mb-2 font-mono text-[11px] uppercase tracking-[0.14em]" style={{ color: "var(--vault-text-mute)" }}>Products · each its own record, all time</h3>
        <ul className="m-0 p-0 list-none grid grid-cols-1 sm:grid-cols-3 gap-3">
          {products.map((x) => (
            <li key={x.id} className="rounded-xl p-4 flex flex-col gap-1.5" style={{ background: "var(--vault-panel)", border: "1px solid var(--vault-border-strong)" }}>
              <h4 className="m-0 text-[15px] font-semibold" style={{ color: "var(--vault-text)" }}>{x.label}</h4>
              {x.recordLabel ? <span className="text-[22px] font-bold" style={{ color: "var(--vault-text)" }}>{x.recordLabel}</span> : <span className="text-[13px]" style={{ color: "var(--vault-text-mute)" }}>No settled record yet</span>}
              {x.pendingLabel ? <span className="text-[12px]" style={{ color: "var(--vault-text-mute)" }}>{x.pendingLabel}</span> : null}
              {x.window ? <span className="text-[12px]" style={{ color: "var(--vault-text-mute)" }}>{x.window}</span> : null}
              <p className="m-0 text-[12px] leading-snug" style={{ color: "var(--vault-text-mute)" }}>{x.note}</p>
              <a href={x.href} className="mt-auto text-[13px] font-medium no-underline" style={{ color: "var(--vault-text)", minHeight: 44, display: "inline-flex", alignItems: "center" }}>Open →</a>
            </li>
          ))}
        </ul>
      </div>

      {research.length ? (
        <div className="rounded-xl p-4" style={{ border: "1px dashed var(--vault-border)" }}>
          <h3 className="m-0 mb-1 font-mono text-[11px] uppercase tracking-[0.14em]" style={{ color: "var(--vault-text-mute)" }}>Research / paused · graded, not public picks</h3>
          <p className="m-0 mb-3 text-[12.5px] leading-snug" style={{ color: "var(--vault-text-mute)" }}>Graded for transparency and model development. None of these was a published pick when the game started, so none is counted in the public records above.</p>
          <ul className="m-0 p-0 list-none grid grid-cols-1 sm:grid-cols-2 gap-3">
            {research.map((p) => <PopulationCard key={p.id} p={p} w={w} today={today} />)}
          </ul>
        </div>
      ) : null}

      {unknown.length ? (
        <div className="rounded-xl p-4" style={{ border: "1px dashed var(--vault-border)" }}>
          <h3 className="m-0 mb-1 font-mono text-[11px] uppercase tracking-[0.14em]" style={{ color: "var(--vault-text-mute)" }}>Publication status unknown (legacy)</h3>
          <p className="m-0 mb-3 text-[12.5px] leading-snug" style={{ color: "var(--vault-text-mute)" }}>Graded, but the evidence cannot show whether these were public picks when the game started. They stay on the record, counted in neither block above.</p>
          <ul className="m-0 p-0 list-none grid grid-cols-1 sm:grid-cols-2 gap-3">
            {unknown.map((p) => <PopulationCard key={p.id} p={p} w={w} today={today} />)}
          </ul>
        </div>
      ) : null}

      <div>
        <h3 className="m-0 mb-2 font-display text-[17px]" style={{ color: "var(--vault-text)" }}>Day by day · {windowLabel}</h3>
        <DailyTracker pops={populations} today={today} w={w} />
      </div>
      </div>
    </section>
  );
}
