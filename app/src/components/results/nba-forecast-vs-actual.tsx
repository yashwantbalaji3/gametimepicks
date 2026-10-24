/**
 * RESULTS · NBA OFFICIAL FORECAST vs FINAL. Server component over lib/results/nba-forecast-vs-actual.mjs: the
 * published winner side, frozen before tip, against the committed official final, game by game. Pending and held
 * games are labelled, never counted as misses. Model Performance is stated as counts against the preregistered
 * minimum — no accuracy or calibration claim below it.
 */
import type { nbaForecastVsActual } from "@/lib/results/nba-forecast-vs-actual.mjs";
import { etDayLabel } from "@/lib/et-stamp.mjs";

type View = ReturnType<typeof nbaForecastVsActual>;
type Game = View["games"][number];

const ET_TIME = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
const etTime = (iso: string | null) => { const t = Date.parse(String(iso ?? "")); return Number.isFinite(t) ? `${ET_TIME.format(new Date(t))} ET` : "—"; };

const STATE_WORD: Record<string, string> = {
  MATCHED: "Side won", MISSED: "Side lost", PENDING: "Pending — no official final yet", HELD: "Held — final under review",
  NO_SIDE: "No side published", NOT_BEFORE_TIP: "Not compared — no record it was published before tip",
};

function Row({ g }: { g: Game }) {
  return (
    <tr style={{ borderTop: "1px solid var(--vault-border)", color: "var(--vault-text)" }} data-game={g.providerEventId} data-state={g.state}>
      <th scope="row" className="text-left font-normal py-1.5 pr-2">{g.away} @ {g.home}<span className="block text-[11.5px]" style={{ color: "var(--vault-text-faint)" }}>tip {etTime(g.tipUtc)}</span></th>
      <td className="py-1.5 px-1.5">{g.side ?? "—"}<span className="block text-[11.5px]" style={{ color: "var(--vault-text-faint)" }}>frozen {etTime(g.frozenAt)}</span></td>
      <td className="py-1.5 px-1.5">{g.final ? `${g.away} ${g.final.away} – ${g.final.home} ${g.home}` : "—"}</td>
      <td className="py-1.5 pl-1.5 text-[12px]" style={{ color: g.state === "MATCHED" ? "var(--vault-success)" : g.state === "MISSED" ? "var(--vault-text)" : "var(--vault-text-mute)" }}>{STATE_WORD[g.state] ?? g.state}</td>
    </tr>
  );
}

export default function NbaForecastVsActual({ view }: { view: View }) {
  const c = view.counts;
  const dates = [...new Set(view.games.map((g) => g.date))].sort().reverse();
  return (
    <section id="official-forecast" aria-labelledby="nba-ofa-h" className="mb-8 rounded-xl p-4 flex flex-col gap-3" style={{ border: "1px solid var(--vault-border-strong)", scrollMarginTop: 80 }}>
      <div className="flex flex-col gap-1">
        <h2 id="nba-ofa-h" className="m-0 font-display text-[20px]" style={{ color: "var(--vault-text)" }}>2026-27 · Official Forecast vs final</h2>
        <p className="m-0 text-[13px] leading-relaxed" style={{ color: "var(--vault-text-mute)", maxWidth: 720 }}>
          Each game&apos;s official winner side as it was frozen before tip, against the official final. A game with no
          final yet is pending and a disputed final is held — neither is ever counted as a miss. The model&apos;s NBA
          single picks are graded in the <a href="/results/#model-suggestions" className="underline" style={{ color: "var(--vault-text)" }}>model suggestions record</a>.
        </p>
      </div>
      {c.games === 0 ? (
        <p className="m-0 text-[13px]" style={{ color: "var(--vault-text-mute)" }}>No official NBA forecast has been published this season yet.</p>
      ) : (
        <>
          <p className="m-0 text-[13.5px] leading-relaxed" style={{ color: "var(--vault-text)" }} data-model-performance>
            <strong>Model Performance:</strong> the official side won {c.matched} and lost {c.missed} of {c.graded} decided {c.graded === 1 ? "game" : "games"}
            {c.pending ? ` · ${c.pending} pending` : ""}{c.held ? ` · ${c.held} held` : ""}{c.notBeforeTip ? ` · ${c.notBeforeTip} not compared` : ""}.
          </p>
          <p className="m-0 text-[12px] leading-snug" style={{ color: "var(--vault-text-mute)" }}>
            {view.belowMinimum
              ? `Counts, not an accuracy claim: the preregistered minimum before any judgment of the winner side is ${view.minGraded} graded games, and this is ${c.graded}. No win probability is published and no calibration is claimed.`
              : `The preregistered minimum of ${view.minGraded} graded games is met. Any accuracy judgment follows the preregistered bars and a founder-approved decision; none is claimed here, and no calibration is claimed.`}
          </p>
          <div className="flex flex-col gap-2">
            {dates.map((d, i) => {
              const gs = view.games.filter((g) => g.date === d);
              const m = gs.filter((g) => g.state === "MATCHED").length, x = gs.filter((g) => g.state === "MISSED").length, p = gs.filter((g) => g.state === "PENDING").length;
              return (
                <details key={d} open={i === 0} className="rounded-lg" style={{ border: "1px solid var(--vault-border)" }} data-nba-day={d}>
                  <summary className="cursor-pointer px-3 py-2.5 text-[13px] font-medium" style={{ color: "var(--vault-text)", minHeight: 44, display: "flex", alignItems: "center" }}>
                    <span aria-hidden>▸&nbsp;</span>{etDayLabel(d)} · {gs.length} {gs.length === 1 ? "game" : "games"} · side won {m}, lost {x}{p ? `, ${p} pending` : ""}
                  </summary>
                  <div className="overflow-x-auto px-3 pb-3">
                    <table className="w-full text-[12.5px] border-collapse" style={{ minWidth: 480 }}>
                      <caption className="sr-only">Official winner side vs final, {etDayLabel(d)}</caption>
                      <thead><tr style={{ color: "var(--vault-text-mute)" }}>
                        <th scope="col" className="text-left font-medium py-1.5 pr-2">Game</th><th scope="col" className="text-left font-medium py-1.5 px-1.5">Official side</th>
                        <th scope="col" className="text-left font-medium py-1.5 px-1.5">Final</th><th scope="col" className="text-left font-medium py-1.5 pl-1.5">Result</th>
                      </tr></thead>
                      <tbody>{gs.map((g) => <Row key={g.providerEventId} g={g} />)}</tbody>
                    </table>
                  </div>
                </details>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
