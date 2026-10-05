/**
 * NFL SIMULATION V2 — the public, EXPERIMENTAL presentation of ONE frozen pre-kickoff receipt (founder P0 · 2026-10-05).
 *
 * Every number on this component is read from that receipt, which counts over ONE population of coherent simulated
 * games (drives → plays → players → points, checked run by run). Nothing is recomputed from another model, and no
 * family the engine does not generate is shown: common exact final scores, kickers, sacks by defender, and
 * individual defensive stats are not in the receipt, so they are absent here rather than filled in.
 *
 * Kept SEPARATE from the canonical Game Time Forecast and its Projected Scorecard (which stay "expected statistical
 * summaries · not one simulated game"). The canonical forecast, when shown, sits in its own labelled card.
 * No sportsbook number is read or shown: the engine takes none as an input.
 */
import Link from "next/link";

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
`;

const pct = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(1)}%`);
const q = (d: any) => (d ? `${d.p50} (${d.p10}–${d.p90})` : "—");
const mean = (d: any) => (d && Number.isFinite(d.mean) ? d.mean.toFixed(1) : "—");
const sumWhere = (hist: any[], pred: (v: number) => boolean) => (hist ?? []).reduce((a: number, h: any) => a + (pred(h.value) ? h.probability : 0), 0);

function Region({ label, children }: { label: string; children: React.ReactNode }) {
  // A scrollable table is a keyboard-reachable, named region (axe: scrollable-region-focusable).
  return <div className="scroll" role="region" aria-label={label} tabIndex={0}>{children}</div>;
}

function Bars({ hist, width, median, label }: { hist: any[]; width: number; median: number; label: string }) {
  const m = new Map<number, number>();
  for (const h of hist ?? []) { const b = Math.floor(h.value / width) * width; m.set(b, (m.get(b) ?? 0) + h.probability); }
  const bs = [...m.entries()].sort((a, b) => a[0] - b[0]);
  const max = Math.max(...bs.map(([, p]) => p), 0.0001);
  return (
    <figure style={{ margin: 0 }}>
      <div className="bars" role="img" aria-label={`${label}: distribution over all simulated games, median ${median}`}>
        {bs.map(([b, p]) => <div key={b} className={`bar${median >= b && median < b + width ? " mid" : ""}`} style={{ height: `${(p / max) * 100}%` }} title={`${b} to ${b + width - 1}: ${(p * 100).toFixed(1)}%`} />)}
      </div>
      <figcaption className="f">{label}. Bars group {width} points; the solid bar holds the median ({median}). Range shown {bs[0]?.[0]} to {bs[bs.length - 1]?.[0]}.</figcaption>
    </figure>
  );
}

const TEAM_STATS: Array<[string, string]> = [["drives", "Drives"], ["plays", "Plays"], ["passAtt", "Pass attempts"], ["cmp", "Completions"], ["passYds", "Passing yards"], ["passTd", "Passing TDs"], ["int", "Interceptions"], ["sacks", "Sacks taken"], ["rushAtt", "Rush attempts"], ["rushYds", "Rushing yards"], ["rushTd", "Rushing TDs"], ["fgMade", "Field goals made"]];

export interface CanonicalForecast { awayWin: number; homeWin: number; projectedAway: number; projectedHome: number; totalMedian: number; modelId: string | null; generatedAt: string | null }

export default function SimulationV2Report({ r, file, canonical, gameHref }: { r: any; file: string; canonical: CanonicalForecast | null; gameHref: string }) {
  const a = r.aggregate;
  const H = r.home.abbr;
  const A = r.away.abbr;
  const mh = a.marginHistogram ?? [];
  const oneScore = sumWhere(mh, (v) => Math.abs(v) <= 8);
  const by3 = sumWhere(mh, (v) => Math.abs(v) === 3);
  const by7 = sumWhere(mh, (v) => Math.abs(v) === 7);
  const players = (r.playerStatDistributions ?? []).filter((p: any) => p.playerId !== "OTHER");
  const other = (r.playerStatDistributions ?? []).filter((p: any) => p.playerId === "OTHER");
  const byTeam = (team: string, key: string) => players.filter((p: any) => p.team === team && p.stats?.[key]).sort((x: any, y: any) => (y.stats[key].mean ?? 0) - (x.stats[key].mean ?? 0));
  const tdList = [...players, ...other].filter((p: any) => (p.anytimeTd ?? 0) > 0).sort((x: any, y: any) => y.anytimeTd - x.anytimeTd);
  const firstTd = r.scoringEventDistributions?.firstTdScorer ?? [];
  const teamFirst = r.scoringEventDistributions?.teamFirstTd ?? {};
  const kickoff = new Date(r.eventStart);
  const stamp = (iso: string) => `${String(iso).slice(0, 16).replace("T", " ")} UTC`;

  return (
    <div className="s2">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="card exp">
        <p className="tag" style={{ margin: 0 }}>Simulation V2 · experimental · {r.runCount.toLocaleString("en-US")} coherent game paths</p>
        <p style={{ margin: "6px 0 0", fontSize: 13.5, color: "var(--vault-text)" }}>
          Each run is one internally consistent possible game: drives, plays, player stats and points all add up inside that run.
          The numbers below summarise all {r.runCount.toLocaleString("en-US")} simulated games.
        </p>
        <p className="m" style={{ margin: "6px 0 0", fontSize: 12.5 }}>
          This is a separate, experimental engine, not our main forecast. It has not been shown to be more accurate than the Game Time
          Forecast: on held-out past games its win chances scored slightly worse. It is shown for exploration, takes no betting-market
          input, and feeds no pick or product. It was frozen before kickoff and is never re-run with live information.
        </p>
      </div>

      {canonical ? (
        <div className="card canon">
          <p className="tag" style={{ margin: 0 }}>Game Time Forecast · our main model · not part of this simulation</p>
          <p style={{ margin: "6px 0 0", fontSize: 13, fontFamily: "var(--font-mono,ui-monospace,monospace)", overflowWrap: "anywhere" }}>
            {A} {canonical.projectedAway} — {canonical.projectedHome} {H} · win chance {A} {pct(canonical.awayWin)} · {H} {pct(canonical.homeWin)} · total {canonical.totalMedian}
          </p>
          <p className="f" style={{ margin: "4px 0 0" }}>Different model, different method. <Link href={gameHref}>Open the Game Time Forecast</Link>.</p>
        </div>
      ) : null}

      <section aria-labelledby="s2-outcome">
        <h2 id="s2-outcome">Game outcome · Simulation V2</h2>
        <div className="grid">
          <div className="tile"><b>{pct(a.winProbability.away)}</b><span>{A} win in the simulated games</span></div>
          <div className="tile"><b>{pct(a.winProbability.home)}</b><span>{H} win in the simulated games</span></div>
          <div className="tile"><b>{pct(a.winProbability.tie)}</b><span>tie after overtime</span></div>
          <div className="tile"><b>{pct(a.overtimeProbability)}</b><span>game goes to overtime</span></div>
          <div className="tile"><b>{A} {a.score.away.p50} – {a.score.home.p50} {H}</b><span>median score · averages {a.score.away.mean} – {a.score.home.mean}</span></div>
          <div className="tile"><b>{a.total.p50}</b><span>median total · 80% of games {a.total.p10}–{a.total.p90}</span></div>
          <div className="tile"><b>{a.margin.p50 > 0 ? `${H} +${a.margin.p50}` : a.margin.p50 < 0 ? `${A} +${-a.margin.p50}` : "Even"}</b><span>median margin · 80%: {H} {a.margin.p10} to {a.margin.p90}</span></div>
          <div className="tile"><b>{pct(oneScore)}</b><span>one-score game (decided by 8 or fewer)</span></div>
          <div className="tile"><b>{pct(by3)} · {pct(by7)}</b><span>decided by exactly 3 · by exactly 7</span></div>
        </div>
      </section>

      <section aria-labelledby="s2-dist">
        <h2 id="s2-dist">Score distribution</h2>
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))" }}>
          <Bars hist={a.marginHistogram} width={3} median={a.margin.p50} label={`Final margin (${H} minus ${A})`} />
          <Bars hist={a.totalHistogram} width={4} median={a.total.p50} label="Final total points" />
        </div>
        <h3>Each team&apos;s score</h3>
        <Region label="Team score ranges">
          <table>
            <thead><tr><th scope="col">Team</th><th scope="col">Low (10th)</th><th scope="col">Median</th><th scope="col">High (90th)</th><th scope="col">Average</th></tr></thead>
            <tbody>{[[A, a.score.away], [H, a.score.home]].map(([t, d]: any) => (
              <tr key={t}><td>{t}</td><td className="k">{d.p10}</td><td className="k">{d.p50}</td><td className="k">{d.p90}</td><td className="k">{d.mean}</td></tr>
            ))}</tbody>
          </table>
        </Region>
      </section>

      <section aria-labelledby="s2-periods">
        <h2 id="s2-periods">Quarters and halves</h2>
        <p className="f" style={{ margin: "4px 0 0" }}>From the same simulated games, so the quarters add up to each game&apos;s final. Overtime is shown above.</p>
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
        <h2 id="s2-team">Team box · median (80% range)</h2>
        <Region label="Simulated team statistics">
          <table>
            <thead><tr><th scope="col">Stat</th><th scope="col">{A}</th><th scope="col">{H}</th></tr></thead>
            <tbody>{TEAM_STATS.filter(([k]) => r.teamStatDistributions?.home?.[k]).map(([k, label]) => (
              <tr key={k}><td>{label}</td><td className="k">{q(r.teamStatDistributions.away[k])}</td><td className="k">{q(r.teamStatDistributions.home[k])}</td></tr>
            ))}</tbody>
          </table>
        </Region>
        <h3>Touchdowns per team</h3>
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

      <section aria-labelledby="s2-players">
        <h2 id="s2-players">Players · median (80% range)</h2>
        <p className="f" style={{ margin: "4px 0 0" }}>
          Player lines are slices of the same simulated games: in every run, receivers&apos; catches and yards add up to their passer&apos;s, and carries add up to the team&apos;s.
          Volume a named player does not get goes to &quot;Other&quot;, so nothing is forced onto a starter. Players ruled out before the simulation get no snaps.
        </p>
        {[A, H].map((team) => {
          const qbs = byTeam(team, "passYds");
          const rush = byTeam(team, "rushYds").slice(0, 4);
          const rec = byTeam(team, "recYds").slice(0, 6);
          return (
            <div key={team}>
              <h3>{team} passing</h3>
              <Region label={`${team} simulated passing`}>
                <table>
                  <thead><tr><th scope="col">Player</th><th scope="col">Attempts</th><th scope="col">Completions</th><th scope="col">Yards</th><th scope="col">TDs (avg)</th><th scope="col">INTs (avg)</th></tr></thead>
                  <tbody>{qbs.map((p: any) => <tr key={p.playerId}><td>{p.name} <span className="f">{p.position}</span></td><td className="k">{q(p.stats.passAtt)}</td><td className="k">{q(p.stats.cmp)}</td><td className="k">{q(p.stats.passYds)}</td><td className="k">{mean(p.stats.passTd)}</td><td className="k">{mean(p.stats.int)}</td></tr>)}</tbody>
                </table>
              </Region>
              <h3>{team} rushing</h3>
              <Region label={`${team} simulated rushing`}>
                <table>
                  <thead><tr><th scope="col">Player</th><th scope="col">Carries</th><th scope="col">Yards</th><th scope="col">Rush TDs (avg)</th></tr></thead>
                  <tbody>{rush.map((p: any) => <tr key={p.playerId}><td>{p.name} <span className="f">{p.position}</span></td><td className="k">{q(p.stats.rushAtt)}</td><td className="k">{q(p.stats.rushYds)}</td><td className="k">{mean(p.stats.rushTd)}</td></tr>)}</tbody>
                </table>
              </Region>
              <h3>{team} receiving</h3>
              <Region label={`${team} simulated receiving`}>
                <table>
                  <thead><tr><th scope="col">Player</th><th scope="col">Targets</th><th scope="col">Catches</th><th scope="col">Yards</th><th scope="col">Rec TDs (avg)</th></tr></thead>
                  <tbody>{rec.map((p: any) => <tr key={p.playerId}><td>{p.name} <span className="f">{p.position}</span></td><td className="k">{q(p.stats.targets)}</td><td className="k">{q(p.stats.rec)}</td><td className="k">{q(p.stats.recYds)}</td><td className="k">{mean(p.stats.recTd)}</td></tr>)}</tbody>
                </table>
              </Region>
            </div>
          );
        })}
      </section>

      <section aria-labelledby="s2-td">
        <h2 id="s2-td">Touchdown scorers</h2>
        <p className="f" style={{ margin: "4px 0 0" }}>Share of simulated games in which the player scored; the first-TD scorer is the first touchdown of that same game.</p>
        <Region label="Simulated touchdown scorers">
          <table>
            <thead><tr><th scope="col">Player</th><th scope="col">Team</th><th scope="col">Anytime TD</th><th scope="col">2+ TDs</th><th scope="col">First TD of the game</th></tr></thead>
            <tbody>{tdList.slice(0, 16).map((p: any) => {
              const ft = firstTd.find((x: any) => x.playerId === p.playerId && x.team === p.team);
              return <tr key={`${p.team}-${p.playerId}`}><td>{p.name} {p.position ? <span className="f">{p.position}</span> : null}</td><td>{p.team}</td><td className="k">{pct(p.anytimeTd)}</td><td className="k">{pct(p.twoPlusTd)}</td><td className="k">{pct(ft?.probability ?? 0)}</td></tr>;
            })}</tbody>
          </table>
        </Region>
        <p className="f" style={{ margin: "6px 0 0" }}>First touchdown by team: {A} {pct(teamFirst.away)} · {H} {pct(teamFirst.home)} · no offensive touchdown {pct(teamFirst.none)}. Defensive and special-teams touchdowns are not credited to a player.</p>
      </section>

      <section aria-labelledby="s2-rep">
        <h2 id="s2-rep">Representative simulated games</h2>
        <p className="f" style={{ margin: "4px 0 0" }}>Real runs from this batch, picked by a fixed rule and replayed from their seed. Each is one possible game, not the forecast.</p>
        {(r.representativeRuns ?? []).slice(0, 3).map((g: any) => (
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

      <section aria-labelledby="s2-prov">
        <h2 id="s2-prov">Provenance</h2>
        <Region label="Simulation receipt provenance">
          <table>
            <tbody>
              <tr><th scope="row">Engine</th><td className="k" style={{ whiteSpace: "normal", overflowWrap: "anywhere" }}>{r.simulationEngine} {r.simulationEngineVersion}</td></tr>
              <tr><th scope="row">Status</th><td className="k" style={{ whiteSpace: "normal", overflowWrap: "anywhere" }}>{r.promotionState} · experimental · not promoted · not our main forecast</td></tr>
              <tr><th scope="row">Runs</th><td className="k" style={{ whiteSpace: "normal", overflowWrap: "anywhere" }}>{r.runCount.toLocaleString("en-US")} · incoherent runs {r.validation.failedRuns} of {r.validation.sampleCount.toLocaleString("en-US")}</td></tr>
              <tr><th scope="row">Generated</th><td className="k" style={{ whiteSpace: "normal", overflowWrap: "anywhere" }}>{stamp(r.generatedAt)} · before kickoff {stamp(kickoff.toISOString())}</td></tr>
              <tr><th scope="row">Seed</th><td className="k" style={{ whiteSpace: "normal", overflowWrap: "anywhere" }}>{r.baseSeed} · {r.seedStrategy}</td></tr>
              <tr><th scope="row">Team strength</th><td className="k" style={{ whiteSpace: "normal", overflowWrap: "anywhere" }}>{r.calibration?.anchors?.source} · calibrated means {H} {r.calibration?.calibratedMean?.[0]} / {A} {r.calibration?.calibratedMean?.[1]}</td></tr>
              <tr><th scope="row">Availability</th><td className="k" style={{ whiteSpace: "normal", overflowWrap: "anywhere" }}>{r.availabilitySnapshotId}</td></tr>
              <tr><th scope="row">Market</th><td className="k" style={{ whiteSpace: "normal", overflowWrap: "anywhere" }}>{r.marketUse}</td></tr>
              <tr><th scope="row">Receipt</th><td className="k" style={{ whiteSpace: "normal", overflowWrap: "anywhere" }}>{r.simulationReceiptId} · {file.split("/").slice(-2).join("/")}</td></tr>
            </tbody>
          </table>
        </Region>
        <p className="f" style={{ margin: "6px 0 0" }}>
          Not modelled: downs and distance, penalties, timeouts, weather, kickers as players, defensive player stats, and exact
          final-score frequencies. Those are absent here rather than estimated. Educational and paper-only; not betting advice.
        </p>
      </section>
    </div>
  );
}
