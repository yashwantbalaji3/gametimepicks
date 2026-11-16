/**
 * NFL SIMULATION V2 — the public, EXPERIMENTAL presentation of ONE frozen pre-kickoff receipt (founder P0 · 2026-10-05).
 *
 * Every number on this component is read from that receipt, which counts over ONE population of coherent simulated
 * games (drives → plays → players → points, checked run by run). Nothing is recomputed from another model, and no
 * family the engine does not generate is shown: common exact final scores, kickers, sacks by defender, and
 * individual defensive stats are not in the receipt, so they are absent here rather than filled in.
 *
 * Kept SEPARATE from the canonical Game Time Forecast and its Projected Scorecard (which stay "expected statistical
 * summaries · not one simulated game"). N14 (founder rule 2026-10-20 / 11-11, one official forecast everywhere): the
 * page's game headline and every player number are the OFFICIAL forecast (props `game` and `lines`, derived on the
 * server by lib/sports/nfl/sim-v2/official-player-lines.mjs); every simulated figure sits inside the one visibly titled
 * "Hypothetical simulation — not the forecast" block, which restates no win chance, score, total or margin.
 * No sportsbook number is read or shown: the engine takes none as an input.
 */
import Link from "next/link";
import { formatUpdatedEt } from "@/lib/format";
import { PUBLIC_TERMS } from "@/lib/public-registry";
import MoreDisclosure from "@/components/ui/more-disclosure";
import { OFFICIAL_PLAYER_NOTE, STARTER_UNCONFIRMED, type officialPlayerLines, type officialGameLine } from "@/lib/sports/nfl/sim-v2/official-player-lines.mjs";

const CSS = `
.s2 table{width:100%;border-collapse:collapse}
.s2 th{text-align:left;padding:6px 8px;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--vault-text-faint);white-space:nowrap}
.s2 td{padding:6px 8px;border-top:1px solid var(--vault-border);font-size:12.5px;vertical-align:top}
.s2 .k{font-family:var(--font-mono,ui-monospace,monospace);font-size:12px;white-space:nowrap}
.s2 .m{color:var(--vault-text-mute)}
.s2 .f{color:var(--vault-text-faint);font-size:11px}
.s2 .scroll{overflow-x:auto;margin-top:6px}
.s2 .scroll:focus-visible{outline:2px solid var(--vault-gold);outline-offset:2px}
.s2 section{margin-top:26px}
.s2 h2{font-size:18px;margin:0;color:var(--vault-text)}
.s2 h3{font-size:14px;margin:14px 0 4px;color:var(--vault-text)}
.s2 .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-top:10px}
.s2 .tile{border:1px solid var(--vault-border-strong);border-radius:10px;padding:10px 12px;background:var(--gtp-card)}
.s2 .tile b{display:block;font-size:19px;color:var(--vault-text)}
.s2 .tile span{font-size:11px;color:var(--vault-text-mute)}
.s2 .bars{display:flex;align-items:flex-end;gap:1px;height:90px;margin-top:8px}
.s2 .bar{flex:1;background:var(--vault-gold);opacity:.7;min-width:2px}
.s2 .bar.mid{opacity:1}
.s2 .card{border:1px solid var(--vault-border-strong);border-radius:12px;padding:12px 14px;margin-top:12px}
.s2 .exp{border-top:2px solid var(--vault-warn)}
.s2 .canon{border-top:2px solid var(--vault-gold)}
.s2 .tag{font-family:var(--font-mono,ui-monospace,monospace);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--vault-text-faint)}
.s2 summary{cursor:pointer;font-size:13px;color:var(--vault-text);min-height:32px;padding:6px 0}
.s2 summary:focus-visible{outline:2px solid var(--vault-accent);outline-offset:2px}
`;

const pct = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(1)}%`);
const q = (d: any) => (d ? `${d.p50} (${d.p10}–${d.p90})` : "—");
const sumWhere = (hist: any[], pred: (v: number) => boolean) => (hist ?? []).reduce((a: number, h: any) => a + (pred(h.value) ? h.probability : 0), 0);

function Region({ label, children }: { label: string; children: React.ReactNode }) {
  // A scrollable table is a keyboard-reachable, named region (axe: scrollable-region-focusable).
  return <div className="scroll" role="region" aria-label={label} tabIndex={0}>{children}</div>;
}

/* N14: no simulated passing or rushing rows — beside a one-passer team's official passing yards they would read as a
   competing player number. Only game-flow counts with no official player family remain. */
const TEAM_STATS: Array<[string, string]> = [["drives", "Drives"], ["plays", "Plays"], ["sacks", "Sacks taken"], ["fgMade", "Field goals made"]];


export type OfficialPlayerLines = ReturnType<typeof officialPlayerLines>;
type OfficialRow = OfficialPlayerLines["touchdowns"][number];

/** One official table: every printed number is a `data-s2-v="<playerId>|<family>"` cell, its Estimate label beside it. */
function OfficialTable({ label, cols, rows, team = false }: { label: string; cols: Array<[string, string]>; rows: OfficialRow[]; team?: boolean }) {
  return (
    <Region label={label}>
      <table>
        <thead><tr><th scope="col">Player</th>{team ? <th scope="col">Team</th> : null}{cols.map(([k, h]) => <th key={k} scope="col">{h}</th>)}</tr></thead>
        <tbody>{rows.map((p) => (
          <tr key={`${p.team}-${p.playerId}`} data-s2-player={p.playerId}>
            <td>{p.name} {p.position ? <span className="f">{p.position}</span> : null}</td>
            {team ? <td>{p.team}</td> : null}
            {cols.map(([k]) => {
              const c = (p.cells as Record<string, { text: string; estimate: string | null } | null>)[k];
              return <td key={k} className="k">{c ? <><span data-s2-v={`${p.playerId}|${k}`}>{c.text}</span>{c.estimate ? <span className="f"> · {c.estimate}</span> : null}</> : "—"}</td>;
            })}
          </tr>
        ))}</tbody>
      </table>
    </Region>
  );
}

export type OfficialGameLine = NonNullable<ReturnType<typeof officialGameLine>>;

export default function SimulationV2Report({ r, gameHref, lines = null, game = null }: { r: any; file: string; gameHref: string; lines?: OfficialPlayerLines | null; game?: OfficialGameLine | null }) {
  const a = r.aggregate;
  const H = r.home.abbr;
  const A = r.away.abbr;
  const mh = a.marginHistogram ?? [];
  const oneScore = sumWhere(mh, (v) => Math.abs(v) <= 8);
  const by3 = sumWhere(mh, (v) => Math.abs(v) === 3);
  const by7 = sumWhere(mh, (v) => Math.abs(v) === 7);
  const kickoff = new Date(r.eventStart);
  // margin is home minus away; say it as who leads, the same way everywhere on the page
  /* Overnight W8 (2026-10-28): ET, like every other time on the site (it printed "2026-10-25 12:46 UTC"). */
  const stamp = (iso: string) => formatUpdatedEt(iso);

  return (
    <div className="s2">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="card exp">
        {/* Founder directive 2026-10-23 public readiness: named in the public vocabulary — a Game Simulation, never the
            Official Forecast. Every fact in the paragraph below (anchored to the forecast, not shown more accurate,
            feeds no pick, frozen before kickoff) is unchanged. */}
        <p className="tag" style={{ margin: 0 }}>{PUBLIC_TERMS.GAME_SIMULATION} · Simulation V2 · how to read this page</p>
        <p style={{ margin: "6px 0 0", fontSize: 13.5, color: "var(--vault-text)" }}>
          Each run is one internally consistent possible game: drives, plays, player stats and points all add up inside that run.
          The official numbers come first and are exactly the game page&apos;s. Everything inside the &quot;Hypothetical simulation&quot; block further down summarises the {r.runCount.toLocaleString("en-US")} simulated games and is not the forecast.
        </p>
        <p className="m" style={{ margin: "6px 0 0", fontSize: 12.5 }}>
          This is a {PUBLIC_TERMS.GAME_SIMULATION} from a separate engine, not the {PUBLIC_TERMS.OFFICIAL_FORECAST}. It is not independent of it: each team&apos;s scoring level is
          set so the simulated average total and margin match the Game Time Forecast&apos;s expected total and margin. It has not been shown to be more accurate than the Game Time
          Forecast: on held-out past games its win chances scored slightly worse. It is shown for exploration, takes no betting-market
          input, and feeds no pick or product. It was frozen before kickoff and is never re-run with live information.
        </p>
      </div>

      {/* N14 (founder rule 2026-10-20 / 11-11): the game-level headline is the OFFICIAL forecast — the forecast view's
          record, the accessor /nfl/game/<id> renders its hero from, with the hero's formatting (officialGameLine). The
          simulation's own win chance, score, total and margin are not printed anywhere on this page. */}
      <section aria-labelledby="s2-official" className="card canon" data-s2-official-game="">
        <p className="tag" style={{ margin: 0 }}>{PUBLIC_TERMS.OFFICIAL_FORECAST} · Game Time Forecast · separate from this simulation</p>
        <h2 id="s2-official" style={{ marginTop: 6 }}>Official forecast · the same as the game page</h2>
        {game ? (
          <div className="grid">
            <div className="tile"><b data-s2-g="winAway">{game.winChance.away.text}</b><span>{game.away.abbr} win chance</span></div>
            <div className="tile"><b data-s2-g="winHome">{game.winChance.home.text}</b><span>{game.home.abbr} win chance</span></div>
            {game.projectedScore ? <div className="tile"><b>{game.away.abbr} <span data-s2-g="scoreAway">{game.projectedScore.away}</span> – <span data-s2-g="scoreHome">{game.projectedScore.home}</span> {game.home.abbr}</b><span>projected score · the middle of the outcomes</span></div> : null}
            {game.margin ? <div className="tile"><b data-s2-g="margin">{game.margin.text}</b><span>expected margin · 8 in 10 outcomes between <span data-s2-g="marginRange">{game.margin.range}</span></span></div> : null}
            {game.total ? <div className="tile"><b data-s2-g="total">{game.total.median}</b><span>expected total · 8 in 10 outcomes between <span data-s2-g="totalP10">{game.total.p10}</span> and <span data-s2-g="totalP90">{game.total.p90}</span></span></div> : null}
          </div>
        ) : <p className="f" style={{ margin: "6px 0 0" }}>No official forecast is available for this game.</p>}
        <p className="f" style={{ margin: "6px 0 0" }}>{game ? <>{game.favourite.name} <span data-s2-g="favourite">{game.favourite.text}</span> to win. </> : null}<Link href={gameHref}>Open the Game Time Forecast</Link>.</p>
      </section>

      {/* N14 (founder rule 2026-10-20 / 11-11): every player number below is that player's OFFICIAL projection — the game
          page's value, formatter and Estimate label, via the Theater Default view (lib/sports/nfl/sim-v2/official-player-lines.mjs).
          Markets with no official projection print no number. Never a simulated player line. */}
      <section aria-labelledby="s2-players" data-s2-official-players="">
        <h2 id="s2-players">Players · official projection</h2>
        <p className="f" style={{ margin: "4px 0 0" }} data-s2-official-note="">{OFFICIAL_PLAYER_NOTE} <Link href={gameHref}>Game page</Link>.</p>
        {/* no forecast view (e.g. the week has rolled): the game page shows no player projection either, so neither does this */}
        {!lines?.available ? <p className="f" style={{ margin: "6px 0 0" }} data-s2-no-official-players="">No official player projection is available for this game.</p> : [A, H].map((team) => {
          const t = lines?.teams.find((x) => x.abbr === team) ?? null;
          return (
            <div key={team}>
              <h3>{team} passing</h3>
              <div data-s2-official-table={`${team}-passing`}>
                {t?.passing.length ? (
                  <OfficialTable label={`${team} official passing projection`} cols={[["passingYards", "Passing yards"]]} rows={t.passing} />
                ) : (
                  <p className="f" style={{ margin: "4px 0 0" }}>{STARTER_UNCONFIRMED} for {team}.</p>
                )}
              </div>
              <h3>{team} rushing</h3>
              <div data-s2-official-table={`${team}-rushing`}>
                {t?.rushing.length ? (
                  <OfficialTable label={`${team} official rushing projection`} cols={[["rushingYards", "Rushing yards"]]} rows={t.rushing} />
                ) : <p className="f" style={{ margin: "4px 0 0" }}>No official rushing projection for {team}.</p>}
              </div>
              <h3>{team} receiving</h3>
              <div data-s2-official-table={`${team}-receiving`}>
                {t?.receiving.length ? (
                  <OfficialTable label={`${team} official receiving projection`} cols={[["receptions", "Receptions"], ["receivingYards", "Receiving yards"]]} rows={t.receiving} />
                ) : <p className="f" style={{ margin: "4px 0 0" }}>No official receiving projection for {team}.</p>}
              </div>
            </div>
          );
        })}
      </section>

      <section aria-labelledby="s2-td" data-s2-official-players="">
        <h2 id="s2-td">Touchdown scorers · official projection</h2>
        <p className="f" style={{ margin: "4px 0 0" }}>Each player&apos;s official anytime-touchdown chance, as on the game page. Multiple-touchdown and first-touchdown chances have no official projection, so none is shown.</p>
        <div data-s2-official-table="touchdowns">
          {lines?.touchdowns.length ? (
            <OfficialTable label="Official anytime touchdown projection" cols={[["anytimeTd", "Anytime TD"]]} rows={lines.touchdowns} team />
          ) : <p className="f" style={{ margin: "4px 0 0" }}>No official touchdown projection for this game.</p>}
        </div>
      </section>

      {/* N14: every simulated game-level figure lives inside this one visibly titled block, apart from the official numbers
          above. It restates no competing headline: no simulated win chance, median score, total or margin. */}
      <div data-s2-hypothetical="" className="card exp" style={{ marginTop: 32 }}>
        <section aria-labelledby="s2-hypo" style={{ marginTop: 0 }}>
          <h2 id="s2-hypo">Hypothetical simulation — not the forecast</h2>
          <p className="f" style={{ margin: "4px 0 0" }}>
            Shapes of the {r.runCount.toLocaleString("en-US")} simulated games from a separate engine. Not the {PUBLIC_TERMS.OFFICIAL_FORECAST}: for who wins, the score, the margin and the total, use the official numbers above.
          </p>
          <div className="grid">
            <div className="tile"><b>{pct(a.overtimeProbability)}</b><span>simulated games that go to overtime</span></div>
            <div className="tile"><b>{pct(a.winProbability.tie)}</b><span>simulated games tied after overtime</span></div>
            <div className="tile"><b>{pct(oneScore)}</b><span>simulated one-score games (decided by 8 or fewer)</span></div>
            <div className="tile"><b>{pct(by3)} · {pct(by7)}</b><span>simulated games decided by exactly 3 · by exactly 7</span></div>
          </div>
        </section>
        <section aria-labelledby="s2-periods">
        <h3 id="s2-periods">Quarters and halves · simulated</h3>
        <p className="f" style={{ margin: "4px 0 0" }}>From the same simulated games, so the quarters add up to each simulated game&apos;s final.</p>
        <Region label="Scoring by quarter and half">
          <table>
            <thead><tr><th scope="col">Period</th><th scope="col">{A} median (80%)</th><th scope="col">{H} median (80%)</th><th scope="col">Both teams (80%)</th><th scope="col">{A} wins it</th><th scope="col">{H} wins it</th><th scope="col">Level</th></tr></thead>
            <tbody>{(r.periodAggregates ?? []).map((p: any) => (
              <tr key={p.period}><td className="k">{p.period === "H1" ? "1st half" : p.period === "H2" ? "2nd half" : p.period}</td><td className="k">{q(p.away)}</td><td className="k">{q(p.home)}</td><td className="k">{q(p.total)}</td><td className="k">{pct(p.awayWins)}</td><td className="k">{pct(p.homeWins)}</td><td className="k">{pct(p.level)}</td></tr>
            ))}</tbody>
          </table>
        </Region>
      </section>

        <section aria-labelledby="s2-team">
        <h3 id="s2-team">Simulated team box · hypothetical, not the forecast · median (80% range)</h3>
        <Region label="Simulated team statistics">
          <table>
            <thead><tr><th scope="col">Stat</th><th scope="col">{A}</th><th scope="col">{H}</th></tr></thead>
            <tbody>{TEAM_STATS.filter(([k]) => r.teamStatDistributions?.home?.[k]).map(([k, label]) => (
              <tr key={k}><td>{label}</td><td className="k">{q(r.teamStatDistributions.away[k])}</td><td className="k">{q(r.teamStatDistributions.home[k])}</td></tr>
            ))}</tbody>
          </table>
        </Region>
        <h3>Touchdowns per team · simulated</h3>
        <Region label="Team touchdown counts">
          <table>
            <thead><tr><th scope="col">Touchdowns</th>{[0, 1, 2, 3, 4, 5].map((n) => <th key={n} scope="col">{n === 5 ? "5+" : n}</th>)}</tr></thead>
            <tbody>{([[A, "away"], [H, "home"]] as const).map(([t, side]) => {
              const h = r.scoringEventDistributions?.teamTdCount?.[side] ?? [];
              return <tr key={t}><td>{t}</td>{[0, 1, 2, 3, 4].map((n) => <td key={n} className="k">{pct(sumWhere(h, (v) => v === n))}</td>)}<td className="k">{pct(sumWhere(h, (v) => v >= 5))}</td></tr>;
            })}</tbody>
          </table>
        </Region>
      </section>

        <section aria-labelledby="s2-rep">
        <h3 id="s2-rep">Representative simulated games</h3>
        <p className="f" style={{ margin: "4px 0 0" }}>Real runs from this batch, picked by a fixed rule and replayed exactly. Each is one possible game, not the forecast.</p>
        {/* the MEDIAN_LIKE run restates a central score that competes with the official projected score: not shown */}
        {(r.representativeRuns ?? []).filter((g: any) => g.kind !== "MEDIAN_LIKE").slice(0, 3).map((g: any) => (
          <details key={g.kind} style={{ borderTop: "1px solid var(--vault-border)" }}>
            <summary>
              <span className="tag">Representative simulation — not the forecast</span>{" "}
              {g.kind.replace(/_/g, " ").toLowerCase()}: {A} {g.final.away} – {g.final.home} {H}{g.final.overtime ? " (OT)" : ""}
            </summary>
            <p className="f">By quarter: {A} {g.quarters.away.slice(0, 4).join(" / ")}{g.final.overtime ? ` / OT ${g.quarters.away[4]}` : ""} · {H} {g.quarters.home.slice(0, 4).join(" / ")}{g.final.overtime ? ` / OT ${g.quarters.home[4]}` : ""}</p>
            <Region label={`Drives of the ${g.kind.replace(/_/g, " ").toLowerCase()} representative game`}>
              <table>
                <thead><tr><th scope="col">Qtr</th><th scope="col">Offense</th><th scope="col">Start (yds to goal)</th><th scope="col">Result</th><th scope="col">Plays</th><th scope="col">Yards</th><th scope="col">Score after ({A}–{H})</th></tr></thead>
                <tbody>{g.drives.map((d: any, i: number) => (
                  <tr key={i}><td className="k">{d.q === 5 ? "OT" : d.q}</td><td>{d.offense === 0 ? H : A}</td><td className="k">{d.startYardsToGoal}</td><td className="k">{d.result.replace(/_/g, " ").toLowerCase()}</td><td className="k">{d.plays}</td><td className="k">{d.netYards}</td><td className="k">{d.score[1]}–{d.score[0]}</td></tr>
                ))}</tbody>
              </table>
            </Region>
          </details>
        ))}
      </section>

      </div>

      {/* Overnight W8 (2026-10-28): engine version ("2.0.0-shadow"), seed algorithm and receipt id are audit detail —
          RELOCATED, verbatim, into the page's one collapsed "Technical details". The not-modelled list and the paper-only
          line stay visible below it. */}
      <section aria-labelledby="s2-prov">
        <MoreDisclosure title="Technical details" summary="Engine version, run checks, timestamps, seed and receipt id.">
        <h2 id="s2-prov" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Provenance</h2>
        <Region label="Simulation receipt provenance">
          <table>
            <tbody>
              <tr><th scope="row">Engine</th><td className="k" style={{ whiteSpace: "normal", overflowWrap: "anywhere" }}>{r.simulationEngine} {r.simulationEngineVersion}</td></tr>
              <tr><th scope="row">Status</th><td className="k" style={{ whiteSpace: "normal", overflowWrap: "anywhere" }}>{PUBLIC_TERMS.GAME_SIMULATION} · not promoted · not the {PUBLIC_TERMS.OFFICIAL_FORECAST} · feeds no pick or product</td></tr>
              <tr><th scope="row">Runs</th><td className="k" style={{ whiteSpace: "normal", overflowWrap: "anywhere" }}>{r.runCount.toLocaleString("en-US")} · incoherent runs {r.validation.failedRuns} of {r.validation.sampleCount.toLocaleString("en-US")}</td></tr>
              <tr><th scope="row">Generated</th><td className="k" style={{ whiteSpace: "normal", overflowWrap: "anywhere" }}>{stamp(r.generatedAt)} · before kickoff {stamp(kickoff.toISOString())}</td></tr>
              <tr><th scope="row">Seed</th><td className="k" style={{ whiteSpace: "normal", overflowWrap: "anywhere" }}>{r.baseSeed} · {r.seedStrategy}</td></tr>
              <tr><th scope="row">Team strength</th><td className="k" style={{ whiteSpace: "normal", overflowWrap: "anywhere" }}>{r.calibration?.anchors?.source} · each team&apos;s scoring level set from the Game Time Forecast&apos;s expected total and margin</td></tr>
              <tr><th scope="row">Availability</th><td className="k" style={{ whiteSpace: "normal", overflowWrap: "anywhere" }} title={r.availabilitySnapshotId}>{readableSnapshotId(r.availabilitySnapshotId)}</td></tr>
              <tr><th scope="row">Market</th><td className="k" style={{ whiteSpace: "normal", overflowWrap: "anywhere" }}>{String(r.marketUse ?? "").startsWith("NOT_AN_INPUT") ? "Not used as an input" : r.marketUse}</td></tr>
              <tr><th scope="row">Receipt</th><td className="k" style={{ whiteSpace: "normal", overflowWrap: "anywhere" }}>{r.simulationReceiptId}</td></tr>
            </tbody>
          </table>
        </Region>
        </MoreDisclosure>
        <p className="f" style={{ margin: "6px 0 0" }}>
          Not modelled: downs and distance, penalties, timeouts, weather, kickers as players, defensive player stats, and exact
          final-score frequencies. Those are absent here rather than estimated. Educational and paper-only; not betting advice.
        </p>
      </section>
    </div>
  );
}

/** "injuries@2026-10-14T23:43:46Z+rosters@…" → "injuries as of Oct 14, 7:43 PM ET · rosters as of …"; the exact id stays in the title. */
function readableSnapshotId(id: string | null | undefined): string {
  if (!id) return "—";
  return String(id).split("+").map((part) => {
    const at = part.indexOf("@");
    if (at < 0) return part;
    const iso = part.slice(at + 1);
    return Number.isFinite(Date.parse(iso)) ? `${part.slice(0, at)} as of ${formatUpdatedEt(iso)}` : part;
  }).join(" · ");
}
