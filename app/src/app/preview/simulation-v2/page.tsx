/**
 * /preview/simulation-v2 — INTERNAL. The Simulation Center V2 presentation (Session 13 · Phase F) over SHADOW receipts.
 *
 * Renders the NFL drive simulator's shadow receipts (data/internal/research/nfl/sim-v2/shadow/<date>/<eventId>.json):
 * score center, margin / total distributions, quarters and halves, team and player distributions, the first-TD
 * distribution and the labelled REPRESENTATIVE SIMULATED GAMES — every number a count over the same coherent runs.
 *
 * Internal by construction: guardInternalRoute() 404s it in the production export and /preview is pruned from out/.
 * Nothing here is public until the engine passes its validation contract and the founder/model gate
 * (docs/SIMULATION_ENGINE_V2.md §7) — the public NFL label "EXPECTED STATISTICAL SUMMARIES · NOT ONE SIMULATED GAME"
 * stays true meanwhile. No sportsbook number is shown: the receipt carries none.
 */
import fs from "node:fs";
import path from "node:path";

import { guardInternalRoute } from "@/lib/internal-route-guard";
import { withRouteMetadata } from "@/lib/seo/route-metadata";

export const metadata = withRouteMetadata("/preview/simulation-v2/", {
  title: "Internal Preview · Simulation Engine V2 (shadow)",
  robots: { index: false, follow: false },
});

const SHADOW_DIR = path.resolve(process.cwd(), "..", "data/internal/research/nfl/sim-v2/shadow");

function readReceipts(): any[] {
  if (!fs.existsSync(SHADOW_DIR)) return [];
  const out: any[] = [];
  for (const d of fs.readdirSync(SHADOW_DIR).sort().reverse()) {
    const dir = path.join(SHADOW_DIR, d);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) out.push(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
  }
  return out;
}

const CSS = `
.sv table{width:100%;border-collapse:collapse}
.sv th{text-align:left;padding:6px 8px;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--vault-text-faint);white-space:nowrap}
.sv td{padding:6px 8px;border-top:1px solid var(--vault-border);font-size:12.5px;vertical-align:top}
.sv .k{font-family:var(--font-mono,ui-monospace,monospace);font-size:12px}
.sv .m{color:var(--vault-text-mute)}
.sv .f{color:var(--vault-text-faint);font-size:11px}
.sv .scroll{overflow-x:auto;position:relative;margin-top:6px}
.sv section{margin-top:22px}
.sv h2{font-size:22px;margin:0;color:var(--vault-text)}
.sv h3{font-size:15px;margin:0 0 4px;color:var(--vault-text)}
.sv .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-top:10px}
.sv .tile{border:1px solid var(--vault-border-strong);border-radius:10px;padding:10px 12px;background:var(--gtp-card)}
.sv .tile b{display:block;font-size:19px;color:var(--vault-text)}
.sv .tile span{font-size:11px;color:var(--vault-text-mute)}
.sv .bars{display:flex;align-items:flex-end;gap:1px;height:90px;margin-top:8px}
.sv .bar{flex:1;background:var(--vault-gold);opacity:.75;min-width:2px}
.sv .bar.mid{opacity:1;background:var(--gtp-bank-heat)}
.sv .warn{border:1px solid var(--vault-warn);border-radius:10px;padding:10px 12px;color:var(--vault-text);font-size:12.5px}
`;

const pct = (v: number | null | undefined) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);
const q = (d: any) => (d ? `${d.p50} (${d.p10}–${d.p90})` : "—");

/** Fold a value histogram into buckets of `width` for a compact bar chart. */
function buckets(hist: any[], width: number) {
  const m = new Map<number, number>();
  for (const h of hist ?? []) {
    const b = Math.floor(h.value / width) * width;
    m.set(b, (m.get(b) ?? 0) + h.probability);
  }
  return [...m.entries()].sort((a, b) => a[0] - b[0]);
}

function Bars({ hist, width, median, label }: { hist: any[]; width: number; median: number; label: string }) {
  const bs = buckets(hist, width);
  const max = Math.max(...bs.map(([, p]) => p), 0.0001);
  return (
    <figure style={{ margin: 0 }}>
      <div className="bars" role="img" aria-label={`${label} distribution; median ${median}`}>
        {bs.map(([b, p]) => <div key={b} className={`bar${median >= b && median < b + width ? " mid" : ""}`} style={{ height: `${(p / max) * 100}%` }} title={`${b} to ${b + width - 1}: ${(p * 100).toFixed(1)}%`} />)}
      </div>
      <figcaption className="f">{label}: buckets of {width}; highlighted bar holds the median ({median}). {bs[0]?.[0]} … {bs[bs.length - 1]?.[0]}</figcaption>
    </figure>
  );
}

const TEAM_STATS: Array<[string, string]> = [["plays", "Plays"], ["drives", "Drives"], ["passAtt", "Pass attempts"], ["cmp", "Completions"], ["passYds", "Passing yards"], ["sacks", "Sacks"], ["rushAtt", "Rush attempts"], ["rushYds", "Rushing yards"], ["passTd", "Passing TDs"], ["rushTd", "Rushing TDs"], ["int", "Interceptions"], ["fgMade", "Field goals"]];

export default function SimulationV2Preview() {
  guardInternalRoute();
  const receipts = readReceipts();
  return (
    <div className="vault-page-shell px-4 sm:px-8 py-6 sm:py-10 overflow-x-hidden sv">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <p className="f" style={{ textTransform: "uppercase", letterSpacing: ".14em" }}>Internal preview · not public</p>
      <h1 className="font-display m-0" style={{ fontSize: 28, color: "var(--vault-text)" }}>Simulation Engine V2 · shadow receipts</h1>
      <div className="warn" style={{ marginTop: 10 }}>
        SHADOW. Each run below is one coherent simulated game (drives, scoring events, team and player totals that agree). The engine
        is <b>COHERENT_BUT_NOT_PROMOTED</b>: on 821 held-out games its win probability scored worse than the published model
        (Brier 0.2273 vs 0.2217) and it under-weights key numbers and overtime. Public NFL pages keep their current models and label.
      </div>
      {!receipts.length ? <p className="m">No shadow receipt has been written yet.</p> : null}
      {receipts.map((r) => {
        const a = r.aggregate;
        const players = (r.playerStatDistributions ?? []).filter((p: any) => p.playerId !== "OTHER");
        const top = (team: string, key: string) => players.filter((p: any) => p.team === team && p.stats?.[key]).sort((x: any, y: any) => (y.stats[key].mean ?? 0) - (x.stats[key].mean ?? 0)).slice(0, 4);
        return (
          <section key={r.simulationReceiptId} aria-labelledby={`sv-${r.eventId}`}>
            <h2 id={`sv-${r.eventId}`} className="font-display">{r.away.abbr} @ {r.home.abbr}</h2>
            <p className="f">
              Kickoff {String(r.eventStart).replace("T", " ")} · {r.simulationEngine} {r.simulationEngineVersion} · {r.runCount.toLocaleString("en-US")} runs ·
              incoherent runs {r.validation.failedRuns} · seed {r.baseSeed} · anchors {r.calibration.anchors.home.toFixed(1)}–{r.calibration.anchors.away.toFixed(1)} from {r.modelVersion?.forecastModel} · generated {String(r.generatedAt).slice(0, 16)}Z
            </p>
            <div className="grid">
              <div className="tile"><b>{pct(a.winProbability.home)} · {pct(a.winProbability.away)}</b><span>{r.home.abbr} wins · {r.away.abbr} wins (tie {pct(a.winProbability.tie)})</span></div>
              <div className="tile"><b>{a.score.home.p50}–{a.score.away.p50}</b><span>median score ({r.home.abbr}–{r.away.abbr}); 80% ranges {a.score.home.p10}–{a.score.home.p90} / {a.score.away.p10}–{a.score.away.p90}</span></div>
              <div className="tile"><b>{a.margin.p50 > 0 ? "+" : ""}{a.margin.p50}</b><span>median margin ({r.home.abbr} view), 80%: {a.margin.p10} to {a.margin.p90}</span></div>
              <div className="tile"><b>{a.total.p50}</b><span>median total, 80%: {a.total.p10}–{a.total.p90}</span></div>
              <div className="tile"><b>{pct(a.overtimeProbability)}</b><span>overtime (emerges from regulation ties)</span></div>
            </div>
            <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))" }}>
              <Bars hist={a.marginHistogram} width={3} median={a.margin.p50} label={`Final margin (${r.home.abbr} − ${r.away.abbr})`} />
              <Bars hist={a.totalHistogram} width={4} median={a.total.p50} label="Final total" />
            </div>

            <h3 style={{ marginTop: 16 }}>Quarters and halves — from the same game paths</h3>
            <div className="scroll"><table>
              <thead><tr><th scope="col">Period</th><th scope="col">{r.home.abbr} mean</th><th scope="col">{r.away.abbr} mean</th><th scope="col">Total (80%)</th><th scope="col">{r.home.abbr} wins it</th><th scope="col">{r.away.abbr} wins it</th><th scope="col">Level</th></tr></thead>
              <tbody>{r.periodAggregates.map((p: any) => (
                <tr key={p.period}><td className="k">{p.period}</td><td className="k">{p.home.mean}</td><td className="k">{p.away.mean}</td><td className="k">{p.total.mean} ({p.total.p10}–{p.total.p90})</td><td className="k">{pct(p.homeWins)}</td><td className="k">{pct(p.awayWins)}</td><td className="k">{pct(p.level)}</td></tr>
              ))}</tbody>
            </table></div>

            <h3 style={{ marginTop: 16 }}>Team box — median (80% range)</h3>
            <div className="scroll"><table>
              <thead><tr><th scope="col">Stat</th><th scope="col">{r.home.abbr}</th><th scope="col">{r.away.abbr}</th></tr></thead>
              <tbody>{TEAM_STATS.map(([k, label]) => (
                <tr key={k}><td>{label}</td><td className="k">{q(r.teamStatDistributions.home[k])}</td><td className="k">{q(r.teamStatDistributions.away[k])}</td></tr>
              ))}</tbody>
            </table></div>

            {[r.home.abbr, r.away.abbr].map((team: string) => (
              <div key={team}>
                <h3 style={{ marginTop: 16 }}>{team} players — median (80% range) · touchdown chances counted over the same runs</h3>
                <div className="scroll"><table>
                  <thead><tr><th scope="col">Player</th><th scope="col">Pass yds</th><th scope="col">Pass TD</th><th scope="col">Rush att</th><th scope="col">Rush yds</th><th scope="col">Rec</th><th scope="col">Rec yds</th><th scope="col">Anytime TD</th><th scope="col">2+ TD</th></tr></thead>
                  <tbody>{[...new Map([...top(team, "passYds"), ...top(team, "rushYds"), ...top(team, "recYds")].map((p: any) => [p.playerId, p])).values()].map((p: any) => (
                    <tr key={p.playerId}>
                      <td>{p.name} <span className="f">{p.position}</span></td>
                      <td className="k">{q(p.stats.passYds)}</td><td className="k">{p.stats.passTd?.mean ?? "—"}</td>
                      <td className="k">{p.stats.rushAtt?.mean ?? "—"}</td><td className="k">{q(p.stats.rushYds)}</td>
                      <td className="k">{p.stats.rec?.mean ?? "—"}</td><td className="k">{q(p.stats.recYds)}</td>
                      <td className="k">{pct(p.anytimeTd)}</td><td className="k">{pct(p.twoPlusTd)}</td>
                    </tr>
                  ))}</tbody>
                </table></div>
              </div>
            ))}

            <h3 style={{ marginTop: 16 }}>First touchdown scorer</h3>
            <p className="m" style={{ fontSize: 12.5, margin: 0 }}>
              {r.scoringEventDistributions.firstTdScorer.slice(0, 8).map((s: any) => `${s.name} (${s.team}) ${pct(s.probability)}`).join(" · ")} · no touchdown {pct(r.scoringEventDistributions.teamFirstTd.none)}
            </p>

            <h3 style={{ marginTop: 16 }}>Representative simulated games — illustrations, not the forecast</h3>
            {r.representativeRuns.map((g: any) => (
              <details key={g.kind} style={{ borderTop: "1px solid var(--vault-border)", padding: "6px 0" }}>
                <summary style={{ cursor: "pointer", fontSize: 13, color: "var(--vault-text)", minHeight: 32 }}>
                  {g.label} · {g.kind.replace(/_/g, " ").toLowerCase()} · run {g.runIndex}: {r.home.abbr} {g.final.home} – {g.final.away} {r.away.abbr}{g.final.overtime ? " (OT)" : ""}
                </summary>
                <p className="f">Quarters {r.home.abbr} {g.quarters.home.join("/")} · {r.away.abbr} {g.quarters.away.join("/")}. {g.note}</p>
                <div className="scroll"><table>
                  <thead><tr><th scope="col">Q</th><th scope="col">Clock</th><th scope="col">Offense</th><th scope="col">Start (yds to goal)</th><th scope="col">Result</th><th scope="col">Plays</th><th scope="col">Yards</th><th scope="col">Score after</th></tr></thead>
                  <tbody>{g.drives.map((d: any, i: number) => (
                    <tr key={i}><td className="k">{d.q === 5 ? "OT" : d.q}</td><td className="k">{Math.floor((d.clockStart % 900 || (d.clockStart ? 900 : 0)) / 60)}:{String((d.clockStart % 60)).padStart(2, "0")}</td><td>{d.offense === 0 ? r.home.abbr : r.away.abbr}</td><td className="k">{d.startYardsToGoal}</td><td className="k">{d.result.replace(/_/g, " ")}</td><td className="k">{d.plays}</td><td className="k">{d.netYards}</td><td className="k">{d.score[0]}–{d.score[1]}</td></tr>
                  ))}</tbody>
                </table></div>
              </details>
            ))}
          </section>
        );
      })}
    </div>
  );
}
