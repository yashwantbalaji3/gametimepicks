/**
 * SIMULATED GAME OUTCOMES — World Model V2's worlds for this game, counted. The scores in these worlds are drawn
 * from the forecast of record's own margin and total, so the ranges agree with the hero; the win share is a count of
 * the worlds and can differ from the forecast's win chance (which comes from a separate rating) — stated once, here.
 */
import { Histogram } from "@/components/distribution-chart";

const pct = (p: number) => `${(p * 100).toFixed(1)}%`;
const signed = (x: number) => (x > 0 ? `+${x}` : `${x}`);

function binLabel(h: { from: number; width: number; bins: number }, i: number, signedLabels: boolean) {
  const lo = h.from + i * h.width;
  const f = (x: number) => (signedLabels ? signed(x) : String(x));
  if (i === 0) return `≤${f(lo + h.width - 1)}`;
  if (i === h.bins - 1) return `≥${f(lo)}`;
  return f(lo);
}

export default function SimulationPanel({ sim, away, home, recordWinHome }: { sim: any; away: string; home: string; recordWinHome: number }) {
  const w = sim.winProbability;
  const diffPts = Math.round((w.home - recordWinHome) * 1000) / 10;
  const teams: Array<[string, any]> = [[away, sim.teams.away], [home, sim.teams.home]];
  return (
    <section id="simulation" className="nf-section" aria-labelledby="nf-sim-h" data-source="world-model-v2">
      <p className="nf-eyebrow">World Model V2 · {sim.runs.toLocaleString("en-US")} simulated games</p>
      <h2 id="nf-sim-h" className="nf-h2">Simulated game outcomes</h2>
      <p className="nf-sub">
        Each simulated game is complete and consistent: the final score, the scoring plays, both offenses and every player line belong to the same game.
      </p>
      <div className="nf-card" style={{ marginTop: 12 }}>
        <p className="nf-eyebrow">Who won the simulated games</p>
        <div className="nf-split" style={{ marginTop: 8 }} role="img" aria-label={`${away} won ${pct(w.away)}, ${home} won ${pct(w.home)}, tied ${pct(w.tie)}`}>
          <div style={{ width: `${w.away * 100}%`, background: w.away > w.home ? "var(--vault-gold-bright)" : "color-mix(in srgb, var(--vault-text-faint) 70%, transparent)" }} />
          <div style={{ width: `${w.tie * 100}%`, background: "var(--vault-text-mute)" }} />
          <div style={{ flex: 1, background: w.home >= w.away ? "var(--vault-gold-bright)" : "color-mix(in srgb, var(--vault-text-faint) 70%, transparent)" }} />
        </div>
        <p className="nf-sub nf-num" style={{ marginTop: 8 }}>
          {away} {pct(w.away)} · {home} {pct(w.home)} · went to overtime {pct(sim.overtime.levelAfterRegulation)}{w.tie > 0 ? ` · still tied after overtime ${pct(w.tie)}` : ""}
        </p>
        <p className="nf-faint" style={{ margin: "6px 0 0" }}>
          {Math.abs(diffPts) >= 0.5
            ? `This share is counted from the simulated games, which draw the score from the forecast's margin and total; the headline win chance comes from a separate team rating, so the two differ by ${Math.abs(diffPts).toFixed(1)} points for ${home}.`
            : "This share is counted from the simulated games and matches the headline win chance."}
        </p>
      </div>
      <div className="nf-grid2" style={{ marginTop: 12 }}>
        {sim.histograms ? (
          <>
            <div className="nf-card">
              <p className="nf-eyebrow">{home} margin</p>
              <p className="nf-sub nf-num" style={{ marginTop: 4 }}>median {signed(sim.margin.median)} · 8 in 10 between {signed(sim.margin.p10)} and {signed(sim.margin.p90)}</p>
              <div style={{ marginTop: 10 }}>
                <Histogram values={sim.histograms.margin.shares} labelFor={(i) => (i % 2 === 0 || i === sim.histograms.margin.bins - 1 ? binLabel(sim.histograms.margin, i, true) : "")} accent="var(--vault-gold-bright)" height={110} />
              </div>
              <p className="nf-faint" style={{ margin: "6px 0 0" }}>Share of simulated games by {home} margin, in 3-point bands; a minus means {away} won.</p>
            </div>
            <div className="nf-card">
              <p className="nf-eyebrow">Total points</p>
              <p className="nf-sub nf-num" style={{ marginTop: 4 }}>median {sim.total.median} · 8 in 10 between {sim.total.p10} and {sim.total.p90}</p>
              <div style={{ marginTop: 10 }}>
                <Histogram values={sim.histograms.total.shares} labelFor={(i) => (i % 2 === 0 || i === sim.histograms.total.bins - 1 ? binLabel(sim.histograms.total, i, false) : "")} accent="var(--vault-gold-bright)" height={110} />
              </div>
              <p className="nf-faint" style={{ margin: "6px 0 0" }}>Share of simulated games by combined points, in 5-point bands.</p>
            </div>
          </>
        ) : null}
      </div>
      <div className="nf-card" style={{ marginTop: 12 }}>
        <p className="nf-eyebrow">How each team scored, on average</p>
        <div className="nf-scroll" role="region" aria-label="Average scoring and offense per simulated game" tabIndex={0}>
          <table className="nf-table" style={{ marginTop: 6 }}>
            <thead><tr><th scope="col">Per game</th>{teams.map(([t]) => <th key={t} scope="col">{t}</th>)}</tr></thead>
            <tbody>
              <tr><td>Points (median, 80% range)</td>{teams.map(([t, s]) => <td key={t} className="nf-num">{s.points.median} ({s.points.p10}–{s.points.p90})</td>)}</tr>
              <tr><td>Touchdowns</td>{teams.map(([t, s]) => <td key={t} className="nf-num">{(s.scoring.offensiveTd + s.scoring.nonOffensiveTd).toFixed(1)}</td>)}</tr>
              <tr><td>Field goals</td>{teams.map(([t, s]) => <td key={t} className="nf-num">{s.scoring.fieldGoals.toFixed(1)}</td>)}</tr>
              <tr><td>Passing yards</td>{teams.map(([t, s]) => <td key={t} className="nf-num">{Math.round(s.volume.passingYards.median)}</td>)}</tr>
              <tr><td>Rushing yards</td>{teams.map(([t, s]) => <td key={t} className="nf-num">{Math.round(s.volume.rushingYards.median)}</td>)}</tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
