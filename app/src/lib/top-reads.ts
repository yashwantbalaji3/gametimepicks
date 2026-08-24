/**
 * THE MODEL'S STRONGEST READS TODAY — every sport, team markets and player markets, one list.
 *
 * WHAT THIS IS NOT. It is not a pick list, and the distinction is not decoration. /picks was retired
 * to a redirect; the sanctioned framing on the MLB report is "Largest model-vs-market gaps · a
 * watchlist, not a bet"; and the prediction layer's own rule is PREDICTION ≠ EDGE. A ranked "top ten
 * bets of the day" would reverse all three, and would do it while three of the four models cannot
 * support it: MLB's markets were demoted to market context, NFL's team-strength term is not
 * statistically significant, and EPL's model has never been scored against a price. Only UFC's has
 * cleared a preregistered bar.
 *
 * WHAT IT IS. The outputs each model is most confident about, ranked by the MODEL'S OWN probability —
 * never by a gap against a price. A gap is a claim that the market is wrong, and we have not
 * established that for any sport. A probability is just what the simulator says.
 *
 * EVERY READ CARRIES ITS SPORT'S PROVEN STATE. "60% confident" means something different from a
 * model that cleared its bar than from one that has never been measured, and a list that ranked them
 * together without saying so would quietly average away the difference.
 *
 * A SPORT WITH NO EVENT-SPECIFIC SIGNAL IS EXCLUDED AND SAID SO. NFL produces a projected score for
 * every game and the same one for almost all of them; ranking those by confidence would fill the
 * list with reads that cannot tell one game from another.
 */
import fs from "node:fs";
import path from "node:path";

export interface TopRead {
  sport: "mlb" | "epl" | "ufc";
  sportLabel: string;
  /** "team" or "player" — the user-facing split between game markets and player markets. */
  kind: "team" | "player";
  /** What the model says, in one line. */
  headline: string;
  /** Who or what it is about, for the identity chip. */
  subject: string;
  team: string | null;
  photoUrl: string | null;
  /** The model's own probability. Never a gap, never an edge. */
  probability: number;
  market: string;
  context: string;
  href: string | null;
}

export interface TopReadsSet {
  generatedAt: string;
  reads: TopRead[];
  /** Sports deliberately absent, each with the reason. Never a silent omission. */
  excluded: Array<{ sport: string; reason: string }>;
  /** What each contributing model has actually proven. Rendered beside the list, not buried. */
  provenance: Array<{ sport: string; state: string }>;
}

import { loadEplGradedRecord } from "./sports/epl/graded-record";

const read = (p: string) => { try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), p), "utf8")); } catch { return null; } };
const etToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

/*
 * What each model has actually established. Written here rather than per-read so the four sentences
 * stay together and cannot drift into four different degrees of confidence.
 */
const PROVENANCE: Record<string, string> = {
  mlb: "Its modelled markets were measured against the sportsbook and demoted to market context — the simulation is published, not claimed to beat a price.",
  epl: "Never scored against a no-vig line.",
  ufc: "The one model here that cleared its preregistered bar, on a 3,557-fight held-out sample. It has still never been compared against a price.",
};

/*
 * A COUNT IN A SENTENCE IS DERIVED, NEVER TYPED.
 *
 * This read "Two matches have been graded in total" — true the day it was written, and false by the
 * fifth. The /epl hub carried the identical defect in its own track-record line and now derives it,
 * so the two surfaces disagreed ON THE SAME PAGE: a "5 matches graded" headline sat a few sections
 * above this sentence saying two.
 *
 * Derived from the same ledger the hub reads, so it cannot understate a growing record either. It
 * still refuses to quote a hit rate or an accuracy figure at any sample size, because a rate over a
 * handful of matches is noise with a percent sign on it — the SIZE of the record is the only thing
 * a count is allowed to say here. An unreadable ledger yields no clause at all rather than a zero,
 * since "we could not read it" and "nothing has been graded" are different facts.
 */
function eplGradedClause(): string {
  const rec = loadEplGradedRecord();
  const n = rec?.team.matches;
  if (n == null) return "";
  if (n === 0) return " No match has been graded yet.";
  return ` ${n} ${n === 1 ? "match has" : "matches have"} been graded in total — far too few to support any accuracy claim.`;
}

export function loadTopReads(): TopReadsSet | null {
  const today = etToday();
  const reads: TopRead[] = [];
  const excluded: Array<{ sport: string; reason: string }> = [];

  /* ── MLB: game markets, from the deterministic prediction layer ─────────────────────────────── */
  const mlb = read(`public/data/mlb/predictions/${today}.json`);
  for (const p of mlb?.predictions ?? []) {
    const ml = p.moneyline;
    if (ml?.simulationProbability != null && p.slug) {
      reads.push({
        sport: "mlb", sportLabel: "MLB", kind: "team",
        headline: `${ml.team} to win`,
        subject: ml.team, team: ml.team, photoUrl: null,
        probability: ml.simulationProbability,
        market: "Moneyline",
        context: `${p.awayTeam} @ ${p.homeTeam} · simulated median ${p.projectedScore?.away ?? "?"}–${p.projectedScore?.home ?? "?"}`,
        href: `/games/mlb/${p.slug}/`,
      });
    }
    const tot = p.total;
    if (tot?.overProbability != null && p.slug) {
      const over = tot.pick === "OVER";
      reads.push({
        sport: "mlb", sportLabel: "MLB", kind: "team",
        headline: `${over ? "Over" : "Under"} ${tot.line} runs`,
        subject: `${p.awayTeam} @ ${p.homeTeam}`, team: p.homeTeam, photoUrl: null,
        probability: over ? tot.overProbability : tot.underProbability,
        market: "Game total",
        context: `simulated median ${tot.simulationMedian} runs`,
        href: `/games/mlb/${p.slug}/`,
      });
    }
  }

  /*
   * ── MLB player markets: the home-run board ─────────────────────────────────────────────────
   *
   * The simulated batters carry EXPECTED VALUES — 1.258 hits, 0.15 home runs — not probabilities,
   * and turning an expectation into "chance of at least one" needs a distributional assumption this
   * module has no business inventing. Homer Nukes already computes a real P(home run) per batter
   * from season rate and the opposing starter, so that is the player read MLB contributes.
   */
  const hr = read(`public/data/mlb/homer-nukes/${today}.json`);
  for (const p of hr?.picks ?? []) {
    if (p?.probability == null || !p.player) continue;
    reads.push({
      sport: "mlb", sportLabel: "MLB", kind: "player",
      headline: `${p.player} to homer`,
      subject: p.player, team: p.teamAbbr ?? null, photoUrl: null,
      probability: p.probability,
      market: "Anytime home run",
      context: `${p.matchup ?? ""}${p.opposingPitcher ? ` · off ${p.opposingPitcher}` : ""}`,
      href: "/homer-nukes/",
    });
  }

  /* ── EPL: match result, and the player market the model actually publishes ──────────────────── */
  const eplF = read("public/data/soccer/epl/forecasts/latest.json");
  for (const r of eplF?.rows ?? []) {
    if (r.state !== "CURRENT_PRE_EVENT" || !r.probs) continue;
    const best = [["home", r.probs.home, r.homeClub], ["draw", r.probs.draw, null], ["away", r.probs.away, r.awayClub]]
      .sort((a, b) => (b[1] as number) - (a[1] as number))[0];
    reads.push({
      sport: "epl", sportLabel: "Premier League", kind: "team",
      headline: best[0] === "draw" ? "Draw" : `${best[2]} to win`,
      subject: (best[2] as string) ?? r.matchup, team: (best[2] as string) ?? null, photoUrl: null,
      probability: best[1] as number,
      market: "Match result",
      context: `${r.matchup} · ${r.expectedGoals != null ? `${r.expectedGoals.toFixed(2)} expected goals` : "model distribution"}`,
      href: r.slug ? `/epl/match/${r.slug}/` : null,
    });
  }
  const eplP = read("public/data/soccer/epl/player-projections/latest.json");
  for (const f of eplP?.fixtures ?? []) {
    for (const pl of f.players ?? []) {
      if (pl.probability == null) continue;
      reads.push({
        sport: "epl", sportLabel: "Premier League", kind: "player",
        headline: `${pl.name} to score`,
        subject: pl.name, team: pl.teamName ?? null, photoUrl: null,
        probability: pl.probability,
        market: "Anytime goalscorer",
        context: `${f.matchup}${pl.conditional ? " · conditional on starting" : ""}`,
        href: f.slug ? `/epl/match/${f.slug}/` : null,
      });
    }
  }

  /* ── UFC: the bout winner, from the one model that cleared its bar ──────────────────────────── */
  const ufc = read("public/data/ufc/card-latest.json");
  for (const b of ufc?.bouts ?? []) {
    const w = b.prediction?.winner;
    if (!w?.probability) continue;
    const side = b.red?.name === w.name ? b.red : b.blue;
    const opp = b.red?.name === w.name ? b.blue?.name : b.red?.name;
    reads.push({
      sport: "ufc", sportLabel: "UFC", kind: "player",
      headline: `${w.name} to beat ${opp ?? "opponent"}`,
      subject: w.name, team: null, photoUrl: side?.photoUrl ?? null,
      probability: w.probability,
      market: "Fight winner",
      context: `${b.weightClass ?? "bout"}${b.prediction?.method?.most ? ` · model reads ${b.prediction.method.most}` : ""}`,
      href: "/ufc/",
    });
  }

  /*
   * NFL is absent on purpose. Its differentiation audit reports NO_EVENT_SPECIFIC_SIGNAL and ten of
   * eleven games carry the identical projected score, so ranking those by confidence would fill the
   * list with reads that cannot tell one game from another.
   */
  const nfl = read("public/data/nfl/index.json");
  if ((nfl?.events ?? []).length > 0) {
    excluded.push({
      sport: "NFL",
      reason: "the model does not currently tell these teams apart — its team-strength term was measured and found not to be statistically significant, so it produces near-identical reads for every game.",
    });
  }

  if (reads.length === 0) return null;
  reads.sort((a, b) => b.probability - a.probability || a.subject.localeCompare(b.subject));
  return {
    generatedAt: new Date().toISOString(),
    reads,
    excluded,
    provenance: [...new Set(reads.map((r) => r.sport))]
      .map((s) => ({ sport: s, state: (PROVENANCE[s] ?? "") + (s === "epl" ? eplGradedClause() : "") })),
  };
}

/** The strongest N overall. */
export const topOverall = (set: TopReadsSet | null, n = 10) => (set?.reads ?? []).slice(0, n);

/**
 * One sport's top reads, from the SAME ranked set — never a clone or a hand-kept slice (P201 · C).
 * The caller renders the honest count: fewer than n means fewer existed, and zero means the sport's
 * own no-play/exclusion line speaks instead.
 */
export const topBySport = (set: TopReadsSet | null, sport: TopRead["sport"], n = 10) =>
  (set?.reads ?? []).filter((r) => r.sport === sport).slice(0, n);

/** The sports present in the ranked set, in the set's own order of first appearance. */
export const sportsInSet = (set: TopReadsSet | null): TopRead["sport"][] =>
  [...new Set((set?.reads ?? []).map((r) => r.sport))];

/** The strongest N for one sport, keeping both team and player markets represented. */
export function topForSport(set: TopReadsSet | null, sport: string, n = 5): TopRead[] {
  const all = (set?.reads ?? []).filter((r) => r.sport === sport);
  /*
   * Interleave the two kinds rather than taking the top N outright. Player probabilities and team
   * probabilities are not on the same scale — a favourite to win a match sits far above any single
   * goalscorer — so a plain sort would make every sport's list all-team, and the player markets the
   * model publishes would never appear.
   */
  const team = all.filter((r) => r.kind === "team");
  const player = all.filter((r) => r.kind === "player");
  const out: TopRead[] = [];
  for (let i = 0; out.length < n && (i < team.length || i < player.length); i += 1) {
    if (i < team.length && out.length < n) out.push(team[i]);
    if (i < player.length && out.length < n) out.push(player[i]);
  }
  return out;
}
