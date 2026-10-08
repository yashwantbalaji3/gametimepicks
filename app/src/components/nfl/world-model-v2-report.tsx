/**
 * NFL WORLD MODEL V2 — the public, EXPERIMENTAL presentation of ONE per-game simulation artifact
 * (app/public/data/nfl/world-model-v2/<eventId>.json). Every number here is read from that artifact, which counts over
 * one population of simulated games: the win chance, the score, the scoring mix, the team volume and every player
 * line come from the same worlds. Nothing is recomputed and no unsupported family is filled in (touchdown and
 * passing-touchdown probabilities are listed as unsupported, not shown).
 *
 * The published Game Time Forecast stays the forecast of record; it appears only in its own labelled card, with the
 * difference between the two stated.
 */
import Link from "next/link";

const CSS = `
.wm2 table{width:100%;border-collapse:collapse}
.wm2 th{text-align:left;padding:6px 8px;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--vault-text-faint);white-space:nowrap}
.wm2 td{padding:6px 8px;border-top:1px solid var(--vault-border);font-size:12.5px;vertical-align:top}
.wm2 .k{font-family:var(--font-mono,ui-monospace,monospace);font-size:12px;white-space:nowrap}
.wm2 .m{color:var(--vault-text-mute)}
.wm2 .f{color:var(--vault-text-faint);font-size:11px}
.wm2 .scroll{overflow-x:auto;margin-top:6px}
.wm2 .scroll:focus-visible{outline:2px solid var(--vault-gold);outline-offset:2px}
.wm2 section{margin-top:26px}
.wm2 h2{font-size:18px;margin:0;color:var(--vault-text)}
.wm2 h3{font-size:14px;margin:14px 0 4px;color:var(--vault-text)}
.wm2 p{font-size:13px;line-height:1.5;color:var(--vault-text-mute);margin:6px 0 0}
.wm2 .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-top:10px}
.wm2 .tile{border:1px solid var(--vault-border-strong);border-radius:10px;padding:10px 12px;background:var(--gtp-card)}
.wm2 .tile b{display:block;font-size:19px;color:var(--vault-text)}
.wm2 .tile span{font-size:11px;color:var(--vault-text-mute)}
.wm2 .card{border:1px solid var(--vault-border-strong);border-radius:12px;padding:12px 14px;margin-top:12px}
.wm2 .exp{border-top:2px solid var(--vault-warn)}
.wm2 .canon{border-top:2px solid var(--vault-gold)}
.wm2 .tag{font-family:var(--font-mono,ui-monospace,monospace);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--vault-text-faint)}
.wm2 summary{cursor:pointer;font-size:13px;color:var(--vault-text);min-height:32px;padding:6px 0}
.wm2 summary:focus-visible{outline:2px solid var(--vault-accent);outline-offset:2px}
.wm2 ul{margin:6px 0 0;padding-left:18px;font-size:12.5px;color:var(--vault-text-mute);line-height:1.5}
`;

const pct = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(1)}%`);
const rng = (d: any) => (d ? `${fmt(d.median)} (${fmt(d.p10)}–${fmt(d.p90)})` : "—");
const fmt = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1));
const signed = (x: number) => (x > 0 ? `+${fmt(x)}` : fmt(x));

function Region({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="scroll" role="region" aria-label={label} tabIndex={0}>{children}</div>;
}

const FAMS: Array<[string, string]> = [["receptions", "Receptions"], ["receivingYards", "Receiving yds"], ["rushingYards", "Rushing yds"], ["passingYards", "Passing yds"]];
const RUNG: Array<[string, string]> = [["developmentTested", "Development tested"], ["prospectivelyCaptured", "Prospectively captured"], ["forwardEvaluated", "Forward evaluated"], ["productEligible", "Product eligible"], ["productionPromoted", "Production promoted"]];
const AVAIL: Record<string, string> = { ACTIVE: "", QUESTIONABLE: "Questionable", DOUBTFUL: "Doubtful" };

export default function WorldModelV2Report({ a, gameHref }: { a: any; gameHref: string }) {
  const g = a.game;
  const A = a.identity.away;
  const H = a.identity.home;
  const rec = a.forecastOfRecord;
  const generated = new Date(a.run.generatedAt).toISOString().replace("T", " ").slice(0, 16);
  const teams: Array<[string, any]> = [[A, g.away], [H, g.home]];
  const leaders = FAMS.map(([k, label]) => {
    const best = [...a.players].filter((p: any) => p.families[k]).sort((x: any, y: any) => y.families[k].mean - x.families[k].mean)[0];
    return { k, label, best };
  }).filter((x) => x.best);
  return (
    <div className="wm2">
      <style>{CSS}</style>

      <div className="card exp">
        <p className="tag" style={{ margin: 0 }}>World Model V2 · experimental · not the forecast of record</p>
        <p>
          {a.run.runs.toLocaleString("en-US")} simulated games of this matchup. In each one the score, the scoring plays, team passing and rushing, and every player line belong to the same game, so they add up: a team&apos;s passing yards equal its receivers&apos; yards, and every touchdown has a scorer with the ball in his hands. The <Link href={gameHref}>Game Time Forecast</Link> stays the forecast of record.
        </p>
        <p className="f" style={{ marginTop: 8 }}>
          {a.model.label} · {a.model.version} · simulated {generated} UTC · run {a.simulationId} · seed recorded · {a.diagnostics.teamWorldsChecked.toLocaleString("en-US")} team-games checked, {a.diagnostics.invariantViolations} inconsistent
        </p>
        <Region label="Evidence status">
          <table>
            <tbody>
              {RUNG.map(([k, label]) => (
                <tr key={k}><td>{label}</td><td className="k">{a.status[k].value ? "Yes" : "No"}</td><td className="m">{a.status[k].scope}</td></tr>
              ))}
            </tbody>
          </table>
        </Region>
      </div>

      <section aria-labelledby="wm2-outcome">
        <h2 id="wm2-outcome">How the simulated games ended</h2>
        <div className="grid">
          <div className="tile"><b>{pct(g.winProbability.away)}</b><span>{A} won</span></div>
          <div className="tile"><b>{pct(g.winProbability.home)}</b><span>{H} won</span></div>
          <div className="tile"><b>{pct(g.overtime.levelAfterRegulation)}</b><span>went to overtime ({pct(g.winProbability.tie)} still level after it)</span></div>
          <div className="tile"><b>{A} {g.projectedScore.away} – {g.projectedScore.home} {H}</b><span>median points of each team</span></div>
          <div className="tile"><b>{H} {signed(g.margin.median)}</b><span>median margin · 80% between {signed(g.margin.p10)} and {signed(g.margin.p90)}</span></div>
          <div className="tile"><b>{fmt(g.total.median)}</b><span>median total · 80% between {fmt(g.total.p10)} and {fmt(g.total.p90)}</span></div>
        </div>
        <p className="f">Win chances are the share of these simulated games each team won, overtime included. The score line is each team&apos;s median on its own, not one simulated game.</p>
      </section>

      <div className="card canon">
        <p className="tag" style={{ margin: 0 }}>Game Time Forecast · forecast of record</p>
        <p>
          {A} {pct(rec.winProbability.away)} · {H} {pct(rec.winProbability.home)}
          {rec.projectedScore ? <> · projected {A} {rec.projectedScore.away} – {rec.projectedScore.home} {H}</> : null}
        </p>
        <p className="f">
          Difference for {H}: {signed(Math.round((g.disagreement.winProbabilityHome.difference) * 1000) / 10)} points of win chance in the simulated games. {rec.note}
        </p>
      </div>

      <section aria-labelledby="wm2-teams">
        <h2 id="wm2-teams">Team scoring and volume</h2>
        <p>Averages across the simulated games. Touchdowns, kicks and safeties add up to each simulated game&apos;s score.</p>
        <Region label="Team scoring and volume">
          <table>
            <thead><tr><th scope="col">Per game</th>{teams.map(([t]) => <th key={t} scope="col">{t}</th>)}</tr></thead>
            <tbody>
              {([["offensiveTd", "Offensive TDs"], ["rushingTd", "· rushing"], ["receivingTd", "· receiving"], ["nonOffensiveTd", "Defense / special-teams TDs"], ["fieldGoals", "Field goals"], ["extraPoints", "Extra points"], ["twoPointConversions", "Two-point conversions"], ["safeties", "Safeties"]] as Array<[string, string]>).map(([k, label]) => (
                <tr key={k}><td>{label}</td>{teams.map(([t, s]) => <td key={t} className="k">{s.scoring[k].toFixed(2)}</td>)}</tr>
              ))}
              {([["passAttempts", "Pass attempts"], ["completions", "Completions"], ["passingYards", "Passing yards"], ["carries", "Carries"], ["rushingYards", "Rushing yards"]] as Array<[string, string]>).map(([k, label]) => (
                <tr key={k}><td>{label} <span className="f">median (80%)</span></td>{teams.map(([t, s]) => <td key={t} className="k">{rng(s.volume[k])}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </Region>
      </section>

      <section aria-labelledby="wm2-leaders">
        <h2 id="wm2-leaders">Leaders in the simulated games</h2>
        <div className="grid">
          {leaders.map(({ k, label, best }) => (
            <div className="tile" key={k}><b>{fmt(best.families[k].median)}</b><span>{label}: {best.name} ({best.team}) · median, average {fmt(best.families[k].mean)}</span></div>
          ))}
        </div>
      </section>

      <section aria-labelledby="wm2-players">
        <h2 id="wm2-players">Player distributions</h2>
        <p>Median with the middle 80% of simulated games in brackets. Players listed as Questionable or Doubtful are simulated as playing and marked; players ruled Out are not simulated.</p>
        {teams.map(([t]) => (
          <div key={t}>
            <h3>{t}</h3>
            <Region label={`${t} player distributions`}>
              <table>
                <thead><tr><th scope="col">Player</th>{FAMS.map(([, l]) => <th key={l} scope="col">{l}</th>)}</tr></thead>
                <tbody>
                  {a.players.filter((p: any) => p.team === t).map((p: any) => (
                    <tr key={p.playerId}>
                      <td>{p.name} <span className="f">{p.position ?? ""}{AVAIL[p.availability] ? ` · ${AVAIL[p.availability]}` : ""}</span></td>
                      {FAMS.map(([k]) => <td key={k} className="k">{rng(p.families[k])}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Region>
            <details>
              <summary>{t}: averages, spread and chance of reaching common lines</summary>
              <Region label={`${t} line probabilities`}>
                <table>
                  <thead><tr><th scope="col">Player</th><th scope="col">Stat</th><th scope="col">Average</th><th scope="col">SD</th><th scope="col">25–75%</th><th scope="col">Chance of at least</th></tr></thead>
                  <tbody>
                    {a.players.filter((p: any) => p.team === t).flatMap((p: any) => FAMS.filter(([k]) => p.families[k]).map(([k, l]) => {
                      const d = p.families[k];
                      return (
                        <tr key={`${p.playerId}-${k}`}>
                          <td>{p.name}</td><td>{l}</td><td className="k">{fmt(d.mean)}</td><td className="k">{fmt(d.sd)}</td><td className="k">{fmt(d.p25)}–{fmt(d.p75)}</td>
                          <td className="k">{Object.entries(d.atLeast ?? {}).map(([line, v]) => `${line}: ${pct(v as number)}`).join(" · ")}</td>
                        </tr>
                      );
                    }))}
                  </tbody>
                </table>
              </Region>
            </details>
          </div>
        ))}
      </section>

      <section aria-labelledby="wm2-worlds">
        <h2 id="wm2-worlds">Five of the simulated games</h2>
        <p>Real games from this run, picked at the 10th, 30th, 50th, 70th and 90th percentile of the {H} margin. Shown exactly as simulated, including who scored. Touchdown scorers in a single game are not touchdown probabilities.</p>
        {a.sampledWorlds.map((w: any) => (
          <details key={w.worldIndex}>
            <summary>
              Game #{w.worldIndex + 1}: {A} {w.away.points} – {w.home.points} {H}{w.overtime ? " (OT)" : ""} · {w.winner === "TIE" ? "tie" : `${w.winner} win`}
            </summary>
            {([[A, w.away], [H, w.home]] as Array<[string, any]>).map(([t, s]) => (
              <div key={t}>
                <p className="f">
                  {t}: {s.points} points{w.overtime ? ` (${s.regulationPoints} in regulation)` : ""} = {s.scoring.offensiveTd} offensive TD ({s.scoring.rushingTd} rushing, {s.scoring.receivingTd} receiving), {s.scoring.nonOffensiveTd} defense/special-teams TD, {s.scoring.fieldGoals} FG, {s.scoring.extraPoints} XP, {s.scoring.twoPointConversions} two-point, {s.scoring.safeties} safety · {s.volume.completions}/{s.volume.passAttempts} for {s.volume.passingYards} passing yards, {s.volume.carries} carries for {s.volume.rushingYards} yards
                </p>
                <Region label={`${t} box score, game ${w.worldIndex + 1}`}>
                  <table>
                    <thead><tr><th scope="col">Player</th><th scope="col">Passing</th><th scope="col">Rushing</th><th scope="col">Receiving</th><th scope="col">TD</th></tr></thead>
                    <tbody>
                      {s.players.map((p: any) => {
                        const l = p.line;
                        const td = [l.passingTd ? `${l.passingTd} pass` : "", l.rushingTd ? `${l.rushingTd} rush` : "", l.receivingTd ? `${l.receivingTd} rec` : ""].filter(Boolean).join(", ");
                        return (
                          <tr key={p.playerId}>
                            <td>{p.name} <span className="f">{p.position ?? ""}</span></td>
                            <td className="k">{l.passAttempts ? `${l.completions}/${l.passAttempts}, ${l.passingYards}` : ""}</td>
                            <td className="k">{l.carries ? `${l.carries}-${l.rushingYards}` : ""}</td>
                            <td className="k">{l.targets ? `${l.receptions}/${l.targets} tgt, ${l.receivingYards}` : ""}</td>
                            <td className="k">{td}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </Region>
              </div>
            ))}
            <p className="f">Plays by players outside the named group are in the team line, not in a player row.</p>
          </details>
        ))}
      </section>

      <section aria-labelledby="wm2-limits">
        <h2 id="wm2-limits">Not shown, and why</h2>
        <ul>
          {a.unsupported.map((u: any) => <li key={u.family}><b>{u.family.replace(/_/g, " ")}</b>: {u.reason}</li>)}
        </ul>
        <h3>Limitations</h3>
        <ul>{a.limitations.map((l: string) => <li key={l}>{l}</li>)}</ul>
        {a.availability.length ? (
          <>
            <h3>Availability used</h3>
            <ul>{a.availability.map((x: any) => <li key={x.playerId}>{x.name} ({x.team}): {x.status ?? x.state}, {x.simulated ? "simulated as playing" : "not simulated"}</li>)}</ul>
          </>
        ) : null}
        <p className="f">
          Inputs: forecast {a.run.inputs.forecastModel} ({a.run.inputs.forecastInputHash}, {a.run.inputs.forecastGeneratedAt}) · injuries as of {a.run.inputs.injuriesAsOf} · player inputs {a.run.inputs.packet} · content {a.contentSha256.slice(0, 12)}. Educational and paper-only.
        </p>
      </section>
    </div>
  );
}
