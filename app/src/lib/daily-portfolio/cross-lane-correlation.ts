/**
 * Cross-lane correlation engine — a formal checker that a leg on one Bank Builder lane never influences
 * the other lane. For the two lanes to advance independently they must share NO game, player, or team
 * (and, most weakly, a market on the SAME game). This computes a correlation score (0 = fully
 * independent, 1 = heavily correlated), the specific overlaps, and human-readable warnings.
 *
 * Pure + deterministic (no I/O) so it is trivially testable and usable on either the server or in tests.
 */

export interface LaneLegLite {
  matchup: string;          // "Home vs Away"
  market: string;           // market label
  selection: string;        // pick text
  player?: string | null;   // player name for prop legs, else null
}

export interface CrossLaneCorrelation {
  score: number;            // 0..1 — 0 is fully independent
  independent: boolean;     // no shared game, player, or team
  overlaps: { sameGame: string[]; samePlayer: string[]; sameTeam: string[]; sameMarketSameGame: string[] };
  warnings: string[];
  summary: string;
}

const norm = (s: string | null | undefined): string => (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, "").trim();
const splitTeams = (matchup: string): string[] => matchup.split(/\s+vs\s+/i).map((t) => norm(t)).filter(Boolean);

/** Teams a lane has ANY exposure to (both sides of every game it touches). */
function teamsOf(legs: LaneLegLite[]): Set<string> {
  const out = new Set<string>();
  for (const l of legs) for (const t of splitTeams(l.matchup)) out.add(t);
  return out;
}
function gamesOf(legs: LaneLegLite[]): Set<string> {
  const out = new Set<string>();
  for (const l of legs) { const k = splitTeams(l.matchup).sort().join(" v "); if (k) out.add(k); }
  return out;
}
function playersOf(legs: LaneLegLite[]): Set<string> {
  const out = new Set<string>();
  for (const l of legs) if (l.player) out.add(norm(l.player));
  return out;
}

/**
 * Score the correlation between two lanes. Weights: a shared GAME is the strongest signal (both lanes'
 * outcomes hinge on one match), then a shared PLAYER, then a shared TEAM; a shared market on the SAME
 * game is reported but carries no extra weight beyond the shared-game term. Score is clamped to [0,1].
 */
export function scoreCrossLaneCorrelation(laneA: LaneLegLite[], laneB: LaneLegLite[]): CrossLaneCorrelation {
  const gamesA = gamesOf(laneA), gamesB = gamesOf(laneB);
  const teamsA = teamsOf(laneA), teamsB = teamsOf(laneB);
  const playersA = playersOf(laneA), playersB = playersOf(laneB);

  const sameGame = [...gamesA].filter((g) => gamesB.has(g));
  const samePlayer = [...playersA].filter((p) => playersB.has(p));
  const sameTeam = [...teamsA].filter((t) => teamsB.has(t));

  const sameMarketSameGame: string[] = [];
  for (const a of laneA) for (const b of laneB) {
    if (splitTeams(a.matchup).sort().join(" v ") === splitTeams(b.matchup).sort().join(" v ") && norm(a.market) === norm(b.market) && a.matchup) {
      sameMarketSameGame.push(`${a.matchup} · ${a.market}`);
    }
  }

  const score = Math.min(1, sameGame.length * 0.5 + samePlayer.length * 0.4 + sameTeam.length * 0.25);
  const independent = sameGame.length === 0 && samePlayer.length === 0 && sameTeam.length === 0;

  const warnings: string[] = [];
  if (sameGame.length) warnings.push(`Both lanes have exposure to the same game(s): ${sameGame.join(", ")} — outcomes are correlated.`);
  if (samePlayer.length) warnings.push(`Both lanes use the same player(s): ${samePlayer.join(", ")}.`);
  if (sameTeam.length) warnings.push(`Both lanes touch the same team(s): ${sameTeam.join(", ")}.`);

  const summary = independent
    ? "Independent — no shared game, player, or team across the two lanes. They can advance on their own."
    : `Correlated — ${warnings.length} overlap${warnings.length === 1 ? "" : "s"} detected across the lanes.`;

  return { score: Number(score.toFixed(2)), independent, overlaps: { sameGame, samePlayer, sameTeam, sameMarketSameGame }, warnings, summary };
}
