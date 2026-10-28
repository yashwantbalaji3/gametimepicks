/**
 * /games/mlb/<slug>/ after its game — THE SETTLED PAGE (independent audit 2026-10-28 F02: the shared link 404'd the next
 * morning). SERVER component, no client island, no simulation: the game report and its simulation are kept for the
 * current day only, and this page says so instead of disappearing.
 *
 * Reading order: matchup and date, the official final, the forecast of record per graded market with its result,
 * the archived-report note, links to the day's lobby and MLB results, and one collapsed "Technical details".
 * Data: lib/mlb/settled-games-data.ts (the graded record only). A missing number prints "—", never 0.
 */
import Link from "next/link";

import MoreDisclosure from "@/components/ui/more-disclosure";
import { surfaceHref } from "@/lib/nav/date-sport-route";
import { SETTLED_MARKET_WORDS, outcomeWord, type SettledMlbGame } from "@/lib/mlb/settled-games";

/** The page's own marker (the built guard finds settled pages by it). */
export const MLB_SETTLED_ATTR = "data-mlb-settled-game";
export const MLB_SETTLED_ARCHIVED_HEADING = "Game report archived";
export const MLB_RESULTS_HREF = "/results/mlb/";

const dayLabel = (d: string) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).format(new Date(`${d}T12:00:00Z`));
const et = (iso: string | null | undefined) => {
  const t = Date.parse(String(iso ?? ""));
  return Number.isFinite(t) ? new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(t)) + " ET" : "—";
};
const pct = (p: number | null) => (typeof p === "number" && Number.isFinite(p) ? `${(p * 100).toFixed(1)}%` : "—");

export default function MlbSettledGame({ game: g, names }: { game: SettledMlbGame; names: { away: string; home: string } }) {
  const right = g.calls.filter((c) => c.outcome === "WIN").length;
  const decided = g.calls.filter((c) => c.outcome === "WIN" || c.outcome === "LOSS").length;
  const attrs = { [MLB_SETTLED_ATTR]: g.slug };
  // the archived lobby for the game's date, through the one date-url owner
  const dayHref = surfaceHref("simulate", { date: g.date }) ?? "/simulate/";
  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-8" {...attrs}>
      <nav aria-label="This game" className="flex flex-wrap gap-x-4 gap-y-1 text-[14px]">
        <Link href="/mlb/" className="gtp-backlink gtp-hit-44 inline-flex items-center" style={{ color: "var(--vault-accent)" }}>← MLB hub</Link>
        <Link href={dayHref} prefetch={false} className="gtp-hit-44 inline-flex items-center" style={{ color: "var(--vault-accent)" }}>Games · {dayLabel(g.date)}</Link>
        <Link href={MLB_RESULTS_HREF} prefetch={false} className="gtp-hit-44 inline-flex items-center" style={{ color: "var(--vault-accent)" }}>MLB results</Link>
      </nav>

      <header className="flex flex-col gap-1">
        <p className="m-0 text-[13px]" style={{ color: "var(--vault-text-mute)" }}>MLB · {dayLabel(g.date)} · first pitch {et(g.firstPitchUtc)}</p>
        <h1 className="m-0 font-display text-[24px] font-extrabold" style={{ color: "var(--vault-text)" }}>{names.away} at {names.home}</h1>
        <p className="m-0 text-[16px] font-semibold" style={{ color: "var(--vault-text)" }} data-settled-final={g.final ? `${g.final.away}-${g.final.home}` : "none"}>
          {g.final ? <>Final: {g.away} {g.final.away} – {g.final.home} {g.home}</> : "No official final recorded yet."}
        </p>
        {decided ? <p className="m-0 text-[14px]" style={{ color: "var(--vault-text-mute)" }}>The forecast of record was right on {right} of {decided} graded market{decided === 1 ? "" : "s"}.</p> : null}
      </header>

      <section aria-labelledby="mlb-settled-forecast-h" className="flex flex-col gap-2">
        <p className="m-0 text-[12px] uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)" }}>Official Forecast · frozen {et(g.frozenAt)}, before first pitch · shown as recorded</p>
        <h2 id="mlb-settled-forecast-h" className="m-0 font-display text-[18px] font-bold" style={{ color: "var(--vault-text)" }}>The forecast and how it did</h2>
        <div role="region" aria-label="Forecast of record by market" tabIndex={0} style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 360 }}>
            <thead>
              <tr>{["Market", "Call", "Model probability", "Result"].map((h) => <th key={h} scope="col" className="text-left text-[13px] font-semibold" style={{ padding: "8px 10px 8px 0", color: "var(--vault-text-mute)", borderBottom: "1px solid var(--vault-border)" }}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {g.calls.map((c) => (
                <tr key={c.market} data-settled-call={c.market}>
                  <th scope="row" className="text-left text-[14px] font-medium" style={{ padding: "10px 10px 10px 0", color: "var(--vault-text)" }}>{SETTLED_MARKET_WORDS[c.market]}</th>
                  <td className="text-[14px]" style={{ padding: "10px 10px 10px 0", color: "var(--vault-text)" }}>{c.pick}</td>
                  <td className="text-[14px] tabular-nums" style={{ padding: "10px 10px 10px 0", color: "var(--vault-text)" }}>{pct(c.modelProbability)}</td>
                  <td className="text-[14px] font-semibold" style={{ padding: "10px 0", color: c.outcome === "WIN" ? "var(--vault-success)" : c.outcome === "LOSS" ? "var(--vault-danger)" : "var(--vault-text-mute)" }}>{outcomeWord(c.outcome)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="m-0 text-[13px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>
          Each call is the model&rsquo;s own probability for the side it picked, frozen before first pitch and graded against the official final.
          It is not a betting recommendation and says nothing about value against a sportsbook price.
        </p>
      </section>

      <section aria-labelledby="mlb-settled-archived-h" className="flex flex-col gap-2">
        <h2 id="mlb-settled-archived-h" className="m-0 font-display text-[16px] font-bold" style={{ color: "var(--vault-text)" }}>{MLB_SETTLED_ARCHIVED_HEADING}</h2>
        <p className="m-0 text-[14px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>
          The full game report and its simulation are shown on game day only. This page keeps the link working with the forecast of record and
          its result; the full season record is on MLB results.
        </p>
        <p className="m-0 flex flex-wrap gap-2">
          <Link href={MLB_RESULTS_HREF} prefetch={false} className="gtp-hit-44 inline-flex items-center rounded-full px-4 no-underline" style={{ border: "1px solid var(--vault-border)", color: "var(--vault-text)" }}>MLB results →</Link>
          <Link href={dayHref} prefetch={false} className="gtp-hit-44 inline-flex items-center rounded-full px-4 no-underline" style={{ border: "1px solid var(--vault-border)", color: "var(--vault-text)" }}>All games · {dayLabel(g.date)} →</Link>
        </p>
      </section>

      <MoreDisclosure title="Technical details" summary="Where the forecast of record and the grade come from">
        <dl className="m-0 grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 text-[13px]" style={{ color: "var(--vault-text-mute)" }}>
          <dt>Game id</dt><dd className="m-0">{g.gamePk}</dd>
          <dt>Forecast frozen</dt><dd className="m-0">{g.frozenAt}</dd>
          <dt>First pitch</dt><dd className="m-0">{g.firstPitchUtc}</dd>
          <dt>Snapshot</dt><dd className="m-0">{g.source ?? "—"}</dd>
          <dt>Graded</dt><dd className="m-0">{g.gradedAt ?? "—"}</dd>
        </dl>
      </MoreDisclosure>
    </article>
  );
}
