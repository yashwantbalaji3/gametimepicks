"use client";

/**
 * MLB FULL-GAME REPORT (Sprint 008 · Phase 5). The consumer game report, reorganized GAME-FIRST around the
 * new full-game simulation. The Overview tab (default) answers the baseball question in seconds — who wins,
 * what score, how many runs, the run-line — all from 10,000 complete simulated games. Player depth, props,
 * settlement, and paper-product eligibility live in the "Players & Props" tab (the existing report, demoted
 * out of the default flow). The sportsbook market is a clearly-labelled COMPARISON column, never the
 * headline. No claim to out-perform the book is made anywhere here.
 */

import { useId, useState, type ReactNode } from "react";
import PlayerAvatar from "@/components/player-avatar";
import { PlayerCard } from "@/components/entity";
import type { FullGameSimGame } from "@/lib/mlb/full-game/types";
import type { FullGameArtifactMeta } from "@/lib/mlb/full-game/read";
import type { GamePredictionDecision } from "@/lib/mlb/prediction/types";
import { formatEtTime } from "@/lib/mlb/public-provenance";

const int0 = (n: number): string => Math.round(n).toLocaleString();

type TabKey = "overview" | "box" | "players" | "methodology";

/** A short, non-hype rendering of a simulation-strength label. */
const shortStrength = (s: string | null | undefined): string =>
  s ? s.replace(" SIMULATION", "") : "";

const pct = (p: number | null | undefined): string => (typeof p === "number" ? `${Math.round(p * 100)}%` : "—");
const one = (n: number | null | undefined): string => (typeof n === "number" && Number.isFinite(n) ? n.toFixed(1) : "—");

function Chip({ children, tone = "mute" }: { children: ReactNode; tone?: "ok" | "warn" | "mute" }) {
  const color = tone === "ok" ? "var(--vault-success, #7ee2a8)" : tone === "warn" ? "var(--vault-warn, #ea580c)" : "var(--vault-text-mute)";
  const border = tone === "ok" ? "rgba(46,160,102,0.4)" : tone === "warn" ? "rgba(234,88,12,0.4)" : "var(--vault-rule)";
  return (
    <span className="font-mono uppercase tracking-[0.1em] rounded-full px-2.5 py-1" style={{ fontSize: 9, color, border: `1px solid ${border}` }}>
      {children}
    </span>
  );
}

/** A horizontal two-sided probability bar (away vs home). */
function WinBar({ awayCode, homeCode, away, home }: { awayCode: string; homeCode: string; away: number; home: number }) {
  const aw = Math.round(away * 100);
  const hm = 100 - aw;
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5 font-mono" style={{ fontSize: 12 }}>
        <span style={{ color: "var(--vault-text)" }}>
          {awayCode} <strong style={{ color: aw >= hm ? "var(--vault-gold)" : "var(--vault-text-mute)" }}>{aw}%</strong>
        </span>
        <span style={{ color: "var(--vault-text)" }}>
          <strong style={{ color: hm > aw ? "var(--vault-gold)" : "var(--vault-text-mute)" }}>{hm}%</strong> {homeCode}
        </span>
      </div>
      <div className="flex h-2.5 rounded-full overflow-hidden" style={{ background: "var(--vault-rule)" }} role="img" aria-label={`${awayCode} ${aw} percent, ${homeCode} ${hm} percent win probability`}>
        <div style={{ width: `${aw}%`, background: "var(--vault-text-mute)" }} />
        <div style={{ width: `${hm}%`, background: "var(--vault-gold)" }} />
      </div>
    </div>
  );
}

/** A compact histogram over integer bins (total runs / run differential). */
function MiniHistogram({ bins, accent = "var(--vault-gold)", label }: { bins: { value: number; label: string; probability: number }[]; accent?: string; label: string }) {
  const max = Math.max(...bins.map((b) => b.probability), 0.0001);
  return (
    <div>
      <div className="flex items-end gap-[2px]" style={{ height: 64 }} role="img" aria-label={label}>
        {bins.map((b) => (
          <div key={b.value} className="flex-1 flex flex-col justify-end" title={`${b.label}: ${Math.round(b.probability * 100)}%`}>
            <div style={{ height: `${Math.max(2, (b.probability / max) * 100)}%`, background: accent, opacity: 0.35 + 0.65 * (b.probability / max), borderRadius: "2px 2px 0 0" }} />
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-1 font-mono" style={{ fontSize: 8.5, color: "var(--vault-text-faint)" }}>
        {bins.filter((_, i) => i % Math.ceil(bins.length / 6) === 0 || i === bins.length - 1).map((b) => (
          <span key={b.value}>{b.label}</span>
        ))}
      </div>
    </div>
  );
}

function StatTile({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-[10px] px-3 py-2.5" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--vault-border)" }}>
      <span className="font-mono uppercase tracking-[0.1em] block" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>{label}</span>
      <span className="font-display block" style={{ color: "var(--vault-text)", fontSize: 20, fontWeight: 800, lineHeight: 1.1 }}>{value}</span>
      {sub ? <span className="font-mono block mt-0.5" style={{ color: "var(--vault-text-mute)", fontSize: 10 }}>{sub}</span> : null}
    </div>
  );
}

/** One of the three primary market prediction cards (Moneyline / Total / Run Line). */
function PredictionCard({ label, pick, prob, strength, unavailable }: { label: string; pick: string; prob: string; strength: string; unavailable?: string }) {
  return (
    <div className="rounded-[12px] px-3 py-3 flex flex-col gap-1" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--vault-border)" }}>
      <span className="font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>{label}</span>
      {unavailable ? (
        <>
          <span className="font-display" style={{ color: "var(--vault-text-mute)", fontSize: 15, fontWeight: 700 }}>Unavailable</span>
          <span style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>{unavailable}</span>
        </>
      ) : (
        <>
          <span className="font-display" style={{ color: "var(--vault-text)", fontSize: 17, fontWeight: 800, lineHeight: 1.1 }}>{pick}</span>
          <span className="font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 10 }}>{prob}</span>
          <span className="font-mono uppercase tracking-[0.08em] mt-0.5" style={{ color: "var(--vault-gold)", fontSize: 8.5 }}>{strength}</span>
        </>
      )}
    </div>
  );
}

/** The prediction-first hero: the direct answers the simulation gives, before any probability evidence. */
function PredictionHero({ p, runCount }: { p: GamePredictionDecision; runCount?: number | null }) {
  if (!p.predictedWinner || !p.projectedScore) return null;
  const winnerName = p.predictedWinner.side === "home" ? p.homeTeamName : p.awayTeamName;
  const ml = p.moneyline;
  const total = p.total;
  const rl = p.runLine;
  return (
    <section className="rounded-[16px] px-4 py-4 flex flex-col gap-3" style={{ background: "linear-gradient(180deg, rgba(217,164,65,0.10), rgba(217,164,65,0.03))", border: "1px solid rgba(217,164,65,0.35)" }}>
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <span className="font-mono uppercase tracking-[0.16em]" style={{ color: "var(--vault-gold)", fontSize: 10 }}>GameTimePicks prediction</span>
        <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>from 10,000 simulated games</span>
      </div>
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <span className="font-display" style={{ color: "var(--vault-text)", fontSize: 26, fontWeight: 800, lineHeight: 1.05 }}>{winnerName}</span>
        <div className="text-right">
          <div className="font-display" style={{ color: "var(--vault-text)", fontSize: 18, fontWeight: 800 }}>
            {p.homeTeam} {p.projectedScore.home} – {p.awayTeam} {p.projectedScore.away}
          </div>
          <div className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>{p.projectedScore.label}</div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <PredictionCard label="Moneyline" pick={ml ? ml.team : "—"} prob={ml ? `${Math.round(ml.simulationProbability * 100)}% simulations` : ""} strength={shortStrength(ml?.strengthLabel)} />
        {total && total.pick !== "UNAVAILABLE" ? (
          <PredictionCard
            label="Total"
            pick={`${total.pick} ${total.line}`}
            prob={`${Math.round((total.pick === "OVER" ? total.overProbability ?? 0 : total.underProbability ?? 0) * 100)}% ${total.pick === "OVER" ? "over" : "under"}`}
            strength={shortStrength(total.strengthLabel)}
          />
        ) : (
          <PredictionCard label="Total" pick="" prob="" strength="" unavailable={total?.unavailableReason ?? "No line"} />
        )}
        {rl ? (
          <PredictionCard label="Run line" pick={rl.pick} prob={`${Math.round(rl.coverProbability * 100)}% cover`} strength={shortStrength(rl.strengthLabel)} />
        ) : (
          <PredictionCard label="Run line" pick="" prob="" strength="" unavailable="Unavailable" />
        )}
      </div>
      {p.topPlayerPredictions.length ? (
        <div>
          <span className="font-mono uppercase tracking-[0.12em] block mb-1.5" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>Top player predictions</span>
          <div className="flex flex-col gap-1">
            {p.topPlayerPredictions.map((pp, i) => (
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
                simulationCount={runCount ?? null}
              />
            ))}
          </div>
          <span className="font-mono block mt-1" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>Direction from simulated probability across 10,000 games · legacy prop engine · not a bet</span>
        </div>
      ) : null}
    </section>
  );
}

/** The SimTheGame-style outcome center: raw simulation counts + the most-common final scores. */
function SimulationOutcomeCenter({ g, awayCode, homeCode }: { g: FullGameSimGame; awayCode: string; homeCode: string }) {
  if (!g.winProbability || !g.runCount) return null;
  const N = g.runCount;
  const awayWins = g.winProbability.away * N;
  const homeWins = g.winProbability.home * N;
  const extras = g.extraInningsProbability != null ? Math.round(g.extraInningsProbability * N) : null;
  return (
    <section className="rounded-[14px] px-4 py-4 flex flex-col gap-3" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--vault-border)" }}>
      <div className="font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-gold)", fontSize: 9.5 }}>Simulation outcomes · {int0(N)} complete games</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <StatTile label={`${awayCode} wins`} value={int0(awayWins)} sub={`of ${int0(N)} games`} />
        <StatTile label={`${homeCode} wins`} value={int0(homeWins)} sub={`of ${int0(N)} games`} />
        {extras != null ? <StatTile label="Extra innings" value={int0(extras)} sub="past nine" /> : null}
      </div>
      {g.finalScores.length ? (
        <div>
          <div className="font-mono uppercase tracking-[0.1em] mb-1.5" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>Most likely final scores</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {g.finalScores.slice(0, 6).map((fs) => (
              <div key={`${fs.away}-${fs.home}`} className="flex items-center justify-between rounded-[8px] px-2.5 py-1.5" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--vault-rule)" }}>
                <span className="font-mono text-[12px]" style={{ color: "var(--vault-text)" }}>{awayCode} {fs.away} – {fs.home} {homeCode}</span>
                <span className="font-mono" style={{ color: "var(--vault-gold)", fontSize: 10 }}>{Math.round(fs.probability * 100)}%</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Overview({ g, prediction, awayCode, homeCode }: { g: FullGameSimGame; prediction: GamePredictionDecision | null; awayCode: string; homeCode: string }) {
  if (!g.winProbability || !g.runs || !g.totalRuns) return null;
  const rl15 = g.runLine.find((r) => r.line === 1.5);
  const favHomeRL = (rl15?.homeCover ?? 0) >= (rl15?.awayCover ?? 0);
  return (
    <div className="flex flex-col gap-4">
      {/* PREDICTION FIRST — the direct answers, before any probability evidence. */}
      {prediction ? <PredictionHero p={prediction} runCount={g.runCount} /> : null}

      {/* Everything below is EVIDENCE for the prediction above. */}
      <div className="flex items-center gap-2 mt-1">
        <span className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>Evidence</span>
        <div className="flex-1 h-px" style={{ background: "var(--vault-rule)" }} />
      </div>

      {/* Win probability */}
      <section className="rounded-[14px] px-4 py-4" style={{ background: "rgba(217,164,65,0.05)", border: "1px solid rgba(217,164,65,0.25)" }}>
        <div className="font-mono uppercase tracking-[0.12em] mb-2.5" style={{ color: "var(--vault-gold)", fontSize: 9.5 }}>Win probability · 10,000 simulated games</div>
        <WinBar awayCode={awayCode} homeCode={homeCode} away={g.winProbability.away} home={g.winProbability.home} />
      </section>

      {/* Simulation outcome center — raw counts + most-likely scorelines (SimTheGame-style) */}
      <SimulationOutcomeCenter g={g} awayCode={awayCode} homeCode={homeCode} />

      {/* Expected score + total */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatTile label="Expected runs (mean)" value={`${one(g.runs.away.mean)}–${one(g.runs.home.mean)}`} sub={`${awayCode}–${homeCode}`} />
        <StatTile label={`${awayCode} range`} value={`${g.runs.away.p10}–${g.runs.away.p90}`} sub="p10–p90 runs" />
        <StatTile label={`${homeCode} range`} value={`${g.runs.home.p10}–${g.runs.home.p90}`} sub="p10–p90 runs" />
        <StatTile label="Total runs" value={g.totalRuns.median} sub={`p10–p90 ${g.totalRuns.p10}–${g.totalRuns.p90}`} />
      </div>

      {/* Run line + team totals */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="rounded-[10px] px-3 py-2.5" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--vault-border)" }}>
          <span className="font-mono uppercase tracking-[0.1em] block mb-1" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>Run line (from simulated margins)</span>
          <span className="text-[13px]" style={{ color: "var(--vault-text)" }}>
            {favHomeRL ? homeCode : awayCode} −1.5 covers <strong style={{ color: "var(--vault-gold)" }}>{pct(favHomeRL ? rl15?.homeCover : rl15?.awayCover)}</strong> of the time
          </span>
        </div>
        <div className="rounded-[10px] px-3 py-2.5" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--vault-border)" }}>
          <span className="font-mono uppercase tracking-[0.1em] block mb-1" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>Extra innings</span>
          <span className="text-[13px]" style={{ color: "var(--vault-text)" }}>{pct(g.extraInningsProbability)} of games go past nine</span>
        </div>
      </div>

      {/* Total runs distribution */}
      <section>
        <div className="font-mono uppercase tracking-[0.1em] mb-2" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>Total-runs distribution</div>
        <MiniHistogram bins={g.totalRuns.distribution} label={`Total runs distribution, median ${g.totalRuns.median}`} />
      </section>

      {/* Game story */}
      <section className="rounded-[12px] px-4 py-3" style={{ background: "rgba(46,160,102,0.06)", border: "1px solid rgba(46,160,102,0.22)" }}>
        <div className="font-mono uppercase tracking-[0.12em] mb-1.5" style={{ color: "var(--vault-success, #7ee2a8)", fontSize: 9 }}>What the simulation says</div>
        <p className="text-[12.5px] leading-relaxed m-0" style={{ color: "var(--vault-text-mute)" }}>{g.gameStory.join(" ")}</p>
      </section>

      {/* OUR SIMULATION vs MARKET — comparison only, clearly separated */}
      {g.market ? (
        <section className="rounded-[12px] overflow-hidden" style={{ border: "1px solid var(--vault-border)" }}>
          <div className="grid grid-cols-2">
            <div className="px-4 py-2" style={{ background: "rgba(217,164,65,0.08)" }}>
              <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-gold)", fontSize: 9 }}>Our simulation</span>
            </div>
            <div className="px-4 py-2" style={{ background: "rgba(255,255,255,0.03)", borderLeft: "1px solid var(--vault-border)" }}>
              <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-mute)", fontSize: 9 }}>Market snapshot (the book)</span>
            </div>
          </div>
          {[
            { label: `${homeCode} win`, ours: pct(g.winProbability.home), mkt: pct(g.market.moneyline?.home) },
            { label: "Total (median vs line)", ours: String(g.totalRuns.median), mkt: g.market.total?.line != null ? String(g.market.total.line) : "—" },
            { label: `${homeCode} −1.5 cover`, ours: pct(rl15?.homeCover), mkt: pct(g.market.runLine?.homeCover) },
          ].map((row) => (
            <div key={row.label} className="grid grid-cols-2" style={{ borderTop: "1px solid var(--vault-rule)" }}>
              <div className="px-4 py-2 flex items-center justify-between">
                <span className="text-[11px]" style={{ color: "var(--vault-text-faint)" }}>{row.label}</span>
                <span className="font-mono text-[13px]" style={{ color: "var(--vault-text)" }}>{row.ours}</span>
              </div>
              <div className="px-4 py-2 flex items-center justify-between" style={{ borderLeft: "1px solid var(--vault-border)" }}>
                <span className="text-[11px]" style={{ color: "var(--vault-text-faint)" }}>market</span>
                <span className="font-mono text-[13px]" style={{ color: "var(--vault-text-mute)" }}>{row.mkt}</span>
              </div>
            </div>
          ))}
          {prediction?.moneyline ? (
            <div className="px-4 py-2 flex items-center justify-between" style={{ borderTop: "1px solid var(--vault-rule)", background: "rgba(255,255,255,0.015)" }}>
              <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>Relationship</span>
              <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-mute)", fontSize: 10 }}>{prediction.moneyline.marketAgreement}</span>
            </div>
          ) : null}
          <p className="font-mono px-4 py-2 m-0" style={{ fontSize: 9.5, color: "var(--vault-text-faint)", borderTop: "1px solid var(--vault-rule)" }}>
            The market column is the de-vigged sportsbook price, shown for comparison. It is never an input to our simulation, and we do not claim to beat it.
          </p>
        </section>
      ) : null}
    </div>
  );
}

function BoxScore({ g }: { g: FullGameSimGame }) {
  if (!g.players) return null;
  const byTeam = (team: string) => g.players!.batters.filter((b) => b.team === team);
  const teams = [...new Set(g.players.batters.map((b) => b.team))];
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[11px] m-0" style={{ color: "var(--vault-text-faint)" }}>
        Average per-game stat line across the 10,000 simulated games (same games that produced the score above). Batting order is a documented fallback — real lineups are not posted pregame.
      </p>
      {teams.map((team) => (
        <section key={team}>
          <div className="font-mono uppercase tracking-[0.1em] mb-1.5" style={{ color: "var(--vault-gold)", fontSize: 10 }}>{team}</div>
          <div className="overflow-x-auto">
            <table className="w-full" style={{ borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr style={{ color: "var(--vault-text-faint)" }}>
                  {["Batter", "PA", "H", "TB", "HR", "R", "RBI", "BB", "K"].map((h, i) => (
                    <th key={h} className="font-mono uppercase" style={{ fontSize: 8.5, textAlign: i === 0 ? "left" : "right", padding: "3px 6px" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {byTeam(team).map((b) => (
                  <tr key={`${b.playerId}-${b.battingOrder}`} style={{ borderTop: "1px solid var(--vault-rule)", color: "var(--vault-text-mute)" }}>
                    <td style={{ padding: "3px 6px", color: "var(--vault-text)" }}>
                      <span className="inline-flex items-center gap-1.5">
                        <span style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>{b.battingOrder}.</span>
                        {b.playerId > 0 ? <PlayerAvatar playerId={b.playerId} playerName={b.name} team={b.team} sport="mlb" size="xs" flat /> : null}
                        <span>{b.name}</span>
                      </span>
                    </td>
                    {[b.plateAppearances, b.hits, b.totalBases, b.homeRuns, b.runs, b.rbi, b.walks, b.strikeouts].map((v, i) => (
                      <td key={i} className="font-mono" style={{ textAlign: "right", padding: "3px 6px" }}>{one(v)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      {g.players.pitchers.length ? (
        <section>
          <div className="font-mono uppercase tracking-[0.1em] mb-1.5" style={{ color: "var(--vault-gold)", fontSize: 10 }}>Starting pitchers (simulated)</div>
          <div className="overflow-x-auto">
            <table className="w-full" style={{ borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr style={{ color: "var(--vault-text-faint)" }}>
                  {["Pitcher", "BF", "K", "H", "R", "Outs"].map((h, i) => (
                    <th key={h} className="font-mono uppercase" style={{ fontSize: 8.5, textAlign: i === 0 ? "left" : "right", padding: "3px 6px" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {g.players.pitchers.map((p) => (
                  <tr key={p.playerId} style={{ borderTop: "1px solid var(--vault-rule)", color: "var(--vault-text-mute)" }}>
                    <td style={{ padding: "3px 6px", color: "var(--vault-text)" }}>{p.name} ({p.team})</td>
                    {[p.battersFaced, p.strikeouts, p.hitsAllowed, p.runsAllowed, p.outsRecorded].map((v, i) => (
                      <td key={i} className="font-mono" style={{ textAlign: "right", padding: "3px 6px" }}>{one(v)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="font-mono m-0 mt-1.5" style={{ fontSize: 9, color: "var(--vault-text-faint)" }}>Relief innings are simulated as a league-average team bullpen aggregate — no fabricated reliever identities.</p>
        </section>
      ) : null}
    </div>
  );
}

function Methodology({ g, meta }: { g: FullGameSimGame; meta: FullGameArtifactMeta | null }) {
  return (
    <div className="flex flex-col gap-3 text-[12px]" style={{ color: "var(--vault-text-mute)", lineHeight: 1.6 }}>
      <p className="m-0">
        <strong style={{ color: "var(--vault-text)" }}>How it works.</strong> Each of the {g.runCount.toLocaleString()} runs simulates a complete game — every plate appearance from the first pitch to the final out — advancing base/out state and scoring runs. Win probability, the score and total distributions, and the run line are all read off those {g.runCount.toLocaleString()} simulated final scores.
      </p>
      <p className="m-0">
        <strong style={{ color: "var(--vault-text)" }}>Inputs (all pregame, leakage-safe).</strong> Plate-appearance rates are derived from the public board&apos;s per-player projections: a batter&apos;s expected hits and total bases set the hit rate and extra-base split; the starting pitcher&apos;s strikeout projection sets the strikeout rate; walks use a league prior. Nothing is read from the sportsbook market or from any post-first-pitch source.
      </p>
      <p className="m-0">
        <strong style={{ color: "var(--vault-warn, #ea580c)" }}>Honest limitations.</strong> Batting order is a documented fallback (lineups are not posted pregame); batter strikeout and walk rates use league priors; park, weather, and handedness effects are not modeled (they do not exist pregame on the public surface). This is a transparent, internally-consistent simulation — it has <strong>not</strong> been validated to out-predict the market, and no such claim is made.
      </p>
      {g.completeness.notes.length ? (
        <div className="rounded-[10px] px-3 py-2" style={{ border: "1px solid var(--vault-rule)" }}>
          <span className="font-mono uppercase tracking-[0.1em] block mb-1" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>Input completeness for this game</span>
          {g.completeness.notes.map((n, i) => (
            <p key={i} className="m-0 text-[11px]" style={{ color: "var(--vault-text-mute)" }}>• {n}</p>
          ))}
        </div>
      ) : null}
      <p className="font-mono m-0" style={{ fontSize: 9.5, color: "var(--vault-text-faint)" }}>
        Model {meta?.modelVersion ?? g.status} · {g.runCount.toLocaleString()} complete games · deterministic (same board → same result){meta?.generatedAt ? ` · generated ${formatEtTime(meta.generatedAt)}` : ""}. Paper-only, educational — not betting advice.
      </p>
    </div>
  );
}

export default function MlbFullGameReport({
  fullGame,
  meta,
  prediction,
  deepDive,
  awayCode,
  homeCode,
}: {
  fullGame: FullGameSimGame;
  meta: FullGameArtifactMeta | null;
  prediction: GamePredictionDecision | null;
  deepDive: ReactNode;
  awayCode: string;
  homeCode: string;
}) {
  const [tab, setTab] = useState<TabKey>("overview");
  const tablistId = useId();
  const g = fullGame;
  const available = g.status !== "unavailable" && !!g.winProbability;

  const tabs: { key: TabKey; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "box", label: "Box Score" },
    { key: "players", label: "Players & Props" },
    { key: "methodology", label: "Methodology" },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Header strip: status + run count + completeness */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Chip tone="ok">{g.runCount ? `${g.runCount.toLocaleString()} game simulations` : "Full-game sim"}</Chip>
          {g.status === "degraded" ? <Chip tone="warn">Degraded inputs</Chip> : g.status === "ready" ? <Chip tone="ok">Complete inputs</Chip> : <Chip tone="warn">Unavailable</Chip>}
        </div>
        {meta?.generatedAt ? (
          <span className="font-mono" style={{ fontSize: 9.5, color: "var(--vault-text-faint)" }}>Simulated {formatEtTime(meta.generatedAt)} ET · pregame</span>
        ) : null}
      </div>

      {/* Tab bar */}
      <div role="tablist" aria-label="Game report sections" id={tablistId} className="flex gap-1 flex-wrap" style={{ borderBottom: "1px solid var(--vault-border)" }}>
        {tabs.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={active}
              type="button"
              onClick={() => setTab(t.key)}
              className="font-mono uppercase tracking-[0.08em] px-3 py-2"
              style={{
                fontSize: 10,
                color: active ? "var(--vault-gold)" : "var(--vault-text-mute)",
                borderBottom: `2px solid ${active ? "var(--vault-gold)" : "transparent"}`,
                background: "transparent",
                cursor: "pointer",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Panels */}
      <div role="tabpanel">
        {tab === "overview" && (available ? <Overview g={g} prediction={prediction} awayCode={awayCode} homeCode={homeCode} /> : <UnavailableNote g={g} />)}
        {tab === "box" && (available ? <BoxScore g={g} /> : <UnavailableNote g={g} />)}
        {tab === "players" && <div>{deepDive}</div>}
        {tab === "methodology" && <Methodology g={g} meta={meta} />}
      </div>
    </div>
  );
}

function UnavailableNote({ g }: { g: FullGameSimGame }) {
  return (
    <div className="rounded-[12px] px-4 py-4" style={{ border: "1px solid rgba(234,88,12,0.35)", background: "rgba(234,88,12,0.06)" }}>
      <span className="font-mono uppercase tracking-[0.12em] block mb-1" style={{ color: "var(--vault-warn, #ea580c)", fontSize: 9.5 }}>Full-game simulation not available</span>
      <p className="text-[12px] m-0" style={{ color: "var(--vault-text-mute)" }}>{g.gameStory[0] ?? "Not enough pregame data to simulate this game."} The player-prop board is still available under Players &amp; Props.</p>
    </div>
  );
}
