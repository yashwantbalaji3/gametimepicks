/**
 * The game dashboard's hero: who plays, when, and what the forecast of record expects — the projected score as the
 * centrepiece, then win chance, margin and total with their 80% ranges. Every figure is the published forecast of
 * record (forecast-view.mjs `record`); the expected score is labelled as the middle of the outcomes, never as the
 * likeliest exact final, which is a separate figure from its own engine when shown.
 */
import TeamLogo from "@/components/team-logo";

import ModelStatus from "./model-status";

const pct = (p: number) => `${(p * 100).toFixed(1)}%`;
const signed = (x: number) => (x > 0 ? `+${x}` : `${x}`);

export interface HeroProps {
  away: { abbr: string; name: string };
  home: { abbr: string; name: string };
  kickoffLabel: string;
  venue: string | null;
  record: {
    favourite: string;
    winProbability: { home: number; away: number };
    projectedScore: { home: number; away: number };
    margin: { median: number; p10: number; p90: number };
    total: { median: number; p10: number; p90: number };
    generatedAt: string;
  };
  likeliest?: { away: number; home: number; probability: number } | null;
  started: boolean;
}

export default function GameHero({ away, home, kickoffLabel, venue, record: r, likeliest, started }: HeroProps) {
  const favIsHome = r.favourite === home.abbr;
  const favP = favIsHome ? r.winProbability.home : r.winProbability.away;
  const fav = favIsHome ? home : away;
  return (
    <section className="nf-card nf-hero" aria-labelledby="nf-hero-h" data-hero="record">
      <p className="nf-eyebrow">{kickoffLabel}{venue ? ` · ${venue}` : ""}</p>
      <h1 id="nf-hero-h" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
        {away.name} at {home.name}
      </h1>
      <div className="nf-hero-teams">
        <div className="nf-team">
          <TeamLogo team={away.abbr} sport="nfl" size="xl" highlight={!favIsHome} ariaLabel={`${away.name} logo`} />
          <b>{away.name}</b>
          <span>{pct(r.winProbability.away)} to win</span>
        </div>
        <div className="nf-score" aria-label={`Projected score ${away.abbr} ${r.projectedScore.away}, ${home.abbr} ${r.projectedScore.home}`}>
          <p className="nf-eyebrow">{started ? "Pregame projection" : "Projected score"}</p>
          <p style={{ margin: 0 }} className="nf-num">
            <span className="nf-big">{r.projectedScore.away}</span><span className="nf-big nf-dash">–</span><span className="nf-big">{r.projectedScore.home}</span>
          </p>
          <p className="nf-faint" style={{ margin: 0, textAlign: "center" }}>the middle of the outcomes, not a call on the exact final</p>
        </div>
        <div className="nf-team">
          <TeamLogo team={home.abbr} sport="nfl" size="xl" highlight={favIsHome} ariaLabel={`${home.name} logo`} />
          <b>{home.name}</b>
          <span>{pct(r.winProbability.home)} to win</span>
        </div>
      </div>
      <div>
        <div className="nf-split" role="img" aria-label={`Win chance: ${away.abbr} ${pct(r.winProbability.away)}, ${home.abbr} ${pct(r.winProbability.home)}`}>
          <div style={{ width: `${r.winProbability.away * 100}%`, background: favIsHome ? "color-mix(in srgb, var(--vault-text-faint) 70%, transparent)" : "var(--vault-gold-bright)" }} />
          <div style={{ flex: 1, background: favIsHome ? "var(--vault-gold-bright)" : "color-mix(in srgb, var(--vault-text-faint) 70%, transparent)" }} />
        </div>
        <p className="nf-sub" style={{ marginTop: 8 }}>
          <strong style={{ color: "var(--vault-text)" }}>{fav.name}</strong> {started ? "were" : "are"} the projected winner, {pct(favP)} to win.
        </p>
      </div>
      <div className="nf-stats">
        <div className="nf-stat"><p className="nf-k">Expected margin</p><p className="nf-v nf-num">{home.abbr} {signed(r.margin.median)}</p><p className="nf-s">8 in 10 outcomes between {signed(r.margin.p10)} and {signed(r.margin.p90)}</p></div>
        <div className="nf-stat"><p className="nf-k">Expected total</p><p className="nf-v nf-num">{r.total.median}</p><p className="nf-s">8 in 10 outcomes between {r.total.p10} and {r.total.p90}</p></div>
        {likeliest ? (
          <div className="nf-stat"><p className="nf-k">Likeliest exact final</p><p className="nf-v nf-num">{away.abbr} {likeliest.away}–{likeliest.home} {home.abbr}</p><p className="nf-s">{pct(likeliest.probability)} of outcomes — exact scores are rare</p></div>
        ) : null}
      </div>
      <ModelStatus />
    </section>
  );
}
