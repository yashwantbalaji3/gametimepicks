/**
 * "What happened" on a settled Premier League match page (founder P1 2026-10-26: Game Simulation and its forecast must
 * be followable through to the result). Server component, no client state.
 *
 * Every figure is the graded record's own (lib/sports/epl/graded-record.ts — the ledger the settler appends to, the
 * rows /results/picks/epl shows): the official full-time score, the probability the graded forecast gave the outcome
 * that happened, and whether the forecast's most likely outcome happened. Nothing is regraded or recomputed here.
 *
 * ONE FORECAST, STATED HONESTLY. The record grades the revision published closest before kickoff. For a few early-season
 * fixtures that revision differs (in the third decimal) from the archived revision this page renders below; where the
 * two differ at the precision printed, the panel says which revision it quotes rather than letting two numbers stand
 * side by side unexplained.
 */
import Link from "next/link";

import type { EplGradedMatch } from "@/lib/sports/epl/graded-record";

type Probs = { home: number; draw: number; away: number };
const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;
const et = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso)) + " ET";

export default function EplMatchWhatHappened({ graded, home, away, pageProbs }: { graded: EplGradedMatch; home: string; away: string; pageProbs: Probs | null }) {
  const a = graded.actual;
  if (!a) return null;
  const outcome = a.outcome === "H" ? `${home} win` : a.outcome === "A" ? `${away} win` : a.outcome === "D" ? "Draw" : null;
  const predicted = graded.predictedOutcome === "H" ? `${home} win` : graded.predictedOutcome === "A" ? `${away} win` : graded.predictedOutcome === "D" ? "a draw" : null;
  const gp = graded.forecastProbs;
  const differs = !!(gp && pageProbs && (["home", "draw", "away"] as const).some((k) => pct(gp[k]) !== pct(pageProbs[k])));
  return (
    <section id="what-happened" aria-labelledby="epl-what-happened-h" className="mt-5" data-epl-what-happened={graded.eventId}
      style={{ background: "var(--vault-panel)", border: "1px solid var(--vault-gold)", borderRadius: 12, padding: "clamp(14px, 2vw, 20px)" }}>
      <p className="font-mono" style={{ margin: 0, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--vault-gold)" }}>What happened · official result</p>
      <h2 id="epl-what-happened-h" style={{ margin: "6px 0 0", fontSize: 22, fontWeight: 800 }}>
        {`Full time: ${home} ${a.homeGoalsFT} – ${a.awayGoalsFT} ${away}`}
      </h2>
      <p style={{ margin: "8px 0 0", fontSize: 13.5, lineHeight: 1.6, color: "var(--vault-text-mute)" }}>
        {outcome ? <><strong style={{ color: "var(--vault-text)" }}>{outcome}.</strong>{" "}</> : null}
        {graded.probabilityOfActual != null ? <>The graded forecast gave this result <strong style={{ color: "var(--vault-text)" }}>{pct(graded.probabilityOfActual)}</strong>. </> : null}
        {predicted && graded.hit != null ? <>Its most likely outcome was {predicted}, which {graded.hit ? "happened" : "did not happen"}. </> : null}
        {a.totalGoals} goal{a.totalGoals === 1 ? "" : "s"} in total.
      </p>
      {differs && gp ? (
        <p style={{ margin: "6px 0 0", fontSize: 12, lineHeight: 1.55, color: "var(--vault-text-faint)" }} data-epl-graded-revision="">
          The record grades the forecast published {graded.forecastGeneratedAt ? et(graded.forecastGeneratedAt) : "before kickoff"} ({home} {pct(gp.home)} · draw {pct(gp.draw)} · {away} {pct(gp.away)}).
          The figures below are another version of the forecast, also saved before kickoff, and differ slightly.
        </p>
      ) : null}
      <p style={{ margin: "8px 0 0", fontSize: 12.5 }}>
        <Link href="/results/picks/epl/" style={{ color: "var(--vault-gold-bright)" }}>Every graded Premier League forecast →</Link>
      </p>
      <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--vault-text-faint)" }}>The forecast below is shown exactly as it was published before kickoff.</p>
    </section>
  );
}
