/**
 * RESULTS V2 · ONE DAY, GAME BY GAME (B-3). Server component — every row comes from lib/results/v2/day.ts,
 * which reads the canonical owners. Nothing is graded, re-graded or recomputed here.
 *
 * - One section per sport, each with its OWN day record — never a combined percentage across sports.
 * - Inside a sport: one card per game, fight or match — the final, then each graded call with its outcome.
 * - NFL player ranges are a COVERAGE record ("the final landed inside the printed range"), never a W–L.
 * - MLB player-prop leans are model research / market context: each game links to its leans in the page's
 *   research section rather than repeating them.
 * - A row the owner has not graded reads "Not graded" — never a loss.
 */
import type { DayCall, DayEvent, DayRange } from "@/lib/results/v2/day";

type Sport = DayEvent["sport"];
const SPORTS: Array<{ id: Sport; label: string; unit: string; href: string }> = [
  { id: "mlb", label: "MLB", unit: "game call", href: "/results/picks/mlb/" },
  { id: "nfl", label: "NFL", unit: "game winner", href: "/results/picks/nfl/" },
  { id: "epl", label: "Premier League", unit: "match result", href: "/results/picks/epl/" },
  { id: "ufc", label: "UFC", unit: "fight winner", href: "/results/picks/ufc/" },
];
const OUTCOME_WORD: Record<string, string> = { WIN: "Win", LOSS: "Loss", PUSH: "Push", VOID: "Void" };

function tally(rows: Array<{ outcome: DayCall["outcome"] }>) {
  const c = { won: 0, lost: 0, push: 0, void: 0 };
  for (const r of rows) {
    if (r.outcome === "WIN") c.won += 1;
    else if (r.outcome === "LOSS") c.lost += 1;
    else if (r.outcome === "PUSH") c.push += 1;
    else if (r.outcome === "VOID") c.void += 1;
  }
  return c;
}
const recordText = (c: ReturnType<typeof tally>) =>
  `${c.won}–${c.lost}${c.push ? `–${c.push}` : ""}${c.void ? ` · ${c.void} void` : ""}`;

function Outcome({ o }: { o: DayCall["outcome"] }) {
  return <span className={o === "WIN" ? "o w" : "o"}>{o ? OUTCOME_WORD[o] : "Not graded"}</span>;
}

function Calls({ calls }: { calls: DayCall[] }) {
  return (
    <table className="gtp-day-table" style={{ fontSize: 13 }}>
      <thead><tr><th scope="col">Call</th><th scope="col">Pick</th><th scope="col" className="r">Outcome</th></tr></thead>
      <tbody>
        {calls.map((c, i) => (
          <tr key={i}><td>{c.market}</td><td>{c.pick}{c.line && !c.pick.includes(c.line) ? ` ${c.line}` : ""}</td><td className="r"><Outcome o={c.outcome} /></td></tr>
        ))}
      </tbody>
    </table>
  );
}

function Ranges({ ranges }: { ranges: DayRange[] }) {
  const graded = ranges.filter((r) => r.inside != null);
  const inside = graded.filter((r) => r.inside).length;
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-[12.5px]" style={{ color: "var(--vault-text-mute)", minHeight: 44, display: "flex", alignItems: "center" }}>
        <span aria-hidden>▸&nbsp;</span>Player ranges · {inside} of {graded.length} finals landed inside the printed range
      </summary>
      <p className="m-0 mb-2 text-[12px] leading-snug" style={{ color: "var(--vault-text-mute)" }}>
        A coverage record, not wins and losses: a range is &ldquo;inside&rdquo; when the player&apos;s final landed within it as printed.
      </p>
      <div className="overflow-x-auto">
        <table className="gtp-day-table">
          <thead><tr><th scope="col">Player</th><th scope="col">Stat</th><th scope="col">Range</th><th scope="col">Final</th><th scope="col">Inside?</th></tr></thead>
          <tbody>
            {ranges.map((r, i) => (
              <tr key={i}>
                <td>{r.player}{r.team ? <span className="m"> · {r.team}</span> : null}</td><td>{r.family}</td><td>{r.range}</td><td>{r.actual ?? "—"}</td>
                <td>{r.inside == null ? "Not graded" : r.inside ? "Inside" : "Outside"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/** MLB prop leans are research; their full projection-vs-actual detail lives in the research section below. */
function PropsLink({ e }: { e: DayEvent }) {
  return (
    <a href={`#leans-${e.id}`} className="mt-2 text-[12.5px] no-underline" style={{ color: "var(--vault-text-mute)", minHeight: 44, display: "flex", alignItems: "center" }}>
      Player-prop leans · model research, market context · {recordText(tally(e.props))} →
    </a>
  );
}

export default function ResultsDay({ day }: { day: Record<Sport, DayEvent[]> }) {
  const present = SPORTS.filter((s) => day[s.id].length);
  return (
    <section aria-labelledby="results-day-h" className="mt-6 flex flex-col gap-6">
      <div>
        <h2 id="results-day-h" className="m-0 font-display text-[22px]" style={{ color: "var(--vault-text)" }}>Game by game</h2>
        <p className="m-0 mt-1 text-[13px] leading-relaxed" style={{ color: "var(--vault-text-mute)", maxWidth: 720 }}>
          Every forecast graded for this day against the official result, by sport and game. Each sport keeps its own
          record — they are never added into one percentage. Pushes and voids are never losses.
        </p>
      </div>
      {present.length === 0 ? (
        <p className="m-0 text-[14px]" style={{ color: "var(--vault-text-mute)" }}>No public forecast was graded on this day.</p>
      ) : (
        <nav aria-label="Sports on this day" className="flex flex-wrap gap-2">
          {present.map((s) => {
            const c = tally(day[s.id].flatMap((e) => e.calls));
            return (
              <a key={s.id} href={`#day-${s.id}`} className="rounded-full px-3.5 text-[12.5px] no-underline" style={{ minHeight: 44, display: "inline-flex", alignItems: "center", gap: 6, color: "var(--vault-text)", border: "1px solid var(--vault-border)" }}>
                {s.label} <strong>{recordText(c)}</strong>
              </a>
            );
          })}
        </nav>
      )}
      {present.map((s) => {
        const events = day[s.id];
        const c = tally(events.flatMap((e) => e.calls));
        return (
          <section key={s.id} id={`day-${s.id}`} aria-labelledby={`day-${s.id}-h`} className="flex flex-col gap-3" style={{ scrollMarginTop: 80 }}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 id={`day-${s.id}-h`} className="m-0 font-display text-[18px]" style={{ color: "var(--vault-text)" }}>
                {s.label} · {recordText(c)} <span className="text-[13px] font-normal" style={{ color: "var(--vault-text-mute)" }}>{s.unit}s</span>
              </h3>
              <a href={s.href} className="text-[13px] no-underline" style={{ color: "var(--vault-text)", minHeight: 44, display: "inline-flex", alignItems: "center" }}>Full {s.label} record →</a>
            </div>
            <ul className="m-0 p-0 list-none grid grid-cols-1 lg:grid-cols-2 gap-3">
              {events.map((e) => (
                <li key={e.id} className="rounded-xl p-4" style={{ background: "var(--vault-panel)", border: "1px solid var(--vault-border-strong)" }}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-2">
                    <h4 className="m-0 text-[15px] font-semibold" style={{ color: "var(--vault-text)" }}>{e.title}</h4>
                    <span className="font-mono text-[12px]" style={{ color: "var(--vault-text-mute)" }}>{e.final ? `Final · ${e.final}` : "Final score not on file"}</span>
                  </div>
                  {e.calls.length ? <Calls calls={e.calls} /> : <p className="m-0 text-[12.5px]" style={{ color: "var(--vault-text-mute)" }}>No public game call graded for this game.</p>}
                  {e.ranges.length ? <Ranges ranges={e.ranges} /> : null}
                  {e.props.length ? <PropsLink e={e} /> : null}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </section>
  );
}
