/**
 * RESULTS V2 · FROZEN DAILY TOP-5 BOARDS (B-4b). Server component over lib/results/v2/top-boards.ts.
 *
 * - The board is shown exactly as frozen (rank, projection, line), with its publication time — never re-ranked.
 * - Each row's result is the settlement owner's word; PENDING and NOT_GRADED are said, never counted as misses.
 * - Recent form is labelled as the PLAYER's history on our boards, with its denominator — context, not a
 *   selection rule and never GameTimePicks' record.
 * - Sports that cannot have a board say why, instead of rendering an empty board.
 */
import type { BoardRowView, DayBoards, SportWithoutBoard } from "@/lib/results/v2/top-boards";

const RESULT_WORD: Record<BoardRowView["result"]["state"], string> = {
  PENDING: "Not final yet", NOT_GRADED: "Not in the graded record", VOID: "Void · did not play",
  INSIDE: "Inside the range", OUTSIDE: "Outside the range", SCORED: "Scored", DID_NOT_SCORE: "Did not score",
};
const UNIT: Record<string, string> = { player_rush_yds: "yds", player_reception_yds: "yds", player_pass_yds: "yds", player_receptions: "rec" };
const etTime = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(t)) + " ET" : "—";
};

function projectionText(r: BoardRowView, family: string) {
  if ("probability" in r.projection) return `${Math.round(r.projection.probability * 1000) / 10}% to score`;
  const p = r.projection;
  return `${p.median} ${UNIT[family] ?? ""}${p.p10 != null && p.p90 != null ? ` (${p.p10}–${p.p90})` : ""}`;
}

function formText(r: BoardRowView, family: string) {
  const f = r.form;
  if (!f) return "No earlier 2026 game on our boards";
  if ("scored" in f) return `Scored in ${f.scored} of his last ${f.played} game${f.played === 1 ? "" : "s"} on our boards`;
  const vals = f.values.join(" · ");
  const line = f.aboveLine != null && r.line != null ? ` — above ${r.line} in ${f.aboveLine} of ${f.played}` : "";
  return `Last ${f.played} game${f.played === 1 ? "" : "s"} on our boards: ${vals} ${UNIT[family] ?? ""}${line}`;
}

export default function TopBoards({ day, without, dayLabel }: { day: DayBoards | null; without: SportWithoutBoard[]; dayLabel: string }) {
  return (
    <section aria-labelledby="top-boards-h" className="mt-10 flex flex-col gap-4">
      <div>
        <h2 id="top-boards-h" className="m-0 font-display text-[22px]" style={{ color: "var(--vault-text)" }}>Daily Top 5 · frozen before kickoff</h2>
        <p className="m-0 mt-1 text-[13px] leading-relaxed" style={{ color: "var(--vault-text-mute)", maxWidth: 720 }}>
          Each board is published once, before the day&apos;s first kickoff, from public model families only — never chosen
          after the results, never revised. A board shows fewer than five when fewer players qualify.
        </p>
      </div>
      {day == null ? (
        <p className="m-0 text-[14px]" style={{ color: "var(--vault-text-mute)" }}>No qualifying board was frozen for {dayLabel}.</p>
      ) : (
        <>
          <p className="m-0 font-mono text-[12px]" style={{ color: "var(--vault-text-mute)" }}>Published {etTime(day.publishedAt)} · first kickoff {etTime(day.firstKickoffUtc)}</p>
          {day.boards.length === 0 ? <p className="m-0 text-[14px]" style={{ color: "var(--vault-text-mute)" }}>No qualifying board today — no public family was published for this day&apos;s games.</p> : null}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {day.boards.map((b) => (
              <article key={b.propFamily} className="rounded-xl p-4" style={{ background: "var(--vault-panel)", border: "1px solid var(--vault-border-strong)" }}>
                <h3 className="m-0 mb-2 text-[15px] font-semibold" style={{ color: "var(--vault-text)" }}>NFL · {b.label} <span className="font-normal text-[12.5px]" style={{ color: "var(--vault-text-mute)" }}>· top {b.rows.length}</span></h3>
                {b.rows.length === 0 ? <p className="m-0 text-[13px]" style={{ color: "var(--vault-text-mute)" }}>No player qualified.</p> : (
                  <ol className="m-0 p-0 list-none flex flex-col">
                    {b.rows.map((r) => (
                      <li key={r.forecastId} className="py-2.5" style={{ borderTop: "1px solid var(--vault-border)" }}>
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                          <span className="text-[14px]" style={{ color: "var(--vault-text)" }}>
                            <span className="font-mono" style={{ color: "var(--vault-text-mute)" }}>{r.rank}.</span> <strong>{r.name}</strong> <span style={{ color: "var(--vault-text-mute)" }}>{r.team}{r.opponent ? ` v ${r.opponent}` : ""}</span>
                          </span>
                          <span className="font-mono text-[12px] uppercase tracking-[0.06em]" style={{ color: r.result.state === "INSIDE" || r.result.state === "SCORED" ? "var(--vault-text)" : "var(--vault-text-mute)" }}>
                            {RESULT_WORD[r.result.state]}{r.result.actual != null ? ` · ${r.result.actual}` : ""}
                          </span>
                        </div>
                        <div className="text-[12.5px] mt-0.5" style={{ color: "var(--vault-text-mute)" }}>
                          Projection {projectionText(r, b.propFamily)} · {r.line != null ? `line ${r.line}` : "no book line captured"}
                        </div>
                        <div className="text-[12px] mt-0.5" style={{ color: "var(--vault-text-mute)" }}>{formText(r, b.propFamily)}</div>
                        <a href={`/nfl/game/${r.providerEventId}/`} className="text-[12.5px] no-underline" style={{ color: "var(--vault-text)", minHeight: 44, display: "inline-flex", alignItems: "center" }}>Game receipt →</a>
                      </li>
                    ))}
                  </ol>
                )}
              </article>
            ))}
          </div>
          {day.ineligible.length ? (
            <p className="m-0 text-[12.5px] leading-snug" style={{ color: "var(--vault-text-mute)" }}>
              Not eligible that day: {day.ineligible.map((x) => `${x.label ?? x.propFamily} (${x.state === "ESTIMATE" ? "estimate only" : x.state.toLowerCase()})`).join(", ")}.
            </p>
          ) : null}
        </>
      )}
      <ul className="m-0 p-0 list-none flex flex-col gap-1">
        {without.map((w) => (
          <li key={w.sport} className="text-[12.5px]" style={{ color: "var(--vault-text-mute)" }}><strong style={{ color: "var(--vault-text)" }}>{w.label}:</strong> no qualifying board — {w.reason}</li>
        ))}
      </ul>
    </section>
  );
}
