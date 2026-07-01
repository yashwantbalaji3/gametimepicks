/**
 * Unified GAME-SCRIPT engine — the SINGLE source of truth for a fixture's coherent model read:
 * model-implied score lean + total-goals lean + BTTS lean + one plain-English explanation that ties
 * them together, a confidence, and an explicit conflict warning when the markets disagree.
 *
 * Every product surface (knockout board, game-detail page, World Cup hub, Today) renders THIS so the
 * score / total / BTTS story is identical everywhere and never contradicts itself. Derived ONLY from the
 * board's real de-vigged market picks (3-way moneyline probabilities, the totals line + over/under lean,
 * and the BTTS pick) — never fabricated. When a market is missing (e.g. no totals feed) we fall back to a
 * directional, lower-confidence read rather than inventing a scoreline or leaving the score blank.
 */
import { deriveScoreLean, knockoutRisk, loadRoundOf32Board, type RoundOf32Game, type RoundOf32Picks, type KnockoutRisk } from "./round-of-32";

export type GameScriptConfidence = "High" | "Medium" | "Low";

export interface GameScript {
  /** false only when there is no live moneyline at all (nothing to read). */
  available: boolean;
  /** "England 3–0 DR Congo" · "1–1 draw lean" · "USA clean-sheet lean · 1–0 / 2–0". null only when unavailable. */
  scoreLean: string | null;
  homeGoals: number | null;
  awayGoals: number | null;
  /** The 90' winner read: a team name, or "Draw" when the draw is the most likely outcome. */
  winner: string | null;
  /** "Over 2.5" · "Under 2.5" · null when the totals market isn't offered by the current feed. */
  totalLean: string | null;
  /** true when the totals market is genuinely absent (drives the "not offered" copy, never a fake line). */
  totalOffered: boolean;
  /** "BTTS No" · "BTTS Yes" · null when not offered. */
  bttsLean: string | null;
  confidence: GameScriptConfidence;
  /** One sentence tying score + total + BTTS together, analyst voice. */
  explanation: string;
  /** Non-null when the derived scoreline can't fully satisfy every market pick — surfaced, never hidden. */
  conflictWarning: string | null;
  knockoutRisk: { label: KnockoutRisk; reason: string } | null;
}

type ScriptInput = Pick<RoundOf32Game, "home" | "away" | "picks">;

const pct = (p: number | undefined | null) => Math.round((p ?? 0) * 100);

/**
 * Derive the one coherent game script for a fixture from its board picks. Reuses `deriveScoreLean` for the
 * scoreline when a totals market exists; when it doesn't, it still produces a DIRECTIONAL scoreline lean
 * (favourite + BTTS) at lower confidence rather than returning null — so the score read is visible on every
 * game, everywhere.
 */
export function deriveGameScript(g: ScriptInput): GameScript {
  const picks = g.picks;
  const ml = picks?.moneyline;
  if (!ml) {
    return {
      available: false, scoreLean: null, homeGoals: null, awayGoals: null, winner: null,
      totalLean: null, totalOffered: false, bttsLean: null, confidence: "Low",
      explanation: "No live moneyline is posted for this fixture yet — model game script unavailable.",
      conflictWarning: null, knockoutRisk: null,
    };
  }

  const favHome = ml.side === "home";
  const favProb = favHome ? ml.home : ml.away;
  const favTeam = ml.pick;
  const drawLean = (ml.draw >= ml.home && ml.draw >= ml.away) || favProb < 0.45;
  const totalPick = picks?.total?.pick ?? null;
  const totalOffered = !!picks?.total && typeof picks.total.line === "number";
  const bttsPick = picks?.btts?.pick ?? null;
  const bttsNo = /no/i.test(bttsPick ?? "");
  const bttsYes = /yes/i.test(bttsPick ?? "");
  const under = /under/i.test(totalPick ?? "");
  const over = /over/i.test(totalPick ?? "");
  const kRisk = knockoutRisk(g as RoundOf32Game);

  // ── Scoreline ──────────────────────────────────────────────────────────────────────────────────
  let homeGoals: number | null;
  let awayGoals: number | null;
  let scoreLean: string | null;
  let confidence: GameScriptConfidence;
  let winner: string | null;

  if (totalOffered) {
    // Rich case — reuse the validated score-lean derivation (totals-sized scoreline).
    const s = deriveScoreLean(g as RoundOf32Game);
    homeGoals = s.homeGoals;
    awayGoals = s.awayGoals;
    scoreLean = s.scoreLean;
    confidence = s.confidence;
    winner = drawLean ? "Draw" : favTeam;
  } else if (drawLean) {
    // No total + draw-leaning → a low, even scoreline (1–1 if both teams score, else 0–0).
    const each = bttsYes ? 1 : 0;
    homeGoals = each; awayGoals = each;
    scoreLean = `${each}–${each} draw lean`;
    winner = "Draw";
    confidence = "Low";
  } else {
    // No total + a clear favourite → a directional clean-sheet / narrow-win lean, sized from ML + BTTS.
    const loser = bttsNo ? 0 : 1;
    const winnerGoals = favProb >= 0.6 ? (bttsNo ? 2 : 2) : 1; // strong fav ⇒ 2, slight fav ⇒ 1
    homeGoals = favHome ? winnerGoals : loser;
    awayGoals = favHome ? loser : winnerGoals;
    // Show a RANGE, not a fake exact line, since there's no totals market to size it.
    const lo = favProb >= 0.6 ? 1 : 1;
    scoreLean = bttsNo
      ? `${favTeam} clean-sheet lean · ${favHome ? `${lo}–0 / 2–0` : `0–${lo} / 0–2`}`
      : `${favTeam} narrow-win lean · ${favHome ? "2–1" : "1–2"}`;
    winner = favTeam;
    confidence = favProb >= 0.65 ? "Medium" : "Low";
  }

  // ── Conflict detection — the derived scoreline must satisfy every posted market pick ─────────────
  const warnings: string[] = [];
  if (homeGoals != null && awayGoals != null) {
    const totalGoals = homeGoals + awayGoals;
    const bothScored = homeGoals > 0 && awayGoals > 0;
    if (bttsNo && bothScored) warnings.push("BTTS No vs a both-teams-score scoreline");
    if (bttsYes && !bothScored) warnings.push("BTTS Yes vs a clean-sheet scoreline");
    if (totalOffered && typeof picks?.total?.line === "number") {
      const line = picks.total.line;
      if (over && totalGoals < line) warnings.push(`Over ${line} vs a ${totalGoals}-goal scoreline`);
      if (under && totalGoals > line) warnings.push(`Under ${line} vs a ${totalGoals}-goal scoreline`);
    }
  }
  const conflictWarning = warnings.length
    ? `Markets don't fully agree (${warnings.join("; ")}) — treat the exact scoreline as a lean, not a lock.`
    : null;
  // A real conflict caps confidence at Low.
  if (conflictWarning && confidence === "High") confidence = "Medium";
  if (conflictWarning) confidence = confidence === "Medium" ? "Low" : confidence;

  // ── Total + BTTS leans ───────────────────────────────────────────────────────────────────────
  const totalLean = totalOffered ? totalPick : null;
  const bttsLean = bttsPick;

  // ── One plain-English explanation tying score + total + BTTS together ───────────────────────────
  const bits: string[] = [];
  if (drawLean) bits.push(`level at 90' is live (${pct(ml.draw)}% draw)`);
  else bits.push(`${favTeam} to win in 90' (${pct(favProb)}%)`);
  if (totalLean) bits.push(under ? `${totalLean} goals` : over ? `${totalLean} goals` : totalLean);
  else bits.push("no totals market offered yet");
  if (bttsLean) bits.push(bttsNo ? "one side kept off the scoresheet (BTTS No)" : "both teams to score (BTTS Yes)");
  const explanation = scoreLean
    ? `Model score lean: ${scoreLean}. This aligns with ${bits.join(" + ")}.`
    : `Directional read: ${bits.join(" + ")}.`;

  return {
    available: true, scoreLean, homeGoals, awayGoals, winner,
    totalLean, totalOffered, bttsLean, confidence, explanation, conflictWarning,
    knockoutRisk: kRisk,
  };
}

/** Convenience: build a game script directly from a picks object + team names (for callers that hold picks). */
export function deriveGameScriptFromPicks(home: string, away: string, picks: RoundOf32Picks | null): GameScript {
  return deriveGameScript({ home, away, picks });
}

const normTeam = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Server-side: the SAME game script the board shows, resolved for a fixture by team names — so a game-detail
 * page (or the hub) renders identical score/total/BTTS reads as the board (single source). Returns null when
 * the board has no matching live game (caller shows an honest fallback, never a fabricated script).
 */
export function gameScriptForFixture(root: string, homeTeam: string, awayTeam: string): GameScript | null {
  const board = loadRoundOf32Board(root);
  if (!board) return null;
  const h = normTeam(homeTeam), a = normTeam(awayTeam);
  const g = board.games.find((x) => normTeam(x.home) === h && normTeam(x.away) === a);
  return g ? deriveGameScript(g) : null;
}
