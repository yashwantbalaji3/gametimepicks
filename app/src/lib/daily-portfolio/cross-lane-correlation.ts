/**
 * Cross-lane correlation engine (V2) — a formal checker that a leg on one Bank Builder lane never
 * influences the other lane. It scores OUTCOME correlation (shared game / player / team) and, on a
 * shared game, the DIRECTION of dependence (do the two legs move together or against each other). It
 * also grades portfolio DIVERSIFICATION (are both lanes leaning the same game-script — e.g. all
 * low-scoring?), which is a style concentration rather than an outcome dependency.
 *
 * Outputs a 0..1 outcome-correlation `score`, an A–F portfolio `grade` (independence downgraded one
 * notch for heavy style concentration), the specific overlaps, dependency findings, and warnings.
 * Pure + deterministic (no I/O) so it is trivially testable. Bank Builder targets Grade A by default.
 */

export interface LaneLegLite {
  matchup: string;          // "Home vs Away"
  market: string;           // market label
  selection: string;        // pick text
  player?: string | null;   // player name for prop legs, else null
}

export type CorrelationGrade = "A" | "B" | "C" | "D" | "F";

export interface CrossLaneCorrelation {
  score: number;            // 0..1 OUTCOME correlation (0 = fully independent)
  grade: CorrelationGrade;  // portfolio grade (independence + diversification)
  independent: boolean;     // no shared game, player, or team
  overlaps: { sameGame: string[]; samePlayer: string[]; sameTeam: string[]; sameMarketSameGame: string[] };
  dependencies: string[];   // same-game outcome-direction findings (together / against)
  diversification: { lowScoringLeans: number; highScoringLeans: number; styleConcentrated: boolean; notes: string[] };
  warnings: string[];
  summary: string;
}

const norm = (s: string | null | undefined): string => (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, "").trim();
const splitTeams = (matchup: string): string[] => matchup.split(/\s+vs\s+/i).map((t) => norm(t)).filter(Boolean);
const gameKey = (matchup: string): string => splitTeams(matchup).sort().join(" v ");

function teamsOf(legs: LaneLegLite[]): Set<string> {
  const out = new Set<string>();
  for (const l of legs) for (const t of splitTeams(l.matchup)) out.add(t);
  return out;
}
function gamesOf(legs: LaneLegLite[]): Set<string> {
  const out = new Set<string>();
  for (const l of legs) { const k = gameKey(l.matchup); if (k) out.add(k); }
  return out;
}
function playersOf(legs: LaneLegLite[]): Set<string> {
  const out = new Set<string>();
  for (const l of legs) if (l.player) out.add(norm(l.player));
  return out;
}

/** Classify a leg's game-script lean: "low" (defensive/under), "high" (attacking/over/scorer), else "neutral". */
function leanOf(leg: LaneLegLite): "low" | "high" | "neutral" {
  const s = `${norm(leg.market)} ${norm(leg.selection)}`;
  if (/\bunder\b|both teams to score no|btts no|no\b.*both teams|clean sheet|draw no bet/.test(s)) return "low";
  if (/\bover\b|both teams to score yes|btts yes|anytime|goalscorer|to score|to score or assist|assist|shot/.test(s)) return "high";
  return "neutral";
}

const GRADES: CorrelationGrade[] = ["A", "B", "C", "D", "F"];
function gradeIndexFromScore(score: number): number {
  if (score <= 0) return 0;      // A
  if (score <= 0.15) return 1;   // B
  if (score <= 0.35) return 2;   // C
  if (score <= 0.55) return 3;   // D
  return 4;                      // F
}

/**
 * Score the correlation between two lanes. Weights: a shared GAME is the strongest signal, then a
 * shared PLAYER, then a shared TEAM; a shared market on the SAME game is reported separately. Style
 * concentration (both lanes leaning the same game-script) downgrades the grade one notch but does NOT
 * raise the outcome `score`, since outcomes in different games are statistically independent.
 */
export function scoreCrossLaneCorrelation(laneA: LaneLegLite[], laneB: LaneLegLite[]): CrossLaneCorrelation {
  const gamesA = gamesOf(laneA), gamesB = gamesOf(laneB);
  const teamsA = teamsOf(laneA), teamsB = teamsOf(laneB);
  const playersA = playersOf(laneA), playersB = playersOf(laneB);

  const sameGame = [...gamesA].filter((g) => gamesB.has(g));
  const samePlayer = [...playersA].filter((p) => playersB.has(p));
  const sameTeam = [...teamsA].filter((t) => teamsB.has(t));

  const sameMarketSameGame: string[] = [];
  const depSet = new Set<string>();
  for (const a of laneA) for (const b of laneB) {
    if (a.matchup && gameKey(a.matchup) === gameKey(b.matchup)) {
      if (norm(a.market) === norm(b.market)) sameMarketSameGame.push(`${a.matchup} · ${a.market}`);
      // Any two legs on the same game are outcome-linked; classify direction when both are directional.
      const la = leanOf(a), lb = leanOf(b);
      if (la !== "neutral" && lb !== "neutral") {
        depSet.add(la === lb
          ? `Same game (${a.matchup}): both lanes lean ${la}-scoring — outcomes move together.`
          : `Same game (${a.matchup}): lanes lean opposite ways (${la} vs ${lb}) — outcomes move against each other.`);
      } else {
        depSet.add(`Same game (${a.matchup}): both lanes have exposure to one fixture — outcomes are linked.`);
      }
    }
  }
  const dependencies = [...depSet];

  // Diversification — game-script concentration across both lanes (independent games, but a style tilt).
  const allLegs = [...laneA, ...laneB];
  const lowScoringLeans = allLegs.filter((l) => leanOf(l) === "low").length;
  const highScoringLeans = allLegs.filter((l) => leanOf(l) === "high").length;
  const styleConcentrated = (lowScoringLeans >= 3 && highScoringLeans === 0) || (highScoringLeans >= 3 && lowScoringLeans === 0);
  const divNotes: string[] = [];
  if (styleConcentrated) {
    divNotes.push(`Both lanes lean ${lowScoringLeans >= highScoringLeans ? "low" : "high"}-scoring (${Math.max(lowScoringLeans, highScoringLeans)} legs) — outcomes are still independent, but the portfolio is style-concentrated.`);
  }

  const score = Number(Math.min(1, sameGame.length * 0.5 + samePlayer.length * 0.4 + sameTeam.length * 0.25).toFixed(2));
  const independent = sameGame.length === 0 && samePlayer.length === 0 && sameTeam.length === 0;

  let gIdx = gradeIndexFromScore(score);
  if (styleConcentrated) gIdx = Math.max(gIdx, 1); // never better than B when heavily style-concentrated
  const grade = GRADES[Math.min(4, gIdx)];

  const warnings: string[] = [];
  if (sameGame.length) warnings.push(`Both lanes have exposure to the same game(s): ${sameGame.join(", ")} — outcomes are correlated.`);
  if (samePlayer.length) warnings.push(`Both lanes use the same player(s): ${samePlayer.join(", ")}.`);
  if (sameTeam.length) warnings.push(`Both lanes touch the same team(s): ${sameTeam.join(", ")}.`);

  const summary = independent
    ? styleConcentrated
      ? `Outcome-independent (no shared game, player or team), but style-concentrated — Grade ${grade}.`
      : `Independent — no shared game, player, or team across the two lanes. Grade ${grade}.`
    : `Correlated — ${warnings.length} overlap${warnings.length === 1 ? "" : "s"} detected. Grade ${grade}.`;

  return { score, grade, independent, overlaps: { sameGame, samePlayer, sameTeam, sameMarketSameGame }, dependencies, diversification: { lowScoringLeans, highScoringLeans, styleConcentrated, notes: divNotes }, warnings, summary };
}
