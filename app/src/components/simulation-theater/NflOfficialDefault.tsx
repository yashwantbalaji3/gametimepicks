/**
 * Simulation Theater · NFL DEFAULT VIEW — the official projected game (P0-A, founder requirement 2026-10-30). Server
 * component: rendered once into the HTML, outside every client island, from the game page's own forecast view
 * (lib/simulation-theater/official-default.mjs nflOfficialDefault — no simulation input), so no playback or scenario
 * choice can change it. Compact on purpose (page weight): one summary list and two small tables.
 */
import "./public-theater.css";
import { DEFAULT_VIEW_KIND, DEFAULT_VIEW_TITLE, NFL_DEFAULT_COLUMNS, NFL_DEFAULT_NOTE, nflOfficialDefault } from "@/lib/simulation-theater/official-default.mjs";

export const NFL_DEFAULT_ID = "official-projected-game";
type Model = NonNullable<ReturnType<typeof nflOfficialDefault>>;

export default function NflOfficialDefault({ model, gameHref }: { model: Model | null; gameHref: string }) {
  if (!model) {
    return (
      <section id={NFL_DEFAULT_ID} className="stp-default" aria-labelledby={`${NFL_DEFAULT_ID}-h`} data-theater-default="none">
        <p className="stp-default-kind">{DEFAULT_VIEW_KIND}</p>
        <h2 id={`${NFL_DEFAULT_ID}-h`}>{DEFAULT_VIEW_TITLE}</h2>
        <p>Unavailable: the Official Forecast for this game is not in the committed forecasts. Nothing below is an Official Forecast.</p>
      </section>
    );
  }
  const m = model;
  // only estimate families this game's tables actually print
  const est = NFL_DEFAULT_COLUMNS.filter((c) => m.estimates[c.key] && m.teams.some((t) => t.columns.some((x) => x.key === c.key)));
  return (
    <section id={NFL_DEFAULT_ID} className="stp-default" aria-labelledby={`${NFL_DEFAULT_ID}-h`} data-theater-default={m.snapshotId ?? "no-snapshot"}>
      <p className="stp-default-kind">{DEFAULT_VIEW_KIND}</p>
      <h2 id={`${NFL_DEFAULT_ID}-h`}>{DEFAULT_VIEW_TITLE}</h2>
      <dl className="stp-default-kv">
        <dt>Projected winner</dt><dd data-default-winner={m.winner.abbr}><strong>{m.winner.name}</strong>, {m.winner.pct} to win</dd>
        <dt>Win chance</dt><dd data-default-win="">{m.away.abbr} {m.winChance.away.text} · {m.home.abbr} {m.winChance.home.text}</dd>
        <dt>Projected score</dt><dd data-default-score="">{m.projectedScore ? m.projectedScore.text : "Not published"}{m.projectedScore ? <span className="stp-default-fine"> · the middle of the outcomes, not a call on the exact final</span> : null}</dd>
      </dl>
      {m.refusal ? <p data-default-refusal={m.refusal}>No official player projections for this game ({m.refusal}).</p> : null}
      {m.teams.map((t) => (t.rows.length ? (
        <div key={t.side} className="stp-scroll" role="region" aria-label={`${t.name} · official player projections`} tabIndex={0}>
          <table className="stp-table stp-default-table" data-default-table={t.side}>
            <caption>{t.name} · official player projections</caption>
            <thead><tr><th scope="col">Player</th>{t.columns.map((c) => <th key={c.key} scope="col">{c.short}{m.estimates[c.key] ? <sup aria-hidden="true">†</sup> : null}</th>)}</tr></thead>
            <tbody>
              {t.rows.map((r) => (
                <tr key={r.playerId} data-default-player={r.playerId}>
                  <th scope="row">{r.name}{r.position ? <span className="stp-default-fine"> {r.position}</span> : null}{r.availability ? <span className="stp-default-fine"> · {r.availability}</span> : null}</th>
                  {t.columns.map((c) => {
                    const cell = r.cells[c.key];
                    return <td key={c.key} data-k={c.key}>{cell ? cell.text : "—"}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null))}
      {est.length ? (
        <p className="stp-default-fine" data-default-estimates="">
          † {est.map((c, i) => <span key={c.key}>{i ? "; " : ""}{c.short}: <strong>{m.estimates[c.key]}</strong></span>)}. Shown as estimates, never as picks.
        </p>
      ) : null}
      <p className="stp-default-fine">{NFL_DEFAULT_NOTE} <a href={gameHref}>Game page →</a></p>
    </section>
  );
}
