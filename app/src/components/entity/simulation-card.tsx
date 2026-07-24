/**
 * SimulationCard (Sprint 012 · R9) — the flagship Simulation Explorer card. ONE game, told the way the
 * simulation actually tells it:
 *
 *   Identity      → team logos + names + venue + first pitch
 *   Prediction    → winner, probability, and the FREQUENCY behind it ("5,820 / 10,000 games")
 *   Outcomes      → most-likely scorelines with their frequencies, total-runs median + p10–p90, extras
 *   Player impact → top player predictions with portraits, opponent context, and their own frequencies
 *
 * Presentational ONLY. Every value arrives already computed on the canonical objects (the Sprint 008
 * full-game artifact + the Sprint 009 prediction decision); this component performs no simulation, no
 * prediction logic, and no probability maths beyond formatting probability × runCount into a count.
 * Missing data fails closed — an absent section simply does not render, never a fabricated number.
 */
import Link from "next/link";
import type { FullGameSimGame } from "@/lib/mlb/full-game/types";
import type { GamePredictionDecision } from "@/lib/mlb/prediction/types";
import { GameHeader, PlayerCard } from "@/components/entity";

/** Format a probability + a run count as the honest "N / 10,000 games" frequency. Pure formatting. */
function frequency(probability: number | null | undefined, runCount: number | null | undefined): string | null {
  if (probability == null || runCount == null || runCount <= 0) return null;
  return `${Math.round(probability * runCount).toLocaleString()} / ${runCount.toLocaleString()} games`;
}

export interface SimulationCardInput {
  slug: string;
  href: string;
  homeLogo: string | null;
  awayLogo: string | null;
  firstPitchLabel: string | null;
  game: FullGameSimGame;
  prediction: GamePredictionDecision | null;
}

export default function SimulationCard({ card }: { card: SimulationCardInput }) {
  const { game: g, prediction: p } = card;
  const ready = g.status !== "unavailable" && !!g.winProbability;
  const winnerFreq = p?.moneyline ? frequency(p.moneyline.simulationProbability, g.runCount) : null;

  return (
    <article className="rounded-[14px] px-4 py-4 flex flex-col gap-3" style={{ background: "rgba(26,16,11,0.55)", border: "1px solid var(--vault-border)" }}>
      {/* ── Identity ── */}
      <GameHeader
        homeName={g.homeTeamName}
        awayName={g.awayTeamName}
        homeLogo={card.homeLogo}
        awayLogo={card.awayLogo}
        homeCode={g.homeTeam}
        awayCode={g.awayTeam}
        size="md"
        identityLine={[g.venue, card.firstPitchLabel].filter(Boolean).join(" · ") || null}
        status={
          <span className="font-mono uppercase tracking-[0.1em] rounded-full px-2.5 py-1 whitespace-nowrap"
            style={{ fontSize: 8.5, color: g.status === "ready" ? "var(--vault-success, #7ee2a8)" : "var(--vault-warn, #ea580c)", border: "1px solid var(--vault-rule)" }}>
            {g.runCount ? `${g.runCount.toLocaleString()} sims` : "No sim"}
          </span>
        }
      />

      {!ready ? (
        <p className="text-[12px] m-0" style={{ color: "var(--vault-text-mute)" }}>
          {g.gameStory?.[0] ?? "Not enough pregame data to simulate this game."}
        </p>
      ) : (
        <>
          {/* ── Prediction: the answer + the frequency behind it ── */}
          {p?.predictedWinner && p.moneyline ? (
            <div className="rounded-[10px] px-3 py-2.5 flex items-center justify-between gap-3 flex-wrap"
              style={{ background: "rgba(217,164,65,0.08)", border: "1px solid rgba(217,164,65,0.3)" }}>
              <div className="flex flex-col min-w-0">
                <span className="font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-gold)", fontSize: 8.5 }}>Prediction</span>
                <span className="font-display truncate" style={{ color: "var(--vault-text)", fontSize: 16, fontWeight: 800 }}>
                  {p.predictedWinner.team} <span style={{ color: "var(--vault-text-mute)", fontWeight: 500, fontSize: 13 }}>moneyline</span>
                </span>
              </div>
              <div className="text-right shrink-0">
                <span className="font-mono block" style={{ color: "var(--vault-gold)", fontSize: 14 }}>{Math.round(p.moneyline.simulationProbability * 100)}%</span>
                {winnerFreq ? <span className="font-mono block" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>{winnerFreq}</span> : null}
              </div>
            </div>
          ) : null}

          {/* ── Starting pitchers (from the simulated box score — the same games that produced the score) ── */}
          {g.players?.pitchers?.length ? (
            <div className="flex items-center gap-3 flex-wrap font-mono" style={{ fontSize: 9.5, color: "var(--vault-text-faint)" }}>
              <span className="uppercase tracking-[0.1em]">Starters</span>
              {g.players.pitchers.map((p) => (
                <span key={p.playerId} style={{ color: "var(--vault-text-mute)" }}>
                  {p.name} <span style={{ color: "var(--vault-text-faint)" }}>({p.team})</span>
                </span>
              ))}
            </div>
          ) : null}

          {/* ── Win counts — the raw simulated tally behind the probability ── */}
          <div className="flex items-center justify-between gap-2 rounded-[10px] px-3 py-2" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--vault-rule)" }}>
            <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>Win counts</span>
            <span className="font-mono" style={{ color: "var(--vault-text)", fontSize: 11.5 }}>
              {g.awayTeam} {Math.round(g.winProbability!.away * g.runCount).toLocaleString()} · {g.homeTeam} {Math.round(g.winProbability!.home * g.runCount).toLocaleString()}
            </span>
          </div>

          {/* ── Simulation outcomes ── */}
          <div className="grid grid-cols-2 gap-2">
            {g.finalScores.length ? (
              <div className="rounded-[10px] px-3 py-2" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--vault-rule)" }}>
                <span className="font-mono uppercase tracking-[0.1em] block mb-1" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>Most likely score</span>
                <span className="font-mono" style={{ color: "var(--vault-text)", fontSize: 13 }}>
                  {g.awayTeam} {g.finalScores[0].away} – {g.finalScores[0].home} {g.homeTeam}
                </span>
                <span className="font-mono block" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>
                  {frequency(g.finalScores[0].probability, g.runCount) ?? `${Math.round(g.finalScores[0].probability * 100)}%`}
                </span>
              </div>
            ) : null}
            {g.totalRuns ? (
              <div className="rounded-[10px] px-3 py-2" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--vault-rule)" }}>
                <span className="font-mono uppercase tracking-[0.1em] block mb-1" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>Total runs</span>
                <span className="font-mono" style={{ color: "var(--vault-text)", fontSize: 13 }}>median {g.totalRuns.median}</span>
                <span className="font-mono block" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>
                  p10–p90 {g.totalRuns.p10}–{g.totalRuns.p90}
                  {g.extraInningsProbability != null ? ` · extras ${Math.round(g.extraInningsProbability * 100)}%` : ""}
                </span>
              </div>
            ) : null}
          </div>

          {/* ── Player impact — portraits + opponent context + each player's own frequency ── */}
          {p?.topPlayerPredictions?.length ? (
            <div className="flex flex-col gap-1.5">
              <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>Player impact</span>
              {p.topPlayerPredictions.slice(0, 2).map((pp, i) => (
                <PlayerCard
                  key={`${pp.player}-${pp.market}-${i}`}
                  playerId={pp.playerId ?? null}
                  name={pp.player}
                  team={pp.team}
                  opponent={pp.opponent}
                  sport="mlb"
                  marketLabel={pp.marketLabel}
                  pick={pp.pick}
                  line={pp.line}
                  probabilityPct={pp.simulationProbability * 100}
                  simulationCount={g.runCount}
                />
              ))}
            </div>
          ) : null}
        </>
      )}

      <Link href={card.href} className="font-mono uppercase tracking-[0.1em] self-start" style={{ color: "var(--vault-gold-bright)", fontSize: 9.5, textDecoration: "none" }}>
        Explore this simulation →
      </Link>
    </article>
  );
}
