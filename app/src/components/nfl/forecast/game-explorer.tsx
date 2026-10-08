"use client";
/**
 * SIMULATED GAME EXPLORER — five real games from this run (the artifact's sampledWorlds, picked at the 10th–90th
 * percentile of the margin), shown exactly as generated: final score, scoring plays, both offenses, every named
 * player's line and who scored. Nothing here is generated in the browser; the buttons only choose which recorded game
 * to show. A touchdown scorer in one game is what happened in that game, not a touchdown probability.
 */
import { useState } from "react";

import PlayerAvatar from "@/components/player-avatar";
import TeamLogo from "@/components/team-logo";

const espnId = (id: string) => { const m = /^nfl-athlete-(\d+)$/.exec(id); return m ? Number(m[1]) : null; };
const LABEL: Record<string, string> = { "0.1": "Away-side outlier", "0.3": "Leaning away", "0.5": "Middle of the pack", "0.7": "Leaning home", "0.9": "Home-side outlier" };

export default function GameExplorer({ worlds, away, home, runs }: { worlds: any[]; away: string; home: string; runs: number }) {
  const [i, setI] = useState(Math.floor(worlds.length / 2));
  const w = worlds[i];
  if (!w) return null;
  const sides: Array<[string, any]> = [[away, w.away], [home, w.home]];
  return (
    <div className="nf-card" style={{ marginTop: 12 }}>
      <div className="nf-tabs" role="tablist" aria-label="Choose a simulated game">
        {worlds.map((x, k) => (
          <button key={x.worldIndex} type="button" role="tab" aria-selected={k === i} className="nf-tab" onClick={() => setI(k)}>
            {away} {x.away.points}–{x.home.points} {home}{x.overtime ? " OT" : ""}
          </button>
        ))}
      </div>
      <div role="tabpanel" aria-live="polite" style={{ marginTop: 10 }}>
        <p className="nf-eyebrow">Game #{(w.worldIndex + 1).toLocaleString("en-US")} of {runs.toLocaleString("en-US")} · {LABEL[String(w.marginQuantile)] ?? "Sampled game"}</p>
        <p className="nf-num" style={{ margin: "6px 0 0", fontSize: 26, fontWeight: 800, color: "var(--vault-text)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <TeamLogo team={away} sport="nfl" size="sm" ariaLabel={`${away} logo`} /> {away} {w.away.points}
          <span style={{ color: "var(--vault-text-faint)" }}>–</span>
          {w.home.points} {home} <TeamLogo team={home} sport="nfl" size="sm" ariaLabel={`${home} logo`} />
          <span className="nf-chip">{w.winner === "TIE" ? "Tie after overtime" : `${w.winner} win${w.overtime ? " in overtime" : ""}`}</span>
        </p>
        {sides.map(([t, s]) => (
          <div key={t} style={{ marginTop: 14 }}>
            <p className="nf-sub" style={{ marginTop: 0 }}>
              <strong style={{ color: "var(--vault-text)" }}>{t} {s.points}</strong>{w.overtime ? ` (${s.regulationPoints} in regulation)` : ""}: {s.scoring.offensiveTd + s.scoring.nonOffensiveTd} TD
              {s.scoring.nonOffensiveTd ? ` (${s.scoring.nonOffensiveTd} by defense or special teams)` : ""}, {s.scoring.fieldGoals} FG, {s.scoring.extraPoints} XP
              {s.scoring.twoPointConversions ? `, ${s.scoring.twoPointConversions} two-point` : ""}{s.scoring.safeties ? `, ${s.scoring.safeties} safety` : ""} · {s.volume.completions}/{s.volume.passAttempts} passing for {s.volume.passingYards} yds · {s.volume.carries} carries for {s.volume.rushingYards} yds
            </p>
            <div className="nf-scroll" role="region" aria-label={`${t} box score`} tabIndex={0}>
              <table className="nf-table" style={{ marginTop: 4 }}>
                <thead><tr><th scope="col">Player</th><th scope="col">Passing</th><th scope="col">Rushing</th><th scope="col">Receiving</th><th scope="col">TD</th></tr></thead>
                <tbody>
                  {s.players.map((p: any) => {
                    const l = p.line;
                    const td = [l.passingTd ? `${l.passingTd} pass` : "", l.rushingTd ? `${l.rushingTd} rush` : "", l.receivingTd ? `${l.receivingTd} rec` : ""].filter(Boolean).join(", ");
                    return (
                      <tr key={p.playerId}>
                        <td style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 150 }}>
                          <PlayerAvatar sport="nfl" playerId={espnId(p.playerId)} playerName={p.name} size="xs" flat />
                          <span>{p.name} <span className="nf-faint">{p.position ?? ""}</span></span>
                        </td>
                        <td className="nf-num">{l.passAttempts ? `${l.completions}/${l.passAttempts}, ${l.passingYards}` : ""}</td>
                        <td className="nf-num">{l.carries ? `${l.carries}-${l.rushingYards}` : ""}</td>
                        <td className="nf-num">{l.targets ? `${l.receptions}-${l.receivingYards}` : ""}</td>
                        <td className="nf-num">{td}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
        <p className="nf-faint" style={{ margin: "10px 0 0" }}>A real game from this run, shown as generated. Plays by players outside the named group count in the team line only. Who scored in one game is not a touchdown probability.</p>
      </div>
    </div>
  );
}
