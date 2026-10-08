/**
 * MODEL DETAILS — progressive disclosure. Everything technical about this game's numbers in one place: which model
 * produced which number, versions, timestamps, input cutoffs, simulation count, evaluation status, unsupported
 * markets and limitations. The dashboard above reads without it.
 */
const ts = (iso: string | null | undefined) => (iso ? `${iso.slice(0, 16).replace("T", " ")} UTC` : "—");

const LADDER: Array<[string, string]> = [["developmentTested", "Tested on past seasons"], ["prospectivelyCaptured", "Frozen before kickoff and recorded"], ["forwardEvaluated", "Graded on games played since"], ["productEligible", "Eligible for picks products"], ["productionPromoted", "Promoted as the official forecast"]];

export default function Methodology({ view, status, started, calibration }: { view: any; status: any; started: boolean; calibration?: string }) {
  const sim = view.simulation;
  const r = view.record;
  return (
    <section id="model-details" className="nf-section" aria-labelledby="nf-md-h">
      <p className="nf-eyebrow">Methodology</p>
      <h2 id="nf-md-h" className="nf-h2">How these numbers are made</h2>
      <details className="nf-details" style={{ marginTop: 8 }}>
        <summary>Sources, versions, timestamps and evaluation status</summary>
        <div className="nf-scroll" role="region" aria-label="Which model produced which number" tabIndex={0}>
          <table className="nf-table">
            <thead><tr><th scope="col">Number</th><th scope="col">Model</th><th scope="col">Version / run</th><th scope="col">Produced</th></tr></thead>
            <tbody>
              <tr><td>Win chance, projected score, margin, total</td><td>Game Time Forecast</td><td className="nf-num">{r.modelId}</td><td className="nf-num">{ts(r.generatedAt)}</td></tr>
              {sim ? <tr><td>Simulated outcomes, sampled games, passing / rushing / receiving yards, receptions</td><td>World Model V2</td><td className="nf-num">{sim.version} · run {sim.simulationId} · {sim.runs.toLocaleString("en-US")} games</td><td className="nf-num">{ts(sim.generatedAt)}</td></tr> : null}
              <tr><td>Anytime touchdown</td><td>Touchdown model (player board)</td><td className="nf-num">opportunity model</td><td className="nf-num">{ts(view.players.find((p: any) => p.families.anytimeTd)?.families.anytimeTd.asOf)}</td></tr>
            </tbody>
          </table>
        </div>
        <p className="nf-sub">
          The Game Time Forecast rates both teams from past results and play efficiency and produces the win chance and the score centre. World Model V2 simulates {sim ? sim.runs.toLocaleString("en-US") : "10,000"} complete games: each one draws a final score around that centre, splits it into touchdowns, kicks and safeties, gives each offense its passes and carries, and hands those to the players expected to be active — so in every simulated game the passing yards equal the receivers&apos; yards and every touchdown has a ball carrier or receiver. Player projections are counted from those games.
          {calibration ? ` ${calibration}` : ""}
          {started ? " This game has kicked off: everything shown is the last version produced before kickoff." : " Until kickoff a later run may update these numbers when an input changes (each version is kept); at kickoff the last version is frozen."}
        </p>
        {sim ? (
          <>
            <p className="nf-sub"><strong style={{ color: "var(--vault-text)" }}>Inputs as of:</strong> forecast {ts(sim.inputs.forecastGeneratedAt)} · injuries {ts(sim.inputs.injuriesAsOf)} · rosters {ts(sim.inputs.rostersGeneratedAt)} · player history through the last completed week ({sim.inputs.packet?.split("/").pop()}).</p>
            {sim.quarterbacks ? <p className="nf-sub"><strong style={{ color: "var(--vault-text)" }}>Quarterbacks:</strong> {Object.entries(sim.quarterbacks).map(([t, q]: [string, any]) => `${t} ${q.passer?.name ?? "not resolved"}`).join(" · ")} (depth chart; the first quarterback not ruled out throws).</p> : null}
            <div className="nf-scroll" role="region" aria-label="Evaluation status" tabIndex={0}>
              <table className="nf-table" style={{ marginTop: 8 }}>
                <tbody>
                  {LADDER.map(([k, label]) => status?.[k] ? <tr key={k}><td>{label}</td><td className="nf-num">{status[k].value ? "Yes" : "Not yet"}</td><td className="nf-faint">{status[k].scope}</td></tr> : null)}
                </tbody>
              </table>
            </div>
            <p className="nf-sub"><strong style={{ color: "var(--vault-text)" }}>Not published:</strong></p>
            <ul className="nf-sub" style={{ paddingLeft: 18 }}>
              {sim.unsupported.map((u: any) => <li key={u.family}>{u.family.replace(/_/g, " ")}: {u.reason}</li>)}
              <li>First touchdown scorer: needs the order of scoring plays, which the simulated games do not record.</li>
            </ul>
            <p className="nf-sub"><strong style={{ color: "var(--vault-text)" }}>Known limitations:</strong></p>
            <ul className="nf-sub" style={{ paddingLeft: 18 }}>
              {sim.limitations.map((l: string) => <li key={l}>{l}</li>)}
            </ul>
            {sim.availability?.length ? <p className="nf-sub"><strong style={{ color: "var(--vault-text)" }}>Availability used:</strong> {sim.availability.map((x: any) => `${x.name} (${x.team}, ${x.status ?? x.state}${x.simulated ? ", simulated as playing" : ", not simulated"})`).join("; ")}.</p> : null}
            <p className="nf-faint">{sim.diagnostics.teamWorldsChecked.toLocaleString("en-US")} simulated team-games checked for consistency, {sim.diagnostics.invariantViolations} inconsistent.</p>
          </>
        ) : <p className="nf-sub">No World Model V2 simulation is available for this game; simulated outcomes and player projections from it are not shown.</p>}
      </details>
    </section>
  );
}
