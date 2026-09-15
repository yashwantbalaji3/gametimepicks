/**
 * /results/nfl — every NFL prediction we published for a week, graded against the official box score (P296).
 *
 * The founder asked for a thorough reconciliation readers can see: each team and player prediction, hit or
 * miss, with a success rate per prop and overall. We publish ranges rather than over/under calls, so the
 * page leads with what a "hit" means before it shows a single percentage — a rookie reading "85%" needs to
 * know that about 80% is the design target for a range, and that a higher number is not simply better.
 *
 * Everything renders from the week's reconciliation artifact (scripts/nfl/build-nfl-week-reconciliation.mjs).
 * Nothing is computed here, so this page and the card on /results cannot disagree.
 *
 * WEIGHT: a week carries ~400 player rows and ~170 touchdown chances, and the server tree ships twice (HTML +
 * flight data). Styling therefore lives in ONE stylesheet below, keyed by short class names — the first build
 * with a style object per cell measured 1,160KB, most of it the same few declarations repeated per cell.
 */
import Link from "next/link";
import path from "node:path";
import { archivedEventIds } from "@/lib/sports/nfl/archived-forecast";
import SectionHeader from "@/components/section-header";
import { withRouteMetadata } from "@/lib/seo/route-metadata";
import { readNflWeekReports, pct, unitFigure, type Outcome, type WeekGame } from "@/lib/sports/nfl/week-report-data";

export const metadata = withRouteMetadata("/results/nfl/", {
  title: "NFL Week Report — Every Prediction Graded · GameTime Picks",
  description: "Every NFL team and player prediction we published for the week, checked against the official box score: hits, misses and success rates.",
});

const CSS = `
.wr table{width:100%;border-collapse:collapse}
.wr th{text-align:left;padding:7px 9px;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--vault-text-faint)}
.wr td{padding:7px 9px;border-top:1px solid var(--vault-border);font-size:12.5px;vertical-align:top}
.wr .m{color:var(--vault-text-mute)}
.wr .f{color:var(--vault-text-faint);font-size:11px}
.wr .k{font-family:var(--font-mono,ui-monospace,monospace);font-size:11.5px}
.wr .h{color:var(--vault-success)}
.wr .x{color:var(--vault-warn)}
.wr .v{color:var(--vault-text-faint)}
.wr .nw{white-space:nowrap}
.wr .scroll{overflow-x:auto;margin-top:10px}
.wr details{border-top:1px solid var(--vault-border);padding:8px 0}
.wr summary{cursor:pointer;font-size:13px;min-height:32px;color:var(--vault-text)}
.wr .note{margin:10px 0 0;max-width:760px;font-size:12.5px;line-height:1.65;color:var(--vault-text-mute)}
`;

const PROP_MEANING: Record<string, string> = {
  winner: "The team we gave the better win chance won.",
  total_range: "The final combined score landed inside our range.",
  margin_range: "The winning margin landed inside our range.",
  player_receptions: "The player's catches landed inside our range.",
  player_reception_yds: "The player's receiving yards landed inside our range.",
  player_rush_yds: "The player's rushing yards landed inside our range.",
  player_pass_yds: "The quarterback's passing yards landed inside our range.",
  likeliest_scorer: "The player we rated likeliest to score a touchdown in each game scored one.",
};
const PROP_SHORT: Record<string, string> = {
  player_receptions: "Receptions",
  player_reception_yds: "Receiving yards",
  player_rush_yds: "Rushing yards",
  player_pass_yds: "Passing yards",
};

const etKickoff = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso)) + " ET";

/** A result mark that reads without colour: a symbol and a word, coloured as a second cue. */
function Mark({ outcome }: { outcome: Outcome | "SCORED" | "DID_NOT_SCORE" | undefined }) {
  const hit = outcome === "HIT" || outcome === "SCORED";
  const miss = outcome === "MISS" || outcome === "DID_NOT_SCORE";
  const label = hit ? (outcome === "SCORED" ? "✓ Scored" : "✓ Hit") : miss ? (outcome === "DID_NOT_SCORE" ? "✗ No TD" : "✗ Miss") : outcome === "PUSH" ? "Even" : outcome === "NO_LINE" ? "No line" : "Void";
  return <span className={`k ${hit ? "h" : miss ? "x" : "v"}`}>{label}</span>;
}

function GamePlayers({ game }: { game: WeekGame }) {
  const graded = game.players.filter((p) => p.outcome !== "VOID");
  const hits = graded.filter((p) => p.outcome === "HIT").length;
  const voids = game.players.length - graded.length;
  return (
    <details>
      <summary>
        {game.away.abbr} at {game.home.abbr}
        {game.final ? <span className="k m"> · final {game.away.abbr} {game.final.away} — {game.final.home} {game.home.abbr}</span> : null}
        <span className="k f"> · players {hits}/{graded.length} in range{voids ? ` · ${voids} void` : ""}</span>
      </summary>
      {game.boardNote ? <p className="note">{game.boardNote}</p> : null}
      {game.players.length ? (
        <div className="scroll">
          <table style={{ minWidth: 560 }}>
            <thead><tr><th scope="col">Player</th><th scope="col">Prediction</th><th scope="col">Our range</th><th scope="col">Actual</th><th scope="col">Result</th></tr></thead>
            <tbody>
              {game.players.map((p, i) => (
                <tr key={i}>
                  <td>{p.name} <span className="f">{p.team}</span></td>
                  <td className="m">{PROP_SHORT[p.prop] ?? p.prop}{p.status === "ESTIMATE" ? <span className="f"> · estimate</span> : null}</td>
                  <td className="k">{p.low}–{p.high}</td>
                  <td className="k">{p.actual ?? "did not play"}</td>
                  <td><Mark outcome={p.outcome} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {game.touchdowns.length ? (
        <p className="note">
          <strong>Touchdown chances:</strong>{" "}
          {game.touchdowns.map((t, i) => (
            <span key={i}>{i ? " · " : ""}{t.likeliest ? <strong>{t.name}</strong> : t.name} {(t.probability * 100).toFixed(0)}% <Mark outcome={t.outcome} /></span>
          ))}
        </p>
      ) : null}
    </details>
  );
}

export default function NflWeekReportPage() {
  const { index, latest } = readNflWeekReports();
  /* P320: a row links to its archived pregame read only when that page is generated (the frozen revision exists). */
  const archived = new Set(archivedEventIds(path.join(process.cwd(), "public", "data")));

  if (!latest) {
    return (
      <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-14 flex flex-col gap-6">
        <h1 className="font-display m-0" style={{ color: "var(--vault-text)", fontSize: 26 }}>NFL week report</h1>
        <p style={{ color: "var(--vault-text-mute)", maxWidth: 640 }}>No NFL week has been graded yet. Reports appear here once games are final and their official box scores are in.</p>
      </div>
    );
  }

  const s = latest.summary;
  const pendingGames = latest.games.filter((g) => g.state === "PENDING");
  const team = (g: WeekGame, prop: string) => g.team.find((t) => t.prop === prop);
  const c = s.context.closerThanSportsbook;

  return (
    <div className="wr vault-page-shell px-4 sm:px-8 py-8 sm:py-14 overflow-x-hidden flex flex-col gap-10">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <header style={{ maxWidth: 760 }}>
        <div className="font-mono uppercase tracking-[0.14em]" style={{ fontSize: 11, color: "var(--sport-nfl)" }}>NFL · {latest.period.label} report</div>
        <h1 className="font-display m-0 mt-2" style={{ color: "var(--vault-text)", fontSize: 28, lineHeight: 1.2, textWrap: "balance" }}>
          {latest.period.label}: {pct(s.overall.rate)} of our predictions came true
        </h1>
        <p style={{ margin: "10px 0 0", fontSize: 14, lineHeight: 1.6, color: "var(--vault-text-mute)" }}>
          {s.overall.hits} of {s.overall.checks} checks across {s.gamesFinal} final game{s.gamesFinal === 1 ? "" : "s"}, each graded exactly as we published it before kickoff against the official box score.
          {pendingGames.length ? ` ${pendingGames.map((g) => `${g.away.abbr} at ${g.home.abbr}`).join(", ")} ${pendingGames.length === 1 ? "is" : "are"} not final yet and will be added when ${pendingGames.length === 1 ? "it finishes" : "they finish"}.` : ""}
        </p>
      </header>

      <section aria-labelledby="how-graded">
        <SectionHeader eyebrow="Before the numbers" title="What counts as a hit" sub="We publish likely ranges, not over/under bets, so each check is defined from what you saw on the page." />
        <ul className="m" style={{ margin: "10px 0 0", paddingLeft: 18, maxWidth: 760, fontSize: 13, lineHeight: 1.65 }}>
          <li>{latest.howGraded.winner}</li>
          <li>{latest.howGraded.ranges}</li>
          <li>{latest.howGraded.likeliestScorer}</li>
          <li>{latest.howGraded.voids}</li>
          <li>{latest.howGraded.estimates}</li>
          {latest.howGraded.sharpness ? <li>{latest.howGraded.sharpness}</li> : null}
        </ul>
      </section>

      <section aria-labelledby="by-prop">
        <SectionHeader eyebrow={latest.period.label} title="Success rate by prediction" sub={`${s.gamesFinal} final game${s.gamesFinal === 1 ? "" : "s"} · void predictions are not counted`} />
        <div className="scroll">
          <table style={{ minWidth: 800 }}>
            <thead><tr><th scope="col">Prediction</th><th scope="col">Success rate</th><th scope="col">Hits</th><th scope="col">Void</th><th scope="col">Typical miss</th><th scope="col">Range width</th><th scope="col">What counts</th></tr></thead>
            <tbody>
              {s.props.map((p) => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 600, color: "var(--vault-text)" }}>
                    {p.label}{p.status === "ESTIMATE" ? <span className="f" style={{ fontWeight: 400 }}> · estimate</span> : null}
                  </td>
                  <td className="k" style={{ fontSize: 14, color: "var(--vault-text)" }}>{pct(p.rate)}</td>
                  <td className="k m">{p.hits}/{p.checks}</td>
                  <td className="k v">{p.voids || "—"}</td>
                  <td className="k m nw">
                    {p.typicalMiss != null ? unitFigure(p.id, p.typicalMiss) : "—"}
                    {p.lean != null && Math.abs(p.lean) >= 0.5 * (p.typicalMiss ?? Infinity) ? <div className="f">middle ran {p.lean < 0 ? "low" : "high"}</div> : null}
                  </td>
                  <td className="k m nw">{p.rangeWidth != null ? unitFigure(p.id, p.rangeWidth) : "—"}</td>
                  <td className="m" style={{ fontSize: 12, maxWidth: 320 }}>
                    {PROP_MEANING[p.id] ?? ""}{p.target ? " Aim: about 8 in 10." : ""}
                    {p.expectedHits != null ? ` Our win chances expected about ${p.expectedHits} of ${p.checks} to come true.` : ""}
                  </td>
                </tr>
              ))}
              <tr>
                <td style={{ fontWeight: 700, color: "var(--vault-text)" }}>Overall</td>
                <td className="k" style={{ fontSize: 14, fontWeight: 700, color: "var(--vault-text)" }}>{pct(s.overall.rate)}</td>
                <td className="k m">{s.overall.hits}/{s.overall.checks}</td>
                <td />
                <td />
                <td />
                <td className="m" style={{ fontSize: 12 }}>Every check above, added together.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="note">
          <strong style={{ color: "var(--vault-text)" }}>How we get better.</strong>{" "}
          A range can always be made to land 8 in 10 times by making it wider, so a higher success rate alone is not
          progress. Week over week we aim for a smaller typical miss and narrower ranges while about 8 in 10 still land
          inside — and for more winners than our own win chances expected.
        </p>
        <p className="note">
          <strong style={{ color: "var(--vault-text)" }}>For context, not counted above.</strong>{" "}
          On total points, our number was closer to the final than the sportsbooks&rsquo; in {c.oursCloser} game{c.oursCloser === 1 ? "" : "s"}, theirs was closer in {c.booksCloser}{c.even ? `, and ${c.even} were even` : ""}{c.noLine ? ` (${c.noLine} had no sportsbook total)` : ""}.
          {" "}Across the {s.context.touchdowns.playersGraded} players we gave a touchdown chance who played, our chances added up to about {s.context.touchdowns.expectedScorers} scorers; {s.context.touchdowns.actualScorers} actually scored.
        </p>
      </section>

      <section aria-labelledby="by-game">
        <SectionHeader eyebrow={latest.period.label} title="Game by game" sub="Our pre-kickoff read beside the final score" />
        <div className="scroll">
          <table style={{ minWidth: 820 }}>
            <thead><tr><th scope="col">Game</th><th scope="col">Final</th><th scope="col">Our pick</th><th scope="col">Our total (range)</th><th scope="col">Margin in range</th><th scope="col">Sportsbook total</th></tr></thead>
            <tbody>
              {latest.games.map((g) => (
                <tr key={g.providerEventId}>
                  <td className="nw">{archived.has(g.providerEventId) ? <Link href={`/nfl/game/${g.providerEventId}/`} style={{ color: "var(--vault-text)", textDecoration: "none" }}>{g.away.abbr} at {g.home.abbr}</Link> : <>{g.away.abbr} at {g.home.abbr}</>}<div className="f">{etKickoff(g.kickoffUtc)}{archived.has(g.providerEventId) ? <> · <Link href={`/nfl/game/${g.providerEventId}/`} style={{ color: "var(--vault-gold-bright)" }}>archived read →</Link></> : null}</div></td>
                  <td className="k nw">{g.final ? `${g.away.abbr} ${g.final.away} — ${g.final.home} ${g.home.abbr}` : "not final"}</td>
                  <td className="nw"><span className="k">{g.published.pick.abbr} {(g.published.pick.probability * 100).toFixed(0)}%</span> {g.final ? <Mark outcome={team(g, "winner")?.outcome} /> : null}</td>
                  <td className="nw"><span className="k">{g.published.total.median} ({g.published.total.low}–{g.published.total.high})</span> {g.final ? <Mark outcome={team(g, "total_range")?.outcome} /> : null}</td>
                  <td className="nw">{g.final ? <Mark outcome={team(g, "margin_range")?.outcome} /> : "—"}</td>
                  <td className="k m">{g.published.sportsbookTotal ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="players">
        <SectionHeader eyebrow={latest.period.label} title="Every player prediction" sub="Open a game to see each player's range, the official number and the result" />
        <div style={{ marginTop: 8 }}>
          {latest.games.filter((g) => g.state === "FINAL").map((g) => <GamePlayers key={g.providerEventId} game={g} />)}
        </div>
      </section>

      <footer className="f" style={{ maxWidth: 760, fontSize: 12, lineHeight: 1.6 }}>
        <p style={{ margin: 0 }}>{latest.source} {latest.disclaimer}</p>
        <p style={{ margin: "6px 0 0" }}>
          Graded {etKickoff(latest.generatedAt).replace(" ET", "")} ET
          {(index?.weeks?.length ?? 0) > 1 ? ` · earlier weeks: ${index!.weeks.slice(0, -1).map((w) => `${w.label} ${pct(w.overall.rate)}`).join(" · ")}` : ""}
          {" · "}<Link href="/nfl/" style={{ color: "var(--vault-gold-bright)" }}>This week&rsquo;s NFL predictions</Link>
          {" · "}<Link href="/results/picks/nfl/" style={{ color: "var(--vault-gold-bright)" }}>NFL model record</Link>
        </p>
      </footer>
    </div>
  );
}
