/**
 * NBA DAILY TOP BOARDS — the /nba/projections section (§13 amendment B, founder 2026-10-29 + 2026-10-30). SERVER
 * component: no client JavaScript, no file read, no odds or line module. It renders exactly what `gateLaneTopBoards`
 * (lib/sports/nba/lane-top-boards.mjs) hands it:
 *
 *   PUBLISHED    one board per statistic (points, rebounds, assists, threes made, PRA, P+R, P+A): rank, player, team,
 *                game, the lane's projected median in its own display digits (laneDisplay — the digits the table above
 *                prints), the board's ranking-method sentence and the snapshot time. Never a line, a price, a side, an
 *                edge or a probability: the median is the middle of the simulated range, not a chance to go over a line.
 *   UNAVAILABLE  one sentence for the whole section (provenance or cross-page check failed, or every game had tipped
 *                off at build) — never a partial board.
 *
 * Layout: one compact table per board in a 1 → 2 → 3 column grid (390 px phone: one column, five short columns that fit
 * without sideways scrolling). One class string per table (page weight: the markup is emitted in the HTML and again in
 * the RSC payload). Each table has a caption (the board title) and row headers (the player).
 */
import React from "react";

import { laneDisplay } from "@/lib/sports/nba/lane-top-boards.mjs";

type Row = { rank: number; providerEventId: string; providerAthleteId: string; name: string; team: string | null; matchup: string; value: number };
type Board = { key: string; title: string; methodText: string; state: "RANKED" | "UNAVAILABLE"; text?: string; rows: Row[] };
export type LaneTopBoardsGate =
  | { state: "PUBLISHED"; doc: { date: string; builtAt: string; source: { laneGeneratedAt: string | null }; scope: { eventsIncluded: number; eventsStarted: string[] }; boards: Board[] } }
  | { state: "UNAVAILABLE"; reason: string; text: string; problems: string[] };

const et = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso)) + " ET";
const MUTE = { color: "var(--vault-text-mute)" };
const TEXT = { color: "var(--vault-text)" };
/* ONE class string for all seven boards, on their grid (descendant variants): per-table or per-cell classes would be
   repeated 7× / 35× in the HTML and again in the RSC payload. */
const GRID = "grid gap-4 md:grid-cols-2 xl:grid-cols-3 min-w-0 [&>section]:min-w-0 [&>section]:rounded-lg [&>section]:p-3 [&>section]:border [&>section]:border-[var(--vault-border)] [&_table]:w-full [&_table]:text-[13px] [&_table]:tabular-nums [&_caption]:text-left [&_caption]:font-semibold [&_caption]:pb-1 [&_th]:font-medium [&_th]:text-left [&_td]:text-left [&_td]:px-1 [&_th]:px-1 [&_td]:py-1 [&_th]:py-1 [&_thead_th]:text-[11px] [&_tbody_th]:font-normal [&_td:last-child]:text-right [&_th:last-child]:text-right [&_tbody_tr]:border-t [&_tbody_tr]:border-[var(--vault-border)] [&_thead]:text-[var(--vault-text-mute)] [&_tbody]:text-[var(--vault-text)] [&_caption]:text-[var(--vault-text)]";

export default function NbaLaneTopBoards({ gate }: { gate: LaneTopBoardsGate | null }) {
  if (!gate) return null;
  if (gate.state !== "PUBLISHED") {
    return (
      <section aria-labelledby="nba-top-boards-h" data-nba-top-boards="UNAVAILABLE" className="flex flex-col gap-2">
        <h2 id="nba-top-boards-h" className="m-0 font-display text-[17px] font-bold" style={TEXT}>Top Boards</h2>
        <p className="m-0 text-[13px] leading-relaxed" style={MUTE} role="status" data-reason={gate.reason}>{gate.text}</p>
      </section>
    );
  }
  const { doc } = gate;
  const snapshot = doc.source.laneGeneratedAt ? et(doc.source.laneGeneratedAt) : null;
  return (
    <section aria-labelledby="nba-top-boards-h" data-nba-top-boards="PUBLISHED" className="flex flex-col gap-3">
      <h2 id="nba-top-boards-h" className="m-0 font-display text-[17px] font-bold" style={TEXT}>Top Boards</h2>
      <p className="m-0 text-[12.5px] leading-relaxed" style={MUTE}>
        The highest Official Forecast player medians among games that had not tipped off when this page was built
        ({et(doc.builtAt)}){doc.scope.eventsStarted.length ? `; ${doc.scope.eventsStarted.length} game${doc.scope.eventsStarted.length === 1 ? "" : "s"} already under way ${doc.scope.eventsStarted.length === 1 ? "is" : "are"} left out` : ""}.
        Each figure is the same number the table above shows. A median is the middle of the simulated range &mdash; not a
        chance to go over any line, and not a betting recommendation. Players with an injury designation are not ranked.
      </p>
      <div className={GRID}>
        {doc.boards.map((b) => (
          <section key={b.key} data-nba-top-board={b.key}>
            {b.state === "RANKED" ? (
              <table>
                <caption>{b.title}</caption>
                <thead><tr><th scope="col" aria-label="Rank">#</th><th scope="col">Player</th><th scope="col">Team</th><th scope="col">Game</th><th scope="col">Median</th></tr></thead>
                <tbody>
                  {b.rows.map((r) => (
                    <tr key={r.providerAthleteId}><td>{r.rank}</td><th scope="row">{r.name}</th><td>{r.team ?? "—"}</td><td>{r.matchup}</td><td>{laneDisplay(r.value)}</td></tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <>
                <h3 className="m-0 text-[13px] font-semibold" style={TEXT}>{b.title}</h3>
                <p className="m-0 mt-1 text-[12.5px]" style={MUTE} role="status">{b.text}</p>
              </>
            )}
            <p className="m-0 mt-2 text-[11.5px] leading-snug" style={MUTE}>{b.methodText}{snapshot ? ` Snapshot ${snapshot}.` : ""}</p>
          </section>
        ))}
      </div>
    </section>
  );
}
